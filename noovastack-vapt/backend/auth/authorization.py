from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database.models import Asset, Engagement, Finding, Project, Scan, ScanSchedule, User


def has_global_project_access(user: User) -> bool:
    return user.role in ("admin", "manager", "security_team")


def project_access_clause(user: User):
    return True if has_global_project_access(user) else Project.owner_id == user.id


async def get_project_or_404(db: AsyncSession, project_id, user: User) -> Project:
    project = (
        await db.execute(
            select(Project).where(Project.id == project_id, project_access_clause(user))
        )
    ).scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


async def get_engagement_or_404(db: AsyncSession, engagement_id, user: User) -> Engagement:
    engagement = (
        await db.execute(
            select(Engagement)
            .join(Project, Project.id == Engagement.project_id)
            .where(Engagement.id == engagement_id, project_access_clause(user))
        )
    ).scalar_one_or_none()
    if not engagement:
        raise HTTPException(status_code=404, detail="Engagement not found")
    return engagement


async def get_asset_or_404(db: AsyncSession, asset_id, user: User) -> Asset:
    asset = (
        await db.execute(
            select(Asset)
            .join(Project, Project.id == Asset.project_id)
            .where(Asset.id == asset_id, project_access_clause(user))
        )
    ).scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset


async def get_scan_or_404(db: AsyncSession, scan_id, user: User) -> Scan:
    scan = (
        await db.execute(
            select(Scan)
            .join(Project, Project.id == Scan.project_id)
            .where(Scan.id == scan_id, project_access_clause(user))
        )
    ).scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    return scan


async def get_schedule_or_404(db: AsyncSession, schedule_id, user: User) -> ScanSchedule:
    schedule = (
        await db.execute(
            select(ScanSchedule)
            .join(Project, Project.id == ScanSchedule.project_id)
            .where(ScanSchedule.id == schedule_id, project_access_clause(user))
        )
    ).scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return schedule


async def get_finding_or_404(db: AsyncSession, finding_id, user: User) -> Finding:
    finding = (
        await db.execute(
            select(Finding)
            .join(Scan, Scan.id == Finding.scan_id)
            .join(Project, Project.id == Scan.project_id)
            .where(Finding.id == finding_id, project_access_clause(user))
        )
    ).scalar_one_or_none()
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")
    return finding
