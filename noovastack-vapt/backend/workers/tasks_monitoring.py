"""
NoovaStack VAPT Platform - Domain Monitoring Tasks

Continuously re-discovers a monitored domain and emits DomainMonitorEvent rows
for every detected change (new subdomain, IP change, tech update, port change, etc.).

Severity mapping:
  new_subdomain       → warning  (attack surface expansion)
  removed_subdomain   → info
  ip_changed          → warning  (potential hijack / CDN rotation)
  port_added          → warning  (new exposed service)
  port_removed        → info
  tech_changed        → info
  status_code_changed → info
  new_asset           → info
"""
import asyncio
import logging
from datetime import datetime, timedelta

from celery import shared_task

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Celery beat-dispatched task — run all due monitors
# ─────────────────────────────────────────────────────────────────────────────

@shared_task(name="workers.tasks_monitoring.run_due_domain_monitors")
def run_due_domain_monitors():
    """
    Called by Celery beat (e.g. every hour).
    Finds all active DomainMonitor rows whose next_check_at <= now and dispatches
    individual check tasks for each one.
    """
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(_dispatch_due_monitors())
    finally:
        loop.close()


async def _dispatch_due_monitors():
    from database import AsyncSessionLocal
    from database.models import DomainMonitor
    from sqlalchemy import select

    now = datetime.utcnow()
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(DomainMonitor).where(
                DomainMonitor.status == "active",
                DomainMonitor.next_check_at <= now,
            )
        )
        monitors = list(result.scalars().all())
        logger.info(f"[monitor dispatcher] {len(monitors)} domain(s) due for check")
        for monitor in monitors:
            run_domain_monitor_check.delay(str(monitor.id))


# ─────────────────────────────────────────────────────────────────────────────
# Per-monitor check task
# ─────────────────────────────────────────────────────────────────────────────

@shared_task(name="workers.tasks_monitoring.run_domain_monitor_check", bind=True)
def run_domain_monitor_check(self, monitor_id: str):
    """
    Run a single domain monitor check:
      1. Re-discover the domain (subdomain_enum + dns_enum + tech_fingerprint)
      2. Diff against the stored last_snapshot
      3. Write DomainMonitorEvent rows for every change
      4. Update last_snapshot, last_checked_at, next_check_at
    """
    logger.info(f"[domain monitor] starting check for monitor_id={monitor_id}")
    loop = asyncio.new_event_loop()
    try:
        result = loop.run_until_complete(_check_monitor(monitor_id))
        return result
    except Exception as exc:
        logger.error(f"[domain monitor] check failed for {monitor_id}: {exc}", exc_info=True)
        return {"status": "failed", "error": str(exc)}
    finally:
        loop.close()


async def _check_monitor(monitor_id: str) -> dict:
    from database import AsyncSessionLocal
    from database.models import DomainMonitor, DomainMonitorEvent
    from sqlalchemy import select
    from workers.tasks_discovery import _discover_assets

    async with AsyncSessionLocal() as session:
        monitor = (await session.execute(
            select(DomainMonitor).where(DomainMonitor.id == monitor_id)
        )).scalar_one_or_none()

        if not monitor:
            raise ValueError(f"DomainMonitor {monitor_id} not found")
        if monitor.status != "active":
            return {"status": "skipped", "reason": f"monitor status is {monitor.status}"}

    # Run discovery (writes/updates assets in the DB, returns list of discovered dicts)
    try:
        current = await _discover_assets(
            str(monitor.project_id),
            monitor.domain,
            list(monitor.discovery_types or ["subdomain_enum", "dns_enum", "tech_fingerprint"]),
            target_type="root_domain",
        )
    except Exception as exc:
        logger.warning(f"[domain monitor] discovery failed for {monitor.domain}: {exc}")
        current = []

    # Diff against snapshot
    previous: list[dict] = monitor.last_snapshot or []
    events = _diff_snapshots(previous, current, monitor.domain)

    now = datetime.utcnow()
    next_check = now + timedelta(hours=int(monitor.check_interval_hours or 24))

    async with AsyncSessionLocal() as session:
        # Persist events
        for ev in events:
            session.add(DomainMonitorEvent(
                monitor_id=monitor.id,
                event_type=ev["event_type"],
                severity=ev["severity"],
                asset_value=ev.get("asset_value"),
                summary=ev["summary"],
                details=ev.get("details", {}),
                detected_at=now,
            ))

        # Re-fetch monitor and update
        monitor = (await session.execute(
            select(DomainMonitor).where(DomainMonitor.id == monitor_id)
        )).scalar_one()
        monitor.last_snapshot = current
        monitor.last_checked_at = now
        monitor.next_check_at = next_check

        await session.commit()

    logger.info(
        f"[domain monitor] {monitor.domain}: {len(current)} assets found, "
        f"{len(events)} change event(s)"
    )
    return {
        "status": "completed",
        "domain": monitor.domain,
        "assets_found": len(current),
        "events_generated": len(events),
        "next_check_at": next_check.isoformat(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Diff logic
# ─────────────────────────────────────────────────────────────────────────────

def _diff_snapshots(previous: list[dict], current: list[dict], root_domain: str) -> list[dict]:
    """
    Compare two discovery snapshots and return a list of change event dicts.
    Each event: {event_type, severity, asset_value, summary, details}
    """
    events: list[dict] = []

    prev_map = {a["value"]: a for a in previous}
    curr_map = {a["value"]: a for a in current}

    prev_subs = {v for v, a in prev_map.items() if a.get("type") in ("subdomain", "domain")}
    curr_subs = {v for v, a in curr_map.items() if a.get("type") in ("subdomain", "domain")}

    # New subdomains
    for sub in sorted(curr_subs - prev_subs):
        events.append({
            "event_type": "new_subdomain",
            "severity": "warning",
            "asset_value": sub,
            "summary": f"New subdomain discovered: {sub}",
            "details": {"current": curr_map.get(sub, {})},
        })

    # Removed subdomains
    for sub in sorted(prev_subs - curr_subs):
        events.append({
            "event_type": "removed_subdomain",
            "severity": "info",
            "asset_value": sub,
            "summary": f"Subdomain no longer resolves: {sub}",
            "details": {"previous": prev_map.get(sub, {})},
        })

    # For each asset present in both snapshots, check for changes
    for value in sorted(prev_map.keys() & curr_map.keys()):
        prev_asset = prev_map[value]
        curr_asset = curr_map[value]

        # IP / DNS changes
        prev_ips = set((prev_asset.get("dns_records") or {}).get("a") or [])
        curr_ips = set((curr_asset.get("dns_records") or {}).get("a") or [])
        if prev_ips and curr_ips and prev_ips != curr_ips:
            events.append({
                "event_type": "ip_changed",
                "severity": "warning",
                "asset_value": value,
                "summary": f"IP address changed for {value}",
                "details": {
                    "previous_ips": sorted(prev_ips),
                    "current_ips": sorted(curr_ips),
                },
            })

        # Port changes
        prev_ports = set((prev_asset.get("ports_services") or {}).keys())
        curr_ports = set((curr_asset.get("ports_services") or {}).keys())
        for p in sorted(curr_ports - prev_ports):
            svc = (curr_asset.get("ports_services") or {}).get(p, {})
            events.append({
                "event_type": "port_added",
                "severity": "warning",
                "asset_value": value,
                "summary": f"New open port {p} on {value}",
                "details": {"port": p, "service": svc},
            })
        for p in sorted(prev_ports - curr_ports):
            events.append({
                "event_type": "port_removed",
                "severity": "info",
                "asset_value": value,
                "summary": f"Port {p} closed on {value}",
                "details": {"port": p},
            })

        # Technology changes (server / cms / cdn)
        prev_tech = prev_asset.get("technology") or {}
        curr_tech = curr_asset.get("technology") or {}
        for key in ("server", "cms", "cdn", "waf", "frameworks"):
            pv = prev_tech.get(key)
            cv = curr_tech.get(key)
            if pv and cv and pv != cv:
                events.append({
                    "event_type": "tech_changed",
                    "severity": "info",
                    "asset_value": value,
                    "summary": f"{key.title()} changed on {value}: {pv!r} → {cv!r}",
                    "details": {"field": key, "previous": pv, "current": cv},
                })

        # HTTP status code change
        prev_sc = (prev_tech.get("status_code") or
                   next(iter((prev_asset.get("ports_services") or {}).values()), {}).get("status_code"))
        curr_sc = (curr_tech.get("status_code") or
                   next(iter((curr_asset.get("ports_services") or {}).values()), {}).get("status_code"))
        if prev_sc and curr_sc and prev_sc != curr_sc:
            events.append({
                "event_type": "status_code_changed",
                "severity": "info",
                "asset_value": value,
                "summary": f"HTTP status changed for {value}: {prev_sc} → {curr_sc}",
                "details": {"previous": prev_sc, "current": curr_sc},
            })

    # Entirely new assets (not just subdomains)
    new_assets = set(curr_map.keys()) - set(prev_map.keys()) - (curr_subs - prev_subs)
    for value in sorted(new_assets):
        a = curr_map[value]
        if a.get("type") not in ("subdomain", "domain"):
            events.append({
                "event_type": "new_asset",
                "severity": "info",
                "asset_value": value,
                "summary": f"New {a.get('type', 'asset')} discovered: {value}",
                "details": {"current": a},
            })

    return events
