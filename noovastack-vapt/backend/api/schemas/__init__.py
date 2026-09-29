"""
NoovaStack VAPT Platform - API Schemas
"""
from datetime import datetime
from typing import Optional, Any
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, model_validator


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


class UpdateProfileRequest(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    username: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


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
    tags: list[str] = Field(default_factory=list)


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
    # Supported types: passive, safe_active, technology_detection (legacy aliases)
    # and subdomain_enum, dns_enum, host_probe, tech_fingerprint (explicit)
    discovery_types: list[str] = Field(default_factory=lambda: ["passive", "safe_active", "technology_detection"])

    model_config = {"extra": "forbid"}


class DiscoveryAssetResult(BaseModel):
    """Single discovered asset returned by the job result."""
    type: str
    value: str
    discovery_method: str
    technology: Optional[dict] = None
    ports_services: Optional[dict] = None
    dns_records: Optional[dict] = None


class DiscoveryJobStatus(BaseModel):
    """Celery task status for a running discovery job."""
    job_id: str
    state: str  # PENDING | STARTED | SUCCESS | FAILURE | RETRY
    status: str  # started | running | completed | failed
    assets_found: int = 0
    assets: list[DiscoveryAssetResult] = Field(default_factory=list)
    error: Optional[str] = None


# ── Asset Group ──
class AssetGroupTarget(BaseModel):
    value: str
    type: str = "root_domain"


class AssetGroupCreate(BaseModel):
    name: str
    description: Optional[str] = None
    targets: list[AssetGroupTarget] = Field(default_factory=list)

    model_config = {"extra": "forbid"}


class AssetGroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    targets: Optional[list[AssetGroupTarget]] = None

    model_config = {"extra": "forbid"}


class AssetGroupResponse(BaseModel):
    id: UUID
    project_id: UUID
    name: str
    description: Optional[str] = None
    targets: list[dict] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ── Scan ──
class ScanCreate(BaseModel):
    project_id: UUID
    engagement_id: Optional[UUID] = None
    name: str
    assessment_mode: str = Field(pattern="^(black_box|gray_box|white_box)$")
    scan_category: str
    scan_depth: str = Field(pattern="^(quick|standard|deep|custom)$")
    scan_profile_id: Optional[str] = None
    asset_ids: list[UUID] = Field(default_factory=list)
    config: dict = Field(default_factory=dict)

    model_config = {"extra": "forbid"}


class ScanUpdate(BaseModel):
    name: Optional[str] = None
    assessment_mode: Optional[str] = Field(default=None, pattern="^(black_box|gray_box|white_box)$")
    scan_category: Optional[str] = None
    scan_depth: Optional[str] = Field(default=None, pattern="^(quick|standard|deep|custom)$")
    engagement_id: Optional[UUID] = None
    scan_profile_id: Optional[str] = None
    config: Optional[dict] = None

    model_config = {"extra": "forbid"}


class EmergencyStopRequest(BaseModel):
    confirmation: str

    model_config = {"extra": "forbid"}


class ScanRetestRequest(BaseModel):
    finding_ids: list[UUID] = Field(default_factory=list)

    model_config = {"extra": "forbid"}


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


def _require_valid_cron(recurrence_rule: Optional[str], cron_expression: Optional[str]) -> None:
    if recurrence_rule != "custom":
        return
    if not cron_expression or not cron_expression.strip():
        raise ValueError("cron_expression is required when recurrence_rule is 'custom'")
    from croniter import croniter
    if not croniter.is_valid(cron_expression.strip()):
        raise ValueError(f"cron_expression '{cron_expression}' is not a valid cron expression")


# ── Scan Schedule ──
class ScanScheduleCreate(BaseModel):
    project_id: UUID
    engagement_id: Optional[UUID] = None
    name: str
    assessment_mode: str = Field(pattern="^(black_box|gray_box|white_box)$")
    scan_category: str
    scan_depth: str = Field(pattern="^(quick|standard|deep|custom)$")
    recurrence_rule: str = Field(default="once", pattern="^(once|daily|weekly|monthly|custom)$")
    timezone: str = "UTC"
    cron_expression: Optional[str] = None
    next_run_at: Optional[datetime] = None
    testing_window: dict = Field(default_factory=dict)
    report_options: dict = Field(default_factory=dict)
    asset_ids: list[UUID] = Field(default_factory=list)
    config: dict = Field(default_factory=dict)

    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def _check_cron(self):
        _require_valid_cron(self.recurrence_rule, self.cron_expression)
        return self


class ScanScheduleUpdate(BaseModel):
    name: Optional[str] = None
    engagement_id: Optional[UUID] = None
    assessment_mode: Optional[str] = Field(default=None, pattern="^(black_box|gray_box|white_box)$")
    scan_category: Optional[str] = None
    scan_depth: Optional[str] = Field(default=None, pattern="^(quick|standard|deep|custom)$")
    recurrence_rule: Optional[str] = Field(default=None, pattern="^(once|daily|weekly|monthly|custom)$")
    timezone: Optional[str] = None
    cron_expression: Optional[str] = None
    next_run_at: Optional[datetime] = None
    testing_window: Optional[dict] = None
    report_options: Optional[dict] = None
    asset_ids: Optional[list[UUID]] = None
    config: Optional[dict] = None

    model_config = {"extra": "forbid"}


class ScanScheduleResponse(BaseModel):
    id: UUID
    project_id: UUID
    name: str
    assessment_mode: str
    scan_category: str
    scan_depth: str
    recurrence_rule: str
    cron_expression: Optional[str] = None
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

    model_config = {"extra": "forbid"}


class ApprovalRequest(BaseModel):
    reason: str = Field(default="Controlled action review requested.", min_length=1)

    model_config = {"extra": "forbid"}


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


# ── Autonomous AI Agents ──
class AIAgentRunRequest(BaseModel):
    project_id: UUID
    engagement_id: Optional[UUID] = None
    objective: str = Field(min_length=5)
    max_actions: int = Field(default=5, ge=1, le=8)

    model_config = {"extra": "forbid"}


class AIAgentTaskResponse(BaseModel):
    id: UUID
    run_id: UUID
    title: Optional[str]
    target: Optional[str]
    module: str
    risk_level: str
    status: str
    scan_id: Optional[UUID]
    result: Optional[str]
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


class AIAgentActivityResponse(BaseModel):
    id: UUID
    run_id: UUID
    message: str
    status: str
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


class AIAgentRunResponse(BaseModel):
    id: UUID
    agent_id: UUID
    agent_slug: Optional[str] = None
    agent_name: Optional[str] = None
    project_id: UUID
    engagement_id: Optional[UUID]
    objective: Optional[str]
    status: str
    plan: Optional[dict]
    celery_task_id: Optional[str]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    created_at: Optional[datetime]
    tasks: list[AIAgentTaskResponse] = Field(default_factory=list)
    activities: list[AIAgentActivityResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}


# ── Domain Monitoring ──────────────────────────────────────────────────────

class DomainMonitorCreate(BaseModel):
    domain: str
    label: Optional[str] = None
    check_interval_hours: int = Field(default=24, ge=1, le=168)
    discovery_types: list[str] = Field(
        default_factory=lambda: ["subdomain_enum", "dns_enum", "tech_fingerprint"]
    )
    model_config = {"extra": "forbid"}


class DomainMonitorUpdate(BaseModel):
    label: Optional[str] = None
    status: Optional[str] = None          # active | paused | stopped
    check_interval_hours: Optional[int] = Field(default=None, ge=1, le=168)
    discovery_types: Optional[list[str]] = None
    model_config = {"extra": "forbid"}


class DomainMonitorEventResponse(BaseModel):
    id: UUID
    monitor_id: UUID
    event_type: str
    severity: str
    asset_value: Optional[str]
    summary: str
    details: Optional[dict]
    detected_at: Optional[datetime]
    acknowledged_at: Optional[datetime]
    model_config = {"from_attributes": True}


class DomainMonitorResponse(BaseModel):
    id: UUID
    project_id: UUID
    domain: str
    label: Optional[str]
    status: str
    check_interval_hours: int
    discovery_types: list[str]
    last_checked_at: Optional[datetime]
    next_check_at: Optional[datetime]
    created_at: Optional[datetime]
    events: list[DomainMonitorEventResponse] = Field(default_factory=list)
    model_config = {"from_attributes": True}
