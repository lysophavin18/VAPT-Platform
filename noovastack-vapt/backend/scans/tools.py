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
    {"id": "dnsx", "name": "dnsx", "module": "dnsx_resolve", "category": "recon", "purpose": "DNS resolution and record enumeration", "safe_default": True},
    {"id": "gobuster", "name": "Gobuster", "module": "gobuster_discovery", "category": "web", "purpose": "Controlled directory, file, DNS, or vhost discovery", "safe_default": False},
    {"id": "naabu", "name": "Naabu", "module": "naabu_scan", "category": "network", "purpose": "Fast port discovery", "safe_default": True},
    {"id": "httpx", "name": "httpx", "module": "httpx_probe", "category": "web", "purpose": "HTTP probing and metadata capture", "safe_default": True},
    {"id": "katana", "name": "Katana", "module": "katana_crawl", "category": "web", "purpose": "Scoped web crawler and path discovery", "safe_default": True},
    {"id": "ffuf", "name": "ffuf", "module": "ffuf_discovery", "category": "web", "purpose": "Controlled content and directory discovery", "safe_default": False},
    {"id": "dalfox", "name": "Dalfox", "module": "dalfox_xss", "category": "web", "purpose": "XSS validation", "safe_default": False},
    {"id": "sqlmap", "name": "SQLMap", "module": "sqlmap_check", "category": "web", "purpose": "SQL injection validation", "safe_default": False},
    {"id": "semgrep", "name": "Semgrep", "module": "semgrep_sast", "category": "code", "purpose": "Static application security testing", "safe_default": True},
    {"id": "bandit", "name": "Bandit", "module": "bandit_sast", "category": "code", "purpose": "Python security static analysis", "safe_default": True},
    {"id": "pip-audit", "name": "pip-audit", "module": "pip_audit", "category": "dependency", "purpose": "Python dependency CVE checks", "safe_default": True},
    {"id": "depx", "name": "depx", "module": "depx_audit", "category": "dependency", "purpose": "Malicious package and supply-chain intelligence audit", "safe_default": True},
    {"id": "trivy", "name": "Trivy", "module": "trivy_scan", "category": "dependency", "purpose": "Container, filesystem, and dependency CVE checks", "safe_default": True},
    {"id": "grype", "name": "Grype", "module": "grype_scan", "category": "dependency", "purpose": "SBOM and dependency vulnerability matching", "safe_default": True},
    # API security
    {"id": "zap", "name": "OWASP ZAP", "module": "zap_api_scan", "category": "api", "purpose": "Active and passive API vulnerability scanning", "safe_default": False},
    {"id": "arjun", "name": "Arjun", "module": "arjun_param_discovery", "category": "api", "purpose": "HTTP parameter discovery for API endpoints", "safe_default": True},
    # Cloud & infrastructure
    {"id": "prowler", "name": "Prowler", "module": "prowler_cloud_audit", "category": "cloud", "purpose": "AWS/GCP/Azure security configuration audit", "safe_default": True},
    {"id": "scoutsuite", "name": "ScoutSuite", "module": "scoutsuite_cloud_audit", "category": "cloud", "purpose": "Multi-cloud security posture assessment", "safe_default": True},
    # Network analysis
    {"id": "masscan", "name": "Masscan", "module": "masscan_port_scan", "category": "network", "purpose": "Fast large-scale port scanning", "safe_default": False},
    {"id": "shodan", "name": "Shodan CLI", "module": "shodan_osint", "category": "recon", "purpose": "Passive OSINT lookup via Shodan for approved targets", "safe_default": True},
]

MODULE_TO_TOOL = {item["module"]: item for item in SCANNER_TOOL_CATALOG}

EXTERNAL_TOOL_MODULES = set(MODULE_TO_TOOL)
