import cron from 'node-cron';
import { logger } from '../utils/logger';
import { complianceService } from './complianceService';
import { notificationService } from './notificationService';
import { getDb } from '../config/database';

class SchedulerService {
  private jobs: Map<string, cron.ScheduledTask> = new Map();

  startScheduledJobs(): void {
    // Daily compliance check at 2 AM
    this.scheduleJob('daily-compliance-check', '0 2 * * *', this.runDailyComplianceCheck.bind(this));
    
    // Weekly compliance report on Mondays at 9 AM
    this.scheduleJob('weekly-report', '0 9 * * 1', this.sendWeeklyReport.bind(this));
    
    // Hourly cache cleanup
    this.scheduleJob('cache-cleanup', '0 * * * *', this.cleanupCache.bind(this));
    
    // Daily audit log cleanup (keep 90 days)
    this.scheduleJob('audit-cleanup', '0 3 * * *', this.cleanupAuditLogs.bind(this));

    logger.info('Scheduled jobs started successfully');
  }

  private scheduleJob(name: string, schedule: string, task: () => Promise<void>): void {
    try {
      const job = cron.schedule(schedule, async () => {
        logger.info(`Starting scheduled job: ${name}`);
        try {
          await task();
          logger.info(`Completed scheduled job: ${name}`);
        } catch (error) {
          logger.error(`Error in scheduled job ${name}:`, error);
        }
      }, {
        scheduled: true,
        timezone: process.env.TIMEZONE || 'UTC'
      });

      this.jobs.set(name, job);
      logger.info(`Scheduled job '${name}' registered with schedule: ${schedule}`);
    } catch (error) {
      logger.error(`Failed to schedule job ${name}:`, error);
    }
  }

  private async runDailyComplianceCheck(): Promise<void> {
    const db = getDb();
    
    try {
      // Get all active frameworks
      const frameworksQuery = 'SELECT id FROM compliance_frameworks WHERE is_active = true';
      const frameworksResult = await db.query(frameworksQuery);
      
      // Get system user for automated checks
      const systemUserQuery = 'SELECT id FROM users WHERE email = $1 LIMIT 1';
      const systemUserResult = await db.query(systemUserQuery, ['system@automated.check']);
      
      if (systemUserResult.rows.length === 0) {
        logger.warn('No system user found for automated compliance checks');
        return;
      }
      
      const systemUserId = systemUserResult.rows[0].id;
      
      // Run compliance check for each framework
      for (const framework of frameworksResult.rows) {
        try {
          logger.info(`Running automated compliance check for framework: ${framework.id}`);
          await complianceService.runComplianceCheck(framework.id, systemUserId);
        } catch (error) {
          logger.error(`Failed to run compliance check for framework ${framework.id}:`, error);
        }
      }
      
      // Send notifications for failed controls
      await this.notifyFailedControls();
      
    } catch (error) {
      logger.error('Error in daily compliance check:', error);
    }
  }

  private async notifyFailedControls(): Promise<void> {
    const db = getDb();
    
    try {
      // Get all failed controls from today's assessments
      const query = `
        SELECT DISTINCT c.id, c.name, c.severity, f.name as framework_name,
               ca.overall_score, ca.failed_controls
        FROM controls c
        JOIN compliance_frameworks f ON c.framework_id = f.id
        JOIN compliance_assessments ca ON f.id = ca.framework_id
        WHERE c.status = 'failed' 
        AND ca.start_date >= CURRENT_DATE
        AND c.severity IN ('critical', 'high')
        ORDER BY c.severity DESC
      `;
      
      const result = await db.query(query);
      
      if (result.rows.length > 0) {
        // Send notification to compliance officers and admins
        const usersQuery = `
          SELECT email FROM users 
          WHERE role IN ('admin', 'compliance_officer')
        `;
        
        const usersResult = await db.query(usersQuery);
        const recipients = usersResult.rows.map(row => row.email);
        
        await notificationService.sendComplianceAlert({
          recipients,
          subject: 'Critical Compliance Issues Detected',
          failedControls: result.rows,
          type: 'daily_check'
        });
      }
      
    } catch (error) {
      logger.error('Error notifying failed controls:', error);
    }
  }

  private async sendWeeklyReport(): Promise<void> {
    const db = getDb();
    
    try {
      // Get compliance summary for the past week
      const summaryQuery = `
        SELECT 
          f.name as framework_name,
          AVG(ca.overall_score) as avg_score,
          COUNT(*) as assessment_count,
          SUM(ca.failed_controls) as total_failed_controls
        FROM compliance_assessments ca
        JOIN compliance_frameworks f ON ca.framework_id = f.id
        WHERE ca.start_date >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY f.id, f.name
        ORDER BY avg_score ASC
      `;
      
      const summaryResult = await db.query(summaryQuery);
      
      // Get users who want weekly reports
      const usersQuery = `
        SELECT DISTINCT u.email 
        FROM users u
        JOIN notification_configs nc ON u.id = nc.user_id
        WHERE nc.type = 'weekly_digest' AND nc.enabled = true
      `;
      
      const usersResult = await db.query(usersQuery);
      const recipients = usersResult.rows.map(row => row.email);
      
      if (recipients.length > 0 && summaryResult.rows.length > 0) {
        await notificationService.sendWeeklyDigest({
          recipients,
          summary: summaryResult.rows,
          weekStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          weekEnd: new Date()
        });
      }
      
    } catch (error) {
      logger.error('Error sending weekly report:', error);
    }
  }

  private async cleanupCache(): Promise<void> {
    try {
      // This would typically involve cleaning up expired cache entries
      // Redis handles TTL automatically, but we can do additional cleanup here
      logger.info('Cache cleanup completed');
    } catch (error) {
      logger.error('Error in cache cleanup:', error);
    }
  }

  private async cleanupAuditLogs(): Promise<void> {
    const db = getDb();
    
    try {
      // Delete audit logs older than 90 days
      const deleteQuery = `
        DELETE FROM audit_logs 
        WHERE timestamp < CURRENT_DATE - INTERVAL '90 days'
      `;
      
      const result = await db.query(deleteQuery);
      logger.info(`Deleted ${result.rowCount} old audit log entries`);
      
    } catch (error) {
      logger.error('Error cleaning up audit logs:', error);
    }
  }

  stopJob(name: string): void {
    const job = this.jobs.get(name);
    if (job) {
      job.stop();
      this.jobs.delete(name);
      logger.info(`Stopped scheduled job: ${name}`);
    }
  }

  stopAllJobs(): void {
    for (const [name, job] of this.jobs) {
      job.stop();
      logger.info(`Stopped scheduled job: ${name}`);
    }
    this.jobs.clear();
  }

  getJobStatus(): Array<{ name: string; running: boolean }> {
    return Array.from(this.jobs.entries()).map(([name, job]) => ({
      name,
      running: job.getStatus() === 'scheduled'
    }));
  }
}

export const schedulerService = new SchedulerService();
export const startScheduledJobs = () => schedulerService.startScheduledJobs();