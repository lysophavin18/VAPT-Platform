"""
VAPT Platform - Reports Router
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from datetime import datetime
import uuid
import os

from database import get_db
from models import Report, Project, User
from schemas import ReportResponse, ReportCreate
from routers.auth import get_current_active_user
from config import settings

router = APIRouter()


@router.get("/", response_model=List[ReportResponse])
async def list_reports(
    project_id: uuid.UUID = None,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """List all reports"""
    query = select(Report)
    
    if project_id:
        query = query.where(Report.project_id == project_id)
    
    query = query.order_by(Report.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{report_id}", response_model=ReportResponse)
async def get_report(
    report_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get a specific report"""
    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


@router.post("/", response_model=ReportResponse, status_code=status.HTTP_201_CREATED)
async def create_report(
    report_data: ReportCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Generate a new report"""
    from orchestrator.celery_app import generate_report_task
    
    # Verify project exists
    result = await db.execute(select(Project).where(Project.id == report_data.project_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Create report record
    report = Report(
        project_id=report_data.project_id,
        report_name=report_data.report_name,
        report_type=report_data.report_type,
        format=report_data.format,
        status="pending",
        generated_by=current_user.id
    )
    
    db.add(report)
    await db.commit()
    await db.refresh(report)
    
    # Queue report generation task
    try:
        task = generate_report_task.delay(
            str(report.id),
            str(report_data.project_id),
            report_data.report_type,
            report_data.format
        )
        report.status = "generating"
        await db.commit()
    except Exception as e:
        report.status = "failed"
        await db.commit()
    
    return report


@router.get("/{report_id}/download")
async def download_report(
    report_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Download a generated report"""
    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    if report.status != "completed":
        raise HTTPException(status_code=400, detail="Report is not ready for download")
    
    if not report.file_path or not os.path.exists(report.file_path):
        raise HTTPException(status_code=404, detail="Report file not found")
    
    return FileResponse(
        report.file_path,
        filename=f"{report.report_name}.{report.format}",
        media_type="application/octet-stream"
    )


@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_report(
    report_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a report"""
    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    # Delete file if exists
    if report.file_path and os.path.exists(report.file_path):
        os.remove(report.file_path)
    
    await db.delete(report)
    await db.commit()
