"""
NoovaStack VAPT Platform - Asset Routes
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from database.models import Asset, AuditLog, Project
from auth import get_asset_or_404, get_project_or_404, require_user, User, require_manager
from api.schemas import AssetCreate, AssetUpdate, AssetResponse, AssetDiscoveryRequest, DiscoveryJobStatus

router = APIRouter()


@router.post("/projects/{project_id}/assets", response_model=AssetResponse, status_code=status.HTTP_201_CREATED)
async def create_asset(
    project_id: str,
    data: AssetCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    await get_project_or_404(db, project_id, current_user)
    if data.parent_asset_id:
        parent = await get_asset_or_404(db, data.parent_asset_id, current_user)
        if str(parent.project_id) != str(project_id):
            raise HTTPException(status_code=400, detail="Parent asset must belong to the same project")

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
    asset_type: str | None = Query(default=None, description="Filter by asset type: domain, subdomain, ip_address, url, service, cidr"),
    source: str | None = Query(default=None, description="Filter by source: discovery, manual"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    await get_project_or_404(db, project_id, current_user)
    query = select(Asset).where(Asset.project_id == project_id)
    if scope_status:
        query = query.where(Asset.scope_status == scope_status)
    if approval_status:
        query = query.where(Asset.approval_status == approval_status)
    if asset_type:
        query = query.where(Asset.asset_type == asset_type)
    if source:
        query = query.where(Asset.source == source)
    result = await db.execute(query.order_by(Asset.created_at.desc()))
    return result.scalars().all()


@router.get("/assets", response_model=list[AssetResponse])
async def list_all_assets(
    approval_status: str | None = None,
    scope_status: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    query = select(Asset)
    if approval_status:
        query = query.where(Asset.approval_status == approval_status)
    if scope_status:
        query = query.where(Asset.scope_status == scope_status)
    result = await db.execute(query.order_by(Asset.created_at.desc()))
    return result.scalars().all()


@router.get("/assets/{asset_id}", response_model=AssetResponse)
async def get_asset(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    return await get_asset_or_404(db, asset_id, current_user)


@router.patch("/assets/{asset_id}", response_model=AssetResponse)
async def update_asset(
    asset_id: str,
    data: AssetUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    asset = await get_asset_or_404(db, asset_id, current_user)
    updates = data.model_dump(exclude_unset=True)
    if current_user.role not in ("admin", "manager") and {
        "scope_status", "approval_status"
    }.intersection(updates):
        raise HTTPException(status_code=403, detail="Manager role required to change asset scope or approval")
    for key, value in updates.items():
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
    asset = await get_asset_or_404(db, asset_id, current_user)
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
    asset = await get_asset_or_404(db, asset_id, current_user)
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
    await get_project_or_404(db, project_id, current_user)

    from workers.celery_app import run_asset_discovery
    task = run_asset_discovery.delay(project_id, request.target, request.discovery_types, request.target_type)
    db.add(AuditLog(
        project_id=project_id,
        actor_id=current_user.id,
        event_type="asset_discovery",
        action="started",
        details={
            "target": request.target,
            "target_type": request.target_type,
            "discovery_types": request.discovery_types,
            "job_id": task.id,
        },
    ))
    await db.commit()
    return {
        "job_id": task.id,
        "status": "started",
        "project_id": project_id,
        "message": f"Asset discovery started for {request.target}",
    }


@router.get("/projects/{project_id}/discovery-jobs/{job_id}", response_model=DiscoveryJobStatus)
async def get_discovery_job_status(
    project_id: str,
    job_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    """
    Poll the status of a running asset discovery job.
    States: PENDING → STARTED → SUCCESS | FAILURE
    """
    await get_project_or_404(db, project_id, current_user)

    try:
        from celery.result import AsyncResult
        from workers.celery_app import app as celery_app
        result = AsyncResult(job_id, app=celery_app)
        state = result.state  # PENDING, STARTED, SUCCESS, FAILURE, RETRY

        info = result.info if isinstance(result.info, dict) else {}

        if state == "SUCCESS":
            payload = result.result or {}
            return DiscoveryJobStatus(
                job_id=job_id,
                state=state,
                status=payload.get("status", "completed"),
                assets_found=payload.get("assets_found", 0),
                assets=payload.get("assets", []),
                error=None,
            )
        elif state == "FAILURE":
            exc = result.result
            return DiscoveryJobStatus(
                job_id=job_id,
                state=state,
                status="failed",
                assets_found=0,
                assets=[],
                error=str(exc) if exc else "Unknown error",
            )
        else:
            # PENDING / STARTED / RETRY
            return DiscoveryJobStatus(
                job_id=job_id,
                state=state,
                status="running",
                assets_found=0,
                assets=[],
                error=None,
            )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not query job status: {exc}")


@router.post("/assets/{asset_id}/reprobe", response_model=AssetResponse)
async def reprobe_asset(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    """
    Re-run technology fingerprinting on a single asset.
    Uses httpx tech-detect + whatweb (if installed).
    """
    asset = await get_asset_or_404(db, asset_id, current_user)

    if asset.asset_type not in {"url", "service", "ip_address", "domain", "subdomain"}:
        raise HTTPException(status_code=400, detail="Asset type cannot be probed for technology")

    import asyncio

    async def _do_probe():
        from workers.tasks_discovery import _safe_probe
        return await _safe_probe(asset.value, asset.asset_type)

    loop = asyncio.new_event_loop()
    try:
        probe = loop.run_until_complete(_do_probe())
    finally:
        loop.close()

    if probe.get("reachable"):
        asset.technology = {**(asset.technology or {}), **probe.get("technology", {})}
        asset.ports_services = {**(asset.ports_services or {}), **probe.get("ports_services", {})}
        asset.discovery_method = "safe_active"
        from datetime import datetime
        asset.last_observed_at = datetime.utcnow()
        await db.commit()
        await db.refresh(asset)

    return asset


@router.get("/projects/{project_id}/asset-graph")
async def get_asset_graph(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    await get_project_or_404(db, project_id, current_user)
    result = await db.execute(
        select(Asset).where(Asset.project_id == project_id)
    )
    assets = result.scalars().all()

    nodes = []
    edges = []
    edge_set: set[tuple[str, str]] = set()

    def add_edge(src: str, tgt: str):
        key = (src, tgt)
        if key not in edge_set:
            edge_set.add(key)
            edges.append({"source": src, "target": tgt})

    # Build lookup maps
    id_map = {str(a.id): a for a in assets}
    value_map: dict[str, str] = {}  # value → id (prefer domain > subdomain for duplicates)
    for a in assets:
        v = (a.value or "").strip().lower()
        if v and (v not in value_map or a.asset_type == "domain"):
            value_map[v] = str(a.id)

    for a in assets:
        nodes.append({
            "id": str(a.id),
            "label": a.name or a.value,
            "type": a.asset_type,
            "scope_status": a.scope_status,
        })

        # 1. Explicit parent link
        if a.parent_asset_id and str(a.parent_asset_id) in id_map:
            add_edge(str(a.parent_asset_id), str(a.id))

        v = (a.value or "").strip().lower()

        # 2. Subdomain → parent domain (inferred from suffix)
        if a.asset_type in ("subdomain", "url"):
            for domain_val, domain_id in value_map.items():
                if domain_id != str(a.id) and (
                    v.endswith(f".{domain_val}") or
                    v.lstrip("https://").lstrip("http://").split("/")[0].endswith(f".{domain_val}")
                ):
                    add_edge(domain_id, str(a.id))
                    break

        # 3. Service (host:port) → its host asset
        if a.asset_type == "service" and ":" in v:
            host = v.rsplit(":", 1)[0]
            host_id = value_map.get(host)
            if host_id and host_id != str(a.id):
                add_edge(host_id, str(a.id))

        # 4. IP → domain/subdomain inferred from technology.resolved_from
        if a.asset_type == "ip_address" and isinstance(a.technology, dict):
            resolved_from = (a.technology.get("resolved_from") or "").strip().lower()
            if resolved_from:
                parent_id = value_map.get(resolved_from)
                if parent_id and parent_id != str(a.id):
                    add_edge(parent_id, str(a.id))

    return {"nodes": nodes, "edges": edges}
