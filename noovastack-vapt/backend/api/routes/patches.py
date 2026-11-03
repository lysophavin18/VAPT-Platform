from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from auth import User, get_project_or_404, project_access_clause, require_user
from database import get_db
from database.models import Asset, AuditLog, Finding, PatchRecord, Project, Scan, User as UserModel

router = APIRouter()

PRIORITIES = {"critical", "high", "medium", "low"}
STATUSES = {"draft", "review", "approved", "scheduled", "deploying", "verification", "completed", "blocked", "failed", "rollback_required", "rolled_back", "rejected"}
TRANSITIONS = {
    "draft": {"review"}, "review": {"approved", "rejected", "draft"},
    "approved": {"scheduled", "blocked"}, "scheduled": {"deploying", "blocked"},
    "deploying": {"verification", "failed", "rollback_required"},
    "verification": {"completed", "failed", "rollback_required"},
    "failed": {"scheduled", "rollback_required"}, "blocked": {"approved", "scheduled"},
    "rollback_required": {"rolled_back"}, "rolled_back": {"scheduled"},
    "rejected": {"draft"}, "completed": set(),
}


class PatchCreate(BaseModel):
    project_id: UUID
    asset_id: UUID | None = None
    finding_id: UUID | None = None
    cve_id: str | None = Field(default=None, max_length=32)
    title: str = Field(min_length=3, max_length=500)
    package_name: str | None = Field(default=None, max_length=255)
    installed_version: str | None = Field(default=None, max_length=255)
    fixed_version: str | None = Field(default=None, max_length=255)
    priority: str = "medium"
    owner_id: UUID | None = None
    due_at: datetime | None = None
    remediation: str | None = None
    rollback_plan: str | None = None


class PatchUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=500)
    package_name: str | None = None
    installed_version: str | None = None
    fixed_version: str | None = None
    priority: str | None = None
    owner_id: UUID | None = None
    due_at: datetime | None = None
    maintenance_start: datetime | None = None
    maintenance_end: datetime | None = None
    remediation: str | None = None
    rollback_plan: str | None = None
    deployment_evidence: dict[str, Any] | None = None
    verification_notes: str | None = None

    @model_validator(mode="after")
    def valid_window(self):
        if self.maintenance_start and self.maintenance_end and self.maintenance_end <= self.maintenance_start:
            raise ValueError("Maintenance end must be after maintenance start")
        return self


class PatchTransition(BaseModel):
    status: str
    reason: str | None = Field(default=None, max_length=2000)
    deployment_evidence: dict[str, Any] | None = None
    verification_notes: str | None = None


def serialize_patch(item: PatchRecord) -> dict:
    return {
        "id": str(item.id), "project_id": str(item.project_id),
        "project_name": item.project.name if item.project else "Unknown project",
        "asset_id": str(item.asset_id) if item.asset_id else None,
        "asset_value": (item.asset.name or item.asset.value) if item.asset else None,
        "finding_id": str(item.finding_id) if item.finding_id else None,
        "finding_title": item.finding.title if item.finding else None,
        "finding_status": item.finding.status if item.finding else None,
        "cve_id": item.cve_id, "title": item.title, "package_name": item.package_name,
        "installed_version": item.installed_version, "fixed_version": item.fixed_version,
        "priority": item.priority, "status": item.status,
        "owner_id": str(item.owner_id) if item.owner_id else None,
        "owner_name": (item.owner.full_name or item.owner.username) if item.owner else None,
        "requested_by": str(item.requested_by) if item.requested_by else None,
        "approved_by": str(item.approved_by) if item.approved_by else None,
        "due_at": item.due_at, "maintenance_start": item.maintenance_start, "maintenance_end": item.maintenance_end,
        "remediation": item.remediation, "rollback_plan": item.rollback_plan,
        "deployment_evidence": item.deployment_evidence or {}, "verification_notes": item.verification_notes,
        "deployed_at": item.deployed_at, "verified_at": item.verified_at,
        "created_at": item.created_at, "updated_at": item.updated_at,
    }


def _editable(user: User, item: PatchRecord) -> bool:
    return user.role in {"admin", "manager", "security_team"} or str(item.requested_by) == str(user.id)


def _finding_cve(finding: Finding) -> str | None:
    raw = finding.raw_output or {}
    value = raw.get("cve_id") or raw.get("cve")
    if value:
        return str(value).upper()[:32]
    for token in finding.title.replace("(", " ").replace(")", " ").split():
        if token.upper().startswith("CVE-"):
            return token.strip(".,:;[]").upper()[:32]
    return None


async def _create_from_finding(db: AsyncSession, finding: Finding, project_id, user: User) -> tuple[PatchRecord, bool]:
    duplicate = (await db.execute(select(PatchRecord).where(PatchRecord.finding_id == finding.id))).scalar_one_or_none()
    if duplicate:
        return duplicate, False
    raw = finding.raw_output or {}
    priority = finding.severity.lower() if finding.severity.lower() in PRIORITIES else "low"
    item = PatchRecord(
        project_id=project_id, asset_id=finding.asset_id, finding_id=finding.id,
        cve_id=_finding_cve(finding), title=f"Patch: {finding.title}"[:500],
        package_name=raw.get("package") or raw.get("product"),
        installed_version=raw.get("installed_version") or raw.get("version"),
        fixed_version=raw.get("fixed_version"), priority=priority, status="draft",
        remediation=finding.remediation or finding.ai_remediation,
        requested_by=user.id,
    )
    finding.status = "patch_planned"
    db.add(item); await db.flush()
    db.add(AuditLog(project_id=project_id, scan_id=finding.scan_id, actor_id=user.id, event_type="patch", action="patch_created_from_finding", details={"patch_id": str(item.id), "finding_id": str(finding.id), "title": item.title, "priority": priority, "cve_id": item.cve_id}))
    return item, True


async def _patch_or_404(db: AsyncSession, patch_id: str, user: User) -> PatchRecord:
    result = await db.execute(select(PatchRecord).options(selectinload(PatchRecord.project), selectinload(PatchRecord.asset), selectinload(PatchRecord.finding), selectinload(PatchRecord.owner)).where(PatchRecord.id == patch_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Patch record not found")
    await get_project_or_404(db, str(item.project_id), user)
    return item


@router.get("")
async def list_patches(
    project_id: str | None = None, priority: str | None = None, status: str | None = None,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user),
):
    if project_id:
        await get_project_or_404(db, project_id, current_user)
    query = select(PatchRecord).options(selectinload(PatchRecord.project), selectinload(PatchRecord.asset), selectinload(PatchRecord.finding), selectinload(PatchRecord.owner)).join(Project, Project.id == PatchRecord.project_id).where(project_access_clause(current_user))
    if project_id: query = query.where(PatchRecord.project_id == project_id)
    if priority: query = query.where(PatchRecord.priority == priority)
    if status: query = query.where(PatchRecord.status == status)
    rows = (await db.execute(query.order_by(PatchRecord.created_at.desc()).limit(500))).scalars().unique().all()
    return [serialize_patch(item) for item in rows]


@router.post("/from-finding/{finding_id}", status_code=201)
async def create_patch_from_finding(finding_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    if current_user.role == "viewer": raise HTTPException(status_code=403, detail="Read-only users cannot create patch plans")
    result = await db.execute(select(Finding, Scan.project_id).join(Scan, Scan.id == Finding.scan_id).join(Project, Project.id == Scan.project_id).where(Finding.id == finding_id, project_access_clause(current_user)))
    row = result.one_or_none()
    if not row: raise HTTPException(status_code=404, detail="Finding not found")
    item, created = await _create_from_finding(db, row[0], row[1], current_user)
    if not created:
        raise HTTPException(status_code=409, detail=f"A patch plan already exists for this finding: {item.id}")
    await db.commit()
    return serialize_patch(await _patch_or_404(db, str(item.id), current_user))


@router.post("/sync-findings")
async def sync_patchable_findings(db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    if current_user.role == "viewer": raise HTTPException(status_code=403, detail="Read-only users cannot synchronize patch plans")
    rows = (await db.execute(select(Finding, Scan.project_id).join(Scan, Scan.id == Finding.scan_id).join(Project, Project.id == Scan.project_id).where(project_access_clause(current_user), Finding.status.in_(["confirmed", "ready_for_retest", "not_fixed", "partially_fixed"])).order_by(Finding.created_at.desc()).limit(200))).all()
    created_ids = []
    skipped = 0
    for finding, project_id in rows:
        item, created = await _create_from_finding(db, finding, project_id, current_user)
        if created: created_ids.append(str(item.id))
        else: skipped += 1
    await db.commit()
    return {"created": len(created_ids), "skipped_existing": skipped, "patch_ids": created_ids}


@router.get("/{patch_id}")
async def get_patch(patch_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    return serialize_patch(await _patch_or_404(db, patch_id, current_user))


@router.post("", status_code=201)
async def create_patch(payload: PatchCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    if current_user.role == "viewer":
        raise HTTPException(status_code=403, detail="Read-only users cannot create patch plans")
    await get_project_or_404(db, payload.project_id, current_user)
    if payload.priority not in PRIORITIES:
        raise HTTPException(status_code=400, detail="Invalid patch priority")
    if payload.asset_id:
        asset = (await db.execute(select(Asset).where(Asset.id == payload.asset_id, Asset.project_id == payload.project_id))).scalar_one_or_none()
        if not asset: raise HTTPException(status_code=400, detail="Asset does not belong to this project")
    if payload.finding_id:
        finding = (await db.execute(select(Finding).join(Scan).where(Finding.id == payload.finding_id, Scan.project_id == payload.project_id))).scalar_one_or_none()
        if not finding: raise HTTPException(status_code=400, detail="Finding does not belong to this project")
    if payload.owner_id:
        if not (await db.execute(select(UserModel).where(UserModel.id == payload.owner_id, UserModel.is_active == True))).scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Patch owner is not an active user")
    item = PatchRecord(**payload.model_dump(), requested_by=current_user.id, status="draft")
    db.add(item)
    await db.flush()
    db.add(AuditLog(project_id=item.project_id, actor_id=current_user.id, event_type="patch", action="patch_created", details={"patch_id": str(item.id), "title": item.title, "priority": item.priority, "cve_id": item.cve_id}))
    await db.commit()
    return serialize_patch(await _patch_or_404(db, str(item.id), current_user))


@router.patch("/{patch_id}")
async def update_patch(patch_id: str, payload: PatchUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    item = await _patch_or_404(db, patch_id, current_user)
    if not _editable(current_user, item): raise HTTPException(status_code=403, detail="You cannot edit this patch")
    if item.status not in {"draft", "review", "approved", "scheduled", "blocked", "failed"}:
        raise HTTPException(status_code=409, detail="Patch cannot be edited in its current state")
    updates = payload.model_dump(exclude_unset=True)
    if updates.get("priority") and updates["priority"] not in PRIORITIES: raise HTTPException(status_code=400, detail="Invalid patch priority")
    for key, value in updates.items(): setattr(item, key, value)
    db.add(AuditLog(project_id=item.project_id, actor_id=current_user.id, event_type="patch", action="patch_updated", details={"patch_id": str(item.id), "fields": sorted(updates)}))
    await db.commit()
    return serialize_patch(await _patch_or_404(db, str(item.id), current_user))


@router.post("/{patch_id}/transition")
async def transition_patch(patch_id: str, payload: PatchTransition, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    item = await _patch_or_404(db, patch_id, current_user)
    target = payload.status
    if target not in STATUSES or target not in TRANSITIONS.get(item.status, set()):
        raise HTTPException(status_code=409, detail=f"Cannot move patch from {item.status} to {target}")
    if target in {"approved", "rejected"} and current_user.role not in {"admin", "manager", "security_team"}:
        raise HTTPException(status_code=403, detail="Manager approval is required")
    if target in {"scheduled", "deploying", "verification", "completed", "failed", "rollback_required", "rolled_back"} and current_user.role not in {"admin", "manager", "security_team"}:
        raise HTTPException(status_code=403, detail="Elevated patch-management permission is required")
    if target == "scheduled" and (not item.maintenance_start or not item.maintenance_end):
        raise HTTPException(status_code=400, detail="Set a maintenance window before scheduling")
    evidence = payload.deployment_evidence or item.deployment_evidence or {}
    if target == "verification" and not evidence:
        raise HTTPException(status_code=400, detail="Deployment evidence is required before verification")
    if target in {"rejected", "failed", "blocked", "rollback_required"} and not (payload.reason or "").strip():
        raise HTTPException(status_code=400, detail="A reason is required for this transition")
    previous = item.status
    item.status = target
    if payload.deployment_evidence is not None: item.deployment_evidence = payload.deployment_evidence
    if payload.verification_notes is not None: item.verification_notes = payload.verification_notes
    if target == "approved": item.approved_by = current_user.id
    if target == "verification": item.deployed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    if item.finding and target in {"review", "approved", "scheduled", "deploying"}:
        item.finding.status = "remediation_in_progress"
    if item.finding and target == "verification":
        item.finding.status = "ready_for_retest"
    if item.finding and target == "failed":
        item.finding.status = "not_fixed"
    if item.finding and target in {"rollback_required", "rolled_back"}:
        item.finding.status = "remediation_in_progress"
    if target == "completed":
        item.verified_at = datetime.now(timezone.utc).replace(tzinfo=None)
        if item.finding: item.finding.status = "fixed"; item.finding.integrity_status = "verified"
    db.add(AuditLog(project_id=item.project_id, actor_id=current_user.id, event_type="patch", action=f"patch_{target}", details={"patch_id": str(item.id), "title": item.title, "priority": item.priority, "previous_status": previous, "status": target, "reason": payload.reason}))
    await db.commit()
    return serialize_patch(await _patch_or_404(db, str(item.id), current_user))
