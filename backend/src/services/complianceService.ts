import { getDb } from '../config/database';
import { microsoftGraphService } from './microsoftGraphService';
import { 
  ComplianceFramework, 
  Control, 
  ControlStatus, 
  ControlSeverity,
  ImplementationStatus,
  Evidence,
  EvidenceType,
  ComplianceAssessment,
  AssessmentStatus
} from '../types';
import { logger } from '../utils/logger';
import { cacheService } from '../config/redis';

class ComplianceService {
  async getFrameworks(): Promise<ComplianceFramework[]> {
    const db = getDb();
    
    try {
      const cacheKey = 'compliance_frameworks';
      const cached = await cacheService.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached);
      }

      const query = `
        SELECT f.*, 
               COUNT(c.id) as control_count,
               COUNT(CASE WHEN c.status = 'passed' THEN 1 END) as passed_count
        FROM compliance_frameworks f
        LEFT JOIN controls c ON f.id = c.framework_id
        WHERE f.is_active = true
        GROUP BY f.id
        ORDER BY f.name
      `;
      
      const result = await db.query(query);
      const frameworks = result.rows.map(row => this.mapDbFrameworkToFramework(row));
      
      // Cache for 1 hour
      await cacheService.set(cacheKey, JSON.stringify(frameworks), 3600);
      
      return frameworks;
    } catch (error) {
      logger.error('Error getting frameworks:', error);
      throw error;
    }
  }

  async getFrameworkById(id: string): Promise<ComplianceFramework | null> {
    const db = getDb();
    
    try {
      const query = `
        SELECT f.*, 
               json_agg(
                 json_build_object(
                   'id', c.id,
                   'controlId', c.control_id,
                   'name', c.name,
                   'description', c.description,
                   'category', c.category,
                   'severity', c.severity,
                   'status', c.status,
                   'implementationStatus', c.implementation_status,
                   'lastChecked', c.last_checked,
                   'automatedRemediation', c.automated_remediation,
                   'manualConfirmation', c.manual_confirmation
                 )
               ) as controls
        FROM compliance_frameworks f
        LEFT JOIN controls c ON f.id = c.framework_id
        WHERE f.id = $1
        GROUP BY f.id
      `;
      
      const result = await db.query(query, [id]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return this.mapDbFrameworkToFramework(result.rows[0]);
    } catch (error) {
      logger.error('Error getting framework by ID:', error);
      throw error;
    }
  }

  async runComplianceCheck(frameworkId: string, userId: string): Promise<ComplianceAssessment> {
    const db = getDb();
    
    try {
      // Create assessment record
      const assessmentId = `assessment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const insertQuery = `
        INSERT INTO compliance_assessments (id, framework_id, user_id, start_date, status)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4)
        RETURNING *
      `;
      
      await db.query(insertQuery, [assessmentId, frameworkId, userId, AssessmentStatus.IN_PROGRESS]);
      
      // Get framework controls
      const framework = await this.getFrameworkById(frameworkId);
      if (!framework) {
        throw new Error('Framework not found');
      }

      const results = [];
      let passedCount = 0;
      let failedCount = 0;
      let notConfiguredCount = 0;

      // Check each control
      for (const control of framework.controls) {
        try {
          const checkResult = await this.checkControl(control);
          results.push(checkResult);
          
          switch (checkResult.status) {
            case ControlStatus.PASSED:
              passedCount++;
              break;
            case ControlStatus.FAILED:
              failedCount++;
              break;
            case ControlStatus.NOT_CONFIGURED:
              notConfiguredCount++;
              break;
          }

          // Update control status in database
          await this.updateControlStatus(control.id, checkResult.status, checkResult.evidence);
        } catch (error) {
          logger.error(`Error checking control ${control.id}:`, error);
          failedCount++;
        }
      }

      const totalControls = framework.controls.length;
      const overallScore = totalControls > 0 ? (passedCount / totalControls) * 100 : 0;

      // Update assessment with results
      const updateQuery = `
        UPDATE compliance_assessments 
        SET end_date = CURRENT_TIMESTAMP,
            status = $1,
            overall_score = $2,
            total_controls = $3,
            passed_controls = $4,
            failed_controls = $5,
            not_configured_controls = $6,
            results = $7
        WHERE id = $8
        RETURNING *
      `;
      
      const assessmentResult = await db.query(updateQuery, [
        AssessmentStatus.COMPLETED,
        overallScore,
        totalControls,
        passedCount,
        failedCount,
        notConfiguredCount,
        JSON.stringify(results),
        assessmentId
      ]);

      return this.mapDbAssessmentToAssessment(assessmentResult.rows[0]);
    } catch (error) {
      logger.error('Error running compliance check:', error);
      
      // Update assessment as failed
      await db.query(
        'UPDATE compliance_assessments SET status = $1, end_date = CURRENT_TIMESTAMP WHERE id = $2',
        [AssessmentStatus.FAILED, assessmentId]
      );
      
      throw error;
    }
  }

  private async checkControl(control: Control): Promise<any> {
    const findings: string[] = [];
    const recommendations: string[] = [];
    const evidence: Evidence[] = [];
    let status = ControlStatus.NOT_CONFIGURED;
    let score = 0;

    try {
      // Check based on control category and requirements
      switch (control.category.toLowerCase()) {
        case 'conditional_access':
          const caResult = await this.checkConditionalAccessControl(control);
          status = caResult.status;
          score = caResult.score;
          findings.push(...caResult.findings);
          recommendations.push(...caResult.recommendations);
          evidence.push(...caResult.evidence);
          break;

        case 'mfa':
          const mfaResult = await this.checkMfaControl(control);
          status = mfaResult.status;
          score = mfaResult.score;
          findings.push(...mfaResult.findings);
          recommendations.push(...mfaResult.recommendations);
          evidence.push(...mfaResult.evidence);
          break;

        case 'password_policy':
          const passwordResult = await this.checkPasswordPolicyControl(control);
          status = passwordResult.status;
          score = passwordResult.score;
          findings.push(...passwordResult.findings);
          recommendations.push(...passwordResult.recommendations);
          evidence.push(...passwordResult.evidence);
          break;

        case 'privileged_access':
          const privilegedResult = await this.checkPrivilegedAccessControl(control);
          status = privilegedResult.status;
          score = privilegedResult.score;
          findings.push(...privilegedResult.findings);
          recommendations.push(...privilegedResult.recommendations);
          evidence.push(...privilegedResult.evidence);
          break;

        default:
          // Generic check
          status = ControlStatus.MANUAL_REVIEW;
          findings.push('Manual review required for this control');
          score = 0;
      }
    } catch (error) {
      logger.error(`Error checking control ${control.id}:`, error);
      status = ControlStatus.FAILED;
      findings.push(`Error during automated check: ${error.message}`);
      score = 0;
    }

    return {
      controlId: control.id,
      status,
      score,
      findings,
      recommendations,
      evidence
    };
  }

  private async checkConditionalAccessControl(control: Control): Promise<any> {
    const policies = await microsoftGraphService.getConditionalAccessPolicies();
    const findings: string[] = [];
    const recommendations: string[] = [];
    const evidence: Evidence[] = [];
    
    let status = ControlStatus.NOT_CONFIGURED;
    let score = 0;

    // Add evidence
    evidence.push({
      id: `evidence_${Date.now()}`,
      controlId: control.id,
      type: EvidenceType.CONFIGURATION,
      source: 'Microsoft Graph API',
      data: policies,
      timestamp: new Date(),
      isValid: true
    });

    // Check if any CA policies exist
    if (policies.length === 0) {
      findings.push('No Conditional Access policies found');
      recommendations.push('Configure Conditional Access policies to meet compliance requirements');
      status = ControlStatus.FAILED;
      score = 0;
    } else {
      // Check for specific requirements based on control ID
      const enabledPolicies = policies.filter(p => p.state === 'enabled');
      
      if (enabledPolicies.length > 0) {
        findings.push(`Found ${enabledPolicies.length} enabled Conditional Access policies`);
        status = ControlStatus.PASSED;
        score = 100;
      } else {
        findings.push('Conditional Access policies exist but none are enabled');
        recommendations.push('Enable appropriate Conditional Access policies');
        status = ControlStatus.FAILED;
        score = 50;
      }
    }

    return { status, score, findings, recommendations, evidence };
  }

  private async checkMfaControl(control: Control): Promise<any> {
    const mfaSettings = await microsoftGraphService.getMfaSettings();
    const findings: string[] = [];
    const recommendations: string[] = [];
    const evidence: Evidence[] = [];
    
    let status = ControlStatus.NOT_CONFIGURED;
    let score = 0;

    evidence.push({
      id: `evidence_${Date.now()}`,
      controlId: control.id,
      type: EvidenceType.CONFIGURATION,
      source: 'Microsoft Graph API',
      data: mfaSettings,
      timestamp: new Date(),
      isValid: true
    });

    // Check MFA configuration
    const mfaEnabled = mfaSettings.some(setting => 
      setting['@odata.type'] === '#microsoft.graph.microsoftAuthenticatorAuthenticationMethodConfiguration' &&
      setting.state === 'enabled'
    );

    if (mfaEnabled) {
      findings.push('MFA is enabled for the tenant');
      status = ControlStatus.PASSED;
      score = 100;
    } else {
      findings.push('MFA is not properly configured');
      recommendations.push('Enable and configure MFA for all users');
      status = ControlStatus.FAILED;
      score = 0;
    }

    return { status, score, findings, recommendations, evidence };
  }

  private async checkPasswordPolicyControl(control: Control): Promise<any> {
    const passwordPolicies = await microsoftGraphService.getPasswordPolicies();
    const findings: string[] = [];
    const recommendations: string[] = [];
    const evidence: Evidence[] = [];
    
    let status = ControlStatus.NOT_CONFIGURED;
    let score = 0;

    evidence.push({
      id: `evidence_${Date.now()}`,
      controlId: control.id,
      type: EvidenceType.POLICY,
      source: 'Microsoft Graph API',
      data: passwordPolicies,
      timestamp: new Date(),
      isValid: true
    });

    // Check password policy settings
    if (passwordPolicies) {
      findings.push('Password policy is configured');
      status = ControlStatus.PASSED;
      score = 100;
    } else {
      findings.push('Password policy not found or not configured');
      recommendations.push('Configure appropriate password policies');
      status = ControlStatus.FAILED;
      score = 0;
    }

    return { status, score, findings, recommendations, evidence };
  }

  private async checkPrivilegedAccessControl(control: Control): Promise<any> {
    const privilegedRoles = await microsoftGraphService.getPrivilegedRoles();
    const findings: string[] = [];
    const recommendations: string[] = [];
    const evidence: Evidence[] = [];
    
    let status = ControlStatus.NOT_CONFIGURED;
    let score = 0;

    evidence.push({
      id: `evidence_${Date.now()}`,
      controlId: control.id,
      type: EvidenceType.CONFIGURATION,
      source: 'Microsoft Graph API',
      data: privilegedRoles,
      timestamp: new Date(),
      isValid: true
    });

    // Check privileged roles configuration
    if (privilegedRoles.length > 0) {
      findings.push(`Found ${privilegedRoles.length} privileged roles`);
      status = ControlStatus.MANUAL_REVIEW;
      score = 50;
      recommendations.push('Review privileged role assignments and ensure proper governance');
    } else {
      findings.push('No privileged roles found');
      status = ControlStatus.PASSED;
      score = 100;
    }

    return { status, score, findings, recommendations, evidence };
  }

  private async updateControlStatus(controlId: string, status: ControlStatus, evidence: Evidence[]): Promise<void> {
    const db = getDb();
    
    try {
      const query = `
        UPDATE controls 
        SET status = $1, last_checked = CURRENT_TIMESTAMP
        WHERE id = $2
      `;
      
      await db.query(query, [status, controlId]);

      // Store evidence
      for (const evidenceItem of evidence) {
        const evidenceQuery = `
          INSERT INTO evidence (id, control_id, type, source, data, timestamp, is_valid)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO UPDATE SET
            data = EXCLUDED.data,
            timestamp = EXCLUDED.timestamp,
            is_valid = EXCLUDED.is_valid
        `;
        
        await db.query(evidenceQuery, [
          evidenceItem.id,
          controlId,
          evidenceItem.type,
          evidenceItem.source,
          JSON.stringify(evidenceItem.data),
          evidenceItem.timestamp,
          evidenceItem.isValid
        ]);
      }
    } catch (error) {
      logger.error('Error updating control status:', error);
      throw error;
    }
  }

  private mapDbFrameworkToFramework(dbFramework: any): ComplianceFramework {
    return {
      id: dbFramework.id,
      name: dbFramework.name,
      version: dbFramework.version,
      description: dbFramework.description,
      category: dbFramework.category,
      isActive: dbFramework.is_active,
      controls: dbFramework.controls || [],
      createdAt: dbFramework.created_at,
      updatedAt: dbFramework.updated_at
    };
  }

  private mapDbAssessmentToAssessment(dbAssessment: any): ComplianceAssessment {
    return {
      id: dbAssessment.id,
      frameworkId: dbAssessment.framework_id,
      userId: dbAssessment.user_id,
      startDate: dbAssessment.start_date,
      endDate: dbAssessment.end_date,
      status: dbAssessment.status,
      overallScore: dbAssessment.overall_score,
      totalControls: dbAssessment.total_controls,
      passedControls: dbAssessment.passed_controls,
      failedControls: dbAssessment.failed_controls,
      notConfiguredControls: dbAssessment.not_configured_controls,
      results: JSON.parse(dbAssessment.results || '[]')
    };
  }
}

export const complianceService = new ComplianceService();