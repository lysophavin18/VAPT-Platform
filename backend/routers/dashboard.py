"""
VAPT Platform - Dashboard Router
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from typing import List
from datetime import datetime, timedelta
import uuid

from database import get_db
from models import Project, Scan, Vulnerability, ActivityLog, User
from schemas import DashboardStats, VulnerabilityTrend, RecentActivity
from routers.auth import get_current_active_user

router = APIRouter()


@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get dashboard statistics"""
    # Total projects
    result = await db.execute(select(func.count(Project.id)))
    total_projects = result.scalar() or 0
    
    # Active scans
    result = await db.execute(
        select(func.count(Scan.id)).where(Scan.status == "running")
    )
    active_scans = result.scalar() or 0
    
    # Vulnerability counts by severity
    vuln_counts = {}
    for severity in ['critical', 'high', 'medium', 'low', 'info']:
        result = await db.execute(
            select(func.count(Vulnerability.id)).where(
                and_(
                    Vulnerability.severity == severity,
                    Vulnerability.status.in_(['open', 'confirmed'])
                )
            )
        )
        vuln_counts[severity] = result.scalar() or 0
    
    total_vulns = sum(vuln_counts.values())
    
    return DashboardStats(
        total_projects=total_projects,
        active_scans=active_scans,
        total_vulnerabilities=total_vulns,
        critical_vulnerabilities=vuln_counts['critical'],
        high_vulnerabilities=vuln_counts['high'],
        medium_vulnerabilities=vuln_counts['medium'],
        low_vulnerabilities=vuln_counts['low'],
        info_vulnerabilities=vuln_counts['info']
    )


@router.get("/vulnerability-trends")
async def get_vulnerability_trends(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get vulnerability trends over time"""
    trends = []
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=days)
    
    # Get daily counts
    current_date = start_date
    while current_date <= end_date:
        next_date = current_date + timedelta(days=1)
        
        day_counts = {}
        for severity in ['critical', 'high', 'medium', 'low']:
            result = await db.execute(
                select(func.count(Vulnerability.id)).where(
                    and_(
                        Vulnerability.severity == severity,
                        Vulnerability.created_at >= current_date,
                        Vulnerability.created_at < next_date
                    )
                )
            )
            day_counts[severity] = result.scalar() or 0
        
        trends.append({
            "date": current_date.strftime("%Y-%m-%d"),
            "critical": day_counts['critical'],
            "high": day_counts['high'],
            "medium": day_counts['medium'],
            "low": day_counts['low']
        })
        
        current_date = next_date
    
    return trends


@router.get("/recent-activity")
async def get_recent_activity(
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get recent activity logs"""
    result = await db.execute(
        select(ActivityLog)
        .order_by(ActivityLog.created_at.desc())
        .limit(limit)
    )
    activities = result.scalars().all()
    
    response = []
    for activity in activities:
        # Get user name
        user_name = None
        if activity.user_id:
            user_result = await db.execute(
                select(User).where(User.id == activity.user_id)
            )
            user = user_result.scalar_one_or_none()
            if user:
                user_name = user.full_name or user.username
        
        response.append({
            "id": activity.id,
            "action": activity.action,
            "entity_type": activity.entity_type,
            "entity_id": activity.entity_id,
            "details": activity.details,
            "created_at": activity.created_at,
            "user_name": user_name
        })
    
    return response


@router.get("/recent-scans")
async def get_recent_scans(
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get recent scans"""
    result = await db.execute(
        select(Scan)
        .order_by(Scan.created_at.desc())
        .limit(limit)
    )
    scans = result.scalars().all()
    
    return [
        {
            "id": scan.id,
            "scan_name": scan.scan_name,
            "scan_type": scan.scan_type,
            "status": scan.status,
            "progress": scan.progress,
            "created_at": scan.created_at,
            "started_at": scan.started_at,
            "completed_at": scan.completed_at
        }
        for scan in scans
    ]


@router.get("/top-vulnerabilities")
async def get_top_vulnerabilities(
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get top critical/high vulnerabilities"""
    result = await db.execute(
        select(Vulnerability)
        .where(Vulnerability.severity.in_(['critical', 'high']))
        .where(Vulnerability.status.in_(['open', 'confirmed']))
        .order_by(
            func.case(
                (Vulnerability.severity == 'critical', 1),
                else_=2
            ),
            Vulnerability.created_at.desc()
        )
        .limit(limit)
    )
    vulns = result.scalars().all()
    
    return [
        {
            "id": vuln.id,
            "title": vuln.title,
            "severity": vuln.severity,
            "status": vuln.status,
            "cvss_score": vuln.cvss_score,
            "cve_id": vuln.cve_id,
            "affected_url": vuln.affected_url,
            "created_at": vuln.created_at
        }
        for vuln in vulns
    ]


@router.get("/project-summary")
async def get_project_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get summary of all projects"""
    result = await db.execute(
        select(Project).where(Project.status == "active").limit(10)
    )
    projects = result.scalars().all()
    
    summaries = []
    for project in projects:
        # Get vulnerability count
        vuln_result = await db.execute(
            select(func.count(Vulnerability.id)).where(
                and_(
                    Vulnerability.project_id == project.id,
                    Vulnerability.status.in_(['open', 'confirmed'])
                )
            )
        )
        vuln_count = vuln_result.scalar() or 0
        
        # Get scan count
        scan_result = await db.execute(
            select(func.count(Scan.id)).where(Scan.project_id == project.id)
        )
        scan_count = scan_result.scalar() or 0
        
        summaries.append({
            "id": project.id,
            "name": project.name,
            "client_name": project.client_name,
            "status": project.status,
            "vulnerability_count": vuln_count,
            "scan_count": scan_count,
            "created_at": project.created_at
        })
    
    return summaries
