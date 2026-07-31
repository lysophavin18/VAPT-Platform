"""
NoovaStack VAPT Platform - Scheduling Tasks
"""
import logging
import sys
from pathlib import Path
from datetime import datetime, timezone
from celery import shared_task

APP_ROOT = Path(__file__).resolve().parents[1]
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))

logger = logging.getLogger(__name__)


@shared_task(name="workers.tasks_scheduling.check_scheduled_scans", bind=True)
def check_scheduled_scans(self):
    """Check and execute scheduled scans that are due."""
    import asyncio
    loop = asyncio.new_event_loop()
    try:
        result = loop.run_until_complete(_process_due_schedules())
        return result
    finally:
        loop.close()


async def _process_due_schedules() -> dict:
    from database import AsyncSessionLocal
    from database.models import Asset, ScanAsset, ScanModule, ScanProfile, ScanSchedule, ScheduleRun, Scan
    from sqlalchemy import select

    now = datetime.utcnow()
    executed = 0
    blocked = 0
    dispatched_scan_ids = []

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(ScanSchedule).where(
                ScanSchedule.status == "active",
                ScanSchedule.next_run_at <= now,
            )
        )
        schedules = result.scalars().all()

        for schedule in schedules:
            report_options = schedule.report_options or {}
            asset_ids = [str(asset_id) for asset_id in report_options.get("asset_ids", [])]
            if not asset_ids:
                asset_result = await session.execute(
                    select(Asset).where(
                        Asset.project_id == schedule.project_id,
                        Asset.scope_status == "in_scope",
                    )
                )
                asset_ids = [str(asset.id) for asset in asset_result.scalars().all()]

            if not asset_ids:
                run = ScheduleRun(
                    schedule_id=schedule.id,
                    scheduled_for=schedule.next_run_at,
                    status="blocked",
                    blocked_reason="No in-scope assets are available for this scheduled scan.",
                )
                session.add(run)
                blocked += 1
                continue

            profile_result = await session.execute(
                select(ScanProfile).where(
                    ScanProfile.category.in_([schedule.scan_category, "website"]),
                    ScanProfile.depth == schedule.scan_depth,
                    ScanProfile.enabled == True,
                ).limit(1)
            )
            profile = profile_result.scalar_one_or_none()

            scan = Scan(
                project_id=schedule.project_id,
                engagement_id=schedule.engagement_id,
                scan_profile_id=profile.id if profile else None,
                name=f"{schedule.name} run {now.strftime('%Y-%m-%d %H:%M')}",
                assessment_mode=schedule.assessment_mode,
                scan_category=schedule.scan_category,
                scan_depth=schedule.scan_depth,
                status="queued",
                requested_by=schedule.created_by,
                config=report_options.get("config") or {"safe_only": True, "target": report_options.get("target")},
            )
            session.add(scan)
            await session.flush()

            for asset_id in asset_ids:
                session.add(ScanAsset(scan_id=scan.id, asset_id=asset_id))
            for module_name in (profile.enabled_modules if profile and profile.enabled_modules else ["basic_scan", "report_generation"]):
                session.add(ScanModule(scan_id=scan.id, module_name=module_name))

            run = ScheduleRun(
                schedule_id=schedule.id,
                scan_id=scan.id,
                scheduled_for=schedule.next_run_at,
                status="started",
                started_at=now,
            )
            session.add(run)
            dispatched_scan_ids.append(str(scan.id))

            # Calculate next run
            from dateutil.relativedelta import relativedelta
            if schedule.recurrence_rule == "daily":
                from datetime import timedelta
                schedule.next_run_at = now + timedelta(days=1)
            elif schedule.recurrence_rule == "weekly":
                schedule.next_run_at = now + timedelta(days=7)
            elif schedule.recurrence_rule == "monthly":
                schedule.next_run_at = now + relativedelta(months=1)
            elif schedule.recurrence_rule == "once":
                schedule.status = "completed"
                schedule.next_run_at = None

            executed += 1

        await session.commit()

    if dispatched_scan_ids:
        from workers.celery_app import run_scan
        for scan_id in dispatched_scan_ids:
            run_scan.delay(scan_id)

    return {"schedules_checked": len(schedules), "executed": executed, "blocked": blocked, "dispatched_scan_ids": dispatched_scan_ids}
