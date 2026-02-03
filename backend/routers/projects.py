"""
VAPT Platform - Projects Router
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List
import uuid

from database import get_db
from models import Project, Target, Scan, Vulnerability, User
from schemas import ProjectResponse, ProjectCreate, ProjectUpdate
from routers.auth import get_current_active_user

router = APIRouter()


@router.get("/", response_model=List[ProjectResponse])
async def list_projects(
    skip: int = 0,
    limit: int = 100,
    status_filter: str = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """List all projects"""
    query = select(Project)
    
    if status_filter:
        query = query.where(Project.status == status_filter)
    
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    projects = result.scalars().all()
    
    # Add counts
    response = []
    for project in projects:
        proj_dict = {
            "id": project.id,
            "name": project.name,
            "description": project.description,
            "client_name": project.client_name,
            "project_type": project.project_type,
            "status": project.status,
            "start_date": project.start_date,
            "end_date": project.end_date,
            "created_by": project.created_by,
            "created_at": project.created_at,
            "updated_at": project.updated_at,
        }
        
        # Get counts
        target_count = await db.execute(
            select(func.count(Target.id)).where(Target.project_id == project.id)
        )
        scan_count = await db.execute(
            select(func.count(Scan.id)).where(Scan.project_id == project.id)
        )
        vuln_count = await db.execute(
            select(func.count(Vulnerability.id)).where(Vulnerability.project_id == project.id)
        )
        
        proj_dict["target_count"] = target_count.scalar() or 0
        proj_dict["scan_count"] = scan_count.scalar() or 0
        proj_dict["vulnerability_count"] = vuln_count.scalar() or 0
        
        response.append(ProjectResponse(**proj_dict))
    
    return response


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get a specific project"""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get counts
    target_count = await db.execute(
        select(func.count(Target.id)).where(Target.project_id == project.id)
    )
    scan_count = await db.execute(
        select(func.count(Scan.id)).where(Scan.project_id == project.id)
    )
    vuln_count = await db.execute(
        select(func.count(Vulnerability.id)).where(Vulnerability.project_id == project.id)
    )
    
    proj_dict = {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "client_name": project.client_name,
        "project_type": project.project_type,
        "status": project.status,
        "start_date": project.start_date,
        "end_date": project.end_date,
        "created_by": project.created_by,
        "created_at": project.created_at,
        "updated_at": project.updated_at,
        "target_count": target_count.scalar() or 0,
        "scan_count": scan_count.scalar() or 0,
        "vulnerability_count": vuln_count.scalar() or 0,
    }
    
    return ProjectResponse(**proj_dict)


@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_data: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new project"""
    project = Project(
        name=project_data.name,
        description=project_data.description,
        client_name=project_data.client_name,
        project_type=project_data.project_type.value,
        start_date=project_data.start_date,
        end_date=project_data.end_date,
        created_by=current_user.id,
        status="active"
    )
    
    db.add(project)
    await db.commit()
    await db.refresh(project)
    
    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        client_name=project.client_name,
        project_type=project.project_type,
        status=project.status,
        start_date=project.start_date,
        end_date=project.end_date,
        created_by=project.created_by,
        created_at=project.created_at,
        updated_at=project.updated_at,
        target_count=0,
        scan_count=0,
        vulnerability_count=0
    )


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: uuid.UUID,
    project_data: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Update a project"""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    update_data = project_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if hasattr(project, key):
            setattr(project, key, value.value if hasattr(value, 'value') else value)
    
    await db.commit()
    await db.refresh(project)
    
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a project"""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    await db.delete(project)
    await db.commit()
