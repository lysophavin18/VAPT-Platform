"""
NoovaStack VAPT Platform - Administration Routes
"""
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from database.models import User, ScanProfile, AuditLog
from auth import require_admin, User as UserModel
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
    valid_roles = {"admin", "manager", "analyst", "viewer"}
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
    valid_roles = {"admin", "manager", "analyst", "viewer"}
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
