"""
VAPT Platform - Tool Configuration Router
Designed by VINNZz
"""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import get_db
from ..models import User, ToolConfig
from ..schemas import ToolConfigResponse, ToolConfigUpdate
from ..auth import get_current_user, require_roles
from ..utils.audit import log_audit_action

router = APIRouter(prefix="/tool-configs", tags=["Tool Configuration"])


@router.get("", response_model=List[ToolConfigResponse])
async def list_tool_configs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all tool configurations."""
    query = select(ToolConfig).order_by(ToolConfig.tool_name)
    result = await db.execute(query)
    configs = result.scalars().all()
    
    return [ToolConfigResponse.model_validate(config) for config in configs]


@router.get("/{tool_name}", response_model=ToolConfigResponse)
async def get_tool_config(
    tool_name: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get configuration for a specific tool."""
    query = select(ToolConfig).where(ToolConfig.tool_name == tool_name)
    result = await db.execute(query)
    config = result.scalar_one_or_none()
    
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tool configuration for '{tool_name}' not found"
        )
    
    return ToolConfigResponse.model_validate(config)


@router.patch("/{tool_name}", response_model=ToolConfigResponse)
@require_roles(["admin"])
async def update_tool_config(
    tool_name: str,
    config_update: ToolConfigUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update tool configuration.
    Admin only.
    """
    query = select(ToolConfig).where(ToolConfig.tool_name == tool_name)
    result = await db.execute(query)
    config = result.scalar_one_or_none()
    
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tool configuration for '{tool_name}' not found"
        )
    
    # Store old value for audit
    old_value = {
        "is_enabled": config.is_enabled,
        "timeout_seconds": config.timeout_seconds,
        "rate_limit": config.rate_limit,
        "max_concurrent": config.max_concurrent,
        "requires_approval": config.requires_approval
    }
    
    # Update fields
    update_data = config_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(config, field, value)
    
    config.updated_by = current_user.id
    
    await db.commit()
    await db.refresh(config)
    
    # Log audit action
    await log_audit_action(
        db=db,
        user_id=current_user.id,
        action="config_change",
        resource_type="tool_config",
        resource_id=config.id,
        old_value=old_value,
        new_value=update_data
    )
    
    return ToolConfigResponse.model_validate(config)


@router.post("/{tool_name}/enable")
@require_roles(["admin"])
async def enable_tool(
    tool_name: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Enable a tool."""
    query = select(ToolConfig).where(ToolConfig.tool_name == tool_name)
    result = await db.execute(query)
    config = result.scalar_one_or_none()
    
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tool configuration for '{tool_name}' not found"
        )
    
    if config.is_enabled:
        return {"message": f"Tool '{tool_name}' is already enabled"}
    
    config.is_enabled = True
    config.updated_by = current_user.id
    
    await db.commit()
    
    # Log audit action
    await log_audit_action(
        db=db,
        user_id=current_user.id,
        action="config_change",
        resource_type="tool_config",
        resource_id=config.id,
        old_value={"is_enabled": False},
        new_value={"is_enabled": True}
    )
    
    return {"message": f"Tool '{tool_name}' enabled successfully"}


@router.post("/{tool_name}/disable")
@require_roles(["admin"])
async def disable_tool(
    tool_name: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Disable a tool."""
    query = select(ToolConfig).where(ToolConfig.tool_name == tool_name)
    result = await db.execute(query)
    config = result.scalar_one_or_none()
    
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tool configuration for '{tool_name}' not found"
        )
    
    if not config.is_enabled:
        return {"message": f"Tool '{tool_name}' is already disabled"}
    
    config.is_enabled = False
    config.updated_by = current_user.id
    
    await db.commit()
    
    # Log audit action
    await log_audit_action(
        db=db,
        user_id=current_user.id,
        action="config_change",
        resource_type="tool_config",
        resource_id=config.id,
        old_value={"is_enabled": True},
        new_value={"is_enabled": False}
    )
    
    return {"message": f"Tool '{tool_name}' disabled successfully"}


@router.get("/{tool_name}/status")
async def get_tool_status(
    tool_name: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get tool status including health check."""
    query = select(ToolConfig).where(ToolConfig.tool_name == tool_name)
    result = await db.execute(query)
    config = result.scalar_one_or_none()
    
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tool configuration for '{tool_name}' not found"
        )
    
    # Check container health
    import docker
    try:
        client = docker.from_env()
        container_name = f"vapt-platform-{tool_name}-1"
        container = client.containers.get(container_name)
        container_status = container.status
        container_health = container.attrs.get('State', {}).get('Health', {}).get('Status', 'unknown')
    except Exception:
        container_status = "not_running"
        container_health = "unknown"
    
    return {
        "tool_name": tool_name,
        "is_enabled": config.is_enabled,
        "requires_approval": config.requires_approval,
        "timeout_seconds": config.timeout_seconds,
        "rate_limit": config.rate_limit,
        "max_concurrent": config.max_concurrent,
        "container_status": container_status,
        "container_health": container_health
    }
