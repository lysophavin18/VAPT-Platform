from typing import Optional, List
from uuid import UUID
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func

from ..database import get_db
from ..models import User, AuditLog
from ..schemas import AuditLogResponse, AuditLogDetailResponse, AuditLogListResponse
from ..auth import get_current_user, require_roles

router = APIRouter(prefix="/audit-logs", tags=["Audit Logs"])


@router.get("", response_model=AuditLogListResponse)
@require_roles(["admin", "manager"])
async def list_audit_logs(
    user_id: Optional[UUID] = None,
    action: Optional[str] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[UUID] = None,
    success: Optional[bool] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    List audit logs with filters.
    Only accessible by admins and managers.
    """
    query = select(AuditLog)

    conditions = []
    if user_id:
        conditions.append(AuditLog.user_id == user_id)
    if action:
        conditions.append(AuditLog.action == action)
    if resource_type:
        conditions.append(AuditLog.resource_type == resource_type)
    if resource_id:
        conditions.append(AuditLog.resource_id == resource_id)
    if success is not None:
        conditions.append(AuditLog.success == success)
    if start_date:
        conditions.append(AuditLog.created_at >= start_date)
    if end_date:
        conditions.append(AuditLog.created_at <= end_date)

    if conditions:
        query = query.where(and_(*conditions))

    # Get total count
    count_query = select(func.count(AuditLog.id))
    if conditions:
        count_query = count_query.where(and_(*conditions))
    total = await db.scalar(count_query)

    # Apply pagination and ordering
    query = query.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    logs = result.scalars().all()

    return AuditLogListResponse(
        items=[AuditLogResponse.model_validate(log) for log in logs],
        total=total or 0,
        skip=skip,
        limit=limit
    )


@router.get("/actions", response_model=List[str])
@require_roles(["admin", "manager"])
async def list_audit_actions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get list of distinct audit actions."""
    query = select(AuditLog.action).distinct()
    result = await db.execute(query)
    actions = [row[0] for row in result]
    return actions


@router.get("/resource-types", response_model=List[str])
@require_roles(["admin", "manager"])
async def list_resource_types(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get list of distinct resource types."""
    query = select(AuditLog.resource_type).distinct()
    result = await db.execute(query)
    types = [row[0] for row in result]
    return types


@router.get("/stats")
@require_roles(["admin", "manager"])
async def get_audit_stats(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get audit log statistics."""
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)

    # Action breakdown
    action_query = select(
        AuditLog.action,
        func.count(AuditLog.id).label("count")
    ).where(AuditLog.created_at >= cutoff_date).group_by(AuditLog.action)

    action_result = await db.execute(action_query)
    action_breakdown = {row.action: row.count for row in action_result}

    # Success/failure breakdown
    success_query = select(
        AuditLog.success,
        func.count(AuditLog.id).label("count")
    ).where(AuditLog.created_at >= cutoff_date).group_by(AuditLog.success)

    success_result = await db.execute(success_query)
    success_breakdown = {str(row.success): row.count for row in success_result}

    # Most active users
    user_query = select(
        AuditLog.user_id,
        func.count(AuditLog.id).label("count")
    ).where(
        and_(
            AuditLog.created_at >= cutoff_date,
            AuditLog.user_id.isnot(None)
        )
    ).group_by(AuditLog.user_id).order_by(func.count(AuditLog.id).desc()).limit(10)

    user_result = await db.execute(user_query)
    top_users = [{"user_id": str(row.user_id), "count": row.count} for row in user_result]

    # Failed login attempts
    failed_logins_query = select(func.count(AuditLog.id)).where(
        and_(
            AuditLog.created_at >= cutoff_date,
            AuditLog.action == "login_failed"
        )
    )
    failed_logins = await db.scalar(failed_logins_query)

    return {
        "period_days": days,
        "action_breakdown": action_breakdown,
        "success_breakdown": success_breakdown,
        "top_active_users": top_users,
        "failed_login_attempts": failed_logins or 0,
        "total_events": sum(action_breakdown.values())
    }


@router.get("/{log_id}", response_model=AuditLogDetailResponse)
@require_roles(["admin", "manager"])
async def get_audit_log(
    log_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get detailed audit log entry."""
    log = await db.get(AuditLog, log_id)

    if not log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audit log not found"
        )

    return AuditLogDetailResponse.model_validate(log)


@router.get("/user/{user_id}", response_model=AuditLogListResponse)
@require_roles(["admin", "manager"])
async def get_user_audit_logs(
    user_id: UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get audit logs for a specific user."""
    query = select(AuditLog).where(AuditLog.user_id == user_id)

    # Get total count
    count_query = select(func.count(AuditLog.id)).where(AuditLog.user_id == user_id)
    total = await db.scalar(count_query)

    # Apply pagination and ordering
    query = query.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    logs = result.scalars().all()

    return AuditLogListResponse(
        items=[AuditLogResponse.model_validate(log) for log in logs],
        total=total or 0,
        skip=skip,
        limit=limit
    )


@router.get("/resource/{resource_type}/{resource_id}", response_model=AuditLogListResponse)
@require_roles(["admin", "manager"])
async def get_resource_audit_logs(
    resource_type: str,
    resource_id: UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get audit logs for a specific resource."""
    query = select(AuditLog).where(
        and_(
            AuditLog.resource_type == resource_type,
            AuditLog.resource_id == resource_id
        )
    )

    # Get total count
    count_query = select(func.count(AuditLog.id)).where(
        and_(
            AuditLog.resource_type == resource_type,
            AuditLog.resource_id == resource_id
        )
    )
    total = await db.scalar(count_query)

    # Apply pagination and ordering
    query = query.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    logs = result.scalars().all()

    return AuditLogListResponse(
        items=[AuditLogResponse.model_validate(log) for log in logs],
        total=total or 0,
        skip=skip,
        limit=limit
    )
