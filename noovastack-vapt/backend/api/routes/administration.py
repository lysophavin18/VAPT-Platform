"""
NoovaStack VAPT Platform - Administration Routes
"""
import asyncio
import smtplib
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from database.models import User, ScanProfile, AuditLog, IntegrationSetting
from integrations.telegram import EVENT_CATEGORIES, FINDING_SEVERITIES, activity_message, decrypt_token, encrypt_token, send_message, telegram_request
from integrations.email import send_email
from auth import require_admin, require_manager, User as UserModel
from api.schemas import UserResponse, AuditLogResponse
from scans.tools import SCANNER_TOOL_CATALOG

router = APIRouter()


DEFAULT_ADMIN_SETTINGS = {
    "tool_policies": {
        "safe_active_checks": True,
        "allow_deep_scans": True,
        "max_parallel_scans": 2,
        "request_timeout_seconds": 20,
    },
    "safety_policies": {
        "allowed_testing_window_start": "00:00",
        "allowed_testing_window_end": "23:59",
        "rate_limit_per_minute": 120,
        "destructive_tests_enabled": False,
    },
    "report_templates": {
        "default_template": "executive",
        "include_evidence_gallery": True,
        "include_cvss_vectors": True,
        "show_scanner_names": False,
    },
    "platform_settings": {
        "organization_name": "NoovaStack",
        "default_environment": "testing",
        "notification_retention_days": 30,
        "session_timeout_minutes": 60,
    },
}


class AdminSettingsUpdate(BaseModel):
    settings: dict[str, Any]


class TelegramIntegrationUpdate(BaseModel):
    enabled: bool = False
    bot_token: str | None = None
    chat_id: str
    event_categories: list[str]
    finding_severities: list[str] = Field(default_factory=lambda: list(FINDING_SEVERITIES[:2]))


class EmailIntegrationUpdate(BaseModel):
    enabled: bool = False
    smtp_host: str
    smtp_port: int = Field(ge=1, le=65535)
    smtp_username: str = ""
    smtp_password: str | None = None
    use_tls: bool = True
    from_email: EmailStr
    recipients: list[EmailStr]
    event_categories: list[str]


class UserProfileUpdate(BaseModel):
    email: str
    username: str
    full_name: str | None = None
    role: str
    is_active: bool


def merge_settings(saved: dict[str, Any] | None) -> dict[str, Any]:
    merged = {section: values.copy() for section, values in DEFAULT_ADMIN_SETTINGS.items()}
    if not saved:
        return merged
    for section, values in saved.items():
        if section in merged and isinstance(values, dict):
            merged[section].update(values)
    return merged


@router.get("/users", response_model=list[UserResponse])
async def list_users(
    db: AsyncSession = Depends(get_db),
    admin: UserModel = Depends(require_admin),
):
    result = await db.execute(select(UserModel).order_by(UserModel.created_at.desc()))
    return result.scalars().all()


@router.patch("/users/{user_id}/role")
async def update_user_role(
    user_id: str,
    role: str,
    db: AsyncSession = Depends(get_db),
    admin: UserModel = Depends(require_admin),
):
    valid_roles = {"admin", "manager", "security_team", "analyst", "viewer"}
    if role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {valid_roles}")

    result = await db.execute(select(UserModel).where(UserModel.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    previous_role = user.role
    user.role = role
    db.add(AuditLog(
        actor_id=admin.id,
        event_type="administration",
        action="user_role_updated",
        details={"user_id": str(user.id), "email": user.email, "previous_role": previous_role, "new_role": role},
    ))
    await db.commit()
    return {"message": f"User role updated to {role}"}


@router.patch("/users/{user_id}/profile", response_model=UserResponse)
async def update_user_profile(
    user_id: str,
    payload: UserProfileUpdate,
    db: AsyncSession = Depends(get_db),
    admin: UserModel = Depends(require_admin),
):
    valid_roles = {"admin", "manager", "security_team", "analyst", "viewer"}
    if payload.role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {valid_roles}")
    if not payload.email.strip() or "@" not in payload.email:
        raise HTTPException(status_code=400, detail="A valid email address is required")
    if len(payload.username.strip()) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")

    result = await db.execute(select(UserModel).where(UserModel.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id and (not payload.is_active or payload.role != "admin"):
        raise HTTPException(status_code=400, detail="You cannot disable or demote your own administrator account")

    duplicate = await db.execute(
        select(UserModel).where(
            UserModel.id != user.id,
            or_(UserModel.email == payload.email.strip(), UserModel.username == payload.username.strip()),
        )
    )
    if duplicate.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email or username is already used by another user")

    previous = {
        "email": user.email,
        "username": user.username,
        "full_name": user.full_name,
        "role": user.role,
        "is_active": user.is_active,
    }
    user.email = payload.email.strip()
    user.username = payload.username.strip()
    user.full_name = payload.full_name.strip() if payload.full_name else None
    user.role = payload.role
    user.is_active = payload.is_active

    db.add(AuditLog(
        actor_id=admin.id,
        event_type="administration",
        action="user_profile_updated",
        details={"user_id": str(user.id), "previous": previous, "updated": {
            "email": user.email,
            "username": user.username,
            "full_name": user.full_name,
            "role": user.role,
            "is_active": user.is_active,
        }},
    ))
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/scan-profiles")
async def list_scan_profiles(
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(require_admin),
):
    result = await db.execute(select(ScanProfile).where(ScanProfile.enabled == True))
    profiles = result.scalars().all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "category": p.category,
            "depth": p.depth,
            "risk_level": p.risk_level,
            "approval_required": False,
        }
        for p in profiles
    ]


@router.get("/scanner-tools")
async def list_scanner_tools(admin: UserModel = Depends(require_admin)):
    return SCANNER_TOOL_CATALOG


@router.get("/scanner-tools/health")
async def scanner_tools_health(admin: UserModel = Depends(require_admin)):
    """Return live tool availability from the scan execution worker."""
    from workers.celery_app import app as celery_app

    task = celery_app.send_task(
        "workers.tasks_scan.scanner_tool_health",
        queue="scan",
    )
    try:
        return await asyncio.to_thread(task.get, timeout=8)
    except Exception:
        # Keep the administration page useful when the worker is unavailable,
        # without exposing broker, host, or exception details to the client.
        tools = [
            {
                **tool,
                "available": None,
                "status": "unknown",
                "runtime_requirement": None,
            }
            for tool in SCANNER_TOOL_CATALOG
        ]
        return {
            "worker_status": "offline",
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "total": len(tools),
            "available": 0,
            "missing": 0,
            "tools": tools,
        }


@router.get("/settings")
async def get_admin_settings(
    db: AsyncSession = Depends(get_db),
    admin: UserModel = Depends(require_admin),
):
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.event_type == "administration", AuditLog.action == "admin_settings_updated")
        .order_by(AuditLog.created_at.desc())
        .limit(1)
    )
    latest = result.scalar_one_or_none()
    saved = latest.details.get("settings") if latest and latest.details else None
    return merge_settings(saved)


@router.patch("/settings")
async def update_admin_settings(
    payload: AdminSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    admin: UserModel = Depends(require_admin),
):
    settings = merge_settings(payload.settings)
    if settings["tool_policies"]["max_parallel_scans"] < 1:
        raise HTTPException(status_code=400, detail="Max parallel scans must be at least 1")
    if settings["safety_policies"]["rate_limit_per_minute"] < 1:
        raise HTTPException(status_code=400, detail="Rate limit must be at least 1")
    if settings["report_templates"]["show_scanner_names"]:
        raise HTTPException(status_code=400, detail="Scanner names are disabled for professional reports")

    db.add(AuditLog(
        actor_id=admin.id,
        event_type="administration",
        action="admin_settings_updated",
        details={"settings": settings},
    ))
    await db.commit()
    return settings


@router.get("/integrations/telegram")
async def get_telegram_integration(
    db: AsyncSession = Depends(get_db),
    admin: UserModel = Depends(require_admin),
):
    integration = await db.get(IntegrationSetting, "telegram")
    config = integration.config if integration else {}
    return {
        "enabled": bool(integration and integration.enabled),
        "configured": bool(integration and integration.secret_encrypted),
        "bot_token_masked": "••••••••" if integration and integration.secret_encrypted else "",
        "chat_id": config.get("chat_id", ""),
        "event_categories": config.get("event_categories", list(EVENT_CATEGORIES)),
        "finding_severities": config.get("finding_severities", list(FINDING_SEVERITIES[:2])),
        "updated_at": integration.updated_at if integration else None,
    }


@router.put("/integrations/telegram")
async def update_telegram_integration(
    payload: TelegramIntegrationUpdate,
    db: AsyncSession = Depends(get_db),
    admin: UserModel = Depends(require_admin),
):
    chat_id = payload.chat_id.strip()
    categories = list(dict.fromkeys(payload.event_categories))
    if not chat_id:
        raise HTTPException(status_code=400, detail="Telegram chat ID is required")
    if not categories or any(category not in EVENT_CATEGORIES for category in categories):
        raise HTTPException(status_code=400, detail="Select at least one valid activity category")
    finding_severities = list(dict.fromkeys(payload.finding_severities))
    if not finding_severities or any(item not in FINDING_SEVERITIES for item in finding_severities):
        raise HTTPException(status_code=400, detail="Select at least one valid finding severity")

    integration = await db.get(IntegrationSetting, "telegram")
    if not integration:
        integration = IntegrationSetting(key="telegram")
        db.add(integration)
    token = (payload.bot_token or "").strip()
    if token:
        try:
            bot = telegram_request(token, "getMe").get("result", {})
        except (ValueError, OSError) as exc:
            raise HTTPException(status_code=400, detail=f"Telegram bot validation failed: {exc}") from exc
        integration.secret_encrypted = encrypt_token(token)
        bot_username = bot.get("username")
    else:
        bot_username = (integration.config or {}).get("bot_username")
    if payload.enabled and not integration.secret_encrypted:
        raise HTTPException(status_code=400, detail="A valid Telegram bot token is required before enabling notifications")

    integration.enabled = payload.enabled
    integration.updated_by = admin.id
    integration.config = {
        "chat_id": chat_id,
        "event_categories": categories,
        "finding_severities": finding_severities,
        "bot_username": bot_username,
        "last_event_at": datetime.now(timezone.utc).isoformat(),
    }
    db.add(AuditLog(
        actor_id=admin.id,
        event_type="administration",
        action="telegram_integration_updated",
        details={"enabled": payload.enabled, "chat_id": chat_id, "event_categories": categories, "finding_severities": finding_severities, "bot_username": bot_username},
    ))
    await db.commit()
    await db.refresh(integration)
    return {
        "enabled": integration.enabled,
        "configured": bool(integration.secret_encrypted),
        "bot_token_masked": "••••••••" if integration.secret_encrypted else "",
        "chat_id": chat_id,
        "event_categories": categories,
        "finding_severities": finding_severities,
        "bot_username": bot_username,
        "updated_at": integration.updated_at,
    }


@router.post("/integrations/telegram/test")
async def test_telegram_integration(
    db: AsyncSession = Depends(get_db),
    admin: UserModel = Depends(require_admin),
):
    integration = await db.get(IntegrationSetting, "telegram")
    config = integration.config if integration else {}
    if not integration or not integration.secret_encrypted or not config.get("chat_id"):
        raise HTTPException(status_code=400, detail="Save a bot token and chat ID before sending a test")
    try:
        token = decrypt_token(integration.secret_encrypted)
        bot = telegram_request(token, "getMe").get("result", {})
        result = send_message(
            token,
            config["chat_id"],
            activity_message("administration", "telegram_connection_test", {"status": "connected"}, datetime.now(timezone.utc)),
        ).get("result", {})
    except (ValueError, OSError) as exc:
        raise HTTPException(status_code=502, detail=f"Telegram test failed: {exc}") from exc
    db.add(AuditLog(
        actor_id=admin.id,
        event_type="administration",
        action="telegram_connection_tested",
        details={"bot_username": bot.get("username"), "message_id": result.get("message_id")},
    ))
    await db.commit()
    return {"ok": True, "bot_username": bot.get("username"), "message_id": result.get("message_id")}


def _email_response(integration: IntegrationSetting | None) -> dict:
    config = integration.config if integration else {}
    return {
        "enabled": bool(integration and integration.enabled),
        "configured": bool(integration and integration.secret_encrypted),
        "password_masked": "••••••••" if integration and integration.secret_encrypted else "",
        "smtp_host": config.get("smtp_host", ""),
        "smtp_port": config.get("smtp_port", 587),
        "smtp_username": config.get("smtp_username", ""),
        "use_tls": config.get("use_tls", True),
        "from_email": config.get("from_email", ""),
        "recipients": config.get("recipients", []),
        "event_categories": config.get("event_categories", list(EVENT_CATEGORIES)),
        "updated_at": integration.updated_at if integration else None,
    }


@router.get("/integrations/email")
async def get_email_integration(db: AsyncSession = Depends(get_db), admin: UserModel = Depends(require_admin)):
    return _email_response(await db.get(IntegrationSetting, "email"))


@router.put("/integrations/email")
async def update_email_integration(
    payload: EmailIntegrationUpdate,
    db: AsyncSession = Depends(get_db),
    admin: UserModel = Depends(require_admin),
):
    host = payload.smtp_host.strip()
    categories = list(dict.fromkeys(payload.event_categories))
    recipients = list(dict.fromkeys(str(item).lower() for item in payload.recipients))
    if not host:
        raise HTTPException(status_code=400, detail="SMTP host is required")
    if not recipients:
        raise HTTPException(status_code=400, detail="At least one recipient is required")
    if not categories or any(category not in EVENT_CATEGORIES for category in categories):
        raise HTTPException(status_code=400, detail="Select at least one valid activity category")
    integration = await db.get(IntegrationSetting, "email")
    if not integration:
        integration = IntegrationSetting(key="email")
        db.add(integration)
    password = (payload.smtp_password or "").strip()
    if password:
        integration.secret_encrypted = encrypt_token(password)
    if payload.enabled and payload.smtp_username.strip() and not integration.secret_encrypted:
        raise HTTPException(status_code=400, detail="SMTP password is required before enabling authenticated email")
    integration.enabled = payload.enabled
    integration.updated_by = admin.id
    integration.config = {
        "smtp_host": host,
        "smtp_port": payload.smtp_port,
        "smtp_username": payload.smtp_username.strip(),
        "use_tls": payload.use_tls,
        "from_email": str(payload.from_email).lower(),
        "recipients": recipients,
        "event_categories": categories,
        "last_event_at": datetime.now(timezone.utc).isoformat(),
    }
    db.add(AuditLog(actor_id=admin.id, event_type="administration", action="email_integration_updated", details={
        "enabled": payload.enabled, "smtp_host": host, "smtp_port": payload.smtp_port,
        "from_email": str(payload.from_email), "recipient_count": len(recipients), "event_categories": categories,
    }))
    await db.commit()
    await db.refresh(integration)
    return _email_response(integration)


@router.post("/integrations/email/test")
async def test_email_integration(db: AsyncSession = Depends(get_db), admin: UserModel = Depends(require_admin)):
    integration = await db.get(IntegrationSetting, "email")
    config = integration.config if integration else {}
    if not integration or not config.get("smtp_host") or not config.get("recipients"):
        raise HTTPException(status_code=400, detail="Save the email channel before sending a test")
    try:
        send_email(
            host=config["smtp_host"], port=int(config["smtp_port"]), username=config.get("smtp_username", ""),
            password=decrypt_token(integration.secret_encrypted) if integration.secret_encrypted else "",
            use_tls=bool(config.get("use_tls", True)), from_email=config["from_email"], recipients=config["recipients"],
            subject="NoovaStack · Email connection test", text="Your NoovaStack SMTP notification channel is connected.",
        )
    except (OSError, ValueError, smtplib.SMTPException) as exc:
        raise HTTPException(status_code=502, detail=f"Email test failed: {exc}") from exc
    db.add(AuditLog(actor_id=admin.id, event_type="administration", action="email_connection_tested", details={"recipient_count": len(config["recipients"])}))
    await db.commit()
    return {"ok": True, "recipient_count": len(config["recipients"])}


@router.get("/audit-logs", response_model=list[AuditLogResponse])
async def list_audit_logs(
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    admin: UserModel = Depends(require_admin),
):
    result = await db.execute(
        select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
    )
    return result.scalars().all()


@router.get("/audit-logs/search")
async def search_audit_logs(
    search: str | None = Query(default=None, max_length=200),
    event_type: str | None = Query(default=None, max_length=50),
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    sort: str = Query(default="desc", pattern="^(asc|desc)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=10, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(require_manager),
):
    """Search and paginate platform audit events without loading the full history."""
    filters = []
    if search and search.strip():
        needle = search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{needle}%"
        filters.append(or_(
            AuditLog.event_type.ilike(pattern, escape="\\"),
            AuditLog.action.ilike(pattern, escape="\\"),
            cast(AuditLog.details, String).ilike(pattern, escape="\\"),
            UserModel.username.ilike(pattern, escape="\\"),
            UserModel.email.ilike(pattern, escape="\\"),
            UserModel.full_name.ilike(pattern, escape="\\"),
        ))
    if event_type:
        filters.append(AuditLog.event_type == event_type)
    if date_from:
        filters.append(AuditLog.created_at >= _audit_utc_naive(date_from))
    if date_to:
        filters.append(AuditLog.created_at < _audit_utc_naive(date_to))

    base = select(AuditLog, UserModel).outerjoin(UserModel, UserModel.id == AuditLog.actor_id)
    count_query = select(func.count(AuditLog.id)).select_from(AuditLog).outerjoin(UserModel, UserModel.id == AuditLog.actor_id)
    if filters:
        base = base.where(*filters)
        count_query = count_query.where(*filters)

    total = int((await db.execute(count_query)).scalar_one())
    order = AuditLog.created_at.asc() if sort == "asc" else AuditLog.created_at.desc()
    rows = (await db.execute(
        base.order_by(order, AuditLog.id.desc()).offset((page - 1) * page_size).limit(page_size)
    )).all()
    event_types = (await db.execute(
        select(AuditLog.event_type).distinct().order_by(AuditLog.event_type)
    )).scalars().all()

    return {
        "items": [
            {
                "id": log.id,
                "project_id": log.project_id,
                "engagement_id": log.engagement_id,
                "scan_id": log.scan_id,
                "actor_id": log.actor_id,
                "actor_name": (actor.full_name or actor.username) if actor else "System",
                "actor_email": actor.email if actor else None,
                "event_type": log.event_type,
                "action": log.action,
                "details": log.details or {},
                "ip_address": log.ip_address,
                "created_at": log.created_at,
            }
            for log, actor in rows
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
        "event_types": event_types,
    }


def _audit_utc_naive(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)
