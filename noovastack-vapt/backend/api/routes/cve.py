"""CVE database sync and lookup routes."""
from __future__ import annotations

from datetime import datetime, timedelta
import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import User, require_admin, require_user
from database import get_db
from database.models import AuditLog, CVERecord, CVESyncState
from config import settings


router = APIRouter()
NVD_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0"


@router.get("/status")
async def cve_sync_status(db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    state = await _get_state(db)
    await _recover_stale_state(db, state)
    total_records = await db.scalar(select(func.count()).select_from(CVERecord))
    kev_state = await db.get(CVESyncState, "cisa-kev")
    freshness_cutoff = datetime.utcnow() - timedelta(hours=settings.CVE_STALE_AFTER_HOURS)
    return {
        "source": state.source,
        "status": state.status,
        "last_sync_at": state.last_sync_at.isoformat() if state.last_sync_at else None,
        "last_success_at": state.last_success_at.isoformat() if state.last_success_at else None,
        "records_synced": state.records_synced,
        "total_records": total_records or 0,
        "is_stale": not state.last_success_at or state.last_success_at < freshness_cutoff,
        "error": state.error,
        "metadata": state.metadata_json or {},
        "kev": _state_payload(kev_state) if kev_state else None,
    }


@router.post("/sync")
async def sync_cve_database(
    days: int = Query(default=7, ge=1, le=120),
    max_results: int = Query(default=500, ge=10, le=2000),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    state = await _get_state(db)
    await _recover_stale_state(db, state)
    if state.status == "running":
        raise HTTPException(status_code=409, detail="CVE synchronization is already running")
    from workers.celery_app import sync_cve_database_task
    task = sync_cve_database_task.apply_async(args=[days, max_results, str(admin.id), "published"])
    return {"status": "queued", "job_id": task.id, "source": "nvd"}


@router.post("/sync/{cve_id}")
async def sync_one_cve(cve_id: str, admin: User = Depends(require_admin)):
    normalized = cve_id.strip().upper()
    if not re.fullmatch(r"CVE-\d{4}-\d{4,}", normalized):
        raise HTTPException(status_code=422, detail="Invalid CVE ID")
    from workers.celery_app import app
    task = app.signature("workers.tasks_cve.sync_single_cve").apply_async(args=[normalized, str(admin.id)])
    return {"status": "queued", "job_id": task.id, "source": "nvd", "cve_id": normalized}


@router.get("/jobs/{job_id}")
async def cve_job_status(job_id: str, admin: User = Depends(require_admin)):
    if not re.fullmatch(r"[0-9a-fA-F-]{32,36}", job_id):
        raise HTTPException(status_code=422, detail="Invalid job ID")
    from workers.celery_app import app
    result = app.AsyncResult(job_id)
    payload = result.result if result.ready() and isinstance(result.result, dict) else None
    return {"job_id": job_id, "status": result.status.lower(), "ready": result.ready(), "result": payload}


@router.get("/search")
async def search_cves(
    q: str = Query(default="", min_length=0),
    severity: str | None = None,
    limit: int = Query(default=25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    query = select(CVERecord)
    if q:
        pattern = f"%{q}%"
        query = query.where(or_(CVERecord.id.ilike(pattern), CVERecord.description.ilike(pattern), CVERecord.title.ilike(pattern)))
    if severity:
        query = query.where(CVERecord.severity == severity.lower())
    result = await db.execute(query.order_by(CVERecord.published_at.desc()).limit(limit))
    return [_record_payload(record) for record in result.scalars().all()]


async def _get_state(db: AsyncSession) -> CVESyncState:
    state = await db.get(CVESyncState, "nvd")
    if not state:
        state = CVESyncState(id="nvd", source="nvd")
        db.add(state)
        await db.commit()
        await db.refresh(state)
    return state


async def _recover_stale_state(db: AsyncSession, state: CVESyncState) -> None:
    if state.status != "running" or not state.last_sync_at:
        return
    if state.last_sync_at >= datetime.utcnow() - timedelta(minutes=40):
        return
    state.status = "failed"
    state.error = "Previous synchronization did not complete before its timeout"
    state.metadata_json = {**dict(state.metadata_json or {}), "stale_recovered_at": datetime.utcnow().isoformat()}
    await db.commit()


def _state_payload(state: CVESyncState) -> dict[str, Any]:
    return {
        "source": state.source,
        "status": state.status,
        "last_sync_at": state.last_sync_at.isoformat() if state.last_sync_at else None,
        "last_success_at": state.last_success_at.isoformat() if state.last_success_at else None,
        "records_synced": state.records_synced,
        "error": state.error,
        "metadata": state.metadata_json or {},
    }


def _nvd_date(value: datetime) -> str:
    return value.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _parse_nvd_cve(cve_data: dict[str, Any]) -> dict[str, Any]:
    descriptions = cve_data.get("descriptions") or []
    description = next((item.get("value") for item in descriptions if item.get("lang") == "en"), "")
    metrics = cve_data.get("metrics") or {}
    metric = _first_metric(metrics)
    weaknesses = cve_data.get("weaknesses") or []
    cwes = [desc.get("value") for weakness in weaknesses for desc in weakness.get("description", []) if desc.get("value")]
    refs = cve_data.get("references") or []
    if isinstance(refs, dict):
        refs = refs.get("referenceData") or []
    references = [ref.get("url") for ref in refs if isinstance(ref, dict) and ref.get("url")]
    return {
        "source": "nvd",
        "title": cve_data.get("id"),
        "description": description,
        "severity": (metric.get("baseSeverity") or "unknown").lower(),
        "cvss_score": metric.get("baseScore"),
        "published_at": _parse_dt(cve_data.get("published")),
        "last_modified_at": _parse_dt(cve_data.get("lastModified")),
        "references": references[:20],
        "cwes": sorted(set(cwes)),
        "configurations": cve_data.get("configurations") or [],
        # Keep source metadata needed for lifecycle decisions without duplicating
        # descriptions, references, metrics, and configurations already stored
        # in normalized columns.
        "raw": {
            "sourceIdentifier": cve_data.get("sourceIdentifier"),
            "vulnStatus": cve_data.get("vulnStatus"),
            "evaluatorComment": cve_data.get("evaluatorComment"),
            "evaluatorImpact": cve_data.get("evaluatorImpact"),
        },
    }


def _first_metric(metrics: dict[str, Any]) -> dict[str, Any]:
    for key in ("cvssMetricV31", "cvssMetricV30", "cvssMetricV2"):
        values = metrics.get(key) or []
        if values:
            cvss = values[0].get("cvssData") or {}
            return {"baseSeverity": values[0].get("baseSeverity") or cvss.get("baseSeverity"), "baseScore": cvss.get("baseScore")}
    return {}


def _parse_dt(value: str | None):
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)


def _record_payload(record: CVERecord) -> dict[str, Any]:
    return {
        "id": record.id,
        "source": record.source,
        "title": record.title,
        "description": record.description,
        "severity": record.severity,
        "cvss_score": record.cvss_score,
        "published_at": record.published_at.isoformat() if record.published_at else None,
        "last_modified_at": record.last_modified_at.isoformat() if record.last_modified_at else None,
        "references": record.references or [],
        "cwes": record.cwes or [],
    }
