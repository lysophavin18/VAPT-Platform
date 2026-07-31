"""
NoovaStack VAPT Platform - Scan Schedule Routes
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from database.models import ScanSchedule, Project
from auth import require_user, User, require_manager
from api.schemas import ScanScheduleCreate, ScanScheduleResponse

router = APIRouter()


@router.post("", response_model=ScanScheduleResponse, status_code=status.HTTP_201_CREATED)
async def create_schedule(
    data: ScanScheduleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    proj = await db.execute(select(Project).where(Project.id == data.project_id))
    if not proj.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

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
        report_options=data.report_options,
        created_by=current_user.id,
    )
    db.add(schedule)
    await db.commit()
    await db.refresh(schedule)
    return schedule


@router.get("", response_model=list[ScanScheduleResponse])
async def list_schedules(
    project_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    query = select(ScanSchedule)
    if project_id:
        query = query.where(ScanSchedule.project_id == project_id)
    if current_user.role not in ("admin", "manager"):
        query = query.where(ScanSchedule.created_by == current_user.id)
    result = await db.execute(query.order_by(ScanSchedule.created_at.desc()))
    return result.scalars().all()


@router.get("/{schedule_id}", response_model=ScanScheduleResponse)
async def get_schedule(
    schedule_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    result = await db.execute(select(ScanSchedule).where(ScanSchedule.id == schedule_id))
    sched = result.scalar_one_or_none()
    if not sched:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return sched


@router.patch("/{schedule_id}", response_model=ScanScheduleResponse)
async def update_schedule(
    schedule_id: str,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    result = await db.execute(select(ScanSchedule).where(ScanSchedule.id == schedule_id))
    sched = result.scalar_one_or_none()
    if not sched:
        raise HTTPException(status_code=404, detail="Schedule not found")
    for key, value in data.items():
        if hasattr(sched, key):
            setattr(sched, key, value)
    await db.commit()
    await db.refresh(sched)
    return sched


@router.post("/{schedule_id}/enable", response_model=ScanScheduleResponse)
async def enable_schedule(
    schedule_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    result = await db.execute(select(ScanSchedule).where(ScanSchedule.id == schedule_id))
    sched = result.scalar_one_or_none()
    if not sched:
        raise HTTPException(status_code=404, detail="Schedule not found")
    sched.status = "active"
    await db.commit()
    await db.refresh(sched)
    return sched


@router.post("/{schedule_id}/pause", response_model=ScanScheduleResponse)
async def pause_schedule(
    schedule_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    result = await db.execute(select(ScanSchedule).where(ScanSchedule.id == schedule_id))
    sched = result.scalar_one_or_none()
    if not sched:
        raise HTTPException(status_code=404, detail="Schedule not found")
    sched.status = "paused"
    await db.commit()
    await db.refresh(sched)
    return sched


@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(
    schedule_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    result = await db.execute(select(ScanSchedule).where(ScanSchedule.id == schedule_id))
    sched = result.scalar_one_or_none()
    if not sched:
        raise HTTPException(status_code=404, detail="Schedule not found")
    await db.delete(sched)
    await db.commit()


@router.get("/{schedule_id}/history")
async def get_schedule_history(
    schedule_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    from database.models import ScheduleRun
    result = await db.execute(
        select(ScheduleRun)
        .where(ScheduleRun.schedule_id == schedule_id)
        .order_by(ScheduleRun.scheduled_for.desc())
        .limit(50)
    )
    runs = result.scalars().all()
    return [
        {
            "id": str(r.id),
            "scheduled_for": r.scheduled_for.isoformat() if r.scheduled_for else None,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "status": r.status,
            "blocked_reason": r.blocked_reason,
        }
        for r in runs
    ]
