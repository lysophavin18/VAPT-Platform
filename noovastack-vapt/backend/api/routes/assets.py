"""
NoovaStack VAPT Platform - Asset Routes
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from database.models import Asset, AuditLog, Project
from auth import require_user, User, require_manager
from api.schemas import AssetCreate, AssetUpdate, AssetResponse, AssetDiscoveryRequest

router = APIRouter()


@router.post("/projects/{project_id}/assets", response_model=AssetResponse, status_code=status.HTTP_201_CREATED)
async def create_asset(
    project_id: str,
    data: AssetCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    proj = await db.execute(select(Project).where(Project.id == project_id))
    if not proj.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    asset = Asset(
        project_id=project_id,
        asset_type=data.asset_type,
        value=data.value,
        name=data.name or data.value,
        parent_asset_id=data.parent_asset_id,
        source=data.source,
        environment=data.environment,
        tags=data.tags,
    )
    db.add(asset)
    await db.commit()
    await db.refresh(asset)
    return asset


@router.get("/projects/{project_id}/assets", response_model=list[AssetResponse])
async def list_assets(
    project_id: str,
    scope_status: str | None = None,
    approval_status: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    query = select(Asset).where(Asset.project_id == project_id)
    if scope_status:
        query = query.where(Asset.scope_status == scope_status)
    if approval_status:
        query = query.where(Asset.approval_status == approval_status)
    result = await db.execute(query.order_by(Asset.created_at.desc()))
    return result.scalars().all()


@router.get("/assets/{asset_id}", response_model=AssetResponse)
async def get_asset(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    result = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset


@router.patch("/assets/{asset_id}", response_model=AssetResponse)
async def update_asset(
    asset_id: str,
    data: AssetUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    result = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(asset, key, value)
    await db.commit()
    await db.refresh(asset)
    return asset


@router.post("/assets/{asset_id}/approve", response_model=AssetResponse)
async def approve_asset(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    result = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    asset.approval_status = "approved"
    asset.scope_status = "in_scope"
    await db.commit()
    await db.refresh(asset)
    return asset


@router.post("/assets/{asset_id}/reject", response_model=AssetResponse)
async def reject_asset(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    result = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    asset.approval_status = "rejected"
    asset.scope_status = "out_of_scope"
    await db.commit()
    await db.refresh(asset)
    return asset


@router.post("/projects/{project_id}/asset-discovery")
async def start_asset_discovery(
    project_id: str,
    request: AssetDiscoveryRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    proj = await db.execute(select(Project).where(Project.id == project_id))
    if not proj.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    from workers.celery_app import run_asset_discovery
    task = run_asset_discovery.delay(project_id, request.target, request.discovery_types, request.target_type)
    db.add(AuditLog(
        project_id=project_id,
        actor_id=current_user.id,
        event_type="asset_discovery",
        action="started",
        details={"target": request.target, "target_type": request.target_type, "discovery_types": request.discovery_types, "job_id": task.id},
    ))
    await db.commit()
    return {
        "job_id": task.id,
        "status": "started",
        "project_id": project_id,
        "message": f"Asset discovery started for {request.target}",
    }


@router.get("/projects/{project_id}/asset-graph")
async def get_asset_graph(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    result = await db.execute(
        select(Asset).where(Asset.project_id == project_id)
    )
    assets = result.scalars().all()
    nodes = []
    edges = []
    for a in assets:
        nodes.append({
            "id": str(a.id),
            "label": a.name or a.value,
            "type": a.asset_type,
            "scope_status": a.scope_status,
        })
        if a.parent_asset_id:
            edges.append({
                "source": str(a.parent_asset_id),
                "target": str(a.id),
            })
    return {"nodes": nodes, "edges": edges}
