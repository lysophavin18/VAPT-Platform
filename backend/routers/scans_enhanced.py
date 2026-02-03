"""
VAPT Platform - Enhanced Scan Router with Approval Workflow
Designed by VINNZz
"""
from typing import List, Optional
from uuid import UUID
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func, case
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..models import User, Project, Target, Scan, ScanResult, Vulnerability
from ..schemas import (
    ScanCreate, ScanUpdate, ScanResponse, ScanDetailResponse,
    ScanListResponse, ScanApprovalRequest, ScanApprovalResponse,
    ScanProfileInfo, ToolInfo
)
from ..auth import get_current_user, require_roles
from ..orchestrator.scan_orchestrator import run_scan, SCAN_PROFILES, TOOL_CONFIGS
from ..utils.audit import log_audit_action

router = APIRouter(prefix="/scans", tags=["Scans"])


# ==================================================
# SCAN PROFILES ENDPOINTS
# ==================================================

@router.get("/profiles", response_model=List[ScanProfileInfo])
async def get_scan_profiles(
    current_user: User = Depends(get_current_user)
):
    """Get available scan profiles with details."""
    profiles = []
    for profile_name, config in SCAN_PROFILES.items():
        profiles.append(ScanProfileInfo(
            name=profile_name,
            display_name=profile_name.replace("_", " ").title(),
            duration_estimate=config.get("duration_estimate", "Unknown"),
            tools_count=len(config.get("tools", [])),
            requires_approval=config.get("requires_approval", False),
            description=config.get("description", "")
        ))
    return profiles


@router.get("/tools", response_model=List[ToolInfo])
async def get_available_tools(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get available tools with their configurations."""
    tools = []
    for tool_name, config in TOOL_CONFIGS.items():
        tools.append(ToolInfo(
            name=tool_name,
            display_name=tool_name.upper(),
            category=config.get("category", "general"),
            is_enabled=config.get("enabled", True),
            requires_approval=config.get("requires_approval", False),
            timeout_seconds=config.get("timeout", 3600),
            description=config.get("description", "")
        ))
    return tools


# ==================================================
# SCAN CRUD OPERATIONS
# ==================================================

@router.post("", response_model=ScanResponse, status_code=status.HTTP_201_CREATED)
async def create_scan(
    scan_data: ScanCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new scan. Aggressive scans require manager approval."""
    
    # Verify project exists and user has access
    project = await db.get(Project, scan_data.project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Verify target exists and belongs to project
    target = await db.get(Target, scan_data.target_id)
    if not target or target.project_id != scan_data.project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target not found or doesn't belong to project"
        )
    
    # Check if scan profile requires approval
    profile_config = SCAN_PROFILES.get(scan_data.scan_profile, {})
    requires_approval = profile_config.get("requires_approval", False)
    
    # Determine initial status
    if requires_approval and current_user.role not in ["admin", "manager"]:
        initial_status = "pending_approval"
        approval_status = "pending"
    else:
        initial_status = "queued"
        approval_status = "approved" if requires_approval else None
    
    # Create scan record
    scan = Scan(
        project_id=scan_data.project_id,
        target_id=scan_data.target_id,
        scan_type=scan_data.scan_type,
        scan_profile=scan_data.scan_profile,
        enabled_tools=scan_data.enabled_tools or profile_config.get("tools", []),
        tool_options=scan_data.tool_options or {},
        status=initial_status,
        approval_status=approval_status,
        created_by=current_user.id,
        approved_by=current_user.id if approval_status == "approved" else None,
        approved_at=datetime.now(timezone.utc) if approval_status == "approved" else None
    )
    
    db.add(scan)
    await db.commit()
    await db.refresh(scan)
    
    # Log audit action
    await log_audit_action(
        db=db,
        user_id=current_user.id,
        action="create",
        resource_type="scan",
        resource_id=scan.id,
        new_value={
            "scan_type": scan.scan_type,
            "scan_profile": scan.scan_profile,
            "status": initial_status
        }
    )
    
    # If approved/no approval needed, queue the scan
    if initial_status == "queued":
        background_tasks.add_task(
            run_scan.delay,
            str(scan.id)
        )
    
    return ScanResponse.model_validate(scan)


@router.get("", response_model=ScanListResponse)
async def list_scans(
    project_id: Optional[UUID] = None,
    status: Optional[str] = None,
    scan_type: Optional[str] = None,
    scan_profile: Optional[str] = None,
    created_by: Optional[UUID] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List scans with filters."""
    
    query = select(Scan).options(
        selectinload(Scan.project),
        selectinload(Scan.target),
        selectinload(Scan.creator)
    )
    
    # Apply filters
    conditions = []
    if project_id:
        conditions.append(Scan.project_id == project_id)
    if status:
        conditions.append(Scan.status == status)
    if scan_type:
        conditions.append(Scan.scan_type == scan_type)
    if scan_profile:
        conditions.append(Scan.scan_profile == scan_profile)
    if created_by:
        conditions.append(Scan.created_by == created_by)
    
    # Role-based filtering (analysts can only see their own scans)
    if current_user.role == "analyst":
        conditions.append(
            or_(
                Scan.created_by == current_user.id,
                Scan.project_id.in_(
                    select(Project.id).where(Project.owner_id == current_user.id)
                )
            )
        )
    elif current_user.role == "viewer":
        # Viewers can see completed scans only
        conditions.append(Scan.status.in_(["completed", "failed"]))
    
    if conditions:
        query = query.where(and_(*conditions))
    
    # Get total count
    count_query = select(func.count(Scan.id))
    if conditions:
        count_query = count_query.where(and_(*conditions))
    total = await db.scalar(count_query)
    
    # Apply pagination
    query = query.order_by(Scan.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    scans = result.scalars().all()
    
    return ScanListResponse(
        items=[ScanResponse.model_validate(s) for s in scans],
        total=total or 0,
        skip=skip,
        limit=limit
    )


@router.get("/pending-approval", response_model=ScanListResponse)
@require_roles(["admin", "manager"])
async def list_pending_approval_scans(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List scans pending approval (managers/admins only)."""
    
    query = select(Scan).options(
        selectinload(Scan.project),
        selectinload(Scan.target),
        selectinload(Scan.creator)
    ).where(Scan.status == "pending_approval")
    
    # Get total count
    count_query = select(func.count(Scan.id)).where(Scan.status == "pending_approval")
    total = await db.scalar(count_query)
    
    # Apply pagination
    query = query.order_by(Scan.created_at.asc()).offset(skip).limit(limit)
    result = await db.execute(query)
    scans = result.scalars().all()
    
    return ScanListResponse(
        items=[ScanResponse.model_validate(s) for s in scans],
        total=total or 0,
        skip=skip,
        limit=limit
    )


@router.get("/{scan_id}", response_model=ScanDetailResponse)
async def get_scan(
    scan_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get scan details."""
    
    query = select(Scan).options(
        selectinload(Scan.project),
        selectinload(Scan.target),
        selectinload(Scan.creator),
        selectinload(Scan.approver),
        selectinload(Scan.results),
        selectinload(Scan.vulnerabilities)
    ).where(Scan.id == scan_id)
    
    result = await db.execute(query)
    scan = result.scalar_one_or_none()
    
    if not scan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan not found"
        )
    
    return ScanDetailResponse.model_validate(scan)


# ==================================================
# APPROVAL WORKFLOW ENDPOINTS
# ==================================================

@router.post("/{scan_id}/approve", response_model=ScanApprovalResponse)
@require_roles(["admin", "manager"])
async def approve_scan(
    scan_id: UUID,
    approval_data: ScanApprovalRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Approve a pending scan (managers/admins only)."""
    
    scan = await db.get(Scan, scan_id)
    if not scan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan not found"
        )
    
    if scan.status != "pending_approval":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Scan is not pending approval (current status: {scan.status})"
        )
    
    # Update scan status
    scan.status = "queued"
    scan.approval_status = "approved"
    scan.approved_by = current_user.id
    scan.approved_at = datetime.now(timezone.utc)
    scan.approval_reason = approval_data.reason
    
    await db.commit()
    await db.refresh(scan)
    
    # Log audit action
    await log_audit_action(
        db=db,
        user_id=current_user.id,
        action="scan_approve",
        resource_type="scan",
        resource_id=scan.id,
        old_value={"status": "pending_approval"},
        new_value={"status": "queued", "approval_reason": approval_data.reason}
    )
    
    # Queue the scan
    background_tasks.add_task(
        run_scan.delay,
        str(scan.id)
    )
    
    return ScanApprovalResponse(
        scan_id=scan.id,
        status="approved",
        approved_by=current_user.id,
        approved_at=scan.approved_at,
        reason=approval_data.reason
    )


@router.post("/{scan_id}/reject", response_model=ScanApprovalResponse)
@require_roles(["admin", "manager"])
async def reject_scan(
    scan_id: UUID,
    approval_data: ScanApprovalRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Reject a pending scan (managers/admins only)."""
    
    scan = await db.get(Scan, scan_id)
    if not scan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan not found"
        )
    
    if scan.status != "pending_approval":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Scan is not pending approval (current status: {scan.status})"
        )
    
    if not approval_data.reason:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Rejection reason is required"
        )
    
    # Update scan status
    scan.status = "rejected"
    scan.approval_status = "rejected"
    scan.approved_by = current_user.id
    scan.approved_at = datetime.now(timezone.utc)
    scan.approval_reason = approval_data.reason
    
    await db.commit()
    await db.refresh(scan)
    
    # Log audit action
    await log_audit_action(
        db=db,
        user_id=current_user.id,
        action="scan_reject",
        resource_type="scan",
        resource_id=scan.id,
        old_value={"status": "pending_approval"},
        new_value={"status": "rejected", "rejection_reason": approval_data.reason}
    )
    
    return ScanApprovalResponse(
        scan_id=scan.id,
        status="rejected",
        approved_by=current_user.id,
        approved_at=scan.approved_at,
        reason=approval_data.reason
    )


# ==================================================
# SCAN CONTROL OPERATIONS
# ==================================================

@router.post("/{scan_id}/stop")
async def stop_scan(
    scan_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Stop a running scan."""
    
    scan = await db.get(Scan, scan_id)
    if not scan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan not found"
        )
    
    # Check permissions
    if current_user.role not in ["admin", "manager"] and scan.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only stop your own scans"
        )
    
    if scan.status not in ["queued", "running"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot stop scan with status: {scan.status}"
        )
    
    # Revoke Celery task if exists
    if scan.celery_task_id:
        from celery.result import AsyncResult
        from ..celery_app import celery_app
        celery_app.control.revoke(scan.celery_task_id, terminate=True)
    
    scan.status = "cancelled"
    scan.completed_at = datetime.now(timezone.utc)
    
    await db.commit()
    
    # Log audit action
    await log_audit_action(
        db=db,
        user_id=current_user.id,
        action="scan_stop",
        resource_type="scan",
        resource_id=scan.id
    )
    
    return {"message": "Scan stopped successfully", "scan_id": str(scan_id)}


@router.post("/{scan_id}/retry")
async def retry_scan(
    scan_id: UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retry a failed scan."""
    
    scan = await db.get(Scan, scan_id)
    if not scan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan not found"
        )
    
    if scan.status not in ["failed", "cancelled"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot retry scan with status: {scan.status}"
        )
    
    # Reset scan status
    scan.status = "queued"
    scan.started_at = None
    scan.completed_at = None
    scan.error_message = None
    scan.celery_task_id = None
    
    await db.commit()
    
    # Queue the scan
    background_tasks.add_task(
        run_scan.delay,
        str(scan.id)
    )
    
    # Log audit action
    await log_audit_action(
        db=db,
        user_id=current_user.id,
        action="scan_start",
        resource_type="scan",
        resource_id=scan.id,
        new_value={"action": "retry"}
    )
    
    return {"message": "Scan queued for retry", "scan_id": str(scan_id)}


# ==================================================
# SCAN STATISTICS
# ==================================================

@router.get("/stats/overview")
async def get_scan_statistics(
    project_id: Optional[UUID] = None,
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get scan statistics overview."""
    
    from datetime import timedelta
    
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)
    
    conditions = [Scan.created_at >= cutoff_date]
    if project_id:
        conditions.append(Scan.project_id == project_id)
    
    # Status breakdown
    status_query = select(
        Scan.status,
        func.count(Scan.id).label("count")
    ).where(and_(*conditions)).group_by(Scan.status)
    
    status_result = await db.execute(status_query)
    status_breakdown = {row.status: row.count for row in status_result}
    
    # Profile breakdown
    profile_query = select(
        Scan.scan_profile,
        func.count(Scan.id).label("count")
    ).where(and_(*conditions)).group_by(Scan.scan_profile)
    
    profile_result = await db.execute(profile_query)
    profile_breakdown = {row.scan_profile: row.count for row in profile_result}
    
    # Vulnerability severity breakdown
    vuln_query = select(
        func.sum(Scan.vuln_count_critical).label("critical"),
        func.sum(Scan.vuln_count_high).label("high"),
        func.sum(Scan.vuln_count_medium).label("medium"),
        func.sum(Scan.vuln_count_low).label("low"),
        func.sum(Scan.vuln_count_info).label("info")
    ).where(and_(*conditions, Scan.status == "completed"))
    
    vuln_result = await db.execute(vuln_query)
    vuln_row = vuln_result.one()
    
    # Average scan duration
    duration_query = select(
        func.avg(Scan.duration_seconds).label("avg_duration")
    ).where(and_(*conditions, Scan.status == "completed"))
    
    duration_result = await db.execute(duration_query)
    avg_duration = duration_result.scalar() or 0
    
    return {
        "period_days": days,
        "status_breakdown": status_breakdown,
        "profile_breakdown": profile_breakdown,
        "vulnerability_summary": {
            "critical": int(vuln_row.critical or 0),
            "high": int(vuln_row.high or 0),
            "medium": int(vuln_row.medium or 0),
            "low": int(vuln_row.low or 0),
            "info": int(vuln_row.info or 0)
        },
        "average_duration_seconds": int(avg_duration),
        "total_scans": sum(status_breakdown.values())
    }
