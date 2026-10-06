"""
NoovaStack VAPT Platform - Scan Execution Tasks
"""
import asyncio
import json
import logging
import shutil
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import urlparse
from celery import shared_task
from scans.tools import EXTERNAL_TOOL_MODULES, MODULE_TO_TOOL

APP_ROOT = Path(__file__).resolve().parents[1]
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))

logger = logging.getLogger(__name__)

MODULE_TOOL_ALIASES = {
    "tls_services": "sslscan",
    "dependency_scan": "pip_audit",
}


@shared_task(name="workers.tasks_scan.run_scan", bind=True)
def run_scan(self, scan_id: str):
    """Execute a scan with the configured modules."""
    logger.info(f"Starting scan: {scan_id}")
    loop = asyncio.new_event_loop()
    try:
        result = loop.run_until_complete(_execute_scan(scan_id))
        return result
    except Exception as e:
        logger.error(f"Scan {scan_id} failed: {e}")
        loop.run_until_complete(_update_scan_status(scan_id, "failed"))
        return {"status": "failed", "error": str(e)}
    finally:
        loop.close()


async def _execute_scan(scan_id: str) -> dict:
    from database import AsyncSessionLocal
    from database.models import Approval, Asset, AuditLog, Engagement, Scan, ScanAsset, ScanModule, ScanProfile
    from safety import SafetyContext, is_safe
    from sqlalchemy import select

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Scan).where(Scan.id == scan_id))
        scan = result.scalar_one_or_none()
        if not scan:
            return {"status": "error", "message": "Scan not found"}

        scan_asset_result = await session.execute(
            select(ScanAsset).where(ScanAsset.scan_id == scan_id)
        )
        scan_assets = list(scan_asset_result.scalars().all())
        asset_ids = [item.asset_id for item in scan_assets]
        assets = []
        if asset_ids:
            asset_result = await session.execute(select(Asset).where(Asset.id.in_(asset_ids)))
            assets = list(asset_result.scalars().all())

        reasons = []
        if not scan_assets:
            reasons.append("Select at least one approved in-scope asset.")
        if len(assets) != len(set(asset_ids)):
            reasons.append("One or more selected assets do not exist.")
        for asset in assets:
            if asset.project_id != scan.project_id:
                reasons.append(f"Asset {asset.value} does not belong to the scan project.")
            if asset.scope_status != "in_scope" or asset.approval_status != "approved":
                reasons.append(f"Asset {asset.value} is not approved and in scope.")

        engagement = None
        if scan.engagement_id:
            engagement_result = await session.execute(
                select(Engagement).where(Engagement.id == scan.engagement_id)
            )
            engagement = engagement_result.scalar_one_or_none()
            if not engagement or engagement.project_id != scan.project_id:
                reasons.append("Selected engagement does not exist in the scan project.")
            elif engagement.authorization_status != "authorized":
                reasons.append("Selected engagement is not authorized.")
            elif engagement.end_date and engagement.end_date < datetime.utcnow():
                reasons.append("Selected engagement authorization is expired.")

        profile = None
        if scan.scan_profile_id:
            profile_result = await session.execute(
                select(ScanProfile).where(ScanProfile.id == scan.scan_profile_id)
            )
            profile = profile_result.scalar_one_or_none()
            if not profile or not profile.enabled:
                reasons.append("Selected scan profile is not enabled.")

        approval_result = await session.execute(
            select(Approval).where(Approval.scan_id == scan.id, Approval.status == "approved")
        )
        approvals = [
            approval for approval in approval_result.scalars().all()
            if approval.approved_by
            and (not approval.expires_at or approval.expires_at > datetime.utcnow())
        ]
        is_approved = bool(approvals)
        approval_required = True  # Every scan requires Security Team approval before it can run.
        if approval_required and not is_approved:
            reasons.append("Required scan approval has not been granted or has expired.")

        prohibited_actions = {
            "denial_of_service", "brute_force", "credential_theft", "malware",
            "persistent_access", "data_exfiltration", "production_data_modification",
            "unauthorized_pivoting",
        }
        selected_actions = set((scan.config or {}).get("advanced_options") or [])
        blocked_actions = sorted(selected_actions.intersection(prohibited_actions))
        if blocked_actions:
            reasons.append("Prohibited actions selected: " + ", ".join(blocked_actions))

        for asset in assets:
            safe, asset_reasons = is_safe(SafetyContext(
                scan_id=scan_id,
                project_id=str(scan.project_id),
                engagement_id=str(scan.engagement_id) if scan.engagement_id else None,
                assessment_mode=scan.assessment_mode,
                scan_depth=scan.scan_depth,
                target=str(asset.value),
                testing_window_start=engagement.testing_window_start if engagement else None,
                testing_window_end=engagement.testing_window_end if engagement else None,
                is_approved=is_approved,
                scope_is_approved=(
                    asset.project_id == scan.project_id
                    and asset.scope_status == "in_scope"
                    and asset.approval_status == "approved"
                ),
            ))
            if not safe:
                reasons.extend(f"{asset.value}: {reason}" for reason in asset_reasons)

        if reasons:
            scan.status = "blocked"
            await session.commit()
            return {"status": "blocked", "reasons": list(dict.fromkeys(reasons))}

        scan.status = "running"
        scan.started_at = datetime.utcnow()
        scan.progress = 0

        mods = await session.execute(
            select(ScanModule).where(ScanModule.scan_id == scan_id)
        )
        modules = list(mods.scalars().all())

        if not modules:
            modules = [
                ScanModule(scan_id=scan_id, module_name="basic_scan", status="pending"),
                ScanModule(scan_id=scan_id, module_name="report_generation", status="pending"),
            ]
            for m in modules:
                session.add(m)
            await session.flush()

        total_modules = len(modules)
        # Execute modules
        completed = 0
        for module in modules:
            module.status = "running"
            module.started_at = datetime.utcnow()
            await session.commit()

            try:
                module_output = await _run_module(module.module_name, scan, asset_ids, session)
                module.status = "completed"
                module.output = module_output
                module.completed_at = datetime.utcnow()
            except Exception as e:
                module.status = "failed"
                module.error = str(e)
                module.completed_at = datetime.utcnow()
                logger.error(f"Module {module.module_name} failed: {e}")

            completed += 1
            scan.progress = int((completed / total_modules) * 100)
            await session.commit()

        scan.status = "completed"
        scan.completed_at = datetime.utcnow()
        scan.progress = 100
        session.add(AuditLog(
            project_id=scan.project_id,
            scan_id=scan.id,
            actor_id=scan.requested_by,
            event_type="scan",
            action="scan_completed",
            details={
                "modules_completed": completed,
                "total_modules": total_modules,
                "total_findings": (scan.results_summary or {}).get("total_findings"),
                "message": "Scan completed. The report is ready to view and export.",
            },
        ))
        await session.commit()

        return {
            "status": "completed",
            "scan_id": scan_id,
            "modules_completed": completed,
            "total_modules": total_modules,
        }


async def _run_module(module_name: str, scan, asset_ids, session) -> dict:
    """Execute a single safe scan module."""
    from database.models import Asset
    from sqlalchemy import select
    import httpx

    results = {"module": module_name, "checks_performed": 0, "issues_found": 0}

    if module_name in ("passive_asset_discovery", "asset_discovery", "tcp_port_scan", "service_detection", "version_detection", "host_discovery"):
        results = await _run_service_discovery(module_name, scan, asset_ids, session)
    elif module_name in ("wapiti_scan", "wapiti", "owasp_top_10"):
        results = await _run_wapiti_scan(module_name, scan, asset_ids, session)
    elif module_name in ("basic_scan", "http_probe", "security_headers", "tls_check", "safe_nuclei_templates", "technology_detection"):
        observations = []
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=False, trust_env=False) as client:
            for asset_id in asset_ids:
                asset_result = await session.execute(select(Asset).where(Asset.id == asset_id))
                asset = asset_result.scalar_one_or_none()
                if not asset or not str(asset.value).startswith(("http://", "https://")):
                    continue

                results["checks_performed"] += 1
                try:
                    response = await client.get(asset.value)
                except Exception as exc:
                    error_message = str(exc) or exc.__class__.__name__
                    observations.append({"asset": str(asset_id), "url": asset.value, "error": error_message})
                    if module_name in ("basic_scan", "http_probe"):
                        await _add_finding(
                            session,
                            scan.id,
                            asset_id,
                            "Target Not Reachable",
                            f"NoovaStack could not connect to the approved target URL {asset.value}. The service may be stopped, blocked by a firewall, bound to another port, or unavailable from the scanner network. Error: {error_message}.",
                            "informational",
                            "A05:2021 - Security Misconfiguration",
                            "CWE-754",
                            0.0,
                            "Confirm the correct host and port, ensure the application is running, and allow the scanner network to reach the approved target before running deeper checks.",
                            "safe_http_reachability_check",
                        )
                        results["issues_found"] += 1
                    continue

                headers = {key.lower(): value for key, value in response.headers.items()}
                observations.append({
                    "asset": str(asset_id),
                    "url": asset.value,
                    "status_code": response.status_code,
                    "headers": dict(response.headers),
                })

                if module_name in ("basic_scan", "security_headers", "safe_nuclei_templates"):
                    missing = [
                        header for header in [
                            "content-security-policy",
                            "x-frame-options",
                            "x-content-type-options",
                            "referrer-policy",
                            "permissions-policy",
                        ] if header not in headers
                    ]
                    if missing:
                        await _add_finding(
                            session,
                            scan.id,
                            asset_id,
                            "Missing Browser Security Headers",
                            "The application response is missing security headers that help browsers block clickjacking, content injection, MIME sniffing, and privacy leaks.",
                            "medium",
                            "A05:2021 - Security Misconfiguration",
                            "CWE-693",
                            5.3,
                            "Add a Content-Security-Policy, X-Frame-Options or frame-ancestors, X-Content-Type-Options, Referrer-Policy, and Permissions-Policy suited to the application.",
                            "safe_http_header_check",
                        )
                        results["issues_found"] += 1

                    if "x-powered-by" in headers:
                        await _add_finding(
                            session,
                            scan.id,
                            asset_id,
                            "Framework Version Disclosure Header",
                            f"The application exposes the X-Powered-By header value: {headers['x-powered-by']}. This reveals implementation details that are not needed by normal users.",
                            "low",
                            "A05:2021 - Security Misconfiguration",
                            "CWE-200",
                            3.1,
                            "Disable or remove the X-Powered-By header in the application server or framework configuration.",
                            "safe_http_header_check",
                        )
                        results["issues_found"] += 1

                    server_header = headers.get("server")
                    if server_header:
                        await _add_finding(
                            session,
                            scan.id,
                            asset_id,
                            "Server Header Disclosure",
                            f"The application exposes the Server header value: {server_header}. This may reveal server implementation details to unauthenticated users.",
                            "low",
                            "A05:2021 - Security Misconfiguration",
                            "CWE-200",
                            3.1,
                            "Reduce or remove detailed Server headers at the application server or reverse proxy layer.",
                            "safe_http_header_check",
                        )
                        results["issues_found"] += 1

                    for cookie in response.headers.get_list("set-cookie"):
                        cookie_lower = cookie.lower()
                        missing_cookie_attrs = [
                            attr for attr in ["httponly", "samesite"]
                            if attr not in cookie_lower
                        ]
                        if str(asset.value).startswith("https://") and "secure" not in cookie_lower:
                            missing_cookie_attrs.append("secure")
                        if missing_cookie_attrs:
                            await _add_finding(
                                session,
                                scan.id,
                                asset_id,
                                "Cookie Missing Recommended Security Attributes",
                                f"A response cookie is missing recommended attributes: {', '.join(sorted(set(missing_cookie_attrs)))}. Cookie values are not stored in the report.",
                                "medium",
                                "A05:2021 - Security Misconfiguration",
                                "CWE-614",
                                5.0,
                                "Set HttpOnly and SameSite on session cookies. Set Secure when serving over HTTPS.",
                                "safe_cookie_attribute_check",
                            )
                            results["issues_found"] += 1

                if module_name in ("basic_scan", "tls_check") and str(asset.value).startswith("http://"):
                    await _add_finding(
                        session,
                        scan.id,
                        asset_id,
                        "Application Served Over Plain HTTP",
                        "The target is reachable over unencrypted HTTP. Credentials, session cookies, and sensitive data can be exposed if users access the application without HTTPS.",
                        "medium",
                        "A02:2021 - Cryptographic Failures",
                        "CWE-319",
                        6.5,
                        "Serve the application over HTTPS, redirect HTTP to HTTPS, and enable HSTS after HTTPS is working correctly.",
                        "safe_http_transport_check",
                    )
                    results["issues_found"] += 1

        results["observations"] = observations
    elif module_name in ("cve_enrichment", "known_vulnerabilities"):
        results = await _run_cve_enrichment(module_name, scan, asset_ids, session)
    elif module_name in MODULE_TOOL_ALIASES:
        results = await _run_external_tool_module(MODULE_TOOL_ALIASES[module_name], scan, asset_ids, session)
        results["module"] = module_name
    elif module_name in EXTERNAL_TOOL_MODULES:
        results = await _run_external_tool_module(module_name, scan, asset_ids, session)
    elif module_name == "container_scan":
        results = await _run_container_image_scan(scan, asset_ids, session)
    elif module_name == "evidence_collection":
        results = await _run_evidence_collection(scan, asset_ids, session)
    elif module_name == "report_generation":
        results = await _run_report_generation(scan, session)
    elif module_name == "ai_analysis":
        results = await _run_ai_analysis(scan, session)
    elif module_name == "api_discovery":
        results = await _run_api_discovery(scan, asset_ids, session)
    elif module_name == "authentication_testing":
        results = await _run_authentication_testing(scan, asset_ids, session)
    elif module_name == "rate_limiting_check":
        results = await _run_rate_limiting_check(scan, asset_ids, session)
    elif module_name == "input_validation":
        results = await _run_input_validation_check(scan, asset_ids, session)
    elif module_name == "token_handling":
        results = await _run_token_handling_check(scan, asset_ids, session)
    elif module_name == "owasp_api_top_10":
        results = await _run_owasp_api_check(scan, asset_ids, session)
    elif module_name == "controlled_validation":
        results = await _run_controlled_validation(scan, session)

    return results


def _asset_host_and_url(asset_value: str) -> tuple[str | None, str | None]:
    parsed = urlparse(asset_value if "://" in asset_value else f"http://{asset_value}")
    return parsed.hostname, parsed.geturl()


async def _probe_port(host: str, port: int, timeout: float = 2.0) -> bool:
    try:
        reader, writer = await asyncio.wait_for(asyncio.open_connection(host, port), timeout=timeout)
        writer.close()
        await writer.wait_closed()
        return True
    except Exception:
        return False


async def _run_service_discovery(module_name: str, scan, asset_ids, session) -> dict:
    from database.models import Asset
    from sqlalchemy import select
    import httpx

    default_ports = [80, 443, 3000, 5000, 8000, 8080, 8081, 8082, 8443]
    configured_ports = (scan.config or {}).get("ports") or default_ports
    observations = []
    issues_found = 0
    nmap_bin = shutil.which("nmap")

    async with httpx.AsyncClient(timeout=5.0, follow_redirects=False, trust_env=False) as client:
        for asset_id in asset_ids:
            asset_result = await session.execute(select(Asset).where(Asset.id == asset_id))
            asset = asset_result.scalar_one_or_none()
            if not asset:
                continue

            host, _ = _asset_host_and_url(str(asset.value))
            if not host:
                continue

            if nmap_bin:
                open_ports = await _run_nmap_probe(nmap_bin, host, configured_ports)
            else:
                open_ports = await _run_native_port_probe(host, configured_ports)

            for item in open_ports:
                if item.get("service") not in ("http", "https"):
                    continue
                try:
                    response = await client.get(item["url"])
                    item["status_code"] = response.status_code
                    item["server"] = response.headers.get("server")
                    item["x_powered_by"] = response.headers.get("x-powered-by")
                except Exception as exc:
                    item["http_probe_error"] = str(exc) or exc.__class__.__name__

            observations.append({"asset": str(asset_id), "host": host, "open_ports": open_ports})
            if open_ports:
                await _add_finding(
                    session,
                    scan.id,
                    asset_id,
                    "Open TCP Services Discovered",
                    "NoovaStack discovered reachable TCP services: " + ", ".join(f"{item['port']}/{item['service']}" for item in open_ports) + ".",
                    "informational",
                    "A05:2021 - Security Misconfiguration",
                    "CWE-200",
                    0.0,
                    "Review exposed services and close ports that are not required for the application or testing scope.",
                    "tcp_service_discovery",
                )
                issues_found += 1

    return {
        "module": module_name,
        "tool": "nmap" if nmap_bin else "native_tcp_probe",
        "checks_performed": len(asset_ids) * len(configured_ports),
        "issues_found": issues_found,
        "observations": observations,
    }


async def _run_native_port_probe(host: str, configured_ports: list[int]) -> list[dict]:
    open_ports = []
    for port in configured_ports:
        port = int(port)
        if await _probe_port(host, port):
            service = "https" if port in (443, 8443) else "http" if port in (80, 3000, 5000, 8000, 8080, 8081, 8082) else "unknown"
            scheme = "https" if service == "https" else "http"
            url = f"{scheme}://{host}:{port}/"
            if scheme == "http" and port == 80:
                url = f"http://{host}/"
            if scheme == "https" and port == 443:
                url = f"https://{host}/"
            open_ports.append({"port": port, "service": service, "url": url})
    return open_ports


async def _run_nmap_probe(nmap_bin: str, host: str, configured_ports: list[int]) -> list[dict]:
    ports = ",".join(str(int(port)) for port in configured_ports)
    process = await asyncio.create_subprocess_exec(
        nmap_bin,
        "-Pn",
        "-sT",
        "-sV",
        "--version-light",
        "-p",
        ports,
        "-oX",
        "-",
        host,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await process.communicate()
    if process.returncode not in (0, 1) or not stdout:
        return await _run_native_port_probe(host, configured_ports)

    open_ports = []
    try:
        root = ET.fromstring(stdout.decode("utf-8", errors="ignore"))
    except ET.ParseError:
        return await _run_native_port_probe(host, configured_ports)

    for port_node in root.findall(".//port"):
        state_node = port_node.find("state")
        if state_node is None or state_node.attrib.get("state") != "open":
            continue
        port = int(port_node.attrib["portid"])
        service_node = port_node.find("service")
        service_name = service_node.attrib.get("name", "unknown") if service_node is not None else "unknown"
        product = service_node.attrib.get("product") if service_node is not None else None
        version = service_node.attrib.get("version") if service_node is not None else None
        tunnel = service_node.attrib.get("tunnel") if service_node is not None else None
        is_https = tunnel == "ssl" or service_name in ("https", "ssl/http") or port in (443, 8443)
        is_http = is_https or service_name in ("http", "http-proxy") or port in (80, 3000, 5000, 8000, 8080, 8081, 8082)
        service = "https" if is_https else "http" if is_http else service_name
        scheme = "https" if service == "https" else "http"
        url = f"{scheme}://{host}:{port}/"
        if scheme == "http" and port == 80:
            url = f"http://{host}/"
        if scheme == "https" and port == 443:
            url = f"https://{host}/"
        open_ports.append({
            "port": port,
            "service": service,
            "url": url,
            "nmap_service": service_name,
            "product": product,
            "version": version,
        })
    return open_ports


async def _run_external_tool_module(module_name: str, scan, asset_ids, session) -> dict:
    from database.models import Asset
    from sqlalchemy import select

    tool = MODULE_TO_TOOL.get(module_name, {})
    tool_id = tool.get("id", module_name)
    binary = _resolve_tool_binary(tool_id)
    if not binary:
        return {
            "module": module_name,
            "tool": tool_id,
            "status": "skipped",
            "checks_performed": 0,
            "issues_found": 0,
            "message": f"{tool.get('name', tool_id)} is not installed in the scanner image.",
        }

    if tool_id in ("dalfox", "sqlmap") and not (scan.config or {}).get("enable_intrusive_tools"):
        return {
            "module": module_name,
            "tool": tool_id,
            "status": "skipped",
            "checks_performed": 0,
            "issues_found": 0,
            "message": f"{tool.get('name', tool_id)} is available but requires enable_intrusive_tools=true.",
        }

    observations = []
    issues_found = 0
    for asset_id in asset_ids:
        asset_result = await session.execute(select(Asset).where(Asset.id == asset_id))
        asset = asset_result.scalar_one_or_none()
        if not asset:
            continue
        cmd = _external_tool_command(binary, tool_id, str(asset.value), scan.config or {})
        if not cmd:
            continue
        observation = await _run_limited_command(cmd, timeout=int((scan.config or {}).get("tool_timeout_seconds", 60)))
        observation.update({"asset": str(asset_id), "target": str(asset.value), "tool": tool_id})
        observations.append(observation)
        issues_found += await _ingest_tool_findings(session, scan, asset, tool_id, observation)

    return {
        "module": module_name,
        "tool": tool_id,
        "checks_performed": len(observations),
        "issues_found": issues_found,
        "observations": observations,
    }


def _resolve_tool_binary(tool_id: str) -> str | None:
    aliases = {
        "testssl": ["testssl.sh", "testssl"],
        "pip-audit": ["pip-audit"],
        "httpx": ["httpx-pd", "httpx"],
        "zap": ["zap.sh", "zaproxy", "zap"],
        "scoutsuite": ["scout", "scoutsuite"],
        "shodan": ["shodan"],
        "masscan": ["masscan"],
        "prowler": ["prowler"],
        "arjun": ["arjun"],
    }
    for candidate in aliases.get(tool_id, [tool_id]):
        path = shutil.which(candidate)
        if path:
            return path
    return None


_ALLOWED_REPO_ROOTS = [Path("/repos"), Path("/app/repos"), Path("/workspace")]


def _validate_repo_path(raw: str) -> str | None:
    """Return resolved path only if it falls under an allowed root; else None."""
    try:
        resolved = Path(raw).resolve()
    except (TypeError, ValueError, OSError):
        return None
    for root in _ALLOWED_REPO_ROOTS:
        try:
            resolved.relative_to(root)
            return str(resolved)
        except ValueError:
            continue
    logger.warning("repo_path '%s' rejected: outside allowed roots", raw)
    return None


def _external_tool_command(binary: str, tool_id: str, target: str, config: dict) -> list[str] | None:
    host, url = _asset_host_and_url(target)
    _raw_repo = config.get("repository_path") or config.get("repo_path")
    repo_path = _validate_repo_path(_raw_repo) if _raw_repo else None
    if tool_id == "curl" and url:
        method = str(config.get("http_method") or "GET").upper()
        if method not in ("GET", "HEAD", "OPTIONS"):
            method = "GET"
        return [binary, "-i", "-L", "--max-redirs", "3", "--connect-timeout", "5", "--max-time", "15", "-X", method, url]
    if tool_id == "subfinder" and host and not _looks_like_ip_address(host):
        return [binary, "-d", host, "-silent", "-all", "-timeout", "15"]
    if tool_id == "gobuster" and url:
        wordlist = config.get("wordlist") or _first_existing_path([
            "/usr/share/wordlists/dirb/common.txt",
            "/usr/share/seclists/Discovery/Web-Content/common.txt",
            "/usr/share/wordlists/raft-small-words.txt",
        ])
        if not wordlist:
            return None
        return [binary, "dir", "-u", url, "-w", str(wordlist), "-q", "-k", "-t", "5", "--delay", "333ms", "--timeout", "10s"]
    if tool_id == "nuclei" and url:
        return [binary, "-u", url, "-severity", "low,medium,high,critical", "-rate-limit", "5", "-timeout", "5", "-retries", "0", "-jsonl"]
    if tool_id == "nikto" and url:
        return [binary, "-host", url, "-nointeractive", "-maxtime", str(int(config.get("nikto_max_time", 60)))]
    if tool_id == "whatweb" and url:
        return [binary, "--no-errors", url]
    if tool_id == "testssl" and host:
        return [binary, "--fast", "--warnings", "off", host]
    if tool_id == "sslscan" and host:
        return [binary, "--no-failed", host]
    if tool_id == "naabu" and host:
        return [binary, "-host", host, "-rate", "100", "-silent"]
    if tool_id == "httpx" and url:
        return [binary, "-u", url, "-status-code", "-title", "-tech-detect", "-json", "-silent"]
    if tool_id == "dnsx" and host and not _looks_like_ip_address(host):
        return [binary, "-d", host, "-silent", "-a", "-aaaa", "-cname", "-json"]
    if tool_id == "katana" and url:
        return [binary, "-u", url, "-silent", "-d", "1", "-jc", "-jsonl"]
    if tool_id == "dalfox" and url:
        return [binary, "url", url, "--skip-bav", "--timeout", "10", "--format", "json"]
    if tool_id == "ffuf" and url:
        wordlist = config.get("wordlist") or _first_existing_path([
            "/usr/share/seclists/Discovery/Web-Content/common.txt",
            "/usr/share/wordlists/dirb/common.txt",
            "/usr/share/wordlists/raft-small-words.txt",
        ])
        if not wordlist:
            return None
        return [binary, "-u", url.rstrip("/") + "/FUZZ", "-w", str(wordlist), "-mc", "200,301,302,401,403,500", "-t", "5", "-timeout", "10"]
    if tool_id == "sqlmap" and url:
        return [binary, "-u", url, "--batch", "--level", "1", "--risk", "1", "--smart", "--crawl", "0"]
    if tool_id == "semgrep" and repo_path:
        return [binary, "--config", "auto", "--json", repo_path]
    if tool_id == "bandit" and repo_path:
        return [binary, "-r", repo_path, "-f", "json"]
    if tool_id == "pip-audit" and repo_path:
        return [binary, "--path", repo_path, "--format", "json"]
    if tool_id == "depx" and repo_path:
        return [binary, "audit", repo_path, "--json", "--require-clean", "--disable-update-check"]
    if tool_id == "trivy" and repo_path:
        return [binary, "fs", "--format", "json", repo_path]
    if tool_id == "grype" and repo_path:
        return [binary, repo_path, "-o", "json"]
    # API security
    if tool_id == "zap" and url:
        return [binary, "-cmd", "-quickurl", url, "-quickprogress", "-quickout", "/tmp/zap_report.json"]
    if tool_id == "arjun" and url:
        return [binary, "-u", url, "--stable", "-oJ", "/dev/stdout"]
    # Cloud & infrastructure
    if tool_id == "prowler":
        provider = config.get("cloud_provider", "aws")
        return [binary, provider, "--no-banner", "-M", "json"]
    if tool_id == "scoutsuite":
        provider = config.get("cloud_provider", "aws")
        return [binary, provider, "--no-browser", "--result-format", "json"]
    # Network analysis
    if tool_id == "masscan" and host:
        ports = config.get("port_range", "1-65535")
        rate = str(config.get("masscan_rate", 500))
        return [binary, host, "-p", ports, "--rate", rate, "-oJ", "/dev/stdout"]
    if tool_id == "shodan" and host and not _looks_like_ip_address(host):
        return [binary, "domain", host]
    if tool_id == "shodan" and host and _looks_like_ip_address(host):
        return [binary, "host", host]
    return None


def _looks_like_ip_address(host: str) -> bool:
    parts = host.split(".")
    return len(parts) == 4 and all(part.isdigit() and 0 <= int(part) <= 255 for part in parts)


def _first_existing_path(paths: list[str]) -> str | None:
    for path in paths:
        if Path(path).exists():
            return path
    return None


async def _run_limited_command(cmd: list[str], timeout: int = 60) -> dict:
    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=max(5, timeout))
        return {
            "command": [Path(cmd[0]).name, *cmd[1:]],
            "return_code": process.returncode,
            "stdout_tail": stdout.decode("utf-8", errors="ignore")[-4000:],
            "stderr_tail": stderr.decode("utf-8", errors="ignore")[-2000:],
        }
    except asyncio.TimeoutError:
        return {"command": [Path(cmd[0]).name, *cmd[1:]], "return_code": None, "error": "Tool timed out"}
    except Exception as exc:
        return {"command": [Path(cmd[0]).name, *cmd[1:]], "return_code": None, "error": str(exc)}


async def _run_cve_enrichment(module_name: str, scan, asset_ids, session) -> dict:
    from database.models import Asset, CVERecord, ScanModule
    from sqlalchemy import select

    asset_result = await session.execute(select(Asset).where(Asset.id.in_(asset_ids)))
    assets = asset_result.scalars().all()
    module_result = await session.execute(select(ScanModule).where(ScanModule.scan_id == scan.id))
    modules = module_result.scalars().all()
    keywords = _cve_keywords_from_assets_and_modules(assets, modules)
    matches = []
    issues_found = 0

    for keyword in keywords[:20]:
        if len(keyword) < 4:
            continue
        result = await session.execute(
            select(CVERecord)
            .where(CVERecord.description.ilike(f"%{keyword}%"))
            .order_by(CVERecord.published_at.desc())
            .limit(5)
        )
        for cve in result.scalars().all():
            matches.append({"keyword": keyword, "cve_id": cve.id, "severity": cve.severity, "cvss_score": cve.cvss_score})
            if cve.severity in ("critical", "high") and assets:
                await _add_finding(
                    session,
                    scan.id,
                    assets[0].id,
                    f"Potential CVE Exposure: {cve.id}",
                    f"The synced CVE database contains {cve.id} matching observed technology keyword '{keyword}'. Validate whether the affected product/version is present before remediation tracking.",
                    "high" if cve.severity == "critical" else cve.severity,
                    "A06:2021 - Vulnerable and Outdated Components",
                    (cve.cwes or ["CWE-1104"])[0],
                    cve.cvss_score or 0.0,
                    "Confirm the affected product and version, then upgrade or apply the vendor mitigation referenced by the CVE advisory.",
                    "cve_enrichment",
                    {"cve_id": cve.id, "keyword": keyword, "references": (cve.references or [])[:5]},
                    "cve_correlation",
                )
                issues_found += 1

    return {"module": module_name, "tool": "local_cve_database", "checks_performed": len(keywords), "issues_found": issues_found, "matches": matches[:50]}


def _cve_keywords_from_assets_and_modules(assets: list, modules: list) -> list[str]:
    keywords = set()
    ignored = {"http", "https", "unknown", "nginx", "apache"}
    for asset in assets:
        technology = asset.technology or {}
        for value in technology.values() if isinstance(technology, dict) else []:
            for token in str(value).replace("/", " ").replace(";", " ").split():
                if token.lower() not in ignored and not token.replace(".", "").isdigit():
                    keywords.add(token.strip().lower())
    for module in modules:
        output = module.output or {}
        for observation in output.get("observations") or []:
            for port in observation.get("open_ports") or []:
                for key in ("product", "version", "server", "x_powered_by", "nmap_service"):
                    value = port.get(key)
                    if value and str(value).lower() not in ignored:
                        keywords.add(str(value).split()[0].strip().lower())
    return sorted(keywords)


async def _run_wapiti_scan(module_name: str, scan, asset_ids, session) -> dict:
    from database.models import Asset
    from sqlalchemy import select

    wapiti_bin = shutil.which("wapiti") or shutil.which("wapiti3")
    observations = []
    issues_found = 0
    if not wapiti_bin:
        return {
            "module": module_name,
            "tool": "wapiti",
            "status": "skipped",
            "checks_performed": 0,
            "issues_found": 0,
            "message": "Wapiti is not installed in the scanner image.",
        }

    for asset_id in asset_ids:
        asset_result = await session.execute(select(Asset).where(Asset.id == asset_id))
        asset = asset_result.scalar_one_or_none()
        if not asset or not str(asset.value).startswith(("http://", "https://")):
            continue

        with tempfile.TemporaryDirectory() as tmpdir:
            report_path = Path(tmpdir) / "wapiti.json"
            cmd = [
                wapiti_bin,
                "-u", str(asset.value),
                "-f", "json",
                "-o", str(report_path),
                "--scope", "page",
                "-d", "1",
                "--max-links-per-page", "20",
                "--max-scan-time", str(int((scan.config or {}).get("wapiti_max_scan_time", 60))),
                "--flush-session",
            ]
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await process.communicate()
            observation = {
                "asset": str(asset_id),
                "url": str(asset.value),
                "return_code": process.returncode,
                "stdout_tail": stdout.decode("utf-8", errors="ignore")[-1000:],
                "stderr_tail": stderr.decode("utf-8", errors="ignore")[-1000:],
            }

            if report_path.exists():
                try:
                    report = json.loads(report_path.read_text(encoding="utf-8"))
                    observation["report_keys"] = list(report.keys())
                    added = await _import_wapiti_findings(session, scan.id, asset_id, report)
                    issues_found += added
                    observation["imported_findings"] = added
                except Exception as exc:
                    observation["parse_error"] = str(exc)
            observations.append(observation)

    return {
        "module": module_name,
        "tool": "wapiti",
        "checks_performed": len(observations),
        "issues_found": issues_found,
        "observations": observations,
    }


async def _import_wapiti_findings(session, scan_id, asset_id, report: dict) -> int:
    vulnerabilities = report.get("vulnerabilities") or {}
    severity_map = {
        "0": "informational",
        "1": "low",
        "2": "medium",
        "3": "high",
        "4": "critical",
    }
    cvss_map = {
        "informational": 0.0,
        "low": 3.1,
        "medium": 5.3,
        "high": 7.5,
        "critical": 9.1,
    }
    imported = 0
    for category, entries in vulnerabilities.items():
        if not entries:
            continue
        for entry in entries[:20]:
            level = str(entry.get("level", "1"))
            severity = severity_map.get(level, "low")
            path = entry.get("path") or entry.get("url") or "target"
            parameter = entry.get("parameter") or "n/a"
            info = entry.get("info") or entry.get("description") or "Wapiti reported a web vulnerability candidate."
            title = f"Wapiti: {category}"
            description = f"Wapiti reported {category} at {path}. Parameter: {parameter}. Details: {info}"
            await _add_finding(
                session,
                scan_id,
                asset_id,
                title,
                description,
                severity,
                "A05:2021 - Security Misconfiguration",
                entry.get("cwe") or "CWE-200",
                cvss_map[severity],
                entry.get("solution") or "Review the affected endpoint and apply the remediation recommended by Wapiti for this vulnerability class.",
                "wapiti",
            )
            imported += 1
    return imported


_TOOL_SEVERITY_CVSS = {
    "critical": 9.8, "high": 8.1, "medium": 5.3, "low": 2.2, "info": 0.0, "informational": 0.0, "unknown": 0.0,
}


async def _run_container_image_scan(scan, asset_ids, session) -> dict:
    image = (scan.config or {}).get("container_image")
    if not image:
        return {
            "module": "container_scan", "tool": "trivy", "status": "skipped",
            "checks_performed": 0, "issues_found": 0,
            "message": "No container_image configured for this scan. Set scan.config.container_image to an approved image reference to scan it.",
        }
    binary = _resolve_tool_binary("trivy")
    if not binary:
        return {
            "module": "container_scan", "tool": "trivy", "status": "skipped",
            "checks_performed": 0, "issues_found": 0,
            "message": "Trivy is not installed in the scanner image.",
        }
    observation = await _run_limited_command(
        [binary, "image", "--format", "json", "--timeout", "120s", image],
        timeout=int((scan.config or {}).get("tool_timeout_seconds", 120)),
    )
    observation.update({"target": image, "tool": "trivy"})
    return {"module": "container_scan", "tool": "trivy", "checks_performed": 1, "issues_found": 0, "observations": [observation]}


async def _run_evidence_collection(scan, asset_ids, session) -> dict:
    from database.models import Asset
    from sqlalchemy import select
    import httpx

    captured = 0
    observations = []
    async with httpx.AsyncClient(timeout=8.0, follow_redirects=False, trust_env=False) as client:
        for asset_id in asset_ids:
            asset_result = await session.execute(select(Asset).where(Asset.id == asset_id))
            asset = asset_result.scalar_one_or_none()
            if not asset:
                continue
            value = str(asset.value)
            metadata = {"asset": value, "asset_type": asset.asset_type, "captured_at": datetime.utcnow().isoformat()}
            if value.startswith(("http://", "https://")):
                try:
                    response = await client.get(value)
                    metadata.update({"status_code": response.status_code, "headers": dict(response.headers)})
                except Exception as exc:
                    metadata["error"] = str(exc) or exc.__class__.__name__
            await _add_finding(
                session, scan.id, asset_id,
                "Evidence Snapshot Captured",
                f"A baseline evidence snapshot was captured for the approved target {value} during this scan for audit and retest comparison.",
                "informational", "A05:2021 - Security Misconfiguration", "CWE-200", 0.0,
                "No action required. This snapshot supports audit and retest comparison.",
                "evidence_collection",
                evidence_metadata=metadata,
                evidence_type="scan_evidence_snapshot",
            )
            captured += 1
            observations.append(metadata)
    return {"module": "evidence_collection", "checks_performed": captured, "issues_found": 0, "observations": observations}


async def _run_report_generation(scan, session) -> dict:
    from database.models import Finding, ScanModule
    from sqlalchemy import func, select

    severity_rows = await session.execute(
        select(Finding.severity, func.count(Finding.id)).where(Finding.scan_id == scan.id).group_by(Finding.severity)
    )
    severity_counts = {severity: count for severity, count in severity_rows.all()}

    module_rows = await session.execute(
        select(ScanModule.status, func.count(ScanModule.id)).where(ScanModule.scan_id == scan.id).group_by(ScanModule.status)
    )
    module_counts = {status: count for status, count in module_rows.all()}

    scan.results_summary = {
        **(scan.results_summary or {}),
        "generated_at": datetime.utcnow().isoformat(),
        "findings_by_severity": severity_counts,
        "total_findings": sum(severity_counts.values()),
        "modules_by_status": module_counts,
    }
    return {"module": "report_generation", "checks_performed": 1, "issues_found": 0, "summary": scan.results_summary}


async def _run_ai_analysis(scan, session) -> dict:
    from database.models import Finding
    from sqlalchemy import select
    from config import settings
    import httpx

    findings_result = await session.execute(select(Finding).where(Finding.scan_id == scan.id).limit(20))
    findings = list(findings_result.scalars().all())
    if not findings:
        return {
            "module": "ai_analysis", "status": "skipped", "checks_performed": 0, "issues_found": 0,
            "message": "No candidate findings to summarize yet.",
        }

    summary_input = [{"title": f.title, "severity": f.severity, "owasp_category": f.owasp_category} for f in findings]
    prompt = (
        "Summarize these candidate security findings from an authorized scan in 3-5 plain-language sentences "
        "for a non-technical stakeholder. These are unverified candidates, not confirmed vulnerabilities. "
        "Do not invent findings that are not listed. Findings: " + json.dumps(summary_input)
    )
    try:
        async with httpx.AsyncClient(timeout=float(settings.AI_TIMEOUT_SECONDS), trust_env=False) as client:
            response = await client.post(
                f"{settings.AI_BASE_URL.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {settings.AI_API_KEY}", "Content-Type": "application/json"},
                json={
                    "model": settings.AI_MODEL,
                    "messages": [
                        {"role": "system", "content": "You are a security report assistant. Be concise and factual."},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": settings.AI_TEMPERATURE,
                    "max_tokens": settings.AI_MAX_OUTPUT_TOKENS,
                },
            )
            response.raise_for_status()
            data = response.json()
        summary_text = (data.get("choices") or [{}])[0].get("message", {}).get("content", "").strip()
    except Exception as exc:
        return {
            "module": "ai_analysis", "status": "skipped", "checks_performed": 0, "issues_found": 0,
            "message": f"AI provider unavailable: {exc}",
        }

    scan.results_summary = {**(scan.results_summary or {}), "ai_summary": summary_text}
    return {"module": "ai_analysis", "checks_performed": len(findings), "issues_found": 0, "summary": summary_text}


async def _run_api_discovery(scan, asset_ids, session) -> dict:
    from database.models import Asset
    from sqlalchemy import select
    import httpx

    common_paths = ["/openapi.json", "/swagger.json", "/api-docs", "/v3/api-docs", "/.well-known/openapi.json", "/swagger/index.html"]
    discovered = 0
    observations = []
    async with httpx.AsyncClient(timeout=5.0, follow_redirects=True, trust_env=False) as client:
        for asset_id in asset_ids:
            asset_result = await session.execute(select(Asset).where(Asset.id == asset_id))
            asset = asset_result.scalar_one_or_none()
            if not asset or not str(asset.value).startswith(("http://", "https://")):
                continue
            base = str(asset.value).rstrip("/")
            found_paths = []
            for path in common_paths:
                try:
                    response = await client.get(base + path)
                except Exception:
                    continue
                if response.status_code == 200 and response.headers.get("content-type", "").startswith(("application/json", "text/html")):
                    found_paths.append(path)
            observations.append({"asset": str(asset_id), "target": base, "discovered_paths": found_paths})
            if found_paths:
                await _add_finding(
                    session, scan.id, asset_id,
                    "API Documentation Endpoint Discovered",
                    f"The following API documentation or schema endpoints were reachable on {base}: {', '.join(found_paths)}.",
                    "informational", "A05:2021 - Security Misconfiguration", "CWE-200", 0.0,
                    "Confirm this documentation should be publicly reachable, and remove or restrict access if it exposes internal-only API surface.",
                    "api_discovery",
                )
                discovered += 1
    return {"module": "api_discovery", "checks_performed": len(asset_ids), "issues_found": discovered, "observations": observations}


async def _run_authentication_testing(scan, asset_ids, session) -> dict:
    from database.models import Asset
    from sqlalchemy import select
    import httpx

    sensitive_paths = ["/admin", "/api/admin", "/actuator", "/actuator/health", "/.env", "/api/users", "/api/internal"]
    issues = 0
    observations = []
    async with httpx.AsyncClient(timeout=5.0, follow_redirects=False, trust_env=False) as client:
        for asset_id in asset_ids:
            asset_result = await session.execute(select(Asset).where(Asset.id == asset_id))
            asset = asset_result.scalar_one_or_none()
            if not asset or not str(asset.value).startswith(("http://", "https://")):
                continue
            base = str(asset.value).rstrip("/")
            exposed = []
            for path in sensitive_paths:
                try:
                    response = await client.get(base + path)
                except Exception:
                    continue
                if response.status_code == 200 and "www-authenticate" not in {key.lower() for key in response.headers.keys()}:
                    exposed.append({"path": path, "status_code": response.status_code})
            observations.append({"asset": str(asset_id), "target": base, "exposed_without_auth": exposed})
            if exposed:
                await _add_finding(
                    session, scan.id, asset_id,
                    "Potentially Unauthenticated Sensitive Endpoint",
                    "The following commonly sensitive paths responded with HTTP 200 and no authentication challenge on " + base
                    + ": " + ", ".join(item["path"] for item in exposed)
                    + ". This is a passive reachability observation only; manual review is required before treating this as confirmed unauthorized access.",
                    "medium", "A01:2021 - Broken Access Control", "CWE-306", 6.5,
                    "Confirm whether these paths should require authentication, and require login or network restriction if they expose internal or administrative functionality.",
                    "authentication_testing",
                )
                issues += 1
    return {"module": "authentication_testing", "checks_performed": len(asset_ids), "issues_found": issues, "observations": observations}


async def _run_rate_limiting_check(scan, asset_ids, session) -> dict:
    from database.models import Asset
    from sqlalchemy import select
    import httpx

    rate_limit_headers = {"x-ratelimit-limit", "x-ratelimit-remaining", "ratelimit-limit", "retry-after"}
    issues = 0
    observations = []
    async with httpx.AsyncClient(timeout=5.0, follow_redirects=False, trust_env=False) as client:
        for asset_id in asset_ids:
            asset_result = await session.execute(select(Asset).where(Asset.id == asset_id))
            asset = asset_result.scalar_one_or_none()
            if not asset or not str(asset.value).startswith(("http://", "https://")):
                continue
            seen_headers = set()
            for _ in range(3):
                try:
                    response = await client.get(str(asset.value))
                except Exception:
                    break
                seen_headers.update(key.lower() for key in response.headers.keys())
                await asyncio.sleep(0.5)
            matched = sorted(seen_headers & rate_limit_headers)
            observations.append({"asset": str(asset_id), "rate_limit_headers_observed": matched})
            if not matched:
                await _add_finding(
                    session, scan.id, asset_id,
                    "No Rate Limiting Headers Observed",
                    f"No standard rate-limiting response headers (e.g. RateLimit-*, Retry-After) were observed on {asset.value} across a small number of requests. "
                    "This does not confirm the absence of rate limiting, only that it is not advertised in response headers.",
                    "low", "A04:2021 - Insecure Design", "CWE-770", 3.1,
                    "Confirm whether rate limiting is enforced server-side or at a gateway/WAF layer, and expose standard rate-limit headers where practical.",
                    "rate_limiting_check",
                )
                issues += 1
    return {"module": "rate_limiting_check", "checks_performed": len(asset_ids), "issues_found": issues, "observations": observations}


async def _run_input_validation_check(scan, asset_ids, session) -> dict:
    from database.models import Asset
    from sqlalchemy import select
    import httpx

    stack_trace_markers = [
        "traceback (most recent call last)", "at java.", "stack trace:", "fatal error:",
        "unhandled exception", "django.core.exceptions", "system.exception",
    ]
    issues = 0
    observations = []
    async with httpx.AsyncClient(timeout=5.0, follow_redirects=False, trust_env=False) as client:
        for asset_id in asset_ids:
            asset_result = await session.execute(select(Asset).where(Asset.id == asset_id))
            asset = asset_result.scalar_one_or_none()
            if not asset or not str(asset.value).startswith(("http://", "https://")):
                continue
            probe_url = str(asset.value).rstrip("/") + "?noovastack_probe=" + ("9" * 200)
            try:
                response = await client.get(probe_url)
            except Exception:
                continue
            body_lower = response.text.lower()[:5000]
            leaked = [marker for marker in stack_trace_markers if marker in body_lower]
            observations.append({"asset": str(asset_id), "status_code": response.status_code, "leaked_markers": leaked})
            if leaked:
                await _add_finding(
                    session, scan.id, asset_id,
                    "Verbose Error Output on Malformed Request",
                    f"Sending an oversized query parameter to {asset.value} returned a response that appears to include internal error or stack trace details.",
                    "medium", "A05:2021 - Security Misconfiguration", "CWE-209", 5.3,
                    "Disable verbose or debug error output in production and return generic error responses to clients.",
                    "input_validation",
                )
                issues += 1
    return {"module": "input_validation", "checks_performed": len(asset_ids), "issues_found": issues, "observations": observations}


async def _run_token_handling_check(scan, asset_ids, session) -> dict:
    from database.models import Asset
    from sqlalchemy import select
    import httpx

    issues = 0
    observations = []
    async with httpx.AsyncClient(timeout=5.0, follow_redirects=False, trust_env=False) as client:
        for asset_id in asset_ids:
            asset_result = await session.execute(select(Asset).where(Asset.id == asset_id))
            asset = asset_result.scalar_one_or_none()
            if not asset or not str(asset.value).startswith(("http://", "https://")):
                continue
            try:
                response = await client.get(str(asset.value))
            except Exception:
                continue
            cache_control = response.headers.get("cache-control", "").lower()
            observations.append({"asset": str(asset_id), "cache_control": cache_control or None})
            if "no-store" not in cache_control:
                await _add_finding(
                    session, scan.id, asset_id,
                    "Missing Cache-Control: no-store",
                    f"The response from {asset.value} does not send Cache-Control: no-store. If this endpoint returns authentication tokens or session data, "
                    "shared or browser caches could retain sensitive responses.",
                    "low", "A02:2021 - Cryptographic Failures", "CWE-525", 3.7,
                    "Add Cache-Control: no-store (and Pragma: no-cache for older clients) to responses that may contain tokens, credentials, or session data.",
                    "token_handling",
                )
                issues += 1
    return {"module": "token_handling", "checks_performed": len(asset_ids), "issues_found": issues, "observations": observations}


async def _run_controlled_validation(scan, session) -> dict:
    from database.models import Finding
    from sqlalchemy import select

    findings_result = await session.execute(select(Finding).where(Finding.scan_id == scan.id))
    findings = list(findings_result.scalars().all())
    high_risk = [f for f in findings if f.severity in ("critical", "high")]
    scan.results_summary = {
        **(scan.results_summary or {}),
        "controlled_validation": {
            "candidate_findings_reviewed": len(findings),
            "high_or_critical_flagged": len(high_risk),
            "senior_review_recommended": bool(high_risk),
        },
    }
    return {
        "module": "controlled_validation",
        "checks_performed": len(findings),
        "issues_found": len(high_risk),
        "message": f"{len(high_risk)} high/critical candidate finding(s) flagged for mandatory senior review before deep-scan sign-off." if high_risk else "No high/critical candidate findings required additional senior review.",
    }


async def _run_owasp_api_check(scan, asset_ids, session) -> dict:
    from database.models import Asset
    from sqlalchemy import select
    import httpx

    issues = 0
    observations = []
    async with httpx.AsyncClient(timeout=5.0, follow_redirects=False, trust_env=False) as client:
        for asset_id in asset_ids:
            asset_result = await session.execute(select(Asset).where(Asset.id == asset_id))
            asset = asset_result.scalar_one_or_none()
            if not asset or not str(asset.value).startswith(("http://", "https://")):
                continue
            try:
                response = await client.get(str(asset.value), headers={"Origin": "https://noovastack-scope-check.invalid"})
            except Exception:
                continue
            acao = response.headers.get("access-control-allow-origin", "")
            acac = response.headers.get("access-control-allow-credentials", "").lower()
            observations.append({
                "asset": str(asset_id),
                "access_control_allow_origin": acao,
                "access_control_allow_credentials": acac,
                "transport": "https" if str(asset.value).startswith("https://") else "http",
            })
            if acao == "*" and acac == "true":
                await _add_finding(
                    session, scan.id, asset_id,
                    "Permissive CORS With Credentials Allowed",
                    f"{asset.value} returns Access-Control-Allow-Origin: * together with Access-Control-Allow-Credentials: true. "
                    "Most current browsers reject this combination, but it indicates a misconfigured CORS policy that risks credentialed cross-origin access if relaxed further.",
                    "medium", "A05:2021 - Security Misconfiguration", "CWE-942", 6.5,
                    "Restrict Access-Control-Allow-Origin to an explicit allowlist of trusted origins when Access-Control-Allow-Credentials is true.",
                    "owasp_api_top_10",
                )
                issues += 1
            if str(asset.value).startswith("http://"):
                await _add_finding(
                    session, scan.id, asset_id,
                    "API Reachable Over Plain HTTP",
                    f"{asset.value} is reachable over unencrypted HTTP, exposing API requests and responses, including any tokens, to network interception.",
                    "high", "A02:2021 - Cryptographic Failures", "CWE-319", 7.5,
                    "Require HTTPS for all API traffic and redirect or reject plain HTTP requests.",
                    "owasp_api_top_10",
                )
                issues += 1
    return {"module": "owasp_api_top_10", "checks_performed": len(asset_ids), "issues_found": issues, "observations": observations}


async def _ingest_tool_findings(session, scan, asset, tool_id: str, observation: dict) -> int:
    """Parse external tool output into candidate findings (never auto-verified)."""
    stdout = observation.get("stdout_tail") or ""
    imported = 0

    if tool_id == "nuclei":
        for line in stdout.splitlines():
            line = line.strip()
            if not line.startswith("{"):
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            template = entry.get("info") or {}
            name = template.get("name") or entry.get("template-id") or "Nuclei Finding"
            severity = str(template.get("severity") or "unknown").lower()
            description = entry.get("matcher-name") or template.get("description") or "Detected by a Nuclei template against the approved target."
            await _add_finding(
                session, scan.id, asset.id,
                f"Nuclei: {name}",
                f"{description}\nTemplate: {entry.get('template-id')}\nMatched at: {entry.get('matched-at')}",
                severity,
                "A05:2021 - Security Misconfiguration",
                template.get("classification", {}).get("cwe-id", [])[0] if template.get("classification", {}).get("cwe-id") else "CWE-200",
                _TOOL_SEVERITY_CVSS.get(severity, 0.0),
                template.get("recommendation") or "Review the affected endpoint and apply the recommended remediation for this vulnerability class.",
                "nuclei",
            )
            imported += 1

    elif tool_id == "subfinder":
        subdomains = [line.strip() for line in stdout.splitlines() if line.strip() and "://" not in line]
        if subdomains:
            await _add_finding(
                session, scan.id, asset.id,
                "Subdomains Discovered",
                "Subfinder enumerated the following subdomains for the approved domain: " + ", ".join(sorted(set(subdomains))[:25]) + ".",
                "informational", "A05:2021 - Security Misconfiguration", "CWE-200", 0.0,
                "Validate whether each subdomain belongs in scope and document it as an asset before testing.",
                "subfinder",
            )
            imported += 1

    elif tool_id == "httpx":
        for line in stdout.splitlines():
            line = line.strip()
            if not line.startswith("{"):
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            tech = ", ".join(entry.get("tech", []) or []) if isinstance(entry.get("tech"), list) else str(entry.get("tech") or "")
            details = f"{entry.get('url')} | status={entry.get('status_code')} | title={entry.get('title')}"
            if tech:
                details += f" | technologies={tech}"
            await _add_finding(
                session, scan.id, asset.id,
                "HTTP Service Fingerprinted",
                "httpx probed the approved target and returned: " + details + ".",
                "informational", "A05:2021 - Security Misconfiguration", "CWE-200", 0.0,
                "Record the identified server and technologies as asset metadata.",
                "httpx",
            )
            imported += 1

    elif tool_id == "naabu":
        ports = [line.strip() for line in stdout.splitlines() if ":" in line and line.strip()]
        if ports:
            await _add_finding(
                session, scan.id, asset.id,
                "Open TCP Services Discovered",
                "Naabu reported reachable services: " + ", ".join(sorted(set(ports))[:25]) + ".",
                "informational", "A05:2021 - Security Misconfiguration", "CWE-200", 0.0,
                "Review exposed services and close ports not required for the application or testing scope.",
                "naabu",
            )
            imported += 1

    elif tool_id == "dnsx":
        records = []
        for line in stdout.splitlines():
            line = line.strip()
            if not line.startswith("{"):
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            host = entry.get("host") or entry.get("input")
            answers = entry.get("a") or entry.get("aaaa") or entry.get("cname") or []
            records.append(f"{host} -> {', '.join(str(a) for a in answers)}")
        if records:
            await _add_finding(
                session, scan.id, asset.id,
                "DNS Records Resolved",
                "dnsx resolved the following records for the approved domain: " + "; ".join(records[:20]) + ".",
                "informational", "A05:2021 - Security Misconfiguration", "CWE-200", 0.0,
                "Document resolved infrastructure and confirm it is in scope before testing.",
                "dnsx",
            )
            imported += 1

    elif tool_id == "katana":
        paths = []
        for line in stdout.splitlines():
            line = line.strip()
            if not line.startswith("{"):
                if line.startswith("http"):
                    paths.append(line)
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            paths.append(entry.get("request", {}).get("endpoint") or entry.get("url") or "")
        paths = [p for p in paths if p]
        if paths:
            await _add_finding(
                session, scan.id, asset.id,
                "Discovered Web Paths",
                "Katana crawled the approved target and discovered " + str(len(paths)) + " path(s), including: " + ", ".join(sorted(set(paths))[:25]) + ".",
                "informational", "A05:2021 - Security Misconfiguration", "CWE-200", 0.0,
                "Review discovered paths for sensitive functionality and document them in scope.",
                "katana",
            )
            imported += 1

    elif tool_id == "zap":
        try:
            report = json.loads(stdout) if stdout.strip().startswith("{") else {}
        except json.JSONDecodeError:
            report = {}
        for site in report.get("site", []):
            for alert in site.get("alerts", []):
                severity_map = {"3": "high", "2": "medium", "1": "low", "0": "informational"}
                sev = severity_map.get(str(alert.get("riskcode", "0")), "informational")
                await _add_finding(
                    session, scan.id, asset.id,
                    f"ZAP: {alert.get('name', 'Alert')}",
                    (alert.get("desc") or "OWASP ZAP detected a potential issue.") + f"\nURL: {alert.get('instances', [{}])[0].get('uri', '')}",
                    sev,
                    "A05:2021 - Security Misconfiguration",
                    alert.get("cweid") or "CWE-200",
                    _TOOL_SEVERITY_CVSS.get(sev, 0.0),
                    alert.get("solution") or "Review and remediate the flagged behaviour.",
                    "zap",
                    {"reference": alert.get("reference", ""), "plugin_id": alert.get("pluginid")},
                )
                imported += 1

    elif tool_id == "arjun":
        try:
            data = json.loads(stdout) if stdout.strip().startswith("{") else {}
        except json.JSONDecodeError:
            data = {}
        params = data.get("params", []) if isinstance(data.get("params"), list) else []
        if params:
            await _add_finding(
                session, scan.id, asset.id,
                "Hidden API Parameters Discovered",
                f"Arjun discovered {len(params)} hidden parameter(s) on the target endpoint: {', '.join(params[:30])}.",
                "low",
                "A01:2021 - Broken Access Control",
                "CWE-200",
                _TOOL_SEVERITY_CVSS.get("low", 0.0),
                "Review each discovered parameter for unintended exposure or privilege escalation potential.",
                "arjun",
                {"parameters": params[:50]},
            )
            imported += 1

    elif tool_id == "prowler":
        for line in stdout.splitlines():
            line = line.strip()
            if not line.startswith("{"):
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            status = entry.get("Status") or entry.get("status", "")
            if status.upper() not in ("FAIL", "CRITICAL", "HIGH", "MEDIUM"):
                continue
            sev = str(entry.get("Severity") or entry.get("severity") or "medium").lower()
            await _add_finding(
                session, scan.id, asset.id,
                f"Prowler: {entry.get('CheckTitle') or entry.get('check_title') or 'Cloud Misconfiguration'}",
                (entry.get("StatusExtended") or entry.get("description") or "Prowler detected a cloud security issue."),
                sev if sev in ("critical", "high", "medium", "low") else "medium",
                "A05:2021 - Security Misconfiguration",
                "CWE-732",
                _TOOL_SEVERITY_CVSS.get(sev, 5.0),
                entry.get("Remediation", {}).get("Recommendation", {}).get("Text") or "Apply the recommended cloud security configuration.",
                "prowler",
                {"service": entry.get("ServiceName"), "region": entry.get("Region"), "resource": entry.get("ResourceArn")},
            )
            imported += 1

    elif tool_id == "scoutsuite":
        try:
            data = json.loads(stdout) if stdout.strip().startswith("{") else {}
        except json.JSONDecodeError:
            data = {}
        for service_name, service_data in (data.get("services") or {}).items():
            for finding_key, finding in (service_data.get("findings") or {}).items():
                if not finding.get("flagged_items"):
                    continue
                level = str(finding.get("level") or "medium").lower()
                sev = {"danger": "high", "warning": "medium", "good": "informational"}.get(level, "medium")
                await _add_finding(
                    session, scan.id, asset.id,
                    f"ScoutSuite: {finding.get('description') or finding_key}",
                    f"Service: {service_name}. {finding.get('rationale') or 'ScoutSuite detected a cloud configuration issue.'} ({finding.get('flagged_items', 0)} resource(s) affected)",
                    sev,
                    "A05:2021 - Security Misconfiguration",
                    "CWE-732",
                    _TOOL_SEVERITY_CVSS.get(sev, 5.0),
                    finding.get("remediation") or "Review and apply the recommended cloud security configuration.",
                    "scoutsuite",
                    {"service": service_name, "flagged_items": finding.get("flagged_items")},
                )
                imported += 1

    elif tool_id == "masscan":
        open_ports = []
        for line in stdout.splitlines():
            line = line.strip()
            if not line.startswith("{"):
                continue
            try:
                entry = json.loads(line.rstrip(","))
            except json.JSONDecodeError:
                continue
            for port_info in entry.get("ports", []):
                port = port_info.get("port")
                proto = port_info.get("proto", "tcp")
                if port:
                    open_ports.append(f"{proto}/{port}")
        if open_ports:
            await _add_finding(
                session, scan.id, asset.id,
                "Open Ports Discovered (Masscan)",
                f"Masscan identified {len(open_ports)} open port(s) on the approved target: {', '.join(sorted(set(open_ports))[:50])}.",
                "informational",
                "A05:2021 - Security Misconfiguration",
                "CWE-200",
                0.0,
                "Review each open port and confirm it is required for the application. Close unnecessary services.",
                "masscan",
                {"open_ports": sorted(set(open_ports))[:100]},
            )
            imported += 1

    elif tool_id == "shodan":
        vulns_seen = set()
        for line in stdout.splitlines():
            line = line.strip()
            if line.startswith("Vulnerabilities:"):
                continue
            if line.startswith("CVE-"):
                cve_id = line.split()[0]
                if cve_id not in vulns_seen:
                    vulns_seen.add(cve_id)
                    await _add_finding(
                        session, scan.id, asset.id,
                        f"Shodan OSINT: {cve_id} Exposure",
                        f"Shodan's passive index reports {cve_id} associated with the approved target. Validate whether the affected service/version is present.",
                        "medium",
                        "A06:2021 - Vulnerable and Outdated Components",
                        "CWE-1104",
                        _TOOL_SEVERITY_CVSS.get("medium", 5.0),
                        f"Investigate {cve_id} and patch or mitigate the affected component if confirmed.",
                        "shodan",
                        {"cve_id": cve_id, "source": "shodan_osint"},
                    )
                    imported += 1
        if not vulns_seen:
            ports_line = next((l for l in stdout.splitlines() if "Ports:" in l), None)
            if ports_line:
                await _add_finding(
                    session, scan.id, asset.id,
                    "Shodan OSINT: Exposed Services",
                    f"Shodan passive lookup for the approved target returned: {ports_line.strip()}. No CVEs indexed.",
                    "informational",
                    "A05:2021 - Security Misconfiguration",
                    "CWE-200",
                    0.0,
                    "Document the exposed services as asset metadata.",
                    "shodan",
                )
                imported += 1

    return imported


async def _add_finding(session, scan_id, asset_id, title, description, severity, owasp_category, cwe_id, cvss_score, remediation, found_by_tool, evidence_metadata=None, evidence_type="candidate_observation"):
    from database.models import Evidence, Finding
    from sqlalchemy import select
    import hashlib

    existing = await session.execute(
        select(Finding).where(
            Finding.scan_id == scan_id,
            Finding.asset_id == asset_id,
            Finding.title == title,
        )
    )
    if existing.scalar_one_or_none():
        return

    finding = Finding(
        scan_id=scan_id,
        asset_id=asset_id,
        title=title,
        description=description,
        severity=severity,
        owasp_category=owasp_category,
        cwe_id=cwe_id,
        cvss_score=cvss_score,
        remediation=remediation,
        found_by_tool=found_by_tool,
        integrity_status="unverified",
        status="candidate",
    )
    session.add(finding)
    await session.flush()
    metadata = evidence_metadata or {
        "summary": description,
        "recommendation": remediation,
    }
    evidence_hash = hashlib.sha256(json.dumps(metadata, sort_keys=True, default=str).encode("utf-8")).hexdigest()
    session.add(Evidence(
        finding_id=finding.id,
        evidence_type=evidence_type,
        hash_value=evidence_hash,
        metadata_json=metadata,
    ))

async def _update_scan_status(scan_id: str, status: str):
    from database import AsyncSessionLocal
    from database.models import Scan
    from sqlalchemy import select

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Scan).where(Scan.id == scan_id))
        scan = result.scalar_one_or_none()
        if scan:
            scan.status = status
            await session.commit()
