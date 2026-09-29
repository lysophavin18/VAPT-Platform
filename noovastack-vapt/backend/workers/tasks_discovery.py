"""
NoovaStack VAPT Platform - Discovery Tasks

ProjectDiscovery-style pipeline:
  subdomain_enum  → subfinder + amass passive → DNS-confirmed subdomains
  dns_enum        → dnsx A/AAAA/CNAME/MX/TXT/NS records per host
  host_probe      → naabu port scan → open ports stored in ports_services
  tech_fingerprint→ httpx tech-detect + whatweb → structured technology categories
  passive         → legacy alias: subdomain_enum + dns_enum
  safe_active     → legacy alias: host_probe
  technology_detection → legacy alias: tech_fingerprint
"""
import asyncio
import json
import logging
from datetime import datetime
from ipaddress import ip_address, ip_network
from urllib.parse import urlparse
from celery import shared_task

logger = logging.getLogger(__name__)

# ── Known CDN / WAF / CMS keyword sets used when categorising httpx tech output ──
_CDN_KEYWORDS = {
    "cloudflare", "cloudfront", "akamai", "fastly", "azure cdn", "amazon cloudfront",
    "stackpath", "keycdn", "bunnycdn", "cdn77", "sucuri", "incapsula", "edgecast",
}
_WAF_KEYWORDS = {
    "cloudflare", "sucuri", "incapsula", "wordfence", "mod_security", "aws waf",
    "barracuda", "f5 big-ip", "imperva", "fortiweb",
}
_CMS_KEYWORDS = {
    "wordpress", "drupal", "joomla", "magento", "shopify", "ghost", "typo3",
    "prestashop", "opencart", "craft cms", "contentful", "strapi",
}
_FRAMEWORK_KEYWORDS = {
    "django", "flask", "fastapi", "rails", "laravel", "symfony", "express",
    "next.js", "nuxt", "angular", "react", "vue", "svelte", "spring boot",
    "asp.net", "gin", "fiber", "echo", "actix",
}
_LANG_KEYWORDS = {
    "php", "python", "ruby", "node.js", "java", "go", "rust", ".net", "perl",
}


def _categorise_tech(tech_list: list[str]) -> dict:
    """
    Split an httpx/whatweb tech list into: server, cdn, waf, cms, frameworks, language, other.
    All values are lowercased strings; lists for multi-value slots.
    """
    categories: dict = {
        "server": None,
        "cdn": None,
        "waf": None,
        "cms": None,
        "frameworks": [],
        "language": None,
        "other": [],
    }
    for raw in tech_list:
        t = raw.strip().lower()
        if not t:
            continue
        if any(k in t for k in _CDN_KEYWORDS):
            categories["cdn"] = raw.strip()
        if any(k in t for k in _WAF_KEYWORDS):
            categories["waf"] = raw.strip()
        if any(k in t for k in _CMS_KEYWORDS):
            categories["cms"] = raw.strip()
        if any(k in t for k in _FRAMEWORK_KEYWORDS):
            categories["frameworks"].append(raw.strip())
        elif any(k in t for k in _LANG_KEYWORDS):
            categories["language"] = raw.strip()
        elif t.startswith(("apache", "nginx", "iis", "lighttpd", "caddy", "gunicorn", "uvicorn")):
            categories["server"] = raw.strip()
        else:
            categories["other"].append(raw.strip())
    return categories


# ─────────────────────────────────────────────────────────────────────────────
# Celery entry point
# ─────────────────────────────────────────────────────────────────────────────

@shared_task(name="workers.tasks_discovery.run_asset_discovery", bind=True)
def run_asset_discovery(self, project_id: str, target: str, discovery_types: list, target_type: str | None = None):
    """Run passive and active asset discovery for a target."""
    logger.info(f"Starting asset discovery for project={project_id}, target={target}, types={discovery_types}")
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
        logger.error(f"Asset discovery failed: {e}", exc_info=True)
        return {"status": "failed", "error": str(e)}
    finally:
        loop.close()


# ─────────────────────────────────────────────────────────────────────────────
# Core pipeline
# ─────────────────────────────────────────────────────────────────────────────

async def _discover_assets(project_id: str, target: str, discovery_types: list, target_type: str | None = None) -> list:
    """
    Core asset discovery pipeline.

    Effective discovery_types (aliases expanded):
      subdomain_enum     – subfinder → dnsx confirm → add resolved subdomains
      dns_enum           – dnsx full record set per host (A/AAAA/CNAME/MX/TXT/NS)
      host_probe         – naabu port discovery per host
      tech_fingerprint   – httpx tech-detect + whatweb per reachable host

    Legacy aliases:
      passive            → subdomain_enum + dns_enum
      safe_active        → host_probe
      technology_detection → tech_fingerprint
    """
    from database import AsyncSessionLocal
    from database.models import Asset, Engagement, Project
    from safety import SafetyContext, is_safe
    from sqlalchemy import select

    # Expand legacy aliases
    effective = set(discovery_types)
    if "passive" in effective:
        effective.update({"subdomain_enum", "dns_enum"})
    if "safe_active" in effective:
        effective.add("host_probe")
    if "technology_detection" in effective:
        effective.add("tech_fingerprint")

    discovered = []
    async with AsyncSessionLocal() as session:
        project_result = await session.execute(select(Project).where(Project.id == project_id))
        if not project_result.scalar_one_or_none():
            raise ValueError("Project not found")

        normalized = _normalize_target(target, target_type)
        if not normalized:
            raise ValueError("No valid discovery target specified")

        # ── scope gate ──
        scope_result = await session.execute(
            select(Asset).where(
                Asset.project_id == project_id,
                Asset.scope_status == "in_scope",
                Asset.approval_status == "approved",
            )
        )
        approved_assets = list(scope_result.scalars().all())
        scope_asset = next(
            (asset for asset in approved_assets if _target_is_within_asset_scope(target, asset)),
            None,
        )
        if not scope_asset:
            raise ValueError("Discovery target is not covered by an approved in-scope project asset")

        engagement = None
        if scope_asset.engagement_id:
            engagement_result = await session.execute(
                select(Engagement).where(Engagement.id == scope_asset.engagement_id)
            )
            engagement = engagement_result.scalar_one_or_none()
            if not engagement or engagement.project_id != scope_asset.project_id:
                raise ValueError("Approved discovery asset has no valid project engagement")
            if engagement.authorization_status != "authorized":
                raise ValueError("Discovery engagement is not authorized")
            if engagement.end_date and engagement.end_date < datetime.utcnow():
                raise ValueError("Discovery engagement authorization is expired")

        safe, reasons = is_safe(SafetyContext(
            project_id=project_id,
            engagement_id=str(scope_asset.engagement_id) if scope_asset.engagement_id else None,
            target=target,
            testing_window_start=engagement.testing_window_start if engagement else None,
            testing_window_end=engagement.testing_window_end if engagement else None,
            scope_is_approved=True,
        ))
        if not safe:
            raise ValueError("Discovery target failed safety validation: " + "; ".join(reasons))

        known_values = {value for _, value in normalized}

        # ── 1. Subdomain enumeration ──
        if "subdomain_enum" in effective:
            root_domain = next((value for asset_type, value in normalized if asset_type == "domain"), None)
            if root_domain:
                candidates = [
                    s for s in await _enumerate_subdomains(root_domain)
                    if s and s != root_domain and s not in known_values
                ]
                resolvable = await _resolve_dns(candidates)
                for subdomain in candidates:
                    if subdomain in resolvable:
                        normalized.append(("subdomain", subdomain))
                        known_values.add(subdomain)
                logger.info(f"Subdomain enum: {len(candidates)} candidates → {len(resolvable)} resolved for {root_domain}")

        # ── 2. DNS record enumeration ──
        # Collect DNS records (A/AAAA/CNAME/MX/TXT/NS) for all domain/subdomain targets
        dns_record_map: dict[str, dict] = {}
        if "dns_enum" in effective:
            hosts_for_dns = [v for t, v in normalized if t in ("domain", "subdomain", "ip_address")][:50]
            if hosts_for_dns:
                dns_record_map = await _collect_dns_records(hosts_for_dns)
                logger.info(f"DNS enum: collected records for {len(dns_record_map)} hosts")

        # ── 3. Port discovery ──
        port_map: dict[str, list[int]] = {}
        if "host_probe" in effective:
            host_candidates = [v for t, v in normalized if t in ("domain", "subdomain", "ip_address")][:15]
            for host in host_candidates:
                ports = await _discover_open_ports(host)
                if ports:
                    port_map[host] = ports
                    for port in ports:
                        svc_value = f"{host}:{port}"
                        if svc_value not in known_values:
                            normalized.append(("service", svc_value))
                            known_values.add(svc_value)
            logger.info(f"Host probe: found open ports on {len(port_map)} hosts")

        # ── 4. Upsert all assets ──
        for asset_type, value in normalized:
            # Per-asset safety check
            safe, reasons = is_safe(SafetyContext(
                project_id=project_id,
                engagement_id=str(scope_asset.engagement_id) if scope_asset.engagement_id else None,
                target=value,
                testing_window_start=engagement.testing_window_start if engagement else None,
                testing_window_end=engagement.testing_window_end if engagement else None,
                scope_is_approved=True,
            ))
            if not safe:
                logger.warning(f"Skipping {value}: failed safety check – {reasons}")
                continue

            technology: dict = {}
            ports_services: dict = {}
            dns_records: dict = {}
            discovery_method = "passive"

            # Attach DNS records
            host_key = value.split(":")[0] if asset_type == "service" else value
            if host_key in dns_record_map:
                dns_records = dns_record_map[host_key]

            # Attach port data
            if asset_type in ("domain", "subdomain", "ip_address") and value in port_map:
                for p in port_map[value]:
                    ports_services[str(p)] = {"port": p, "service": _guess_service(p)}
                discovery_method = "safe_active"

            # Tech fingerprinting
            if "tech_fingerprint" in effective and asset_type in ("url", "service", "ip_address", "domain", "subdomain"):
                probe = await _safe_probe(value, asset_type)
                technology = probe.get("technology", {})
                # Merge port/service info from probe if we didn't already port-scan
                if probe.get("ports_services"):
                    ports_services.update(probe["ports_services"])
                if probe.get("reachable"):
                    discovery_method = "safe_active"

            # Merge dns_records into technology blob for storage
            if dns_records:
                technology["dns_records"] = dns_records

            # Upsert asset
            existing_result = await session.execute(
                select(Asset).where(
                    Asset.project_id == project_id,
                    Asset.value == value,
                )
            )
            existing = existing_result.scalar_one_or_none()
            now = datetime.utcnow()
            if existing:
                existing.asset_type = asset_type
                existing.discovery_method = discovery_method
                existing.technology = {**(existing.technology or {}), **technology} if technology else (existing.technology or {})
                existing.ports_services = {**(existing.ports_services or {}), **ports_services} if ports_services else (existing.ports_services or {})
                existing.last_observed_at = now
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
                    first_discovered_at=now,
                    last_observed_at=now,
                )
                session.add(asset)

            discovered.append({
                "type": asset_type,
                "value": value,
                "discovery_method": discovery_method,
                "technology": technology,
                "ports_services": ports_services,
                "dns_records": dns_records,
            })

        await session.commit()

    # ── 5. Create IP child-assets from A records ──
    await _register_ip_children(project_id, dns_record_map, known_values)

    return discovered


async def _register_ip_children(project_id: str, dns_record_map: dict, known_values: set) -> None:
    """
    For each resolved A/AAAA record, ensure an ip_address asset exists
    as a child of its parent domain/subdomain asset.
    """
    if not dns_record_map:
        return
    from database import AsyncSessionLocal
    from database.models import Asset
    from sqlalchemy import select

    async with AsyncSessionLocal() as session:
        for host, records in dns_record_map.items():
            ip_list = records.get("a", []) + records.get("aaaa", [])
            if not ip_list:
                continue
            parent_result = await session.execute(
                select(Asset).where(
                    Asset.project_id == project_id,
                    Asset.value == host,
                )
            )
            parent = parent_result.scalar_one_or_none()
            for ip in ip_list:
                if ip in known_values:
                    continue
                known_values.add(ip)
                existing = (await session.execute(
                    select(Asset).where(Asset.project_id == project_id, Asset.value == ip)
                )).scalar_one_or_none()
                if not existing:
                    session.add(Asset(
                        project_id=project_id,
                        asset_type="ip_address",
                        value=ip,
                        name=ip,
                        source="discovery",
                        discovery_method="dns_enum",
                        scope_status="pending_review",
                        parent_asset_id=parent.id if parent else None,
                        technology={"resolved_from": host},
                    ))
        await session.commit()


# ─────────────────────────────────────────────────────────────────────────────
# Tool wrappers
# ─────────────────────────────────────────────────────────────────────────────

async def _enumerate_subdomains(domain: str) -> list[str]:
    """
    Passive subdomain enumeration: subfinder first, amass passive as supplement.
    Returns deduplicated list of confirmed-format subdomains.
    """
    from workers.tasks_scan import _resolve_tool_binary, _run_limited_command

    results: set[str] = set()

    # subfinder
    binary = _resolve_tool_binary("subfinder")
    if binary:
        out = await _run_limited_command(
            [binary, "-d", domain, "-silent", "-all", "-timeout", "20"],
            timeout=45,
        )
        for line in (out.get("stdout_tail") or "").splitlines():
            line = line.strip().lower()
            if line and line.endswith(f".{domain}") or line == domain:
                results.add(line)
    else:
        logger.warning("subfinder not found; skipping for %s", domain)

    # amass passive (supplement)
    amass = _resolve_tool_binary("amass")
    if amass:
        out = await _run_limited_command(
            [amass, "enum", "-passive", "-d", domain, "-timeout", "2", "-silent"],
            timeout=60,
        )
        for line in (out.get("stdout_tail") or "").splitlines():
            line = line.strip().lower()
            if line and (line.endswith(f".{domain}") or line == domain):
                results.add(line)
    # amass absence is fine — subfinder is primary

    return sorted(results)


async def _resolve_dns(hosts: list[str]) -> set[str]:
    """
    Confirm which candidate hostnames actually resolve via dnsx.
    Returns all candidates unfiltered if dnsx isn't installed.
    """
    from workers.tasks_scan import _resolve_tool_binary

    if not hosts:
        return set()

    binary = _resolve_tool_binary("dnsx")
    if not binary:
        logger.warning("dnsx not installed; returning all %d candidates unfiltered", len(hosts))
        return set(hosts)

    try:
        process = await asyncio.create_subprocess_exec(
            binary, "-silent", "-a", "-json",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(
            process.communicate("\n".join(hosts).encode()),
            timeout=45,
        )
    except Exception as exc:
        logger.warning("dnsx confirmation failed: %s", exc)
        return set(hosts)

    resolved: set[str] = set()
    for line in stdout.decode("utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            entry = json.loads(line)
            host = entry.get("host") or entry.get("input")
            if host:
                resolved.add(str(host).strip().lower())
        except json.JSONDecodeError:
            continue
    return resolved


async def _collect_dns_records(hosts: list[str]) -> dict[str, dict]:
    """
    Full DNS record collection via dnsx for a list of hosts.
    Returns {host: {a: [...], aaaa: [...], cname: [...], mx: [...], txt: [...], ns: [...]}}
    """
    from workers.tasks_scan import _resolve_tool_binary

    if not hosts:
        return {}

    binary = _resolve_tool_binary("dnsx")
    if not binary:
        logger.warning("dnsx not installed; skipping DNS record collection")
        return {}

    try:
        process = await asyncio.create_subprocess_exec(
            binary, "-silent",
            "-a", "-aaaa", "-cname", "-mx", "-txt", "-ns",
            "-json",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(
            process.communicate("\n".join(hosts).encode()),
            timeout=60,
        )
    except Exception as exc:
        logger.warning("DNS record collection failed: %s", exc)
        return {}

    record_map: dict[str, dict] = {}
    for line in stdout.decode("utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue

        host = (entry.get("host") or entry.get("input") or "").strip().lower()
        if not host:
            continue

        if host not in record_map:
            record_map[host] = {"a": [], "aaaa": [], "cname": [], "mx": [], "txt": [], "ns": []}

        def _flat(key: str) -> list[str]:
            v = entry.get(key, [])
            return [str(x).strip() for x in (v if isinstance(v, list) else [v]) if x]

        record_map[host]["a"].extend(_flat("a"))
        record_map[host]["aaaa"].extend(_flat("aaaa"))
        record_map[host]["cname"].extend(_flat("cname"))
        record_map[host]["mx"].extend(_flat("mx"))
        record_map[host]["txt"].extend(_flat("txt"))
        record_map[host]["ns"].extend(_flat("ns"))

    # Deduplicate
    for host in record_map:
        for k in record_map[host]:
            record_map[host][k] = sorted(set(record_map[host][k]))

    return record_map


async def _discover_open_ports(host: str) -> list[int]:
    """Fast port discovery via naabu. Returns [] if the tool isn't installed or nothing responds."""
    from workers.tasks_scan import _resolve_tool_binary, _run_limited_command

    binary = _resolve_tool_binary("naabu")
    if not binary:
        logger.warning("naabu not installed; skipping port discovery for %s", host)
        return []

    result = await _run_limited_command(
        [binary, "-host", host, "-rate", "100", "-top-ports", "100", "-silent"],
        timeout=45,
    )
    ports: set[int] = set()
    for line in (result.get("stdout_tail") or "").splitlines():
        line = line.strip()
        if ":" not in line:
            continue
        try:
            ports.add(int(line.rsplit(":", 1)[1]))
        except ValueError:
            continue
    return sorted(ports)


def _guess_service(port: int) -> str:
    """Map common ports to service names."""
    return {
        21: "ftp", 22: "ssh", 23: "telnet", 25: "smtp", 53: "dns",
        80: "http", 110: "pop3", 143: "imap", 443: "https",
        445: "smb", 3306: "mysql", 5432: "postgresql",
        6379: "redis", 8080: "http-alt", 8443: "https-alt",
        8082: "http-alt", 9200: "elasticsearch", 27017: "mongodb",
    }.get(port, "unknown")


async def _safe_probe(value: str, asset_type: str) -> dict:
    """Choose the best available prober."""
    if asset_type not in {"url", "service", "ip_address", "domain", "subdomain"}:
        return {"reachable": False}

    from workers.tasks_scan import _resolve_tool_binary
    if _resolve_tool_binary("httpx"):
        result = await _probe_with_httpx_tool(value)
    else:
        result = await _probe_with_python_client(value, asset_type)

    # Supplement with whatweb if available
    whatweb = _resolve_tool_binary("whatweb")
    if whatweb and result.get("reachable"):
        ww = await _probe_with_whatweb(value)
        if ww:
            tech = result.setdefault("technology", {})
            existing_stack = tech.get("tech_stack", "")
            extra = [t for t in ww if t not in (existing_stack or "")]
            if extra:
                tech["tech_stack"] = ", ".join(filter(None, [existing_stack] + extra))
            cats = _categorise_tech(ww)
            for k, v in cats.items():
                if v and not tech.get(k):
                    tech[k] = v

    # Parse tech_stack string into categories if not already done
    if result.get("reachable"):
        tech = result.setdefault("technology", {})
        raw_list = tech.pop("_raw_tech_list", [])
        if raw_list:
            cats = _categorise_tech(raw_list)
            for k, v in cats.items():
                if v and not tech.get(k):
                    tech[k] = v

    return result


async def _probe_with_httpx_tool(value: str) -> dict:
    """
    Live-probe via ProjectDiscovery httpx binary.
    Returns structured technology with categories.
    """
    from workers.tasks_scan import _resolve_tool_binary, _run_limited_command

    binary = _resolve_tool_binary("httpx")
    result = await _run_limited_command(
        [binary, "-u", value,
         "-status-code", "-title", "-tech-detect",
         "-server", "-content-type",
         "-json", "-silent", "-timeout", "8"],
        timeout=20,
    )
    for line in (result.get("stdout_tail") or "").splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue

        url = entry.get("url") or f"http://{value}"
        parsed = urlparse(url)
        port = parsed.port or (443 if parsed.scheme == "https" else 80)

        tech_list: list[str] = entry.get("tech") or []
        if isinstance(tech_list, str):
            tech_list = [t.strip() for t in tech_list.split(",") if t.strip()]

        cats = _categorise_tech(tech_list)
        technology = {
            "server": entry.get("webserver") or cats.get("server"),
            "title": entry.get("title"),
            "status_code": entry.get("status_code"),
            "content_type": entry.get("content_type"),
            "tech_stack": ", ".join(tech_list) if tech_list else None,
            "cdn": cats["cdn"],
            "waf": cats["waf"],
            "cms": cats["cms"],
            "frameworks": cats["frameworks"],
            "language": cats["language"],
        }
        # Drop None values
        technology = {k: v for k, v in technology.items() if v is not None and v != []}

        return {
            "reachable": True,
            "technology": technology,
            "ports_services": {
                str(port): {
                    "url": url,
                    "scheme": parsed.scheme,
                    "status_code": entry.get("status_code"),
                    "service": "https" if parsed.scheme == "https" else "http",
                }
            },
        }
    return {"reachable": False}


async def _probe_with_whatweb(value: str) -> list[str]:
    """Run whatweb and return a list of detected technology strings."""
    from workers.tasks_scan import _resolve_tool_binary, _run_limited_command

    binary = _resolve_tool_binary("whatweb")
    url = value if value.startswith(("http://", "https://")) else f"http://{value}"
    result = await _run_limited_command(
        [binary, "--log-brief=/dev/stdout", "--quiet", url],
        timeout=15,
    )
    output = result.get("stdout_tail") or ""
    # whatweb brief format: URL STATUS   Tech1, Tech2[details], ...
    techs: list[str] = []
    for line in output.splitlines():
        parts = line.split(None, 2)
        if len(parts) >= 3:
            for item in parts[2].split(","):
                t = item.strip().split("[")[0].strip()
                if t:
                    techs.append(t)
    return techs


async def _probe_with_python_client(value: str, asset_type: str) -> dict:
    """Fallback HTTP probe when httpx binary isn't installed."""
    try:
        import httpx as httpx_client

        urls = _probe_urls(value, asset_type)
        async with httpx_client.AsyncClient(timeout=5.0, follow_redirects=False, trust_env=False) as client:
            for url in urls:
                try:
                    response = await client.get(url)
                except Exception:
                    continue
                headers = response.headers
                parsed = urlparse(url)
                port = parsed.port or (443 if parsed.scheme == "https" else 80)
                server = headers.get("server")
                powered_by = headers.get("x-powered-by")
                content_type = headers.get("content-type")

                tech_list: list[str] = [t for t in [server, powered_by] if t]
                cats = _categorise_tech(tech_list)

                technology = {
                    "server": server or cats.get("server"),
                    "x_powered_by": powered_by,
                    "content_type": content_type,
                    "status_code": response.status_code,
                }
                if cats["cdn"]:
                    technology["cdn"] = cats["cdn"]
                if cats["waf"]:
                    technology["waf"] = cats["waf"]
                technology = {k: v for k, v in technology.items() if v is not None}

                return {
                    "reachable": True,
                    "technology": technology,
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
        logger.warning("Fallback probe failed for %s: %s", value, exc)
    return {"reachable": False}


def _probe_urls(value: str, asset_type: str) -> list[str]:
    if value.startswith(("http://", "https://")):
        return [value]
    host = value.split(":", 1)[0] if asset_type == "service" else value
    if asset_type == "service" and ":" in value:
        port = value.rsplit(":", 1)[1]
        return [f"https://{host}:{port}/", f"http://{host}:{port}/"]
    return [f"https://{host}/", f"http://{host}/", f"http://{host}:8080/", f"http://{host}:8082/"]


# ─────────────────────────────────────────────────────────────────────────────
# Target normalisation helpers
# ─────────────────────────────────────────────────────────────────────────────

def _normalize_target(target: str, target_type: str | None = None) -> list:
    """Normalize a target string into a list of (asset_type, value) tuples."""
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
    elif target_type == "cidr" or ("/" in target and all(c in "0123456789./" for c in target)):
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


def _target_is_within_asset_scope(target: str, asset) -> bool:
    requested = target.strip()
    approved = str(asset.value).strip()
    if requested.rstrip("/").lower() == approved.rstrip("/").lower():
        return True

    try:
        requested_network = ip_network(requested, strict=False)
    except ValueError:
        requested_network = None
    try:
        approved_network = ip_network(approved, strict=False)
    except ValueError:
        approved_network = None
    if requested_network and approved_network and requested_network.version == approved_network.version:
        return requested_network.subnet_of(approved_network)

    requested_host = _target_host(requested)
    approved_host = _target_host(approved)
    return (
        requested_host is not None
        and requested_host == approved_host
        and asset.asset_type in {"domain", "subdomain", "ip_address", "cidr"}
    )


def _target_host(value: str) -> str | None:
    try:
        return str(ip_address(value)).lower()
    except ValueError:
        parsed = urlparse(value if "://" in value else f"//{value}")
        return parsed.hostname.lower() if parsed.hostname else None
