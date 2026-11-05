from __future__ import annotations

import csv
import io
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import String, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from auth import User, get_project_or_404, project_access_clause, require_user
from database import get_db
from database.models import (
    Asset, AuditLog, Finding, MitigationApproval, MitigationControl, MitigationEvidence,
    MitigationException, MitigationHistory, MitigationPatchLink, MitigationPlan,
    MitigationPlanAsset, MitigationRiskAssessment, MitigationTask,
    MitigationVerification, PatchRecord, Project, Scan, User as UserModel,
)

router = APIRouter()

SEVERITIES = {"critical", "high", "medium", "low"}
MITIGATION_TYPES = {"temporary", "permanent", "compensating"}
STRATEGIES = {
    "configuration_hardening", "network_restriction", "access_control",
    "application_mitigation", "web_application_firewall", "service_mitigation",
    "compensating_controls", "custom",
}
STATUSES = {
    "draft", "pending_approval", "approved", "scheduled", "in_progress",
    "implemented", "pending_verification", "verification_failed", "verified",
    "closed", "rejected", "cancelled", "risk_accepted",
}
TRANSITIONS = {
    "draft": {"pending_approval"},
    "pending_approval": set(),
    "approved": {"scheduled", "in_progress", "cancelled"},
    "scheduled": {"in_progress", "cancelled"},
    "in_progress": {"implemented", "cancelled"},
    "implemented": {"pending_verification"},
    "pending_verification": set(),
    "verification_failed": {"in_progress"},
    "verified": {"closed"},
    "rejected": {"draft", "pending_approval"},
    "closed": set(), "cancelled": set(), "risk_accepted": set(),
}
SLA_HOURS = {"critical": 72, "high": 168, "medium": 720, "low": 2160}
REVIEW_ROLES = {"admin", "manager", "security_team"}
EDIT_ROLES = {"admin", "manager", "security_team", "analyst"}


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def naive_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


class TaskInput(BaseModel):
    title: str = Field(min_length=2, max_length=500)
    description: str | None = None
    assignee_id: UUID | None = None
    due_at: datetime | None = None


class ControlInput(BaseModel):
    control_type: str = Field(min_length=2, max_length=80)
    description: str = Field(min_length=3)
    implementation_requirements: str | None = None
    expected_effectiveness: str | None = None
    limitations: str | None = None
    verification_method: str | None = None
    expires_at: datetime | None = None


class RiskInput(BaseModel):
    initial_business_risk: str | None = None
    exploitability: str | None = None
    asset_criticality: str | None = None
    internet_exposure: str | None = None
    expected_residual_risk: str | None = None


class MitigationCreate(BaseModel):
    project_id: UUID
    finding_id: UUID
    asset_ids: list[UUID] = Field(default_factory=list)
    patch_ids: list[UUID] = Field(default_factory=list)
    title: str = Field(min_length=3, max_length=500)
    description: str | None = None
    mitigation_type: str
    strategy: str
    custom_strategy: str | None = None
    proposed_mitigation: str = Field(min_length=3)
    expected_outcome: str | None = None
    implementation_steps: list[str] = Field(default_factory=list)
    root_cause: str | None = None
    technical_impact: str | None = None
    business_criticality: str | None = None
    exposure_level: str | None = None
    limitations: str | None = None
    verification_criteria: str = Field(min_length=3)
    rollback_plan: str | None = None
    dependencies: str | None = None
    related_change_request: str | None = None
    potential_service_impact: str | None = None
    supporting_team: str | None = None
    priority: str | None = None
    owner_id: UUID | None = None
    risk_owner_id: UUID | None = None
    start_date: datetime | None = None
    target_completion_date: datetime | None = None
    temporary_expires_at: datetime | None = None
    permanent_remediation_required: bool = False
    permanent_remediation_due_at: datetime | None = None
    risk_acceptance_required: bool = False
    tasks: list[TaskInput] = Field(default_factory=list)
    controls: list[ControlInput] = Field(default_factory=list)
    risk: RiskInput = Field(default_factory=RiskInput)

    @model_validator(mode="after")
    def validate_plan(self):
        if self.mitigation_type not in MITIGATION_TYPES:
            raise ValueError("Invalid mitigation type")
        if self.strategy not in STRATEGIES:
            raise ValueError("Invalid mitigation strategy")
        if self.strategy == "custom" and not (self.custom_strategy or "").strip():
            raise ValueError("Custom strategy description is required")
        if self.mitigation_type == "temporary" and not self.temporary_expires_at:
            raise ValueError("Temporary mitigations require an expiration date")
        return self


class MitigationUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=500)
    description: str | None = None
    proposed_mitigation: str | None = None
    expected_outcome: str | None = None
    implementation_steps: list[str] | None = None
    owner_id: UUID | None = None
    risk_owner_id: UUID | None = None
    priority: str | None = None
    start_date: datetime | None = None
    sla_deadline: datetime | None = None
    temporary_expires_at: datetime | None = None
    verification_criteria: str | None = None
    rollback_plan: str | None = None
    dependencies: str | None = None
    related_change_request: str | None = None
    potential_service_impact: str | None = None
    supporting_team: str | None = None
    blocked: bool | None = None
    blocked_reason: str | None = None


class TransitionInput(BaseModel):
    status: str
    reason: str | None = Field(default=None, max_length=4000)


class ApprovalDecision(BaseModel):
    decision: str
    comments: str = Field(min_length=2, max_length=4000)


class TaskUpdate(BaseModel):
    status: str
    evidence: list[dict[str, Any]] | None = None


class EvidenceInput(BaseModel):
    evidence_type: str
    title: str = Field(min_length=2, max_length=500)
    reference: str = Field(min_length=2, max_length=1000)
    task_id: UUID | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    sha256: str | None = Field(default=None, pattern=r"^[a-fA-F0-9]{64}$")


class VerificationDecision(BaseModel):
    outcome: str
    comments: str = Field(min_length=3, max_length=8000)
    residual_risk: str
    evidence: list[dict[str, Any]] = Field(default_factory=list)


class RiskAcceptanceInput(BaseModel):
    justification: str = Field(min_length=10, max_length=8000)
    residual_risk: str
    review_at: datetime


def _options():
    return (
        selectinload(MitigationPlan.project), selectinload(MitigationPlan.finding),
        selectinload(MitigationPlan.owner), selectinload(MitigationPlan.requester),
        selectinload(MitigationPlan.verifier), selectinload(MitigationPlan.tasks).selectinload(MitigationTask.assignee),
        selectinload(MitigationPlan.controls), selectinload(MitigationPlan.approvals).selectinload(MitigationApproval.reviewer),
        selectinload(MitigationPlan.evidence), selectinload(MitigationPlan.verifications),
        selectinload(MitigationPlan.risk_assessments), selectinload(MitigationPlan.exceptions),
        selectinload(MitigationPlan.history),
    )


async def _plan_or_404(db: AsyncSession, plan_id: str, user: User) -> MitigationPlan:
    plan = (await db.execute(select(MitigationPlan).options(*_options()).where(MitigationPlan.id == plan_id))).scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Mitigation plan not found")
    await get_project_or_404(db, plan.project_id, user)
    return plan


def _derived(plan: MitigationPlan) -> dict[str, Any]:
    now = utcnow()
    open_status = plan.status not in {"closed", "cancelled", "rejected", "risk_accepted"}
    overdue = open_status and plan.sla_deadline < now
    due_seconds = int((plan.sla_deadline - now).total_seconds())
    temporary_expired = bool(plan.mitigation_type == "temporary" and plan.temporary_expires_at and plan.temporary_expires_at < now and plan.status not in {"closed", "cancelled"})
    sla_state = "overdue" if overdue else "due_soon" if due_seconds <= 86400 else "on_track"
    return {"overdue": overdue, "sla_state": sla_state, "sla_seconds_remaining": due_seconds, "temporary_expired": temporary_expired}


def _serialize_user(user: UserModel | None) -> dict | None:
    return {"id": str(user.id), "name": user.full_name or user.username, "email": user.email} if user else None


def serialize(plan: MitigationPlan, asset_rows: list[MitigationPlanAsset] | None = None, patch_rows: list[MitigationPatchLink] | None = None) -> dict:
    risk = sorted(plan.risk_assessments, key=lambda x: x.assessed_at or datetime.min, reverse=True)
    return {
        "id": str(plan.id), "mitigation_id": f"MIT-{str(plan.id)[:8].upper()}",
        "project_id": str(plan.project_id), "project_name": plan.project.name if plan.project else "Unknown",
        "finding_id": str(plan.finding_id) if plan.finding_id else None,
        "finding_title": plan.finding.title if plan.finding else None,
        "finding_status": plan.finding.status if plan.finding else None,
        "cwe_id": plan.finding.cwe_id if plan.finding else None,
        "cvss_score": plan.finding.cvss_score if plan.finding else None,
        "title": plan.title, "description": plan.description, "mitigation_type": plan.mitigation_type,
        "strategy": plan.strategy, "custom_strategy": plan.custom_strategy,
        "proposed_mitigation": plan.proposed_mitigation, "expected_outcome": plan.expected_outcome,
        "implementation_steps": plan.implementation_steps or [], "root_cause": plan.root_cause,
        "technical_impact": plan.technical_impact, "business_criticality": plan.business_criticality,
        "exposure_level": plan.exposure_level, "limitations": plan.limitations,
        "verification_criteria": plan.verification_criteria, "rollback_plan": plan.rollback_plan,
        "dependencies": plan.dependencies, "related_change_request": plan.related_change_request,
        "potential_service_impact": plan.potential_service_impact, "supporting_team": plan.supporting_team,
        "severity": plan.severity, "priority": plan.priority, "status": plan.status,
        "blocked": plan.blocked, "blocked_reason": plan.blocked_reason,
        "owner": _serialize_user(plan.owner), "requester": _serialize_user(plan.requester), "verifier": _serialize_user(plan.verifier),
        "owner_id": str(plan.owner_id) if plan.owner_id else None,
        "start_date": plan.start_date, "sla_deadline": plan.sla_deadline,
        "temporary_expires_at": plan.temporary_expires_at,
        "permanent_remediation_required": plan.permanent_remediation_required,
        "permanent_remediation_due_at": plan.permanent_remediation_due_at,
        "verification_outcome": plan.verification_outcome, "effectiveness": plan.effectiveness,
        "implemented_at": plan.implemented_at, "verified_at": plan.verified_at, "closed_at": plan.closed_at,
        "tasks": [{"id": str(x.id), "title": x.title, "description": x.description, "assignee": _serialize_user(x.assignee), "due_at": x.due_at, "status": x.status, "evidence": x.evidence or [], "completed_at": x.completed_at} for x in plan.tasks],
        "controls": [{"id": str(x.id), "control_type": x.control_type, "description": x.description, "implementation_requirements": x.implementation_requirements, "expected_effectiveness": x.expected_effectiveness, "limitations": x.limitations, "verification_method": x.verification_method, "status": x.status, "expires_at": x.expires_at} for x in plan.controls],
        "approvals": [{"id": str(x.id), "stage": x.stage, "status": x.status, "reviewer": _serialize_user(x.reviewer), "comments": x.comments, "decided_at": x.decided_at, "created_at": x.created_at} for x in plan.approvals],
        "evidence": [{"id": str(x.id), "evidence_type": x.evidence_type, "title": x.title, "reference": x.reference, "metadata": x.metadata_json or {}, "sha256": x.sha256, "created_at": x.created_at} for x in plan.evidence],
        "verifications": [{"id": str(x.id), "requested_by": str(x.requested_by), "verifier_id": str(x.verifier_id) if x.verifier_id else None, "outcome": x.outcome, "comments": x.comments, "residual_risk": x.residual_risk, "evidence": x.evidence or [], "requested_at": x.requested_at, "completed_at": x.completed_at} for x in plan.verifications],
        "risk": ({"initial_severity": risk[0].initial_severity, "initial_business_risk": risk[0].initial_business_risk, "exploitability": risk[0].exploitability, "asset_criticality": risk[0].asset_criticality, "internet_exposure": risk[0].internet_exposure, "expected_residual_risk": risk[0].expected_residual_risk, "actual_residual_risk": risk[0].actual_residual_risk} if risk else {}),
        "exceptions": [{"id": str(x.id), "exception_type": x.exception_type, "justification": x.justification, "residual_risk": x.residual_risk, "review_at": x.review_at, "approved_by": str(x.approved_by), "created_at": x.created_at} for x in plan.exceptions],
        "history": [{"id": str(x.id), "action": x.action, "actor_id": str(x.actor_id) if x.actor_id else None, "previous_status": x.previous_status, "new_status": x.new_status, "details": x.details or {}, "created_at": x.created_at} for x in sorted(plan.history, key=lambda x: x.created_at or datetime.min, reverse=True)],
        "assets": [{"id": str(x.asset_id), "name": (x.asset.name or x.asset.value) if x.asset else str(x.asset_id)} for x in (asset_rows or [])],
        "patches": [{"id": str(x.patch_id), "title": x.patch.title if x.patch else str(x.patch_id), "status": x.patch.status if x.patch else None} for x in (patch_rows or [])],
        "created_at": plan.created_at, "updated_at": plan.updated_at, **_derived(plan),
    }


def _history(plan: MitigationPlan, user: User, action: str, previous: str | None = None, details: dict | None = None):
    plan.history.append(MitigationHistory(actor_id=user.id, action=action, previous_status=previous, new_status=plan.status, details=details or {}))
    return AuditLog(project_id=plan.project_id, actor_id=user.id, event_type="mitigation", action=action, details={"mitigation_id": str(plan.id), "title": plan.title, "status": plan.status, **(details or {})})


def _can_edit(user: User, plan: MitigationPlan) -> bool:
    return user.role in EDIT_ROLES or user.id in {plan.owner_id, plan.requested_by}


@router.get("/metrics")
async def metrics(db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    rows = (await db.execute(select(MitigationPlan).join(Project).where(project_access_clause(current_user)))).scalars().all()
    now = utcnow()
    active = [x for x in rows if x.status not in {"closed", "cancelled", "rejected", "risk_accepted"}]
    completed = [x for x in rows if x.status in {"verified", "closed"}]
    implemented = [x for x in rows if x.implemented_at]
    avg_hours = round(sum((x.implemented_at - x.created_at).total_seconds() / 3600 for x in implemented if x.created_at) / len(implemented), 1) if implemented else 0
    high = [x for x in rows if x.severity in {"critical", "high"}]
    effective_high = [x for x in high if x.effectiveness == "effective"]
    due_finished = [x for x in rows if x.status in {"verified", "closed"}]
    compliant = [x for x in due_finished if x.verified_at and x.verified_at <= x.sla_deadline]
    return {
        "open": len(active), "awaiting_approval": sum(x.status == "pending_approval" for x in rows),
        "in_implementation": sum(x.status in {"scheduled", "in_progress", "implemented"} for x in rows),
        "awaiting_verification": sum(x.status == "pending_verification" for x in rows),
        "overdue": sum(x.sla_deadline < now for x in active), "completed": len(completed),
        "critical_without_mitigation": sum(x.severity == "critical" and x.status in {"draft", "rejected", "cancelled"} for x in rows),
        "average_implementation_hours": avg_hours,
        "effective_high_risk_percent": round(len(effective_high) * 100 / len(high), 1) if high else 100,
        "sla_compliance_percent": round(len(compliant) * 100 / len(due_finished), 1) if due_finished else 100,
        "expiring_temporary": sum(bool(x.temporary_expires_at and now <= x.temporary_expires_at <= now + timedelta(days=7)) for x in active),
        "failed_verification": sum(x.status == "verification_failed" for x in rows),
        "accepted_risks": sum(x.status == "risk_accepted" for x in rows),
    }


@router.get("")
async def list_plans(
    search: str | None = None, project_id: str | None = None, asset_id: str | None = None,
    severity: str | None = None, status: str | None = None, owner_id: str | None = None,
    mitigation_type: str | None = None, sla_state: str | None = None,
    date_from: datetime | None = None, date_to: datetime | None = None,
    sort: str = "updated_desc", page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user),
):
    q = select(MitigationPlan).options(*_options()).join(Project).outerjoin(Finding).where(project_access_clause(current_user))
    if project_id: q = q.where(MitigationPlan.project_id == project_id)
    if asset_id: q = q.where(MitigationPlan.id.in_(select(MitigationPlanAsset.plan_id).where(MitigationPlanAsset.asset_id == asset_id)))
    if severity: q = q.where(MitigationPlan.severity == severity)
    if status: q = q.where(MitigationPlan.status == status)
    if owner_id: q = q.where(MitigationPlan.owner_id == owner_id)
    if mitigation_type: q = q.where(MitigationPlan.mitigation_type == mitigation_type)
    if date_from: q = q.where(MitigationPlan.created_at >= date_from)
    if date_to: q = q.where(MitigationPlan.created_at <= date_to)
    if search:
        term = f"%{search.strip()}%"
        q = q.where(or_(func.cast(MitigationPlan.id, String).ilike(term), MitigationPlan.title.ilike(term), Finding.title.ilike(term)))
    now = utcnow()
    if sla_state == "overdue": q = q.where(MitigationPlan.sla_deadline < now, MitigationPlan.status.notin_(["closed", "cancelled", "rejected", "risk_accepted"]))
    if sla_state == "due_soon": q = q.where(MitigationPlan.sla_deadline.between(now, now + timedelta(hours=24)))
    order = {"deadline": MitigationPlan.sla_deadline.asc(), "severity": MitigationPlan.severity.asc(), "created_desc": MitigationPlan.created_at.desc()}.get(sort, MitigationPlan.updated_at.desc())
    total = await db.scalar(select(func.count()).select_from(q.order_by(None).subquery())) or 0
    plans = (await db.execute(q.order_by(order).offset((page - 1) * page_size).limit(page_size))).scalars().unique().all()
    ids = [x.id for x in plans]
    assets = (await db.execute(select(MitigationPlanAsset).options(selectinload(MitigationPlanAsset.asset)).where(MitigationPlanAsset.plan_id.in_(ids)))).scalars().all() if ids else []
    patches = (await db.execute(select(MitigationPatchLink).options(selectinload(MitigationPatchLink.patch)).where(MitigationPatchLink.plan_id.in_(ids)))).scalars().all() if ids else []
    return {"items": [serialize(x, [a for a in assets if a.plan_id == x.id], [p for p in patches if p.plan_id == x.id]) for x in plans], "total": total, "page": page, "page_size": page_size, "total_pages": (total + page_size - 1) // page_size}


@router.get("/export.csv")
async def export_csv(db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    plans = (await db.execute(select(MitigationPlan).options(selectinload(MitigationPlan.project), selectinload(MitigationPlan.finding), selectinload(MitigationPlan.owner)).join(Project).where(project_access_clause(current_user)).order_by(MitigationPlan.created_at.desc()))).scalars().all()
    output = io.StringIO(); writer = csv.writer(output)
    writer.writerow(["Mitigation ID", "Title", "Finding", "Project", "Severity", "Type", "Strategy", "Owner", "Status", "SLA Deadline", "Overdue", "Verification"])
    for x in plans:
        writer.writerow([f"MIT-{str(x.id)[:8].upper()}", x.title, x.finding.title if x.finding else "", x.project.name, x.severity, x.mitigation_type, x.strategy, x.owner.full_name if x.owner else "", x.status, x.sla_deadline.isoformat(), _derived(x)["overdue"], x.verification_outcome or ""])
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=mitigations.csv"})


@router.post("", status_code=201)
async def create_plan(payload: MitigationCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    if current_user.role == "viewer": raise HTTPException(status_code=403, detail="Read-only users cannot create mitigation plans")
    await get_project_or_404(db, payload.project_id, current_user)
    finding = (await db.execute(select(Finding).join(Scan).where(Finding.id == payload.finding_id, Scan.project_id == payload.project_id))).scalar_one_or_none()
    if not finding: raise HTTPException(status_code=400, detail="Finding does not belong to this project")
    if payload.asset_ids:
        count = await db.scalar(select(func.count(Asset.id)).where(Asset.id.in_(payload.asset_ids), Asset.project_id == payload.project_id))
        if count != len(set(payload.asset_ids)): raise HTTPException(status_code=400, detail="All assets must belong to the selected project")
    if payload.patch_ids:
        count = await db.scalar(select(func.count(PatchRecord.id)).where(PatchRecord.id.in_(payload.patch_ids), PatchRecord.project_id == payload.project_id))
        if count != len(set(payload.patch_ids)): raise HTTPException(status_code=400, detail="All patch plans must belong to the selected project")
    user_ids = {x for x in [payload.owner_id, payload.risk_owner_id, *[t.assignee_id for t in payload.tasks]] if x}
    if user_ids:
        count = await db.scalar(select(func.count(UserModel.id)).where(UserModel.id.in_(user_ids), UserModel.is_active.is_(True)))
        if count != len(user_ids): raise HTTPException(status_code=400, detail="Owner or assignee is not an active user")
    severity = finding.severity.lower() if finding.severity.lower() in SEVERITIES else "low"
    deadline = naive_utc(payload.target_completion_date) or utcnow() + timedelta(hours=SLA_HOURS[severity])
    values = payload.model_dump(exclude={"asset_ids", "patch_ids", "tasks", "controls", "risk", "target_completion_date", "risk_acceptance_required", "priority"})
    for key in ("start_date", "temporary_expires_at", "permanent_remediation_due_at"):
        values[key] = naive_utc(values.get(key))
    plan = MitigationPlan(**values, severity=severity, priority=payload.priority or severity, sla_deadline=deadline, requested_by=current_user.id, status="draft")
    db.add(plan); await db.flush()
    for asset_id in set(payload.asset_ids or ([finding.asset_id] if finding.asset_id else [])): db.add(MitigationPlanAsset(plan_id=plan.id, asset_id=asset_id))
    for patch_id in set(payload.patch_ids): db.add(MitigationPatchLink(plan_id=plan.id, patch_id=patch_id))
    for task in payload.tasks:
        task_values = task.model_dump(); task_values["due_at"] = naive_utc(task_values.get("due_at"))
        db.add(MitigationTask(plan_id=plan.id, **task_values))
    for control in payload.controls:
        control_values = control.model_dump(); control_values["expires_at"] = naive_utc(control_values.get("expires_at"))
        db.add(MitigationControl(plan_id=plan.id, **control_values))
    db.add(MitigationRiskAssessment(plan_id=plan.id, initial_severity=severity, assessed_by=current_user.id, **payload.risk.model_dump()))
    details = {"finding_id": str(finding.id), "risk_acceptance_required": payload.risk_acceptance_required}
    db.add(MitigationHistory(plan_id=plan.id, actor_id=current_user.id, action="mitigation_created", new_status="draft", details=details))
    db.add(AuditLog(project_id=plan.project_id, actor_id=current_user.id, event_type="mitigation", action="mitigation_created", details={"mitigation_id": str(plan.id), "title": plan.title, "status": plan.status, **details}))
    await db.commit()
    return await get_plan(str(plan.id), db, current_user)


@router.get("/{plan_id}")
async def get_plan(plan_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    plan = await _plan_or_404(db, plan_id, current_user)
    assets = (await db.execute(select(MitigationPlanAsset).options(selectinload(MitigationPlanAsset.asset)).where(MitigationPlanAsset.plan_id == plan.id))).scalars().all()
    patches = (await db.execute(select(MitigationPatchLink).options(selectinload(MitigationPatchLink.patch)).where(MitigationPatchLink.plan_id == plan.id))).scalars().all()
    return serialize(plan, assets, patches)


@router.patch("/{plan_id}")
async def update_plan(plan_id: str, payload: MitigationUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    plan = await _plan_or_404(db, plan_id, current_user)
    if not _can_edit(current_user, plan): raise HTTPException(status_code=403, detail="You cannot edit this mitigation plan")
    if plan.status not in {"draft", "rejected", "approved", "scheduled", "in_progress", "verification_failed"}: raise HTTPException(status_code=409, detail="Plan cannot be edited in its current state")
    updates = payload.model_dump(exclude_unset=True)
    for key in ("start_date", "sla_deadline", "temporary_expires_at"):
        if key in updates: updates[key] = naive_utc(updates[key])
    if updates.get("blocked") and not (updates.get("blocked_reason") or plan.blocked_reason): raise HTTPException(status_code=400, detail="Blocked plans require a reason")
    previous_deadline = plan.sla_deadline
    for key, value in updates.items(): setattr(plan, key, value)
    details = {"fields": sorted(updates)}
    if "sla_deadline" in updates: details["deadline_history"] = {"previous": previous_deadline.isoformat(), "new": plan.sla_deadline.isoformat()}
    db.add(_history(plan, current_user, "mitigation_updated", plan.status, details))
    await db.commit(); return await get_plan(plan_id, db, current_user)


@router.post("/{plan_id}/transition")
async def transition(plan_id: str, payload: TransitionInput, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    plan = await _plan_or_404(db, plan_id, current_user); target = payload.status
    if target not in STATUSES or target not in TRANSITIONS.get(plan.status, set()): raise HTTPException(status_code=409, detail=f"Cannot move mitigation from {plan.status} to {target}")
    if not _can_edit(current_user, plan): raise HTTPException(status_code=403, detail="You cannot transition this plan")
    if target == "pending_approval":
        if not plan.owner_id or not plan.controls or not plan.verification_criteria: raise HTTPException(status_code=400, detail="Owner, controls, and verification criteria are required before approval")
        plan.approvals.clear()
        stages = ["security_review", "technical_approval"]
        if plan.severity in {"critical", "high"} or plan.potential_service_impact: stages.append("business_risk_owner")
        for stage in stages: plan.approvals.append(MitigationApproval(stage=stage, requested_by=current_user.id))
    if target == "implemented":
        incomplete = [x for x in plan.tasks if x.status != "completed"]
        if incomplete: raise HTTPException(status_code=400, detail="All implementation tasks must be completed")
        if not plan.evidence: raise HTTPException(status_code=400, detail="Implementation evidence is required")
        plan.implemented_at = utcnow()
    if target == "pending_verification":
        if current_user.id == plan.owner_id: pass
        plan.verifications.append(MitigationVerification(requested_by=current_user.id))
        if plan.finding and plan.finding.status not in {"fixed", "false_positive"}: plan.finding.status = "ready_for_retest"
    if target == "closed": plan.closed_at = utcnow()
    if target == "cancelled" and not (payload.reason or "").strip(): raise HTTPException(status_code=400, detail="Cancellation reason is required")
    previous = plan.status; plan.status = target
    db.add(_history(plan, current_user, f"mitigation_{target}", previous, {"reason": payload.reason}))
    await db.commit(); return await get_plan(plan_id, db, current_user)


@router.post("/{plan_id}/approvals/{approval_id}")
async def decide_approval(plan_id: str, approval_id: str, payload: ApprovalDecision, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    if current_user.role not in REVIEW_ROLES: raise HTTPException(status_code=403, detail="Authorized reviewer role required")
    plan = await _plan_or_404(db, plan_id, current_user)
    if plan.status != "pending_approval": raise HTTPException(status_code=409, detail="Plan is not awaiting approval")
    if current_user.id == plan.requested_by or current_user.id == plan.owner_id: raise HTTPException(status_code=403, detail="Plan authors and implementers cannot self-approve")
    approval = next((x for x in plan.approvals if str(x.id) == approval_id), None)
    if not approval: raise HTTPException(status_code=404, detail="Approval stage not found")
    if approval.status != "pending": raise HTTPException(status_code=409, detail="Approval stage already decided")
    if payload.decision not in {"approved", "rejected", "changes_requested"}: raise HTTPException(status_code=400, detail="Invalid approval decision")
    approval.status = payload.decision; approval.comments = payload.comments; approval.reviewer_id = current_user.id; approval.decided_at = utcnow()
    previous = plan.status
    if payload.decision == "rejected": plan.status = "rejected"
    elif payload.decision == "changes_requested": plan.status = "draft"
    elif all(x.status == "approved" for x in plan.approvals): plan.status = "approved"; plan.approved_by = current_user.id
    db.add(_history(plan, current_user, f"mitigation_approval_{payload.decision}", previous, {"stage": approval.stage, "comments": payload.comments}))
    await db.commit(); return await get_plan(plan_id, db, current_user)


@router.patch("/{plan_id}/tasks/{task_id}")
async def update_task(plan_id: str, task_id: str, payload: TaskUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    plan = await _plan_or_404(db, plan_id, current_user)
    task = next((x for x in plan.tasks if str(x.id) == task_id), None)
    if not task: raise HTTPException(status_code=404, detail="Mitigation task not found")
    if not _can_edit(current_user, plan) and current_user.id != task.assignee_id: raise HTTPException(status_code=403, detail="You cannot update this task")
    if payload.status not in {"pending", "in_progress", "blocked", "completed"}: raise HTTPException(status_code=400, detail="Invalid task status")
    if payload.status == "completed" and not (payload.evidence or task.evidence): raise HTTPException(status_code=400, detail="Task completion requires evidence")
    task.status = payload.status
    if payload.evidence is not None: task.evidence = payload.evidence
    task.completed_at = utcnow() if payload.status == "completed" else None
    db.add(_history(plan, current_user, "mitigation_task_updated", plan.status, {"task_id": task_id, "task_status": payload.status}))
    await db.commit(); return await get_plan(plan_id, db, current_user)


@router.post("/{plan_id}/evidence", status_code=201)
async def add_evidence(plan_id: str, payload: EvidenceInput, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    plan = await _plan_or_404(db, plan_id, current_user)
    if not _can_edit(current_user, plan): raise HTTPException(status_code=403, detail="You cannot add evidence")
    allowed = {"configuration", "firewall_rule", "change_request", "git_commit", "deployment", "command_output", "security_test", "document"}
    if payload.evidence_type not in allowed: raise HTTPException(status_code=400, detail="Unsupported evidence type")
    if payload.reference.startswith(("http://", "https://")): raise HTTPException(status_code=400, detail="Public evidence URLs are not allowed; use an internal reference")
    item = MitigationEvidence(plan_id=plan.id, uploaded_by=current_user.id, evidence_type=payload.evidence_type, title=payload.title, reference=payload.reference, task_id=payload.task_id, metadata_json=payload.metadata, sha256=payload.sha256)
    db.add(item); db.add(_history(plan, current_user, "mitigation_evidence_added", plan.status, {"evidence_type": payload.evidence_type, "title": payload.title}))
    await db.commit(); return await get_plan(plan_id, db, current_user)


@router.post("/{plan_id}/verification")
async def verify(plan_id: str, payload: VerificationDecision, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    if current_user.role not in REVIEW_ROLES: raise HTTPException(status_code=403, detail="Independent security reviewer role required")
    plan = await _plan_or_404(db, plan_id, current_user)
    if plan.status != "pending_verification": raise HTTPException(status_code=409, detail="Plan is not pending verification")
    if current_user.id in {plan.owner_id, plan.requested_by}: raise HTTPException(status_code=403, detail="Verification must be independent of proposal and implementation")
    if payload.outcome not in {"effective", "partially_effective", "ineffective", "inconclusive"}: raise HTTPException(status_code=400, detail="Invalid verification outcome")
    if not plan.evidence or not payload.evidence: raise HTTPException(status_code=400, detail="Implementation and verification evidence are required")
    attempt = next((x for x in reversed(plan.verifications) if x.outcome is None), None) or MitigationVerification(plan_id=plan.id, requested_by=plan.requested_by)
    if attempt not in plan.verifications: plan.verifications.append(attempt)
    attempt.verifier_id = current_user.id; attempt.outcome = payload.outcome; attempt.comments = payload.comments; attempt.residual_risk = payload.residual_risk; attempt.evidence = payload.evidence; attempt.completed_at = utcnow()
    previous = plan.status; plan.verifier_id = current_user.id; plan.verification_outcome = payload.outcome; plan.effectiveness = payload.outcome
    plan.risk_assessments.append(MitigationRiskAssessment(plan_id=plan.id, initial_severity=plan.severity, actual_residual_risk=payload.residual_risk, assessed_by=current_user.id))
    if payload.outcome == "effective": plan.status = "verified"; plan.verified_at = utcnow()
    else: plan.status = "verification_failed"
    db.add(_history(plan, current_user, f"mitigation_verification_{payload.outcome}", previous, {"residual_risk": payload.residual_risk}))
    await db.commit(); return await get_plan(plan_id, db, current_user)


@router.post("/{plan_id}/risk-acceptance")
async def accept_risk(plan_id: str, payload: RiskAcceptanceInput, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    if current_user.role not in {"admin", "manager"}: raise HTTPException(status_code=403, detail="Business or delegated risk-owner approval is required")
    plan = await _plan_or_404(db, plan_id, current_user)
    if current_user.id == plan.requested_by and current_user.role != "admin": raise HTTPException(status_code=403, detail="The finding proposer cannot solely accept residual risk")
    review_at = naive_utc(payload.review_at)
    if review_at <= utcnow(): raise HTTPException(status_code=400, detail="Risk acceptance review date must be in the future")
    previous = plan.status; plan.status = "risk_accepted"
    plan.exceptions.append(MitigationException(exception_type="risk_acceptance", justification=payload.justification, residual_risk=payload.residual_risk, review_at=review_at, approved_by=current_user.id))
    db.add(_history(plan, current_user, "mitigation_risk_accepted", previous, {"residual_risk": payload.residual_risk, "review_at": review_at.isoformat()}))
    await db.commit(); return await get_plan(plan_id, db, current_user)
