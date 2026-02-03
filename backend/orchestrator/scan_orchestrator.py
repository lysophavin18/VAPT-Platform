"""
VAPT Platform - Enhanced Scan Orchestrator
Production-Ready with Scan Profiles, Tool Chaining, and Approval Workflow
Designed by VINNZz
"""
import os
import json
import subprocess
import asyncio
import re
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from enum import Enum
from celery import Celery, chain, group, chord
from celery.exceptions import SoftTimeLimitExceeded
import redis
import ipaddress
import socket

# Celery Configuration
celery_app = Celery(
    'vapt_orchestrator',
    broker=os.getenv('CELERY_BROKER_URL', 'redis://redis:6379/0'),
    backend=os.getenv('CELERY_RESULT_BACKEND', 'redis://redis:6379/0')
)

celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    task_track_started=True,
    task_time_limit=7200,  # 2 hours hard limit
    task_soft_time_limit=6600,  # 1:50 soft limit
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_routes={
        'orchestrator.*': {'queue': 'scans'},
        'reports.*': {'queue': 'reports'},
    },
    beat_schedule={
        'cleanup-old-results': {
            'task': 'orchestrator.cleanup_old_results',
            'schedule': 86400.0,  # Daily
        },
        'update-nuclei-templates': {
            'task': 'orchestrator.update_nuclei_templates',
            'schedule': 604800.0,  # Weekly
        },
    },
)

# Redis client for rate limiting and state
redis_client = redis.Redis.from_url(os.getenv('REDIS_URL', 'redis://redis:6379/0'))


# ============================================
# ENUMS AND CONSTANTS
# ============================================

class ScanProfile(str, Enum):
    QUICK = "quick"
    FULL = "full"
    AGGRESSIVE = "aggressive"
    CUSTOM = "custom"


class ScanType(str, Enum):
    WEB = "web"
    API = "api"
    NETWORK = "network"


class ToolName(str, Enum):
    NMAP = "nmap"
    NIKTO = "nikto"
    GOBUSTER = "gobuster"
    DIRB = "dirb"
    NUCLEI = "nuclei"
    KATANA = "katana"
    WPSCAN = "wpscan"
    SQLMAP = "sqlmap"
    HYDRA = "hydra"
    ZAP = "zap"
    NEWMAN = "newman"
    METASPLOIT = "metasploit"


# Tool configurations by profile
SCAN_PROFILES = {
    ScanProfile.QUICK: {
        "description": "Fast scan for quick assessment (15-30 min)",
        "tools": {
            ScanType.WEB: [ToolName.NMAP, ToolName.NIKTO, ToolName.NUCLEI],
            ScanType.API: [ToolName.NMAP, ToolName.NUCLEI, ToolName.NEWMAN],
            ScanType.NETWORK: [ToolName.NMAP],
        },
        "timeout_minutes": 30,
        "nmap_args": "-sV -sC -T4 --top-ports 1000",
        "nuclei_severity": "critical,high",
        "requires_approval": False,
    },
    ScanProfile.FULL: {
        "description": "Comprehensive scan with all tools (1-2 hours)",
        "tools": {
            ScanType.WEB: [
                ToolName.NMAP, ToolName.NIKTO, ToolName.GOBUSTER,
                ToolName.NUCLEI, ToolName.KATANA, ToolName.WPSCAN, ToolName.ZAP
            ],
            ScanType.API: [
                ToolName.NMAP, ToolName.NUCLEI, ToolName.NEWMAN, ToolName.ZAP
            ],
            ScanType.NETWORK: [
                ToolName.NMAP, ToolName.NUCLEI
            ],
        },
        "timeout_minutes": 120,
        "nmap_args": "-sV -sC -A -T4 -p-",
        "nuclei_severity": "critical,high,medium",
        "requires_approval": False,
    },
    ScanProfile.AGGRESSIVE: {
        "description": "Deep scan with brute-force and exploitation matching (2-4 hours)",
        "tools": {
            ScanType.WEB: [
                ToolName.NMAP, ToolName.NIKTO, ToolName.GOBUSTER, ToolName.DIRB,
                ToolName.NUCLEI, ToolName.KATANA, ToolName.WPSCAN, ToolName.SQLMAP,
                ToolName.HYDRA, ToolName.ZAP, ToolName.METASPLOIT
            ],
            ScanType.API: [
                ToolName.NMAP, ToolName.NUCLEI, ToolName.NEWMAN, ToolName.SQLMAP,
                ToolName.HYDRA, ToolName.ZAP, ToolName.METASPLOIT
            ],
            ScanType.NETWORK: [
                ToolName.NMAP, ToolName.NUCLEI, ToolName.HYDRA, ToolName.METASPLOIT
            ],
        },
        "timeout_minutes": 240,
        "nmap_args": "-sV -sC -A -T3 -p- --script=vuln",
        "nuclei_severity": "critical,high,medium,low",
        "requires_approval": True,  # Requires manager approval
    },
}

# Rate limits for brute-force tools (requests per minute)
RATE_LIMITS = {
    ToolName.HYDRA: 10,
    ToolName.SQLMAP: 50,
    ToolName.GOBUSTER: 100,
    ToolName.DIRB: 100,
}

# Container names mapping
CONTAINER_MAP = {
    ToolName.NMAP: "vapt-nmap",
    ToolName.NIKTO: "vapt-nikto",
    ToolName.GOBUSTER: "vapt-gobuster",
    ToolName.DIRB: "vapt-dirb",
    ToolName.NUCLEI: "vapt-nuclei",
    ToolName.KATANA: "vapt-katana",
    ToolName.WPSCAN: "vapt-wpscan",
    ToolName.SQLMAP: "vapt-sqlmap",
    ToolName.HYDRA: "vapt-hydra",
    ToolName.ZAP: "vapt-zap",
    ToolName.NEWMAN: "vapt-newman",
    ToolName.METASPLOIT: "vapt-metasploit",
}


# ============================================
# TARGET VALIDATION
# ============================================

class TargetValidator:
    """Validates scan targets for security and compliance"""
    
    # Blocked internal IP ranges
    BLOCKED_RANGES = [
        ipaddress.ip_network('10.0.0.0/8'),
        ipaddress.ip_network('172.16.0.0/12'),
        ipaddress.ip_network('192.168.0.0/16'),
        ipaddress.ip_network('127.0.0.0/8'),
        ipaddress.ip_network('169.254.0.0/16'),
        ipaddress.ip_network('224.0.0.0/4'),
    ]
    
    # Maximum CIDR range allowed
    MAX_CIDR_SIZE = 24  # /24 = 256 hosts max
    
    @classmethod
    def validate_target(cls, target: str, allow_internal: bool = False) -> Dict[str, Any]:
        """Validate a target (IP, domain, URL, or CIDR)"""
        result = {
            "valid": False,
            "target_type": None,
            "normalized": None,
            "error": None,
            "warnings": []
        }
        
        # Check if URL
        if target.startswith(('http://', 'https://')):
            return cls._validate_url(target, allow_internal)
        
        # Check if CIDR
        if '/' in target:
            return cls._validate_cidr(target, allow_internal)
        
        # Check if IP
        try:
            ip = ipaddress.ip_address(target)
            return cls._validate_ip(str(ip), allow_internal)
        except ValueError:
            pass
        
        # Assume domain
        return cls._validate_domain(target, allow_internal)
    
    @classmethod
    def _validate_ip(cls, ip: str, allow_internal: bool) -> Dict[str, Any]:
        """Validate IP address"""
        try:
            ip_obj = ipaddress.ip_address(ip)
            
            # Check if internal
            if not allow_internal:
                for blocked in cls.BLOCKED_RANGES:
                    if ip_obj in blocked:
                        return {
                            "valid": False,
                            "target_type": "ip",
                            "normalized": ip,
                            "error": f"Internal/reserved IP address not allowed: {ip}",
                            "warnings": []
                        }
            
            return {
                "valid": True,
                "target_type": "ip",
                "normalized": ip,
                "error": None,
                "warnings": []
            }
        except ValueError as e:
            return {
                "valid": False,
                "target_type": "ip",
                "normalized": None,
                "error": f"Invalid IP address: {e}",
                "warnings": []
            }
    
    @classmethod
    def _validate_cidr(cls, cidr: str, allow_internal: bool) -> Dict[str, Any]:
        """Validate CIDR range"""
        try:
            network = ipaddress.ip_network(cidr, strict=False)
            
            # Check range size
            if network.prefixlen < cls.MAX_CIDR_SIZE:
                return {
                    "valid": False,
                    "target_type": "cidr",
                    "normalized": str(network),
                    "error": f"CIDR range too large. Maximum allowed is /{cls.MAX_CIDR_SIZE} ({2**(32-cls.MAX_CIDR_SIZE)} hosts)",
                    "warnings": []
                }
            
            # Check if internal
            if not allow_internal:
                for blocked in cls.BLOCKED_RANGES:
                    if network.subnet_of(blocked) or network.supernet_of(blocked):
                        return {
                            "valid": False,
                            "target_type": "cidr",
                            "normalized": str(network),
                            "error": f"Internal/reserved network not allowed: {cidr}",
                            "warnings": []
                        }
            
            warnings = []
            host_count = network.num_addresses
            if host_count > 64:
                warnings.append(f"Large range: {host_count} hosts. Scan may take extended time.")
            
            return {
                "valid": True,
                "target_type": "cidr",
                "normalized": str(network),
                "error": None,
                "warnings": warnings
            }
        except ValueError as e:
            return {
                "valid": False,
                "target_type": "cidr",
                "normalized": None,
                "error": f"Invalid CIDR: {e}",
                "warnings": []
            }
    
    @classmethod
    def _validate_domain(cls, domain: str, allow_internal: bool) -> Dict[str, Any]:
        """Validate domain name"""
        # Basic domain format check
        domain_pattern = r'^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$'
        if not re.match(domain_pattern, domain):
            return {
                "valid": False,
                "target_type": "domain",
                "normalized": None,
                "error": f"Invalid domain format: {domain}",
                "warnings": []
            }
        
        # Try to resolve
        try:
            resolved_ip = socket.gethostbyname(domain)
            ip_validation = cls._validate_ip(resolved_ip, allow_internal)
            
            if not ip_validation["valid"]:
                return {
                    "valid": False,
                    "target_type": "domain",
                    "normalized": domain.lower(),
                    "error": f"Domain resolves to blocked IP: {resolved_ip}",
                    "warnings": []
                }
            
            return {
                "valid": True,
                "target_type": "domain",
                "normalized": domain.lower(),
                "resolved_ip": resolved_ip,
                "error": None,
                "warnings": []
            }
        except socket.gaierror:
            return {
                "valid": False,
                "target_type": "domain",
                "normalized": None,
                "error": f"Domain could not be resolved: {domain}",
                "warnings": []
            }
    
    @classmethod
    def _validate_url(cls, url: str, allow_internal: bool) -> Dict[str, Any]:
        """Validate URL"""
        from urllib.parse import urlparse
        
        try:
            parsed = urlparse(url)
            
            if parsed.scheme not in ('http', 'https'):
                return {
                    "valid": False,
                    "target_type": "url",
                    "normalized": None,
                    "error": "Only HTTP and HTTPS URLs are allowed",
                    "warnings": []
                }
            
            if not parsed.netloc:
                return {
                    "valid": False,
                    "target_type": "url",
                    "normalized": None,
                    "error": "Invalid URL: missing host",
                    "warnings": []
                }
            
            # Extract and validate host
            host = parsed.hostname
            host_validation = cls._validate_domain(host, allow_internal) if not cls._is_ip(host) else cls._validate_ip(host, allow_internal)
            
            if not host_validation["valid"]:
                return {
                    "valid": False,
                    "target_type": "url",
                    "normalized": url,
                    "error": host_validation["error"],
                    "warnings": []
                }
            
            warnings = []
            if parsed.scheme == 'http':
                warnings.append("Target uses HTTP (not HTTPS). Connection is not encrypted.")
            
            return {
                "valid": True,
                "target_type": "url",
                "normalized": url,
                "host": host,
                "port": parsed.port or (443 if parsed.scheme == 'https' else 80),
                "error": None,
                "warnings": warnings
            }
        except Exception as e:
            return {
                "valid": False,
                "target_type": "url",
                "normalized": None,
                "error": f"Invalid URL: {e}",
                "warnings": []
            }
    
    @staticmethod
    def _is_ip(host: str) -> bool:
        """Check if host is an IP address"""
        try:
            ipaddress.ip_address(host)
            return True
        except ValueError:
            return False


# ============================================
# TOOL EXECUTION HELPERS
# ============================================

def run_docker_command(container: str, command: List[str], timeout: int = 3600) -> Dict[str, Any]:
    """Execute command in Docker container"""
    docker_cmd = ["docker", "exec", container] + command
    
    try:
        result = subprocess.run(
            docker_cmd,
            capture_output=True,
            text=True,
            timeout=timeout
        )
        
        return {
            "success": result.returncode == 0,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "return_code": result.returncode
        }
    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "stdout": "",
            "stderr": f"Command timed out after {timeout} seconds",
            "return_code": -1
        }
    except Exception as e:
        return {
            "success": False,
            "stdout": "",
            "stderr": str(e),
            "return_code": -1
        }


def check_rate_limit(tool: ToolName, target: str) -> bool:
    """Check if tool is rate limited for target"""
    if tool not in RATE_LIMITS:
        return True
    
    key = f"ratelimit:{tool}:{target}"
    current = redis_client.get(key)
    
    if current is None:
        redis_client.setex(key, 60, 1)
        return True
    
    if int(current) >= RATE_LIMITS[tool]:
        return False
    
    redis_client.incr(key)
    return True


def update_scan_progress(scan_id: str, tool: str, status: str, progress: int, message: str = ""):
    """Update scan progress in Redis for real-time updates"""
    redis_client.hset(f"scan:{scan_id}:progress", mapping={
        "current_tool": tool,
        "status": status,
        "progress": progress,
        "message": message,
        "updated_at": datetime.utcnow().isoformat()
    })
    redis_client.publish(f"scan:{scan_id}", json.dumps({
        "tool": tool,
        "status": status,
        "progress": progress,
        "message": message
    }))


# ============================================
# CELERY TASKS - MAIN ORCHESTRATOR
# ============================================

@celery_app.task(bind=True, name='orchestrator.run_scan')
def run_scan(self, scan_id: str, target: str, scan_type: str, profile: str, 
             enabled_tools: List[str] = None, options: Dict = None):
    """
    Main scan orchestrator task
    Coordinates all tools based on profile and chaining rules
    """
    try:
        # Validate target
        validation = TargetValidator.validate_target(target)
        if not validation["valid"]:
            return {
                "scan_id": scan_id,
                "status": "failed",
                "error": validation["error"]
            }
        
        # Get profile configuration
        profile_enum = ScanProfile(profile)
        profile_config = SCAN_PROFILES.get(profile_enum)
        
        if not profile_config:
            return {
                "scan_id": scan_id,
                "status": "failed",
                "error": f"Invalid scan profile: {profile}"
            }
        
        # Determine tools to run
        scan_type_enum = ScanType(scan_type)
        if enabled_tools:
            tools_to_run = [ToolName(t) for t in enabled_tools if t in [tool.value for tool in ToolName]]
        else:
            tools_to_run = profile_config["tools"].get(scan_type_enum, [])
        
        update_scan_progress(scan_id, "orchestrator", "running", 5, f"Starting {profile} scan with {len(tools_to_run)} tools")
        
        results = {
            "scan_id": scan_id,
            "target": target,
            "scan_type": scan_type,
            "profile": profile,
            "started_at": datetime.utcnow().isoformat(),
            "tools": {},
            "vulnerabilities": [],
            "status": "running"
        }
        
        # Execute tools based on chaining logic
        chain_results = execute_tool_chain(scan_id, target, scan_type_enum, tools_to_run, profile_config, options)
        
        results["tools"] = chain_results["tool_results"]
        results["vulnerabilities"] = chain_results["vulnerabilities"]
        results["completed_at"] = datetime.utcnow().isoformat()
        results["status"] = "completed"
        
        # Calculate risk score
        results["risk_score"] = calculate_risk_score(results["vulnerabilities"])
        
        update_scan_progress(scan_id, "orchestrator", "completed", 100, "Scan completed successfully")
        
        return results
        
    except SoftTimeLimitExceeded:
        update_scan_progress(scan_id, "orchestrator", "failed", 0, "Scan timed out")
        return {
            "scan_id": scan_id,
            "status": "failed",
            "error": "Scan exceeded time limit"
        }
    except Exception as e:
        update_scan_progress(scan_id, "orchestrator", "failed", 0, str(e))
        return {
            "scan_id": scan_id,
            "status": "failed",
            "error": str(e)
        }


def execute_tool_chain(scan_id: str, target: str, scan_type: ScanType, 
                       tools: List[ToolName], profile_config: Dict, options: Dict = None) -> Dict:
    """
    Execute tools with intelligent chaining
    Example chains:
    - Nmap → Service Detection → Nuclei templates
    - Katana → URLs → SQLmap/ZAP
    - WPScan → WordPress vulns → Exploit matching
    """
    results = {
        "tool_results": {},
        "vulnerabilities": []
    }
    
    total_tools = len(tools)
    discovered_services = []
    discovered_urls = []
    is_wordpress = False
    
    # Phase 1: Discovery (Nmap, Katana)
    if ToolName.NMAP in tools:
        update_scan_progress(scan_id, "nmap", "running", 10, "Running port scan")
        nmap_result = run_nmap_scan(target, profile_config.get("nmap_args", "-sV -sC -T4"))
        results["tool_results"]["nmap"] = nmap_result
        
        if nmap_result.get("success"):
            discovered_services = nmap_result.get("services", [])
            results["vulnerabilities"].extend(nmap_result.get("vulnerabilities", []))
    
    if ToolName.KATANA in tools:
        update_scan_progress(scan_id, "katana", "running", 20, "Crawling target")
        katana_result = run_katana_scan(target)
        results["tool_results"]["katana"] = katana_result
        
        if katana_result.get("success"):
            discovered_urls = katana_result.get("urls", [])
    
    # Phase 2: Web Server Analysis (Nikto, Gobuster, Dirb)
    if ToolName.NIKTO in tools:
        update_scan_progress(scan_id, "nikto", "running", 30, "Scanning web server")
        nikto_result = run_nikto_scan(target)
        results["tool_results"]["nikto"] = nikto_result
        results["vulnerabilities"].extend(nikto_result.get("vulnerabilities", []))
    
    if ToolName.GOBUSTER in tools:
        update_scan_progress(scan_id, "gobuster", "running", 40, "Enumerating directories")
        gobuster_result = run_gobuster_scan(target)
        results["tool_results"]["gobuster"] = gobuster_result
        discovered_urls.extend(gobuster_result.get("found_paths", []))
    
    if ToolName.DIRB in tools:
        update_scan_progress(scan_id, "dirb", "running", 45, "Directory brute-force")
        dirb_result = run_dirb_scan(target)
        results["tool_results"]["dirb"] = dirb_result
        discovered_urls.extend(dirb_result.get("found_paths", []))
    
    # Phase 3: WordPress Detection & Scan
    if ToolName.WPSCAN in tools:
        update_scan_progress(scan_id, "wpscan", "running", 50, "Checking for WordPress")
        wpscan_result = run_wpscan_scan(target)
        results["tool_results"]["wpscan"] = wpscan_result
        
        if wpscan_result.get("is_wordpress"):
            is_wordpress = True
            results["vulnerabilities"].extend(wpscan_result.get("vulnerabilities", []))
    
    # Phase 4: Vulnerability Scanning (Nuclei, ZAP)
    if ToolName.NUCLEI in tools:
        update_scan_progress(scan_id, "nuclei", "running", 60, "Running vulnerability templates")
        
        # Use service-specific templates based on Nmap results
        templates = []
        for service in discovered_services:
            if 'http' in service.get('service', '').lower():
                templates.extend(['http', 'ssl'])
            if 'ssh' in service.get('service', '').lower():
                templates.append('ssh')
            if 'ftp' in service.get('service', '').lower():
                templates.append('ftp')
        
        nuclei_result = run_nuclei_scan(
            target, 
            severity=profile_config.get("nuclei_severity", "critical,high"),
            templates=templates if templates else None
        )
        results["tool_results"]["nuclei"] = nuclei_result
        results["vulnerabilities"].extend(nuclei_result.get("vulnerabilities", []))
    
    if ToolName.ZAP in tools:
        update_scan_progress(scan_id, "zap", "running", 70, "Running DAST scan")
        zap_result = run_zap_scan(target, discovered_urls)
        results["tool_results"]["zap"] = zap_result
        results["vulnerabilities"].extend(zap_result.get("vulnerabilities", []))
    
    # Phase 5: Injection Testing (SQLmap)
    if ToolName.SQLMAP in tools and discovered_urls:
        update_scan_progress(scan_id, "sqlmap", "running", 80, "Testing for SQL injection")
        
        # Test discovered URLs with parameters
        urls_with_params = [u for u in discovered_urls if '?' in u][:10]  # Limit to 10 URLs
        
        for url in urls_with_params:
            if check_rate_limit(ToolName.SQLMAP, target):
                sqlmap_result = run_sqlmap_scan(url)
                results["tool_results"]["sqlmap"] = sqlmap_result
                results["vulnerabilities"].extend(sqlmap_result.get("vulnerabilities", []))
    
    # Phase 6: Brute Force (Hydra) - Rate Limited
    if ToolName.HYDRA in tools:
        update_scan_progress(scan_id, "hydra", "running", 85, "Testing credentials (rate-limited)")
        
        # Only run on discovered services
        for service in discovered_services:
            if service.get('service') in ['ssh', 'ftp', 'http-auth']:
                if check_rate_limit(ToolName.HYDRA, target):
                    hydra_result = run_hydra_scan(
                        target,
                        service.get('port'),
                        service.get('service'),
                        rate_limit=RATE_LIMITS[ToolName.HYDRA]
                    )
                    results["tool_results"]["hydra"] = hydra_result
                    results["vulnerabilities"].extend(hydra_result.get("vulnerabilities", []))
    
    # Phase 7: Exploit Matching (Metasploit) - Simulation Only
    if ToolName.METASPLOIT in tools:
        update_scan_progress(scan_id, "metasploit", "running", 90, "Matching exploits (simulation)")
        
        # Get CVEs from vulnerabilities for exploit matching
        cves = [v.get('cve_id') for v in results["vulnerabilities"] if v.get('cve_id')]
        
        msf_result = run_metasploit_match(cves, discovered_services)
        results["tool_results"]["metasploit"] = msf_result
        
        # Add exploit availability info to vulnerabilities
        for vuln in results["vulnerabilities"]:
            if vuln.get('cve_id') in msf_result.get("matched_exploits", {}):
                vuln["exploit_available"] = True
                vuln["exploit_module"] = msf_result["matched_exploits"][vuln["cve_id"]]
    
    # Phase 8: API Testing (Newman)
    if ToolName.NEWMAN in tools and scan_type == ScanType.API:
        update_scan_progress(scan_id, "newman", "running", 95, "Running API tests")
        newman_result = run_newman_scan(target, options.get("collection_path") if options else None)
        results["tool_results"]["newman"] = newman_result
        results["vulnerabilities"].extend(newman_result.get("vulnerabilities", []))
    
    # Deduplicate vulnerabilities
    results["vulnerabilities"] = deduplicate_vulnerabilities(results["vulnerabilities"])
    
    return results


# ============================================
# INDIVIDUAL TOOL TASKS
# ============================================

@celery_app.task(name='orchestrator.nmap_scan')
def run_nmap_scan(target: str, args: str = "-sV -sC -T4") -> Dict:
    """Run Nmap scan"""
    container = CONTAINER_MAP[ToolName.NMAP]
    cmd = ["nmap", "-oX", "-"] + args.split() + [target]
    
    result = run_docker_command(container, cmd, timeout=1800)
    
    if not result["success"]:
        return {"success": False, "error": result["stderr"]}
    
    # Parse XML output
    services = parse_nmap_output(result["stdout"])
    vulnerabilities = extract_nmap_vulns(result["stdout"])
    
    return {
        "success": True,
        "services": services,
        "vulnerabilities": vulnerabilities,
        "raw_output": result["stdout"]
    }


@celery_app.task(name='orchestrator.nikto_scan')
def run_nikto_scan(target: str) -> Dict:
    """Run Nikto scan"""
    container = CONTAINER_MAP[ToolName.NIKTO]
    cmd = ["perl", "nikto.pl", "-h", target, "-Format", "json", "-o", "-"]
    
    result = run_docker_command(container, cmd, timeout=3600)
    
    if not result["success"]:
        return {"success": False, "error": result["stderr"], "vulnerabilities": []}
    
    vulnerabilities = parse_nikto_output(result["stdout"])
    
    return {
        "success": True,
        "vulnerabilities": vulnerabilities,
        "raw_output": result["stdout"]
    }


@celery_app.task(name='orchestrator.nuclei_scan')
def run_nuclei_scan(target: str, severity: str = "critical,high", templates: List[str] = None) -> Dict:
    """Run Nuclei scan"""
    container = CONTAINER_MAP[ToolName.NUCLEI]
    cmd = ["nuclei", "-u", target, "-severity", severity, "-json", "-silent"]
    
    if templates:
        cmd.extend(["-t", ",".join(templates)])
    
    result = run_docker_command(container, cmd, timeout=1800)
    
    vulnerabilities = parse_nuclei_output(result["stdout"])
    
    return {
        "success": True,
        "vulnerabilities": vulnerabilities,
        "raw_output": result["stdout"]
    }


@celery_app.task(name='orchestrator.zap_scan')
def run_zap_scan(target: str, urls: List[str] = None) -> Dict:
    """Run OWASP ZAP scan via API"""
    import requests
    
    zap_api = "http://vapt-zap:8090"
    
    try:
        # Start spider
        requests.get(f"{zap_api}/JSON/spider/action/scan/", params={"url": target})
        
        # Wait for spider
        while True:
            status = requests.get(f"{zap_api}/JSON/spider/view/status/").json()
            if int(status.get("status", 0)) >= 100:
                break
            asyncio.sleep(5)
        
        # Run active scan
        requests.get(f"{zap_api}/JSON/ascan/action/scan/", params={"url": target})
        
        # Wait for scan
        while True:
            status = requests.get(f"{zap_api}/JSON/ascan/view/status/").json()
            if int(status.get("status", 0)) >= 100:
                break
            asyncio.sleep(10)
        
        # Get alerts
        alerts = requests.get(f"{zap_api}/JSON/core/view/alerts/", params={"baseurl": target}).json()
        
        vulnerabilities = parse_zap_output(alerts.get("alerts", []))
        
        return {
            "success": True,
            "vulnerabilities": vulnerabilities,
            "alert_count": len(alerts.get("alerts", []))
        }
    except Exception as e:
        return {"success": False, "error": str(e), "vulnerabilities": []}


@celery_app.task(name='orchestrator.sqlmap_scan')
def run_sqlmap_scan(url: str) -> Dict:
    """Run SQLmap scan - SAFE MODE ONLY"""
    container = CONTAINER_MAP[ToolName.SQLMAP]
    
    # Safe mode: detection only, no exploitation
    cmd = [
        "python", "sqlmap.py",
        "-u", url,
        "--batch",
        "--level=3",
        "--risk=2",
        "--technique=BEUSTQ",
        "--threads=1",
        "--output-dir=/output"
    ]
    
    result = run_docker_command(container, cmd, timeout=600)
    
    vulnerabilities = parse_sqlmap_output(result["stdout"])
    
    return {
        "success": True,
        "vulnerabilities": vulnerabilities,
        "raw_output": result["stdout"]
    }


@celery_app.task(name='orchestrator.gobuster_scan')
def run_gobuster_scan(target: str) -> Dict:
    """Run Gobuster directory scan"""
    container = CONTAINER_MAP[ToolName.GOBUSTER]
    cmd = [
        "gobuster", "dir",
        "-u", target,
        "-w", "/wordlists/common.txt",
        "-t", "10",
        "-q",
        "--no-error"
    ]
    
    result = run_docker_command(container, cmd, timeout=1800)
    
    found_paths = parse_gobuster_output(result["stdout"])
    
    return {
        "success": True,
        "found_paths": found_paths,
        "raw_output": result["stdout"]
    }


@celery_app.task(name='orchestrator.dirb_scan')
def run_dirb_scan(target: str) -> Dict:
    """Run Dirb directory scan"""
    container = CONTAINER_MAP[ToolName.DIRB]
    cmd = ["dirb", target, "/wordlists/common.txt", "-S", "-r"]
    
    result = run_docker_command(container, cmd, timeout=1800)
    
    found_paths = parse_dirb_output(result["stdout"])
    
    return {
        "success": True,
        "found_paths": found_paths,
        "raw_output": result["stdout"]
    }


@celery_app.task(name='orchestrator.katana_scan')
def run_katana_scan(target: str) -> Dict:
    """Run Katana crawler"""
    container = CONTAINER_MAP[ToolName.KATANA]
    cmd = ["katana", "-u", target, "-d", "3", "-silent", "-jc"]
    
    result = run_docker_command(container, cmd, timeout=1200)
    
    urls = result["stdout"].strip().split('\n') if result["stdout"] else []
    
    return {
        "success": True,
        "urls": [u for u in urls if u],
        "raw_output": result["stdout"]
    }


@celery_app.task(name='orchestrator.wpscan_scan')
def run_wpscan_scan(target: str) -> Dict:
    """Run WPScan for WordPress sites"""
    container = CONTAINER_MAP[ToolName.WPSCAN]
    cmd = [
        "wpscan",
        "--url", target,
        "--format", "json",
        "--enumerate", "vp,vt,u",
        "--plugins-detection", "mixed"
    ]
    
    api_token = os.getenv("WPSCAN_API_TOKEN")
    if api_token:
        cmd.extend(["--api-token", api_token])
    
    result = run_docker_command(container, cmd, timeout=1800)
    
    parsed = parse_wpscan_output(result["stdout"])
    
    return {
        "success": True,
        "is_wordpress": parsed.get("is_wordpress", False),
        "vulnerabilities": parsed.get("vulnerabilities", []),
        "raw_output": result["stdout"]
    }


@celery_app.task(name='orchestrator.hydra_scan')
def run_hydra_scan(target: str, port: int, service: str, rate_limit: int = 10) -> Dict:
    """Run Hydra brute-force - HEAVILY RATE LIMITED"""
    container = CONTAINER_MAP[ToolName.HYDRA]
    
    # Use small wordlist and strict rate limiting
    cmd = [
        "hydra",
        "-L", "/wordlists/users.txt",
        "-P", "/wordlists/passwords.txt",
        "-t", "1",  # Single thread
        "-W", str(60 // rate_limit),  # Wait between attempts
        "-f",  # Stop on first found
        "-s", str(port),
        target,
        service
    ]
    
    result = run_docker_command(container, cmd, timeout=600)
    
    vulnerabilities = parse_hydra_output(result["stdout"])
    
    return {
        "success": True,
        "vulnerabilities": vulnerabilities,
        "raw_output": result["stdout"]
    }


@celery_app.task(name='orchestrator.metasploit_match')
def run_metasploit_match(cves: List[str], services: List[Dict]) -> Dict:
    """
    Match vulnerabilities against Metasploit modules - SIMULATION ONLY
    No actual exploitation is performed
    """
    container = CONTAINER_MAP[ToolName.METASPLOIT]
    matched_exploits = {}
    
    for cve in cves:
        if not cve:
            continue
        
        # Search for matching module
        cmd = ["msfconsole", "-q", "-x", f"search cve:{cve}; exit"]
        result = run_docker_command(container, cmd, timeout=60)
        
        if result["success"] and "exploit/" in result["stdout"]:
            # Extract module name
            lines = result["stdout"].split('\n')
            for line in lines:
                if "exploit/" in line:
                    parts = line.split()
                    for part in parts:
                        if part.startswith("exploit/"):
                            matched_exploits[cve] = part
                            break
                    break
    
    return {
        "success": True,
        "matched_exploits": matched_exploits,
        "exploit_count": len(matched_exploits),
        "note": "SIMULATION ONLY - No exploitation performed"
    }


@celery_app.task(name='orchestrator.newman_scan')
def run_newman_scan(target: str, collection_path: str = None) -> Dict:
    """Run Newman API tests"""
    container = CONTAINER_MAP[ToolName.NEWMAN]
    
    if not collection_path:
        return {"success": False, "error": "No collection provided", "vulnerabilities": []}
    
    cmd = [
        "newman", "run", collection_path,
        "--env-var", f"baseUrl={target}",
        "--reporters", "json",
        "--reporter-json-export", "/output/newman-results.json"
    ]
    
    result = run_docker_command(container, cmd, timeout=600)
    
    vulnerabilities = parse_newman_output(result["stdout"])
    
    return {
        "success": True,
        "vulnerabilities": vulnerabilities,
        "raw_output": result["stdout"]
    }


# ============================================
# OUTPUT PARSERS
# ============================================

def parse_nmap_output(xml_output: str) -> List[Dict]:
    """Parse Nmap XML output"""
    import xml.etree.ElementTree as ET
    
    services = []
    try:
        root = ET.fromstring(xml_output)
        for host in root.findall('.//host'):
            for port in host.findall('.//port'):
                service = port.find('service')
                services.append({
                    "port": port.get('portid'),
                    "protocol": port.get('protocol'),
                    "state": port.find('state').get('state') if port.find('state') is not None else 'unknown',
                    "service": service.get('name') if service is not None else 'unknown',
                    "version": service.get('version') if service is not None else '',
                    "product": service.get('product') if service is not None else ''
                })
    except:
        pass
    
    return services


def extract_nmap_vulns(xml_output: str) -> List[Dict]:
    """Extract vulnerabilities from Nmap script output"""
    vulnerabilities = []
    import xml.etree.ElementTree as ET
    
    try:
        root = ET.fromstring(xml_output)
        for script in root.findall('.//script'):
            if 'vuln' in script.get('id', '').lower():
                output = script.get('output', '')
                vulnerabilities.append({
                    "title": script.get('id'),
                    "description": output[:500],
                    "severity": "medium",
                    "found_by_tool": "nmap",
                    "cve_id": extract_cve(output)
                })
    except:
        pass
    
    return vulnerabilities


def parse_nikto_output(json_output: str) -> List[Dict]:
    """Parse Nikto JSON output"""
    vulnerabilities = []
    try:
        data = json.loads(json_output)
        for item in data.get('vulnerabilities', []):
            vulnerabilities.append({
                "title": item.get('msg', 'Unknown vulnerability'),
                "description": item.get('msg', ''),
                "severity": map_nikto_severity(item.get('OSVDB', '')),
                "found_by_tool": "nikto",
                "affected_url": item.get('url', ''),
                "osvdb_id": item.get('OSVDB')
            })
    except:
        pass
    
    return vulnerabilities


def parse_nuclei_output(json_output: str) -> List[Dict]:
    """Parse Nuclei JSON output"""
    vulnerabilities = []
    
    for line in json_output.strip().split('\n'):
        if not line:
            continue
        try:
            data = json.loads(line)
            vulnerabilities.append({
                "title": data.get('info', {}).get('name', 'Unknown'),
                "description": data.get('info', {}).get('description', ''),
                "severity": data.get('info', {}).get('severity', 'info'),
                "found_by_tool": "nuclei",
                "affected_url": data.get('matched-at', ''),
                "cve_id": data.get('info', {}).get('cve-id'),
                "template_id": data.get('template-id'),
                "tags": data.get('info', {}).get('tags', [])
            })
        except:
            pass
    
    return vulnerabilities


def parse_zap_output(alerts: List[Dict]) -> List[Dict]:
    """Parse ZAP alerts"""
    vulnerabilities = []
    
    severity_map = {
        "0": "info",
        "1": "low",
        "2": "medium",
        "3": "high"
    }
    
    for alert in alerts:
        vulnerabilities.append({
            "title": alert.get('name', 'Unknown'),
            "description": alert.get('description', ''),
            "severity": severity_map.get(str(alert.get('riskcode', 0)), 'info'),
            "found_by_tool": "zap",
            "affected_url": alert.get('url', ''),
            "affected_parameter": alert.get('param', ''),
            "remediation": alert.get('solution', ''),
            "cwe_id": alert.get('cweid')
        })
    
    return vulnerabilities


def parse_sqlmap_output(output: str) -> List[Dict]:
    """Parse SQLmap output"""
    vulnerabilities = []
    
    if "sqlmap identified the following injection point" in output.lower() or \
       "parameter" in output.lower() and "injectable" in output.lower():
        vulnerabilities.append({
            "title": "SQL Injection Vulnerability",
            "description": "SQLmap detected potential SQL injection vulnerability",
            "severity": "critical",
            "found_by_tool": "sqlmap",
            "proof_of_concept": output[:1000]
        })
    
    return vulnerabilities


def parse_gobuster_output(output: str) -> List[str]:
    """Parse Gobuster output"""
    paths = []
    for line in output.strip().split('\n'):
        if line.startswith('/'):
            path = line.split()[0]
            paths.append(path)
    return paths


def parse_dirb_output(output: str) -> List[str]:
    """Parse Dirb output"""
    paths = []
    for line in output.strip().split('\n'):
        if '+ http' in line:
            url = line.split()[1]
            from urllib.parse import urlparse
            paths.append(urlparse(url).path)
    return paths


def parse_wpscan_output(json_output: str) -> Dict:
    """Parse WPScan JSON output"""
    result = {
        "is_wordpress": False,
        "vulnerabilities": []
    }
    
    try:
        data = json.loads(json_output)
        
        if data.get('target_url'):
            result["is_wordpress"] = True
        
        # Plugin vulnerabilities
        for plugin, info in data.get('plugins', {}).items():
            for vuln in info.get('vulnerabilities', []):
                result["vulnerabilities"].append({
                    "title": vuln.get('title', f'WordPress Plugin Vulnerability: {plugin}'),
                    "description": vuln.get('title', ''),
                    "severity": map_wpscan_severity(vuln.get('references', {})),
                    "found_by_tool": "wpscan",
                    "cve_id": extract_cve(str(vuln.get('references', {})))
                })
        
        # Theme vulnerabilities
        for theme, info in data.get('themes', {}).items():
            for vuln in info.get('vulnerabilities', []):
                result["vulnerabilities"].append({
                    "title": vuln.get('title', f'WordPress Theme Vulnerability: {theme}'),
                    "severity": "high",
                    "found_by_tool": "wpscan"
                })
    except:
        pass
    
    return result


def parse_hydra_output(output: str) -> List[Dict]:
    """Parse Hydra output"""
    vulnerabilities = []
    
    if "login:" in output.lower() and "password:" in output.lower():
        vulnerabilities.append({
            "title": "Weak Credentials Detected",
            "description": "Hydra found valid credentials through brute-force testing",
            "severity": "critical",
            "found_by_tool": "hydra",
            "proof_of_concept": "[REDACTED - Credentials found]"
        })
    
    return vulnerabilities


def parse_newman_output(output: str) -> List[Dict]:
    """Parse Newman output"""
    vulnerabilities = []
    
    try:
        data = json.loads(output)
        for failure in data.get('run', {}).get('failures', []):
            if 'security' in str(failure).lower() or 'auth' in str(failure).lower():
                vulnerabilities.append({
                    "title": f"API Security Issue: {failure.get('error', {}).get('name', 'Unknown')}",
                    "description": failure.get('error', {}).get('message', ''),
                    "severity": "medium",
                    "found_by_tool": "newman"
                })
    except:
        pass
    
    return vulnerabilities


# ============================================
# UTILITY FUNCTIONS
# ============================================

def extract_cve(text: str) -> Optional[str]:
    """Extract CVE ID from text"""
    import re
    match = re.search(r'CVE-\d{4}-\d+', text, re.IGNORECASE)
    return match.group(0).upper() if match else None


def map_nikto_severity(osvdb: str) -> str:
    """Map Nikto OSVDB to severity"""
    if not osvdb:
        return "info"
    return "medium"


def map_wpscan_severity(references: Dict) -> str:
    """Map WPScan references to severity"""
    if 'cve' in str(references).lower():
        return "high"
    return "medium"


def deduplicate_vulnerabilities(vulns: List[Dict]) -> List[Dict]:
    """Remove duplicate vulnerabilities"""
    seen = set()
    unique = []
    
    for vuln in vulns:
        key = (vuln.get('title', ''), vuln.get('affected_url', ''), vuln.get('cve_id', ''))
        if key not in seen:
            seen.add(key)
            unique.append(vuln)
    
    return unique


def calculate_risk_score(vulnerabilities: List[Dict]) -> int:
    """Calculate overall risk score"""
    weights = {
        "critical": 10,
        "high": 7,
        "medium": 4,
        "low": 1,
        "info": 0
    }
    
    score = sum(weights.get(v.get('severity', 'info'), 0) for v in vulnerabilities)
    return min(100, score)


# ============================================
# SCHEDULED TASKS
# ============================================

@celery_app.task(name='orchestrator.cleanup_old_results')
def cleanup_old_results():
    """Clean up old scan results from Redis"""
    pattern = "scan:*:progress"
    cursor = 0
    deleted = 0
    
    while True:
        cursor, keys = redis_client.scan(cursor, match=pattern, count=100)
        for key in keys:
            data = redis_client.hgetall(key)
            if data:
                updated = data.get(b'updated_at', b'').decode()
                if updated:
                    updated_dt = datetime.fromisoformat(updated)
                    if datetime.utcnow() - updated_dt > timedelta(days=7):
                        redis_client.delete(key)
                        deleted += 1
        
        if cursor == 0:
            break
    
    return {"deleted": deleted}


@celery_app.task(name='orchestrator.update_nuclei_templates')
def update_nuclei_templates():
    """Update Nuclei templates"""
    container = CONTAINER_MAP[ToolName.NUCLEI]
    cmd = ["nuclei", "-update-templates"]
    
    result = run_docker_command(container, cmd, timeout=300)
    
    return {"success": result["success"], "output": result["stdout"]}


# ============================================
# CREDIT: Designed by VINNZz
# Production-Ready VAPT Orchestrator v2.0
# ============================================
