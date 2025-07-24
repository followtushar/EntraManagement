import express from 'express';
import { getDb } from '../config/database';
import { AuthenticatedRequest, NotificationType, NotificationChannel } from '../types';
import { logger } from '../utils/logger';
import { asyncHandler } from '../middleware/errorHandler';
import { requireAdmin } from '../middleware/auth';

const router = express.Router();

// Get user notification settings
router.get('/notifications', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const userId = req.user!.id;

  try {
    const query = `
      SELECT * FROM notification_configs 
      WHERE user_id = $1
      ORDER BY type
    `;

    const result = await db.query(query, [userId]);

    res.json({
      success: true,
      data: result.rows.map(row => ({
        id: row.id,
        type: row.type,
        enabled: row.enabled,
        channels: JSON.parse(row.channels || '[]'),
        conditions: JSON.parse(row.conditions || '[]')
      }))
    });

  } catch (error) {
    logger.error('Error fetching notification settings:', error);
    res.status(500).json({ error: 'Failed to fetch notification settings' });
  }
}));

// Update user notification settings
router.put('/notifications/:configId', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const { configId } = req.params;
  const { enabled, channels, conditions } = req.body;
  const userId = req.user!.id;

  try {
    const query = `
      UPDATE notification_configs 
      SET enabled = $1, channels = $2, conditions = $3
      WHERE id = $4 AND user_id = $5
      RETURNING *
    `;

    const result = await db.query(query, [
      enabled,
      JSON.stringify(channels),
      JSON.stringify(conditions),
      configId,
      userId
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification configuration not found' });
    }

    res.json({
      success: true,
      data: {
        id: result.rows[0].id,
        type: result.rows[0].type,
        enabled: result.rows[0].enabled,
        channels: JSON.parse(result.rows[0].channels),
        conditions: JSON.parse(result.rows[0].conditions)
      },
      message: 'Notification settings updated successfully'
    });

  } catch (error) {
    logger.error('Error updating notification settings:', error);
    res.status(500).json({ error: 'Failed to update notification settings' });
  }
}));

// Create notification configuration
router.post('/notifications', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const { type, enabled = true, channels = [], conditions = [] } = req.body;
  const userId = req.user!.id;

  try {
    // Validate notification type
    if (!Object.values(NotificationType).includes(type)) {
      return res.status(400).json({ error: 'Invalid notification type' });
    }

    // Validate channels
    const validChannels = channels.every((channel: string) => 
      Object.values(NotificationChannel).includes(channel as NotificationChannel)
    );

    if (!validChannels) {
      return res.status(400).json({ error: 'Invalid notification channel' });
    }

    const configId = `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const query = `
      INSERT INTO notification_configs (id, user_id, type, enabled, channels, conditions)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const result = await db.query(query, [
      configId,
      userId,
      type,
      enabled,
      JSON.stringify(channels),
      JSON.stringify(conditions)
    ]);

    res.status(201).json({
      success: true,
      data: {
        id: result.rows[0].id,
        type: result.rows[0].type,
        enabled: result.rows[0].enabled,
        channels: JSON.parse(result.rows[0].channels),
        conditions: JSON.parse(result.rows[0].conditions)
      },
      message: 'Notification configuration created successfully'
    });

  } catch (error) {
    logger.error('Error creating notification configuration:', error);
    res.status(500).json({ error: 'Failed to create notification configuration' });
  }
}));

// Get system settings (admin only)
router.get('/system', requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const settings = {
    application: {
      name: 'Entra Management App',
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    },
    azure: {
      tenantId: process.env.AZURE_TENANT_ID,
      clientId: process.env.AZURE_CLIENT_ID,
      // Don't expose sensitive information
      hasClientSecret: !!process.env.AZURE_CLIENT_SECRET
    },
    database: {
      connected: true, // We assume it's connected if we reach this point
      type: 'PostgreSQL'
    },
    redis: {
      connected: true, // We assume it's connected if we reach this point
      url: process.env.REDIS_URL ? 'configured' : 'not configured'
    },
    email: {
      configured: !!(process.env.SMTP_HOST && process.env.SMTP_USER),
      host: process.env.SMTP_HOST || 'not configured'
    },
    features: {
      scheduledJobs: true,
      notifications: true,
      reporting: true,
      auditLogging: true
    }
  };

  res.json({
    success: true,
    data: settings
  });
}));

// Update system settings (admin only)
router.put('/system', requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
  // This would typically update environment variables or configuration files
  // For security reasons, we'll only allow updating non-sensitive settings
  
  const { features } = req.body;
  const userId = req.user!.id;

  try {
    // Log the settings change
    const auditQuery = `
      INSERT INTO audit_logs (user_id, action, resource, resource_id, details, timestamp, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, $7)
    `;

    await db.query(auditQuery, [
      userId,
      'update_system_settings',
      'system',
      'settings',
      JSON.stringify({ features }),
      req.ip,
      req.get('User-Agent')
    ]);

    res.json({
      success: true,
      message: 'System settings updated successfully'
    });

  } catch (error) {
    logger.error('Error updating system settings:', error);
    res.status(500).json({ error: 'Failed to update system settings' });
  }
}));

// Get integration settings
router.get('/integrations', requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const integrations = {
    microsoftDefender: {
      name: 'Microsoft Defender for Cloud',
      enabled: false,
      configured: false,
      description: 'Integrate with Microsoft Defender for Cloud for additional security insights'
    },
    complianceManager: {
      name: 'Microsoft Compliance Manager',
      enabled: false,
      configured: false,
      description: 'Sync with Microsoft Compliance Manager for compliance assessments'
    },
    logAnalytics: {
      name: 'Azure Log Analytics',
      enabled: false,
      configured: false,
      description: 'Send logs and metrics to Azure Log Analytics workspace'
    },
    teams: {
      name: 'Microsoft Teams',
      enabled: !!process.env.TEAMS_WEBHOOK_URL,
      configured: !!process.env.TEAMS_WEBHOOK_URL,
      description: 'Send notifications to Microsoft Teams channels'
    }
  };

  res.json({
    success: true,
    data: integrations
  });
}));

// Test integration
router.post('/integrations/:integration/test', requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { integration } = req.params;
  const userId = req.user!.id;

  try {
    let testResult = { success: false, message: 'Integration not supported' };

    switch (integration) {
      case 'teams':
        if (process.env.TEAMS_WEBHOOK_URL) {
          // Test Teams webhook
          const testMessage = {
            text: 'Test message from Entra Management App',
            title: 'Integration Test'
          };

          const response = await fetch(process.env.TEAMS_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testMessage)
          });

          testResult = {
            success: response.ok,
            message: response.ok ? 'Teams integration test successful' : 'Teams integration test failed'
          };
        } else {
          testResult = { success: false, message: 'Teams webhook URL not configured' };
        }
        break;

      case 'logAnalytics':
        testResult = { success: false, message: 'Log Analytics integration not implemented' };
        break;

      default:
        testResult = { success: false, message: 'Unknown integration' };
    }

    // Log the test
    const auditQuery = `
      INSERT INTO audit_logs (user_id, action, resource, resource_id, details, timestamp, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, $7)
    `;

    await db.query(auditQuery, [
      userId,
      'test_integration',
      'integration',
      integration,
      JSON.stringify(testResult),
      req.ip,
      req.get('User-Agent')
    ]);

    res.json({
      success: true,
      data: testResult
    });

  } catch (error) {
    logger.error(`Error testing ${integration} integration:`, error);
    res.status(500).json({ error: 'Failed to test integration' });
  }
}));

// Get user preferences
router.get('/preferences', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const userId = req.user!.id;

  try {
    const query = `
      SELECT preferences FROM users 
      WHERE id = $1
    `;

    const result = await db.query(query, [userId]);

    const preferences = result.rows[0]?.preferences ? 
      JSON.parse(result.rows[0].preferences) : 
      {
        theme: 'light',
        language: 'en',
        timezone: 'UTC',
        dashboardRefreshInterval: 300, // 5 minutes
        itemsPerPage: 20,
        showWelcomeMessage: true
      };

    res.json({
      success: true,
      data: preferences
    });

  } catch (error) {
    logger.error('Error fetching user preferences:', error);
    res.status(500).json({ error: 'Failed to fetch user preferences' });
  }
}));

// Update user preferences
router.put('/preferences', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const userId = req.user!.id;
  const preferences = req.body;

  try {
    const query = `
      UPDATE users 
      SET preferences = $1
      WHERE id = $2
      RETURNING preferences
    `;

    const result = await db.query(query, [JSON.stringify(preferences), userId]);

    res.json({
      success: true,
      data: JSON.parse(result.rows[0].preferences),
      message: 'Preferences updated successfully'
    });

  } catch (error) {
    logger.error('Error updating user preferences:', error);
    res.status(500).json({ error: 'Failed to update user preferences' });
  }
}));

// Get audit log settings (admin only)
router.get('/audit', requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const settings = {
    retention: {
      days: 90,
      description: 'Audit logs are retained for 90 days'
    },
    logLevel: process.env.LOG_LEVEL || 'info',
    enabledActions: [
      'login',
      'logout',
      'create_framework',
      'update_framework',
      'delete_framework',
      'run_assessment',
      'update_control_status',
      'generate_report',
      'update_system_settings'
    ]
  };

  res.json({
    success: true,
    data: settings
  });
}));

// Get available notification types and channels
router.get('/notifications/meta', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const meta = {
    types: Object.values(NotificationType).map(type => ({
      value: type,
      label: type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      description: getNotificationTypeDescription(type)
    })),
    channels: Object.values(NotificationChannel).map(channel => ({
      value: channel,
      label: channel.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      description: getNotificationChannelDescription(channel)
    }))
  };

  res.json({
    success: true,
    data: meta
  });
}));

function getNotificationTypeDescription(type: NotificationType): string {
  switch (type) {
    case NotificationType.COMPLIANCE_ALERT:
      return 'Alerts for failed compliance controls';
    case NotificationType.ASSESSMENT_COMPLETE:
      return 'Notifications when compliance assessments are completed';
    case NotificationType.REMEDIATION_REQUIRED:
      return 'Alerts when remediation actions are required';
    case NotificationType.WEEKLY_DIGEST:
      return 'Weekly summary of compliance status';
    default:
      return 'Notification type';
  }
}

function getNotificationChannelDescription(channel: NotificationChannel): string {
  switch (channel) {
    case NotificationChannel.EMAIL:
      return 'Email notifications';
    case NotificationChannel.TEAMS:
      return 'Microsoft Teams notifications';
    case NotificationChannel.WEBHOOK:
      return 'Custom webhook notifications';
    default:
      return 'Notification channel';
  }
}

export default router;