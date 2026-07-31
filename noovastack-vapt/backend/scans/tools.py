"""Scanner tool catalog used by scan profiles and administration APIs."""

SCANNER_TOOL_CATALOG = [
    {"id": "nmap", "name": "Nmap", "module": "tcp_port_scan", "category": "network", "purpose": "Port and service discovery", "safe_default": True},
    {"id": "wapiti", "name": "Wapiti", "module": "wapiti_scan", "category": "web", "purpose": "Web vulnerability scanning", "safe_default": True},
    {"id": "nuclei", "name": "Nuclei", "module": "nuclei_templates", "category": "web", "purpose": "Template-based vulnerability checks", "safe_default": True},
    {"id": "nikto", "name": "Nikto", "module": "nikto_scan", "category": "web", "purpose": "Web server misconfiguration checks", "safe_default": True},
    {"id": "whatweb", "name": "WhatWeb", "module": "whatweb_fingerprint", "category": "web", "purpose": "Technology fingerprinting", "safe_default": True},
    {"id": "curl", "name": "curl", "module": "curl_http_capture", "category": "web", "purpose": "Safe HTTP request and response metadata capture", "safe_default": True},
    {"id": "testssl", "name": "testssl.sh", "module": "testssl_scan", "category": "tls", "purpose": "TLS protocol and cipher checks", "safe_default": True},
    {"id": "sslscan", "name": "SSLScan", "module": "sslscan", "category": "tls", "purpose": "TLS configuration checks", "safe_default": True},
    {"id": "subfinder", "name": "Subfinder", "module": "subfinder_passive", "category": "recon", "purpose": "Passive subdomain discovery for approved domains", "safe_default": True},
    {"id": "gobuster", "name": "Gobuster", "module": "gobuster_discovery", "category": "web", "purpose": "Controlled directory, file, DNS, or vhost discovery", "safe_default": False},
    {"id": "naabu", "name": "Naabu", "module": "naabu_scan", "category": "network", "purpose": "Fast port discovery", "safe_default": True},
    {"id": "httpx", "name": "httpx", "module": "httpx_probe", "category": "web", "purpose": "HTTP probing and metadata capture", "safe_default": True},
    {"id": "dalfox", "name": "Dalfox", "module": "dalfox_xss", "category": "web", "purpose": "XSS validation", "safe_default": False},
    {"id": "sqlmap", "name": "SQLMap", "module": "sqlmap_check", "category": "web", "purpose": "SQL injection validation", "safe_default": False},
    {"id": "semgrep", "name": "Semgrep", "module": "semgrep_sast", "category": "code", "purpose": "Static application security testing", "safe_default": True},
    {"id": "bandit", "name": "Bandit", "module": "bandit_sast", "category": "code", "purpose": "Python security static analysis", "safe_default": True},
    {"id": "pip-audit", "name": "pip-audit", "module": "pip_audit", "category": "dependency", "purpose": "Python dependency CVE checks", "safe_default": True},
    {"id": "trivy", "name": "Trivy", "module": "trivy_scan", "category": "dependency", "purpose": "Container, filesystem, and dependency CVE checks", "safe_default": True},
    {"id": "grype", "name": "Grype", "module": "grype_scan", "category": "dependency", "purpose": "SBOM and dependency vulnerability matching", "safe_default": True},
]

MODULE_TO_TOOL = {item["module"]: item for item in SCANNER_TOOL_CATALOG}

EXTERNAL_TOOL_MODULES = set(MODULE_TO_TOOL)
