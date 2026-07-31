"""
NoovaStack VAPT Platform - Approval Routes
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.schemas import ApprovalDecisionRequest, ApprovalResponse
from auth import User, require_manager, require_user
from database import get_db
from database.models import Approval, AuditLog, Scan

router = APIRouter()


@router.get("", response_model=list[ApprovalResponse])
async def list_approvals(
    status_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    query = select(Approval)
    if status_filter:
        query = query.where(Approval.status == status_filter)
    if current_user.role not in ("admin", "manager"):
        query = query.where(Approval.requested_by == current_user.id)
    result = await db.execute(query.order_by(Approval.created_at.desc()))
    return result.scalars().all()


@router.post("/{approval_id}/decision", response_model=ApprovalResponse)
async def decide_approval(
    approval_id: str,
    data: ApprovalDecisionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    result = await db.execute(select(Approval).where(Approval.id == approval_id))
    approval = result.scalar_one_or_none()
    if not approval:
        raise HTTPException(status_code=404, detail="Approval request not found")
    if approval.status != "pending":
        raise HTTPException(status_code=400, detail=f"Approval is already {approval.status}")
    if approval.requested_by == current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot approve your own restricted request")

    approval.status = data.decision
    approval.reason = data.reason
    approval.approved_by = current_user.id
    approval.decided_at = datetime.utcnow()

    if approval.scan_id:
        scan_result = await db.execute(select(Scan).where(Scan.id == approval.scan_id))
        scan = scan_result.scalar_one_or_none()
        if scan:
            scan.status = "approved" if data.decision == "approved" else "blocked"

    db.add(AuditLog(
        scan_id=approval.scan_id,
        actor_id=current_user.id,
        event_type="approval",
        action=f"approval_{data.decision}",
        details={"approval_id": str(approval.id), "reason": data.reason},
    ))
    await db.commit()
    await db.refresh(approval)
    return approval
