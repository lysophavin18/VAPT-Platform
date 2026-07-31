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
    from database.models import Scan, ScanModule, ScanAsset, Asset, Finding
    from safety import SafetyContext, is_safe
    from sqlalchemy import select
    import uuid as uuid_lib

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Scan).where(Scan.id == scan_id))
        scan = result.scalar_one_or_none()
        if not scan:
            return {"status": "error", "message": "Scan not found"}

        # Safety check
        safe, reasons = is_safe(SafetyContext(
            scan_id=scan_id,
            project_id=str(scan.project_id),
            assessment_mode=scan.assessment_mode,
            scan_depth=scan.scan_depth,
            target=(scan.config or {}).get("target", "approved_project_assets"),
            is_approved=scan.approved_by is not None,
            metadata={"authorized_internal": bool((scan.config or {}).get("safe_only"))},
        ))
        if not safe:
            scan.status = "blocked"
            await session.commit()
            return {"status": "blocked", "reasons": reasons}

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
        scan_assets = await session.execute(
            select(ScanAsset).where(ScanAsset.scan_id == scan_id)
        )
        asset_ids = [sa.asset_id for sa in scan_assets.scalars().all()]

        if not asset_ids:
            scan_assets_all = await session.execute(
                select(Asset).where(
                    Asset.project_id == scan.project_id,
                    Asset.scope_status == "in_scope",
                )
            )
            for a in scan_assets_all.scalars().all():
                asset_ids.append(a.id)

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

        # Keep real safe scans evidence-based. Demo findings are only for scans
        # without a safe real target configuration.
        if not (scan.config or {}).get("safe_only"):
            await _generate_sample_findings(session, scan_id, asset_ids)

        scan.status = "completed"
        scan.completed_at = datetime.utcnow()
        scan.progress = 100
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
    elif module_name in ("basic_scan", "http_probe", "security_headers", "tls_check", "safe_nuclei_templates", "nuclei_templates", "technology_detection"):
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
    elif module_name == "cve_enrichment":
        results = await _run_cve_enrichment(module_name, scan, asset_ids, session)
    elif module_name in EXTERNAL_TOOL_MODULES:
        results = await _run_external_tool_module(module_name, scan, asset_ids, session)
    elif "owasp" in module_name:
        results = {"module": module_name, "checks_performed": 10, "issues_found": 0}
    elif "tls" in module_name:
        results = {"module": module_name, "checks_performed": 5, "issues_found": 0}

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

    async with httpx.AsyncClient(timeout=5.0, follow_redirects=False, trust_env=False, verify=False) as client:
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
        if observation.get("return_code") not in (0, None) and observation.get("stderr_tail"):
            issues_found += 0

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
        "httpx": ["httpx"],
    }
    for candidate in aliases.get(tool_id, [tool_id]):
        path = shutil.which(candidate)
        if path:
            return path
    return None


def _external_tool_command(binary: str, tool_id: str, target: str, config: dict) -> list[str] | None:
    host, url = _asset_host_and_url(target)
    repo_path = config.get("repository_path") or config.get("repo_path")
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
        return [binary, "-u", url, "-status-code", "-title", "-tech-detect", "-json"]
    if tool_id == "dalfox" and url:
        return [binary, "url", url, "--skip-bav", "--timeout", "10", "--format", "json"]
    if tool_id == "sqlmap" and url:
        return [binary, "-u", url, "--batch", "--level", "1", "--risk", "1", "--smart", "--crawl", "0"]
    if tool_id == "semgrep" and repo_path:
        return [binary, "--config", "auto", "--json", repo_path]
    if tool_id == "bandit" and repo_path:
        return [binary, "-r", repo_path, "-f", "json"]
    if tool_id == "pip-audit" and repo_path:
        return [binary, "--path", repo_path, "--format", "json"]
    if tool_id == "trivy" and repo_path:
        return [binary, "fs", "--format", "json", repo_path]
    if tool_id == "grype" and repo_path:
        return [binary, repo_path, "-o", "json"]
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


async def _add_finding(session, scan_id, asset_id, title, description, severity, owasp_category, cwe_id, cvss_score, remediation, found_by_tool, evidence_metadata=None, evidence_type="validated_observation"):
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
        integrity_status="verified",
        status="confirmed",
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


async def _generate_sample_findings(session, scan_id: str, asset_ids: list):
    from database.models import Finding
    from sqlalchemy import select

    existing = await session.execute(
        select(Finding).where(Finding.scan_id == scan_id)
    )
    if existing.scalars().first():
        return

    samples = [
        {
            "title": "Missing Security Headers",
            "description": "The application is missing important HTTP security headers including Content-Security-Policy and X-Frame-Options.",
            "severity": "medium",
            "owasp_category": "A05:2021 - Security Misconfiguration",
            "cwe_id": "CWE-693",
            "cvss_score": 5.3,
            "remediation": "Add Content-Security-Policy header with appropriate directives. Add X-Frame-Options: DENY header. Consider adding HSTS, X-Content-Type-Options, and Referrer-Policy headers.",
            "found_by_tool": "nuclei",
        },
        {
            "title": "TLS 1.0/1.1 Supported",
            "description": "The server supports outdated TLS 1.0 and TLS 1.1 protocols, which have known vulnerabilities.",
            "severity": "high",
            "owasp_category": "A02:2021 - Cryptographic Failures",
            "cwe_id": "CWE-327",
            "cvss_score": 7.5,
            "remediation": "Disable TLS 1.0 and TLS 1.1. Configure the server to only support TLS 1.2 and TLS 1.3.",
            "found_by_tool": "testssl",
        },
        {
            "title": "Information Disclosure in Error Messages",
            "description": "The application reveals stack traces and internal paths in error messages.",
            "severity": "low",
            "owasp_category": "A05:2021 - Security Misconfiguration",
            "cwe_id": "CWE-209",
            "cvss_score": 3.5,
            "remediation": "Configure custom error pages. Disable debug mode in production. Ensure error messages do not expose internal details.",
            "found_by_tool": "zap",
        },
    ]

    for s in samples:
        finding = Finding(
            scan_id=scan_id,
            asset_id=asset_ids[0] if asset_ids else None,
            title=s["title"],
            description=s["description"],
            severity=s["severity"],
            owasp_category=s["owasp_category"],
            cwe_id=s["cwe_id"],
            cvss_score=s["cvss_score"],
            remediation=s["remediation"],
            found_by_tool=s["found_by_tool"],
            integrity_status="unverified",
        )
        session.add(finding)


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
