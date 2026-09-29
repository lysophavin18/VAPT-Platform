"""
NoovaStack VAPT Platform - Scheduling Tasks
"""
import logging
import sys
from pathlib import Path
from datetime import datetime, timedelta, timezone
from uuid import UUID
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
    from database.models import Approval, Asset, Engagement, Project, ScanAsset, ScanModule, ScanProfile, ScanSchedule, ScheduleRun, Scan
    from safety import SafetyContext, validate_scope, validate_testing_window
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
            try:
                requested_asset_ids = [UUID(str(asset_id)) for asset_id in report_options.get("asset_ids", [])]
            except (TypeError, ValueError, AttributeError):
                session.add(ScheduleRun(
                    schedule_id=schedule.id,
                    scheduled_for=schedule.next_run_at,
                    status="blocked",
                    blocked_reason="One or more selected asset IDs are invalid.",
                ))
                blocked += 1
                continue
            if requested_asset_ids:
                asset_result = await session.execute(
                    select(Asset).where(
                        Asset.id.in_(requested_asset_ids),
                        Asset.project_id == schedule.project_id,
                    )
                )
            else:
                asset_result = await session.execute(
                    select(Asset).where(
                        Asset.project_id == schedule.project_id,
                        Asset.scope_status == "in_scope",
                        Asset.approval_status == "approved",
                    )
                )
            assets = list(asset_result.scalars().all())

            profile_result = await session.execute(
                select(ScanProfile).where(
                    ScanProfile.category.in_([schedule.scan_category, "website"]),
                    ScanProfile.depth == schedule.scan_depth,
                    ScanProfile.enabled == True,
                ).limit(1)
            )
            profile = profile_result.scalar_one_or_none()

            blocking_reasons = []
            project_result = await session.execute(
                select(Project).where(Project.id == schedule.project_id)
            )
            if not project_result.scalar_one_or_none():
                blocking_reasons.append("Project does not exist.")
            if requested_asset_ids and len(assets) != len(set(requested_asset_ids)):
                blocking_reasons.append("One or more selected assets do not exist in the schedule project.")
            if not assets:
                blocking_reasons.append("No assets are available for this scheduled scan.")
            for asset in assets:
                if asset.scope_status != "in_scope" or asset.approval_status != "approved":
                    blocking_reasons.append(f"Asset {asset.value} is not approved and in scope.")
                    continue
                scope_result = validate_scope(str(asset.value), str(schedule.engagement_id) if schedule.engagement_id else None, allow_internal=True)
                if not scope_result.passed:
                    blocking_reasons.append(f"Asset {asset.value}: {scope_result.reason}")

            engagement = None
            if schedule.engagement_id:
                engagement_result = await session.execute(
                    select(Engagement).where(Engagement.id == schedule.engagement_id)
                )
                engagement = engagement_result.scalar_one_or_none()
                if not engagement or engagement.project_id != schedule.project_id:
                    blocking_reasons.append("Selected engagement does not exist in the schedule project.")
                elif engagement.authorization_status != "authorized":
                    blocking_reasons.append("Selected engagement is not authorized.")
                elif engagement.end_date and engagement.end_date < now:
                    blocking_reasons.append("Selected engagement authorization is expired.")

            if not profile:
                blocking_reasons.append("No enabled scan profile matches the scheduled category and depth.")

            approval_required = True  # Every scheduled run requires Security Team approval.
            approval_result = await session.execute(
                select(Approval).where(
                    Approval.schedule_id == schedule.id,
                    Approval.status == "approved",
                )
            )
            schedule_approval = next(
                (
                    approval for approval in approval_result.scalars().all()
                    if approval.approved_by
                    and (not approval.expires_at or approval.expires_at > now)
                ),
                None,
            )
            if approval_required and not schedule_approval:
                blocking_reasons.append("Required schedule approval has not been granted or has expired.")

            testing_window = schedule.testing_window or {}
            window_result = validate_testing_window(SafetyContext(
                testing_window_start=testing_window.get("start") or testing_window.get("testing_window_start"),
                testing_window_end=testing_window.get("end") or testing_window.get("testing_window_end"),
            ))
            if not window_result.passed:
                blocking_reasons.append(window_result.reason)
            if engagement:
                engagement_window_result = validate_testing_window(SafetyContext(
                    testing_window_start=engagement.testing_window_start,
                    testing_window_end=engagement.testing_window_end,
                ))
                if not engagement_window_result.passed:
                    blocking_reasons.append(engagement_window_result.reason)

            prohibited_actions = {
                "denial_of_service", "brute_force", "credential_theft", "malware",
                "persistent_access", "data_exfiltration", "production_data_modification",
                "unauthorized_pivoting",
            }
            selected_actions = set((report_options.get("config") or {}).get("advanced_options") or [])
            blocked_actions = sorted(selected_actions.intersection(prohibited_actions))
            if blocked_actions:
                blocking_reasons.append("Prohibited actions selected: " + ", ".join(blocked_actions))

            if blocking_reasons:
                run = ScheduleRun(
                    schedule_id=schedule.id,
                    scheduled_for=schedule.next_run_at,
                    status="blocked",
                    blocked_reason="; ".join(dict.fromkeys(blocking_reasons)),
                )
                session.add(run)
                blocked += 1
                continue

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
                approved_by=schedule_approval.approved_by if schedule_approval else None,
                config=report_options.get("config") or {},
            )
            session.add(scan)
            await session.flush()

            for asset in assets:
                session.add(ScanAsset(scan_id=scan.id, asset_id=asset.id))
            for module_name in (profile.enabled_modules if profile and profile.enabled_modules else ["basic_scan", "report_generation"]):
                session.add(ScanModule(scan_id=scan.id, module_name=module_name))
            if schedule_approval:
                session.add(Approval(
                    scan_id=scan.id,
                    action="scan_launch",
                    risk_level=schedule_approval.risk_level,
                    status="approved",
                    requested_by=schedule.created_by,
                    approved_by=schedule_approval.approved_by,
                    reason=f"Authorized by persisted schedule approval {schedule_approval.id}.",
                    expires_at=schedule_approval.expires_at,
                    decided_at=schedule_approval.decided_at,
                ))

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
                schedule.next_run_at = now + timedelta(days=1)
            elif schedule.recurrence_rule == "weekly":
                schedule.next_run_at = now + timedelta(days=7)
            elif schedule.recurrence_rule == "monthly":
                schedule.next_run_at = now + relativedelta(months=1)
            elif schedule.recurrence_rule == "once":
                schedule.status = "completed"
                schedule.next_run_at = None
            elif schedule.recurrence_rule == "custom":
                from croniter import croniter
                try:
                    schedule.next_run_at = croniter(schedule.cron_expression, now).get_next(datetime)
                except (ValueError, TypeError):
                    # Defense in depth: request-time validation should already reject a bad
                    # expression, but never leave next_run_at <= now or this schedule would
                    # re-dispatch a new scan on every beat tick.
                    schedule.status = "paused"
                    schedule.next_run_at = None
            else:
                # Unrecognized recurrence rule: pause rather than leave next_run_at <= now,
                # which would otherwise re-dispatch a new scan on every beat tick.
                schedule.status = "paused"
                schedule.next_run_at = None

            executed += 1

        await session.commit()

    if dispatched_scan_ids:
        from workers.celery_app import run_scan
        for scan_id in dispatched_scan_ids:
            run_scan.delay(scan_id)

    return {"schedules_checked": len(schedules), "executed": executed, "blocked": blocked, "dispatched_scan_ids": dispatched_scan_ids}
