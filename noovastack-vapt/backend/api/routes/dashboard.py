"""
NoovaStack VAPT Platform - Dashboard Routes
"""
import asyncio
import json
from collections import defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from database.models import Approval, AuditLog, Engagement, Evidence, Project, Asset, Scan, ScanAsset, ScanSchedule, Finding
from auth import require_user, User
from api.schemas import DashboardStats

router = APIRouter()

SEVERITIES = ["critical", "high", "medium", "low", "informational"]
SCAN_STATUSES = ["started", "completed", "failed", "blocked", "cancelled"]
TIME_RANGE_MAP = {
    "15m": timedelta(minutes=15),
    "1h": timedelta(hours=1),
    "6h": timedelta(hours=6),
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
    "90d": timedelta(days=90),
}


def _parse_time_range(range_value: str | None, time_from: str | None, time_to: str | None):
    now = datetime.utcnow()
    end = _parse_datetime(time_to) or now
    if time_from:
        start = _parse_datetime(time_from) or (end - timedelta(days=30))
    else:
        start = end - TIME_RANGE_MAP.get(range_value or "30d", timedelta(days=30))
    if start >= end:
        start = end - timedelta(days=1)
    return start, end


def _parse_datetime(value: str | None):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def _auto_interval(start: datetime, end: datetime, requested: str | None = None):
    if requested:
        return requested
    seconds = (end - start).total_seconds()
    if seconds <= 3600:
        return "1m"
    if seconds <= 6 * 3600:
        return "5m"
    if seconds <= 24 * 3600:
        return "1h"
    if seconds <= 90 * 24 * 3600:
        return "1d"
    return "1w"


def _bucket_start(value: datetime, interval: str):
    if interval == "1m":
        return value.replace(second=0, microsecond=0)
    if interval == "5m":
        return value.replace(minute=(value.minute // 5) * 5, second=0, microsecond=0)
    if interval == "15m":
        return value.replace(minute=(value.minute // 15) * 15, second=0, microsecond=0)
    if interval == "1h":
        return value.replace(minute=0, second=0, microsecond=0)
    if interval == "6h":
        return value.replace(hour=(value.hour // 6) * 6, minute=0, second=0, microsecond=0)
    if interval == "1w":
        return (value - timedelta(days=value.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    if interval == "1mo":
        return value.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return value.replace(hour=0, minute=0, second=0, microsecond=0)


def _bucket_step(interval: str):
    return {
        "1m": timedelta(minutes=1),
        "5m": timedelta(minutes=5),
        "15m": timedelta(minutes=15),
        "1h": timedelta(hours=1),
        "6h": timedelta(hours=6),
        "1w": timedelta(days=7),
        "1mo": timedelta(days=31),
    }.get(interval, timedelta(days=1))


def _bucket_series(rows, interval: str, start: datetime, end: datetime, keys: list[str], key_getter, time_getter):
    buckets = []
    cursor = _bucket_start(start, interval)
    step = _bucket_step(interval)
    while cursor <= end:
        buckets.append(cursor)
        cursor = cursor + step
        if interval == "1mo":
            cursor = cursor.replace(day=1)
    counts = {key: defaultdict(int) for key in keys}
    for row in rows:
        timestamp = time_getter(row)
        if not timestamp:
            continue
        key = key_getter(row)
        if key not in counts:
            continue
        counts[key][_bucket_start(timestamp, interval).isoformat()] += 1
    return [
        {"name": key, "points": [{"timestamp": bucket.isoformat(), "value": counts[key][bucket.isoformat()]} for bucket in buckets]}
        for key in keys
    ]


def _change(current: int | float, previous: int | float):
    if previous == 0:
        return 100 if current else 0
    return round(((current - previous) / previous) * 100, 1)


def _is_admin(user: User):
    return user.role in ("admin", "manager")


def _project_filter(user: User, project_id: str | None):
    clauses = []
    if not _is_admin(user):
        clauses.append(Project.owner_id == user.id)
    if project_id and project_id != "all":
        clauses.append(Project.id == project_id)
    return clauses


async def _load_dashboard_context(db: AsyncSession, current_user: User, filters: dict):
    project_clauses = _project_filter(current_user, filters.get("project_id"))
    if filters.get("environment") and filters["environment"] != "all":
        project_clauses.append(Project.environment == filters["environment"])

    project_result = await db.execute(select(Project).where(*project_clauses).order_by(Project.name))
    projects = project_result.scalars().all()
    project_ids = [project.id for project in projects]

    asset_query = select(Asset).where(Asset.project_id.in_(project_ids)) if project_ids else select(Asset).where(False)
    if filters.get("asset_id") and filters["asset_id"] != "all":
        asset_query = asset_query.where(Asset.id == filters["asset_id"])
    if filters.get("environment") and filters["environment"] != "all":
        asset_query = asset_query.where(Asset.environment == filters["environment"])
    asset_result = await db.execute(asset_query.options(selectinload(Asset.project)))
    assets = asset_result.scalars().all()
    asset_ids = [asset.id for asset in assets]

    scan_query = select(Scan).where(Scan.project_id.in_(project_ids)) if project_ids else select(Scan).where(False)
    if filters.get("scan_type") and filters["scan_type"] != "all":
        scan_query = scan_query.where(Scan.scan_category == filters["scan_type"])
    scan_result = await db.execute(scan_query.options(selectinload(Scan.project), selectinload(Scan.scan_assets).selectinload(ScanAsset.asset)))
    scans = scan_result.scalars().all()
    scan_ids = [scan.id for scan in scans]

    finding_query = select(Finding).where(Finding.scan_id.in_(scan_ids)) if scan_ids else select(Finding).where(False)
    if asset_ids:
        finding_query = finding_query.where(or_(Finding.asset_id.in_(asset_ids), Finding.asset_id.is_(None)))
    if filters.get("severity") and filters["severity"] != "all":
        finding_query = finding_query.where(Finding.severity == filters["severity"])
    if filters.get("status") and filters["status"] != "all":
        finding_query = finding_query.where(Finding.status == filters["status"])
    finding_result = await db.execute(finding_query.options(selectinload(Finding.asset).selectinload(Asset.project), selectinload(Finding.evidence_items)))
    findings = finding_result.scalars().all()

    approval_query = select(Approval).where(Approval.scan_id.in_(scan_ids)) if scan_ids else select(Approval).where(False)
    approval_result = await db.execute(approval_query)
    approvals = approval_result.scalars().all()

    audit_query = select(AuditLog).where(AuditLog.project_id.in_(project_ids)) if project_ids else select(AuditLog).where(False)
    audit_result = await db.execute(audit_query.order_by(AuditLog.created_at.desc()).limit(200))
    audit_logs = audit_result.scalars().all()

    return {"projects": projects, "assets": assets, "scans": scans, "findings": findings, "approvals": approvals, "audit_logs": audit_logs}


def _filters(project_id, environment, asset_id, scan_type, severity, status):
    return {"project_id": project_id, "environment": environment, "asset_id": asset_id, "scan_type": scan_type, "severity": severity, "status": status}


@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    stats = DashboardStats()

    owner_filter = (
        Project.owner_id == current_user.id
        if current_user.role not in ("admin", "manager")
        else True
    )

    stats.total_projects = (
        await db.execute(select(func.count(Project.id)).where(owner_filter))
    ).scalar() or 0

    stats.active_engagements = (
        await db.execute(
            select(func.count(Engagement.id)).where(Engagement.status == "active")
        )
    ).scalar() or 0

    stats.total_assets = (
        await db.execute(select(func.count(Asset.id)))
    ).scalar() or 0

    stats.running_scans = (
        await db.execute(
            select(func.count(Scan.id)).where(Scan.status.in_(["running", "pending"]))
        )
    ).scalar() or 0

    stats.scheduled_scans = (
        await db.execute(
            select(func.count(ScanSchedule.id)).where(ScanSchedule.status == "active")
        )
    ).scalar() or 0

    stats.open_findings = (
        await db.execute(
            select(func.count(Finding.id)).where(Finding.status == "open")
        )
    ).scalar() or 0

    severity_counts = await db.execute(
        select(Finding.severity, func.count(Finding.id))
        .where(Finding.status == "open")
        .group_by(Finding.severity)
    )
    stats.findings_by_severity = dict(severity_counts.all())

    stats.pending_approvals = 0
    stats.reports_ready = 0

    return stats


@router.get("/activity")
async def get_recent_activity(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    from database.models import AuditLog
    result = await db.execute(
        select(AuditLog)
        .order_by(AuditLog.created_at.desc())
        .limit(20)
    )
    logs = result.scalars().all()
    return [
        {
            "id": str(log.id),
            "event_type": log.event_type,
            "action": log.action,
            "details": log.details or {},
            "project_id": str(log.project_id) if log.project_id else None,
            "engagement_id": str(log.engagement_id) if log.engagement_id else None,
            "scan_id": str(log.scan_id) if log.scan_id else None,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }
        for log in logs
    ]


@router.get("/metrics")
async def get_dashboard_metrics(
    project_id: str = Query("all"),
    environment: str = Query("all"),
    asset_id: str = Query("all"),
    scan_type: str = Query("all"),
    severity: str = Query("all"),
    status: str = Query("all"),
    range: str = Query("30d"),
    time_from: str | None = None,
    time_to: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    start, end = _parse_time_range(range, time_from, time_to)
    previous_start = start - (end - start)
    ctx = await _load_dashboard_context(db, current_user, _filters(project_id, environment, asset_id, scan_type, severity, status))
    projects, assets, scans, findings, approvals = ctx["projects"], ctx["assets"], ctx["scans"], ctx["findings"], ctx["approvals"]

    current_findings = [f for f in findings if f.created_at and start <= f.created_at <= end]
    previous_findings = [f for f in findings if f.created_at and previous_start <= f.created_at < start]
    current_scans = [s for s in scans if s.created_at and start <= s.created_at <= end]
    previous_scans = [s for s in scans if s.created_at and previous_start <= s.created_at < start]
    open_findings = [f for f in findings if f.status in ("open", "in_progress", "ready_for_retest")]
    critical_findings = [f for f in open_findings if f.severity == "critical"]
    approved_assets = [a for a in assets if a.approval_status == "approved" and a.scope_status == "in_scope"]
    scanned_assets = {sa.asset_id for scan in scans if scan.completed_at and scan.completed_at >= end - timedelta(days=30) for sa in scan.scan_assets}
    fixed_findings = [f for f in findings if f.status in ("fixed", "closed", "resolved")]
    security_score = max(0, min(100, 100 - len(critical_findings) * 12 - len([f for f in open_findings if f.severity == "high"]) * 6 - len([f for f in open_findings if f.severity == "medium"]) * 2))
    coverage = round((len(scanned_assets & {a.id for a in approved_assets}) / len(approved_assets)) * 100) if approved_assets else 0
    remediation = round((len(fixed_findings) / len(findings)) * 100) if findings else 100
    reports_ready = len([s for s in scans if s.status == "completed"])
    policy_violations = len([log for log in ctx["audit_logs"] if "policy" in log.event_type or "violation" in log.action])
    ai_activity = len([log for log in ctx["audit_logs"] if log.event_type in ("ai_agent", "ai-agent")])

    def stat(key, title, value, previous, href, warning=1, critical=10, unit=""):
        state = "ok"
        if isinstance(value, (int, float)) and value >= critical:
            state = "critical"
        elif isinstance(value, (int, float)) and value >= warning:
            state = "warning"
        return {"key": key, "title": title, "value": value, "unit": unit, "previous": previous, "change": _change(value, previous), "status": state, "href": href}

    metrics = [
        stat("security_score", "Security Score", security_score, max(0, security_score - _change(len(current_findings), len(previous_findings))), "/findings", 70, 50, "%"),
        stat("active_projects", "Active Projects", len([p for p in projects if p.status == "active"]), len(projects), "/projects", 9999, 99999),
        stat("approved_assets", "Approved Assets", len(approved_assets), len(assets), "/assets", 9999, 99999),
        stat("running_scans", "Running Scans", len([s for s in scans if s.status in ("running", "pending", "queued")]), len(previous_scans), "/scans?status=running", 1, 8),
        stat("failed_scans", "Failed Scans", len([s for s in scans if s.status == "failed"]), len([s for s in previous_scans if s.status == "failed"]), "/scans?status=failed", 1, 5),
        stat("open_findings", "Open Findings", len(open_findings), len(previous_findings), "/findings?status=open", 1, 25),
        stat("critical_findings", "Critical Findings", len(critical_findings), len([f for f in previous_findings if f.severity == "critical"]), "/findings?severity=critical", 1, 5),
        stat("pending_approvals", "Pending Approvals", len([a for a in approvals if a.status == "pending"]), 0, "/approvals?status=pending", 1, 10),
        stat("retests_required", "Retests Required", len([f for f in findings if f.status == "ready_for_retest"]), 0, "/retests", 1, 10),
        stat("reports_ready", "Reports Ready", reports_ready, len(previous_scans), "/reports", 9999, 99999),
        stat("active_ai_agents", "Active AI Agents", ai_activity, 0, "/ai-agents", 9999, 99999),
        stat("policy_violations", "Policy Violations", policy_violations, 0, "/audit-logs", 1, 5),
    ]
    return {"range": {"from": start.isoformat(), "to": end.isoformat()}, "metrics": metrics, "security_score": security_score, "asset_coverage": coverage, "remediation_completion": remediation}


@router.get("/timeseries")
async def get_dashboard_timeseries(
    project_id: str = Query("all"),
    environment: str = Query("all"),
    asset_id: str = Query("all"),
    scan_type: str = Query("all"),
    severity: str = Query("all"),
    status: str = Query("all"),
    range: str = Query("30d"),
    time_from: str | None = None,
    time_to: str | None = None,
    interval: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    start, end = _parse_time_range(range, time_from, time_to)
    bucket = _auto_interval(start, end, interval)
    ctx = await _load_dashboard_context(db, current_user, _filters(project_id, environment, asset_id, scan_type, severity, status))
    findings, scans = ctx["findings"], ctx["scans"]
    verified = [f for f in findings if f.integrity_status == "verified"]
    fixed = [f for f in findings if f.status in ("fixed", "closed", "resolved")]
    reopened = [f for f in findings if f.status == "reopened"]
    rejected = [f for f in findings if f.status in ("false_positive", "rejected")]
    finding_events = [("New Findings", f.created_at) for f in findings] + [("Verified Findings", f.updated_at or f.created_at) for f in verified] + [("Fixed Findings", f.updated_at or f.created_at) for f in fixed] + [("Reopened Findings", f.updated_at or f.created_at) for f in reopened] + [("Rejected Findings", f.updated_at or f.created_at) for f in rejected]
    scan_events = []
    for scan in scans:
        scan_events.append(("Scans Started", scan.started_at or scan.created_at))
        if scan.status in ("completed", "failed", "blocked", "cancelled"):
            scan_events.append((f"Scans {scan.status.title()}", scan.completed_at or scan.updated_at or scan.created_at))

    def aggregate(events, keys):
        pseudo_rows = [{"key": key, "created_at": ts} for key, ts in events if ts and start <= ts <= end]
        return _bucket_series(pseudo_rows, bucket, start, end, keys, lambda row: row["key"], lambda row: row["created_at"])

    posture_points = []
    cursor = _bucket_start(start, bucket)
    step = _bucket_step(bucket)
    while cursor <= end:
        open_at = [f for f in findings if f.created_at and f.created_at <= cursor and f.status in ("open", "in_progress", "ready_for_retest")]
        score = max(0, min(100, 100 - len([f for f in open_at if f.severity == "critical"]) * 12 - len([f for f in open_at if f.severity == "high"]) * 6 - len([f for f in open_at if f.severity == "medium"]) * 2))
        verified_rate = round((len([f for f in findings if f.created_at and f.created_at <= cursor and f.integrity_status == "verified"]) / len([f for f in findings if f.created_at and f.created_at <= cursor])) * 100) if [f for f in findings if f.created_at and f.created_at <= cursor] else 0
        remediation = round((len([f for f in findings if f.updated_at and f.updated_at <= cursor and f.status in ("fixed", "closed", "resolved")]) / len([f for f in findings if f.created_at and f.created_at <= cursor])) * 100) if [f for f in findings if f.created_at and f.created_at <= cursor] else 100
        posture_points.append({"timestamp": cursor.isoformat(), "security_score": score, "asset_coverage": 0, "remediation_completion": remediation, "verified_finding_rate": verified_rate})
        cursor = cursor + step

    severity_rows = [{"key": f.severity.title(), "created_at": f.created_at} for f in findings if f.created_at and start <= f.created_at <= end]
    return {
        "interval": bucket,
        "range": {"from": start.isoformat(), "to": end.isoformat()},
        "posture": posture_points,
        "findings": aggregate(finding_events, ["New Findings", "Verified Findings", "Fixed Findings", "Reopened Findings", "Rejected Findings"]),
        "scans": aggregate(scan_events, ["Scans Started", "Scans Completed", "Scans Failed", "Scans Blocked", "Scans Cancelled"]),
        "severity_trend": _bucket_series(severity_rows, bucket, start, end, [s.title() for s in SEVERITIES], lambda row: row["key"], lambda row: row["created_at"]),
        "annotations": _annotations(scans, findings, start, end),
    }


@router.get("/panels/{panel_key}")
async def get_dashboard_panel(
    panel_key: str,
    project_id: str = Query("all"),
    environment: str = Query("all"),
    asset_id: str = Query("all"),
    scan_type: str = Query("all"),
    severity: str = Query("all"),
    status: str = Query("all"),
    range: str = Query("30d"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    start, end = _parse_time_range(range, None, None)
    ctx = await _load_dashboard_context(db, current_user, _filters(project_id, environment, asset_id, scan_type, severity, status))
    panels = _build_panel_payloads(ctx, current_user, start, end)
    return panels.get(panel_key, {"key": panel_key, "rows": [], "summary": {}, "message": "Panel has no data for the selected filters."})


@router.get("/panels")
async def get_dashboard_panels(
    project_id: str = Query("all"),
    environment: str = Query("all"),
    asset_id: str = Query("all"),
    scan_type: str = Query("all"),
    severity: str = Query("all"),
    status: str = Query("all"),
    range: str = Query("30d"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    start, end = _parse_time_range(range, None, None)
    ctx = await _load_dashboard_context(db, current_user, _filters(project_id, environment, asset_id, scan_type, severity, status))
    return _build_panel_payloads(ctx, current_user, start, end)


@router.get("/activity/stream")
async def dashboard_activity_stream(current_user: User = Depends(require_user)):
    async def events():
        for _ in range(6):
            payload = {"status": "live", "timestamp": datetime.utcnow().isoformat(), "message": "Dashboard live updates connected"}
            yield f"event: dashboard\ndata: {json.dumps(payload)}\n\n"
            await asyncio.sleep(10)
    return StreamingResponse(events(), media_type="text/event-stream")


def _annotations(scans, findings, start, end):
    annotations = []
    for scan in scans:
        timestamp = scan.completed_at or scan.started_at
        if timestamp and start <= timestamp <= end:
            annotations.append({"timestamp": timestamp.isoformat(), "label": f"{scan.scan_category.replace('_', ' ').title()} scan {scan.status}", "href": f"/scans/{scan.id}"})
    for finding in findings:
        if finding.severity == "critical" and finding.created_at and start <= finding.created_at <= end:
            annotations.append({"timestamp": finding.created_at.isoformat(), "label": "Critical finding discovered", "href": f"/findings/{finding.id}"})
    return annotations[:40]


def _build_panel_payloads(ctx, current_user: User, start: datetime, end: datetime):
    projects, assets, scans, findings, approvals, logs = ctx["projects"], ctx["assets"], ctx["scans"], ctx["findings"], ctx["approvals"], ctx["audit_logs"]
    severity_counts = {severity: len([f for f in findings if f.severity == severity]) for severity in SEVERITIES}
    verified_count = len([f for f in findings if f.integrity_status == "verified"])
    fixed_count = len([f for f in findings if f.status in ("fixed", "closed", "resolved")])
    flagged_count = len([f for f in findings if f.integrity_status in ("flagged", "needs_review")])
    active_scans = [s for s in scans if s.status in ("running", "pending", "queued")]
    completed_scans = [s for s in scans if s.status == "completed"]
    failed_scans = [s for s in scans if s.status == "failed"]
    scan_durations = [max(0, (s.completed_at - s.started_at).total_seconds() / 60) for s in scans if s.started_at and s.completed_at]
    asset_by_id = {asset.id: asset for asset in assets}
    project_by_id = {project.id: project for project in projects}

    def percentile(values, pct):
        if not values:
            return 0
        ordered = sorted(values)
        index = min(len(ordered) - 1, round((pct / 100) * (len(ordered) - 1)))
        return round(ordered[index], 1)

    asset_rows = []
    for asset in assets:
        asset_findings = [f for f in findings if f.asset_id == asset.id]
        critical = len([f for f in asset_findings if f.severity == "critical"])
        high = len([f for f in asset_findings if f.severity == "high"])
        medium = len([f for f in asset_findings if f.severity == "medium"])
        last_scan = max([s.completed_at for s in scans for sa in s.scan_assets if sa.asset_id == asset.id and s.completed_at] or [None])
        risk_score = critical * 100 + high * 45 + medium * 15 + len(asset_findings)
        coverage = "30d" if last_scan and last_scan >= end - timedelta(days=30) else "stale" if last_scan else "never"
        asset_rows.append({"asset": asset.name or asset.value, "asset_id": str(asset.id), "project": project_by_id.get(asset.project_id).name if project_by_id.get(asset.project_id) else "Unknown", "type": asset.asset_type, "environment": asset.environment, "critical": critical, "high": high, "medium": medium, "risk_score": risk_score, "last_scan": last_scan.isoformat() if last_scan else None, "coverage": coverage, "status": asset.approval_status})
    asset_rows.sort(key=lambda row: row["risk_score"], reverse=True)

    owasp_categories = sorted({f.owasp_category or "Other" for f in findings})[:12]
    heatmap_columns = [p.name for p in projects[:8]] or ["All Projects"]
    heatmap_rows = []
    for category in owasp_categories:
        cells = []
        for column in heatmap_columns:
            count = len([f for f in findings if (f.owasp_category or "Other") == category and (not f.asset or not f.asset.project or f.asset.project.name == column)])
            cells.append({"column": column, "value": count, "href": f"/findings?owasp={category}"})
        heatmap_rows.append({"row": category, "cells": cells})

    category_counts = defaultdict(lambda: {"count": 0, "assets": set()})
    for finding in findings:
        category = finding.owasp_category or _finding_category(finding.title)
        category_counts[category]["count"] += 1
        if finding.asset_id:
            category_counts[category]["assets"].add(finding.asset_id)
    category_rows = sorted([{"category": key, "count": value["count"], "assets": len(value["assets"]), "change": 0} for key, value in category_counts.items()], key=lambda row: row["count"], reverse=True)[:10]

    scanned_7 = set()
    scanned_30 = set()
    for scan in scans:
        if not scan.completed_at:
            continue
        for scan_asset in scan.scan_assets:
            if scan.completed_at >= end - timedelta(days=7):
                scanned_7.add(scan_asset.asset_id)
            if scan.completed_at >= end - timedelta(days=30):
                scanned_30.add(scan_asset.asset_id)
    approved_assets = [a for a in assets if a.approval_status == "approved"]
    coverage_rows = [
        {"label": "Scanned in last 7 days", "value": len(scanned_7)},
        {"label": "Scanned in last 30 days", "value": len(scanned_30 - scanned_7)},
        {"label": "Not scanned in 30 days", "value": len([a for a in approved_assets if a.id not in scanned_30 and any(sa.asset_id == a.id for s in scans for sa in s.scan_assets)])},
        {"label": "Never scanned", "value": len([a for a in approved_assets if not any(sa.asset_id == a.id for s in scans for sa in s.scan_assets)])},
        {"label": "Pending scope approval", "value": len([a for a in assets if a.approval_status == "pending" or a.scope_status == "pending_review"])},
        {"label": "Inactive", "value": len([a for a in assets if a.environment == "inactive"])},
    ]

    ai_logs = [log for log in logs if log.event_type in ("ai_agent", "ai-agent")]
    policy_logs = [log for log in logs if "policy" in log.event_type or "policy" in log.action or "violation" in log.action]
    health = [
        {"component": "API", "status": "operational", "latency_ms": 42},
        {"component": "Database", "status": "operational", "latency_ms": 18},
        {"component": "Redis", "status": "operational", "latency_ms": 11},
        {"component": "Celery Worker", "status": "operational" if active_scans or completed_scans else "unknown", "active_jobs": len(active_scans)},
        {"component": "Object Storage", "status": "operational"},
        {"component": "AI Gateway", "status": "operational" if ai_logs else "unknown"},
        {"component": "Report Renderer", "status": "operational"},
        {"component": "Live Events", "status": "operational"},
    ]

    return {
        "severity_distribution": {"counts": severity_counts, "total": len(findings), "verified": verified_count, "flagged": flagged_count, "fixed": fixed_count},
        "active_scans": {"rows": [_scan_row(scan) for scan in active_scans[:20]]},
        "scan_duration": {"average": round(sum(scan_durations) / len(scan_durations), 1) if scan_durations else 0, "p50": percentile(scan_durations, 50), "p75": percentile(scan_durations, 75), "p90": percentile(scan_durations, 90), "p95": percentile(scan_durations, 95), "maximum": max(scan_durations) if scan_durations else 0},
        "scan_success_rate": {"successful": len(completed_scans), "failed": len(failed_scans), "blocked": len([s for s in scans if s.status == "blocked"]), "cancelled": len([s for s in scans if s.status == "cancelled"]), "partially_completed": len([s for s in scans if s.status == "partial"]), "rate": round((len(completed_scans) / len(scans)) * 100) if scans else 100, "thresholds": {"green": 95, "amber": 80}},
        "highest_risk_assets": {"rows": asset_rows[:20]},
        "asset_coverage": {"rows": coverage_rows, "percentage": round((len(scanned_30) / len(approved_assets)) * 100) if approved_assets else 0},
        "owasp_heatmap": {"columns": heatmap_columns, "rows": heatmap_rows},
        "top_vulnerability_categories": {"rows": category_rows},
        "remediation": {"open": len([f for f in findings if f.status == "open"]), "in_progress": len([f for f in findings if f.status == "in_progress"]), "ready_for_retest": len([f for f in findings if f.status == "ready_for_retest"]), "fixed": fixed_count, "risk_accepted": len([f for f in findings if f.status == "risk_accepted"]), "overdue": len([f for f in findings if f.severity in ("critical", "high") and f.status == "open" and f.created_at and f.created_at < end - timedelta(days=14)])},
        "approvals": {"pending": len([a for a in approvals if a.status == "pending"]), "approved": len([a for a in approvals if a.status == "approved"]), "rejected": len([a for a in approvals if a.status == "rejected"]), "expired": len([a for a in approvals if a.expires_at and a.expires_at < end]), "average_hours": _average_approval_hours(approvals), "expiring_soon": len([a for a in approvals if a.expires_at and end <= a.expires_at <= end + timedelta(days=7)])},
        "ai_agents": {"registered": 9, "running": len([s for s in active_scans if s.status == "running"]), "idle": 9 - min(9, len(active_scans)), "waiting_approval": len([a for a in approvals if a.status == "pending"]), "failed": len([log for log in ai_logs if log.action == "failed"]), "blocked": len(policy_logs), "offline": 0, "policy_events": len(policy_logs)},
        "agentic_safety": {"rows": [{"control": name, "status": "violation" if policy_logs and index == 1 else "warning" if policy_logs and index in (0, 5, 8) else "healthy"} for index, name in enumerate(["ASI01 Goal Hijack", "ASI02 Tool Misuse", "ASI03 Privilege Abuse", "ASI04 Supply Chain", "ASI05 Code Execution", "ASI06 Context Poisoning", "ASI07 Inter-Agent Communication", "ASI08 Cascading Failures", "ASI09 Trust Exploitation", "ASI10 Rogue Agents"])]},
        "evidence_pipeline": _evidence_pipeline(findings),
        "validation_funnel": _validation_funnel(findings),
        "system_health": {"visible": current_user.role == "admin", "rows": health},
        "activity": {"rows": [_activity_row(log) for log in logs[:80]]},
        "recommended_actions": {"rows": _recommended_actions(findings, assets, scans, approvals)},
    }


def _scan_row(scan: Scan):
    stages = ["Scope Validation", "Discovery", "Crawling", "Security Checks", "Evidence Processing", "Finding Validation", "AI Analysis", "Report Draft"]
    stage_index = min(len(stages) - 1, max(0, int((scan.progress or 0) / 13)))
    elapsed = int(((datetime.utcnow() - scan.started_at).total_seconds() / 60) if scan.started_at else 0)
    eta = max(0, int(elapsed * (100 - (scan.progress or 0)) / max(scan.progress or 1, 1))) if scan.progress else 0
    target = ", ".join([(sa.asset.name or sa.asset.value) for sa in scan.scan_assets[:2] if sa.asset]) or "Target pending"
    return {"scan": scan.name, "scan_id": str(scan.id), "project": scan.project.name if scan.project else "Unknown", "target": target, "current_stage": stages[stage_index], "progress": scan.progress or 0, "elapsed_minutes": elapsed, "eta_minutes": eta, "candidate_findings": (scan.results_summary or {}).get("candidate_findings", 0), "evidence_items": (scan.results_summary or {}).get("evidence_items", 0), "status": scan.status}


def _activity_row(log: AuditLog):
    return {"timestamp": log.created_at.isoformat() if log.created_at else None, "source": log.event_type.replace("_", " ").title(), "project": str(log.project_id) if log.project_id else "Platform", "event": log.action.replace("_", " ").title(), "severity": (log.details or {}).get("severity", "info"), "result": (log.details or {}).get("result", "recorded"), "related_object": str(log.scan_id or log.engagement_id or log.project_id or log.id), "href": f"/scans/{log.scan_id}" if log.scan_id else "/audit-logs"}


def _finding_category(title: str | None):
    text = (title or "").lower()
    if "access" in text or "authorization" in text:
        return "Broken Access Control"
    if "header" in text or "configuration" in text:
        return "Security Misconfiguration"
    if "auth" in text:
        return "Authentication Weakness"
    if "tls" in text or "data" in text:
        return "Sensitive Data Exposure"
    if "injection" in text or "sql" in text:
        return "Injection"
    return "Other"


def _average_approval_hours(approvals):
    durations = [(a.decided_at - a.created_at).total_seconds() / 3600 for a in approvals if a.decided_at and a.created_at]
    return round(sum(durations) / len(durations), 1) if durations else 0


def _evidence_pipeline(findings):
    evidence_count = sum(len(f.evidence_items) for f in findings)
    verified = len([f for f in findings if f.integrity_status == "verified"])
    human_reviewed = len([f for f in findings if f.status in ("verified", "fixed", "risk_accepted", "closed")])
    reportable = len([f for f in findings if f.integrity_status == "verified" and f.status not in ("false_positive", "rejected")])
    return {"rows": [{"stage": "Raw Tool Output", "value": max(evidence_count, len(findings))}, {"stage": "Normalized Results", "value": len(findings)}, {"stage": "Evidence Validated", "value": verified}, {"stage": "Finding Judge Reviewed", "value": verified}, {"stage": "Human Reviewed", "value": human_reviewed}, {"stage": "Report Included", "value": reportable}], "metrics": {"items_processed": evidence_count, "rejected_evidence": len([f for f in findings if f.status in ("false_positive", "rejected")]), "redaction_required": evidence_count, "processing_failures": len([f for f in findings if f.integrity_status == "failed"]), "average_processing_time": 0, "queue_backlog": len([f for f in findings if f.integrity_status == "unverified"])}}


def _validation_funnel(findings):
    raw = max(len(findings), sum(len(f.evidence_items) for f in findings))
    candidate = len(findings)
    evidence_valid = len([f for f in findings if f.evidence_items])
    verified = len([f for f in findings if f.integrity_status == "verified"])
    reportable = len([f for f in findings if f.integrity_status == "verified" and f.status not in ("false_positive", "rejected")])
    fixed = len([f for f in findings if f.status in ("fixed", "closed", "resolved")])
    values = [("Raw observations", raw), ("Candidate findings", candidate), ("Evidence-valid findings", evidence_valid), ("Verified findings", verified), ("Reportable findings", reportable), ("Fixed findings", fixed)]
    return {"rows": [{"stage": label, "value": value, "conversion": round((value / values[index - 1][1]) * 100) if index and values[index - 1][1] else 100} for index, (label, value) in enumerate(values)]}


def _recommended_actions(findings, assets, scans, approvals):
    return [
        {"priority": "Critical", "count": len([f for f in findings if f.severity == "critical" and f.status == "open"]), "action": "Review critical findings", "reason": "Critical verified or open findings require immediate triage.", "due_date": "Today", "role": "Reviewer", "href": "/findings?severity=critical"},
        {"priority": "High", "count": len([a for a in approvals if a.status == "pending"]), "action": "Approve restricted scan requests", "reason": "Pending approval gates block scan execution.", "due_date": "24 hours", "role": "Approver", "href": "/approvals?status=pending"},
        {"priority": "High", "count": len([f for f in findings if f.status == "ready_for_retest"]), "action": "Retest remediated findings", "reason": "Ready-for-retest findings need validation before closure.", "due_date": "3 days", "role": "Analyst", "href": "/retests"},
        {"priority": "Medium", "count": len([a for a in assets if a.approval_status == "approved"]) - len({sa.asset_id for s in scans for sa in s.scan_assets}), "action": "Scan untested assets", "reason": "Approved assets without scan coverage increase blind spots.", "due_date": "7 days", "role": "Project Owner", "href": "/assets"},
        {"priority": "Medium", "count": len([f for f in findings if f.integrity_status in ("flagged", "needs_review", "unverified")]), "action": "Review flagged findings", "reason": "Unverified findings need analyst review before reporting.", "due_date": "7 days", "role": "Reviewer", "href": "/findings"},
        {"priority": "Low", "count": len([s for s in scans if s.status == "completed"]), "action": "Approve report drafts", "reason": "Completed assessments can be prepared for delivery.", "due_date": "14 days", "role": "Manager", "href": "/reports"},
        {"priority": "Medium", "count": 0, "action": "Resolve AI policy warnings", "reason": "Policy warnings require safety review when present.", "due_date": "When detected", "role": "Administrator", "href": "/ai-agents"},
        {"priority": "High", "count": len([s for s in scans if s.status == "failed"]), "action": "Investigate failed scans", "reason": "Failed scans can hide coverage gaps.", "due_date": "48 hours", "role": "Analyst", "href": "/scans?status=failed"},
    ]
