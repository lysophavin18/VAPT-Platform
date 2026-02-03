"""
VAPT Platform - Enhanced Database Models
Production-Ready with Audit Logging, RBAC, and Approval Workflow
Designed by VINNZz
"""
import uuid
from datetime import datetime
from typing import Optional, List
from sqlalchemy import (
    Column, String, Text, Boolean, Integer, Float, DateTime, 
    ForeignKey, Enum as SQLEnum, JSON, Index, event
)
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
from sqlalchemy.orm import relationship, declarative_base
from sqlalchemy.sql import func
import enum

Base = declarative_base()


# ============================================
# ENUMS
# ============================================

class UserRole(str, enum.Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    ANALYST = "analyst"
    VIEWER = "viewer"


class ProjectType(str, enum.Enum):
    WEB_APPLICATION = "web_application"
    API = "api"
    MOBILE = "mobile"
    NETWORK = "network"
    CLOUD = "cloud"
    IOT = "iot"


class ProjectStatus(str, enum.Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class TargetType(str, enum.Enum):
    IP = "ip"
    CIDR = "cidr"
    DOMAIN = "domain"
    URL = "url"
    API_ENDPOINT = "api_endpoint"


class ScanType(str, enum.Enum):
    WEB = "web"
    API = "api"
    NETWORK = "network"


class ScanProfile(str, enum.Enum):
    QUICK = "quick"
    FULL = "full"
    AGGRESSIVE = "aggressive"
    CUSTOM = "custom"


class ScanStatus(str, enum.Enum):
    PENDING = "pending"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    QUEUED = "queued"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ApprovalStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class Severity(str, enum.Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class VulnStatus(str, enum.Enum):
    OPEN = "open"
    CONFIRMED = "confirmed"
    FALSE_POSITIVE = "false_positive"
    ACCEPTED_RISK = "accepted_risk"
    REMEDIATED = "remediated"
    VERIFIED = "verified"


class ReportType(str, enum.Enum):
    EXECUTIVE = "executive"
    TECHNICAL = "technical"
    COMPLIANCE = "compliance"
    FULL = "full"


class ReportFormat(str, enum.Enum):
    PDF = "pdf"
    HTML = "html"
    DOCX = "docx"
    JSON = "json"


class AuditAction(str, enum.Enum):
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    LOGIN = "login"
    LOGOUT = "logout"
    LOGIN_FAILED = "login_failed"
    SCAN_START = "scan_start"
    SCAN_STOP = "scan_stop"
    SCAN_APPROVE = "scan_approve"
    SCAN_REJECT = "scan_reject"
    REPORT_GENERATE = "report_generate"
    REPORT_DOWNLOAD = "report_download"
    CONFIG_CHANGE = "config_change"
    PERMISSION_CHANGE = "permission_change"


# ============================================
# MODELS
# ============================================

class User(Base):
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(SQLEnum(UserRole), default=UserRole.ANALYST, nullable=False)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    mfa_enabled = Column(Boolean, default=False)
    mfa_secret = Column(String(255), nullable=True)
    last_login = Column(DateTime(timezone=True), nullable=True)
    failed_login_attempts = Column(Integer, default=0)
    locked_until = Column(DateTime(timezone=True), nullable=True)
    password_changed_at = Column(DateTime(timezone=True), default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    projects = relationship("Project", back_populates="owner")
    scans_created = relationship("Scan", back_populates="created_by_user", foreign_keys="Scan.created_by")
    scans_approved = relationship("Scan", back_populates="approved_by_user", foreign_keys="Scan.approved_by")
    audit_logs = relationship("AuditLog", back_populates="user")
    
    __table_args__ = (
        Index('idx_users_email', 'email'),
        Index('idx_users_role', 'role'),
    )


class Project(Base):
    __tablename__ = "projects"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    project_type = Column(SQLEnum(ProjectType), nullable=False)
    status = Column(SQLEnum(ProjectStatus), default=ProjectStatus.ACTIVE)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    start_date = Column(DateTime(timezone=True), nullable=True)
    end_date = Column(DateTime(timezone=True), nullable=True)
    scope_document = Column(Text, nullable=True)  # Authorized scope
    rules_of_engagement = Column(Text, nullable=True)
    client_name = Column(String(255), nullable=True)
    client_contact = Column(String(255), nullable=True)
    metadata = Column(JSONB, default={})
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    owner = relationship("User", back_populates="projects")
    targets = relationship("Target", back_populates="project", cascade="all, delete-orphan")
    scans = relationship("Scan", back_populates="project", cascade="all, delete-orphan")
    vulnerabilities = relationship("Vulnerability", back_populates="project", cascade="all, delete-orphan")
    reports = relationship("Report", back_populates="project", cascade="all, delete-orphan")
    
    __table_args__ = (
        Index('idx_projects_status', 'status'),
        Index('idx_projects_owner', 'owner_id'),
    )


class Target(Base):
    __tablename__ = "targets"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    name = Column(String(255), nullable=False)
    target_type = Column(SQLEnum(TargetType), nullable=False)
    host = Column(String(255), nullable=True)
    port = Column(Integer, nullable=True)
    url = Column(String(2048), nullable=True)
    ip_address = Column(String(45), nullable=True)  # IPv6 compatible
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    verified = Column(Boolean, default=False)
    verified_at = Column(DateTime(timezone=True), nullable=True)
    last_scanned = Column(DateTime(timezone=True), nullable=True)
    metadata = Column(JSONB, default={})
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    project = relationship("Project", back_populates="targets")
    scans = relationship("Scan", back_populates="target")
    
    __table_args__ = (
        Index('idx_targets_project', 'project_id'),
        Index('idx_targets_type', 'target_type'),
    )


class Scan(Base):
    __tablename__ = "scans"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    target_id = Column(UUID(as_uuid=True), ForeignKey("targets.id"), nullable=False)
    
    # Scan configuration
    scan_type = Column(SQLEnum(ScanType), nullable=False)
    scan_profile = Column(SQLEnum(ScanProfile), default=ScanProfile.QUICK)
    enabled_tools = Column(JSONB, default=[])  # List of enabled tool names
    tool_options = Column(JSONB, default={})  # Tool-specific options
    
    # Status and workflow
    status = Column(SQLEnum(ScanStatus), default=ScanStatus.PENDING)
    approval_status = Column(SQLEnum(ApprovalStatus), nullable=True)
    approval_reason = Column(Text, nullable=True)
    
    # User tracking
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    approved_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    
    # Execution details
    celery_task_id = Column(String(255), nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    
    # Results
    results = Column(JSONB, default={})
    risk_score = Column(Integer, nullable=True)
    vuln_count_critical = Column(Integer, default=0)
    vuln_count_high = Column(Integer, default=0)
    vuln_count_medium = Column(Integer, default=0)
    vuln_count_low = Column(Integer, default=0)
    vuln_count_info = Column(Integer, default=0)
    
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    project = relationship("Project", back_populates="scans")
    target = relationship("Target", back_populates="scans")
    created_by_user = relationship("User", back_populates="scans_created", foreign_keys=[created_by])
    approved_by_user = relationship("User", back_populates="scans_approved", foreign_keys=[approved_by])
    vulnerabilities = relationship("Vulnerability", back_populates="scan", cascade="all, delete-orphan")
    scan_results = relationship("ScanResult", back_populates="scan", cascade="all, delete-orphan")
    
    __table_args__ = (
        Index('idx_scans_project', 'project_id'),
        Index('idx_scans_status', 'status'),
        Index('idx_scans_created_by', 'created_by'),
        Index('idx_scans_created_at', 'created_at'),
    )


class ScanResult(Base):
    """Individual tool results for a scan"""
    __tablename__ = "scan_results"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scan_id = Column(UUID(as_uuid=True), ForeignKey("scans.id"), nullable=False)
    tool_name = Column(String(50), nullable=False)
    status = Column(String(20), default="pending")
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    raw_output = Column(Text, nullable=True)
    parsed_output = Column(JSONB, default={})
    findings_count = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    scan = relationship("Scan", back_populates="scan_results")
    
    __table_args__ = (
        Index('idx_scan_results_scan', 'scan_id'),
        Index('idx_scan_results_tool', 'tool_name'),
    )


class Vulnerability(Base):
    __tablename__ = "vulnerabilities"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scan_id = Column(UUID(as_uuid=True), ForeignKey("scans.id"), nullable=False)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    
    # Vulnerability details
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    severity = Column(SQLEnum(Severity), nullable=False)
    status = Column(SQLEnum(VulnStatus), default=VulnStatus.OPEN)
    
    # CVE/CVSS information
    cve_id = Column(String(50), nullable=True, index=True)
    cwe_id = Column(String(50), nullable=True)
    cvss_score = Column(Float, nullable=True)
    cvss_vector = Column(String(100), nullable=True)
    
    # Affected resource
    affected_url = Column(String(2048), nullable=True)
    affected_parameter = Column(String(255), nullable=True)
    affected_component = Column(String(255), nullable=True)
    
    # Details
    remediation = Column(Text, nullable=True)
    proof_of_concept = Column(Text, nullable=True)
    references = Column(ARRAY(String), default=[])
    tags = Column(ARRAY(String), default=[])
    
    # Tool information
    found_by_tool = Column(String(50), nullable=True)
    template_id = Column(String(255), nullable=True)  # For Nuclei
    
    # Exploit information
    exploit_available = Column(Boolean, default=False)
    exploit_module = Column(String(255), nullable=True)
    
    # Verification
    verified = Column(Boolean, default=False)
    verified_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    verified_at = Column(DateTime(timezone=True), nullable=True)
    false_positive = Column(Boolean, default=False)
    false_positive_reason = Column(Text, nullable=True)
    
    # Risk assessment
    business_impact = Column(Text, nullable=True)
    likelihood = Column(String(20), nullable=True)  # High/Medium/Low
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    scan = relationship("Scan", back_populates="vulnerabilities")
    project = relationship("Project", back_populates="vulnerabilities")
    
    __table_args__ = (
        Index('idx_vulns_scan', 'scan_id'),
        Index('idx_vulns_project', 'project_id'),
        Index('idx_vulns_severity', 'severity'),
        Index('idx_vulns_status', 'status'),
        Index('idx_vulns_cve', 'cve_id'),
    )


class Report(Base):
    __tablename__ = "reports"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    title = Column(String(255), nullable=False)
    report_type = Column(SQLEnum(ReportType), nullable=False)
    format = Column(SQLEnum(ReportFormat), nullable=False)
    status = Column(String(20), default="pending")
    file_path = Column(String(500), nullable=True)
    file_size = Column(Integer, nullable=True)
    
    # Content options
    include_executive_summary = Column(Boolean, default=True)
    include_technical_details = Column(Boolean, default=True)
    include_remediation = Column(Boolean, default=True)
    include_poc = Column(Boolean, default=False)
    severity_filter = Column(ARRAY(String), default=[])
    
    # Metadata
    generated_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    project = relationship("Project", back_populates="reports")
    
    __table_args__ = (
        Index('idx_reports_project', 'project_id'),
        Index('idx_reports_type', 'report_type'),
    )


class ScheduledScan(Base):
    __tablename__ = "scheduled_scans"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    target_id = Column(UUID(as_uuid=True), ForeignKey("targets.id"), nullable=False)
    scan_type = Column(SQLEnum(ScanType), nullable=False)
    scan_profile = Column(SQLEnum(ScanProfile), default=ScanProfile.QUICK)
    enabled_tools = Column(JSONB, default=[])
    cron_expression = Column(String(100), nullable=False)  # Cron format
    is_active = Column(Boolean, default=True)
    last_run = Column(DateTime(timezone=True), nullable=True)
    next_run = Column(DateTime(timezone=True), nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    __table_args__ = (
        Index('idx_scheduled_scans_project', 'project_id'),
        Index('idx_scheduled_scans_active', 'is_active'),
    )


class AuditLog(Base):
    """Comprehensive audit logging for compliance"""
    __tablename__ = "audit_logs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    action = Column(SQLEnum(AuditAction), nullable=False)
    resource_type = Column(String(50), nullable=False)  # users, projects, scans, etc.
    resource_id = Column(UUID(as_uuid=True), nullable=True)
    old_value = Column(JSONB, nullable=True)
    new_value = Column(JSONB, nullable=True)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(500), nullable=True)
    session_id = Column(String(100), nullable=True)
    success = Column(Boolean, default=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    user = relationship("User", back_populates="audit_logs")
    
    __table_args__ = (
        Index('idx_audit_logs_user', 'user_id'),
        Index('idx_audit_logs_action', 'action'),
        Index('idx_audit_logs_resource', 'resource_type', 'resource_id'),
        Index('idx_audit_logs_created', 'created_at'),
    )


class ToolConfig(Base):
    """Tool configuration settings"""
    __tablename__ = "tool_configs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tool_name = Column(String(50), unique=True, nullable=False)
    is_enabled = Column(Boolean, default=True)
    default_options = Column(JSONB, default={})
    timeout_seconds = Column(Integer, default=3600)
    rate_limit = Column(Integer, nullable=True)  # Requests per minute
    max_concurrent = Column(Integer, default=5)
    requires_approval = Column(Boolean, default=False)
    description = Column(Text, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    updated_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)


class SystemConfig(Base):
    """System-wide configuration"""
    __tablename__ = "system_config"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key = Column(String(100), unique=True, nullable=False)
    value = Column(JSONB, nullable=False)
    description = Column(Text, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    updated_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)


# ============================================
# CREDIT: Designed by VINNZz
# Production-Ready VAPT Platform v2.0
# ============================================
