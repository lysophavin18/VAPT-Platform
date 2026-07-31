"""
NoovaStack VAPT Platform - Finding Routes
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from database.models import Finding, AuditLog
from auth import require_user, User
from api.schemas import FindingResponse, FindingStatusUpdate

router = APIRouter()


@router.get("", response_model=list[FindingResponse])
async def list_findings(
    project_id: str | None = None,
    severity: str | None = None,
    status_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    query = select(Finding)
    if severity:
        query = query.where(Finding.severity == severity)
    if status_filter:
        query = query.where(Finding.status == status_filter)
    result = await db.execute(
        query.order_by(Finding.severity.desc(), Finding.created_at.desc()).limit(200)
    )
    return result.scalars().all()


@router.get("/{finding_id}", response_model=FindingResponse)
async def get_finding(
    finding_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    result = await db.execute(select(Finding).where(Finding.id == finding_id))
    finding = result.scalar_one_or_none()
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")
    return finding


@router.post("/{finding_id}/verify", response_model=FindingResponse)
async def verify_finding(
    finding_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    result = await db.execute(select(Finding).where(Finding.id == finding_id))
    finding = result.scalar_one_or_none()
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")
    finding.integrity_status = "verified"
    finding.status = "confirmed"
    await db.commit()
    await db.refresh(finding)
    return finding


@router.post("/{finding_id}/status", response_model=FindingResponse)
async def update_finding_status(
    finding_id: str,
    data: FindingStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    result = await db.execute(select(Finding).where(Finding.id == finding_id))
    finding = result.scalar_one_or_none()
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")
    previous = finding.status
    finding.status = data.status
    if data.status == "fixed":
        finding.integrity_status = "verified"
    db.add(AuditLog(
        project_id=None,
        scan_id=finding.scan_id,
        actor_id=current_user.id,
        event_type="finding",
        action="status_updated",
        details={"finding_id": str(finding.id), "previous_status": previous, "new_status": data.status},
    ))
    await db.commit()
    await db.refresh(finding)
    return finding


@router.post("/{finding_id}/reject", response_model=FindingResponse)
async def reject_finding(
    finding_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    result = await db.execute(select(Finding).where(Finding.id == finding_id))
    finding = result.scalar_one_or_none()
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")
    finding.status = "rejected"
    await db.commit()
    await db.refresh(finding)
    return finding


@router.post("/{finding_id}/mark-false-positive", response_model=FindingResponse)
async def mark_false_positive(
    finding_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    result = await db.execute(select(Finding).where(Finding.id == finding_id))
    finding = result.scalar_one_or_none()
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")
    finding.status = "false_positive"
    await db.commit()
    await db.refresh(finding)
    return finding
