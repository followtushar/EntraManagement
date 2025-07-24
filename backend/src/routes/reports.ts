import express from 'express';
import { getDb } from '../config/database';
import { AuthenticatedRequest, ReportFormat } from '../types';
import { logger } from '../utils/logger';
import { asyncHandler } from '../middleware/errorHandler';
import { requireComplianceOfficer } from '../middleware/auth';
import { PDFDocument, rgb } from 'pdf-lib';
import * as XLSX from 'xlsx';

const router = express.Router();

// Generate compliance report
router.post('/generate', requireComplianceOfficer, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const { 
    frameworkIds = [], 
    format = ReportFormat.PDF,
    includeEvidence = false,
    includeRemediation = false,
    title = 'Compliance Report'
  } = req.body;
  const userId = req.user!.id;

  try {
    // Get frameworks data
    let frameworkQuery = `
      SELECT 
        f.*,
        COUNT(c.id) as total_controls,
        COUNT(CASE WHEN c.status = 'passed' THEN 1 END) as passed_controls,
        COUNT(CASE WHEN c.status = 'failed' THEN 1 END) as failed_controls,
        COUNT(CASE WHEN c.status = 'not_configured' THEN 1 END) as not_configured_controls
      FROM compliance_frameworks f
      LEFT JOIN controls c ON f.id = c.framework_id
      WHERE f.is_active = true
    `;

    const params: any[] = [];
    if (frameworkIds.length > 0) {
      frameworkQuery += ` AND f.id = ANY($1)`;
      params.push(frameworkIds);
    }

    frameworkQuery += ` GROUP BY f.id ORDER BY f.name`;

    const frameworkResult = await db.query(frameworkQuery, params);

    // Get controls data
    let controlsQuery = `
      SELECT 
        c.*,
        f.name as framework_name
      FROM controls c
      JOIN compliance_frameworks f ON c.framework_id = f.id
      WHERE f.is_active = true
    `;

    if (frameworkIds.length > 0) {
      controlsQuery += ` AND f.id = ANY($1)`;
    }

    controlsQuery += ` ORDER BY f.name, c.severity, c.control_id`;

    const controlsResult = await db.query(controlsQuery, frameworkIds.length > 0 ? [frameworkIds] : []);

    // Get evidence if requested
    let evidenceData = [];
    if (includeEvidence) {
      const evidenceQuery = `
        SELECT 
          e.*,
          c.name as control_name,
          c.control_id,
          f.name as framework_name
        FROM evidence e
        JOIN controls c ON e.control_id = c.id
        JOIN compliance_frameworks f ON c.framework_id = f.id
        WHERE e.is_valid = true
        ${frameworkIds.length > 0 ? 'AND f.id = ANY($1)' : ''}
        ORDER BY e.timestamp DESC
      `;

      const evidenceResult = await db.query(evidenceQuery, frameworkIds.length > 0 ? [frameworkIds] : []);
      evidenceData = evidenceResult.rows;
    }

    const reportData = {
      title,
      generatedAt: new Date(),
      generatedBy: req.user!.name,
      frameworks: frameworkResult.rows,
      controls: controlsResult.rows,
      evidence: evidenceData,
      includeEvidence,
      includeRemediation
    };

    let reportBuffer: Buffer;
    let filename: string;
    let contentType: string;

    switch (format) {
      case ReportFormat.PDF:
        reportBuffer = await generatePDFReport(reportData);
        filename = `compliance-report-${Date.now()}.pdf`;
        contentType = 'application/pdf';
        break;

      case ReportFormat.EXCEL:
        reportBuffer = await generateExcelReport(reportData);
        filename = `compliance-report-${Date.now()}.xlsx`;
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        break;

      case ReportFormat.JSON:
        reportBuffer = Buffer.from(JSON.stringify(reportData, null, 2));
        filename = `compliance-report-${Date.now()}.json`;
        contentType = 'application/json';
        break;

      case ReportFormat.CSV:
        reportBuffer = await generateCSVReport(reportData);
        filename = `compliance-report-${Date.now()}.csv`;
        contentType = 'text/csv';
        break;

      default:
        return res.status(400).json({ error: 'Unsupported report format' });
    }

    // Log report generation
    const auditQuery = `
      INSERT INTO audit_logs (user_id, action, resource, resource_id, details, timestamp, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, $7)
    `;

    await db.query(auditQuery, [
      userId,
      'generate_report',
      'report',
      filename,
      JSON.stringify({ format, frameworkIds, includeEvidence, includeRemediation }),
      req.ip,
      req.get('User-Agent')
    ]);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(reportBuffer);

  } catch (error) {
    logger.error('Error generating report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
}));

// Get report history
router.get('/history', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const { limit = 20, offset = 0 } = req.query;

  try {
    const query = `
      SELECT 
        al.id,
        al.resource_id as filename,
        al.details,
        al.timestamp,
        u.name as generated_by,
        u.email as generated_by_email
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.action = 'generate_report'
      ORDER BY al.timestamp DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await db.query(query, [parseInt(limit as string), parseInt(offset as string)]);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM audit_logs
      WHERE action = 'generate_report'
    `;

    const countResult = await db.query(countQuery);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      success: true,
      data: result.rows.map(row => ({
        id: row.id,
        filename: row.filename,
        details: JSON.parse(row.details || '{}'),
        timestamp: row.timestamp,
        generatedBy: {
          name: row.generated_by,
          email: row.generated_by_email
        }
      })),
      pagination: {
        page: Math.floor(parseInt(offset as string) / parseInt(limit as string)) + 1,
        limit: parseInt(limit as string),
        total,
        totalPages: Math.ceil(total / parseInt(limit as string))
      }
    });

  } catch (error) {
    logger.error('Error fetching report history:', error);
    res.status(500).json({ error: 'Failed to fetch report history' });
  }
}));

// Get report templates
router.get('/templates', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const templates = [
    {
      id: 'executive-summary',
      name: 'Executive Summary',
      description: 'High-level compliance overview for executives',
      includeEvidence: false,
      includeRemediation: false,
      defaultFormat: ReportFormat.PDF
    },
    {
      id: 'detailed-technical',
      name: 'Detailed Technical Report',
      description: 'Comprehensive technical report with evidence and remediation steps',
      includeEvidence: true,
      includeRemediation: true,
      defaultFormat: ReportFormat.PDF
    },
    {
      id: 'audit-ready',
      name: 'Audit-Ready Report',
      description: 'Complete report suitable for external auditors',
      includeEvidence: true,
      includeRemediation: true,
      defaultFormat: ReportFormat.PDF
    },
    {
      id: 'controls-matrix',
      name: 'Controls Matrix',
      description: 'Spreadsheet matrix of all controls and their status',
      includeEvidence: false,
      includeRemediation: false,
      defaultFormat: ReportFormat.EXCEL
    }
  ];

  res.json({
    success: true,
    data: templates
  });
}));

// Generate report from template
router.post('/templates/:templateId/generate', requireComplianceOfficer, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { templateId } = req.params;
  const { frameworkIds = [] } = req.body;

  // Define template configurations
  const templateConfigs = {
    'executive-summary': {
      title: 'Executive Compliance Summary',
      includeEvidence: false,
      includeRemediation: false,
      format: ReportFormat.PDF
    },
    'detailed-technical': {
      title: 'Detailed Technical Compliance Report',
      includeEvidence: true,
      includeRemediation: true,
      format: ReportFormat.PDF
    },
    'audit-ready': {
      title: 'Audit-Ready Compliance Report',
      includeEvidence: true,
      includeRemediation: true,
      format: ReportFormat.PDF
    },
    'controls-matrix': {
      title: 'Controls Compliance Matrix',
      includeEvidence: false,
      includeRemediation: false,
      format: ReportFormat.EXCEL
    }
  };

  const config = templateConfigs[templateId as keyof typeof templateConfigs];
  if (!config) {
    return res.status(404).json({ error: 'Template not found' });
  }

  // Forward to generate endpoint with template configuration
  req.body = {
    ...config,
    frameworkIds
  };

  // Call the generate report logic (reuse the same logic)
  return router.stack.find(layer => layer.route?.path === '/generate')?.route?.stack[0]?.handle(req, res);
}));

// Generate PDF report
async function generatePDFReport(data: any): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // US Letter size
  const { width, height } = page.getSize();

  // Title
  page.drawText(data.title, {
    x: 50,
    y: height - 50,
    size: 20,
    color: rgb(0, 0, 0)
  });

  // Metadata
  let yPosition = height - 100;
  page.drawText(`Generated: ${data.generatedAt.toLocaleString()}`, {
    x: 50,
    y: yPosition,
    size: 12,
    color: rgb(0.5, 0.5, 0.5)
  });

  yPosition -= 20;
  page.drawText(`Generated by: ${data.generatedBy}`, {
    x: 50,
    y: yPosition,
    size: 12,
    color: rgb(0.5, 0.5, 0.5)
  });

  // Framework summary
  yPosition -= 40;
  page.drawText('Compliance Summary', {
    x: 50,
    y: yPosition,
    size: 16,
    color: rgb(0, 0, 0)
  });

  for (const framework of data.frameworks) {
    yPosition -= 30;
    const compliancePercentage = framework.total_controls > 0 
      ? Math.round((framework.passed_controls / framework.total_controls) * 100)
      : 0;

    page.drawText(`${framework.name}: ${compliancePercentage}% (${framework.passed_controls}/${framework.total_controls})`, {
      x: 70,
      y: yPosition,
      size: 12,
      color: rgb(0, 0, 0)
    });
  }

  return Buffer.from(await pdfDoc.save());
}

// Generate Excel report
async function generateExcelReport(data: any): Promise<Buffer> {
  const workbook = XLSX.utils.book_new();

  // Summary sheet
  const summaryData = [
    ['Framework', 'Total Controls', 'Passed', 'Failed', 'Not Configured', 'Compliance %'],
    ...data.frameworks.map((f: any) => [
      f.name,
      f.total_controls || 0,
      f.passed_controls || 0,
      f.failed_controls || 0,
      f.not_configured_controls || 0,
      f.total_controls > 0 ? Math.round((f.passed_controls / f.total_controls) * 100) : 0
    ])
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  // Controls sheet
  const controlsData = [
    ['Framework', 'Control ID', 'Name', 'Category', 'Severity', 'Status', 'Last Checked'],
    ...data.controls.map((c: any) => [
      c.framework_name,
      c.control_id,
      c.name,
      c.category,
      c.severity,
      c.status,
      c.last_checked ? new Date(c.last_checked).toLocaleDateString() : 'Never'
    ])
  ];

  const controlsSheet = XLSX.utils.aoa_to_sheet(controlsData);
  XLSX.utils.book_append_sheet(workbook, controlsSheet, 'Controls');

  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}

// Generate CSV report
async function generateCSVReport(data: any): Promise<Buffer> {
  const headers = ['Framework', 'Control ID', 'Name', 'Category', 'Severity', 'Status', 'Last Checked'];
  const rows = data.controls.map((c: any) => [
    c.framework_name,
    c.control_id,
    c.name,
    c.category,
    c.severity,
    c.status,
    c.last_checked ? new Date(c.last_checked).toLocaleDateString() : 'Never'
  ]);

  const csvContent = [headers, ...rows]
    .map(row => row.map(field => `"${field}"`).join(','))
    .join('\n');

  return Buffer.from(csvContent);
}

export default router;