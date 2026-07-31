"""
NoovaStack VAPT Platform - Scan Routes
"""
import uuid
from datetime import datetime
import asyncio
import json
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from database.models import Approval, Evidence, Scan, ScanAsset, ScanEvent, ScanModule, ScanProfile, ScanSafetyState, Asset, Project, Finding, AuditLog
from auth import require_user, User, require_manager
from api.schemas import ScanCreate, ScanResponse, FindingResponse
from scans.tools import SCANNER_TOOL_CATALOG

router = APIRouter()


@router.post("", response_model=ScanResponse, status_code=status.HTTP_201_CREATED)
async def create_scan(
    data: ScanCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    project = await db.execute(select(Project).where(Project.id == data.project_id))
    if not project.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    profile = None
    if data.scan_profile_id:
        p = await db.execute(select(ScanProfile).where(ScanProfile.id == data.scan_profile_id))
        profile = p.scalar_one_or_none()

    scan = Scan(
        project_id=data.project_id,
        engagement_id=data.engagement_id,
        scan_profile_id=data.scan_profile_id,
        name=data.name,
        assessment_mode=data.assessment_mode,
        scan_category=data.scan_category,
        scan_depth=data.scan_depth,
        status="draft",
        requested_by=current_user.id,
        config=data.config,
    )
    db.add(scan)
    await db.flush()

    for asset_id in data.asset_ids:
        sa = ScanAsset(scan_id=scan.id, asset_id=asset_id)
        db.add(sa)

    module_names = profile.enabled_modules if profile and profile.enabled_modules else _default_modules_for_scan(data.scan_category, data.scan_depth)
    for mod_name in module_names:
        sm = ScanModule(scan_id=scan.id, module_name=mod_name)
        db.add(sm)

    db.add(AuditLog(
        project_id=data.project_id,
        scan_id=scan.id,
        actor_id=current_user.id,
        event_type="scan",
        action="create_scan",
        details={"status": scan.status},
    ))
    db.add(ScanSafetyState(scan_id=scan.id))
    db.add(ScanEvent(scan_id=scan.id, event_type="scan_created", severity="info", summary="Scan request created and recorded.", details_json={"created_by": str(current_user.id)}))

    await db.commit()
    await db.refresh(scan)
    return scan


@router.get("", response_model=list[ScanResponse])
async def list_scans(
    project_id: str | None = None,
    status_filter: str | None = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    query = select(Scan)
    if project_id:
        query = query.where(Scan.project_id == project_id)
    if status_filter:
        query = query.where(Scan.status == status_filter)
    if current_user.role not in ("admin", "manager"):
        query = query.where(Scan.requested_by == current_user.id)
    result = await db.execute(query.order_by(Scan.created_at.desc()))
    return result.scalars().all()


@router.get("/catalog")
async def scan_catalog(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    result = await db.execute(
        select(ScanProfile).where(ScanProfile.enabled == True).order_by(ScanProfile.category, ScanProfile.depth)
    )
    profiles = result.scalars().all()
    return [
        {
            "id": profile.id,
            "name": profile.name,
            "category": profile.category,
            "depth": profile.depth,
            "assessment_modes": profile.assessment_modes or [],
            "enabled_modules": profile.enabled_modules or [],
            "risk_level": profile.risk_level,
            "approval_required": False,
            "senior_approval_required": False,
        }
        for profile in profiles
    ]


@router.get("/tools/catalog")
async def scanner_tools_catalog(current_user: User = Depends(require_user)):
    return SCANNER_TOOL_CATALOG


@router.get("/{scan_id}", response_model=ScanResponse)
async def get_scan(
    scan_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    result = await db.execute(select(Scan).where(Scan.id == scan_id))
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    return scan


@router.patch("/{scan_id}", response_model=ScanResponse)
async def update_scan(
    scan_id: str,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    scan = await _get_scan_or_404(db, scan_id)
    allowed = {"name", "assessment_mode", "scan_category", "scan_depth", "engagement_id", "scan_profile_id", "config"}
    for key, value in data.items():
        if key in allowed:
            setattr(scan, key, value)
    db.add(ScanEvent(scan_id=scan.id, event_type="scan_updated", severity="info", summary="Scan configuration updated.", details_json={"fields": sorted(set(data).intersection(allowed))}))
    db.add(AuditLog(project_id=scan.project_id, scan_id=scan.id, actor_id=current_user.id, event_type="scan", action="update_scan", details={"fields": list(data.keys())}))
    await db.commit()
    await db.refresh(scan)
    return scan


@router.post("/{scan_id}/validate")
async def validate_scan(
    scan_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    scan = await _get_scan_or_404(db, scan_id)
    result = await _validate_scan_ready(db, scan)
    db.add(ScanEvent(scan_id=scan.id, event_type="scope_validation", severity="info" if result["valid"] else "warning", summary="Scope, authorization, and safety validation completed.", details_json=result))
    await db.commit()
    return result


@router.post("/{scan_id}/request-approval")
async def request_scan_approval(
    scan_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    scan = await _get_scan_or_404(db, scan_id)
    existing = await db.execute(select(Approval).where(Approval.scan_id == scan.id, Approval.status == "pending"))
    approval = existing.scalar_one_or_none()
    if not approval:
        approval = Approval(scan_id=scan.id, action="scan_launch", risk_level=_scan_risk(scan), requested_by=current_user.id, reason="Controlled scan launch review requested.")
        db.add(approval)
    scan.status = "pending_review"
    db.add(ScanEvent(scan_id=scan.id, event_type="approval_requested", severity="warning", summary="Scan launch review requested.", details_json={"approval_action": "scan_launch"}))
    db.add(AuditLog(project_id=scan.project_id, scan_id=scan.id, actor_id=current_user.id, event_type="approval", action="scan_approval_requested", details={"risk_level": approval.risk_level}))
    await db.commit()
    return {"status": "requested", "approval_id": str(approval.id)}


@router.post("/{scan_id}/launch", response_model=ScanResponse)
async def launch_scan(
    scan_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    validation = await validate_scan(scan_id, db, current_user)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail={"message": "Scan cannot launch until blocking validation issues are resolved", "blocking_reasons": validation["blocking_reasons"]})
    return await start_scan(scan_id, db, current_user)


@router.post("/{scan_id}/start", response_model=ScanResponse)
async def start_scan(
    scan_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    result = await db.execute(select(Scan).where(Scan.id == scan_id))
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    if scan.status not in ("draft", "approved"):
        raise HTTPException(status_code=400, detail=f"Cannot start scan with status: {scan.status}")

    scan.status = "pending"
    await db.commit()

    from workers.celery_app import run_scan
    task = run_scan.apply_async(
        args=[str(scan.id)],
        queue="scan",
        task_id=str(uuid.uuid4()),
    )
    scan.status = "running"
    scan.started_at = datetime.utcnow()
    scan.celery_task_id = task.id
    await db.commit()
    await db.refresh(scan)
    return scan


@router.post("/{scan_id}/resume", response_model=ScanResponse)
async def resume_scan(
    scan_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    scan = await _get_scan_or_404(db, scan_id)
    if scan.status != "paused":
        raise HTTPException(status_code=400, detail="Only paused scans can be resumed")
    scan.status = "running"
    db.add(ScanEvent(scan_id=scan.id, event_type="scan_resumed", severity="info", summary="Scan resumed by authorized user.", details_json={"actor_id": str(current_user.id)}))
    db.add(AuditLog(project_id=scan.project_id, scan_id=scan.id, actor_id=current_user.id, event_type="scan", action="resume_scan", details={}))
    await db.commit()
    await db.refresh(scan)
    return scan


@router.post("/{scan_id}/pause", response_model=ScanResponse)
async def pause_scan(
    scan_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    result = await db.execute(select(Scan).where(Scan.id == scan_id))
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    if scan.status != "running":
        raise HTTPException(status_code=400, detail="Only running scans can be paused")
    scan.status = "paused"
    await db.commit()
    await db.refresh(scan)
    return scan


@router.post("/{scan_id}/emergency-stop", response_model=ScanResponse)
async def emergency_stop_scan(
    scan_id: str,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    if data.get("confirmation") != "STOP SCAN":
        raise HTTPException(status_code=400, detail="Typed confirmation STOP SCAN is required")
    scan = await _get_scan_or_404(db, scan_id)
    if scan.celery_task_id:
        from workers.celery_app import app
        app.control.revoke(scan.celery_task_id, terminate=True, signal="SIGKILL")
    scan.status = "stopped_by_safety_control"
    scan.completed_at = datetime.utcnow()
    safety = await _get_or_create_safety(db, scan.id)
    safety.kill_switch_ready = "Activated"
    safety.approval_gate_active = "Blocked"
    db.add(ScanEvent(scan_id=scan.id, event_type="emergency_stop", severity="critical", summary="Emergency stop activated. Workers and AI-agent tasks were blocked for this scan.", details_json={"actor_id": str(current_user.id)}))
    db.add(AuditLog(project_id=scan.project_id, scan_id=scan.id, actor_id=current_user.id, event_type="safety", action="emergency_stop", details={"confirmation": "STOP SCAN"}))
    await db.commit()
    await db.refresh(scan)
    return scan


@router.post("/{scan_id}/cancel", response_model=ScanResponse)
async def cancel_scan(
    scan_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    result = await db.execute(select(Scan).where(Scan.id == scan_id))
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    if scan.status in ("completed", "cancelled", "failed"):
        raise HTTPException(status_code=400, detail=f"Cannot cancel scan with status: {scan.status}")

    if scan.celery_task_id:
        from workers.celery_app import app
        app.control.revoke(scan.celery_task_id, terminate=True)

    scan.status = "cancelled"
    scan.completed_at = datetime.utcnow()
    await db.commit()
    await db.refresh(scan)
    return scan


@router.post("/{scan_id}/kill", response_model=ScanResponse)
async def kill_scan(
    scan_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Kill switch - immediately terminate a running scan"""
    result = await db.execute(select(Scan).where(Scan.id == scan_id))
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    if scan.celery_task_id:
        from workers.celery_app import app
        app.control.revoke(scan.celery_task_id, terminate=True, signal="SIGKILL")

    scan.status = "killed"
    scan.completed_at = datetime.utcnow()
    await db.commit()
    await db.refresh(scan)
    return scan


@router.get("/{scan_id}/progress")
async def get_scan_progress(
    scan_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    result = await db.execute(select(Scan).where(Scan.id == scan_id))
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    modules = await db.execute(
        select(ScanModule).where(ScanModule.scan_id == scan_id)
    )
    module_list = modules.scalars().all()

    return {
        "scan_id": str(scan.id),
        "status": scan.status,
        "progress": scan.progress,
        "modules": [
            {
                "name": m.module_name,
                "status": m.status,
                "tool": m.tool,
            }
            for m in module_list
        ],
    }


@router.get("/{scan_id}/modules")
async def get_scan_modules(scan_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    await _get_scan_or_404(db, scan_id)
    result = await db.execute(select(ScanModule).where(ScanModule.scan_id == scan_id).order_by(ScanModule.started_at, ScanModule.id))
    return [_module_payload(module, index + 1) for index, module in enumerate(result.scalars().all())]


@router.get("/{scan_id}/events")
async def get_scan_events(scan_id: str, limit: int = 100, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    await _get_scan_or_404(db, scan_id)
    result = await db.execute(select(ScanEvent).where(ScanEvent.scan_id == scan_id).order_by(ScanEvent.created_at.desc()).limit(limit))
    return [_event_payload(event) for event in result.scalars().all()]


@router.get("/{scan_id}/safety")
async def get_scan_safety(scan_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    scan = await _get_scan_or_404(db, scan_id)
    safety = await _get_or_create_safety(db, scan.id)
    await db.commit()
    return _safety_payload(safety)


@router.get("/{scan_id}/evidence")
async def get_scan_evidence(scan_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    await _get_scan_or_404(db, scan_id)
    result = await db.execute(select(Evidence, Finding).join(Finding, Finding.id == Evidence.finding_id).where(Finding.scan_id == scan_id).order_by(Evidence.created_at.desc()))
    rows = result.all()
    counts: dict[str, int] = {}
    items = []
    for evidence, finding in rows:
        label = _evidence_label(evidence.evidence_type)
        counts[label] = counts.get(label, 0) + 1
        items.append({"id": str(evidence.id), "finding_id": str(finding.id), "type": label, "hash": evidence.hash_value, "created_at": evidence.created_at.isoformat() if evidence.created_at else None, "summary": (evidence.metadata_json or {}).get("summary", "Redacted evidence item")})
    return {"counts": counts, "items": items}


@router.get("/{scan_id}/process")
async def get_scan_process(scan_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    scan = await _get_scan_or_404(db, scan_id)
    modules = (await db.execute(select(ScanModule).where(ScanModule.scan_id == scan_id))).scalars().all()
    findings = (await db.execute(select(Finding).where(Finding.scan_id == scan_id))).scalars().all()
    evidence = await get_scan_evidence(scan_id, db, current_user)
    approvals = (await db.execute(select(Approval).where(Approval.scan_id == scan_id).order_by(Approval.created_at.desc()))).scalars().all()
    return {
        "scan_id": str(scan.id),
        "stages": _process_stages(scan, modules, findings, evidence["items"]),
        "snapshot": _results_snapshot(scan, modules, findings, evidence, approvals),
        "evidence_pipeline": _evidence_pipeline(modules, findings, evidence),
        "next_actions": _next_actions(scan, findings, approvals),
        "approvals": [_approval_payload(item) for item in approvals],
    }


@router.get("/{scan_id}/results")
async def get_scan_results(scan_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    scan = await _get_scan_or_404(db, scan_id)
    findings = (await db.execute(select(Finding).options(selectinload(Finding.evidence_items)).where(Finding.scan_id == scan_id).order_by(Finding.created_at.desc()))).scalars().all()
    evidence = await get_scan_evidence(scan_id, db, current_user)
    modules = (await db.execute(select(ScanModule).where(ScanModule.scan_id == scan_id))).scalars().all()
    severity_counts: dict[str, int] = {severity: 0 for severity in ["critical", "high", "medium", "low", "informational"]}
    for finding in findings:
        severity_counts[finding.severity] = severity_counts.get(finding.severity, 0) + 1
    return {
        "scan_id": str(scan.id),
        "status": scan.status,
        "severity_counts": severity_counts,
        "findings": [_finding_payload(finding) for finding in findings],
        "evidence": evidence,
        "modules": [_module_payload(module, index + 1) for index, module in enumerate(modules)],
        "report_url": f"/reports/{scan.id}" if scan.status == "completed" else None,
    }


@router.get("/{scan_id}/stream")
async def stream_scan(scan_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    await _get_scan_or_404(db, scan_id)

    async def event_generator():
        for _ in range(60):
            progress = await get_scan_progress(scan_id, db, current_user)
            events = await get_scan_events(scan_id, 20, db, current_user)
            payload = {"progress": progress, "events": events}
            yield f"event: scan-update\ndata: {json.dumps(payload, default=str)}\n\n"
            await asyncio.sleep(3)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/{scan_id}/generate-report")
async def generate_scan_report(scan_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    scan = await _get_scan_or_404(db, scan_id)
    findings = (await db.execute(select(Finding).where(Finding.scan_id == scan_id, Finding.status.in_(["confirmed", "verified", "open"])))).scalars().all()
    if not findings:
        raise HTTPException(status_code=400, detail="Report draft requires at least one reviewed or verified finding")
    db.add(ScanEvent(scan_id=scan.id, agent_id="report-writer", event_type="report_draft", severity="info", summary="Report Writer prepared a report draft from reviewed findings.", details_json={"findings": len(findings)}))
    db.add(AuditLog(project_id=scan.project_id, scan_id=scan.id, actor_id=current_user.id, event_type="report", action="generate_report_draft", details={"findings": len(findings)}))
    await db.commit()
    return {"status": "ready", "report_url": f"/reports/{scan.id}"}


@router.post("/{scan_id}/create-retest")
async def create_scan_retest(scan_id: str, data: dict | None = None, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    scan = await _get_scan_or_404(db, scan_id)
    finding_ids = (data or {}).get("finding_ids") or []
    db.add(ScanEvent(scan_id=scan.id, event_type="retest_requested", severity="info", summary="Retest workflow requested for selected findings.", details_json={"finding_ids": finding_ids}))
    db.add(AuditLog(project_id=scan.project_id, scan_id=scan.id, actor_id=current_user.id, event_type="retest", action="create_retest", details={"finding_ids": finding_ids}))
    await db.commit()
    return {"status": "created", "retest_url": "/retests", "finding_ids": finding_ids}


@router.get("/{scan_id}/findings", response_model=list[FindingResponse])
async def get_scan_findings(
    scan_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    result = await db.execute(
        select(Finding)
        .where(Finding.scan_id == scan_id)
        .order_by(Finding.severity.desc(), Finding.created_at.desc())
    )
    return result.scalars().all()


async def _get_scan_or_404(db: AsyncSession, scan_id: str) -> Scan:
    result = await db.execute(select(Scan).where(Scan.id == scan_id))
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    return scan


async def _get_or_create_safety(db: AsyncSession, scan_id) -> ScanSafetyState:
    result = await db.execute(select(ScanSafetyState).where(ScanSafetyState.scan_id == scan_id))
    safety = result.scalar_one_or_none()
    if not safety:
        safety = ScanSafetyState(scan_id=scan_id)
        db.add(safety)
        await db.flush()
    return safety


async def _validate_scan_ready(db: AsyncSession, scan: Scan) -> dict:
    blocking_reasons = []
    warnings = []
    project = (await db.execute(select(Project).where(Project.id == scan.project_id))).scalar_one_or_none()
    if not project:
        blocking_reasons.append("Project does not exist.")

    scan_assets = (await db.execute(select(ScanAsset).where(ScanAsset.scan_id == scan.id))).scalars().all()
    if not scan_assets:
        blocking_reasons.append("Select at least one approved in-scope asset.")
    asset_ids = [row.asset_id for row in scan_assets]
    if asset_ids:
        assets = (await db.execute(select(Asset).where(Asset.id.in_(asset_ids)))).scalars().all()
        for asset in assets:
            if asset.scope_status != "in_scope" or asset.approval_status != "approved":
                blocking_reasons.append(f"Asset {asset.value} is not approved and in scope.")
    if scan.engagement_id:
        from database.models import Engagement
        engagement = (await db.execute(select(Engagement).where(Engagement.id == scan.engagement_id))).scalar_one_or_none()
        if not engagement:
            blocking_reasons.append("Selected engagement does not exist.")
        elif engagement.authorization_status != "authorized":
            blocking_reasons.append("Selected engagement is not authorized.")
        elif engagement.end_date and engagement.end_date < datetime.utcnow():
            blocking_reasons.append("Selected engagement authorization is expired.")
    else:
        warnings.append("No engagement linked. Scope must be covered by approved assets and rules of engagement.")

    profile = None
    if scan.scan_profile_id:
        profile = (await db.execute(select(ScanProfile).where(ScanProfile.id == scan.scan_profile_id))).scalar_one_or_none()
        if not profile or not profile.enabled:
            blocking_reasons.append("Selected scan profile is not enabled.")
    approval_required = _approval_required(scan, profile)
    if approval_required:
        approval = (await db.execute(select(Approval).where(Approval.scan_id == scan.id, Approval.status == "approved"))).scalar_one_or_none()
        if not approval:
            blocking_reasons.append("Required scan approval has not been granted.")

    prohibited_actions = ["denial_of_service", "brute_force", "credential_theft", "malware", "persistent_access", "data_exfiltration", "production_data_modification", "unauthorized_pivoting"]
    selected = set((scan.config or {}).get("advanced_options") or [])
    blocked_selected = sorted(selected.intersection(prohibited_actions))
    if blocked_selected:
        blocking_reasons.append("Prohibited actions selected: " + ", ".join(blocked_selected))

    return {
        "valid": not blocking_reasons,
        "blocking_reasons": blocking_reasons,
        "warnings": warnings,
        "approval_required": approval_required,
        "safety_controls_active": True,
        "estimated_duration": _duration_estimate(scan),
    }


def _approval_required(scan: Scan, profile: ScanProfile | None) -> bool:
    if profile and profile.risk_level in ("high", "critical"):
        return True
    return scan.scan_depth in ("deep", "custom") or scan.assessment_mode in ("gray_box", "white_box")


def _scan_risk(scan: Scan) -> str:
    if scan.scan_depth == "deep" or scan.assessment_mode == "white_box":
        return "high"
    if scan.scan_depth == "standard" or scan.assessment_mode == "gray_box":
        return "medium"
    return "low"


def _duration_estimate(scan: Scan) -> str:
    if scan.scan_depth == "quick":
        return "15m-45m"
    if scan.scan_depth == "deep":
        return "4h-8h"
    if scan.scan_depth == "custom":
        return "Custom"
    return "2h-3h"


def _module_payload(module: ScanModule, number: int) -> dict:
    output = module.output or {}
    started = module.started_at
    completed = module.completed_at
    duration = int((completed - started).total_seconds()) if started and completed else None
    status_progress = {"completed": 100, "running": 58, "failed": 100, "blocked": 100, "pending": 0, "skipped": 100}
    return {
        "id": str(module.id),
        "number": number,
        "module_key": module.module_name,
        "name": _module_display_name(module.module_name),
        "description": _module_description(module.module_name),
        "status": output.get("status") or module.status,
        "progress_percent": output.get("progress", status_progress.get(module.status, 0)),
        "started_at": started.isoformat() if started else None,
        "completed_at": completed.isoformat() if completed else None,
        "duration_seconds": duration,
        "output_count": output.get("issues_found", 0) + len(output.get("observations", [])) + len(output.get("matches", [])),
        "warning_count": output.get("warning_count", 0),
        "error_message": module.error or output.get("message"),
        "tool": module.tool,
    }


def _event_payload(event: ScanEvent) -> dict:
    return {
        "id": str(event.id),
        "scan_id": str(event.scan_id),
        "module_run_id": str(event.module_run_id) if event.module_run_id else None,
        "agent_id": event.agent_id,
        "worker_id": event.worker_id,
        "event_type": event.event_type,
        "severity": event.severity,
        "summary": event.summary,
        "details": event.details_json or {},
        "asset_id": str(event.asset_id) if event.asset_id else None,
        "finding_id": str(event.finding_id) if event.finding_id else None,
        "evidence_id": str(event.evidence_id) if event.evidence_id else None,
        "created_at": event.created_at.isoformat() if event.created_at else None,
    }


def _safety_payload(safety: ScanSafetyState) -> dict:
    return {
        "dos_protection": safety.dos_protection,
        "rate_limiting": safety.rate_limiting,
        "scope_enforcement": safety.scope_enforcement,
        "kill_switch_ready": safety.kill_switch_ready,
        "out_of_scope_block": safety.out_of_scope_block,
        "testing_window_valid": safety.testing_window_valid,
        "approval_gate_active": safety.approval_gate_active,
        "last_checked_at": safety.last_checked_at.isoformat() if safety.last_checked_at else None,
    }


def _finding_payload(finding: Finding) -> dict:
    return {
        "id": str(finding.id),
        "title": finding.title,
        "severity": finding.severity,
        "asset_id": str(finding.asset_id) if finding.asset_id else None,
        "status": _finding_workflow_status(finding),
        "integrity_status": finding.integrity_status,
        "evidence_count": len(finding.evidence_items or []),
        "cvss_score": finding.cvss_score,
        "created_at": finding.created_at.isoformat() if finding.created_at else None,
    }


def _finding_workflow_status(finding: Finding) -> str:
    if finding.status == "false_positive":
        return "False Positive"
    if finding.status in ("fixed", "ready_for_retest"):
        return finding.status.replace("_", " ").title()
    if finding.integrity_status == "verified" or finding.status in ("confirmed", "verified"):
        return "Verified"
    if finding.status == "rejected":
        return "Rejected"
    if finding.status == "flagged":
        return "Flagged"
    return "Candidate"


def _evidence_label(evidence_type: str) -> str:
    if "screenshot" in evidence_type:
        return "Screenshots"
    if "request" in evidence_type:
        return "HTTP Requests"
    if "response" in evidence_type:
        return "HTTP Responses"
    if "code" in evidence_type:
        return "Code Excerpts"
    if "file" in evidence_type:
        return "Files"
    return "Tool Outputs"


def _process_stages(scan: Scan, modules: list[ScanModule], findings: list[Finding], evidence_items: list[dict]) -> list[dict]:
    stage_defs = [
        ("Scan Created", "Scan request created and recorded."),
        ("Scope Checked", "Assets, authorization, and scope validated."),
        ("Discovery", "Assets, services, and endpoints discovered."),
        ("Security Testing", "Approved vulnerability and security checks executed."),
        ("Evidence Validation", "Results normalized and evidence integrity checked."),
        ("Finding Review", "Candidate findings analyzed and reviewed."),
        ("Report Preparation", "Verified findings compiled into a report draft."),
        ("Completed", "Workflow completed and archived."),
    ]
    completed_index = 0
    if scan.status in ("running", "paused"):
        completed_index = 3
    if findings:
        completed_index = 5
    if scan.status == "completed":
        completed_index = 7
    return [
        {
            "name": name,
            "description": description,
            "status": "Completed" if index <= completed_index else "Pending",
            "duration_seconds": None,
            "output_count": len(modules) if index in (2, 3) else len(evidence_items) if index == 4 else len(findings) if index == 5 else 0,
            "warning_count": sum(1 for module in modules if module.error) if index in (2, 3, 4) else 0,
            "started_at": scan.started_at.isoformat() if scan.started_at and index > 0 else scan.created_at.isoformat() if scan.created_at and index == 0 else None,
            "completed_at": scan.completed_at.isoformat() if scan.completed_at and index <= completed_index else None,
            "related_tasks": [],
        }
        for index, (name, description) in enumerate(stage_defs)
    ]


def _results_snapshot(scan: Scan, modules: list[ScanModule], findings: list[Finding], evidence: dict, approvals: list[Approval]) -> dict:
    return {
        "verified_findings": sum(1 for item in findings if _finding_workflow_status(item) == "Verified"),
        "flagged_findings": sum(1 for item in findings if _finding_workflow_status(item) == "Flagged"),
        "rejected_findings": sum(1 for item in findings if _finding_workflow_status(item) in ("Rejected", "False Positive")),
        "evidence_items": len(evidence.get("items", [])),
        "urls_crawled": sum(len((module.output or {}).get("observations", [])) for module in modules),
        "apis_tested": sum(1 for module in modules if "api" in module.module_name),
        "assets_tested": len({str(item.asset_id) for item in findings if item.asset_id}),
        "approvals_requested": len(approvals),
    }


def _evidence_pipeline(modules: list[ScanModule], findings: list[Finding], evidence: dict) -> list[dict]:
    evidence_count = len(evidence.get("items", []))
    return [
        {"stage": "Raw Tool Output", "item_count": sum(len((m.output or {}).get("observations", [])) for m in modules), "status": "Completed", "errors": sum(1 for m in modules if m.error), "rejected_count": 0, "processing_time": "n/a"},
        {"stage": "Normalized Result", "item_count": sum((m.output or {}).get("issues_found", 0) for m in modules), "status": "Completed", "errors": 0, "rejected_count": 0, "processing_time": "n/a", "agent": "Web Security Agent"},
        {"stage": "Evidence Validation", "item_count": evidence_count, "status": "Completed" if evidence_count else "Pending", "errors": 0, "rejected_count": 0, "processing_time": "n/a", "agent": "Evidence Validator"},
        {"stage": "Finding Judge", "item_count": len(findings), "status": "Completed" if findings else "Pending", "errors": 0, "rejected_count": sum(1 for f in findings if f.status == "rejected"), "processing_time": "n/a", "agent": "Finding Judge"},
        {"stage": "Human Review", "item_count": len(findings), "status": "Running" if findings else "Pending", "errors": 0, "rejected_count": 0, "processing_time": "n/a"},
        {"stage": "Report Inclusion", "item_count": sum(1 for f in findings if _finding_workflow_status(f) == "Verified"), "status": "Ready" if findings else "Pending", "errors": 0, "rejected_count": 0, "processing_time": "n/a", "agent": "Report Writer"},
    ]


def _next_actions(scan: Scan, findings: list[Finding], approvals: list[Approval]) -> list[str]:
    actions = []
    if any(item.status == "pending" for item in approvals):
        actions.append("Review pending controlled-action approval.")
    if any(_finding_workflow_status(item) == "Candidate" for item in findings):
        actions.append("Review candidate findings and validate evidence.")
    if any(_finding_workflow_status(item) == "Verified" for item in findings):
        actions.append("Generate technical report draft.")
        actions.append("Schedule retest for verified findings.")
    if scan.status == "completed":
        actions.append("Archive scan after report and retest actions are complete.")
    if not actions:
        actions.append("Monitor scan progress and safety controls.")
    return actions


def _approval_payload(approval: Approval) -> dict:
    return {
        "id": str(approval.id),
        "action": approval.action,
        "risk_level": approval.risk_level,
        "status": approval.status,
        "requested_by": str(approval.requested_by) if approval.requested_by else None,
        "reason": approval.reason,
        "created_at": approval.created_at.isoformat() if approval.created_at else None,
    }


def _module_display_name(module_name: str) -> str:
    labels = {
        "passive_asset_discovery": "Scope Validation",
        "asset_discovery": "Asset Verification",
        "http_probe": "HTTP Probing and Crawling",
        "tcp_port_scan": "Network Port Discovery",
        "service_detection": "Service Detection",
        "tls_check": "TLS/SSL Analysis",
        "security_headers": "Security Headers Check",
        "owasp_top_10": "OWASP Web Checks",
        "technology_detection": "Technology Detection",
        "evidence_collection": "Evidence Collection",
        "ai_analysis": "AI Explanation",
        "cve_enrichment": "CVE Enrichment",
        "report_generation": "Report Draft",
    }
    return labels.get(module_name, module_name.replace("_", " ").title())


def _module_description(module_name: str) -> str:
    descriptions = {
        "passive_asset_discovery": "Validate selected scope and approved target assets.",
        "asset_discovery": "Verify assets, services, and endpoint availability.",
        "http_probe": "Probe web targets and collect safe response metadata.",
        "security_headers": "Check browser hardening and response header controls.",
        "owasp_top_10": "Run approved web security checks mapped to OWASP categories.",
        "evidence_collection": "Collect, normalize, hash, and redact evidence.",
        "ai_analysis": "Use AI agents to explain candidate findings without finalizing them.",
        "report_generation": "Prepare a report draft from reviewed findings.",
    }
    return descriptions.get(module_name, "Approved scan module executed within rules of engagement.")


def _default_modules_for_scan(scan_category: str, scan_depth: str) -> list[str]:
    common = ["asset_discovery", "cve_enrichment", "evidence_collection", "report_generation"]
    modules_by_category = {
        "vulnerability_scan": ["passive_asset_discovery", "http_probe", "tcp_port_scan", "service_detection", "security_headers", "known_vulnerabilities", *common],
        "website": ["asset_discovery", "http_probe", "security_headers", "tls_check", "technology_detection", "owasp_top_10", "evidence_collection", "ai_analysis", "report_generation"],
        "api_security": ["api_discovery", "owasp_api_top_10", "authentication_testing", "rate_limiting_check", "input_validation", "token_handling", "evidence_collection", "report_generation"],
        "network": ["host_discovery", "tcp_port_scan", "service_detection", "version_detection", "tls_services", "known_vulnerabilities", "cve_enrichment", "report_generation"],
        "container": ["container_scan", "dependency_scan", "trivy_scan", "grype_scan", "cve_enrichment", "evidence_collection", "report_generation"],
    }
    modules = modules_by_category.get(scan_category, modules_by_category["vulnerability_scan"])
    if scan_depth == "quick":
        return modules[:4] + ["report_generation"]
    if scan_depth == "deep" and scan_category in ("website", "vulnerability_scan"):
        return modules + ["nuclei_templates", "wapiti_scan", "controlled_validation"]
    return modules
