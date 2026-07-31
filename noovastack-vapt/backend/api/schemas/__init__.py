"""
NoovaStack VAPT Platform - API Schemas
"""
from datetime import datetime
from typing import Optional, Any
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


# ── Auth ──
class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int

    model_config = {"from_attributes": True}


class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8)
    full_name: str


class UserResponse(BaseModel):
    id: UUID
    email: str
    username: str
    full_name: Optional[str]
    role: str
    is_active: bool
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


# ── Project ──
class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    environment: str = "production"


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    environment: Optional[str] = None
    status: Optional[str] = None


class ProjectResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str]
    owner_id: UUID
    environment: str
    status: str
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


# ── Engagement ──
class EngagementCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    assessment_mode: str = Field(pattern="^(black_box|gray_box|white_box)$")
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    testing_window_start: Optional[str] = None
    testing_window_end: Optional[str] = None
    rules_of_engagement: Optional[str] = None


class EngagementResponse(BaseModel):
    id: UUID
    project_id: UUID
    name: str
    assessment_mode: str
    authorization_status: str
    start_date: Optional[datetime]
    end_date: Optional[datetime]
    testing_window_start: Optional[str]
    testing_window_end: Optional[str]
    status: str
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


# ── Asset ──
class AssetCreate(BaseModel):
    asset_type: str
    value: str
    name: Optional[str] = None
    parent_asset_id: Optional[UUID] = None
    source: str = "manual"
    environment: str = "production"
    tags: list[str] = []


class AssetUpdate(BaseModel):
    name: Optional[str] = None
    scope_status: Optional[str] = None
    approval_status: Optional[str] = None
    environment: Optional[str] = None
    tags: Optional[list[str]] = None


class AssetResponse(BaseModel):
    id: UUID
    project_id: UUID
    engagement_id: Optional[UUID]
    asset_type: str
    value: str
    name: Optional[str]
    source: str
    discovery_method: Optional[str]
    scope_status: str
    approval_status: str
    environment: str
    technology: Optional[dict]
    ports_services: Optional[dict]
    tags: Optional[list]
    parent_asset_id: Optional[UUID]
    first_discovered_at: Optional[datetime]
    last_observed_at: Optional[datetime]
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


class AssetDiscoveryRequest(BaseModel):
    target: str  # domain, IP, URL, etc.
    target_type: Optional[str] = None
    discovery_types: list[str] = ["passive"]


# ── Scan ──
class ScanCreate(BaseModel):
    project_id: UUID
    engagement_id: Optional[UUID] = None
    name: str
    assessment_mode: str = Field(pattern="^(black_box|gray_box|white_box)$")
    scan_category: str
    scan_depth: str = Field(pattern="^(quick|standard|deep|custom)$")
    scan_profile_id: Optional[str] = None
    asset_ids: list[UUID] = []
    config: dict = {}


class ScanResponse(BaseModel):
    id: UUID
    project_id: UUID
    engagement_id: Optional[UUID]
    name: str
    assessment_mode: str
    scan_category: str
    scan_depth: str
    status: str
    progress: int
    requested_by: Optional[UUID]
    approved_by: Optional[UUID]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    results_summary: Optional[dict]
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


# ── Scan Schedule ──
class ScanScheduleCreate(BaseModel):
    project_id: UUID
    engagement_id: Optional[UUID] = None
    name: str
    assessment_mode: str = Field(pattern="^(black_box|gray_box|white_box)$")
    scan_category: str
    scan_depth: str = Field(pattern="^(quick|standard|deep|custom)$")
    recurrence_rule: str = "once"
    timezone: str = "UTC"
    cron_expression: Optional[str] = None
    next_run_at: Optional[datetime] = None
    testing_window: dict = {}
    report_options: dict = {}
    asset_ids: list[UUID] = []
    config: dict = {}


class ScanScheduleResponse(BaseModel):
    id: UUID
    project_id: UUID
    name: str
    assessment_mode: str
    scan_category: str
    scan_depth: str
    recurrence_rule: str
    status: str
    next_run_at: Optional[datetime]
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


# ── Finding ──
class FindingResponse(BaseModel):
    id: UUID
    scan_id: UUID
    asset_id: Optional[UUID]
    title: str
    description: Optional[str]
    severity: str
    status: str
    integrity_status: str
    owasp_category: Optional[str]
    cwe_id: Optional[str]
    cvss_score: Optional[float]
    remediation: Optional[str]
    ai_explanation: Optional[str]
    found_by_tool: Optional[str]
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


class FindingStatusUpdate(BaseModel):
    status: str = Field(pattern="^(confirmed|ready_for_retest|retesting|fixed|partially_fixed|not_fixed|cannot_verify|risk_accepted|false_positive|rejected)$")


# ── Approval ──
class ApprovalResponse(BaseModel):
    id: UUID
    scan_id: Optional[UUID]
    schedule_id: Optional[UUID] = None
    action: str
    risk_level: str
    status: str
    requested_by: Optional[UUID]
    approved_by: Optional[UUID] = None
    reason: Optional[str]
    expires_at: Optional[datetime] = None
    decided_at: Optional[datetime] = None
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


class ApprovalDecisionRequest(BaseModel):
    decision: str = Field(pattern="^(approved|rejected|more_information)$")
    reason: str = Field(min_length=1)


# ── Report ──
class ReportGenerateRequest(BaseModel):
    scan_id: UUID
    report_type: str = "full"
    format: str = "pdf"
    include_evidence: bool = True


class ReportResponse(BaseModel):
    id: UUID
    scan_id: UUID
    format: str
    status: str
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ── Dashboard ──
class DashboardStats(BaseModel):
    total_projects: int = 0
    active_engagements: int = 0
    total_assets: int = 0
    running_scans: int = 0
    scheduled_scans: int = 0
    open_findings: int = 0
    findings_by_severity: dict = {}
    pending_approvals: int = 0
    reports_ready: int = 0


# ── Audit ──
class AuditLogResponse(BaseModel):
    id: UUID
    actor_id: Optional[UUID]
    event_type: str
    action: str
    details: Optional[dict]
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}
