"""
VAPT Platform - Targets Router
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
import uuid

from database import get_db
from models import Target, Project, User
from schemas import TargetResponse, TargetCreate, TargetUpdate
from routers.auth import get_current_active_user

router = APIRouter()


@router.get("/", response_model=List[TargetResponse])
async def list_targets(
    project_id: uuid.UUID = None,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """List all targets, optionally filtered by project"""
    query = select(Target)
    
    if project_id:
        query = query.where(Target.project_id == project_id)
    
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{target_id}", response_model=TargetResponse)
async def get_target(
    target_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get a specific target"""
    result = await db.execute(select(Target).where(Target.id == target_id))
    target = result.scalar_one_or_none()
    
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    return target


@router.post("/", response_model=TargetResponse, status_code=status.HTTP_201_CREATED)
async def create_target(
    target_data: TargetCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new target"""
    # Verify project exists
    result = await db.execute(select(Project).where(Project.id == target_data.project_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")
    
    target = Target(
        project_id=target_data.project_id,
        name=target_data.name,
        target_type=target_data.target_type,
        target_value=target_data.target_value,
        description=target_data.description,
        is_in_scope=target_data.is_in_scope
    )
    
    db.add(target)
    await db.commit()
    await db.refresh(target)
    
    return target


@router.patch("/{target_id}", response_model=TargetResponse)
async def update_target(
    target_id: uuid.UUID,
    target_data: TargetUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Update a target"""
    result = await db.execute(select(Target).where(Target.id == target_id))
    target = result.scalar_one_or_none()
    
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    
    update_data = target_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if hasattr(target, key):
            setattr(target, key, value)
    
    await db.commit()
    await db.refresh(target)
    
    return target


@router.delete("/{target_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_target(
    target_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a target"""
    result = await db.execute(select(Target).where(Target.id == target_id))
    target = result.scalar_one_or_none()
    
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    
    await db.delete(target)
    await db.commit()


@router.post("/bulk", response_model=List[TargetResponse], status_code=status.HTTP_201_CREATED)
async def create_targets_bulk(
    project_id: uuid.UUID,
    targets_data: List[TargetCreate],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Create multiple targets at once"""
    # Verify project exists
    result = await db.execute(select(Project).where(Project.id == project_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")
    
    targets = []
    for target_data in targets_data:
        target = Target(
            project_id=project_id,
            name=target_data.name,
            target_type=target_data.target_type,
            target_value=target_data.target_value,
            description=target_data.description,
            is_in_scope=target_data.is_in_scope
        )
        db.add(target)
        targets.append(target)
    
    await db.commit()
    
    for target in targets:
        await db.refresh(target)
    
    return targets
