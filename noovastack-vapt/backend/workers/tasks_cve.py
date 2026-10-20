"""Background CVE database synchronization tasks."""
import asyncio
import logging
import subprocess
from datetime import datetime, timedelta, timezone

import httpx
from celery import shared_task

from api.routes.cve import NVD_URL, _nvd_date, _parse_nvd_cve

logger = logging.getLogger(__name__)
CISA_KEV_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"


@shared_task(name="workers.tasks_cve.sync_cve_database", bind=True)
def sync_cve_database(self, days: int, max_results: int, admin_id: str):
    """Fetch NVD data and persist it without blocking the API request."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(_sync_cve_database(days, max_results, admin_id))
    except Exception as exc:
        logger.error("CVE sync failed: %s", exc, exc_info=True)
        return {"status": "failed", "error": "CVE synchronization failed"}
    finally:
        loop.close()


async def _sync_cve_database(days: int, max_results: int, admin_id: str) -> dict:
    from database import AsyncSessionLocal
    from database.models import AuditLog, CVERecord, CVESyncState

    async with AsyncSessionLocal() as db:
        state = await db.get(CVESyncState, "nvd")
        if not state:
            state = CVESyncState(id="nvd", source="nvd")
            db.add(state)
        state.status = "running"
        state.last_sync_at = datetime.utcnow()
        state.error = None
        await db.commit()

        try:
            end = datetime.now(timezone.utc)
            params = {"pubStartDate": _nvd_date(end - timedelta(days=days)), "pubEndDate": _nvd_date(end), "resultsPerPage": max_results, "startIndex": 0}
            async with httpx.AsyncClient(timeout=45.0, follow_redirects=True) as client:
                response = await client.get(NVD_URL, params=params)
                response.raise_for_status()
                payload = response.json()

            synced = 0
            for item in payload.get("vulnerabilities") or []:
                cve_data = item.get("cve") or {}
                cve_id = cve_data.get("id")
                if not cve_id:
                    continue
                record = await db.get(CVERecord, cve_id)
                if not record:
                    record = CVERecord(id=cve_id)
                    db.add(record)
                for key, value in _parse_nvd_cve(cve_data).items():
                    setattr(record, key, value)
                synced += 1

            state.status = "success"
            state.last_success_at = datetime.utcnow()
            state.records_synced = synced
            state.metadata_json = {"days": days, "max_results": max_results, "source_url": NVD_URL}
            db.add(AuditLog(actor_id=admin_id, event_type="cve", action="cve_database_synced", details={"records_synced": synced, "days": days}))
            await db.commit()
            return {"status": "success", "records_synced": synced, "source": "nvd"}
        except Exception:
            state.status = "failed"
            state.error = "CVE synchronization failed"
            await db.commit()
            raise


@shared_task(name="workers.tasks_cve.sync_daily_intelligence")
def sync_daily_intelligence(days: int = 2, max_results: int = 2000):
    """Refresh NVD records and CISA KEV metadata once per day."""
    from database import AsyncSessionLocal

    loop = asyncio.new_event_loop()
    try:
        nvd = loop.run_until_complete(_sync_cve_database(days, max_results, "system"))
        kev = loop.run_until_complete(_sync_kev_catalog())
        return {"status": "success", "nvd": nvd, "kev": kev}
    except Exception as exc:
        logger.error("Daily CVE intelligence sync failed: %s", exc, exc_info=True)
        return {"status": "failed", "error": "Daily CVE intelligence sync failed"}
    finally:
        loop.close()


async def _sync_kev_catalog() -> dict:
    from database import AsyncSessionLocal
    from database.models import CVERecord, CVESyncState

    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        response = await client.get(CISA_KEV_URL)
        response.raise_for_status()
        vulnerabilities = response.json().get("vulnerabilities") or []

    kev_ids = {item.get("cveID") for item in vulnerabilities if item.get("cveID")}
    async with AsyncSessionLocal() as db:
        matched = 0
        for cve_id in kev_ids:
            record = await db.get(CVERecord, cve_id)
            if record:
                raw = dict(record.raw or {})
                raw["cisa_kev"] = True
                raw["cisa_kev_date_added"] = next((item.get("dateAdded") for item in vulnerabilities if item.get("cveID") == cve_id), None)
                record.raw = raw
                matched += 1
        state = await db.get(CVESyncState, "cisa-kev") or CVESyncState(id="cisa-kev", source="cisa-kev")
        state.status = "success"
        state.last_sync_at = datetime.utcnow()
        state.last_success_at = state.last_sync_at
        state.records_synced = len(kev_ids)
        state.metadata_json = {"source_url": CISA_KEV_URL, "matched_local_records": matched}
        db.add(state)
        await db.commit()
    return {"records_synced": len(kev_ids), "matched_local_records": matched}


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
