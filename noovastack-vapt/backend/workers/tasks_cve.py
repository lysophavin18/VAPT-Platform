"""Reliable background synchronization for NVD CVEs and CISA KEV."""
from __future__ import annotations

import asyncio
import logging
import subprocess
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from celery import shared_task
from redis.asyncio import Redis

from api.routes.cve import NVD_URL, _nvd_date, _parse_nvd_cve
from config import settings

logger = logging.getLogger(__name__)
CISA_KEV_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
SYNC_LOCK_KEY = "noovastack:cve:nvd:sync-lock"
SYNC_LOCK_TTL_SECONDS = 40 * 60
CURSOR_OVERLAP = timedelta(hours=2)
NVD_MAX_WINDOW = timedelta(days=120)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@shared_task(name="workers.tasks_cve.sync_cve_database", bind=True, soft_time_limit=2100, time_limit=2160)
def sync_cve_database(self, days: int = 7, page_size: int = 500, admin_id: str | None = None, mode: str = "modified"):
    """Synchronize a bounded window and expose progress through CVESyncState."""
    try:
        return _run(_sync_cve_database(
            days=max(1, min(days, 120)),
            page_size=max(10, min(page_size, 2000)),
            actor_id=admin_id,
            job_id=self.request.id,
            mode=mode,
        ))
    except Exception as exc:
        logger.error("CVE sync failed: %s", exc, exc_info=True)
        return {"status": "failed", "job_id": self.request.id, "error": "CVE synchronization failed"}


@shared_task(name="workers.tasks_cve.sync_recent_intelligence", bind=True, soft_time_limit=2100, time_limit=2160)
def sync_recent_intelligence(self, days: int = 2, page_size: int = 2000):
    """Refresh CVEs changed since the durable cursor; KEV runs independently."""
    try:
        return _run(_sync_cve_database(days, page_size, None, self.request.id, "cursor"))
    except Exception as exc:
        logger.error("Scheduled CVE sync failed: %s", exc, exc_info=True)
        return {"status": "failed", "job_id": self.request.id, "error": "Scheduled CVE synchronization failed"}


@shared_task(name="workers.tasks_cve.sync_daily_intelligence")
def sync_daily_intelligence(days: int = 2, max_results: int = 2000):
    """Compatibility entry point for tasks queued by older schedulers."""
    try:
        return _run(_sync_cve_database(days, max_results, None, None, "cursor"))
    except Exception as exc:
        logger.error("Daily CVE intelligence sync failed: %s", exc, exc_info=True)
        return {"status": "failed", "error": "Daily CVE intelligence sync failed"}


@shared_task(name="workers.tasks_cve.sync_single_cve", bind=True)
def sync_single_cve(self, cve_id: str, admin_id: str | None = None):
    try:
        return _run(_sync_target_cve(cve_id, admin_id, self.request.id))
    except Exception as exc:
        logger.error("Targeted CVE sync failed for %s: %s", cve_id, exc, exc_info=True)
        return {"status": "failed", "job_id": self.request.id, "cve_id": cve_id, "error": "Targeted CVE synchronization failed"}


@shared_task(name="workers.tasks_cve.sync_kev_catalog", bind=True)
def sync_kev_catalog(self):
    try:
        result = _run(_sync_kev_catalog(job_id=self.request.id))
        return {"status": "success", "job_id": self.request.id, **result}
    except Exception as exc:
        logger.error("CISA KEV sync failed: %s", exc, exc_info=True)
        return {"status": "failed", "job_id": self.request.id, "error": "CISA KEV synchronization failed"}


async def _acquire_lock() -> tuple[Redis, str] | None:
    redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
    token = str(uuid.uuid4())
    try:
        if await redis.set(SYNC_LOCK_KEY, token, ex=SYNC_LOCK_TTL_SECONDS, nx=True):
            return redis, token
    except Exception:
        await redis.aclose()
        raise
    await redis.aclose()
    return None


async def _release_lock(lock: tuple[Redis, str] | None) -> None:
    if not lock:
        return
    redis, token = lock
    try:
        script = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end"
        await redis.eval(script, 1, SYNC_LOCK_KEY, token)
    finally:
        await redis.aclose()


async def _request_json(client: httpx.AsyncClient, url: str, *, params: dict[str, Any] | None = None) -> dict[str, Any]:
    delay = 1.0
    last_error: Exception | None = None
    for attempt in range(5):
        try:
            response = await client.get(url, params=params)
            if response.status_code == 429 or response.status_code >= 500:
                raise httpx.HTTPStatusError("retryable intelligence-source response", request=response.request, response=response)
            response.raise_for_status()
            payload = response.json()
            if url == NVD_URL and not settings.NVD_API_KEY and settings.NVD_REQUEST_DELAY_SECONDS > 0:
                await asyncio.sleep(settings.NVD_REQUEST_DELAY_SECONDS)
            return payload
        except (httpx.TimeoutException, httpx.TransportError, httpx.HTTPStatusError) as exc:
            last_error = exc
            retryable = not isinstance(exc, httpx.HTTPStatusError) or exc.response.status_code == 429 or exc.response.status_code >= 500
            if not retryable or attempt == 4:
                break
            retry_after = exc.response.headers.get("Retry-After") if isinstance(exc, httpx.HTTPStatusError) else None
            await asyncio.sleep(min(float(retry_after) if retry_after and retry_after.isdigit() else delay, 30.0))
            delay = min(delay * 2, 30.0)
    raise RuntimeError("intelligence source request failed") from last_error


def _nvd_headers() -> dict[str, str]:
    return {"apiKey": settings.NVD_API_KEY} if settings.NVD_API_KEY else {}


async def _sync_cve_database(
    days: int,
    page_size: int,
    actor_id: str | None,
    job_id: str | None = None,
    mode: str = "modified",
) -> dict[str, Any]:
    from database import AsyncSessionLocal
    from database.models import AuditLog, CVERecord, CVESyncState

    lock = await _acquire_lock()
    if not lock:
        return {"status": "already_running", "job_id": job_id, "source": "nvd"}

    started_at = _utcnow()
    window_end = started_at
    async with AsyncSessionLocal() as db:
        state = await db.get(CVESyncState, "nvd")
        if not state:
            state = CVESyncState(id="nvd", source="nvd")
            db.add(state)
        previous_success = state.last_success_at
        window_start = previous_success - CURSOR_OVERLAP if mode == "cursor" and previous_success else window_end - timedelta(days=max(1, min(days, 120)))
        state.status = "running"
        state.last_sync_at = started_at
        state.error = None
        state.metadata_json = {
            "job_id": job_id,
            "trigger": "system" if actor_id is None else "admin",
            "mode": mode,
            "window_start": window_start.isoformat(),
            "window_end": window_end.isoformat(),
            "page_size": page_size,
            "pages_processed": 0,
            "records_processed": 0,
        }
        await db.commit()

    inserted = updated = rejected = pages = 0
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(settings.CVE_HTTP_TIMEOUT_SECONDS), follow_redirects=True, headers=_nvd_headers()) as client:
            chunk_start = window_start
            while chunk_start < window_end:
                chunk_end = min(chunk_start + NVD_MAX_WINDOW, window_end)
                start_index = 0
                while True:
                    start_field = "pubStartDate" if mode == "published" else "lastModStartDate"
                    end_field = "pubEndDate" if mode == "published" else "lastModEndDate"
                    params = {
                        start_field: _nvd_date(chunk_start.replace(tzinfo=timezone.utc)),
                        end_field: _nvd_date(chunk_end.replace(tzinfo=timezone.utc)),
                        "resultsPerPage": page_size,
                        "startIndex": start_index,
                    }
                    payload = await _request_json(client, NVD_URL, params=params)
                    vulnerabilities = payload.get("vulnerabilities") or []
                    async with AsyncSessionLocal() as db:
                        rows = []
                        for item in vulnerabilities:
                            cve_data = item.get("cve") or {}
                            cve_id = cve_data.get("id")
                            if not cve_id:
                                rejected += 1
                                continue
                            rows.append({"id": cve_id, **_parse_nvd_cve(cve_data), "synced_at": _utcnow()})
                        if rows:
                            from sqlalchemy import select
                            from sqlalchemy.dialects.postgresql import insert as pg_insert

                            ids = [row["id"] for row in rows]
                            existing_result = await db.execute(select(CVERecord.id).where(CVERecord.id.in_(ids)))
                            existing_ids = set(existing_result.scalars().all())
                            updated += len(existing_ids)
                            inserted += len(rows) - len(existing_ids)
                            statement = pg_insert(CVERecord)
                            statement = statement.on_conflict_do_update(
                                index_elements=[CVERecord.id],
                                set_={column: getattr(statement.excluded, column) for column in rows[0] if column != "id"},
                            )
                            await db.execute(statement, rows)
                        state = await db.get(CVESyncState, "nvd")
                        pages += 1
                        processed = inserted + updated
                        state.records_synced = processed
                        state.metadata_json = {
                            **dict(state.metadata_json or {}),
                            "pages_processed": pages,
                            "records_processed": processed,
                            "inserted": inserted,
                            "updated": updated,
                            "rejected": rejected,
                            "current_start_index": start_index,
                            "total_results": payload.get("totalResults", len(vulnerabilities)),
                        }
                        await db.commit()
                    start_index += len(vulnerabilities)
                    if not vulnerabilities or start_index >= int(payload.get("totalResults") or 0):
                        break
                chunk_start = chunk_end

        async with AsyncSessionLocal() as db:
            state = await db.get(CVESyncState, "nvd")
            completed_at = _utcnow()
            state.status = "success"
            state.last_success_at = completed_at
            state.records_synced = inserted + updated
            state.error = None
            state.metadata_json = {
                **dict(state.metadata_json or {}),
                "completed_at": completed_at.isoformat(),
                "cursor": window_end.isoformat(),
                "inserted": inserted,
                "updated": updated,
                "rejected": rejected,
                "pages_processed": pages,
                "source_url": NVD_URL,
            }
            audit_actor = _valid_uuid(actor_id)
            db.add(AuditLog(
                actor_id=audit_actor,
                event_type="cve",
                action="cve_database_synced",
                details={
                    "triggered_by": "system" if audit_actor is None else "administrator",
                    "job_id": job_id,
                    "inserted": inserted,
                    "updated": updated,
                    "rejected": rejected,
                    "pages": pages,
                },
            ))
            await db.commit()
        return {
            "status": "success",
            "job_id": job_id,
            "source": "nvd",
            "records_synced": inserted + updated,
            "inserted": inserted,
            "updated": updated,
            "rejected": rejected,
            "pages": pages,
        }
    except Exception as exc:
        logger.error("NVD synchronization failed", exc_info=True)
        async with AsyncSessionLocal() as db:
            await db.rollback()
            state = await db.get(CVESyncState, "nvd")
            if state:
                state.status = "failed"
                state.error = "NVD synchronization failed"
                state.metadata_json = {
                    **dict(state.metadata_json or {}),
                    "failed_at": _utcnow().isoformat(),
                    "error_type": type(exc).__name__,
                    "inserted": inserted,
                    "updated": updated,
                    "rejected": rejected,
                    "pages_processed": pages,
                }
                await db.commit()
        raise
    finally:
        await _release_lock(lock)


def _valid_uuid(value: str | None):
    if not value:
        return None
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError, AttributeError):
        return None


async def _sync_target_cve(cve_id: str, actor_id: str | None, job_id: str | None) -> dict[str, Any]:
    from database import AsyncSessionLocal
    from database.models import AuditLog, CVERecord

    async with httpx.AsyncClient(timeout=httpx.Timeout(settings.CVE_HTTP_TIMEOUT_SECONDS), follow_redirects=True, headers=_nvd_headers()) as client:
        payload = await _request_json(client, NVD_URL, params={"cveId": cve_id})
    items = payload.get("vulnerabilities") or []
    if not items:
        return {"status": "not_found", "job_id": job_id, "cve_id": cve_id}
    cve_data = items[0].get("cve") or {}
    async with AsyncSessionLocal() as db:
        record = await db.get(CVERecord, cve_id)
        created = record is None
        if created:
            record = CVERecord(id=cve_id)
            db.add(record)
        for key, value in _parse_nvd_cve(cve_data).items():
            setattr(record, key, value)
        db.add(AuditLog(
            actor_id=_valid_uuid(actor_id),
            event_type="cve",
            action="cve_targeted_sync",
            details={"cve_id": cve_id, "job_id": job_id, "created": created},
        ))
        await db.commit()
    return {"status": "success", "job_id": job_id, "cve_id": cve_id, "created": created}


async def _sync_kev_catalog(job_id: str | None = None) -> dict[str, Any]:
    from database import AsyncSessionLocal
    from database.models import CVERecord, CVESyncState

    async with AsyncSessionLocal() as db:
        state = await db.get(CVESyncState, "cisa-kev") or CVESyncState(id="cisa-kev", source="cisa-kev")
        state.status = "running"
        state.last_sync_at = _utcnow()
        state.error = None
        state.metadata_json = {**dict(state.metadata_json or {}), "job_id": job_id}
        db.add(state)
        await db.commit()
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(settings.CVE_HTTP_TIMEOUT_SECONDS), follow_redirects=True) as client:
            payload = await _request_json(client, CISA_KEV_URL)
        vulnerabilities = payload.get("vulnerabilities") or []
        created = matched = 0
        async with AsyncSessionLocal() as db:
            for item in vulnerabilities:
                cve_id = item.get("cveID")
                if not cve_id:
                    continue
                record = await db.get(CVERecord, cve_id)
                if record is None:
                    record = CVERecord(
                        id=cve_id,
                        source="cisa-kev",
                        title=item.get("vulnerabilityName") or cve_id,
                        description=item.get("shortDescription") or "",
                        raw={},
                    )
                    db.add(record)
                    created += 1
                else:
                    matched += 1
                raw = dict(record.raw or {})
                raw["cisa_kev"] = True
                raw["cisa_kev_data"] = item
                record.raw = raw
            state = await db.get(CVESyncState, "cisa-kev")
            completed_at = _utcnow()
            state.status = "success"
            state.last_success_at = completed_at
            state.records_synced = len(vulnerabilities)
            state.metadata_json = {
                "job_id": job_id,
                "source_url": CISA_KEV_URL,
                "catalog_version": payload.get("catalogVersion"),
                "created_local_records": created,
                "matched_local_records": matched,
                "completed_at": completed_at.isoformat(),
            }
            await db.commit()
        return {"records_synced": len(vulnerabilities), "created": created, "matched": matched}
    except Exception as exc:
        async with AsyncSessionLocal() as db:
            await db.rollback()
            state = await db.get(CVESyncState, "cisa-kev")
            if state:
                state.status = "failed"
                state.error = "CISA KEV synchronization failed"
                state.metadata_json = {**dict(state.metadata_json or {}), "error_type": type(exc).__name__}
                await db.commit()
        raise


@shared_task(name="workers.tasks_cve.update_nuclei_templates")
def update_nuclei_templates():
    """Refresh Nuclei templates; this task never launches a target scan."""
    try:
        result = subprocess.run(
            ["nuclei", "-update-templates"],
            capture_output=True,
            text=True,
            timeout=300,
            check=False,
        )
        if result.returncode:
            logger.error("Nuclei template update failed: %s", result.stderr[-1000:])
            return {"status": "failed", "error": "Nuclei template update failed"}
        return {"status": "success", "message": result.stdout[-1000:]}
    except Exception as exc:
        logger.error("Nuclei template update failed: %s", exc, exc_info=True)
        return {"status": "failed", "error": "Nuclei template update failed"}
