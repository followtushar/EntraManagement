import express from 'express';
import { getDb } from '../config/database';
import { complianceService } from '../services/complianceService';
import { AuthenticatedRequest } from '../types';
import { logger } from '../utils/logger';
import { asyncHandler } from '../middleware/errorHandler';
import { requireComplianceOfficer } from '../middleware/auth';

const router = express.Router();

// Run compliance assessment
router.post('/assess/:frameworkId', requireComplianceOfficer, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { frameworkId } = req.params;
  const userId = req.user!.id;

  try {
    logger.info(`Starting compliance assessment for framework ${frameworkId} by user ${userId}`);
    
    const assessment = await complianceService.runComplianceCheck(frameworkId, userId);
    
    res.json({
      success: true,
      data: assessment,
      message: 'Compliance assessment completed successfully'
    });

  } catch (error) {
    logger.error('Error running compliance assessment:', error);
    res.status(500).json({ 
      error: 'Failed to run compliance assessment',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

// Get assessment results
router.get('/assessments', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const { frameworkId, status, limit = 20, offset = 0 } = req.query;

  try {
    let query = `
      SELECT 
        ca.*,
        f.name as framework_name,
        u.name as user_name,
        u.email as user_email
      FROM compliance_assessments ca
      JOIN compliance_frameworks f ON ca.framework_id = f.id
      LEFT JOIN users u ON ca.user_id = u.id
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramIndex = 1;

    if (frameworkId) {
      query += ` AND ca.framework_id = $${paramIndex++}`;
      params.push(frameworkId);
    }

    if (status) {
      query += ` AND ca.status = $${paramIndex++}`;
      params.push(status);
    }

    query += ` ORDER BY ca.start_date DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const result = await db.query(query, params);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total
      FROM compliance_assessments ca
      WHERE 1=1
    `;
    
    const countParams: any[] = [];
    let countParamIndex = 1;

    if (frameworkId) {
      countQuery += ` AND ca.framework_id = $${countParamIndex++}`;
      countParams.push(frameworkId);
    }

    if (status) {
      countQuery += ` AND ca.status = $${countParamIndex++}`;
      countParams.push(status);
    }

    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      success: true,
      data: result.rows.map(row => ({
        id: row.id,
        frameworkId: row.framework_id,
        frameworkName: row.framework_name,
        userId: row.user_id,
        userName: row.user_name,
        userEmail: row.user_email,
        startDate: row.start_date,
        endDate: row.end_date,
        status: row.status,
        overallScore: row.overall_score,
        totalControls: row.total_controls,
        passedControls: row.passed_controls,
        failedControls: row.failed_controls,
        notConfiguredControls: row.not_configured_controls,
        results: JSON.parse(row.results || '[]')
      })),
      pagination: {
        page: Math.floor(parseInt(offset as string) / parseInt(limit as string)) + 1,
        limit: parseInt(limit as string),
        total,
        totalPages: Math.ceil(total / parseInt(limit as string))
      }
    });

  } catch (error) {
    logger.error('Error fetching assessments:', error);
    res.status(500).json({ error: 'Failed to fetch assessments' });
  }
}));

// Get specific assessment details
router.get('/assessments/:assessmentId', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const { assessmentId } = req.params;

  try {
    const query = `
      SELECT 
        ca.*,
        f.name as framework_name,
        f.version as framework_version,
        f.description as framework_description,
        u.name as user_name,
        u.email as user_email
      FROM compliance_assessments ca
      JOIN compliance_frameworks f ON ca.framework_id = f.id
      LEFT JOIN users u ON ca.user_id = u.id
      WHERE ca.id = $1
    `;

    const result = await db.query(query, [assessmentId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

    const assessment = result.rows[0];

    res.json({
      success: true,
      data: {
        id: assessment.id,
        frameworkId: assessment.framework_id,
        frameworkName: assessment.framework_name,
        frameworkVersion: assessment.framework_version,
        frameworkDescription: assessment.framework_description,
        userId: assessment.user_id,
        userName: assessment.user_name,
        userEmail: assessment.user_email,
        startDate: assessment.start_date,
        endDate: assessment.end_date,
        status: assessment.status,
        overallScore: assessment.overall_score,
        totalControls: assessment.total_controls,
        passedControls: assessment.passed_controls,
        failedControls: assessment.failed_controls,
        notConfiguredControls: assessment.not_configured_controls,
        results: JSON.parse(assessment.results || '[]')
      }
    });

  } catch (error) {
    logger.error('Error fetching assessment details:', error);
    res.status(500).json({ error: 'Failed to fetch assessment details' });
  }
}));

// Get compliance status for all frameworks
router.get('/status', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const db = getDb();

  try {
    const query = `
      SELECT 
        f.id,
        f.name,
        f.version,
        f.category,
        f.is_active,
        COUNT(c.id) as total_controls,
        COUNT(CASE WHEN c.status = 'passed' THEN 1 END) as passed_controls,
        COUNT(CASE WHEN c.status = 'failed' THEN 1 END) as failed_controls,
        COUNT(CASE WHEN c.status = 'not_configured' THEN 1 END) as not_configured_controls,
        COUNT(CASE WHEN c.status = 'manual_review' THEN 1 END) as manual_review_controls,
        ROUND(
          CASE 
            WHEN COUNT(c.id) > 0 THEN 
              (COUNT(CASE WHEN c.status = 'passed' THEN 1 END)::float / COUNT(c.id)) * 100
            ELSE 0 
          END, 2
        ) as compliance_percentage,
        MAX(ca.start_date) as last_assessment_date,
        MAX(ca.overall_score) as last_assessment_score
      FROM compliance_frameworks f
      LEFT JOIN controls c ON f.id = c.framework_id
      LEFT JOIN compliance_assessments ca ON f.id = ca.framework_id AND ca.status = 'completed'
      GROUP BY f.id, f.name, f.version, f.category, f.is_active
      ORDER BY f.is_active DESC, compliance_percentage DESC, f.name
    `;

    const result = await db.query(query);

    res.json({
      success: true,
      data: result.rows.map(row => ({
        id: row.id,
        name: row.name,
        version: row.version,
        category: row.category,
        isActive: row.is_active,
        totalControls: parseInt(row.total_controls) || 0,
        passedControls: parseInt(row.passed_controls) || 0,
        failedControls: parseInt(row.failed_controls) || 0,
        notConfiguredControls: parseInt(row.not_configured_controls) || 0,
        manualReviewControls: parseInt(row.manual_review_controls) || 0,
        compliancePercentage: parseFloat(row.compliance_percentage) || 0,
        lastAssessmentDate: row.last_assessment_date,
        lastAssessmentScore: row.last_assessment_score
      }))
    });

  } catch (error) {
    logger.error('Error fetching compliance status:', error);
    res.status(500).json({ error: 'Failed to fetch compliance status' });
  }
}));

// Get compliance trends
router.get('/trends', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const { frameworkId, days = 30 } = req.query;

  try {
    let query = `
      SELECT 
        DATE(ca.start_date) as date,
        f.id as framework_id,
        f.name as framework_name,
        AVG(ca.overall_score) as avg_score,
        COUNT(*) as assessment_count
      FROM compliance_assessments ca
      JOIN compliance_frameworks f ON ca.framework_id = f.id
      WHERE ca.start_date >= CURRENT_DATE - INTERVAL '${parseInt(days as string)} days'
      AND ca.status = 'completed'
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (frameworkId) {
      query += ` AND f.id = $${paramIndex++}`;
      params.push(frameworkId);
    }

    query += `
      GROUP BY DATE(ca.start_date), f.id, f.name
      ORDER BY date DESC, f.name
    `;

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: result.rows.map(row => ({
        date: row.date,
        frameworkId: row.framework_id,
        frameworkName: row.framework_name,
        averageScore: parseFloat(row.avg_score),
        assessmentCount: parseInt(row.assessment_count)
      }))
    });

  } catch (error) {
    logger.error('Error fetching compliance trends:', error);
    res.status(500).json({ error: 'Failed to fetch compliance trends' });
  }
}));

// Cancel running assessment
router.post('/assessments/:assessmentId/cancel', requireComplianceOfficer, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const { assessmentId } = req.params;
  const userId = req.user!.id;

  try {
    const query = `
      UPDATE compliance_assessments 
      SET status = 'cancelled', end_date = CURRENT_TIMESTAMP
      WHERE id = $1 AND status = 'in_progress'
      RETURNING *
    `;

    const result = await db.query(query, [assessmentId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Assessment not found or not in progress' 
      });
    }

    // Log the cancellation
    const auditQuery = `
      INSERT INTO audit_logs (user_id, action, resource, resource_id, details, timestamp, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, $7)
    `;

    await db.query(auditQuery, [
      userId,
      'cancel_assessment',
      'compliance_assessment',
      assessmentId,
      JSON.stringify({ reason: 'Manual cancellation' }),
      req.ip,
      req.get('User-Agent')
    ]);

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Assessment cancelled successfully'
    });

  } catch (error) {
    logger.error('Error cancelling assessment:', error);
    res.status(500).json({ error: 'Failed to cancel assessment' });
  }
}));

// Get assessment statistics
router.get('/statistics', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const db = getDb();

  try {
    // Overall statistics
    const overallQuery = `
      SELECT 
        COUNT(*) as total_assessments,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_assessments,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_assessments,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_assessments,
        AVG(CASE WHEN status = 'completed' THEN overall_score END) as avg_compliance_score,
        AVG(CASE WHEN status = 'completed' AND end_date IS NOT NULL THEN 
          EXTRACT(EPOCH FROM (end_date - start_date))/60 END) as avg_duration_minutes
      FROM compliance_assessments
      WHERE start_date >= CURRENT_DATE - INTERVAL '30 days'
    `;

    const overallResult = await db.query(overallQuery);

    // Framework statistics
    const frameworkQuery = `
      SELECT 
        f.name as framework_name,
        COUNT(ca.id) as assessment_count,
        AVG(ca.overall_score) as avg_score,
        MAX(ca.start_date) as last_assessment
      FROM compliance_frameworks f
      LEFT JOIN compliance_assessments ca ON f.id = ca.framework_id 
        AND ca.status = 'completed'
        AND ca.start_date >= CURRENT_DATE - INTERVAL '30 days'
      WHERE f.is_active = true
      GROUP BY f.id, f.name
      ORDER BY assessment_count DESC, avg_score DESC
    `;

    const frameworkResult = await db.query(frameworkQuery);

    res.json({
      success: true,
      data: {
        overall: {
          totalAssessments: parseInt(overallResult.rows[0].total_assessments) || 0,
          completedAssessments: parseInt(overallResult.rows[0].completed_assessments) || 0,
          inProgressAssessments: parseInt(overallResult.rows[0].in_progress_assessments) || 0,
          failedAssessments: parseInt(overallResult.rows[0].failed_assessments) || 0,
          averageComplianceScore: parseFloat(overallResult.rows[0].avg_compliance_score) || 0,
          averageDurationMinutes: parseFloat(overallResult.rows[0].avg_duration_minutes) || 0
        },
        byFramework: frameworkResult.rows.map(row => ({
          frameworkName: row.framework_name,
          assessmentCount: parseInt(row.assessment_count) || 0,
          averageScore: parseFloat(row.avg_score) || 0,
          lastAssessment: row.last_assessment
        }))
      }
    });

  } catch (error) {
    logger.error('Error fetching compliance statistics:', error);
    res.status(500).json({ error: 'Failed to fetch compliance statistics' });
  }
}));

export default router;