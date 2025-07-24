import express from 'express';
import { getDb } from '../config/database';
import { AuthenticatedRequest, DashboardMetrics } from '../types';
import { logger } from '../utils/logger';
import { asyncHandler } from '../middleware/errorHandler';
import { cacheService } from '../config/redis';

const router = express.Router();

// Get dashboard metrics
router.get('/metrics', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const userId = req.user?.id;
  const tenantId = req.user?.tenantId;

  try {
    const cacheKey = `dashboard_metrics_${tenantId}`;
    const cached = await cacheService.get(cacheKey);
    
    if (cached) {
      return res.json({
        success: true,
        data: JSON.parse(cached)
      });
    }

    // Get framework metrics
    const frameworkQuery = `
      SELECT 
        COUNT(*) as total_frameworks,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_frameworks
      FROM compliance_frameworks
    `;
    const frameworkResult = await db.query(frameworkQuery);

    // Get control metrics
    const controlQuery = `
      SELECT 
        COUNT(*) as total_controls,
        COUNT(CASE WHEN status = 'passed' THEN 1 END) as passed_controls,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_controls,
        COUNT(CASE WHEN status = 'not_configured' THEN 1 END) as not_configured_controls
      FROM controls c
      JOIN compliance_frameworks f ON c.framework_id = f.id
      WHERE f.is_active = true
    `;
    const controlResult = await db.query(controlQuery);

    // Calculate overall compliance score
    const totalControls = parseInt(controlResult.rows[0].total_controls) || 0;
    const passedControls = parseInt(controlResult.rows[0].passed_controls) || 0;
    const overallScore = totalControls > 0 ? (passedControls / totalControls) * 100 : 0;

    // Get recent assessments
    const recentAssessmentsQuery = `
      SELECT 
        ca.id,
        ca.framework_id,
        ca.overall_score,
        ca.status,
        ca.start_date,
        ca.end_date,
        f.name as framework_name
      FROM compliance_assessments ca
      JOIN compliance_frameworks f ON ca.framework_id = f.id
      ORDER BY ca.start_date DESC
      LIMIT 5
    `;
    const recentAssessmentsResult = await db.query(recentAssessmentsQuery);

    // Get top risks (failed critical/high severity controls)
    const topRisksQuery = `
      SELECT 
        c.id as control_id,
        c.name as control_name,
        c.severity,
        c.status,
        f.name as framework,
        EXTRACT(DAYS FROM (CURRENT_TIMESTAMP - c.last_checked)) as days_since_detection
      FROM controls c
      JOIN compliance_frameworks f ON c.framework_id = f.id
      WHERE c.status = 'failed' 
      AND c.severity IN ('critical', 'high')
      AND f.is_active = true
      ORDER BY 
        CASE c.severity 
          WHEN 'critical' THEN 1 
          WHEN 'high' THEN 2 
          ELSE 3 
        END,
        c.last_checked DESC
      LIMIT 10
    `;
    const topRisksResult = await db.query(topRisksQuery);

    // Get compliance trends (last 30 days)
    const trendsQuery = `
      SELECT 
        DATE(ca.start_date) as date,
        f.name as framework,
        AVG(ca.overall_score) as score
      FROM compliance_assessments ca
      JOIN compliance_frameworks f ON ca.framework_id = f.id
      WHERE ca.start_date >= CURRENT_DATE - INTERVAL '30 days'
      AND ca.status = 'completed'
      GROUP BY DATE(ca.start_date), f.id, f.name
      ORDER BY date DESC, f.name
    `;
    const trendsResult = await db.query(trendsQuery);

    const metrics: DashboardMetrics = {
      totalFrameworks: parseInt(frameworkResult.rows[0].total_frameworks) || 0,
      activeFrameworks: parseInt(frameworkResult.rows[0].active_frameworks) || 0,
      overallComplianceScore: Math.round(overallScore),
      totalControls: totalControls,
      passedControls: passedControls,
      failedControls: parseInt(controlResult.rows[0].failed_controls) || 0,
      notConfiguredControls: parseInt(controlResult.rows[0].not_configured_controls) || 0,
      recentAssessments: recentAssessmentsResult.rows.map(row => ({
        id: row.id,
        frameworkId: row.framework_id,
        userId: '', // Not needed for dashboard
        startDate: row.start_date,
        endDate: row.end_date,
        status: row.status,
        overallScore: row.overall_score,
        totalControls: 0, // Not needed for dashboard summary
        passedControls: 0,
        failedControls: 0,
        notConfiguredControls: 0,
        results: [],
        frameworkName: row.framework_name
      })),
      topRisks: topRisksResult.rows.map(row => ({
        controlId: row.control_id,
        controlName: row.control_name,
        framework: row.framework,
        severity: row.severity,
        status: row.status,
        daysSinceDetection: parseInt(row.days_since_detection) || 0
      })),
      complianceTrends: trendsResult.rows.map(row => ({
        date: row.date,
        score: parseFloat(row.score),
        framework: row.framework
      }))
    };

    // Cache for 15 minutes
    await cacheService.set(cacheKey, JSON.stringify(metrics), 900);

    res.json({
      success: true,
      data: metrics
    });

  } catch (error) {
    logger.error('Error fetching dashboard metrics:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard metrics' });
  }
}));

// Get compliance summary by framework
router.get('/compliance-summary', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const db = getDb();

  try {
    const query = `
      SELECT 
        f.id,
        f.name,
        f.version,
        f.category,
        COUNT(c.id) as total_controls,
        COUNT(CASE WHEN c.status = 'passed' THEN 1 END) as passed_controls,
        COUNT(CASE WHEN c.status = 'failed' THEN 1 END) as failed_controls,
        COUNT(CASE WHEN c.status = 'not_configured' THEN 1 END) as not_configured_controls,
        ROUND(
          CASE 
            WHEN COUNT(c.id) > 0 THEN 
              (COUNT(CASE WHEN c.status = 'passed' THEN 1 END)::float / COUNT(c.id)) * 100
            ELSE 0 
          END, 2
        ) as compliance_percentage,
        MAX(ca.start_date) as last_assessment_date
      FROM compliance_frameworks f
      LEFT JOIN controls c ON f.id = c.framework_id
      LEFT JOIN compliance_assessments ca ON f.id = ca.framework_id AND ca.status = 'completed'
      WHERE f.is_active = true
      GROUP BY f.id, f.name, f.version, f.category
      ORDER BY compliance_percentage DESC, f.name
    `;

    const result = await db.query(query);

    res.json({
      success: true,
      data: result.rows.map(row => ({
        id: row.id,
        name: row.name,
        version: row.version,
        category: row.category,
        totalControls: parseInt(row.total_controls) || 0,
        passedControls: parseInt(row.passed_controls) || 0,
        failedControls: parseInt(row.failed_controls) || 0,
        notConfiguredControls: parseInt(row.not_configured_controls) || 0,
        compliancePercentage: parseFloat(row.compliance_percentage) || 0,
        lastAssessmentDate: row.last_assessment_date
      }))
    });

  } catch (error) {
    logger.error('Error fetching compliance summary:', error);
    res.status(500).json({ error: 'Failed to fetch compliance summary' });
  }
}));

// Get recent activity
router.get('/recent-activity', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const limit = parseInt(req.query.limit as string) || 20;

  try {
    const query = `
      SELECT 
        al.id,
        al.action,
        al.resource,
        al.resource_id,
        al.details,
        al.timestamp,
        u.name as user_name,
        u.email as user_email
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ORDER BY al.timestamp DESC
      LIMIT $1
    `;

    const result = await db.query(query, [limit]);

    res.json({
      success: true,
      data: result.rows.map(row => ({
        id: row.id,
        action: row.action,
        resource: row.resource,
        resourceId: row.resource_id,
        details: row.details,
        timestamp: row.timestamp,
        user: {
          name: row.user_name,
          email: row.user_email
        }
      }))
    });

  } catch (error) {
    logger.error('Error fetching recent activity:', error);
    res.status(500).json({ error: 'Failed to fetch recent activity' });
  }
}));

// Get alerts and notifications
router.get('/alerts', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const db = getDb();

  try {
    // Get critical failed controls
    const criticalControlsQuery = `
      SELECT 
        c.id,
        c.name,
        c.severity,
        f.name as framework_name,
        c.last_checked
      FROM controls c
      JOIN compliance_frameworks f ON c.framework_id = f.id
      WHERE c.status = 'failed' 
      AND c.severity = 'critical'
      AND f.is_active = true
      ORDER BY c.last_checked DESC
      LIMIT 10
    `;

    const criticalControlsResult = await db.query(criticalControlsQuery);

    // Get frameworks with low compliance scores
    const lowComplianceQuery = `
      SELECT 
        f.name,
        ca.overall_score,
        ca.start_date
      FROM compliance_assessments ca
      JOIN compliance_frameworks f ON ca.framework_id = f.id
      WHERE ca.overall_score < 70
      AND ca.status = 'completed'
      AND ca.start_date >= CURRENT_DATE - INTERVAL '7 days'
      ORDER BY ca.overall_score ASC, ca.start_date DESC
      LIMIT 5
    `;

    const lowComplianceResult = await db.query(lowComplianceQuery);

    // Get overdue assessments (frameworks not assessed in 30 days)
    const overdueAssessmentsQuery = `
      SELECT 
        f.id,
        f.name,
        MAX(ca.start_date) as last_assessment
      FROM compliance_frameworks f
      LEFT JOIN compliance_assessments ca ON f.id = ca.framework_id AND ca.status = 'completed'
      WHERE f.is_active = true
      GROUP BY f.id, f.name
      HAVING MAX(ca.start_date) < CURRENT_DATE - INTERVAL '30 days' OR MAX(ca.start_date) IS NULL
      ORDER BY MAX(ca.start_date) ASC NULLS FIRST
    `;

    const overdueAssessmentsResult = await db.query(overdueAssessmentsQuery);

    const alerts = {
      criticalControls: criticalControlsResult.rows,
      lowComplianceFrameworks: lowComplianceResult.rows,
      overdueAssessments: overdueAssessmentsResult.rows
    };

    res.json({
      success: true,
      data: alerts
    });

  } catch (error) {
    logger.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
}));

export default router;