"""NoovaStack VAPT Platform - Scan Schedule Routes."""
from datetime import datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.routes.approvals import approval_is_valid, expire_pending_approval
from api.schemas import ApprovalRequest, ScanScheduleCreate, ScanScheduleResponse, ScanScheduleUpdate, _require_valid_cron
from auth import User, get_project_or_404, get_schedule_or_404, project_access_clause, require_user
from database import get_db
from database.models import Approval, Asset, AuditLog, Engagement, Project, ScanProfile, ScanSchedule, ScheduleRun

router = APIRouter()


@router.post("", response_model=ScanScheduleResponse, status_code=status.HTTP_201_CREATED)
async def create_schedule(
    data: ScanScheduleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    await get_project_or_404(db, data.project_id, current_user)
    report_options = _merged_report_options(
        data.report_options,
        data.asset_ids if "asset_ids" in data.model_fields_set else None,
        data.config if "config" in data.model_fields_set else None,
    )
    await _validate_schedule_scope(db, data.project_id, data.engagement_id, report_options)

    schedule = ScanSchedule(
        project_id=data.project_id,
        engagement_id=data.engagement_id,
        name=data.name,
        assessment_mode=data.assessment_mode,
        scan_category=data.scan_category,
        scan_depth=data.scan_depth,
        recurrence_rule=data.recurrence_rule,
        timezone=data.timezone,
        cron_expression=data.cron_expression,
        next_run_at=data.next_run_at,
        testing_window=data.testing_window,
        report_options=report_options,
        status="draft",
        created_by=current_user.id,
    )
    db.add(schedule)
    await db.flush()
    db.add(_schedule_audit(schedule, current_user, "create_schedule", {"status": "draft"}))
    await db.commit()
    await db.refresh(schedule)
    return schedule


@router.get("", response_model=list[ScanScheduleResponse])
async def list_schedules(
    project_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    if project_id:
        await get_project_or_404(db, project_id, current_user)
    query = (
        select(ScanSchedule)
        .join(Project, Project.id == ScanSchedule.project_id)
        .where(project_access_clause(current_user))
    )
    if project_id:
        query = query.where(ScanSchedule.project_id == project_id)
    result = await db.execute(query.order_by(ScanSchedule.created_at.desc()))
    return result.scalars().all()


@router.get("/{schedule_id}", response_model=ScanScheduleResponse)
async def get_schedule(
    schedule_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    return await get_schedule_or_404(db, schedule_id, current_user)


@router.patch("/{schedule_id}", response_model=ScanScheduleResponse)
async def update_schedule(
    schedule_id: str,
    data: ScanScheduleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    schedule = await get_schedule_or_404(db, schedule_id, current_user)
    updates = data.model_dump(exclude_unset=True)
    report_options = _merged_report_options(
        updates.get("report_options", schedule.report_options or {}),
        updates.get("asset_ids"),
        updates.get("config"),
    )
    if {"report_options", "asset_ids", "config"}.intersection(updates):
        updates["report_options"] = report_options
    updates.pop("asset_ids", None)
    updates.pop("config", None)

    engagement_id = updates.get("engagement_id", schedule.engagement_id)
    await _validate_schedule_scope(db, schedule.project_id, engagement_id, report_options)
    try:
        _require_valid_cron(
            updates.get("recurrence_rule", schedule.recurrence_rule),
            updates.get("cron_expression", schedule.cron_expression),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    security_fields = {
        "assessment_mode", "scan_category", "scan_depth", "engagement_id",
        "testing_window", "report_options",
    }
    changed_security_fields = _changed_fields(schedule, updates, security_fields)
    for key, value in updates.items():
        setattr(schedule, key, value)
    if changed_security_fields:
        await _supersede_schedule_approvals(db, schedule, current_user, changed_security_fields)
    db.add(_schedule_audit(schedule, current_user, "update_schedule", {"fields": sorted(updates)}))
    await db.commit()
    await db.refresh(schedule)
    return schedule


@router.post("/{schedule_id}/request-approval")
async def request_schedule_approval(
    schedule_id: str,
    data: ApprovalRequest | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    schedule = await get_schedule_or_404(db, schedule_id, current_user)
    now = datetime.utcnow()
    active_approvals = (
        await db.execute(
            select(Approval).where(
                Approval.schedule_id == schedule.id,
                Approval.status.in_(["pending", "approved"]),
            )
        )
    ).scalars().all()
    pending_approval = None
    approval = None
    for item in active_approvals:
        if expire_pending_approval(item, now):
            db.add(_schedule_audit(schedule, current_user, "schedule_approval_expired", {"approval_id": str(item.id)}))
        elif approval is None and approval_is_valid(item, now):
            approval = item
        elif pending_approval is None and item.status == "pending":
            pending_approval = item
    approval = approval or pending_approval
    if not approval:
        profile = await _resolve_schedule_profile(db, schedule)
        approval = Approval(
            schedule_id=schedule.id,
            action="schedule_enable",
            risk_level=_schedule_risk(schedule, profile),
            requested_by=current_user.id,
            reason=data.reason if data else "Controlled schedule enable review requested.",
            expires_at=now + timedelta(hours=24),
        )
        db.add(approval)
        await db.flush()
    schedule.status = "approved" if approval_is_valid(approval, now) else "pending_review"
    db.add(_schedule_audit(schedule, current_user, "schedule_approval_requested", {"approval_id": str(approval.id), "risk_level": approval.risk_level}))
    await db.commit()
    return {"status": "approved" if approval_is_valid(approval, now) else "requested", "approval_id": str(approval.id)}


@router.post("/{schedule_id}/enable", response_model=ScanScheduleResponse)
async def enable_schedule(
    schedule_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    schedule = await get_schedule_or_404(db, schedule_id, current_user)
    await _validate_schedule_scope(db, schedule.project_id, schedule.engagement_id, schedule.report_options or {})
    profile = await _resolve_schedule_profile(db, schedule)
    approvals = []
    if _schedule_approval_required(schedule, profile):
        approvals = (
            await db.execute(
                select(Approval).where(Approval.schedule_id == schedule.id, Approval.status == "approved")
            )
        ).scalars().all()
        if not _schedule_enable_allowed(schedule, profile, approvals):
            raise HTTPException(status_code=400, detail="A valid schedule approval is required before enabling this high-risk schedule")
    schedule.status = "active"
    db.add(_schedule_audit(schedule, current_user, "enable_schedule", {"approval_required": _schedule_approval_required(schedule, profile)}))
    await db.commit()
    await db.refresh(schedule)
    return schedule


@router.post("/{schedule_id}/pause", response_model=ScanScheduleResponse)
async def pause_schedule(
    schedule_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    schedule = await get_schedule_or_404(db, schedule_id, current_user)
    schedule.status = "paused"
    db.add(_schedule_audit(schedule, current_user, "pause_schedule", {}))
    await db.commit()
    await db.refresh(schedule)
    return schedule


@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(
    schedule_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    schedule = await get_schedule_or_404(db, schedule_id, current_user)
    await db.delete(schedule)
    await db.commit()


@router.get("/{schedule_id}/history")
async def get_schedule_history(
    schedule_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    await get_schedule_or_404(db, schedule_id, current_user)
    runs = (
        await db.execute(
            select(ScheduleRun)
            .where(ScheduleRun.schedule_id == schedule_id)
            .order_by(ScheduleRun.scheduled_for.desc())
            .limit(50)
        )
    ).scalars().all()
    return [
        {
            "id": str(run.id),
            "scheduled_for": run.scheduled_for.isoformat() if run.scheduled_for else None,
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "status": run.status,
            "blocked_reason": run.blocked_reason,
        }
        for run in runs
    ]


def _merged_report_options(report_options: dict, asset_ids: list[UUID] | None, config: dict | None) -> dict:
    merged = dict(report_options or {})
    if asset_ids is not None:
        merged["asset_ids"] = [str(asset_id) for asset_id in asset_ids]
    if config is not None:
        merged["config"] = config
    return merged


async def _validate_schedule_scope(db: AsyncSession, project_id, engagement_id, report_options: dict) -> None:
    if engagement_id:
        engagement = (
            await db.execute(
                select(Engagement).where(Engagement.id == engagement_id, Engagement.project_id == project_id)
            )
        ).scalar_one_or_none()
        if not engagement:
            raise HTTPException(status_code=400, detail="Engagement must belong to the schedule project")
    try:
        asset_ids = [UUID(str(asset_id)) for asset_id in (report_options.get("asset_ids") or [])]
    except (TypeError, ValueError, AttributeError):
        raise HTTPException(status_code=400, detail="Schedule asset IDs must be valid UUIDs")
    if asset_ids:
        assets = (
            await db.execute(select(Asset).where(Asset.id.in_(asset_ids), Asset.project_id == project_id))
        ).scalars().all()
        if len({asset.id for asset in assets}) != len(set(asset_ids)):
            raise HTTPException(status_code=400, detail="All schedule assets must belong to the schedule project")


async def _resolve_schedule_profile(db: AsyncSession, schedule: ScanSchedule) -> ScanProfile | None:
    return (
        await db.execute(
            select(ScanProfile).where(
                ScanProfile.category.in_([schedule.scan_category, "website"]),
                ScanProfile.depth == schedule.scan_depth,
                ScanProfile.enabled == True,
            ).limit(1)
        )
    ).scalar_one_or_none()


def _schedule_approval_required(schedule: ScanSchedule, profile: ScanProfile | None) -> bool:
    """Every schedule requires Security Team approval before it can be enabled."""
    return True


def _schedule_enable_allowed(schedule: ScanSchedule, profile: ScanProfile | None, approvals: list[Approval]) -> bool:
    return not _schedule_approval_required(schedule, profile) or any(
        approval_is_valid(approval) for approval in approvals
    )


def _schedule_risk(schedule: ScanSchedule, profile: ScanProfile | None) -> str:
    if (profile and profile.risk_level in ("high", "critical")) or schedule.scan_depth in ("deep", "custom") or schedule.assessment_mode == "white_box":
        return "high"
    if schedule.scan_depth == "standard" or schedule.assessment_mode == "gray_box":
        return "medium"
    return "low"


async def _supersede_schedule_approvals(db: AsyncSession, schedule: ScanSchedule, current_user: User, fields: set[str]) -> None:
    approvals = (
        await db.execute(
            select(Approval).where(
                Approval.schedule_id == schedule.id,
                Approval.status.in_(["pending", "approved"]),
            )
        )
    ).scalars().all()
    for approval in approvals:
        approval.status = "superseded"
        approval.decided_at = datetime.utcnow()
        db.add(_schedule_audit(schedule, current_user, "schedule_approval_superseded", {"approval_id": str(approval.id), "fields": sorted(fields)}))
    schedule.status = "draft"


def _schedule_audit(schedule: ScanSchedule, user: User, action: str, details: dict) -> AuditLog:
    return AuditLog(
        project_id=schedule.project_id,
        actor_id=user.id,
        event_type="schedule" if "approval" not in action else "approval",
        action=action,
        details={"schedule_id": str(schedule.id), **details},
    )


def _changed_fields(resource, updates: dict, security_fields: set[str]) -> set[str]:
    return {
        key for key in security_fields.intersection(updates)
        if getattr(resource, key) != updates[key]
    }
