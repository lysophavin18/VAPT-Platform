-- VAPT Platform - Production Database Schema
-- Designed by VINNZz
-- Version: 2.0

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- ENUM TYPES
-- ============================================

CREATE TYPE user_role AS ENUM ('admin', 'manager', 'analyst', 'viewer');
CREATE TYPE project_type AS ENUM ('web_application', 'api', 'mobile', 'network', 'cloud', 'iot');
CREATE TYPE project_status AS ENUM ('draft', 'active', 'paused', 'completed', 'archived');
CREATE TYPE target_type AS ENUM ('ip', 'cidr', 'domain', 'url', 'api_endpoint');
CREATE TYPE scan_type AS ENUM ('web', 'api', 'network');
CREATE TYPE scan_profile AS ENUM ('quick', 'full', 'aggressive', 'custom');
CREATE TYPE scan_status AS ENUM ('pending', 'pending_approval', 'approved', 'rejected', 'queued', 'running', 'paused', 'completed', 'failed', 'cancelled');
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE severity AS ENUM ('critical', 'high', 'medium', 'low', 'info');
CREATE TYPE vuln_status AS ENUM ('open', 'confirmed', 'false_positive', 'accepted_risk', 'remediated', 'verified');
CREATE TYPE report_type AS ENUM ('executive', 'technical', 'compliance', 'full');
CREATE TYPE report_format AS ENUM ('pdf', 'html', 'docx', 'json');
CREATE TYPE audit_action AS ENUM ('create', 'update', 'delete', 'login', 'logout', 'login_failed', 'scan_start', 'scan_stop', 'scan_approve', 'scan_reject', 'report_generate', 'report_download', 'config_change', 'permission_change');

-- ============================================
-- USERS TABLE
-- ============================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'analyst',
    is_active BOOLEAN DEFAULT TRUE,
    is_verified BOOLEAN DEFAULT FALSE,
    mfa_enabled BOOLEAN DEFAULT FALSE,
    mfa_secret VARCHAR(255),
    last_login TIMESTAMPTZ,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMPTZ,
    password_changed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ============================================
-- PROJECTS TABLE
-- ============================================

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    project_type project_type NOT NULL,
    status project_status DEFAULT 'active',
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    scope_document TEXT,
    rules_of_engagement TEXT,
    client_name VARCHAR(255),
    client_contact VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_owner ON projects(owner_id);

-- ============================================
-- TARGETS TABLE
-- ============================================

CREATE TABLE targets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    target_type target_type NOT NULL,
    host VARCHAR(255),
    port INTEGER,
    url VARCHAR(2048),
    ip_address VARCHAR(45),
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    last_scanned TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_targets_project ON targets(project_id);
CREATE INDEX idx_targets_type ON targets(target_type);

-- ============================================
-- SCANS TABLE
-- ============================================

CREATE TABLE scans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    target_id UUID NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
    scan_type scan_type NOT NULL,
    scan_profile scan_profile DEFAULT 'quick',
    enabled_tools JSONB DEFAULT '[]',
    tool_options JSONB DEFAULT '{}',
    status scan_status DEFAULT 'pending',
    approval_status approval_status,
    approval_reason TEXT,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    celery_task_id VARCHAR(255),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    results JSONB DEFAULT '{}',
    risk_score INTEGER,
    vuln_count_critical INTEGER DEFAULT 0,
    vuln_count_high INTEGER DEFAULT 0,
    vuln_count_medium INTEGER DEFAULT 0,
    vuln_count_low INTEGER DEFAULT 0,
    vuln_count_info INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scans_project ON scans(project_id);
CREATE INDEX idx_scans_status ON scans(status);
CREATE INDEX idx_scans_created_by ON scans(created_by);
CREATE INDEX idx_scans_created_at ON scans(created_at);

-- ============================================
-- SCAN RESULTS TABLE
-- ============================================

CREATE TABLE scan_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    tool_name VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    raw_output TEXT,
    parsed_output JSONB DEFAULT '{}',
    findings_count INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scan_results_scan ON scan_results(scan_id);
CREATE INDEX idx_scan_results_tool ON scan_results(tool_name);

-- ============================================
-- VULNERABILITIES TABLE
-- ============================================

CREATE TABLE vulnerabilities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    severity severity NOT NULL,
    status vuln_status DEFAULT 'open',
    cve_id VARCHAR(50),
    cwe_id VARCHAR(50),
    cvss_score FLOAT,
    cvss_vector VARCHAR(100),
    affected_url VARCHAR(2048),
    affected_parameter VARCHAR(255),
    affected_component VARCHAR(255),
    remediation TEXT,
    proof_of_concept TEXT,
    references TEXT[],
    tags TEXT[],
    found_by_tool VARCHAR(50),
    template_id VARCHAR(255),
    exploit_available BOOLEAN DEFAULT FALSE,
    exploit_module VARCHAR(255),
    verified BOOLEAN DEFAULT FALSE,
    verified_by UUID REFERENCES users(id),
    verified_at TIMESTAMPTZ,
    false_positive BOOLEAN DEFAULT FALSE,
    false_positive_reason TEXT,
    business_impact TEXT,
    likelihood VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vulns_scan ON vulnerabilities(scan_id);
CREATE INDEX idx_vulns_project ON vulnerabilities(project_id);
CREATE INDEX idx_vulns_severity ON vulnerabilities(severity);
CREATE INDEX idx_vulns_status ON vulnerabilities(status);
CREATE INDEX idx_vulns_cve ON vulnerabilities(cve_id);

-- ============================================
-- REPORTS TABLE
-- ============================================

CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    report_type report_type NOT NULL,
    format report_format NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    file_path VARCHAR(500),
    file_size INTEGER,
    include_executive_summary BOOLEAN DEFAULT TRUE,
    include_technical_details BOOLEAN DEFAULT TRUE,
    include_remediation BOOLEAN DEFAULT TRUE,
    include_poc BOOLEAN DEFAULT FALSE,
    severity_filter TEXT[],
    generated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reports_project ON reports(project_id);
CREATE INDEX idx_reports_type ON reports(report_type);

-- ============================================
-- SCHEDULED SCANS TABLE
-- ============================================

CREATE TABLE scheduled_scans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    target_id UUID NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
    scan_type scan_type NOT NULL,
    scan_profile scan_profile DEFAULT 'quick',
    enabled_tools JSONB DEFAULT '[]',
    cron_expression VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_run TIMESTAMPTZ,
    next_run TIMESTAMPTZ,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scheduled_scans_project ON scheduled_scans(project_id);
CREATE INDEX idx_scheduled_scans_active ON scheduled_scans(is_active);

-- ============================================
-- AUDIT LOGS TABLE
-- ============================================

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action audit_action NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    old_value JSONB,
    new_value JSONB,
    ip_address VARCHAR(45),
    user_agent VARCHAR(500),
    session_id VARCHAR(100),
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);

-- ============================================
-- TOOL CONFIGS TABLE
-- ============================================

CREATE TABLE tool_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tool_name VARCHAR(50) UNIQUE NOT NULL,
    is_enabled BOOLEAN DEFAULT TRUE,
    default_options JSONB DEFAULT '{}',
    timeout_seconds INTEGER DEFAULT 3600,
    rate_limit INTEGER,
    max_concurrent INTEGER DEFAULT 5,
    requires_approval BOOLEAN DEFAULT FALSE,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES users(id)
);

-- ============================================
-- SYSTEM CONFIG TABLE
-- ============================================

CREATE TABLE system_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES users(id)
);

-- ============================================
-- TRIGGERS FOR updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_targets_updated_at
    BEFORE UPDATE ON targets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scans_updated_at
    BEFORE UPDATE ON scans
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vulnerabilities_updated_at
    BEFORE UPDATE ON vulnerabilities
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reports_updated_at
    BEFORE UPDATE ON reports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- DEFAULT DATA
-- ============================================

-- Default admin user (password: AdminSecure2024!)
INSERT INTO users (id, email, hashed_password, full_name, role, is_active, is_verified) VALUES
(uuid_generate_v4(), 'admin@vapt.local', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.aTQ0MvU9zZTtWW', 'System Administrator', 'admin', TRUE, TRUE);

-- Default tool configurations
INSERT INTO tool_configs (tool_name, is_enabled, timeout_seconds, rate_limit, max_concurrent, requires_approval, description) VALUES
('nmap', TRUE, 1800, NULL, 10, FALSE, 'Network mapper for host discovery and port scanning'),
('nikto', TRUE, 3600, NULL, 5, FALSE, 'Web server vulnerability scanner'),
('gobuster', TRUE, 1800, 100, 5, FALSE, 'Directory and file brute-forcing'),
('dirb', TRUE, 1800, 100, 5, FALSE, 'Directory brute-forcing'),
('nuclei', TRUE, 1800, NULL, 10, FALSE, 'Template-based vulnerability scanner'),
('katana', TRUE, 1200, NULL, 5, FALSE, 'Web crawler and spider'),
('wpscan', TRUE, 1800, NULL, 3, FALSE, 'WordPress vulnerability scanner'),
('sqlmap', TRUE, 3600, 50, 3, FALSE, 'SQL injection testing'),
('hydra', TRUE, 600, 10, 2, TRUE, 'Brute-force credential testing'),
('zap', TRUE, 3600, NULL, 2, FALSE, 'OWASP ZAP DAST scanner'),
('newman', TRUE, 600, NULL, 5, FALSE, 'Postman/Newman API testing'),
('metasploit', TRUE, 300, NULL, 1, TRUE, 'Exploit matching (simulation only)');

-- Default system configuration
INSERT INTO system_config (key, value, description) VALUES
('max_concurrent_scans', '5', 'Maximum number of concurrent scans allowed'),
('scan_timeout_seconds', '7200', 'Default scan timeout in seconds'),
('require_approval_aggressive', 'true', 'Require manager approval for aggressive scans'),
('require_approval_external', 'true', 'Require approval for external target scans'),
('password_min_length', '12', 'Minimum password length'),
('session_timeout_minutes', '30', 'Session timeout in minutes'),
('max_login_attempts', '5', 'Maximum failed login attempts before lockout'),
('lockout_duration_minutes', '30', 'Account lockout duration'),
('audit_log_retention_days', '365', 'Days to retain audit logs'),
('report_retention_days', '180', 'Days to retain generated reports');

-- ============================================
-- VIEWS FOR REPORTING
-- ============================================

CREATE OR REPLACE VIEW v_scan_summary AS
SELECT 
    s.id AS scan_id,
    p.name AS project_name,
    t.name AS target_name,
    t.host AS target_host,
    s.scan_type,
    s.scan_profile,
    s.status,
    s.risk_score,
    s.vuln_count_critical,
    s.vuln_count_high,
    s.vuln_count_medium,
    s.vuln_count_low,
    s.vuln_count_info,
    (s.vuln_count_critical + s.vuln_count_high + s.vuln_count_medium + s.vuln_count_low + s.vuln_count_info) AS total_vulns,
    u.full_name AS created_by_name,
    s.started_at,
    s.completed_at,
    s.duration_seconds
FROM scans s
JOIN projects p ON s.project_id = p.id
JOIN targets t ON s.target_id = t.id
JOIN users u ON s.created_by = u.id;

CREATE OR REPLACE VIEW v_vulnerability_overview AS
SELECT 
    v.id AS vuln_id,
    p.name AS project_name,
    v.title,
    v.severity,
    v.status,
    v.cve_id,
    v.cvss_score,
    v.found_by_tool,
    v.exploit_available,
    v.verified,
    v.created_at
FROM vulnerabilities v
JOIN projects p ON v.project_id = p.id
ORDER BY 
    CASE v.severity 
        WHEN 'critical' THEN 1 
        WHEN 'high' THEN 2 
        WHEN 'medium' THEN 3 
        WHEN 'low' THEN 4 
        ELSE 5 
    END;

-- ============================================
-- CREDIT: Designed by VINNZz
-- Production-Ready VAPT Platform v2.0
-- ============================================
