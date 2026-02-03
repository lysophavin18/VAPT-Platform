"""
VAPT Platform - Vulnerabilities Router
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List
from datetime import datetime
import uuid

from database import get_db
from models import Vulnerability, User
from schemas import VulnerabilityResponse, VulnerabilityCreate, VulnerabilityUpdate, Severity
from routers.auth import get_current_active_user

router = APIRouter()


@router.get("/", response_model=List[VulnerabilityResponse])
async def list_vulnerabilities(
    project_id: uuid.UUID = None,
    scan_id: uuid.UUID = None,
    severity: str = None,
    status_filter: str = None,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """List all vulnerabilities with optional filters"""
    query = select(Vulnerability)
    
    if project_id:
        query = query.where(Vulnerability.project_id == project_id)
    if scan_id:
        query = query.where(Vulnerability.scan_id == scan_id)
    if severity:
        query = query.where(Vulnerability.severity == severity)
    if status_filter:
        query = query.where(Vulnerability.status == status_filter)
    
    query = query.order_by(
        # Order by severity (critical first)
        func.case(
            (Vulnerability.severity == 'critical', 1),
            (Vulnerability.severity == 'high', 2),
            (Vulnerability.severity == 'medium', 3),
            (Vulnerability.severity == 'low', 4),
            else_=5
        )
    ).offset(skip).limit(limit)
    
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/stats")
async def get_vulnerability_stats(
    project_id: uuid.UUID = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get vulnerability statistics"""
    base_query = select(Vulnerability)
    if project_id:
        base_query = base_query.where(Vulnerability.project_id == project_id)
    
    # Get counts by severity
    stats = {}
    for sev in ['critical', 'high', 'medium', 'low', 'info']:
        result = await db.execute(
            select(func.count(Vulnerability.id)).where(
                Vulnerability.severity == sev
            ).where(Vulnerability.project_id == project_id if project_id else True)
        )
        stats[sev] = result.scalar() or 0
    
    # Get counts by status
    status_stats = {}
    for st in ['open', 'confirmed', 'fixed', 'false_positive', 'accepted_risk']:
        result = await db.execute(
            select(func.count(Vulnerability.id)).where(
                Vulnerability.status == st
            ).where(Vulnerability.project_id == project_id if project_id else True)
        )
        status_stats[st] = result.scalar() or 0
    
    return {
        "by_severity": stats,
        "by_status": status_stats,
        "total": sum(stats.values())
    }


@router.get("/{vuln_id}", response_model=VulnerabilityResponse)
async def get_vulnerability(
    vuln_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get a specific vulnerability"""
    result = await db.execute(select(Vulnerability).where(Vulnerability.id == vuln_id))
    vuln = result.scalar_one_or_none()
    
    if not vuln:
        raise HTTPException(status_code=404, detail="Vulnerability not found")
    return vuln


@router.post("/", response_model=VulnerabilityResponse, status_code=status.HTTP_201_CREATED)
async def create_vulnerability(
    vuln_data: VulnerabilityCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new vulnerability manually"""
    vuln = Vulnerability(
        scan_id=vuln_data.scan_id,
        project_id=vuln_data.project_id,
        target_id=vuln_data.target_id,
        title=vuln_data.title,
        description=vuln_data.description,
        severity=vuln_data.severity.value,
        cvss_score=vuln_data.cvss_score,
        cve_id=vuln_data.cve_id,
        cwe_id=vuln_data.cwe_id,
        affected_component=vuln_data.affected_component,
        affected_url=vuln_data.affected_url,
        evidence=vuln_data.evidence,
        remediation=vuln_data.remediation,
        references=vuln_data.references,
        found_by_tool=vuln_data.found_by_tool,
        raw_output=vuln_data.raw_output,
        status="open"
    )
    
    db.add(vuln)
    await db.commit()
    await db.refresh(vuln)
    
    return vuln


@router.patch("/{vuln_id}", response_model=VulnerabilityResponse)
async def update_vulnerability(
    vuln_id: uuid.UUID,
    vuln_data: VulnerabilityUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Update a vulnerability"""
    result = await db.execute(select(Vulnerability).where(Vulnerability.id == vuln_id))
    vuln = result.scalar_one_or_none()
    
    if not vuln:
        raise HTTPException(status_code=404, detail="Vulnerability not found")
    
    update_data = vuln_data.model_dump(exclude_unset=True)
    
    # Handle verification
    if 'is_verified' in update_data and update_data['is_verified']:
        vuln.verified_by = current_user.id
        vuln.verified_at = datetime.utcnow()
    
    for key, value in update_data.items():
        if hasattr(vuln, key):
            setattr(vuln, key, value.value if hasattr(value, 'value') else value)
    
    await db.commit()
    await db.refresh(vuln)
    
    return vuln


@router.post("/{vuln_id}/verify", response_model=VulnerabilityResponse)
async def verify_vulnerability(
    vuln_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Mark a vulnerability as verified"""
    result = await db.execute(select(Vulnerability).where(Vulnerability.id == vuln_id))
    vuln = result.scalar_one_or_none()
    
    if not vuln:
        raise HTTPException(status_code=404, detail="Vulnerability not found")
    
    vuln.is_verified = True
    vuln.verified_by = current_user.id
    vuln.verified_at = datetime.utcnow()
    vuln.status = "confirmed"
    
    await db.commit()
    await db.refresh(vuln)
    
    return vuln


@router.post("/{vuln_id}/false-positive", response_model=VulnerabilityResponse)
async def mark_false_positive(
    vuln_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Mark a vulnerability as false positive"""
    result = await db.execute(select(Vulnerability).where(Vulnerability.id == vuln_id))
    vuln = result.scalar_one_or_none()
    
    if not vuln:
        raise HTTPException(status_code=404, detail="Vulnerability not found")
    
    vuln.status = "false_positive"
    vuln.verified_by = current_user.id
    vuln.verified_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(vuln)
    
    return vuln


@router.delete("/{vuln_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vulnerability(
    vuln_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a vulnerability"""
    result = await db.execute(select(Vulnerability).where(Vulnerability.id == vuln_id))
    vuln = result.scalar_one_or_none()
    
    if not vuln:
        raise HTTPException(status_code=404, detail="Vulnerability not found")
    
    await db.delete(vuln)
    await db.commit()
