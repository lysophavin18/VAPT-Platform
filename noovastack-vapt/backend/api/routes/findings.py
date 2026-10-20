"""
NoovaStack VAPT Platform - Finding Routes
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from database.models import Finding, FindingComment, AuditLog, Project, Scan
from auth import get_finding_or_404, get_project_or_404, get_scan_or_404, project_access_clause, require_user, User
from api.schemas import FindingCommentCreate, FindingCommentResponse, FindingResponse, FindingStatusUpdate

router = APIRouter()


@router.get("", response_model=list[FindingResponse])
async def list_findings(
    project_id: str | None = None,
    scan_id: str | None = None,
    severity: str | None = None,
    status_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    if project_id:
        await get_project_or_404(db, project_id, current_user)
    if scan_id:
        await get_scan_or_404(db, scan_id, current_user)
    query = select(Finding).join(Scan, Scan.id == Finding.scan_id).join(Project, Project.id == Scan.project_id).where(project_access_clause(current_user))
    if project_id:
        query = query.where(Scan.project_id == project_id)
    if scan_id:
        query = query.where(Finding.scan_id == scan_id)
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
    return await get_finding_or_404(db, finding_id, current_user)


@router.post("/{finding_id}/verify", response_model=FindingResponse)
async def verify_finding(
    finding_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    finding = await get_finding_or_404(db, finding_id, current_user)
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
    finding = await get_finding_or_404(db, finding_id, current_user)
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
    finding = await get_finding_or_404(db, finding_id, current_user)
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
    finding = await get_finding_or_404(db, finding_id, current_user)
    finding.status = "false_positive"
    await db.commit()
    await db.refresh(finding)
    return finding


@router.get("/{finding_id}/comments", response_model=list[FindingCommentResponse])
async def list_comments(
    finding_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    await get_finding_or_404(db, finding_id, current_user)
    result = await db.execute(
        select(FindingComment).where(FindingComment.finding_id == finding_id).order_by(FindingComment.created_at)
    )
    return result.scalars().all()


@router.post("/{finding_id}/comments", response_model=FindingCommentResponse, status_code=201)
async def add_comment(
    finding_id: str,
    data: FindingCommentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    await get_finding_or_404(db, finding_id, current_user)
    comment = FindingComment(
        finding_id=finding_id,
        author_id=current_user.id,
        author_name=current_user.full_name or current_user.username,
        body=data.body,
        comment_type=data.comment_type,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return comment


@router.delete("/{finding_id}/comments/{comment_id}", status_code=204)
async def delete_comment(
    finding_id: str,
    comment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    result = await db.execute(
        select(FindingComment).where(
            FindingComment.id == comment_id,
            FindingComment.finding_id == finding_id,
        )
    )
    comment = result.scalar_one_or_none()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if str(comment.author_id) != str(current_user.id) and current_user.role not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Cannot delete another user's comment")
    await db.delete(comment)
    await db.commit()
