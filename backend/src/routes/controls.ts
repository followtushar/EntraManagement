import express from 'express';
import { getDb } from '../config/database';
import { AuthenticatedRequest, ControlStatus } from '../types';
import { logger } from '../utils/logger';
import { asyncHandler } from '../middleware/errorHandler';
import { requireComplianceOfficer } from '../middleware/auth';

const router = express.Router();

// Get all controls with filtering
router.get('/', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const { 
    frameworkId, 
    status, 
    severity, 
    category,
    search,
    limit = 50, 
    offset = 0 
  } = req.query;

  try {
    let query = `
      SELECT 
        c.*,
        f.name as framework_name,
        f.version as framework_version,
        (
          SELECT COUNT(*) FROM evidence e 
          WHERE e.control_id = c.id AND e.is_valid = true
        ) as evidence_count
      FROM controls c
      JOIN compliance_frameworks f ON c.framework_id = f.id
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramIndex = 1;

    if (frameworkId) {
      query += ` AND c.framework_id = $${paramIndex++}`;
      params.push(frameworkId);
    }

    if (status) {
      query += ` AND c.status = $${paramIndex++}`;
      params.push(status);
    }

    if (severity) {
      query += ` AND c.severity = $${paramIndex++}`;
      params.push(severity);
    }

    if (category) {
      query += ` AND c.category = $${paramIndex++}`;
      params.push(category);
    }

    if (search) {
      query += ` AND (c.name ILIKE $${paramIndex++} OR c.description ILIKE $${paramIndex} OR c.control_id ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY 
      CASE c.severity 
        WHEN 'critical' THEN 1 
        WHEN 'high' THEN 2 
        WHEN 'medium' THEN 3 
        WHEN 'low' THEN 4 
      END,
      c.status,
      c.name
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    
    params.push(parseInt(limit as string), parseInt(offset as string));

    const result = await db.query(query, params);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total
      FROM controls c
      JOIN compliance_frameworks f ON c.framework_id = f.id
      WHERE 1=1
    `;
    
    const countParams: any[] = [];
    let countParamIndex = 1;

    if (frameworkId) {
      countQuery += ` AND c.framework_id = $${countParamIndex++}`;
      countParams.push(frameworkId);
    }

    if (status) {
      countQuery += ` AND c.status = $${countParamIndex++}`;
      countParams.push(status);
    }

    if (severity) {
      countQuery += ` AND c.severity = $${countParamIndex++}`;
      countParams.push(severity);
    }

    if (category) {
      countQuery += ` AND c.category = $${countParamIndex++}`;
      countParams.push(category);
    }

    if (search) {
      countQuery += ` AND (c.name ILIKE $${countParamIndex++} OR c.description ILIKE $${countParamIndex} OR c.control_id ILIKE $${countParamIndex})`;
      countParams.push(`%${search}%`);
      countParamIndex++;
    }

    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      success: true,
      data: result.rows.map(row => ({
        id: row.id,
        frameworkId: row.framework_id,
        frameworkName: row.framework_name,
        frameworkVersion: row.framework_version,
        controlId: row.control_id,
        name: row.name,
        description: row.description,
        category: row.category,
        severity: row.severity,
        status: row.status,
        implementationStatus: row.implementation_status,
        lastChecked: row.last_checked,
        automatedRemediation: row.automated_remediation,
        manualConfirmation: row.manual_confirmation,
        evidenceCount: parseInt(row.evidence_count) || 0
      })),
      pagination: {
        page: Math.floor(parseInt(offset as string) / parseInt(limit as string)) + 1,
        limit: parseInt(limit as string),
        total,
        totalPages: Math.ceil(total / parseInt(limit as string))
      }
    });

  } catch (error) {
    logger.error('Error fetching controls:', error);
    res.status(500).json({ error: 'Failed to fetch controls' });
  }
}));

// Get specific control details
router.get('/:controlId', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const { controlId } = req.params;

  try {
    const query = `
      SELECT 
        c.*,
        f.name as framework_name,
        f.version as framework_version,
        f.description as framework_description
      FROM controls c
      JOIN compliance_frameworks f ON c.framework_id = f.id
      WHERE c.id = $1
    `;

    const result = await db.query(query, [controlId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Control not found' });
    }

    const control = result.rows[0];

    // Get evidence for this control
    const evidenceQuery = `
      SELECT * FROM evidence 
      WHERE control_id = $1 
      ORDER BY timestamp DESC
    `;

    const evidenceResult = await db.query(evidenceQuery, [controlId]);

    // Get remediation steps if any
    const remediationQuery = `
      SELECT remediation_steps FROM controls 
      WHERE id = $1 AND remediation_steps IS NOT NULL
    `;

    const remediationResult = await db.query(remediationQuery, [controlId]);

    res.json({
      success: true,
      data: {
        id: control.id,
        frameworkId: control.framework_id,
        frameworkName: control.framework_name,
        frameworkVersion: control.framework_version,
        frameworkDescription: control.framework_description,
        controlId: control.control_id,
        name: control.name,
        description: control.description,
        category: control.category,
        severity: control.severity,
        status: control.status,
        implementationStatus: control.implementation_status,
        lastChecked: control.last_checked,
        automatedRemediation: control.automated_remediation,
        manualConfirmation: control.manual_confirmation,
        evidence: evidenceResult.rows.map(row => ({
          id: row.id,
          type: row.type,
          source: row.source,
          data: JSON.parse(row.data || '{}'),
          timestamp: row.timestamp,
          isValid: row.is_valid
        })),
        remediationSteps: remediationResult.rows[0]?.remediation_steps ? 
          JSON.parse(remediationResult.rows[0].remediation_steps) : []
      }
    });

  } catch (error) {
    logger.error('Error fetching control details:', error);
    res.status(500).json({ error: 'Failed to fetch control details' });
  }
}));

// Update control status manually
router.patch('/:controlId/status', requireComplianceOfficer, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const { controlId } = req.params;
  const { status, reason, evidence } = req.body;
  const userId = req.user!.id;

  try {
    // Validate status
    if (!Object.values(ControlStatus).includes(status)) {
      return res.status(400).json({ error: 'Invalid control status' });
    }

    // Update control status
    const updateQuery = `
      UPDATE controls 
      SET status = $1, last_checked = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;

    const result = await db.query(updateQuery, [status, controlId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Control not found' });
    }

    // Add manual evidence if provided
    if (evidence) {
      const evidenceQuery = `
        INSERT INTO evidence (id, control_id, type, source, data, timestamp, is_valid)
        VALUES ($1, $2, 'manual', $3, $4, CURRENT_TIMESTAMP, true)
      `;

      const evidenceId = `evidence_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await db.query(evidenceQuery, [
        evidenceId,
        controlId,
        `Manual update by ${req.user!.name}`,
        JSON.stringify({
          status,
          reason,
          evidence,
          updatedBy: req.user!.name,
          updatedAt: new Date().toISOString()
        })
      ]);
    }

    // Log the status change
    const auditQuery = `
      INSERT INTO audit_logs (user_id, action, resource, resource_id, details, timestamp, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, $7)
    `;

    await db.query(auditQuery, [
      userId,
      'update_control_status',
      'control',
      controlId,
      JSON.stringify({ 
        oldStatus: result.rows[0].status,
        newStatus: status,
        reason 
      }),
      req.ip,
      req.get('User-Agent')
    ]);

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Control status updated successfully'
    });

  } catch (error) {
    logger.error('Error updating control status:', error);
    res.status(500).json({ error: 'Failed to update control status' });
  }
}));

// Add evidence to control
router.post('/:controlId/evidence', requireComplianceOfficer, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const { controlId } = req.params;
  const { type, source, data, description } = req.body;
  const userId = req.user!.id;

  try {
    const evidenceId = `evidence_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const query = `
      INSERT INTO evidence (id, control_id, type, source, data, timestamp, is_valid)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, true)
      RETURNING *
    `;

    const evidenceData = {
      description,
      data,
      uploadedBy: req.user!.name,
      uploadedAt: new Date().toISOString()
    };

    const result = await db.query(query, [
      evidenceId,
      controlId,
      type,
      source || `Manual upload by ${req.user!.name}`,
      JSON.stringify(evidenceData)
    ]);

    // Log the evidence addition
    const auditQuery = `
      INSERT INTO audit_logs (user_id, action, resource, resource_id, details, timestamp, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, $7)
    `;

    await db.query(auditQuery, [
      userId,
      'add_evidence',
      'control',
      controlId,
      JSON.stringify({ evidenceId, type, description }),
      req.ip,
      req.get('User-Agent')
    ]);

    res.json({
      success: true,
      data: {
        id: result.rows[0].id,
        controlId: result.rows[0].control_id,
        type: result.rows[0].type,
        source: result.rows[0].source,
        data: JSON.parse(result.rows[0].data),
        timestamp: result.rows[0].timestamp,
        isValid: result.rows[0].is_valid
      },
      message: 'Evidence added successfully'
    });

  } catch (error) {
    logger.error('Error adding evidence:', error);
    res.status(500).json({ error: 'Failed to add evidence' });
  }
}));

// Get control categories
router.get('/meta/categories', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const db = getDb();

  try {
    const query = `
      SELECT 
        category,
        COUNT(*) as control_count,
        COUNT(CASE WHEN status = 'passed' THEN 1 END) as passed_count,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count
      FROM controls c
      JOIN compliance_frameworks f ON c.framework_id = f.id
      WHERE f.is_active = true
      GROUP BY category
      ORDER BY category
    `;

    const result = await db.query(query);

    res.json({
      success: true,
      data: result.rows.map(row => ({
        category: row.category,
        controlCount: parseInt(row.control_count),
        passedCount: parseInt(row.passed_count),
        failedCount: parseInt(row.failed_count),
        compliancePercentage: row.control_count > 0 ? 
          Math.round((row.passed_count / row.control_count) * 100) : 0
      }))
    });

  } catch (error) {
    logger.error('Error fetching control categories:', error);
    res.status(500).json({ error: 'Failed to fetch control categories' });
  }
}));

// Get control statistics
router.get('/meta/statistics', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const db = getDb();

  try {
    const query = `
      SELECT 
        COUNT(*) as total_controls,
        COUNT(CASE WHEN status = 'passed' THEN 1 END) as passed_controls,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_controls,
        COUNT(CASE WHEN status = 'not_configured' THEN 1 END) as not_configured_controls,
        COUNT(CASE WHEN status = 'manual_review' THEN 1 END) as manual_review_controls,
        COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical_controls,
        COUNT(CASE WHEN severity = 'high' THEN 1 END) as high_controls,
        COUNT(CASE WHEN severity = 'medium' THEN 1 END) as medium_controls,
        COUNT(CASE WHEN severity = 'low' THEN 1 END) as low_controls,
        COUNT(CASE WHEN automated_remediation = true THEN 1 END) as automated_controls,
        COUNT(CASE WHEN manual_confirmation = true THEN 1 END) as manual_confirmation_controls
      FROM controls c
      JOIN compliance_frameworks f ON c.framework_id = f.id
      WHERE f.is_active = true
    `;

    const result = await db.query(query);
    const stats = result.rows[0];

    res.json({
      success: true,
      data: {
        total: parseInt(stats.total_controls) || 0,
        byStatus: {
          passed: parseInt(stats.passed_controls) || 0,
          failed: parseInt(stats.failed_controls) || 0,
          notConfigured: parseInt(stats.not_configured_controls) || 0,
          manualReview: parseInt(stats.manual_review_controls) || 0
        },
        bySeverity: {
          critical: parseInt(stats.critical_controls) || 0,
          high: parseInt(stats.high_controls) || 0,
          medium: parseInt(stats.medium_controls) || 0,
          low: parseInt(stats.low_controls) || 0
        },
        automatedControls: parseInt(stats.automated_controls) || 0,
        manualConfirmationControls: parseInt(stats.manual_confirmation_controls) || 0
      }
    });

  } catch (error) {
    logger.error('Error fetching control statistics:', error);
    res.status(500).json({ error: 'Failed to fetch control statistics' });
  }
}));

export default router;