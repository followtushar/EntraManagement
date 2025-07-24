import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';
import { getDb } from '../config/database';

interface ComplianceAlertData {
  recipients: string[];
  subject: string;
  failedControls: any[];
  type: string;
}

interface WeeklyDigestData {
  recipients: string[];
  summary: any[];
  weekStart: Date;
  weekEnd: Date;
}

class NotificationService {
  private emailTransporter: nodemailer.Transporter;

  constructor() {
    this.emailTransporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST || 'smtp.office365.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      tls: {
        ciphers: 'SSLv3',
      },
    });
  }

  async sendComplianceAlert(data: ComplianceAlertData): Promise<void> {
    try {
      const htmlContent = this.generateComplianceAlertHtml(data);
      
      const mailOptions = {
        from: process.env.SMTP_FROM || 'noreply@entramanagement.com',
        to: data.recipients.join(', '),
        subject: data.subject,
        html: htmlContent,
      };

      await this.emailTransporter.sendMail(mailOptions);
      logger.info(`Compliance alert sent to ${data.recipients.length} recipients`);
      
      // Log notification
      await this.logNotification({
        type: 'compliance_alert',
        recipients: data.recipients,
        subject: data.subject,
        status: 'sent'
      });
      
    } catch (error) {
      logger.error('Failed to send compliance alert:', error);
      
      // Log failed notification
      await this.logNotification({
        type: 'compliance_alert',
        recipients: data.recipients,
        subject: data.subject,
        status: 'failed',
        error: error.message
      });
    }
  }

  async sendWeeklyDigest(data: WeeklyDigestData): Promise<void> {
    try {
      const htmlContent = this.generateWeeklyDigestHtml(data);
      
      const mailOptions = {
        from: process.env.SMTP_FROM || 'noreply@entramanagement.com',
        to: data.recipients.join(', '),
        subject: `Weekly Compliance Digest - ${data.weekStart.toDateString()} to ${data.weekEnd.toDateString()}`,
        html: htmlContent,
      };

      await this.emailTransporter.sendMail(mailOptions);
      logger.info(`Weekly digest sent to ${data.recipients.length} recipients`);
      
      // Log notification
      await this.logNotification({
        type: 'weekly_digest',
        recipients: data.recipients,
        subject: mailOptions.subject,
        status: 'sent'
      });
      
    } catch (error) {
      logger.error('Failed to send weekly digest:', error);
      
      // Log failed notification
      await this.logNotification({
        type: 'weekly_digest',
        recipients: data.recipients,
        subject: 'Weekly Compliance Digest',
        status: 'failed',
        error: error.message
      });
    }
  }

  async sendAssessmentComplete(userId: string, assessmentId: string, frameworkName: string, score: number): Promise<void> {
    try {
      const db = getDb();
      const userQuery = 'SELECT email, name FROM users WHERE id = $1';
      const userResult = await db.query(userQuery, [userId]);
      
      if (userResult.rows.length === 0) {
        logger.warn(`User not found for assessment notification: ${userId}`);
        return;
      }
      
      const user = userResult.rows[0];
      const htmlContent = this.generateAssessmentCompleteHtml({
        userName: user.name,
        frameworkName,
        score,
        assessmentId
      });
      
      const mailOptions = {
        from: process.env.SMTP_FROM || 'noreply@entramanagement.com',
        to: user.email,
        subject: `Compliance Assessment Complete - ${frameworkName}`,
        html: htmlContent,
      };

      await this.emailTransporter.sendMail(mailOptions);
      logger.info(`Assessment complete notification sent to ${user.email}`);
      
      // Log notification
      await this.logNotification({
        type: 'assessment_complete',
        recipients: [user.email],
        subject: mailOptions.subject,
        status: 'sent'
      });
      
    } catch (error) {
      logger.error('Failed to send assessment complete notification:', error);
    }
  }

  async sendTeamsNotification(webhookUrl: string, message: any): Promise<void> {
    try {
      // Implementation for Teams webhook notifications
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      if (response.ok) {
        logger.info('Teams notification sent successfully');
      } else {
        logger.error('Failed to send Teams notification:', response.statusText);
      }
    } catch (error) {
      logger.error('Error sending Teams notification:', error);
    }
  }

  private generateComplianceAlertHtml(data: ComplianceAlertData): string {
    const controlsHtml = data.failedControls.map(control => `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;">${control.name}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${control.framework_name}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">
          <span style="background-color: ${control.severity === 'critical' ? '#dc3545' : '#fd7e14'}; 
                       color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">
            ${control.severity.toUpperCase()}
          </span>
        </td>
      </tr>
    `).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Compliance Alert</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #dc3545; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">🚨 Compliance Alert</h1>
          </div>
          
          <div style="background-color: #f8f9fa; padding: 20px; border: 1px solid #ddd; border-top: none;">
            <p><strong>Alert Type:</strong> ${data.type}</p>
            <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
            <p>The following critical compliance issues have been detected:</p>
            
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <thead>
                <tr style="background-color: #e9ecef;">
                  <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">Control</th>
                  <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">Framework</th>
                  <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">Severity</th>
                </tr>
              </thead>
              <tbody>
                ${controlsHtml}
              </tbody>
            </table>
            
            <p style="margin-top: 20px;">
              <strong>Action Required:</strong> Please review and remediate these controls as soon as possible.
            </p>
            
            <div style="margin-top: 30px; padding: 20px; background-color: #fff3cd; border-left: 4px solid #ffc107;">
              <p style="margin: 0;"><strong>Next Steps:</strong></p>
              <ul style="margin: 10px 0;">
                <li>Log in to the Entra Management App</li>
                <li>Review the failed controls</li>
                <li>Follow the remediation steps provided</li>
                <li>Re-run the compliance check to verify fixes</li>
              </ul>
            </div>
          </div>
          
          <div style="background-color: #6c757d; color: white; padding: 15px; border-radius: 0 0 8px 8px; text-align: center; font-size: 14px;">
            Entra Management App - Automated Compliance Monitoring
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private generateWeeklyDigestHtml(data: WeeklyDigestData): string {
    const summaryHtml = data.summary.map(item => `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;">${item.framework_name}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${Math.round(item.avg_score)}%</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${item.assessment_count}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${item.total_failed_controls || 0}</td>
      </tr>
    `).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Weekly Compliance Digest</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #007bff; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">📊 Weekly Compliance Digest</h1>
          </div>
          
          <div style="background-color: #f8f9fa; padding: 20px; border: 1px solid #ddd; border-top: none;">
            <p><strong>Report Period:</strong> ${data.weekStart.toDateString()} - ${data.weekEnd.toDateString()}</p>
            
            <h3 style="color: #007bff; margin-top: 30px;">Compliance Summary</h3>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <thead>
                <tr style="background-color: #e9ecef;">
                  <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">Framework</th>
                  <th style="padding: 12px; border: 1px solid #ddd; text-align: center;">Avg Score</th>
                  <th style="padding: 12px; border: 1px solid #ddd; text-align: center;">Assessments</th>
                  <th style="padding: 12px; border: 1px solid #ddd; text-align: center;">Failed Controls</th>
                </tr>
              </thead>
              <tbody>
                ${summaryHtml}
              </tbody>
            </table>
            
            <div style="margin-top: 30px; padding: 20px; background-color: #d1ecf1; border-left: 4px solid #17a2b8;">
              <p style="margin: 0;"><strong>Recommendations:</strong></p>
              <ul style="margin: 10px 0;">
                <li>Focus on frameworks with scores below 80%</li>
                <li>Review and remediate failed controls</li>
                <li>Schedule regular compliance reviews</li>
                <li>Update security policies as needed</li>
              </ul>
            </div>
          </div>
          
          <div style="background-color: #6c757d; color: white; padding: 15px; border-radius: 0 0 8px 8px; text-align: center; font-size: 14px;">
            Entra Management App - Weekly Compliance Report
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private generateAssessmentCompleteHtml(data: any): string {
    const scoreColor = data.score >= 80 ? '#28a745' : data.score >= 60 ? '#ffc107' : '#dc3545';
    const scoreIcon = data.score >= 80 ? '✅' : data.score >= 60 ? '⚠️' : '❌';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Assessment Complete</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: ${scoreColor}; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">${scoreIcon} Assessment Complete</h1>
          </div>
          
          <div style="background-color: #f8f9fa; padding: 20px; border: 1px solid #ddd; border-top: none;">
            <p>Hello ${data.userName},</p>
            <p>Your compliance assessment has been completed for <strong>${data.frameworkName}</strong>.</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <div style="display: inline-block; padding: 20px; background-color: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <h2 style="margin: 0; font-size: 36px; color: ${scoreColor};">${data.score}%</h2>
                <p style="margin: 5px 0 0 0; color: #666;">Compliance Score</p>
              </div>
            </div>
            
            <p><strong>Assessment ID:</strong> ${data.assessmentId}</p>
            <p><strong>Completion Date:</strong> ${new Date().toLocaleString()}</p>
            
            <div style="margin-top: 30px; padding: 20px; background-color: #e7f3ff; border-left: 4px solid #007bff;">
              <p style="margin: 0;"><strong>Next Steps:</strong></p>
              <ul style="margin: 10px 0;">
                <li>Review detailed results in the dashboard</li>
                <li>Address any failed controls</li>
                <li>Generate compliance reports if needed</li>
                <li>Schedule follow-up assessments</li>
              </ul>
            </div>
          </div>
          
          <div style="background-color: #6c757d; color: white; padding: 15px; border-radius: 0 0 8px 8px; text-align: center; font-size: 14px;">
            Entra Management App - Compliance Assessment
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private async logNotification(data: any): Promise<void> {
    try {
      const db = getDb();
      const query = `
        INSERT INTO notification_logs (type, recipients, subject, status, error, timestamp)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      `;
      
      await db.query(query, [
        data.type,
        JSON.stringify(data.recipients),
        data.subject,
        data.status,
        data.error || null
      ]);
    } catch (error) {
      logger.error('Failed to log notification:', error);
    }
  }
}

export const notificationService = new NotificationService();