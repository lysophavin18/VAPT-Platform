"""
NoovaStack VAPT Platform - Project Routes
"""
from fastapi import APIRouter, Depends, HTTPException, Request, status, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from database.models import AuditLog, Project
from auth import get_project_or_404, require_user, User, require_manager
from api.schemas import ProjectCreate, ProjectUpdate, ProjectResponse

router = APIRouter()


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    data: ProjectCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    project = Project(
        name=data.name,
        description=data.description,
        owner_id=current_user.id,
        environment=data.environment,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    db.add(AuditLog(
        project_id=project.id,
        actor_id=current_user.id,
        event_type="project",
        action="project_created",
        ip_address=request.client.host if request.client else None,
        details={
            "project_id": str(project.id),
            "project_name": project.name,
            "environment": project.environment,
            "actor_email": current_user.email,
            "actor_role": current_user.role,
        },
    ))
    await db.commit()
    return project


@router.get("", response_model=list[ProjectResponse])
async def list_projects(
    status_filter: str | None = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    query = select(Project)
    if current_user.role not in ("admin", "manager"):
        query = query.where(Project.owner_id == current_user.id)
    if status_filter:
        query = query.where(Project.status == status_filter)
    query = query.order_by(Project.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    return await get_project_or_404(db, project_id, current_user)


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    data: ProjectUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    project = await get_project_or_404(db, project_id, current_user)
    updates = data.model_dump(exclude_unset=True)
    previous = {key: getattr(project, key) for key in updates.keys()}
    for key, value in updates.items():
        setattr(project, key, value)
    db.add(AuditLog(
        project_id=project.id,
        actor_id=current_user.id,
        event_type="project",
        action="project_updated",
        ip_address=request.client.host if request.client else None,
        details={
            "project_id": str(project.id),
            "project_name": project.name,
            "previous": previous,
            "updated": updates,
            "actor_email": current_user.email,
            "actor_role": current_user.role,
        },
    ))
    await db.commit()
    await db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    project = await get_project_or_404(db, project_id, current_user)
    project_snapshot = {
        "project_id": str(project.id),
        "project_name": project.name,
        "description": project.description,
        "environment": project.environment,
        "status": project.status,
        "owner_id": str(project.owner_id),
        "actor_email": current_user.email,
        "actor_role": current_user.role,
    }
    await db.delete(project)
    db.add(AuditLog(
        actor_id=current_user.id,
        event_type="project",
        action="project_deleted",
        ip_address=request.client.host if request.client else None,
        details=project_snapshot,
    ))
    await db.commit()
