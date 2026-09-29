"""
NoovaStack VAPT Platform - Database Models
"""
import uuid
from datetime import datetime

from sqlalchemy import (
    Column, String, Boolean, Integer, Text, DateTime, ForeignKey, Float, JSON
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255))
    role = Column(String(50), default="viewer")
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    last_login = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    projects = relationship("Project", back_populates="owner_rel", foreign_keys="Project.owner_id")
    scans_requested = relationship("Scan", back_populates="requested_by_rel", foreign_keys="Scan.requested_by")
    scans_approved = relationship("Scan", back_populates="approved_by_rel", foreign_keys="Scan.approved_by")
    approvals_requested = relationship("Approval", back_populates="requested_by_rel", foreign_keys="Approval.requested_by")
    approvals_decided = relationship("Approval", back_populates="approved_by_rel", foreign_keys="Approval.approved_by")
    ai_tool_requests = relationship("AIToolRequest", back_populates="requested_by_rel")


class Project(Base):
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    environment = Column(String(50), default="production")
    status = Column(String(50), default="active")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    owner_rel = relationship("User", back_populates="projects", foreign_keys=[owner_id])
    engagements = relationship("Engagement", back_populates="project", cascade="all, delete-orphan")
    assets = relationship("Asset", back_populates="project", cascade="all, delete-orphan")
    scans = relationship("Scan", back_populates="project", cascade="all, delete-orphan")


class Engagement(Base):
    __tablename__ = "engagements"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    assessment_mode = Column(String(20), nullable=False)  # black_box, gray_box, white_box
    authorization_status = Column(String(20), default="pending")  # pending, authorized, rejected, expired
    start_date = Column(DateTime)
    end_date = Column(DateTime)
    testing_window_start = Column(String(10))
    testing_window_end = Column(String(10))
    rules_of_engagement = Column(Text)
    status = Column(String(20), default="draft")  # draft, active, completed, closed
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    project = relationship("Project", back_populates="engagements")
    assets = relationship("Asset", back_populates="engagement")
    scans = relationship("Scan", back_populates="engagement")


class Asset(Base):
    __tablename__ = "assets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    engagement_id = Column(UUID(as_uuid=True), ForeignKey("engagements.id", ondelete="SET NULL"))
    parent_asset_id = Column(UUID(as_uuid=True), ForeignKey("assets.id", ondelete="SET NULL"))
    asset_type = Column(String(50), nullable=False)
    value = Column(String(1000), nullable=False)
    name = Column(String(500))
    source = Column(String(50))
    discovery_method = Column(String(50))
    scope_status = Column(String(20), default="pending_review")
    approval_status = Column(String(20), default="pending")
    environment = Column(String(50), default="production")
    technology = Column(JSONB, default=dict)
    ports_services = Column(JSONB, default=dict)
    tags = Column(JSONB, default=list)
    first_discovered_at = Column(DateTime, server_default=func.now())
    last_observed_at = Column(DateTime, server_default=func.now())
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    project = relationship("Project", back_populates="assets")
    engagement = relationship("Engagement", back_populates="assets")
    parent = relationship("Asset", remote_side=[id], backref="children")
    scan_assets = relationship("ScanAsset", back_populates="asset", cascade="all, delete-orphan")
    findings = relationship("Finding", back_populates="asset", cascade="all, delete-orphan")


class AssetGroup(Base):
    __tablename__ = "asset_groups"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    targets = Column(JSONB, default=list)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    project = relationship("Project")


class ScanProfile(Base):
    __tablename__ = "scan_profiles"

    id = Column(String(100), primary_key=True)
    name = Column(String(255), nullable=False)
    category = Column(String(50), nullable=False)
    depth = Column(String(20), nullable=False)
    assessment_modes = Column(JSONB, default=list)
    enabled_modules = Column(JSONB, default=list)
    risk_level = Column(String(20), default="low")
    approval_required = Column(Boolean, default=False)
    senior_approval_required = Column(Boolean, default=False)
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Scan(Base):
    __tablename__ = "scans"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    engagement_id = Column(UUID(as_uuid=True), ForeignKey("engagements.id", ondelete="SET NULL"))
    scan_profile_id = Column(String(100), ForeignKey("scan_profiles.id"))
    name = Column(String(255), nullable=False)
    assessment_mode = Column(String(20), nullable=False)
    scan_category = Column(String(50), nullable=False)
    scan_depth = Column(String(20), nullable=False)
    status = Column(String(20), default="draft")
    progress = Column(Integer, default=0)
    requested_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    approved_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    celery_task_id = Column(String(255))
    config = Column(JSONB, default=dict)
    results_summary = Column(JSONB, default=dict)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    project = relationship("Project", back_populates="scans")
    engagement = relationship("Engagement", back_populates="scans")
    requested_by_rel = relationship("User", back_populates="scans_requested", foreign_keys=[requested_by])
    approved_by_rel = relationship("User", back_populates="scans_approved", foreign_keys=[approved_by])
    scan_profile = relationship("ScanProfile")
    scan_assets = relationship("ScanAsset", back_populates="scan", cascade="all, delete-orphan")
    findings = relationship("Finding", back_populates="scan", cascade="all, delete-orphan")
    modules = relationship("ScanModule", back_populates="scan", cascade="all, delete-orphan")
    approvals = relationship("Approval", back_populates="scan", cascade="all, delete-orphan")


class ScanAsset(Base):
    __tablename__ = "scan_assets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scan_id = Column(UUID(as_uuid=True), ForeignKey("scans.id", ondelete="CASCADE"), nullable=False)
    asset_id = Column(UUID(as_uuid=True), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    scan = relationship("Scan", back_populates="scan_assets")
    asset = relationship("Asset", back_populates="scan_assets")


class ScanModule(Base):
    __tablename__ = "scan_modules"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scan_id = Column(UUID(as_uuid=True), ForeignKey("scans.id", ondelete="CASCADE"), nullable=False)
    module_name = Column(String(100), nullable=False)
    status = Column(String(20), default="pending")
    tool = Column(String(100))
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    output = Column(JSONB, default=dict)
    error = Column(Text)

    scan = relationship("Scan", back_populates="modules")


class ScanSchedule(Base):
    __tablename__ = "scan_schedules"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    engagement_id = Column(UUID(as_uuid=True), ForeignKey("engagements.id", ondelete="SET NULL"))
    name = Column(String(255), nullable=False)
    assessment_mode = Column(String(20), nullable=False)
    scan_category = Column(String(50), nullable=False)
    scan_depth = Column(String(20), nullable=False)
    recurrence_rule = Column(String(20), nullable=False)
    timezone = Column(String(50), default="UTC")
    cron_expression = Column(String(100))
    next_run_at = Column(DateTime)
    testing_window = Column(JSONB, default=dict)
    status = Column(String(20), default="draft")
    report_options = Column(JSONB, default=dict)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    runs = relationship("ScheduleRun", back_populates="schedule", cascade="all, delete-orphan")


class ScheduleRun(Base):
    __tablename__ = "schedule_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    schedule_id = Column(UUID(as_uuid=True), ForeignKey("scan_schedules.id", ondelete="CASCADE"), nullable=False)
    scan_id = Column(UUID(as_uuid=True), ForeignKey("scans.id", ondelete="SET NULL"))
    scheduled_for = Column(DateTime, nullable=False)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    status = Column(String(20), default="pending")
    blocked_reason = Column(Text)
    created_at = Column(DateTime, server_default=func.now())

    schedule = relationship("ScanSchedule", back_populates="runs")


class Finding(Base):
    __tablename__ = "findings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scan_id = Column(UUID(as_uuid=True), ForeignKey("scans.id", ondelete="CASCADE"), nullable=False)
    asset_id = Column(UUID(as_uuid=True), ForeignKey("assets.id", ondelete="SET NULL"))
    title = Column(String(500), nullable=False)
    description = Column(Text)
    severity = Column(String(20), nullable=False)
    status = Column(String(20), default="open")
    integrity_status = Column(String(20), default="unverified")
    owasp_category = Column(String(100))
    cwe_id = Column(String(50))
    cvss_score = Column(Float)
    business_impact = Column(Text)
    technical_impact = Column(Text)
    remediation = Column(Text)
    ai_explanation = Column(Text)
    ai_remediation = Column(Text)
    found_by_tool = Column(String(100))
    raw_output = Column(JSONB, default=dict)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    scan = relationship("Scan", back_populates="findings")
    asset = relationship("Asset", back_populates="findings")
    evidence_items = relationship("Evidence", back_populates="finding", cascade="all, delete-orphan")


class Evidence(Base):
    __tablename__ = "evidence"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    finding_id = Column(UUID(as_uuid=True), ForeignKey("findings.id", ondelete="CASCADE"), nullable=False)
    evidence_type = Column(String(50), nullable=False)
    storage_path = Column(String(1000))
    hash_value = Column(String(255))
    metadata_json = Column(JSONB, default=dict)
    created_at = Column(DateTime, server_default=func.now())

    finding = relationship("Finding", back_populates="evidence_items")


class ScanEvent(Base):
    __tablename__ = "scan_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scan_id = Column(UUID(as_uuid=True), ForeignKey("scans.id", ondelete="CASCADE"), nullable=False)
    module_run_id = Column(UUID(as_uuid=True), ForeignKey("scan_modules.id", ondelete="SET NULL"))
    agent_id = Column(String(100))
    worker_id = Column(String(100))
    event_type = Column(String(50), nullable=False)
    severity = Column(String(20), default="info")
    summary = Column(Text, nullable=False)
    details_json = Column(JSONB, default=dict)
    asset_id = Column(UUID(as_uuid=True), ForeignKey("assets.id", ondelete="SET NULL"))
    finding_id = Column(UUID(as_uuid=True), ForeignKey("findings.id", ondelete="SET NULL"))
    evidence_id = Column(UUID(as_uuid=True), ForeignKey("evidence.id", ondelete="SET NULL"))
    created_at = Column(DateTime, server_default=func.now())


class ScanSafetyState(Base):
    __tablename__ = "scan_safety_states"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scan_id = Column(UUID(as_uuid=True), ForeignKey("scans.id", ondelete="CASCADE"), nullable=False, unique=True)
    dos_protection = Column(String(20), default="Enabled")
    rate_limiting = Column(String(20), default="Enabled")
    scope_enforcement = Column(String(20), default="Active")
    kill_switch_ready = Column(String(20), default="Ready")
    out_of_scope_block = Column(String(20), default="Active")
    testing_window_valid = Column(String(20), default="Valid")
    approval_gate_active = Column(String(20), default="Ready")
    last_checked_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Approval(Base):
    __tablename__ = "approvals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scan_id = Column(UUID(as_uuid=True), ForeignKey("scans.id", ondelete="CASCADE"))
    schedule_id = Column(UUID(as_uuid=True), ForeignKey("scan_schedules.id", ondelete="CASCADE"))
    ai_tool_request_id = Column(UUID(as_uuid=True), ForeignKey("ai_tool_requests.id", ondelete="SET NULL"))
    action = Column(String(100), nullable=False)
    risk_level = Column(String(20), default="low")
    status = Column(String(20), default="pending")
    requested_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    approved_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    reason = Column(Text)
    expires_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())
    decided_at = Column(DateTime)

    scan = relationship("Scan", back_populates="approvals")
    ai_tool_request = relationship("AIToolRequest", back_populates="approvals")
    requested_by_rel = relationship("User", back_populates="approvals_requested", foreign_keys=[requested_by])
    approved_by_rel = relationship("User", back_populates="approvals_decided", foreign_keys=[approved_by])


class AIAgent(Base):
    __tablename__ = "ai_agents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug = Column(String(100), unique=True, nullable=False)
    name = Column(String(200), nullable=False)
    agent_type = Column(String(50), default="Planner")
    purpose = Column(String(500))
    description = Column(Text)
    status = Column(String(20), default="idle")
    risk_level = Column(String(20), default="low")
    model = Column(String(100))
    provider = Column(String(50))
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    runs = relationship("AIAgentRun", back_populates="agent", cascade="all, delete-orphan")
    tasks = relationship("AIAgentTask", back_populates="agent", cascade="all, delete-orphan")
    activities = relationship("AIAgentActivity", back_populates="agent", cascade="all, delete-orphan")
    recommendations = relationship("AIAgentRecommendation", back_populates="agent", cascade="all, delete-orphan")


class AIAgentRun(Base):
    __tablename__ = "ai_agent_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id = Column(UUID(as_uuid=True), ForeignKey("ai_agents.id", ondelete="CASCADE"), nullable=False)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    engagement_id = Column(UUID(as_uuid=True), ForeignKey("engagements.id", ondelete="SET NULL"))
    started_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    objective = Column(Text)
    status = Column(String(20), default="queued")
    plan = Column(JSONB, default=dict)
    celery_task_id = Column(String(100))
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())

    agent = relationship("AIAgent", back_populates="runs")
    project = relationship("Project")
    engagement = relationship("Engagement")
    started_by_rel = relationship("User")
    tasks = relationship("AIAgentTask", back_populates="run", cascade="all, delete-orphan")
    activities = relationship("AIAgentActivity", back_populates="run", cascade="all, delete-orphan")
    recommendations = relationship("AIAgentRecommendation", back_populates="run", cascade="all, delete-orphan")


class AIAgentTask(Base):
    __tablename__ = "ai_agent_tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id = Column(UUID(as_uuid=True), ForeignKey("ai_agent_runs.id", ondelete="CASCADE"), nullable=False)
    agent_id = Column(UUID(as_uuid=True), ForeignKey("ai_agents.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(500))
    target = Column(String(1000))
    module = Column(String(100), nullable=False)
    risk_level = Column(String(20), default="low")
    status = Column(String(20), default="queued")
    scan_id = Column(UUID(as_uuid=True), ForeignKey("scans.id", ondelete="SET NULL"))
    ai_tool_request_id = Column(UUID(as_uuid=True), ForeignKey("ai_tool_requests.id", ondelete="SET NULL"))
    result = Column(Text)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())

    run = relationship("AIAgentRun", back_populates="tasks")
    agent = relationship("AIAgent", back_populates="tasks")
    scan = relationship("Scan")
    ai_tool_request = relationship("AIToolRequest")


class AIAgentActivity(Base):
    __tablename__ = "ai_agent_activities"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id = Column(UUID(as_uuid=True), ForeignKey("ai_agent_runs.id", ondelete="CASCADE"), nullable=False)
    agent_id = Column(UUID(as_uuid=True), ForeignKey("ai_agents.id", ondelete="CASCADE"), nullable=False)
    message = Column(Text, nullable=False)
    status = Column(String(20), default="info")
    created_at = Column(DateTime, server_default=func.now())

    run = relationship("AIAgentRun", back_populates="activities")
    agent = relationship("AIAgent", back_populates="activities")


class AIAgentRecommendation(Base):
    __tablename__ = "ai_agent_recommendations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id = Column(UUID(as_uuid=True), ForeignKey("ai_agent_runs.id", ondelete="CASCADE"), nullable=False)
    agent_id = Column(UUID(as_uuid=True), ForeignKey("ai_agents.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(500), nullable=False)
    severity = Column(String(20), default="low")
    confidence = Column(Float, default=0.0)
    rationale = Column(Text)
    review_status = Column(String(20), default="pending")
    finding_id = Column(UUID(as_uuid=True), ForeignKey("findings.id", ondelete="SET NULL"))
    created_at = Column(DateTime, server_default=func.now())

    run = relationship("AIAgentRun", back_populates="recommendations")
    agent = relationship("AIAgent", back_populates="recommendations")
    finding = relationship("Finding")


class AIToolRequest(Base):
    __tablename__ = "ai_tool_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id = Column(String(100))
    requested_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    engagement_id = Column(UUID(as_uuid=True), ForeignKey("engagements.id", ondelete="SET NULL"))
    scan_id = Column(UUID(as_uuid=True), ForeignKey("scans.id", ondelete="SET NULL"))
    target = Column(String(1000), nullable=False)
    task_type = Column(String(100), default="safe_vulnerability_scan")
    assessment_mode = Column(String(20), nullable=False)
    scan_category = Column(String(50), nullable=False)
    scan_depth = Column(String(20), nullable=False)
    risk_level = Column(String(20), nullable=False)
    modules = Column(JSONB, default=list)
    rationale = Column(Text)
    status = Column(String(20), default="pending")
    config = Column(JSONB, default=dict)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    project = relationship("Project")
    engagement = relationship("Engagement")
    scan = relationship("Scan")
    requested_by_rel = relationship("User", back_populates="ai_tool_requests")
    approvals = relationship("Approval", back_populates="ai_tool_request", cascade="all, delete-orphan")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"))
    engagement_id = Column(UUID(as_uuid=True), ForeignKey("engagements.id", ondelete="SET NULL"))
    scan_id = Column(UUID(as_uuid=True), ForeignKey("scans.id", ondelete="SET NULL"))
    actor_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    event_type = Column(String(50), nullable=False)
    action = Column(String(100), nullable=False)
    details = Column(JSONB, default=dict)
    ip_address = Column(String(45))
    created_at = Column(DateTime, server_default=func.now())


class CVERecord(Base):
    __tablename__ = "cve_records"

    id = Column(String(32), primary_key=True)
    source = Column(String(50), default="nvd")
    title = Column(String(500))
    description = Column(Text)
    severity = Column(String(20), index=True)
    cvss_score = Column(Float)
    published_at = Column(DateTime)
    last_modified_at = Column(DateTime)
    references = Column(JSONB, default=list)
    cwes = Column(JSONB, default=list)
    configurations = Column(JSONB, default=list)
    raw = Column(JSONB, default=dict)
    synced_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class CVESyncState(Base):
    __tablename__ = "cve_sync_state"

    id = Column(String(50), primary_key=True, default="nvd")
    source = Column(String(50), default="nvd")
    status = Column(String(20), default="never_synced")
    last_sync_at = Column(DateTime)
    last_success_at = Column(DateTime)
    records_synced = Column(Integer, default=0)
    error = Column(Text)
    metadata_json = Column(JSONB, default=dict)


class DomainMonitor(Base):
    """
    Tracks a domain that is continuously re-discovered on a schedule.
    Each check diffs the result against the previous snapshot and writes
    DomainMonitorEvent rows for every detected change.
    """
    __tablename__ = "domain_monitors"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    domain = Column(String(500), nullable=False)
    label = Column(String(255))          # friendly name, e.g. "Production"
    status = Column(String(20), default="active")   # active | paused | stopped
    check_interval_hours = Column(Integer, default=24)
    discovery_types = Column(JSONB, default=lambda: ["subdomain_enum", "dns_enum", "tech_fingerprint"])
    # Serialised snapshot of the last successful check result (list of asset dicts)
    last_snapshot = Column(JSONB, default=list)
    last_checked_at = Column(DateTime)
    next_check_at = Column(DateTime)
    celery_task_id = Column(String(100))
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    project = relationship("Project")
    events = relationship("DomainMonitorEvent", back_populates="monitor", cascade="all, delete-orphan", order_by="DomainMonitorEvent.detected_at.desc()")


class DomainMonitorEvent(Base):
    """
    A detected change on a monitored domain — new subdomain, IP change, tech update, etc.
    """
    __tablename__ = "domain_monitor_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    monitor_id = Column(UUID(as_uuid=True), ForeignKey("domain_monitors.id", ondelete="CASCADE"), nullable=False)
    # Event types: new_subdomain | removed_subdomain | ip_changed | port_added | port_removed
    #              tech_changed | new_asset | status_code_changed
    event_type = Column(String(50), nullable=False)
    severity = Column(String(20), default="info")   # info | warning | critical
    asset_value = Column(String(500))               # the asset this change concerns
    summary = Column(String(500), nullable=False)
    details = Column(JSONB, default=dict)           # before/after values, full context
    detected_at = Column(DateTime, server_default=func.now())
    acknowledged_at = Column(DateTime)
    acknowledged_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))

    monitor = relationship("DomainMonitor", back_populates="events")


class APIToken(Base):
    """Personal API tokens for programmatic access to the platform."""
    __tablename__ = "api_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    token_prefix = Column(String(8), nullable=False)   # first 8 chars shown in UI
    token_hash = Column(String(255), nullable=False)   # bcrypt hash for verification
    scopes = Column(JSONB, default=list)               # e.g. ["read", "scan:read"]
    last_used_at = Column(DateTime)
    expires_at = Column(DateTime)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User")
