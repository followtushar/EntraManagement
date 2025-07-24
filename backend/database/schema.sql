-- Entra Management App Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'viewer',
    tenant_id VARCHAR(255) NOT NULL,
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Compliance frameworks table
CREATE TABLE compliance_frameworks (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Controls table
CREATE TABLE controls (
    id VARCHAR(255) PRIMARY KEY,
    framework_id VARCHAR(255) NOT NULL REFERENCES compliance_frameworks(id),
    control_id VARCHAR(100) NOT NULL,
    name VARCHAR(500) NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'medium',
    status VARCHAR(50) NOT NULL DEFAULT 'not_configured',
    implementation_status VARCHAR(50) NOT NULL DEFAULT 'not_implemented',
    last_checked TIMESTAMP WITH TIME ZONE,
    automated_remediation BOOLEAN DEFAULT false,
    manual_confirmation BOOLEAN DEFAULT false,
    remediation_steps JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(framework_id, control_id)
);

-- Evidence table
CREATE TABLE evidence (
    id VARCHAR(255) PRIMARY KEY,
    control_id VARCHAR(255) NOT NULL REFERENCES controls(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    source VARCHAR(255) NOT NULL,
    data JSONB NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_valid BOOLEAN DEFAULT true
);

-- Compliance assessments table
CREATE TABLE compliance_assessments (
    id VARCHAR(255) PRIMARY KEY,
    framework_id VARCHAR(255) NOT NULL REFERENCES compliance_frameworks(id),
    user_id VARCHAR(255) NOT NULL REFERENCES users(id),
    start_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    end_date TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) NOT NULL DEFAULT 'in_progress',
    overall_score DECIMAL(5,2) DEFAULT 0,
    total_controls INTEGER DEFAULT 0,
    passed_controls INTEGER DEFAULT 0,
    failed_controls INTEGER DEFAULT 0,
    not_configured_controls INTEGER DEFAULT 0,
    results JSONB DEFAULT '[]'
);

-- Notification configurations table
CREATE TABLE notification_configs (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    enabled BOOLEAN DEFAULT true,
    channels JSONB DEFAULT '[]',
    conditions JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, type)
);

-- Notification logs table
CREATE TABLE notification_logs (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    recipients JSONB NOT NULL,
    subject VARCHAR(500),
    status VARCHAR(20) NOT NULL,
    error TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Audit logs table
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(100) NOT NULL,
    resource_id VARCHAR(255),
    details JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ip_address INET,
    user_agent TEXT
);

-- Entra settings table (for caching Entra ID configurations)
CREATE TABLE entra_settings (
    id VARCHAR(255) PRIMARY KEY,
    setting_path VARCHAR(500) NOT NULL,
    current_value JSONB,
    recommended_value JSONB,
    description TEXT,
    category VARCHAR(100),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(setting_path)
);

-- Indexes for better performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_controls_framework_id ON controls(framework_id);
CREATE INDEX idx_controls_status ON controls(status);
CREATE INDEX idx_controls_severity ON controls(severity);
CREATE INDEX idx_evidence_control_id ON evidence(control_id);
CREATE INDEX idx_evidence_timestamp ON evidence(timestamp);
CREATE INDEX idx_assessments_framework_id ON compliance_assessments(framework_id);
CREATE INDEX idx_assessments_user_id ON compliance_assessments(user_id);
CREATE INDEX idx_assessments_start_date ON compliance_assessments(start_date);
CREATE INDEX idx_notification_configs_user_id ON notification_configs(user_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);

-- Insert default compliance frameworks
INSERT INTO compliance_frameworks (id, name, version, description, category) VALUES
('nist-sp-800-53', 'NIST SP 800-53', 'Rev 5', 'Security and Privacy Controls for Federal Information Systems and Organizations', 'Security'),
('cis-microsoft-365', 'CIS Microsoft 365', 'v1.4.0', 'CIS Controls for Microsoft 365', 'Security'),
('iso-27001', 'ISO/IEC 27001', '2013', 'Information Security Management Systems', 'Security'),
('gdpr', 'GDPR', '2018', 'General Data Protection Regulation', 'Privacy'),
('hipaa', 'HIPAA', '2013', 'Health Insurance Portability and Accountability Act', 'Healthcare');

-- Insert sample NIST SP 800-53 controls
INSERT INTO controls (id, framework_id, control_id, name, description, category, severity, automated_remediation) VALUES
('nist-ac-1', 'nist-sp-800-53', 'AC-1', 'Access Control Policy and Procedures', 'Develop, document, and disseminate access control policy and procedures', 'access_control', 'high', false),
('nist-ac-2', 'nist-sp-800-53', 'AC-2', 'Account Management', 'Manage information system accounts', 'access_control', 'high', true),
('nist-ac-3', 'nist-sp-800-53', 'AC-3', 'Access Enforcement', 'Enforce approved authorizations for logical access', 'access_control', 'critical', true),
('nist-ac-6', 'nist-sp-800-53', 'AC-6', 'Least Privilege', 'Employ the principle of least privilege', 'access_control', 'high', true),
('nist-ac-7', 'nist-sp-800-53', 'AC-7', 'Unsuccessful Logon Attempts', 'Enforce a limit on consecutive invalid logon attempts', 'access_control', 'medium', true),
('nist-ia-2', 'nist-sp-800-53', 'IA-2', 'Identification and Authentication', 'Uniquely identify and authenticate organizational users', 'identity_authentication', 'critical', true),
('nist-ia-5', 'nist-sp-800-53', 'IA-5', 'Authenticator Management', 'Manage information system authenticators', 'identity_authentication', 'high', true),
('nist-sc-7', 'nist-sp-800-53', 'SC-7', 'Boundary Protection', 'Monitor, control, and protect organizational communications', 'system_communications', 'high', false);

-- Insert sample CIS Microsoft 365 controls
INSERT INTO controls (id, framework_id, control_id, name, description, category, severity, automated_remediation) VALUES
('cis-1-1', 'cis-microsoft-365', '1.1', 'Ensure modern authentication for Exchange Online is enabled', 'Modern authentication should be enabled for Exchange Online', 'authentication', 'high', true),
('cis-1-2', 'cis-microsoft-365', '1.2', 'Ensure multifactor authentication is enabled for all users', 'MFA should be enabled for all users in the organization', 'mfa', 'critical', true),
('cis-2-1', 'cis-microsoft-365', '2.1', 'Ensure Security Defaults is enabled', 'Security Defaults should be enabled to provide baseline security', 'conditional_access', 'high', true),
('cis-3-1', 'cis-microsoft-365', '3.1', 'Ensure password protection is enabled for Active Directory', 'Password protection should be enabled to prevent weak passwords', 'password_policy', 'medium', true),
('cis-4-1', 'cis-microsoft-365', '4.1', 'Ensure privileged users are managed in Privileged Identity Management', 'Privileged users should be managed through PIM', 'privileged_access', 'critical', false);

-- Create a system user for automated processes
INSERT INTO users (id, email, name, role, tenant_id) VALUES
('system-user', 'system@automated.check', 'System User', 'admin', 'system');

-- Create triggers for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_frameworks_updated_at BEFORE UPDATE ON compliance_frameworks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_controls_updated_at BEFORE UPDATE ON controls
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_configs_updated_at BEFORE UPDATE ON notification_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();