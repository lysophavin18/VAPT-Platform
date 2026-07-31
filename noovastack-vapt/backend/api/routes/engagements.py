"""
NoovaStack VAPT Platform - Engagement Routes
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from database.models import AuditLog, Engagement, Project
from auth import require_user, User, require_manager
from api.schemas import EngagementCreate, EngagementResponse

router = APIRouter()


@router.post("/projects/{project_id}/engagements", response_model=EngagementResponse, status_code=status.HTTP_201_CREATED)
async def create_engagement(
    project_id: str,
    data: EngagementCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    proj = await db.execute(select(Project).where(Project.id == project_id))
    if not proj.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    engagement = Engagement(
        project_id=project_id,
        name=data.name,
        assessment_mode=data.assessment_mode,
        start_date=data.start_date,
        end_date=data.end_date,
        testing_window_start=data.testing_window_start,
        testing_window_end=data.testing_window_end,
        rules_of_engagement=data.rules_of_engagement,
    )
    db.add(engagement)
    db.add(AuditLog(
        project_id=project_id,
        actor_id=current_user.id,
        event_type="engagement",
        action="created",
        details={"name": data.name, "assessment_mode": data.assessment_mode},
    ))
    await db.commit()
    await db.refresh(engagement)
    return engagement


@router.get("/projects/{project_id}/engagements", response_model=list[EngagementResponse])
async def list_engagements(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    result = await db.execute(
        select(Engagement)
        .where(Engagement.project_id == project_id)
        .order_by(Engagement.created_at.desc())
    )
    return result.scalars().all()


@router.get("/engagements/{engagement_id}", response_model=EngagementResponse)
async def get_engagement(
    engagement_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    result = await db.execute(select(Engagement).where(Engagement.id == engagement_id))
    eng = result.scalar_one_or_none()
    if not eng:
        raise HTTPException(status_code=404, detail="Engagement not found")
    return eng


@router.post("/engagements/{engagement_id}/authorize", response_model=EngagementResponse)
async def authorize_engagement(
    engagement_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    result = await db.execute(select(Engagement).where(Engagement.id == engagement_id))
    eng = result.scalar_one_or_none()
    if not eng:
        raise HTTPException(status_code=404, detail="Engagement not found")
    eng.authorization_status = "authorized"
    eng.status = "active"
    db.add(AuditLog(
        project_id=eng.project_id,
        engagement_id=eng.id,
        actor_id=current_user.id,
        event_type="engagement",
        action="authorized",
        details={"engagement_id": str(eng.id)},
    ))
    await db.commit()
    await db.refresh(eng)
    return eng


@router.post("/engagements/{engagement_id}/close", response_model=EngagementResponse)
async def close_engagement(
    engagement_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    result = await db.execute(select(Engagement).where(Engagement.id == engagement_id))
    eng = result.scalar_one_or_none()
    if not eng:
        raise HTTPException(status_code=404, detail="Engagement not found")
    eng.status = "closed"
    db.add(AuditLog(
        project_id=eng.project_id,
        engagement_id=eng.id,
        actor_id=current_user.id,
        event_type="engagement",
        action="closed",
        details={"engagement_id": str(eng.id)},
    ))
    await db.commit()
    await db.refresh(eng)
    return eng
