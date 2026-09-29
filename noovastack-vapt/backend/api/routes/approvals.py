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
from database.models import Approval, AuditLog, Scan, ScanSchedule

router = APIRouter()


def approval_is_valid(approval: Approval, now: datetime | None = None) -> bool:
    now = now or datetime.utcnow()
    return (
        approval.status == "approved"
        and approval.approved_by is not None
        and (approval.expires_at is None or approval.expires_at > now)
    )


def expire_pending_approval(approval: Approval, now: datetime | None = None) -> bool:
    now = now or datetime.utcnow()
    if approval.status == "pending" and approval.expires_at and approval.expires_at <= now:
        approval.status = "expired"
        approval.decided_at = now
        return True
    return False


def resource_status_for_decision(decision: str, *, schedule: bool = False) -> str:
    statuses = {
        "approved": "approved",
        "rejected": "paused" if schedule else "blocked",
        "more_information": "draft",
    }
    return statuses[decision]


@router.get("", response_model=list[ApprovalResponse])
async def list_approvals(
    status_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    query = select(Approval)
    if status_filter:
        query = query.where(Approval.status == status_filter)
    if current_user.role not in ("admin", "manager", "security_team"):
        query = query.where(Approval.requested_by == current_user.id)
    result = await db.execute(query.order_by(Approval.created_at.desc()))
    approvals = result.scalars().all()
    expired = [approval for approval in approvals if expire_pending_approval(approval)]
    for approval in expired:
        db.add(AuditLog(
            scan_id=approval.scan_id,
            actor_id=current_user.id,
            event_type="approval",
            action="approval_expired",
            details={"approval_id": str(approval.id)},
        ))
    if expired:
        await db.commit()
    return approvals


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
    if expire_pending_approval(approval):
        db.add(AuditLog(
            scan_id=approval.scan_id,
            actor_id=current_user.id,
            event_type="approval",
            action="approval_expired",
            details={"approval_id": str(approval.id)},
        ))
        await db.commit()
        raise HTTPException(status_code=400, detail="Approval request has expired")
    if approval.status != "pending":
        raise HTTPException(status_code=400, detail=f"Approval is already {approval.status}")
    if approval.requested_by == current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot approve your own restricted request")

    approval.status = data.decision
    approval.reason = data.reason
    approval.approved_by = current_user.id if data.decision == "approved" else None
    approval.decided_at = datetime.utcnow()

    if approval.scan_id:
        scan_result = await db.execute(select(Scan).where(Scan.id == approval.scan_id))
        scan = scan_result.scalar_one_or_none()
        if scan:
            scan.status = resource_status_for_decision(data.decision)
            scan.approved_by = current_user.id if data.decision == "approved" else None

    if approval.schedule_id:
        schedule = (
            await db.execute(select(ScanSchedule).where(ScanSchedule.id == approval.schedule_id))
        ).scalar_one_or_none()
        if schedule:
            schedule.status = resource_status_for_decision(data.decision, schedule=True)

    db.add(AuditLog(
        scan_id=approval.scan_id,
        actor_id=current_user.id,
        event_type="approval",
        action=f"approval_{data.decision}",
        details={
            "approval_id": str(approval.id),
            "schedule_id": str(approval.schedule_id) if approval.schedule_id else None,
            "reason": data.reason,
        },
    ))
    await db.commit()
    await db.refresh(approval)
    return approval
