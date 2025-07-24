import express from 'express';
import { getDb } from '../config/database';
import { complianceService } from '../services/complianceService';
import { AuthenticatedRequest } from '../types';
import { logger } from '../utils/logger';
import { asyncHandler } from '../middleware/errorHandler';
import { requireAdmin } from '../middleware/auth';
import multer from 'multer';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// Get all frameworks
router.get('/', asyncHandler(async (req: AuthenticatedRequest, res) => {
  try {
    const frameworks = await complianceService.getFrameworks();
    
    res.json({
      success: true,
      data: frameworks
    });

  } catch (error) {
    logger.error('Error fetching frameworks:', error);
    res.status(500).json({ error: 'Failed to fetch frameworks' });
  }
}));

// Get specific framework
router.get('/:frameworkId', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { frameworkId } = req.params;

  try {
    const framework = await complianceService.getFrameworkById(frameworkId);
    
    if (!framework) {
      return res.status(404).json({ error: 'Framework not found' });
    }

    res.json({
      success: true,
      data: framework
    });

  } catch (error) {
    logger.error('Error fetching framework:', error);
    res.status(500).json({ error: 'Failed to fetch framework' });
  }
}));

// Create new framework
router.post('/', requireAdmin, upload.single('frameworkFile'), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const { name, version, description, category } = req.body;
  const userId = req.user!.id;

  try {
    const frameworkId = `framework_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Insert framework
    const frameworkQuery = `
      INSERT INTO compliance_frameworks (id, name, version, description, category, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *
    `;

    const frameworkResult = await db.query(frameworkQuery, [
      frameworkId,
      name,
      version,
      description,
      category
    ]);

    // If file uploaded, parse and create controls
    if (req.file) {
      // This would typically parse JSON/YAML file and create controls
      // For now, we'll create a placeholder implementation
      logger.info(`Framework file uploaded: ${req.file.filename}`);
    }

    // Log the creation
    const auditQuery = `
      INSERT INTO audit_logs (user_id, action, resource, resource_id, details, timestamp, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, $7)
    `;

    await db.query(auditQuery, [
      userId,
      'create_framework',
      'compliance_framework',
      frameworkId,
      JSON.stringify({ name, version, category }),
      req.ip,
      req.get('User-Agent')
    ]);

    res.status(201).json({
      success: true,
      data: frameworkResult.rows[0],
      message: 'Framework created successfully'
    });

  } catch (error) {
    logger.error('Error creating framework:', error);
    res.status(500).json({ error: 'Failed to create framework' });
  }
}));

// Update framework
router.put('/:frameworkId', requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const { frameworkId } = req.params;
  const { name, version, description, category, isActive } = req.body;
  const userId = req.user!.id;

  try {
    const query = `
      UPDATE compliance_frameworks 
      SET name = $1, version = $2, description = $3, category = $4, is_active = $5, updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *
    `;

    const result = await db.query(query, [
      name,
      version,
      description,
      category,
      isActive,
      frameworkId
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Framework not found' });
    }

    // Log the update
    const auditQuery = `
      INSERT INTO audit_logs (user_id, action, resource, resource_id, details, timestamp, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, $7)
    `;

    await db.query(auditQuery, [
      userId,
      'update_framework',
      'compliance_framework',
      frameworkId,
      JSON.stringify({ name, version, category, isActive }),
      req.ip,
      req.get('User-Agent')
    ]);

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Framework updated successfully'
    });

  } catch (error) {
    logger.error('Error updating framework:', error);
    res.status(500).json({ error: 'Failed to update framework' });
  }
}));

// Delete framework
router.delete('/:frameworkId', requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const { frameworkId } = req.params;
  const userId = req.user!.id;

  try {
    // Check if framework has assessments
    const assessmentQuery = 'SELECT COUNT(*) as count FROM compliance_assessments WHERE framework_id = $1';
    const assessmentResult = await db.query(assessmentQuery, [frameworkId]);
    
    if (parseInt(assessmentResult.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete framework with existing assessments. Deactivate instead.' 
      });
    }

    // Delete controls first (cascade)
    await db.query('DELETE FROM evidence WHERE control_id IN (SELECT id FROM controls WHERE framework_id = $1)', [frameworkId]);
    await db.query('DELETE FROM controls WHERE framework_id = $1', [frameworkId]);
    
    // Delete framework
    const result = await db.query('DELETE FROM compliance_frameworks WHERE id = $1 RETURNING *', [frameworkId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Framework not found' });
    }

    // Log the deletion
    const auditQuery = `
      INSERT INTO audit_logs (user_id, action, resource, resource_id, details, timestamp, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, $7)
    `;

    await db.query(auditQuery, [
      userId,
      'delete_framework',
      'compliance_framework',
      frameworkId,
      JSON.stringify({ name: result.rows[0].name }),
      req.ip,
      req.get('User-Agent')
    ]);

    res.json({
      success: true,
      message: 'Framework deleted successfully'
    });

  } catch (error) {
    logger.error('Error deleting framework:', error);
    res.status(500).json({ error: 'Failed to delete framework' });
  }
}));

// Get framework controls
router.get('/:frameworkId/controls', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const { frameworkId } = req.params;
  const { status, severity, category } = req.query;

  try {
    let query = `
      SELECT 
        c.*,
        (SELECT COUNT(*) FROM evidence e WHERE e.control_id = c.id AND e.is_valid = true) as evidence_count
      FROM controls c
      WHERE c.framework_id = $1
    `;
    
    const params: any[] = [frameworkId];
    let paramIndex = 2;

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

    query += ` ORDER BY 
      CASE c.severity 
        WHEN 'critical' THEN 1 
        WHEN 'high' THEN 2 
        WHEN 'medium' THEN 3 
        WHEN 'low' THEN 4 
      END,
      c.control_id
    `;

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: result.rows.map(row => ({
        id: row.id,
        frameworkId: row.framework_id,
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
      }))
    });

  } catch (error) {
    logger.error('Error fetching framework controls:', error);
    res.status(500).json({ error: 'Failed to fetch framework controls' });
  }
}));

// Add control to framework
router.post('/:frameworkId/controls', requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const { frameworkId } = req.params;
  const { 
    controlId, 
    name, 
    description, 
    category, 
    severity, 
    automatedRemediation = false,
    manualConfirmation = false,
    remediationSteps = []
  } = req.body;
  const userId = req.user!.id;

  try {
    const id = `control_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const query = `
      INSERT INTO controls (
        id, framework_id, control_id, name, description, category, severity,
        status, implementation_status, automated_remediation, manual_confirmation,
        remediation_steps, last_checked
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'not_configured', 'not_implemented', $8, $9, $10, CURRENT_TIMESTAMP)
      RETURNING *
    `;

    const result = await db.query(query, [
      id,
      frameworkId,
      controlId,
      name,
      description,
      category,
      severity,
      automatedRemediation,
      manualConfirmation,
      JSON.stringify(remediationSteps)
    ]);

    // Log the creation
    const auditQuery = `
      INSERT INTO audit_logs (user_id, action, resource, resource_id, details, timestamp, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, $7)
    `;

    await db.query(auditQuery, [
      userId,
      'create_control',
      'control',
      id,
      JSON.stringify({ frameworkId, controlId, name, category }),
      req.ip,
      req.get('User-Agent')
    ]);

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Control added successfully'
    });

  } catch (error) {
    logger.error('Error adding control:', error);
    res.status(500).json({ error: 'Failed to add control' });
  }
}));

// Get framework statistics
router.get('/:frameworkId/statistics', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const { frameworkId } = req.params;

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
        ROUND(
          CASE 
            WHEN COUNT(*) > 0 THEN 
              (COUNT(CASE WHEN status = 'passed' THEN 1 END)::float / COUNT(*)) * 100
            ELSE 0 
          END, 2
        ) as compliance_percentage
      FROM controls
      WHERE framework_id = $1
    `;

    const result = await db.query(query, [frameworkId]);
    const stats = result.rows[0];

    // Get recent assessments
    const assessmentQuery = `
      SELECT 
        id,
        overall_score,
        status,
        start_date,
        end_date
      FROM compliance_assessments
      WHERE framework_id = $1
      ORDER BY start_date DESC
      LIMIT 5
    `;

    const assessmentResult = await db.query(assessmentQuery, [frameworkId]);

    res.json({
      success: true,
      data: {
        controls: {
          total: parseInt(stats.total_controls) || 0,
          passed: parseInt(stats.passed_controls) || 0,
          failed: parseInt(stats.failed_controls) || 0,
          notConfigured: parseInt(stats.not_configured_controls) || 0,
          manualReview: parseInt(stats.manual_review_controls) || 0,
          critical: parseInt(stats.critical_controls) || 0,
          high: parseInt(stats.high_controls) || 0,
          medium: parseInt(stats.medium_controls) || 0,
          low: parseInt(stats.low_controls) || 0
        },
        compliancePercentage: parseFloat(stats.compliance_percentage) || 0,
        recentAssessments: assessmentResult.rows
      }
    });

  } catch (error) {
    logger.error('Error fetching framework statistics:', error);
    res.status(500).json({ error: 'Failed to fetch framework statistics' });
  }
}));

export default router;