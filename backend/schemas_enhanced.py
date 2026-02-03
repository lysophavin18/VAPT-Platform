"""
VAPT Platform - Enhanced Pydantic Schemas
Designed by VINNZz
"""
from typing import Optional, List, Any, Dict
from uuid import UUID
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field, EmailStr, validator


# ==================================================
# ENUMS
# ==================================================

class UserRole(str, Enum):
    admin = "admin"
    manager = "manager"
    analyst = "analyst"
    viewer = "viewer"


class ScanProfile(str, Enum):
    quick = "quick"
    full = "full"
    aggressive = "aggressive"
    custom = "custom"


class ScanType(str, Enum):
    web = "web"
    api = "api"
    network = "network"


class ScanStatus(str, Enum):
    pending = "pending"
    pending_approval = "pending_approval"
    approved = "approved"
    rejected = "rejected"
    queued = "queued"
    running = "running"
    paused = "paused"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class Severity(str, Enum):
    critical = "critical"
    high = "high"
    medium = "medium"
    low = "low"
    info = "info"


class VulnStatus(str, Enum):
    open = "open"
    confirmed = "confirmed"
    false_positive = "false_positive"
    accepted_risk = "accepted_risk"
    remediated = "remediated"
    verified = "verified"


# ==================================================
# BASE SCHEMAS
# ==================================================

class BaseSchema(BaseModel):
    class Config:
        from_attributes = True
        use_enum_values = True


# ==================================================
# USER SCHEMAS
# ==================================================

class UserBase(BaseSchema):
    email: EmailStr
    full_name: str
    role: UserRole = UserRole.analyst


class UserCreate(UserBase):
    password: str = Field(..., min_length=12)
    
    @validator('password')
    def validate_password(cls, v):
        if not any(c.isupper() for c in v):
            raise ValueError('Password must contain uppercase letter')
        if not any(c.islower() for c in v):
            raise ValueError('Password must contain lowercase letter')
        if not any(c.isdigit() for c in v):
            raise ValueError('Password must contain digit')
        if not any(c in '!@#$%^&*()_+-=[]{}|;:,.<>?' for c in v):
            raise ValueError('Password must contain special character')
        return v


class UserUpdate(BaseSchema):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None


class UserResponse(BaseSchema):
    id: UUID
    email: EmailStr
    full_name: str
    role: UserRole
    is_active: bool
    is_verified: bool
    mfa_enabled: bool
    last_login: Optional[datetime]
    created_at: datetime


class UserListResponse(BaseSchema):
    items: List[UserResponse]
    total: int
    skip: int
    limit: int


# ==================================================
# PROJECT SCHEMAS
# ==================================================

class ProjectBase(BaseSchema):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    project_type: str
    client_name: Optional[str] = None
    client_contact: Optional[str] = None


class ProjectCreate(ProjectBase):
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    scope_document: Optional[str] = None
    rules_of_engagement: Optional[str] = None


class ProjectUpdate(BaseSchema):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    scope_document: Optional[str] = None
    rules_of_engagement: Optional[str] = None


class ProjectResponse(BaseSchema):
    id: UUID
    name: str
    description: Optional[str]
    project_type: str
    status: str
    owner_id: UUID
    client_name: Optional[str]
    start_date: Optional[datetime]
    end_date: Optional[datetime]
    created_at: datetime
    updated_at: datetime


class ProjectDetailResponse(ProjectResponse):
    scope_document: Optional[str]
    rules_of_engagement: Optional[str]
    metadata: Dict[str, Any]
    target_count: Optional[int] = 0
    scan_count: Optional[int] = 0
    vuln_count: Optional[int] = 0


class ProjectListResponse(BaseSchema):
    items: List[ProjectResponse]
    total: int
    skip: int
    limit: int


# ==================================================
# TARGET SCHEMAS
# ==================================================

class TargetBase(BaseSchema):
    name: str = Field(..., min_length=1, max_length=255)
    target_type: str
    host: Optional[str] = None
    port: Optional[int] = None
    url: Optional[str] = None
    ip_address: Optional[str] = None
    description: Optional[str] = None


class TargetCreate(TargetBase):
    project_id: UUID


class TargetUpdate(BaseSchema):
    name: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    url: Optional[str] = None
    is_active: Optional[bool] = None


class TargetResponse(BaseSchema):
    id: UUID
    project_id: UUID
    name: str
    target_type: str
    host: Optional[str]
    port: Optional[int]
    url: Optional[str]
    ip_address: Optional[str]
    is_active: bool
    verified: bool
    last_scanned: Optional[datetime]
    created_at: datetime


class TargetListResponse(BaseSchema):
    items: List[TargetResponse]
    total: int
    skip: int
    limit: int


# ==================================================
# SCAN SCHEMAS
# ==================================================

class ScanCreate(BaseSchema):
    project_id: UUID
    target_id: UUID
    scan_type: ScanType
    scan_profile: ScanProfile = ScanProfile.quick
    enabled_tools: Optional[List[str]] = None
    tool_options: Optional[Dict[str, Any]] = None


class ScanUpdate(BaseSchema):
    status: Optional[ScanStatus] = None
    enabled_tools: Optional[List[str]] = None
    tool_options: Optional[Dict[str, Any]] = None


class ScanResponse(BaseSchema):
    id: UUID
    project_id: UUID
    target_id: UUID
    scan_type: str
    scan_profile: str
    status: str
    approval_status: Optional[str]
    created_by: UUID
    approved_by: Optional[UUID]
    approved_at: Optional[datetime]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    duration_seconds: Optional[int]
    risk_score: Optional[int]
    vuln_count_critical: int = 0
    vuln_count_high: int = 0
    vuln_count_medium: int = 0
    vuln_count_low: int = 0
    vuln_count_info: int = 0
    created_at: datetime


class ScanResultResponse(BaseSchema):
    id: UUID
    scan_id: UUID
    tool_name: str
    status: str
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    duration_seconds: Optional[int]
    findings_count: int
    error_message: Optional[str]


class ScanDetailResponse(ScanResponse):
    enabled_tools: List[str]
    tool_options: Dict[str, Any]
    results: Optional[Dict[str, Any]]
    error_message: Optional[str]
    approval_reason: Optional[str]
    tool_results: List[ScanResultResponse] = []


class ScanListResponse(BaseSchema):
    items: List[ScanResponse]
    total: int
    skip: int
    limit: int


class ScanApprovalRequest(BaseSchema):
    reason: Optional[str] = None


class ScanApprovalResponse(BaseSchema):
    scan_id: UUID
    status: str
    approved_by: UUID
    approved_at: datetime
    reason: Optional[str]


class ScanProfileInfo(BaseSchema):
    name: str
    display_name: str
    duration_estimate: str
    tools_count: int
    requires_approval: bool
    description: str


class ToolInfo(BaseSchema):
    name: str
    display_name: str
    category: str
    is_enabled: bool
    requires_approval: bool
    timeout_seconds: int
    description: str


# ==================================================
# VULNERABILITY SCHEMAS
# ==================================================

class VulnerabilityCreate(BaseSchema):
    scan_id: UUID
    project_id: UUID
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    severity: Severity
    cve_id: Optional[str] = None
    cwe_id: Optional[str] = None
    cvss_score: Optional[float] = Field(None, ge=0, le=10)
    cvss_vector: Optional[str] = None
    affected_url: Optional[str] = None
    affected_parameter: Optional[str] = None
    affected_component: Optional[str] = None
    remediation: Optional[str] = None
    proof_of_concept: Optional[str] = None
    found_by_tool: Optional[str] = None


class VulnerabilityUpdate(BaseSchema):
    status: Optional[VulnStatus] = None
    severity: Optional[Severity] = None
    remediation: Optional[str] = None
    false_positive: Optional[bool] = None
    false_positive_reason: Optional[str] = None
    verified: Optional[bool] = None


class VulnerabilityResponse(BaseSchema):
    id: UUID
    scan_id: UUID
    project_id: UUID
    title: str
    severity: str
    status: str
    cve_id: Optional[str]
    cwe_id: Optional[str]
    cvss_score: Optional[float]
    affected_url: Optional[str]
    affected_component: Optional[str]
    found_by_tool: Optional[str]
    exploit_available: bool
    verified: bool
    false_positive: bool
    created_at: datetime


class VulnerabilityDetailResponse(VulnerabilityResponse):
    description: Optional[str]
    cvss_vector: Optional[str]
    affected_parameter: Optional[str]
    remediation: Optional[str]
    proof_of_concept: Optional[str]
    references: List[str]
    tags: List[str]
    template_id: Optional[str]
    exploit_module: Optional[str]
    false_positive_reason: Optional[str]
    business_impact: Optional[str]
    verified_by: Optional[UUID]
    verified_at: Optional[datetime]


class VulnerabilityListResponse(BaseSchema):
    items: List[VulnerabilityResponse]
    total: int
    skip: int
    limit: int


# ==================================================
# REPORT SCHEMAS
# ==================================================

class ReportCreate(BaseSchema):
    project_id: UUID
    title: str = Field(..., min_length=1, max_length=255)
    report_type: str
    format: str
    include_executive_summary: bool = True
    include_technical_details: bool = True
    include_remediation: bool = True
    include_poc: bool = False
    severity_filter: Optional[List[str]] = None


class ReportResponse(BaseSchema):
    id: UUID
    project_id: UUID
    title: str
    report_type: str
    format: str
    status: str
    file_path: Optional[str]
    file_size: Optional[int]
    generated_by: Optional[UUID]
    created_at: datetime


class ReportListResponse(BaseSchema):
    items: List[ReportResponse]
    total: int
    skip: int
    limit: int


# ==================================================
# AUDIT LOG SCHEMAS
# ==================================================

class AuditLogResponse(BaseSchema):
    id: UUID
    user_id: Optional[UUID]
    action: str
    resource_type: str
    resource_id: Optional[UUID]
    ip_address: Optional[str]
    success: bool
    error_message: Optional[str]
    created_at: datetime


class AuditLogDetailResponse(AuditLogResponse):
    old_value: Optional[Dict[str, Any]]
    new_value: Optional[Dict[str, Any]]
    user_agent: Optional[str]
    session_id: Optional[str]


class AuditLogListResponse(BaseSchema):
    items: List[AuditLogResponse]
    total: int
    skip: int
    limit: int


# ==================================================
# TOOL CONFIG SCHEMAS
# ==================================================

class ToolConfigUpdate(BaseSchema):
    is_enabled: Optional[bool] = None
    default_options: Optional[Dict[str, Any]] = None
    timeout_seconds: Optional[int] = None
    rate_limit: Optional[int] = None
    max_concurrent: Optional[int] = None
    requires_approval: Optional[bool] = None


class ToolConfigResponse(BaseSchema):
    id: UUID
    tool_name: str
    is_enabled: bool
    default_options: Dict[str, Any]
    timeout_seconds: int
    rate_limit: Optional[int]
    max_concurrent: int
    requires_approval: bool
    description: Optional[str]
    updated_at: datetime


# ==================================================
# SCHEDULED SCAN SCHEMAS
# ==================================================

class ScheduledScanCreate(BaseSchema):
    project_id: UUID
    target_id: UUID
    scan_type: ScanType
    scan_profile: ScanProfile = ScanProfile.quick
    enabled_tools: Optional[List[str]] = None
    cron_expression: str = Field(..., pattern=r'^[\d\*\/\-\,\s]+$')


class ScheduledScanUpdate(BaseSchema):
    is_active: Optional[bool] = None
    cron_expression: Optional[str] = None
    scan_profile: Optional[ScanProfile] = None
    enabled_tools: Optional[List[str]] = None


class ScheduledScanResponse(BaseSchema):
    id: UUID
    project_id: UUID
    target_id: UUID
    scan_type: str
    scan_profile: str
    cron_expression: str
    is_active: bool
    last_run: Optional[datetime]
    next_run: Optional[datetime]
    created_by: UUID
    created_at: datetime


# ==================================================
# DASHBOARD SCHEMAS
# ==================================================

class DashboardStats(BaseSchema):
    total_projects: int
    active_projects: int
    total_scans: int
    scans_running: int
    scans_pending_approval: int
    total_vulnerabilities: int
    critical_vulnerabilities: int
    high_vulnerabilities: int
    medium_vulnerabilities: int
    low_vulnerabilities: int
    info_findings: int


class VulnerabilityTrend(BaseSchema):
    date: str
    critical: int
    high: int
    medium: int
    low: int


class ScanActivity(BaseSchema):
    date: str
    completed: int
    failed: int


class RecentScan(BaseSchema):
    id: UUID
    project_name: str
    target_name: str
    scan_profile: str
    status: str
    risk_score: Optional[int]
    completed_at: Optional[datetime]


class DashboardResponse(BaseSchema):
    stats: DashboardStats
    vulnerability_trend: List[VulnerabilityTrend]
    scan_activity: List[ScanActivity]
    recent_scans: List[RecentScan]
    tool_usage: Dict[str, int]


# ==================================================
# AUTH SCHEMAS
# ==================================================

class Token(BaseSchema):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenPayload(BaseSchema):
    sub: str
    role: str
    exp: int


class LoginRequest(BaseSchema):
    email: EmailStr
    password: str
    mfa_code: Optional[str] = None


class PasswordChange(BaseSchema):
    current_password: str
    new_password: str = Field(..., min_length=12)
    
    @validator('new_password')
    def validate_password(cls, v):
        if not any(c.isupper() for c in v):
            raise ValueError('Password must contain uppercase letter')
        if not any(c.islower() for c in v):
            raise ValueError('Password must contain lowercase letter')
        if not any(c.isdigit() for c in v):
            raise ValueError('Password must contain digit')
        if not any(c in '!@#$%^&*()_+-=[]{}|;:,.<>?' for c in v):
            raise ValueError('Password must contain special character')
        return v


class MFASetup(BaseSchema):
    secret: str
    qr_code: str


class MFAVerify(BaseSchema):
    code: str
