import { Request } from 'express';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

export enum UserRole {
  ADMIN = 'admin',
  COMPLIANCE_OFFICER = 'compliance_officer',
  VIEWER = 'viewer'
}

export interface AuthenticatedRequest extends Request {
  user?: User;
}

export interface ComplianceFramework {
  id: string;
  name: string;
  version: string;
  description: string;
  category: string;
  isActive: boolean;
  controls: Control[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Control {
  id: string;
  frameworkId: string;
  controlId: string;
  name: string;
  description: string;
  category: string;
  severity: ControlSeverity;
  status: ControlStatus;
  implementationStatus: ImplementationStatus;
  lastChecked: Date;
  evidence?: Evidence[];
  remediationSteps?: string[];
  automatedRemediation: boolean;
  manualConfirmation: boolean;
  relatedSettings?: EntraSettings[];
}

export enum ControlSeverity {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low'
}

export enum ControlStatus {
  PASSED = 'passed',
  FAILED = 'failed',
  NOT_CONFIGURED = 'not_configured',
  MANUAL_REVIEW = 'manual_review',
  EXCLUDED = 'excluded'
}

export enum ImplementationStatus {
  IMPLEMENTED = 'implemented',
  PARTIALLY_IMPLEMENTED = 'partially_implemented',
  NOT_IMPLEMENTED = 'not_implemented',
  NOT_APPLICABLE = 'not_applicable'
}

export interface Evidence {
  id: string;
  controlId: string;
  type: EvidenceType;
  source: string;
  data: any;
  timestamp: Date;
  isValid: boolean;
}

export enum EvidenceType {
  CONFIGURATION = 'configuration',
  LOG = 'log',
  POLICY = 'policy',
  MANUAL = 'manual',
  SCREENSHOT = 'screenshot'
}

export interface EntraSettings {
  id: string;
  settingPath: string;
  currentValue: any;
  recommendedValue: any;
  description: string;
  category: string;
  lastUpdated: Date;
}

export interface ComplianceAssessment {
  id: string;
  frameworkId: string;
  userId: string;
  startDate: Date;
  endDate?: Date;
  status: AssessmentStatus;
  overallScore: number;
  totalControls: number;
  passedControls: number;
  failedControls: number;
  notConfiguredControls: number;
  results: AssessmentResult[];
}

export enum AssessmentStatus {
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface AssessmentResult {
  controlId: string;
  status: ControlStatus;
  score: number;
  findings: string[];
  recommendations: string[];
  evidence: Evidence[];
}

export interface DashboardMetrics {
  totalFrameworks: number;
  activeFrameworks: number;
  overallComplianceScore: number;
  totalControls: number;
  passedControls: number;
  failedControls: number;
  notConfiguredControls: number;
  recentAssessments: ComplianceAssessment[];
  topRisks: RiskItem[];
  complianceTrends: ComplianceTrend[];
}

export interface RiskItem {
  controlId: string;
  controlName: string;
  framework: string;
  severity: ControlSeverity;
  status: ControlStatus;
  daysSinceDetection: number;
}

export interface ComplianceTrend {
  date: Date;
  score: number;
  framework: string;
}

export interface ReportConfig {
  id: string;
  name: string;
  frameworks: string[];
  includeEvidence: boolean;
  includeRemediation: boolean;
  format: ReportFormat;
  schedule?: ReportSchedule;
  recipients: string[];
  createdBy: string;
  createdAt: Date;
}

export enum ReportFormat {
  PDF = 'pdf',
  EXCEL = 'excel',
  JSON = 'json',
  CSV = 'csv'
}

export interface ReportSchedule {
  frequency: ScheduleFrequency;
  dayOfWeek?: number;
  dayOfMonth?: number;
  hour: number;
  timezone: string;
}

export enum ScheduleFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly'
}

export interface NotificationConfig {
  id: string;
  userId: string;
  type: NotificationType;
  enabled: boolean;
  channels: NotificationChannel[];
  conditions: NotificationCondition[];
}

export enum NotificationType {
  COMPLIANCE_ALERT = 'compliance_alert',
  ASSESSMENT_COMPLETE = 'assessment_complete',
  REMEDIATION_REQUIRED = 'remediation_required',
  WEEKLY_DIGEST = 'weekly_digest'
}

export enum NotificationChannel {
  EMAIL = 'email',
  TEAMS = 'teams',
  WEBHOOK = 'webhook'
}

export interface NotificationCondition {
  field: string;
  operator: string;
  value: any;
}

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  resource: string;
  resourceId: string;
  details: any;
  timestamp: Date;
  ipAddress: string;
  userAgent: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}