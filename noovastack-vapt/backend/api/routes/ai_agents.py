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
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.schemas import AIAgentRunRequest, AIAgentRunResponse
from auth import get_engagement_or_404, get_finding_or_404, get_project_or_404, require_user, User
from config import settings
from database import get_db
from database.models import (
    AIAgent, AIAgentActivity, AIAgentRecommendation, AIAgentRun, AIAgentTask,
    AIToolRequest, Approval, Asset, AuditLog, Engagement, Project, Scan,
    ScanAsset, ScanEvent, ScanModule, ScanSafetyState,
)
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
HUMAN_APPROVAL_MODULES = {"dalfox_xss", "sqlmap_check", "controlled_validation", "nuclei_templates"}
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
    project_id: str | None = None
    engagement_id: str | None = None
    finding_id: str | None = None


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
async def list_agents(db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    result = await db.execute(select(AIAgent).order_by(AIAgent.name))
    return [_serialize_agent(agent) for agent in result.scalars().all()]


@router.get("/runs")
async def list_runs(db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from auth import project_access_clause

    result = await db.execute(
        select(AIAgentRun)
        .join(Project, Project.id == AIAgentRun.project_id)
        .where(project_access_clause(current_user))
        .options(selectinload(AIAgentRun.agent))
        .order_by(AIAgentRun.created_at.desc())
        .limit(100)
    )
    return [_serialize_run(run, include_tasks=False) for run in result.scalars().all()]


@router.get("/runs/{run_id}")
async def get_run(run_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    run = await _get_accessible_run(db, run_id, current_user)
    return _serialize_run(run, include_tasks=True)


@router.post("/runs/{run_id}/stop")
async def stop_run(run_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    run = await _get_accessible_run(db, run_id, current_user)
    if run.status in ("stopped", "completed", "failed"):
        raise HTTPException(status_code=400, detail=f"Run is already {run.status}")
    await _revoke_run(db, run, current_user, action="stop_run")
    return _serialize_run(run, include_tasks=True)


@router.post("/{agent_id}/run", response_model=AIAgentRunResponse)
async def run_agent(
    agent_id: str,
    data: AIAgentRunRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    agent = (
        await db.execute(select(AIAgent).where(AIAgent.slug == agent_id))
    ).scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    await get_project_or_404(db, data.project_id, current_user)
    if data.engagement_id:
        engagement = (
            await db.execute(
                select(Engagement).where(
                    Engagement.id == data.engagement_id,
                    Engagement.project_id == data.project_id,
                )
            )
        ).scalar_one_or_none()
        if not engagement:
            raise HTTPException(status_code=400, detail="Engagement must belong to the selected project")

    run = AIAgentRun(
        agent_id=agent.id,
        project_id=data.project_id,
        engagement_id=data.engagement_id,
        started_by=current_user.id,
        objective=data.objective,
        status="queued",
        plan={"max_actions": data.max_actions, "objective": data.objective},
    )
    db.add(run)
    await db.flush()
    await db.refresh(run)

    from workers.tasks_ai import run_autonomous_agent

    task = run_autonomous_agent.apply_async(args=[str(agent.id), str(run.id)], queue="ai")
    run.celery_task_id = task.id
    agent.status = "running"
    db.add(AIAgentActivity(run_id=run.id, agent_id=agent.id, message="Run queued for the autonomous agent worker.", status="info"))
    db.add(AuditLog(
        project_id=run.project_id,
        engagement_id=run.engagement_id,
        actor_id=current_user.id,
        event_type="ai_agent",
        action="autonomous_run_started",
        details={"agent": agent.slug, "run_id": str(run.id), "objective": data.objective},
    ))
    await db.commit()
    run = (
        await db.execute(
            select(AIAgentRun)
            .where(AIAgentRun.id == run.id)
            .options(
                selectinload(AIAgentRun.agent),
                selectinload(AIAgentRun.tasks),
                selectinload(AIAgentRun.activities),
            )
        )
    ).scalar_one()
    return _serialize_run(run, include_tasks=True)


@router.get("/local-model/health")
async def local_model_health(current_user: User = Depends(require_user)):
    return await check_local_model()


@router.post("/local-chat")
async def local_chat(request: LocalAIRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    model = request.model or PRIMARY_AI_MODEL
    if model != PRIMARY_AI_MODEL:
        raise HTTPException(status_code=400, detail=f"Only the configured primary local model is allowed: {PRIMARY_AI_MODEL}")

    health = await check_local_model()
    if not health["available"]:
        if health["status"] == "provider_unreachable":
            raise HTTPException(status_code=503, detail=f"Cannot connect to the local AI provider at {settings.AI_BASE_URL}")
        raise HTTPException(status_code=503, detail=f"Required local model is missing: {PRIMARY_AI_MODEL}")

    context_lines: list[str] = []
    if request.project_id:
        project = await get_project_or_404(db, request.project_id, current_user)
        context_lines.append(f"Project: {project.name} (environment: {project.environment}, status: {project.status}).")
        if request.engagement_id:
            engagement = await get_engagement_or_404(db, request.engagement_id, current_user)
            if str(engagement.project_id) != str(project.id):
                raise HTTPException(status_code=400, detail="Engagement does not belong to the selected project")
            window = f"{engagement.testing_window_start or 'unset'} to {engagement.testing_window_end or 'unset'}"
            context_lines.append(
                f"Engagement: {engagement.name} (assessment_mode: {engagement.assessment_mode}, "
                f"authorization_status: {engagement.authorization_status}, testing_window: {window}, "
                f"end_date: {engagement.end_date or 'unset'})."
            )
        if request.finding_id:
            finding = await get_finding_or_404(db, request.finding_id, current_user)
            context_lines.append(
                f"Finding: {finding.title} (severity: {finding.severity}, status: {finding.status}, "
                f"integrity_status: {finding.integrity_status}, owasp_category: {finding.owasp_category or 'unset'})."
            )
    elif request.engagement_id or request.finding_id:
        raise HTTPException(status_code=400, detail="engagement_id and finding_id require project_id")

    context_block = (
        ("Supplied context (the only project, engagement, and finding facts you may treat as real): " + " ".join(context_lines))
        if context_lines else
        "No project, engagement, or finding context has been supplied for this message — do not invent one."
    )

    mode_key = normalize_mode(request.mode)
    mode_prefix = {
        "general": "Answer like a senior pentester giving a teammate quick, practical guidance on platform and security workflow questions.",
        "assessment_planner": "Create a safe, scope-respecting assessment plan from approved scope, sequenced the way an experienced pentester would run it: recon and low-risk checks first, higher-risk steps only if authorized.",
        "finding_review": "Review evidence like a pentester triaging a report: recommend only Verified, Flagged, or Rejected, and state exactly what evidence would change that call.",
        "remediation": (
            "Give remediation guidance the way a pentester explains a fix to a developer. Structure the remediation object as: "
            "issue_summary (root cause and why it is risky in one or two sentences), immediate_mitigation (fastest safe way to reduce risk right now), "
            "long_term_remediation (the durable fix, including a concrete code or config snippet in a fenced code block when one is safe and relevant), "
            "verification_steps (exactly how to confirm the fix on retest), and references."
        ),
        "report_writer": "Improve technical and executive report content with a pentester's clarity: precise, evidence-backed, and readable by both engineers and non-technical stakeholders.",
        "retest_review": "Compare original and retest evidence like a pentester validating a fix: state plainly whether the issue is resolved, partially resolved, or still exploitable, and why.",
    }.get(mode_key, "Answer like a senior pentester giving a teammate quick, practical guidance on platform and security workflow questions.")

    structured_modes = {"assessment_planner", "finding_review", "remediation", "report_writer", "retest_review"}
    if mode_key in structured_modes:
        output_instruction = (
            "Return ONLY raw JSON matching this schema, with no markdown fences and no surrounding text around the JSON itself: "
            "{\"type\":\"plain|finding_review|remediation|report_draft|tool_activity|error\",\"message\":\"string\",\"summary\":\"string\",\"status\":\"string\",\"recommendation\":\"Verified|Flagged|Rejected\",\"suggested_severity\":\"string\",\"severity\":\"string\",\"owasp_category\":\"string\",\"cwe\":\"string\",\"evidence_ids\":[\"EVID-124\"],\"evidence\":[{\"id\":\"string\",\"type\":\"string\",\"source\":\"string\",\"captured\":\"string\",\"redaction_status\":\"string\",\"integrity_status\":\"string\"}],\"missing_information\":[\"string\"],\"remediation\":{\"issue_summary\":\"string\",\"immediate_mitigation\":[\"string\"],\"long_term_remediation\":[\"string\"],\"verification_steps\":[\"string\"],\"references\":[\"string\"]},\"report\":{\"current_content\":\"string\",\"ai_suggestion\":\"string\"},\"warnings\":[\"string\"],\"tool_calls\":[{\"name\":\"string\",\"parameters\":{},\"status\":\"Queued|Running|Completed|Blocked|Failed|Waiting Approval\",\"duration\":\"string\",\"output_reference\":\"string\"}],\"human_review_required\":true}. "
            "String field values (message, issue_summary, and each list item) may contain Markdown — bold, inline code, and fenced code blocks — for readability; the interface renders it."
        )
    else:
        output_instruction = (
            "Reply conversationally in short paragraphs. Use Markdown formatting — bold, bullet lists, inline code, and fenced code blocks — when it improves clarity; the interface renders Markdown. Do not return JSON in this mode."
        )

    payload = {
        "model": model,
        "temperature": settings.AI_TEMPERATURE,
        "max_tokens": settings.AI_MAX_OUTPUT_TOKENS,
        "stream": True,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are the NoovaStack Security Assistant, a scope-bound AI security agent inside the NoovaStack VAPT Platform, "
                    "playing the role of a senior, pragmatic penetration tester coaching the user through an authorized engagement. "
                    f"You are running locally with {PRIMARY_AI_MODEL}. "
                    "Think and communicate like an experienced pentester: lead with risk and impact, be direct and concrete, and always point to the next actionable step. "
                    "Assist only with authorized VAPT workflows. Use only supplied project context, findings, evidence, policies, and approved references. "
                    "Do not fabricate evidence, exploitation, severity, business impact, endpoints, requests, responses, or retest results. "
                    "Do not approve findings or reports. Do not request arbitrary shell execution. "
                    "Clearly identify missing information. Tools discover. Validators verify. AI explains. Humans approve. "
                    f"{context_block} "
                    f"Mode instruction: {mode_prefix} "
                    f"Output instruction: {output_instruction}"
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


async def execute_agent_tool_request(db: AsyncSession, data: AgentToolRequest, current_user: User) -> dict:
    """Create a controlled scan from an AI agent tool request.

    The model never executes tools directly. It submits modules here; this
    shared executor enforces the platform allowlist, scope records, approval
    gates, and existing scan validation before Celery workers run anything.
    Used by the HTTP route and the autonomous agent worker so both follow the
    exact same safety path.
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


@router.post("/tool-request")
async def request_agent_tool(data: AgentToolRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    """HTTP entry point for a controlled AI agent tool request."""
    return await execute_agent_tool_request(db, data, current_user)


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
async def get_activity(db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from auth import project_access_clause

    result = await db.execute(
        select(AIAgentActivity)
        .join(AIAgentRun, AIAgentRun.id == AIAgentActivity.run_id)
        .join(Project, Project.id == AIAgentRun.project_id)
        .where(project_access_clause(current_user))
        .options(selectinload(AIAgentActivity.agent))
        .order_by(AIAgentActivity.created_at.desc())
        .limit(50)
    )
    return [
        {
            "id": str(item.id),
            "timestamp": item.created_at.isoformat() if item.created_at else None,
            "agentName": item.agent.name if item.agent else None,
            "activity": item.message,
            "status": item.status,
        }
        for item in result.scalars().all()
    ]


@router.get("/safety")
async def get_safety(current_user: User = Depends(require_user)):
    return deepcopy(SAFETY_CONTROLS)


@router.get("/tasks")
async def get_tasks(db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from auth import project_access_clause

    result = await db.execute(
        select(AIAgentTask)
        .join(AIAgentRun, AIAgentRun.id == AIAgentTask.run_id)
        .join(Project, Project.id == AIAgentRun.project_id)
        .where(project_access_clause(current_user))
        .order_by(AIAgentTask.created_at.desc())
        .limit(100)
    )
    return [
        {
            "id": str(task.id),
            "objective": task.title,
            "engagement": None,
            "target": task.target,
            "risk": task.risk_level,
            "status": task.status,
            "controlStatus": task.status,
            "started": task.started_at.isoformat() if task.started_at else None,
            "duration": None,
            "result": task.result,
        }
        for task in result.scalars().all()
    ]


@router.get("/recommendations")
async def get_recommendations(db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from auth import project_access_clause

    result = await db.execute(
        select(AIAgentRecommendation)
        .join(AIAgentRun, AIAgentRun.id == AIAgentRecommendation.run_id)
        .join(Project, Project.id == AIAgentRun.project_id)
        .where(project_access_clause(current_user))
        .options(selectinload(AIAgentRecommendation.agent))
        .order_by(AIAgentRecommendation.created_at.desc())
        .limit(100)
    )
    return [
        {
            "id": str(item.id),
            "title": item.title,
            "severity": item.severity,
            "agent": item.agent.name if item.agent else None,
            "age": item.created_at.isoformat() if item.created_at else None,
            "reason": item.rationale,
            "evidenceUsed": [],
            "confidence": int(item.confidence or 0),
            "reviewStatus": item.review_status,
        }
        for item in result.scalars().all()
    ]


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
async def get_agent(agent_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    agent = (
        await db.execute(select(AIAgent).where(AIAgent.slug == agent_id))
    ).scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return _serialize_agent(agent)


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
    stopped = await _stop_active_runs(db, current_user, agent_id=agent_id)
    return {"id": agent_id, "status": "Idle", "stopped_runs": stopped}


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
    stopped = await _stop_active_runs(db, current_user)
    return {"status": "Stopped", "stopped_runs": stopped}


@router.post("/actions/kill-switch")
async def kill_switch(data: ActionRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only administrators can activate the kill switch")
    if data.confirmation not in ("STOP ALL AGENTS", "STOP ALL AUTOMATION"):
        raise HTTPException(status_code=400, detail="Typed confirmation is required")
    stopped = await _stop_active_runs(db, current_user)
    agents = (await db.execute(select(AIAgent))).scalars().all()
    for agent in agents:
        agent.status = "isolated"
    await db.commit()
    await record_action(db, current_user, "activate_kill_switch", {"stopped_runs": stopped})
    return {"status": "Kill switch activated", "stopped_runs": stopped}


@router.post("/recommendations/{recommendation_id}/accept")
async def accept_recommendation(recommendation_id: str, current_user: User = Depends(require_user)):
    return update_recommendation(recommendation_id, "Accepted")


@router.post("/recommendations/{recommendation_id}/reject")
async def reject_recommendation(recommendation_id: str, current_user: User = Depends(require_user)):
    return update_recommendation(recommendation_id, "Rejected")


@router.post("/recommendations/{recommendation_id}/more-evidence")
async def request_more_evidence(recommendation_id: str, current_user: User = Depends(require_user)):
    return update_recommendation(recommendation_id, "Needs Evidence")


def _serialize_agent(agent: AIAgent) -> dict[str, Any]:
    return {
        "id": agent.slug,
        "slug": agent.slug,
        "name": agent.name,
        "type": agent.agent_type,
        "purpose": agent.purpose,
        "description": agent.description,
        "status": agent.status,
        "riskLevel": agent.risk_level,
        "model": agent.model,
        "provider": agent.provider,
        "currentTask": "No active task",
        "lastActivity": "now",
        "lastHeartbeat": "now",
    }


def _serialize_run(run: AIAgentRun, include_tasks: bool = False) -> dict[str, Any]:
    tasks = [
        {
            "id": str(task.id),
            "run_id": str(task.run_id),
            "title": task.title,
            "target": task.target,
            "module": task.module,
            "risk_level": task.risk_level,
            "status": task.status,
            "scan_id": str(task.scan_id) if task.scan_id else None,
            "result": task.result,
            "created_at": task.created_at.isoformat() if task.created_at else None,
        }
        for task in (run.tasks or [])
    ] if include_tasks else []

    activities = [
        {
            "id": str(activity.id),
            "run_id": str(activity.run_id),
            "message": activity.message,
            "status": activity.status,
            "created_at": activity.created_at.isoformat() if activity.created_at else None,
        }
        for activity in (run.activities or [])
    ] if include_tasks else []

    return {
        "id": str(run.id),
        "agent_id": str(run.agent_id),
        "agent_slug": run.agent.slug if run.agent else None,
        "agent_name": run.agent.name if run.agent else None,
        "project_id": str(run.project_id),
        "engagement_id": str(run.engagement_id) if run.engagement_id else None,
        "objective": run.objective,
        "status": run.status,
        "plan": run.plan,
        "celery_task_id": run.celery_task_id,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        "created_at": run.created_at.isoformat() if run.created_at else None,
        "tasks": tasks,
        "activities": activities,
    }


async def _get_accessible_run(db: AsyncSession, run_id: str, current_user: User) -> AIAgentRun:
    from auth import project_access_clause

    run = (
        await db.execute(
            select(AIAgentRun)
            .join(Project, Project.id == AIAgentRun.project_id)
            .where(AIAgentRun.id == run_id, project_access_clause(current_user))
            .options(
                selectinload(AIAgentRun.agent),
                selectinload(AIAgentRun.tasks),
                selectinload(AIAgentRun.activities),
            )
        )
    ).scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


async def _revoke_run(db: AsyncSession, run: AIAgentRun, current_user: User, action: str = "stop_run") -> None:
    from workers.celery_app import app as celery_app

    if run.celery_task_id:
        celery_app.control.revoke(run.celery_task_id, terminate=True, signal="SIGKILL")
    run.status = "stopped"
    run.completed_at = datetime.utcnow()
    db.add(AIAgentActivity(run_id=run.id, agent_id=run.agent_id, message="Run stopped by operator.", status="error"))
    db.add(AuditLog(
        project_id=run.project_id,
        engagement_id=run.engagement_id,
        actor_id=current_user.id,
        event_type="ai_agent",
        action=action,
        details={"run_id": str(run.id), "agent": run.agent.slug if run.agent else None},
    ))
    if run.agent:
        run.agent.status = "idle"
    await db.commit()
    await db.refresh(run)


async def _stop_active_runs(db: AsyncSession, current_user: User, agent_id: str | None = None) -> int:
    query = select(AIAgentRun).where(AIAgentRun.status.in_(["queued", "running", "planning", "awaiting_approval"]))
    if agent_id:
        agent = (
            await db.execute(select(AIAgent).where(AIAgent.slug == agent_id))
        ).scalar_one_or_none()
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")
        query = query.where(AIAgentRun.agent_id == agent.id)
    runs = (await db.execute(query)).scalars().all()
    for run in runs:
        await _revoke_run(db, run, current_user, action="kill_switch_stop" if not agent_id else "stop_agent_run")
    return len(runs)


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
    headers = {"Authorization": f"Bearer {settings.AI_API_KEY}", "Content-Type": "application/json"}
    if "opencode.ai" in settings.AI_BASE_URL:
        headers["x-opencode-session"] = settings.AI_API_KEY
    return headers

        
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
        return {
            "provider": AI_PROVIDER_NAME,
            "model": PRIMARY_AI_MODEL,
            "base_url": settings.AI_BASE_URL,
            "available": False,
            "status": "provider_unreachable",
            "error": str(exc),
        }

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
        "status": "healthy" if available else "model_missing",
    }


class AIConfigUpdate(BaseModel):
    provider: str | None = None
    base_url: str | None = None
    api_key: str | None = None
    model: str | None = None
    timeout_seconds: int | None = None
    max_output_tokens: int | None = None
    temperature: float | None = None


@router.get("/config")
async def get_ai_config(current_user: User = Depends(require_user)):
    """Return current AI provider config (API key is masked)."""
    key = settings.AI_API_KEY
    masked_key = (key[:8] + "..." + key[-4:]) if len(key) > 12 else ("*" * len(key) if key else "")
    return {
        "provider": settings.AI_PROVIDER,
        "base_url": settings.AI_BASE_URL,
        "api_key_masked": masked_key,
        "model": settings.AI_MODEL,
        "timeout_seconds": settings.AI_TIMEOUT_SECONDS,
        "max_output_tokens": settings.AI_MAX_OUTPUT_TOKENS,
        "temperature": settings.AI_TEMPERATURE,
    }


@router.patch("/config")
async def update_ai_config(
    payload: AIConfigUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    """Persist AI provider settings to the .env file (admin only)."""
    from auth import require_admin as _require_admin
    from fastapi import Request
    import os

    if getattr(current_user, "role", None) != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env")
    if not os.path.exists(env_path):
        raise HTTPException(status_code=500, detail=".env file not found — update manually")

    with open(env_path, "r") as f:
        lines = f.readlines()

    updates: dict[str, str] = {}
    if payload.provider is not None:
        updates["AI_PROVIDER"] = payload.provider
    if payload.base_url is not None:
        updates["AI_BASE_URL"] = payload.base_url
    if payload.api_key is not None and payload.api_key and not payload.api_key.endswith("..."):
        updates["AI_API_KEY"] = payload.api_key
    if payload.model is not None:
        updates["AI_MODEL"] = payload.model
    if payload.timeout_seconds is not None:
        updates["AI_TIMEOUT_SECONDS"] = str(payload.timeout_seconds)
    if payload.max_output_tokens is not None:
        updates["AI_MAX_OUTPUT_TOKENS"] = str(payload.max_output_tokens)
    if payload.temperature is not None:
        updates["AI_TEMPERATURE"] = str(payload.temperature)

    new_lines = []
    found_keys = set()
    for line in lines:
        key = line.split("=")[0].strip()
        if key in updates:
            new_lines.append(f"{key}={updates[key]}\n")
            found_keys.add(key)
        else:
            new_lines.append(line)

    for key, val in updates.items():
        if key not in found_keys:
            new_lines.append(f"{key}={val}\n")

    with open(env_path, "w") as f:
        f.writelines(new_lines)

    db.add(AuditLog(
        actor_id=current_user.id,
        event_type="administration",
        action="ai_config_updated",
        details={"updated_keys": list(updates.keys())},
    ))
    await db.commit()

    return {"message": "AI configuration saved. Restart the backend for changes to take effect.", "updated": list(updates.keys())}


async def record_action(db: AsyncSession, current_user: User, action: str, details: dict[str, Any]):
    AUDIT_EVENTS.insert(0, {"id": f"AUD-{uuid4().hex[:8]}", "agentId": details.get("agent_id", "global"), "actor": current_user.email, "action": action, "timestamp": "just now", "details": str(details)})
    db.add(AuditLog(actor_id=current_user.id, event_type="ai_agents", action=action, details={"details": details, "timestamp": datetime.utcnow().isoformat()}))
    await db.commit()
