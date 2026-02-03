"""
VAPT Platform - Scans Router
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from datetime import datetime
import uuid

from database import get_db
from models import Scan, Project, Target, User
from schemas import ScanResponse, ScanCreate, ScanUpdate, ScanStatus
from routers.auth import get_current_active_user

router = APIRouter()


@router.get("/", response_model=List[ScanResponse])
async def list_scans(
    project_id: uuid.UUID = None,
    status_filter: str = None,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """List all scans, optionally filtered by project or status"""
    query = select(Scan)
    
    if project_id:
        query = query.where(Scan.project_id == project_id)
    if status_filter:
        query = query.where(Scan.status == status_filter)
    
    query = query.order_by(Scan.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{scan_id}", response_model=ScanResponse)
async def get_scan(
    scan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get a specific scan"""
    result = await db.execute(select(Scan).where(Scan.id == scan_id))
    scan = result.scalar_one_or_none()
    
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    return scan


@router.post("/", response_model=ScanResponse, status_code=status.HTTP_201_CREATED)
async def create_scan(
    scan_data: ScanCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Create and start a new scan"""
    from orchestrator.celery_app import scan_orchestrator
    
    # Verify project exists
    result = await db.execute(select(Project).where(Project.id == scan_data.project_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Verify target exists
    result = await db.execute(select(Target).where(Target.id == scan_data.target_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    
    # Create scan record
    scan = Scan(
        project_id=scan_data.project_id,
        target_id=scan_data.target_id,
        scan_name=scan_data.scan_name,
        scan_type=scan_data.scan_type.value,
        scan_profile=scan_data.scan_profile,
        status="pending",
        scan_config=scan_data.scan_config.model_dump() if scan_data.scan_config else {},
        created_by=current_user.id
    )
    
    db.add(scan)
    await db.commit()
    await db.refresh(scan)
    
    # Queue the scan task
    try:
        task = scan_orchestrator.delay(
            str(scan.id),
            scan_data.scan_type.value,
            target.target_value,
            scan.scan_config
        )
        
        # Update scan with celery task ID
        scan.celery_task_id = task.id
        scan.status = "running"
        scan.started_at = datetime.utcnow()
        await db.commit()
        await db.refresh(scan)
    except Exception as e:
        scan.status = "failed"
        scan.results_summary = {"error": str(e)}
        await db.commit()
    
    return scan


@router.post("/{scan_id}/start", response_model=ScanResponse)
async def start_scan(
    scan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Start a pending scan"""
    from orchestrator.celery_app import scan_orchestrator
    
    result = await db.execute(select(Scan).where(Scan.id == scan_id))
    scan = result.scalar_one_or_none()
    
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    if scan.status != "pending":
        raise HTTPException(status_code=400, detail="Scan is not in pending status")
    
    # Get target
    result = await db.execute(select(Target).where(Target.id == scan.target_id))
    target = result.scalar_one_or_none()
    
    # Queue the scan task
    task = scan_orchestrator.delay(
        str(scan.id),
        scan.scan_type,
        target.target_value,
        scan.scan_config
    )
    
    scan.celery_task_id = task.id
    scan.status = "running"
    scan.started_at = datetime.utcnow()
    await db.commit()
    await db.refresh(scan)
    
    return scan


@router.post("/{scan_id}/stop", response_model=ScanResponse)
async def stop_scan(
    scan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Stop a running scan"""
    from orchestrator.celery_app import celery_app
    
    result = await db.execute(select(Scan).where(Scan.id == scan_id))
    scan = result.scalar_one_or_none()
    
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    if scan.status != "running":
        raise HTTPException(status_code=400, detail="Scan is not running")
    
    # Revoke celery task
    if scan.celery_task_id:
        celery_app.control.revoke(scan.celery_task_id, terminate=True)
    
    scan.status = "cancelled"
    scan.completed_at = datetime.utcnow()
    await db.commit()
    await db.refresh(scan)
    
    return scan


@router.get("/{scan_id}/results")
async def get_scan_results(
    scan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get scan results"""
    result = await db.execute(select(Scan).where(Scan.id == scan_id))
    scan = result.scalar_one_or_none()
    
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    return {
        "scan_id": scan.id,
        "status": scan.status,
        "progress": scan.progress,
        "results_summary": scan.results_summary,
        "started_at": scan.started_at,
        "completed_at": scan.completed_at
    }


@router.delete("/{scan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scan(
    scan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a scan"""
    result = await db.execute(select(Scan).where(Scan.id == scan_id))
    scan = result.scalar_one_or_none()
    
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    # Stop scan if running
    if scan.status == "running" and scan.celery_task_id:
        from orchestrator.celery_app import celery_app
        celery_app.control.revoke(scan.celery_task_id, terminate=True)
    
    await db.delete(scan)
    await db.commit()
