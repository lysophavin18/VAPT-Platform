"""
NoovaStack VAPT Platform - Discovery Tasks
"""
import asyncio
import logging
from urllib.parse import urlparse
from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name="workers.tasks_discovery.run_asset_discovery", bind=True)
def run_asset_discovery(self, project_id: str, target: str, discovery_types: list, target_type: str | None = None):
    """Run passive and active asset discovery for a target."""
    logger.info(f"Starting asset discovery for project={project_id}, target={target}")
    loop = asyncio.new_event_loop()
    try:
        discovered = loop.run_until_complete(
            _discover_assets(project_id, target, discovery_types, target_type)
        )
        return {
            "status": "completed",
            "project_id": project_id,
            "target": target,
            "assets_found": len(discovered),
            "assets": discovered,
        }
    except Exception as e:
        logger.error(f"Asset discovery failed: {e}")
        return {"status": "failed", "error": str(e)}
    finally:
        loop.close()


async def _discover_assets(project_id: str, target: str, discovery_types: list, target_type: str | None = None) -> list:
    """Core asset discovery logic."""
    from database import AsyncSessionLocal
    from database.models import Asset

    discovered = []
    async with AsyncSessionLocal() as session:
        normalized = _normalize_target(target, target_type)
        if "passive" in discovery_types or "safe_active" in discovery_types or "technology_detection" in discovery_types:
            for asset_type, value in normalized:
                technology = {}
                ports_services = {}
                discovery_method = "passive"

                if "safe_active" in discovery_types or "technology_detection" in discovery_types:
                    probe = await _safe_probe(value, asset_type)
                    technology = probe.get("technology", {})
                    ports_services = probe.get("ports_services", {})
                    discovery_method = "safe_active" if probe.get("reachable") else "passive"

                existing_result = await session.execute(
                    __import__("sqlalchemy").select(Asset).where(
                        Asset.project_id == project_id,
                        Asset.value == value,
                    )
                )
                existing = existing_result.scalar_one_or_none()
                if existing:
                    existing.asset_type = asset_type
                    existing.discovery_method = discovery_method
                    existing.technology = technology or existing.technology or {}
                    existing.ports_services = ports_services or existing.ports_services or {}
                    existing.last_observed_at = __import__("datetime").datetime.utcnow()
                else:
                    asset = Asset(
                        project_id=project_id,
                        asset_type=asset_type,
                        value=value,
                        name=value,
                        source="discovery",
                        discovery_method=discovery_method,
                        scope_status="pending_review",
                        technology=technology,
                        ports_services=ports_services,
                    )
                    session.add(asset)
                discovered.append({"type": asset_type, "value": value, "discovery_method": discovery_method, "technology": technology, "ports_services": ports_services})
        await session.commit()
    return discovered


def _normalize_target(target: str, target_type: str | None = None) -> list:
    """Normalize a target into structured asset types."""
    assets = []
    target = target.strip()

    if not target:
        return assets

    if target_type == "website_url" or target.startswith(("http://", "https://")):
        assets.append(("url", target))
        parsed = urlparse(target)
        if parsed.hostname:
            host_type = "ip_address" if _is_ipv4(parsed.hostname) else "domain"
            assets.append((host_type, parsed.hostname))
            if parsed.port:
                assets.append(("service", f"{parsed.hostname}:{parsed.port}"))

    elif target_type == "public_ip" or _is_ipv4(target):
        assets.append(("ip_address", target))

    elif target_type == "cidr" or "/" in target and all(c in "0123456789./" for c in target):
        assets.append(("cidr", target))

    elif "." in target and "/" not in target:
        assets.append(("domain", target))
        assets.append(("subdomain", f"www.{target}"))
        assets.append(("url", f"https://{target}"))
        assets.append(("url", f"http://{target}"))

    else:
        assets.append(("generic", target))

    return assets


def _is_ipv4(value: str) -> bool:
    parts = value.split(".")
    if len(parts) != 4:
        return False
    try:
        return all(part.isdigit() and 0 <= int(part) <= 255 for part in parts)
    except ValueError:
        return False


async def _safe_probe(value: str, asset_type: str) -> dict:
    if asset_type not in {"url", "service", "ip_address"}:
        return {"reachable": False}

    try:
        import httpx
        urls = _probe_urls(value, asset_type)
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=False, trust_env=False, verify=False) as client:
            for url in urls:
                try:
                    response = await client.get(url)
                except Exception:
                    continue
                headers = response.headers
                server = headers.get("server")
                powered_by = headers.get("x-powered-by")
                parsed = urlparse(url)
                port = parsed.port or (443 if parsed.scheme == "https" else 80)
                return {
                    "reachable": True,
                    "technology": {
                        "server": server,
                        "x_powered_by": powered_by,
                        "content_type": headers.get("content-type"),
                    },
                    "ports_services": {
                        str(port): {
                            "url": url,
                            "scheme": parsed.scheme,
                            "status_code": response.status_code,
                            "service": "https" if parsed.scheme == "https" else "http",
                        }
                    },
                }
    except Exception as exc:
        logger.warning(f"Safe asset probe failed for {value}: {exc}")
    return {"reachable": False}


def _probe_urls(value: str, asset_type: str) -> list[str]:
    if value.startswith(("http://", "https://")):
        return [value]
    host = value.split(":", 1)[0] if asset_type == "service" else value
    if asset_type == "service" and ":" in value:
        port = value.rsplit(":", 1)[1]
        return [f"http://{host}:{port}/", f"https://{host}:{port}/"]
    return [f"https://{host}/", f"http://{host}/", f"http://{host}:3000/", f"http://{host}:8080/", f"http://{host}:8082/"]
