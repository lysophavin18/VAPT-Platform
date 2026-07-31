"""
NoovaStack VAPT Platform - AI Agents Routes

This is the first backend-backed AI-agent control plane. It keeps state in
process for now, records administrative actions to the audit log, and exposes a
stable API contract that can be moved to database/Celery workers without
rewriting the frontend.
"""
from __future__ import annotations

import json
from copy import deepcopy
from datetime import datetime
from typing import Any
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from auth import require_user, User
from config import settings
from database import get_db
from database.models import AIToolRequest, Approval, Asset, AuditLog, Engagement, Project, Scan, ScanAsset, ScanEvent, ScanModule, ScanSafetyState
from scans.tools import MODULE_TO_TOOL


router = APIRouter()
PRIMARY_AI_MODEL = settings.AI_MODEL
AI_PROVIDER_NAME = settings.AI_PROVIDER
TOOL_ID_TO_MODULE = {item["id"]: module for module, item in MODULE_TO_TOOL.items()}
BUILTIN_AGENT_MODULES = {
    "asset_discovery",
    "passive_asset_discovery",
    "http_probe",
    "security_headers",
    "tls_check",
    "technology_detection",
    "owasp_top_10",
    "safe_nuclei_templates",
    "evidence_collection",
    "ai_analysis",
    "cve_enrichment",
    "report_generation",
}
AGENT_REQUESTABLE_MODULES = set(MODULE_TO_TOOL) | BUILTIN_AGENT_MODULES
HUMAN_APPROVAL_MODULES = {"dalfox_xss", "sqlmap_check", "controlled_validation"}
BLOCKED_AGENT_MODULES = {
    "reverse_shell",
    "persistence",
    "credential_attack",
    "bruteforce",
    "brute_force",
    "data_exfiltration",
    "network_pivoting",
}
AGENT_MODEL_ASSIGNMENTS = {
    "engagement_planner": {"provider": AI_PROVIDER_NAME, "model": PRIMARY_AI_MODEL},
    "recon_asset_agent": {"provider": AI_PROVIDER_NAME, "model": PRIMARY_AI_MODEL},
    "vulnerability_analysis_agent": {"provider": AI_PROVIDER_NAME, "model": PRIMARY_AI_MODEL},
    "web_security_agent": {"provider": AI_PROVIDER_NAME, "model": PRIMARY_AI_MODEL},
    "api_security_agent": {"provider": AI_PROVIDER_NAME, "model": PRIMARY_AI_MODEL},
    "finding_judge": {"provider": AI_PROVIDER_NAME, "model": PRIMARY_AI_MODEL},
    "remediation_advisor": {"provider": AI_PROVIDER_NAME, "model": PRIMARY_AI_MODEL},
    "report_writer": {"provider": AI_PROVIDER_NAME, "model": PRIMARY_AI_MODEL},
    "retest_analyst": {"provider": AI_PROVIDER_NAME, "model": PRIMARY_AI_MODEL},
}


AGENTS: list[dict[str, Any]] = [
    {"id": "engagement-planner", "name": "Engagement Planner", "type": "Planner", "purpose": "Plans and scopes assessments", "description": "Builds authorized assessment plans and maps work to OWASP methodology.", "status": "Running", "currentTask": "Generating assessment plan", "engagement": "ENG-2025-041", "riskLevel": "Low", "lastActivity": "2 min ago", "model": PRIMARY_AI_MODEL, "provider": AI_PROVIDER_NAME, "promptVersion": "pv-2025.04", "policyVersion": "ASI-2025.07", "lastHeartbeat": "22 sec ago"},
    {"id": "asset-discovery", "name": "Asset Discovery", "type": "Discovery", "purpose": "Discovers and normalizes assets", "description": "Runs scoped passive discovery and normalizes approved assets.", "status": "Running", "currentTask": "Finding subdomains", "engagement": "ENG-2025-041", "riskLevel": "Low", "lastActivity": "1 min ago", "model": PRIMARY_AI_MODEL, "provider": AI_PROVIDER_NAME, "promptVersion": "pv-2025.04", "policyVersion": "ASI-2025.07", "lastHeartbeat": "18 sec ago"},
    {"id": "web-security-agent", "name": "Web Security Agent", "type": "Scanner", "purpose": "Web vulnerability analysis", "description": "Assists safe OWASP web testing and evidence normalization.", "status": "Running", "currentTask": "Testing access control", "engagement": "ENG-2025-041", "riskLevel": "Medium", "lastActivity": "3 min ago", "model": PRIMARY_AI_MODEL, "provider": AI_PROVIDER_NAME, "promptVersion": "pv-2025.04", "policyVersion": "ASI-2025.07", "lastHeartbeat": "31 sec ago"},
    {"id": "api-security-agent", "name": "API Security Agent", "type": "Scanner", "purpose": "API security assessment", "description": "Reviews API inventory, authorization boundaries, schemas, and tokens.", "status": "Running", "currentTask": "Analyzing endpoints", "engagement": "ENG-2025-041", "riskLevel": "Medium", "lastActivity": "4 min ago", "model": PRIMARY_AI_MODEL, "provider": AI_PROVIDER_NAME, "promptVersion": "pv-2025.04", "policyVersion": "ASI-2025.07", "lastHeartbeat": "41 sec ago"},
    {"id": "evidence-validator", "name": "Evidence Validator", "type": "Validator", "purpose": "Validates evidence integrity", "description": "Checks evidence ownership, redaction, reproducibility, and hash integrity.", "status": "Reviewing", "currentTask": "Validate evidence EVID-124", "engagement": "ENG-2025-041", "riskLevel": "Low", "lastActivity": "5 min ago", "model": PRIMARY_AI_MODEL, "provider": AI_PROVIDER_NAME, "promptVersion": "pv-2025.04", "policyVersion": "ASI-2025.07", "lastHeartbeat": "55 sec ago"},
    {"id": "finding-judge", "name": "Finding Judge", "type": "Validator", "purpose": "Validates findings and risk", "description": "Checks duplicate status, severity rationale, and report eligibility.", "status": "Reviewing", "currentTask": "Review finding FND-089", "engagement": "ENG-2025-041", "riskLevel": "High", "lastActivity": "6 min ago", "model": PRIMARY_AI_MODEL, "provider": AI_PROVIDER_NAME, "promptVersion": "pv-2025.04", "policyVersion": "ASI-2025.07", "lastHeartbeat": "1 min ago"},
    {"id": "remediation-advisor", "name": "Remediation Advisor", "type": "Advisor", "purpose": "Suggests fixes and mitigations", "description": "Drafts immediate mitigations, long-term remediation, and verification steps.", "status": "Completed", "currentTask": "Generate remediation", "engagement": "ENG-2025-038", "riskLevel": "Low", "lastActivity": "12 min ago", "model": PRIMARY_AI_MODEL, "provider": AI_PROVIDER_NAME, "promptVersion": "pv-2025.04", "policyVersion": "ASI-2025.07", "lastHeartbeat": "2 min ago"},
    {"id": "report-writer", "name": "Report Writer", "type": "Writer", "purpose": "Drafts report content", "description": "Creates tool-neutral report sections from verified findings and evidence.", "status": "Running", "currentTask": "Writing executive summary", "engagement": "ENG-2025-041", "riskLevel": "Low", "lastActivity": "1 min ago", "model": PRIMARY_AI_MODEL, "provider": AI_PROVIDER_NAME, "promptVersion": "pv-2025.04", "policyVersion": "ASI-2025.07", "lastHeartbeat": "12 sec ago"},
    {"id": "retest-analyst", "name": "Retest Analyst", "type": "Validator", "purpose": "Compares retest results", "description": "Compares remediation retest evidence against prior verified behavior.", "status": "Idle", "currentTask": "No active task", "riskLevel": "Low", "lastActivity": "38 min ago", "model": PRIMARY_AI_MODEL, "provider": AI_PROVIDER_NAME, "promptVersion": "pv-2025.04", "policyVersion": "ASI-2025.07", "lastHeartbeat": "5 min ago"},
    {"id": "security-context-agent", "name": "Security Context Agent", "type": "Context", "purpose": "Enriches findings with approved security context", "description": "Adds approved architecture, business, and control context without expanding scope.", "status": "Idle", "currentTask": "No active task", "riskLevel": "Low", "lastActivity": "44 min ago", "model": PRIMARY_AI_MODEL, "provider": AI_PROVIDER_NAME, "promptVersion": "pv-2025.04", "policyVersion": "ASI-2025.07", "lastHeartbeat": "6 min ago"},
]

ACTIVITY = [
    {"id": "act-1", "timestamp": "2 min ago", "agentName": "Web Security Agent", "activity": "Testing /admin/users endpoint", "status": "Running"},
    {"id": "act-2", "timestamp": "3 min ago", "agentName": "API Security Agent", "activity": "Analyzing POST /api/login", "status": "Running"},
    {"id": "act-3", "timestamp": "5 min ago", "agentName": "Evidence Validator", "activity": "Evidence EVID-124 under review", "status": "Reviewing"},
]
TASKS = [
    {"id": "TASK-301", "objective": "Validate object authorization", "engagement": "ENG-2025-041", "target": "/api/users/{id}", "risk": "High", "status": "Reviewing", "controlStatus": "Reviewing", "started": "09:20", "duration": "8m", "result": "Under review"},
    {"id": "TASK-302", "objective": "Draft executive summary", "engagement": "ENG-2025-041", "target": "Report", "risk": "Low", "status": "Running", "controlStatus": "Standard", "started": "09:21", "duration": "7m", "result": "In progress"},
]
RECOMMENDATIONS = [
    {"id": "FND-089", "title": "Broken Object-Level Authorization", "severity": "High", "agent": "Finding Judge", "age": "6 min ago", "reason": "Object ownership checks require review before report inclusion.", "evidenceUsed": ["EVID-124"], "confidence": 86, "reviewStatus": "Pending"},
    {"id": "FND-082", "title": "Sensitive Data Exposure", "severity": "Medium", "agent": "Evidence Validator", "age": "12 min ago", "reason": "Response body appears to include sensitive metadata.", "evidenceUsed": ["EVID-118"], "confidence": 78, "reviewStatus": "Pending"},
]
SAFETY_CONTROLS = [
    {"id": f"ASI{str(i).zfill(2)}", "name": name, "description": desc, "status": "Healthy", "lastCheck": "1 min ago", "relatedAgents": ["Web Security Agent", "Finding Judge"], "detectedEvents": 0, "policyVersion": "ASI-2025.07", "recommendedAction": "No action required."}
    for i, (name, desc) in enumerate([
        ("ASI01 Goal Hijack", "Prevents target content from changing the authorized goal."),
        ("ASI02 Tool Misuse", "Validates tool calls, parameters, timeouts, and output limits."),
        ("ASI03 Privilege Abuse", "Enforces least privilege and separation of duties."),
        ("ASI04 Supply Chain", "Tracks approved model, plugin, package, template, and container versions."),
        ("ASI05 Code Execution", "Blocks unapproved code execution and target-provided scripts."),
        ("ASI06 Context Poisoning", "Separates untrusted observations from verified memory."),
        ("ASI07 Inter-Agent Communication", "Authenticates task messages and validates scope."),
        ("ASI08 Cascading Failures", "Applies timeouts, retries, and instability stops."),
        ("ASI09 Trust Exploitation", "Requires neutral risk language and human review."),
        ("ASI10 Rogue Agents", "Requires registered identities and kill switch compliance."),
    ], start=1)
]
EVIDENCE = [{"id": "EVID-124", "findingId": "FND-089", "type": "http_response", "source": "Scan 24a8e61e", "captureTime": "2026-07-20 09:10", "hash": "sha256:9c1f...a42b", "redactionStatus": "Redacted", "preview": "GET /admin/users returned role-bound response metadata."}]
MESSAGES = [{"id": "MSG-1", "sender": "Web Security Agent", "receiver": "Evidence Validator", "taskId": "TASK-301", "messageType": "Evidence summary", "timestamp": "2 min ago", "validationStatus": "Validated"}]
AUDIT_EVENTS = [{"id": "AUD-1", "agentId": "web-security-agent", "actor": "system", "action": "heartbeat", "timestamp": "1 min ago", "details": "Agent heartbeat healthy."}]


class ActionRequest(BaseModel):
    action: str | None = None
    confirmation: str | None = None


class AssignRequest(BaseModel):
    engagement: str | None = None
    agentId: str | None = None
    taskName: str | None = None
    objective: str | None = None


class AgentCreateRequest(BaseModel):
    name: str
    type: str = "Planner"
    description: str = "Custom AI agent"
    purpose: str = "Approved platform assistance"
    provider: str = AI_PROVIDER_NAME
    model: str = PRIMARY_AI_MODEL
    promptVersion: str = "pv-2025.04"
    policyVersion: str = "ASI-2025.07"
    status: str = "Idle"
    riskLevel: str = "Low"


class LocalAIRequest(BaseModel):
    prompt: str
    mode: str = "General"
    model: str | None = None
    conversation_id: str | None = None


class AgentToolRequest(BaseModel):
    project_id: str
    engagement_id: str | None = None
    asset_ids: list[str] = []
    target: str
    task_type: str = "safe_vulnerability_scan"
    assessment_mode: str = "black_box"
    scan_category: str = "website"
    scan_depth: str = "quick"
    risk_level: str = "low"
    modules: list[str]
    config: dict[str, Any] = {}
    auto_launch: bool = True
    rationale: str | None = None


@router.get("")
async def list_agents(current_user: User = Depends(require_user)):
    return deepcopy(AGENTS)


@router.get("/local-model/health")
async def local_model_health(current_user: User = Depends(require_user)):
    return await check_local_model()


@router.post("/local-chat")
async def local_chat(request: LocalAIRequest, current_user: User = Depends(require_user)):
    model = request.model or PRIMARY_AI_MODEL
    if model != PRIMARY_AI_MODEL:
        raise HTTPException(status_code=400, detail=f"Only the configured primary local model is allowed: {PRIMARY_AI_MODEL}")

    health = await check_local_model()
    if not health["available"]:
        raise HTTPException(status_code=503, detail=f"Local AI provider unavailable: required model {PRIMARY_AI_MODEL} is missing")

    mode_key = normalize_mode(request.mode)
    mode_prefix = {
        "general": "For platform and security-related questions.",
        "assessment_planner": "Create a safe assessment plan from approved scope.",
        "finding_review": "Review evidence and recommend only Verified, Flagged, or Rejected.",
        "remediation": "Generate immediate mitigation, long-term remediation, and verification steps.",
        "report_writer": "Improve technical and executive report content.",
        "retest_review": "Compare original and retest evidence.",
    }.get(mode_key, "For platform and security-related questions.")
    payload = {
        "model": model,
        "temperature": settings.AI_TEMPERATURE,
        "max_tokens": settings.AI_MAX_OUTPUT_TOKENS,
        "stream": True,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a scope-bound AI security agent inside the NoovaStack VAPT Platform. "
                    f"You are running locally with {PRIMARY_AI_MODEL}. "
                    "Assist only with authorized VAPT workflows. Use only supplied project context, findings, evidence, policies, and approved references. "
                    "Do not fabricate evidence, exploitation, severity, business impact, endpoints, requests, responses, or retest results. "
                    "Do not approve findings or reports. Do not request arbitrary shell execution. "
                    "Return structured JSON matching this schema: {\"type\":\"plain|finding_review|remediation|report_draft|tool_activity|error\",\"message\":\"string\",\"summary\":\"string\",\"status\":\"string\",\"recommendation\":\"Verified|Flagged|Rejected\",\"suggested_severity\":\"string\",\"severity\":\"string\",\"owasp_category\":\"string\",\"cwe\":\"string\",\"evidence_ids\":[\"EVID-124\"],\"evidence\":[{\"id\":\"string\",\"type\":\"string\",\"source\":\"string\",\"captured\":\"string\",\"redaction_status\":\"string\",\"integrity_status\":\"string\"}],\"missing_information\":[\"string\"],\"remediation\":{\"issue_summary\":\"string\",\"immediate_mitigation\":[\"string\"],\"long_term_remediation\":[\"string\"],\"verification_steps\":[\"string\"],\"references\":[\"string\"]},\"report\":{\"current_content\":\"string\",\"ai_suggestion\":\"string\"},\"warnings\":[\"string\"],\"tool_calls\":[{\"name\":\"string\",\"parameters\":{},\"status\":\"Queued|Running|Completed|Blocked|Failed|Waiting Approval\",\"duration\":\"string\",\"output_reference\":\"string\"}],\"human_review_required\":true}. "
                    "Clearly identify missing information. Tools discover. Validators verify. AI explains. Humans approve. "
                    f"Mode instruction: {mode_prefix}"
                ),
            },
            {"role": "user", "content": request.prompt},
        ],
    }

    async def stream_tokens():
        try:
            async with httpx.AsyncClient(timeout=float(settings.AI_TIMEOUT_SECONDS), trust_env=False) as client:
                async with client.stream("POST", f"{settings.AI_BASE_URL.rstrip('/')}/chat/completions", headers=ai_headers(), json=payload) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        data = line[6:]
                        if data == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data)
                        except json.JSONDecodeError:
                            continue
                        choices = chunk.get("choices") if isinstance(chunk, dict) else None
                        if not isinstance(choices, list) or not choices:
                            continue
                        delta = choices[0].get("delta", {})
                        if not isinstance(delta, dict):
                            continue
                        token = delta.get("content")
                        if token:
                            yield f"data: {json.dumps({'type': 'token', 'token': token})}\n\n"
        except httpx.HTTPError as exc:
            yield f"data: {json.dumps({'type': 'error', 'error': f'Local AI endpoint failed: {exc}'})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'conversation_id': request.conversation_id or f'chat-{uuid4().hex[:8]}', 'message_id': f'msg-{uuid4().hex[:8]}', 'mode': mode_key, 'model': {'provider': AI_PROVIDER_NAME, 'name': model}, 'created_at': datetime.utcnow().isoformat()})}\n\n"

    return StreamingResponse(stream_tokens(), media_type="text/event-stream")


@router.post("/tool-request")
async def request_agent_tool(data: AgentToolRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    """Create a controlled scan from an AI agent tool request.

    The model never executes tools directly. It submits modules here; this route
    enforces the platform allowlist, scope records, approval gates, and existing
    scan validation before Celery workers run anything.
    """
    if data.risk_level not in {"low", "medium", "high", "prohibited"}:
        raise HTTPException(status_code=400, detail="Invalid risk_level")
    if data.risk_level == "prohibited":
        raise HTTPException(status_code=400, detail="Prohibited tool requests cannot be queued")
    if data.assessment_mode not in {"black_box", "gray_box", "white_box"}:
        raise HTTPException(status_code=400, detail="Invalid assessment_mode")
    if data.scan_depth not in {"quick", "standard", "deep", "custom"}:
        raise HTTPException(status_code=400, detail="Invalid scan_depth")
    if not data.modules:
        raise HTTPException(status_code=400, detail="At least one module is required")

    modules = normalize_requested_modules(data.modules)
    blocked_modules = sorted(set(modules).intersection(BLOCKED_AGENT_MODULES))
    unknown_modules = [module for module in modules if module not in AGENT_REQUESTABLE_MODULES]
    if blocked_modules:
        raise HTTPException(status_code=400, detail={"message": "Requested modules require separate human-approved implementation", "blocked_modules": blocked_modules})
    if unknown_modules:
        raise HTTPException(status_code=400, detail={"message": "Requested modules are not allowlisted for AI agent requests", "unknown_modules": unknown_modules})

    project = await db.get(Project, data.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    engagement = None
    if data.engagement_id:
        engagement = await db.get(Engagement, data.engagement_id)
        if not engagement:
            raise HTTPException(status_code=404, detail="Engagement not found")
        if str(engagement.project_id) != str(project.id):
            raise HTTPException(status_code=400, detail="Engagement does not belong to the selected project")

    assets = []
    for asset_id in data.asset_ids:
        asset = await db.get(Asset, asset_id)
        if not asset:
            raise HTTPException(status_code=404, detail=f"Asset not found: {asset_id}")
        if str(asset.project_id) != str(project.id):
            raise HTTPException(status_code=400, detail=f"Asset does not belong to the selected project: {asset_id}")
        assets.append(asset)
    if not assets:
        raise HTTPException(status_code=400, detail="At least one approved in-scope asset_id is required")

    target_normalized = normalize_target(data.target)
    for asset in assets:
        if asset.scope_status != "in_scope" or asset.approval_status != "approved":
            raise HTTPException(status_code=400, detail=f"Asset {asset.value} is not approved and in scope")
        if normalize_target(str(asset.value)) != target_normalized:
            raise HTTPException(status_code=400, detail=f"Asset {asset.value} does not match requested target {data.target}")

    requires_approval = data.risk_level == "high" or any(module in HUMAN_APPROVAL_MODULES for module in modules)
    scan = await _create_ai_tool_scan(db, data, current_user, project, engagement, assets, modules)
    ai_request = await _create_ai_tool_request(db, data, current_user, scan, modules)

    db.add(ScanSafetyState(scan_id=scan.id))
    db.add(ScanEvent(scan_id=scan.id, event_type="ai_tool_request_created", severity="info", summary="AI agent requested controlled tool execution.", details_json={"modules": modules, "risk_level": data.risk_level, "ai_tool_request_id": str(ai_request.id)}))
    db.add(AuditLog(project_id=project.id, scan_id=scan.id, actor_id=current_user.id, event_type="ai_tool_request", action="create_controlled_tool_request", details={"modules": modules, "target": data.target, "risk_level": data.risk_level, "ai_tool_request_id": str(ai_request.id)}))
    await db.commit()
    await db.refresh(scan)

    if requires_approval:
        approval = Approval(
            scan_id=scan.id,
            ai_tool_request_id=ai_request.id,
            action="ai_tool_request_execution",
            risk_level=data.risk_level,
            requested_by=current_user.id,
            reason=data.rationale or "High-risk AI agent tool request requires human approval.",
        )
        db.add(approval)
        await db.flush()
        ai_request.status = "pending_approval"
        ai_request.approvals.append(approval)
        db.add(ScanEvent(scan_id=scan.id, event_type="ai_tool_request_approval_created", severity="info", summary="Approval record created for high-risk AI tool request.", details_json={"approval_id": str(approval.id), "ai_tool_request_id": str(ai_request.id)}))
        db.add(AuditLog(project_id=project.id, scan_id=scan.id, actor_id=current_user.id, event_type="ai_tool_request", action="create_approval_record", details={"approval_id": str(approval.id), "ai_tool_request_id": str(ai_request.id)}))
        await db.commit()
        return {
            "status": "approval_required",
            "ai_tool_request_id": str(ai_request.id),
            "scan_id": str(scan.id),
            "approval_id": str(approval.id),
            "message": "High-risk validation requires human approval before a tool task can be launched.",
            "requested_modules": modules,
            "human_review_required": True,
        }

    from api.routes.scans import _validate_scan_ready, start_scan

    validation = await _validate_scan_ready(db, scan)
    db.add(ScanEvent(scan_id=scan.id, event_type="ai_tool_request_validation", severity="info" if validation["valid"] else "warning", summary="AI tool request validation completed.", details_json=validation))
    await db.commit()
    await db.refresh(scan)

    launched = None
    if data.auto_launch and validation["valid"] and not validation["approval_required"]:
        launched_scan = await start_scan(str(scan.id), db, current_user)
        launched = {"scan_id": str(launched_scan.id), "status": launched_scan.status, "celery_task_id": launched_scan.celery_task_id}
        ai_request.status = "launched"
        ai_request.scan_id = launched_scan.id
    else:
        ai_request.status = "created"
    db.add(ai_request)
    await db.commit()

    return {
        "status": "launched" if launched else "created",
        "ai_tool_request_id": str(ai_request.id),
        "scan_id": str(scan.id),
        "modules": modules,
        "validation": validation,
        "launch": launched,
        "human_review_required": True,
    }


async def _create_ai_tool_scan(db: AsyncSession, data: AgentToolRequest, current_user: User, project: Project, engagement: Engagement | None, assets: list[Asset], modules: list[str]) -> Scan:
    scan = Scan(
        project_id=project.id,
        engagement_id=engagement.id if engagement else None,
        name=f"AI Tool Request - {data.task_type} - {data.target}",
        assessment_mode=data.assessment_mode,
        scan_category=data.scan_category,
        scan_depth=data.scan_depth,
        status="draft",
        requested_by=current_user.id,
        config={
            **data.config,
            "target": data.target,
            "safe_only": data.config.get("safe_only", True),
            "ai_tool_request": True,
            "task_type": data.task_type,
            "risk_level": data.risk_level,
            "rationale": data.rationale,
            "advanced_options": data.config.get("advanced_options", []),
        },
    )
    db.add(scan)
    await db.flush()

    for asset in assets:
        db.add(ScanAsset(scan_id=scan.id, asset_id=asset.id))
    for module in modules:
        db.add(ScanModule(scan_id=scan.id, module_name=module))

    return scan


async def _create_ai_tool_request(db: AsyncSession, data: AgentToolRequest, current_user: User, scan: Scan, modules: list[str]) -> AIToolRequest:
    ai_request = AIToolRequest(
        agent_id=data.config.get("agent_id") if data.config else None,
        requested_by=current_user.id,
        project_id=scan.project_id,
        engagement_id=scan.engagement_id,
        scan_id=scan.id,
        target=data.target,
        task_type=data.task_type,
        assessment_mode=data.assessment_mode,
        scan_category=data.scan_category,
        scan_depth=data.scan_depth,
        risk_level=data.risk_level,
        modules=modules,
        rationale=data.rationale,
        status="pending",
        config={
            **data.config,
            "auto_launch": data.auto_launch,
            "ai_tool_request": True,
        },
    )
    db.add(ai_request)
    await db.flush()
    await db.refresh(ai_request)
    return ai_request


@router.get("/activity")
async def get_activity(current_user: User = Depends(require_user)):
    return deepcopy(ACTIVITY)


@router.get("/safety")
async def get_safety(current_user: User = Depends(require_user)):
    return deepcopy(SAFETY_CONTROLS)


@router.get("/tasks")
async def get_tasks(current_user: User = Depends(require_user)):
    return deepcopy(TASKS)


@router.get("/recommendations")
async def get_recommendations(current_user: User = Depends(require_user)):
    return deepcopy(RECOMMENDATIONS)


@router.get("/evidence")
async def get_evidence(current_user: User = Depends(require_user)):
    return deepcopy(EVIDENCE)


@router.get("/messages")
async def get_messages(current_user: User = Depends(require_user)):
    return deepcopy(MESSAGES)


@router.get("/audit-logs")
async def get_audit_logs(current_user: User = Depends(require_user)):
    return deepcopy(AUDIT_EVENTS)


@router.get("/{agent_id}")
async def get_agent(agent_id: str, current_user: User = Depends(require_user)):
    return deepcopy(find_agent(agent_id))


@router.post("/assign")
async def assign_agent(data: AssignRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    if not data.engagement or not data.agentId or not data.taskName or not data.objective:
        raise HTTPException(status_code=400, detail="Authorization, scope, agent, task name, and objective are required")
    agent = find_agent(data.agentId)
    task_id = f"TASK-{uuid4().hex[:6].upper()}"
    TASKS.insert(0, {"id": task_id, "objective": data.objective, "engagement": data.engagement, "target": "Authorized scope", "risk": agent.get("riskLevel", "Low"), "status": "Running", "approval": "Not Required", "started": "just now", "duration": "0m", "result": "Queued"})
    agent["status"] = "Running"
    agent["currentTask"] = data.taskName
    await record_action(db, current_user, "assign_agent", {"agent_id": data.agentId, "task_id": task_id})
    return {"id": task_id, "status": "Assigned"}


@router.post("")
async def create_agent(data: AgentCreateRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only administrators can create custom agents")
    agent = data.model_dump()
    agent["id"] = data.name.lower().replace(" ", "-")
    agent["currentTask"] = "No active task"
    agent["lastActivity"] = "just now"
    agent["lastHeartbeat"] = "just now"
    AGENTS.append(agent)
    await record_action(db, current_user, "create_agent", {"agent_id": agent["id"]})
    return agent


@router.post("/{agent_id}/pause")
async def pause_agent(agent_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    return await set_agent_status(agent_id, "Paused", db, current_user, "pause_agent")


@router.post("/{agent_id}/resume")
async def resume_agent(agent_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    return await set_agent_status(agent_id, "Running", db, current_user, "resume_agent")


@router.post("/{agent_id}/stop")
async def stop_agent(agent_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    agent = find_agent(agent_id)
    agent["currentTask"] = "No active task"
    return await set_agent_status(agent_id, "Idle", db, current_user, "stop_agent")


@router.post("/{agent_id}/isolate")
async def isolate_agent(agent_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    return await set_agent_status(agent_id, "Isolated", db, current_user, "isolate_agent")


@router.post("/actions/pause-all")
async def pause_all(db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    for agent in AGENTS:
        if agent["status"] == "Running":
            agent["status"] = "Paused"
    await record_action(db, current_user, "pause_all_agents", {})
    return {"status": "Paused"}


@router.post("/actions/stop-all")
async def stop_all(db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    for agent in AGENTS:
        if agent["status"] in ("Running", "Paused"):
            agent["status"] = "Idle"
            agent["currentTask"] = "No active task"
    await record_action(db, current_user, "stop_all_tasks", {})
    return {"status": "Stopped"}


@router.post("/actions/kill-switch")
async def kill_switch(data: ActionRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only administrators can activate the kill switch")
    if data.confirmation not in ("STOP ALL AGENTS", "STOP ALL AUTOMATION"):
        raise HTTPException(status_code=400, detail="Typed confirmation is required")
    for agent in AGENTS:
        agent["status"] = "Isolated"
        agent["currentTask"] = "Blocked by emergency kill switch"
    await record_action(db, current_user, "activate_kill_switch", {})
    return {"status": "Kill switch activated"}


@router.post("/recommendations/{recommendation_id}/accept")
async def accept_recommendation(recommendation_id: str, current_user: User = Depends(require_user)):
    return update_recommendation(recommendation_id, "Accepted")


@router.post("/recommendations/{recommendation_id}/reject")
async def reject_recommendation(recommendation_id: str, current_user: User = Depends(require_user)):
    return update_recommendation(recommendation_id, "Rejected")


@router.post("/recommendations/{recommendation_id}/more-evidence")
async def request_more_evidence(recommendation_id: str, current_user: User = Depends(require_user)):
    return update_recommendation(recommendation_id, "Needs Evidence")


def find_agent(agent_id: str) -> dict[str, Any]:
    for agent in AGENTS:
        if agent["id"] == agent_id:
            return agent
    raise HTTPException(status_code=404, detail="Agent not found")


async def set_agent_status(agent_id: str, status: str, db: AsyncSession, current_user: User, action: str):
    agent = find_agent(agent_id)
    agent["status"] = status
    agent["lastActivity"] = "just now"
    agent["lastHeartbeat"] = "just now"
    await record_action(db, current_user, action, {"agent_id": agent_id, "status": status})
    return {"id": agent_id, "status": status}


def update_recommendation(recommendation_id: str, status: str):
    for recommendation in RECOMMENDATIONS:
        if recommendation["id"] == recommendation_id:
            recommendation["reviewStatus"] = status
            return {"id": recommendation_id, "status": status}
    raise HTTPException(status_code=404, detail="Recommendation not found")


def normalize_requested_modules(modules: list[str]) -> list[str]:
    normalized = []
    for value in modules:
        key = value.strip().lower().replace("-", "_")
        module = TOOL_ID_TO_MODULE.get(key) or key
        if module == "curl":
            module = "curl_http_capture"
        if module and module not in normalized:
            normalized.append(module)
    return normalized


def normalize_target(target: str) -> str:
    return target.strip().rstrip("/").lower()


def ai_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {settings.AI_API_KEY}", "Content-Type": "application/json"}


def normalize_mode(mode: str) -> str:
    normalized = mode.strip().lower().replace(" ", "_").replace("-", "_")
    aliases = {"pentester": "assessment_planner", "report": "report_writer"}
    return aliases.get(normalized, normalized or "general")


def parse_model_content(text: str) -> dict[str, Any]:
    if not text:
        return {"type": "plain", "message": "No response text returned by local model.", "human_review_required": True}

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return {"type": "plain", "message": text, "warnings": ["Model returned plain text instead of structured JSON."], "human_review_required": True}

    if not isinstance(parsed, dict):
        return {"type": "plain", "message": text, "warnings": ["Model returned a non-object JSON response."], "human_review_required": True}

    content = dict(parsed)
    content.setdefault("type", infer_content_type(content))
    content.setdefault("message", content.get("summary") or "Structured response returned by local model.")
    content["human_review_required"] = bool(content.get("human_review_required", True))
    return content


def infer_content_type(content: dict[str, Any]) -> str:
    if content.get("recommendation") or content.get("suggested_severity"):
        return "finding_review"
    if content.get("remediation") or content.get("verification_steps"):
        return "remediation"
    if content.get("report") or content.get("ai_suggestion"):
        return "report_draft"
    if content.get("tool_calls"):
        return "tool_activity"
    return "plain"


async def check_local_model() -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=30.0, trust_env=False) as client:
            response = await client.get(f"{settings.AI_BASE_URL.rstrip('/')}/models", headers=ai_headers())
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPError as exc:
        return {"provider": AI_PROVIDER_NAME, "model": PRIMARY_AI_MODEL, "available": False, "status": "unavailable", "error": str(exc)}

    models = data.get("data") if isinstance(data, dict) else []
    model_ids = {model.get("id") for model in models if isinstance(model, dict)}
    available = PRIMARY_AI_MODEL in model_ids
    return {
        "provider": AI_PROVIDER_NAME,
        "model": PRIMARY_AI_MODEL,
        "base_url": settings.AI_BASE_URL,
        "context_window": "64K",
        "deployment": "Local",
        "available": available,
        "status": "healthy" if available else "unavailable",
    }


async def record_action(db: AsyncSession, current_user: User, action: str, details: dict[str, Any]):
    AUDIT_EVENTS.insert(0, {"id": f"AUD-{uuid4().hex[:8]}", "agentId": details.get("agent_id", "global"), "actor": current_user.email, "action": action, "timestamp": "just now", "details": str(details)})
    db.add(AuditLog(actor_id=current_user.id, event_type="ai_agents", action=action, details={"details": details, "timestamp": datetime.utcnow().isoformat()}))
    await db.commit()
