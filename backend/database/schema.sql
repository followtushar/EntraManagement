-- Entra Management App Database Schema for Azure SQL Database

-- Users table
CREATE TABLE users (
    id NVARCHAR(255) PRIMARY KEY,
    email NVARCHAR(255) UNIQUE NOT NULL,
    name NVARCHAR(255) NOT NULL,
    role NVARCHAR(50) NOT NULL DEFAULT 'viewer',
    tenant_id NVARCHAR(255) NOT NULL,
    preferences NVARCHAR(MAX) DEFAULT '{}', -- JSON data stored as NVARCHAR(MAX)
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_at DATETIME2 DEFAULT GETUTCDATE()
);

-- Create index on email for performance
CREATE INDEX IX_users_email ON users(email);
CREATE INDEX IX_users_tenant_id ON users(tenant_id);

-- Compliance frameworks table
CREATE TABLE compliance_frameworks (
    id NVARCHAR(255) PRIMARY KEY,
    name NVARCHAR(255) NOT NULL,
    version NVARCHAR(50) NOT NULL,
    description NVARCHAR(MAX),
    category NVARCHAR(100) NOT NULL,
    is_active BIT DEFAULT 1,
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_at DATETIME2 DEFAULT GETUTCDATE()
);

-- Create index for performance
CREATE INDEX IX_compliance_frameworks_category ON compliance_frameworks(category);
CREATE INDEX IX_compliance_frameworks_active ON compliance_frameworks(is_active);

-- Controls table
CREATE TABLE controls (
    id NVARCHAR(255) PRIMARY KEY,
    framework_id NVARCHAR(255) NOT NULL,
    control_id NVARCHAR(100) NOT NULL,
    name NVARCHAR(500) NOT NULL,
    description NVARCHAR(MAX),
    category NVARCHAR(100) NOT NULL,
    severity NVARCHAR(20) NOT NULL DEFAULT 'medium',
    status NVARCHAR(50) NOT NULL DEFAULT 'not_configured',
    implementation_status NVARCHAR(50) NOT NULL DEFAULT 'not_implemented',
    last_checked DATETIME2,
    automated_remediation BIT DEFAULT 0,
    manual_confirmation BIT DEFAULT 0,
    remediation_steps NVARCHAR(MAX) DEFAULT '[]', -- JSON data stored as NVARCHAR(MAX)
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_at DATETIME2 DEFAULT GETUTCDATE(),
    CONSTRAINT FK_controls_framework FOREIGN KEY (framework_id) REFERENCES compliance_frameworks(id),
    CONSTRAINT UQ_controls_framework_control UNIQUE(framework_id, control_id)
);

-- Create indexes for performance
CREATE INDEX IX_controls_framework_id ON controls(framework_id);
CREATE INDEX IX_controls_status ON controls(status);
CREATE INDEX IX_controls_category ON controls(category);
CREATE INDEX IX_controls_severity ON controls(severity);

-- Evidence table
CREATE TABLE evidence (
    id NVARCHAR(255) PRIMARY KEY,
    control_id NVARCHAR(255) NOT NULL,
    type NVARCHAR(50) NOT NULL,
    source NVARCHAR(255) NOT NULL,
    data NVARCHAR(MAX) NOT NULL, -- JSON data stored as NVARCHAR(MAX)
    timestamp DATETIME2 DEFAULT GETUTCDATE(),
    is_valid BIT DEFAULT 1,
    CONSTRAINT FK_evidence_control FOREIGN KEY (control_id) REFERENCES controls(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IX_evidence_control_id ON evidence(control_id);
CREATE INDEX IX_evidence_type ON evidence(type);
CREATE INDEX IX_evidence_timestamp ON evidence(timestamp);

-- Compliance assessments table
CREATE TABLE compliance_assessments (
    id NVARCHAR(255) PRIMARY KEY,
    framework_id NVARCHAR(255) NOT NULL,
    user_id NVARCHAR(255) NOT NULL,
    start_date DATETIME2 DEFAULT GETUTCDATE(),
    end_date DATETIME2,
    status NVARCHAR(50) NOT NULL DEFAULT 'in_progress',
    overall_score DECIMAL(5,2) DEFAULT 0,
    total_controls INT DEFAULT 0,
    passed_controls INT DEFAULT 0,
    failed_controls INT DEFAULT 0,
    not_configured_controls INT DEFAULT 0,
    results NVARCHAR(MAX) DEFAULT '[]', -- JSON data stored as NVARCHAR(MAX)
    CONSTRAINT FK_assessments_framework FOREIGN KEY (framework_id) REFERENCES compliance_frameworks(id),
    CONSTRAINT FK_assessments_user FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Create indexes for performance
CREATE INDEX IX_assessments_framework_id ON compliance_assessments(framework_id);
CREATE INDEX IX_assessments_user_id ON compliance_assessments(user_id);
CREATE INDEX IX_assessments_status ON compliance_assessments(status);
CREATE INDEX IX_assessments_start_date ON compliance_assessments(start_date);

-- Notification configurations table
CREATE TABLE notification_configs (
    id NVARCHAR(255) PRIMARY KEY,
    user_id NVARCHAR(255) NOT NULL,
    type NVARCHAR(50) NOT NULL,
    enabled BIT DEFAULT 1,
    channels NVARCHAR(MAX) DEFAULT '[]', -- JSON data stored as NVARCHAR(MAX)
    conditions NVARCHAR(MAX) DEFAULT '[]', -- JSON data stored as NVARCHAR(MAX)
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_at DATETIME2 DEFAULT GETUTCDATE(),
    CONSTRAINT FK_notification_configs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT UQ_notification_configs_user_type UNIQUE(user_id, type)
);

-- Create indexes for performance
CREATE INDEX IX_notification_configs_user_id ON notification_configs(user_id);
CREATE INDEX IX_notification_configs_type ON notification_configs(type);

-- Notification logs table
CREATE TABLE notification_logs (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    type NVARCHAR(50) NOT NULL,
    recipients NVARCHAR(MAX) NOT NULL, -- JSON data stored as NVARCHAR(MAX)
    subject NVARCHAR(500),
    status NVARCHAR(20) NOT NULL,
    error NVARCHAR(MAX),
    timestamp DATETIME2 DEFAULT GETUTCDATE()
);

-- Create indexes for performance
CREATE INDEX IX_notification_logs_type ON notification_logs(type);
CREATE INDEX IX_notification_logs_status ON notification_logs(status);
CREATE INDEX IX_notification_logs_timestamp ON notification_logs(timestamp);

-- Reports table
CREATE TABLE reports (
    id NVARCHAR(255) PRIMARY KEY,
    user_id NVARCHAR(255) NOT NULL,
    framework_id NVARCHAR(255),
    assessment_id NVARCHAR(255),
    name NVARCHAR(255) NOT NULL,
    type NVARCHAR(50) NOT NULL,
    format NVARCHAR(20) NOT NULL,
    status NVARCHAR(50) NOT NULL DEFAULT 'pending',
    file_path NVARCHAR(500),
    file_size BIGINT,
    config NVARCHAR(MAX) DEFAULT '{}', -- JSON data stored as NVARCHAR(MAX)
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    completed_at DATETIME2,
    expires_at DATETIME2,
    CONSTRAINT FK_reports_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT FK_reports_framework FOREIGN KEY (framework_id) REFERENCES compliance_frameworks(id),
    CONSTRAINT FK_reports_assessment FOREIGN KEY (assessment_id) REFERENCES compliance_assessments(id)
);

-- Create indexes for performance
CREATE INDEX IX_reports_user_id ON reports(user_id);
CREATE INDEX IX_reports_framework_id ON reports(framework_id);
CREATE INDEX IX_reports_status ON reports(status);
CREATE INDEX IX_reports_created_at ON reports(created_at);

-- Audit logs table
CREATE TABLE audit_logs (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    user_id NVARCHAR(255),
    action NVARCHAR(100) NOT NULL,
    resource_type NVARCHAR(50) NOT NULL,
    resource_id NVARCHAR(255),
    details NVARCHAR(MAX), -- JSON data stored as NVARCHAR(MAX)
    ip_address NVARCHAR(45),
    user_agent NVARCHAR(500),
    timestamp DATETIME2 DEFAULT GETUTCDATE(),
    CONSTRAINT FK_audit_logs_user FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Create indexes for performance
CREATE INDEX IX_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IX_audit_logs_action ON audit_logs(action);
CREATE INDEX IX_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX IX_audit_logs_timestamp ON audit_logs(timestamp);

-- Insert sample compliance frameworks
INSERT INTO compliance_frameworks (id, name, version, description, category, is_active) VALUES
('nist-sp-800-53', 'NIST SP 800-53', 'Rev 5', 'Security and Privacy Controls for Federal Information Systems and Organizations', 'security', 1),
('cis-microsoft-365', 'CIS Microsoft 365', 'v1.4.0', 'CIS Controls for Microsoft 365', 'security', 1),
('iso-27001', 'ISO/IEC 27001', '2013', 'Information Security Management Systems', 'security', 1),
('gdpr', 'GDPR', '2018', 'General Data Protection Regulation', 'privacy', 1),
('hipaa', 'HIPAA', '2013', 'Health Insurance Portability and Accountability Act', 'healthcare', 1);

-- Insert sample controls for NIST SP 800-53
INSERT INTO controls (id, framework_id, control_id, name, description, category, severity, status, implementation_status, automated_remediation, manual_confirmation, remediation_steps) VALUES
('nist-ac-1', 'nist-sp-800-53', 'AC-1', 'Access Control Policy and Procedures', 'Develop, document, and disseminate access control policy and procedures', 'access_control', 'high', 'not_configured', 'not_implemented', 0, 1, '["Review existing access control policies", "Update policies to align with NIST guidelines", "Implement policy enforcement procedures"]'),
('nist-ac-2', 'nist-sp-800-53', 'AC-2', 'Account Management', 'Manage information system accounts including establishment, activation, modification, review, and removal', 'access_control', 'high', 'not_configured', 'not_implemented', 1, 0, '["Enable automated account provisioning", "Configure account lifecycle management", "Implement regular access reviews"]'),
('nist-ac-3', 'nist-sp-800-53', 'AC-3', 'Access Enforcement', 'Enforce approved authorizations for logical access to information and system resources', 'access_control', 'high', 'not_configured', 'not_implemented', 1, 0, '["Configure role-based access control", "Enable conditional access policies", "Implement least privilege principles"]'),
('nist-ia-2', 'nist-sp-800-53', 'IA-2', 'Identification and Authentication', 'Uniquely identify and authenticate organizational users', 'identity_authentication', 'high', 'not_configured', 'not_implemented', 1, 0, '["Enable multi-factor authentication", "Configure identity providers", "Implement strong authentication policies"]'),
('nist-ia-5', 'nist-sp-800-53', 'IA-5', 'Authenticator Management', 'Manage information system authenticators including initial authenticator distribution, renewal, and revocation', 'identity_authentication', 'medium', 'not_configured', 'not_implemented', 1, 0, '["Configure password policies", "Enable authenticator lifecycle management", "Implement certificate management"]');

-- Insert sample controls for CIS Microsoft 365
INSERT INTO controls (id, framework_id, control_id, name, description, category, severity, status, implementation_status, automated_remediation, manual_confirmation, remediation_steps) VALUES
('cis-1.1.1', 'cis-microsoft-365', '1.1.1', 'Ensure Security Defaults is disabled', 'Security Defaults should be disabled when using Conditional Access', 'identity', 'medium', 'not_configured', 'not_implemented', 1, 0, '["Navigate to Azure AD Security", "Disable Security Defaults", "Ensure Conditional Access is properly configured"]'),
('cis-1.1.3', 'cis-microsoft-365', '1.1.3', 'Ensure that between two and four global admins are designated', 'Limit the number of global administrators to reduce attack surface', 'identity', 'high', 'not_configured', 'not_implemented', 0, 1, '["Review current global admin assignments", "Remove excess global admins", "Assign appropriate admin roles instead"]'),
('cis-2.1.1', 'cis-microsoft-365', '2.1.1', 'Ensure that multi-factor authentication is enabled for all users', 'MFA should be enabled for all users to enhance security', 'authentication', 'high', 'not_configured', 'not_implemented', 1, 0, '["Configure MFA policies", "Enable per-user MFA", "Monitor MFA compliance"]'),
('cis-6.1.1', 'cis-microsoft-365', '6.1.1', 'Ensure that Microsoft 365 audit log search is Enabled', 'Audit logging should be enabled for compliance and security monitoring', 'auditing', 'medium', 'not_configured', 'not_implemented', 1, 0, '["Enable audit log search", "Configure audit retention policies", "Set up audit log monitoring"]');

-- Create a sample admin user (this would typically be created during first login)
INSERT INTO users (id, email, name, role, tenant_id, preferences) VALUES
('admin-user-1', 'admin@company.com', 'System Administrator', 'admin', 'sample-tenant-id', '{"theme": "light", "notifications": true}');

-- Create sample notification configurations
INSERT INTO notification_configs (id, user_id, type, enabled, channels, conditions) VALUES
('notif-1', 'admin-user-1', 'compliance_alert', 1, '["email"]', '{"threshold": 0.8, "frameworks": ["nist-sp-800-53", "cis-microsoft-365"]}'),
('notif-2', 'admin-user-1', 'weekly_digest', 1, '["email"]', '{"day": "monday", "time": "09:00"}');

-- Create triggers for updating updated_at columns
-- Note: SQL Server doesn't have the same trigger syntax as PostgreSQL, so we'll use a different approach
-- These would typically be implemented as stored procedures or in application code