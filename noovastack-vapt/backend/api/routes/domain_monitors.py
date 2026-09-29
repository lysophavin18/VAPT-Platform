"""
NoovaStack VAPT Platform - Domain Monitoring Routes

POST   /projects/{project_id}/domain-monitors          create
GET    /projects/{project_id}/domain-monitors          list
GET    /domain-monitors/{id}                           get (with recent events)
PATCH  /domain-monitors/{id}                          update (pause / change interval)
DELETE /domain-monitors/{id}                          delete (stop monitoring)
POST   /domain-monitors/{id}/check-now                trigger immediate check
POST   /domain-monitors/{id}/events/{event_id}/ack    acknowledge an event
GET    /domain-monitors/{id}/events                   paginated event history
"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from database.models import AuditLog, DomainMonitor, DomainMonitorEvent, Project
from auth import get_project_or_404, require_user, User
from api.schemas import (
    DomainMonitorCreate, DomainMonitorResponse, DomainMonitorUpdate,
    DomainMonitorEventResponse,
)

router = APIRouter()


async def _get_monitor_or_404(db: AsyncSession, monitor_id: str, user: User) -> DomainMonitor:
    result = await db.execute(
        select(DomainMonitor)
        .join(Project, Project.id == DomainMonitor.project_id)
        .where(DomainMonitor.id == monitor_id)
        .options(selectinload(DomainMonitor.events))
    )
    monitor = result.scalar_one_or_none()
    if not monitor:
        raise HTTPException(status_code=404, detail="Domain monitor not found")
    return monitor


@router.post(
    "/projects/{project_id}/domain-monitors",
    response_model=DomainMonitorResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_domain_monitor(
    project_id: str,
    data: DomainMonitorCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    """Register a domain for continuous monitoring."""
    await get_project_or_404(db, project_id, current_user)

    # Prevent duplicate active monitors for the same domain in a project
    existing = (await db.execute(
        select(DomainMonitor).where(
            DomainMonitor.project_id == project_id,
            DomainMonitor.domain == data.domain.strip().lower(),
            DomainMonitor.status != "stopped",
        )
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"{data.domain} is already being monitored in this project (id={existing.id})",
        )

    now = datetime.utcnow()
    monitor = DomainMonitor(
        project_id=project_id,
        domain=data.domain.strip().lower(),
        label=data.label,
        status="active",
        check_interval_hours=data.check_interval_hours,
        discovery_types=data.discovery_types,
        last_snapshot=[],
        next_check_at=now,   # trigger immediately on first beat tick
        created_by=current_user.id,
    )
    db.add(monitor)
    db.add(AuditLog(
        project_id=project_id,
        actor_id=current_user.id,
        event_type="domain_monitor",
        action="created",
        details={"domain": monitor.domain, "interval_hours": monitor.check_interval_hours},
    ))
    await db.commit()
    await db.refresh(monitor)
    return monitor


@router.get(
    "/projects/{project_id}/domain-monitors",
    response_model=list[DomainMonitorResponse],
)
async def list_domain_monitors(
    project_id: str,
    status_filter: str | None = Query(default=None, alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    await get_project_or_404(db, project_id, current_user)
    query = (
        select(DomainMonitor)
        .where(DomainMonitor.project_id == project_id)
        .options(selectinload(DomainMonitor.events))
        .order_by(DomainMonitor.created_at.desc())
    )
    if status_filter:
        query = query.where(DomainMonitor.status == status_filter)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/domain-monitors/{monitor_id}", response_model=DomainMonitorResponse)
async def get_domain_monitor(
    monitor_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    return await _get_monitor_or_404(db, monitor_id, current_user)


@router.patch("/domain-monitors/{monitor_id}", response_model=DomainMonitorResponse)
async def update_domain_monitor(
    monitor_id: str,
    data: DomainMonitorUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    monitor = await _get_monitor_or_404(db, monitor_id, current_user)
    updates = data.model_dump(exclude_unset=True)
    for k, v in updates.items():
        setattr(monitor, k, v)
    # If reactivating, reset next_check_at so it runs soon
    if updates.get("status") == "active" and not monitor.next_check_at:
        monitor.next_check_at = datetime.utcnow()
    await db.commit()
    await db.refresh(monitor)
    return monitor


@router.delete("/domain-monitors/{monitor_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_domain_monitor(
    monitor_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    monitor = await _get_monitor_or_404(db, monitor_id, current_user)
    await db.delete(monitor)
    await db.commit()


@router.post("/domain-monitors/{monitor_id}/check-now")
async def trigger_check_now(
    monitor_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    """Immediately dispatch a domain monitor check job."""
    monitor = await _get_monitor_or_404(db, monitor_id, current_user)
    if monitor.status == "stopped":
        raise HTTPException(status_code=400, detail="Monitor is stopped; reactivate it first")

    from workers.celery_app import run_domain_monitor_check
    task = run_domain_monitor_check.delay(str(monitor.id))
    monitor.celery_task_id = task.id
    await db.commit()
    return {
        "job_id": task.id,
        "status": "started",
        "domain": monitor.domain,
        "message": f"Check dispatched for {monitor.domain}",
    }


@router.get(
    "/domain-monitors/{monitor_id}/events",
    response_model=list[DomainMonitorEventResponse],
)
async def list_monitor_events(
    monitor_id: str,
    event_type: str | None = None,
    severity: str | None = None,
    unacknowledged_only: bool = False,
    limit: int = Query(default=50, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    await _get_monitor_or_404(db, monitor_id, current_user)
    query = (
        select(DomainMonitorEvent)
        .where(DomainMonitorEvent.monitor_id == monitor_id)
        .order_by(DomainMonitorEvent.detected_at.desc())
        .limit(limit)
    )
    if event_type:
        query = query.where(DomainMonitorEvent.event_type == event_type)
    if severity:
        query = query.where(DomainMonitorEvent.severity == severity)
    if unacknowledged_only:
        query = query.where(DomainMonitorEvent.acknowledged_at.is_(None))
    result = await db.execute(query)
    return result.scalars().all()


@router.post(
    "/domain-monitors/{monitor_id}/events/{event_id}/ack",
    response_model=DomainMonitorEventResponse,
)
async def acknowledge_event(
    monitor_id: str,
    event_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    await _get_monitor_or_404(db, monitor_id, current_user)
    event = (await db.execute(
        select(DomainMonitorEvent).where(
            DomainMonitorEvent.id == event_id,
            DomainMonitorEvent.monitor_id == monitor_id,
        )
    )).scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    event.acknowledged_at = datetime.utcnow()
    event.acknowledged_by = current_user.id
    await db.commit()
    await db.refresh(event)
    return event
