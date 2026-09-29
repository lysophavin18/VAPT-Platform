"""
NoovaStack VAPT Platform - Asset Group Routes

An asset group is a saved, named bundle of domains/IP ranges for organizing and
bulk-acting on targets. It does not bypass the approval workflow: registering a
group's targets as assets always creates them as pending_review/pending, exactly
like manual asset creation. No automatic or recurring behavior is attached to a
group by itself.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from database.models import Asset, AssetGroup, AuditLog, Project
from auth import get_project_or_404, project_access_clause, require_user, User
from api.schemas import AssetGroupCreate, AssetGroupResponse, AssetGroupUpdate

router = APIRouter()


@router.post("/projects/{project_id}/asset-groups", response_model=AssetGroupResponse, status_code=status.HTTP_201_CREATED)
async def create_asset_group(
    project_id: str,
    data: AssetGroupCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    await get_project_or_404(db, project_id, current_user)
    group = AssetGroup(
        project_id=project_id,
        name=data.name,
        description=data.description,
        targets=[target.model_dump() for target in data.targets],
        created_by=current_user.id,
    )
    db.add(group)
    await db.flush()
    db.add(AuditLog(
        project_id=project_id,
        actor_id=current_user.id,
        event_type="asset_group",
        action="create_asset_group",
        details={"group_id": str(group.id), "name": group.name, "target_count": len(group.targets)},
    ))
    await db.commit()
    await db.refresh(group)
    return group


@router.get("/projects/{project_id}/asset-groups", response_model=list[AssetGroupResponse])
async def list_asset_groups(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    await get_project_or_404(db, project_id, current_user)
    result = await db.execute(
        select(AssetGroup).where(AssetGroup.project_id == project_id).order_by(AssetGroup.created_at.desc())
    )
    return result.scalars().all()


async def _get_group_or_404(db: AsyncSession, group_id: str, current_user: User) -> AssetGroup:
    result = await db.execute(
        select(AssetGroup)
        .join(Project, Project.id == AssetGroup.project_id)
        .where(AssetGroup.id == group_id, project_access_clause(current_user))
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Asset group not found")
    return group


@router.get("/asset-groups/{group_id}", response_model=AssetGroupResponse)
async def get_asset_group(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    return await _get_group_or_404(db, group_id, current_user)


@router.patch("/asset-groups/{group_id}", response_model=AssetGroupResponse)
async def update_asset_group(
    group_id: str,
    data: AssetGroupUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    group = await _get_group_or_404(db, group_id, current_user)
    updates = data.model_dump(exclude_unset=True)
    if "targets" in updates:
        updates["targets"] = [
            target if isinstance(target, dict) else target.model_dump()
            for target in (updates["targets"] or [])
        ]
    for key, value in updates.items():
        setattr(group, key, value)
    db.add(AuditLog(
        project_id=group.project_id,
        actor_id=current_user.id,
        event_type="asset_group",
        action="update_asset_group",
        details={"group_id": str(group.id), "fields": sorted(updates)},
    ))
    await db.commit()
    await db.refresh(group)
    return group


@router.delete("/asset-groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_asset_group(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    group = await _get_group_or_404(db, group_id, current_user)
    await db.delete(group)
    await db.commit()


@router.post("/asset-groups/{group_id}/register-assets")
async def register_group_assets(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    """Create a pending-review asset for each group target not already registered in the project."""
    group = await _get_group_or_404(db, group_id, current_user)
    existing_result = await db.execute(select(Asset.value).where(Asset.project_id == group.project_id))
    existing_values = {value for (value,) in existing_result.all()}

    created = []
    for target in group.targets or []:
        value = str((target or {}).get("value") or "").strip()
        if not value or value in existing_values:
            continue
        asset = Asset(
            project_id=group.project_id,
            asset_type=_infer_asset_type(value, (target or {}).get("type")),
            value=value,
            name=value,
            source="asset_group",
            discovery_method="manual",
            scope_status="pending_review",
        )
        db.add(asset)
        existing_values.add(value)
        created.append(value)

    db.add(AuditLog(
        project_id=group.project_id,
        actor_id=current_user.id,
        event_type="asset_group",
        action="register_group_assets",
        details={"group_id": str(group.id), "created": created},
    ))
    await db.commit()
    return {"created": created, "skipped_existing": len(group.targets or []) - len(created)}


def _infer_asset_type(value: str, hint: str | None) -> str:
    if hint == "public_ip" or _is_ipv4(value):
        return "ip_address"
    if hint == "cidr" or ("/" in value and all(c in "0123456789./" for c in value)):
        return "cidr"
    if value.startswith(("http://", "https://")):
        return "url"
    return "domain"


def _is_ipv4(value: str) -> bool:
    parts = value.split(".")
    if len(parts) != 4:
        return False
    try:
        return all(part.isdigit() and 0 <= int(part) <= 255 for part in parts)
    except ValueError:
        return False
