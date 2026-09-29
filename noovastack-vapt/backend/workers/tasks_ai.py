"""
NoovaStack VAPT Platform - Autonomous AI Agent Tasks

The DeepSeek (or any OpenAI-compatible) model acts as an autonomous pentester:
it plans a bounded set of authorized actions, then every action is executed
through the exact same controlled tool-request gate the HTTP API uses. The model
never touches the shell, network scanners, or raw tool arguments directly.
"""
from __future__ import annotations

import asyncio
import json
import logging

import httpx
from celery import shared_task

logger = logging.getLogger(__name__)

PLANNER_SYSTEM_PROMPT = """You are an autonomous penetration-testing agent operating inside NoovaStack VAPT, an authorized vulnerability assessment platform.

Your job is to plan a BOUNDED, NON-DESTRUCTIVE assessment for the approved assets you are given. You never execute anything yourself; you only return a plan that the platform will run through its own safety-controlled scan engine.

Hard rules:
- Only use targets from the provided approved in-scope assets.
- Only use modules from the provided allowlist.
- Never request destructive, brute-force, credential-theft, DoS, exfiltration, or pivoting actions.
- Assign risk_level "high" ONLY when the action clearly warrants mandatory human review (e.g. interactive exploitation checks). Prefer low/medium.
- Return strictly valid JSON with this exact shape and nothing else:
{"actions": [{"module": "<module from allowlist>", "target": "<exact approved asset value>", "risk_level": "low|medium|high", "rationale": "<short reason>"}]}
- Return at most {max_actions} actions. Return "actions": [] if the objective cannot be satisfied within scope.
"""

JUDGE_SYSTEM_PROMPT = """You are the Finding Judge agent in an authorized vulnerability assessment platform.
You review candidate findings recorded by scans. Candidate findings are NOT confirmed; your review only adds context and a recommendation for a human analyst.
Return strictly valid JSON with this exact shape and nothing else:
{"recommendations": [{"title": "<short title>", "severity": "critical|high|medium|low|informational", "confidence": <0-100 integer>, "rationale": "<brief reasoning>", "finding_id": "<finding id or null>"}]}
Be conservative. Do not invent findings that are not present in the provided data."""


@shared_task(name="workers.tasks_ai.run_autonomous_agent", bind=True)
def run_autonomous_agent(self, agent_id: str, run_id: str):
    """Execute an autonomous pentest agent run end-to-end."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(_run_agent(agent_id, run_id))
    finally:
        loop.close()


@shared_task(name="workers.tasks_ai.judge_agent_run", bind=True)
def judge_agent_run(self, run_id: str):
    """Post-execution Finding Judge review for an autonomous run's scans."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(_judge_run(run_id))
    finally:
        loop.close()


async def _judge_run(run_id: str) -> dict:
    from database import AsyncSessionLocal
    from database.models import AIAgent, AIAgentRun
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    async with AsyncSessionLocal() as session:
        run = (
            await session.execute(
                select(AIAgentRun)
                .where(AIAgentRun.id == run_id)
                .options(selectinload(AIAgentRun.tasks), selectinload(AIAgentRun.activities))
            )
        ).scalar_one_or_none()
        if not run:
            return {"status": "not_found"}
        agent = (
            await session.execute(select(AIAgent).where(AIAgent.id == run.agent_id))
        ).scalar_one_or_none()
        await _judge(session, run, agent, run.objective or "")
        await session.commit()
        return {"status": "reviewed", "run_id": str(run.id)}


async def _run_agent(agent_id: str, run_id: str) -> dict:
    from database import AsyncSessionLocal
    from database.models import AIAgent, AIAgentActivity, AIAgentRecommendation, AIAgentRun, AIAgentTask, Asset, Engagement, Finding, Project, User
    from sqlalchemy import select

    from api.routes.ai_agents import (
        AGENT_REQUESTABLE_MODULES,
        BLOCKED_AGENT_MODULES,
        AgentToolRequest,
        execute_agent_tool_request,
        normalize_requested_modules,
        normalize_target,
    )

    async with AsyncSessionLocal() as session:
        run = (
            await session.execute(select(AIAgentRun).where(AIAgentRun.id == run_id))
        ).scalar_one_or_none()
        if not run:
            return {"status": "failed", "error": "Run not found"}
        if run.status in ("stopped", "failed"):
            return {"status": run.status}

        run.status = "running"
        run.started_at = _now()
        await _activity(session, run, agent_id, "Autonomous run started. Planning authorized assessment.", "info")
        await session.commit()

        try:
            agent = (
                await session.execute(select(AIAgent).where(AIAgent.id == run.agent_id))
            ).scalar_one()
            project = (
                await session.execute(select(Project).where(Project.id == run.project_id))
            ).scalar_one()
            actor = (
                await session.execute(select(User).where(User.id == run.started_by))
            ).scalar_one_or_none()

            engagement = None
            if run.engagement_id:
                engagement = (
                    await session.execute(select(Engagement).where(Engagement.id == run.engagement_id))
                ).scalar_one_or_none()
                if not engagement or engagement.project_id != project.id:
                    raise RuntimeError("Engagement does not belong to the run project")
                if engagement.authorization_status != "authorized":
                    raise RuntimeError("Engagement is not authorized")
                if engagement.end_date and engagement.end_date < _now():
                    raise RuntimeError("Engagement authorization is expired")

            assets = (
                await session.execute(
                    select(Asset).where(
                        Asset.project_id == project.id,
                        Asset.scope_status == "in_scope",
                        Asset.approval_status == "approved",
                    )
                )
            ).scalars().all()
            if not assets:
                raise RuntimeError("No approved in-scope assets available for this run")

            await _activity(session, run, agent_id, f"Scope locked to {len(assets)} approved in-scope asset(s).", "info")
            await session.commit()

            max_actions = int((run.plan or {}).get("max_actions", 5))
            plan = await _plan_assessment(agent.name, project, assets, engagement, run.objective, max_actions)
            run.plan = {**(run.plan or {}), "actions": plan.get("actions", [])}
            await session.commit()
            if not plan.get("actions"):
                run.status = "completed"
                run.completed_at = _now()
                await _activity(session, run, agent_id, "Plan was empty: no authorized actions to run.", "warning")
                await session.commit()
                return {"status": "completed", "actions": 0}

            await _activity(session, run, agent_id, f"Plan accepted with {len(plan['actions'])} action(s). Dispatching through controlled scan gate.", "info")
            await session.commit()

            outcomes = []
            for index, action in enumerate(plan.get("actions", []), start=1):
                task = await _dispatch_action(session, run, agent, actor, assets, action, index)
                if task:
                    outcomes.append(task.status)

            if any(status == "awaiting_approval" for status in outcomes):
                run.status = "awaiting_approval"
                await _activity(session, run, agent_id, "Some actions require human approval before execution.", "warning")
            else:
                run.status = "completed"
            run.completed_at = _now()
            await session.commit()

            launched_any = any(status == "launched" for status in outcomes)
            if launched_any:
                from workers.tasks_ai import judge_agent_run

                judge_agent_run.apply_async(args=[str(run.id)], countdown=120, queue="ai")
            return {"status": run.status, "actions": len(outcomes)}
        except Exception as exc:  # noqa: BLE001
            logger.exception("Autonomous agent run %s failed", run_id)
            run.status = "failed"
            run.completed_at = _now()
            await _activity(session, run, agent_id, f"Run failed: {exc}", "error")
            await session.commit()
            return {"status": "failed", "error": str(exc)}


async def _dispatch_action(session, run, agent, actor, assets, action, index) -> AIAgentTask | None:
    from api.routes.ai_agents import (
        AGENT_REQUESTABLE_MODULES,
        BLOCKED_AGENT_MODULES,
        HUMAN_APPROVAL_MODULES,
        AgentToolRequest,
        execute_agent_tool_request,
        normalize_requested_modules,
        normalize_target,
    )
    from sqlalchemy import select
    from database.models import AIAgentTask, Asset

    module = normalize_requested_modules([str(action.get("module", ""))])
    module = module[0] if module else None
    if not module or module in BLOCKED_AGENT_MODULES or module not in AGENT_REQUESTABLE_MODULES:
        await _activity(session, run, agent.id, f"Action {index}: skipped module {action.get('module')} (not allowlisted).", "warning")
        await session.commit()
        return None

    target = normalize_target(str(action.get("target", "")))
    asset = (
        await session.execute(
            select(Asset).where(
                Asset.project_id == run.project_id,
                Asset.scope_status == "in_scope",
                Asset.approval_status == "approved",
            )
        )
    ).scalars().all()
    asset = next((item for item in asset if normalize_target(str(item.value)) == target), None)
    if not asset:
        await _activity(session, run, agent.id, f"Action {index}: target {target} is not an approved in-scope asset.", "warning")
        await session.commit()
        return None

    risk = str(action.get("risk_level", "low")).lower()
    if risk not in {"low", "medium", "high"}:
        risk = "low"

    request = AgentToolRequest(
        project_id=str(run.project_id),
        engagement_id=str(run.engagement_id) if run.engagement_id else None,
        asset_ids=[str(asset.id)],
        target=str(asset.value),
        task_type="autonomous_pentest",
        assessment_mode="black_box",
        scan_category="website",
        scan_depth="quick",
        risk_level=risk,
        modules=[module],
        config={"agent_id": agent.slug, "safe_only": True, "advanced_options": []},
        auto_launch=True,
        rationale=str(action.get("rationale", "")) or f"Autonomous action {index} by {agent.name}",
    )

    task = AIAgentTask(
        run_id=run.id,
        agent_id=agent.id,
        title=f"{module.replace('_', ' ').title()} on {asset.value}",
        target=str(asset.value),
        module=module,
        risk_level=risk,
        status="running",
        started_at=_now(),
    )
    session.add(task)
    await session.flush()

    try:
        result = await execute_agent_tool_request(session, request, actor)
    except Exception as exc:  # noqa: BLE001
        task.status = "failed"
        task.result = f"Controlled request rejected: {exc}"
        task.completed_at = _now()
        await _activity(session, run, agent.id, f"Action {index} ({module}) failed: {exc}", "error")
        await session.commit()
        return task

    status = result.get("status")
    task.result = result.get("message") or status
    if status == "launched":
        task.status = "launched"
        task.scan_id = result.get("scan_id")
        task.ai_tool_request_id = result.get("ai_tool_request_id")
        await _activity(session, run, agent.id, f"Action {index} ({module}) launched scan {result.get('scan_id')}.", "success")
    elif status == "approval_required":
        task.status = "awaiting_approval"
        task.scan_id = result.get("scan_id")
        task.ai_tool_request_id = result.get("ai_tool_request_id")
        await _activity(session, run, agent.id, f"Action {index} ({module}) queued for human approval.", "warning")
    else:
        task.status = "created"
        task.scan_id = result.get("scan_id")
        await _activity(session, run, agent.id, f"Action {index} ({module}) scan created ({status}).", "info")
    task.completed_at = _now()
    await session.commit()
    return task


async def _judge(session, run, agent, objective) -> None:
    from sqlalchemy import select
    from database.models import AIAgentRecommendation, AIAgentTask, Finding

    task_rows = (
        await session.execute(
            select(AIAgentTask).where(AIAgentTask.run_id == run.id, AIAgentTask.scan_id.is_not(None))
        )
    ).scalars().all()
    scan_ids = [task.scan_id for task in task_rows if task.scan_id]
    if not scan_ids:
        return
    findings = (
        await session.execute(
            select(Finding)
            .where(Finding.scan_id.in_(scan_ids), Finding.status != "rejected")
            .order_by(Finding.severity)
        )
    ).scalars().all()
    if not findings:
        return

    payload = {
        "scan_ids": [str(item) for item in scan_ids],
        "candidate_findings": [
            {
                "id": str(f.id),
                "title": f.title,
                "severity": f.severity,
                "status": f.status,
                "integrity_status": f.integrity_status,
                "remediation": f.remediation,
            }
            for f in findings
        ],
    }
    try:
        review = await _llm_json(JUDGE_SYSTEM_PROMPT, json.dumps(payload, indent=2), temperature=0.1)
        for item in review.get("recommendations", []):
            finding_id = item.get("finding_id")
            if finding_id and finding_id not in [str(f.id) for f in findings]:
                finding_id = None
            session.add(AIAgentRecommendation(
                run_id=run.id,
                agent_id=agent.id,
                title=str(item.get("title", "Review recommendation"))[:500],
                severity=str(item.get("severity", "low")),
                confidence=float(item.get("confidence", 0) or 0),
                rationale=str(item.get("rationale", "")),
                finding_id=finding_id,
                review_status="pending",
            ))
        await session.commit()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Finding judge review failed for run %s: %s", run.id, exc)
        await _activity(session, run, agent.id, "Finding judge review could not be completed.", "warning")
        await session.commit()


async def _plan_assessment(agent_name, project, assets, engagement, objective, max_actions) -> dict:
    from api.routes.ai_agents import AGENT_REQUESTABLE_MODULES, BLOCKED_AGENT_MODULES

    scope = [
        {
            "asset_type": asset.asset_type,
            "value": asset.value,
            "technology": asset.technology or {},
            "ports_services": asset.ports_services or {},
        }
        for asset in assets
    ]
    allowed_modules = sorted(AGENT_REQUESTABLE_MODULES - BLOCKED_AGENT_MODULES)
    context = {
        "agent": agent_name,
        "project": {"id": str(project.id), "name": project.name, "environment": project.environment},
        "engagement": {"id": str(engagement.id), "mode": engagement.assessment_mode} if engagement else None,
        "objective": objective,
        "approved_in_scope_assets": scope,
        "allowed_modules": allowed_modules,
    }
    prompt = (
        f"{PLANNER_SYSTEM_PROMPT.replace('{max_actions}', str(max_actions))}\n\n"
        f"Current context:\n{json.dumps(context, indent=2)}\n\n"
        "Return your JSON plan now."
    )
    return await _llm_json(PLANNER_SYSTEM_PROMPT, prompt, temperature=0.2)


async def _llm_json(system: str, user: str, temperature: float = 0.2) -> dict:
    from config import settings

    payload = {
        "model": settings.AI_MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
        "max_tokens": settings.AI_MAX_OUTPUT_TOKENS,
    }
    async with httpx.AsyncClient(timeout=float(settings.AI_TIMEOUT_SECONDS)) as client:
        response = await client.post(
            f"{settings.AI_BASE_URL.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {settings.AI_API_KEY}", "Content-Type": "application/json"},
            json=payload,
        )
        response.raise_for_status()
        data = response.json()
    content = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
    return _extract_json(content)


def _extract_json(content: str) -> dict:
    text = (content or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end > start:
            try:
                parsed = json.loads(text[start : end + 1])
                return parsed if isinstance(parsed, dict) else {}
            except json.JSONDecodeError:
                pass
        return {}


async def _activity(session, run, agent_id, message: str, status: str = "info") -> None:
    from database.models import AIAgentActivity

    session.add(AIAgentActivity(run_id=run.id, agent_id=agent_id, message=message, status=status))


def _now():
    from datetime import datetime

    return datetime.utcnow()
