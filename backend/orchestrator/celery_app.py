"""
VAPT Platform - Celery Application and Tasks
"""
from celery import Celery
from datetime import datetime
import os
import json
import subprocess
import docker
from typing import Dict, Any

# Initialize Celery
celery_app = Celery(
    'vapt_orchestrator',
    broker=os.getenv('CELERY_BROKER_URL', 'redis://:VaptRedis2024!@localhost:6379/1'),
    backend=os.getenv('CELERY_RESULT_BACKEND', 'redis://:VaptRedis2024!@localhost:6379/2')
)

celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    task_track_started=True,
    task_time_limit=3600,  # 1 hour max
    worker_prefetch_multiplier=1,
    task_acks_late=True,
)

# Docker client
try:
    docker_client = docker.from_env()
except:
    docker_client = None


def update_scan_status(scan_id: str, status: str, progress: int = None, results: Dict = None):
    """Update scan status in database"""
    from sqlalchemy import create_engine, Column, String, Integer, DateTime, JSON, text
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.dialects.postgresql import UUID
    
    DATABASE_URL = os.getenv('DATABASE_URL', '').replace('+asyncpg', '')
    if not DATABASE_URL:
        return
    
    engine = create_engine(DATABASE_URL)
    
    # Use raw SQL to avoid import issues
    with engine.connect() as conn:
        if status == 'completed' or status == 'failed':
            if results:
                conn.execute(text("""
                    UPDATE scans SET status = :status, progress = :progress, 
                    results_summary = :results, completed_at = NOW(), updated_at = NOW()
                    WHERE id = :scan_id
                """), {"status": status, "progress": progress or 100, 
                       "results": json.dumps(results), "scan_id": scan_id})
            else:
                conn.execute(text("""
                    UPDATE scans SET status = :status, progress = :progress, 
                    completed_at = NOW(), updated_at = NOW()
                    WHERE id = :scan_id
                """), {"status": status, "progress": progress or 100, "scan_id": scan_id})
        else:
            if progress is not None:
                conn.execute(text("""
                    UPDATE scans SET status = :status, progress = :progress, updated_at = NOW()
                    WHERE id = :scan_id
                """), {"status": status, "progress": progress, "scan_id": scan_id})
            else:
                conn.execute(text("""
                    UPDATE scans SET status = :status, updated_at = NOW()
                    WHERE id = :scan_id
                """), {"status": status, "scan_id": scan_id})
        conn.commit()


def save_vulnerability(scan_id: str, vuln_data: Dict):
    """Save vulnerability to database"""
    from sqlalchemy import create_engine, text
    import uuid
    
    DATABASE_URL = os.getenv('DATABASE_URL', '').replace('+asyncpg', '')
    if not DATABASE_URL:
        return
    
    engine = create_engine(DATABASE_URL)
    
    # Get scan info first
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT project_id, target_id FROM scans WHERE id = :scan_id
        """), {"scan_id": scan_id})
        row = result.fetchone()
        if not row:
            return
        project_id, target_id = row[0], row[1]
        
        # Insert vulnerability
        vuln_id = str(uuid.uuid4())
        conn.execute(text("""
            INSERT INTO vulnerabilities (id, scan_id, project_id, target_id, 
                title, severity, cvss_score, description, affected_component,
                evidence, remediation, references, false_positive, verified, status, created_at)
            VALUES (:id, :scan_id, :project_id, :target_id,
                :title, :severity, :cvss_score, :description, :affected_component,
                :evidence, :remediation, :references, :false_positive, :verified, :status, NOW())
        """), {
            "id": vuln_id,
            "scan_id": scan_id,
            "project_id": project_id,
            "target_id": target_id,
            "title": vuln_data.get('title', 'Unknown'),
            "severity": vuln_data.get('severity', 'info'),
            "cvss_score": vuln_data.get('cvss_score'),
            "description": vuln_data.get('description', ''),
            "affected_component": vuln_data.get('affected_component'),
            "evidence": json.dumps(vuln_data.get('evidence', {})),
            "remediation": vuln_data.get('remediation'),
            "references": json.dumps(vuln_data.get('references', [])),
            "false_positive": False,
            "verified": False,
            "status": "open"
        })
        conn.commit()


@celery_app.task(bind=True, name='scan_orchestrator')
def scan_orchestrator(self, scan_id: str, scan_type: str, target: str, config: Dict = None):
    """
    Main scan orchestrator task
    Routes to appropriate scanner based on scan_type
    """
    config = config or {}
    
    try:
        update_scan_status(scan_id, 'running', progress=0)
        
        # Route to appropriate scanner
        scanners = {
            'nmap': run_nmap_scan,
            'nikto': run_nikto_scan,
            'nuclei': run_nuclei_scan,
            'zap': run_zap_scan,
            'sqlmap': run_sqlmap_scan,
            'gobuster': run_gobuster_scan,
            'dirb': run_dirb_scan,
            'katana': run_katana_scan,
            'wpscan': run_wpscan_scan,
            'hydra': run_hydra_scan,
            'full': run_full_scan,
        }
        
        scanner_func = scanners.get(scan_type)
        if not scanner_func:
            raise ValueError(f"Unknown scan type: {scan_type}")
        
        results = scanner_func(scan_id, target, config, self)
        
        update_scan_status(scan_id, 'completed', progress=100, results=results)
        return results
        
    except Exception as e:
        update_scan_status(scan_id, 'failed', results={'error': str(e)})
        raise


def run_nmap_scan(scan_id: str, target: str, config: Dict, task) -> Dict:
    """Run Nmap scan"""
    update_scan_status(scan_id, 'running', progress=10)
    
    ports = config.get('ports', '1-1000')
    args = config.get('extra_args', [])
    
    # Build command
    cmd = ['docker', 'exec', 'vapt-nmap', 'nmap', '-sV', '-sC', '-p', ports, '-oX', '-']
    cmd.extend(args)
    cmd.append(target)
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=config.get('timeout', 600))
        update_scan_status(scan_id, 'running', progress=80)
        
        # Parse results
        findings = parse_nmap_results(result.stdout)
        
        # Save vulnerabilities
        for finding in findings.get('vulnerabilities', []):
            save_vulnerability(scan_id, finding)
        
        return {
            'tool': 'nmap',
            'target': target,
            'hosts_found': findings.get('hosts_count', 0),
            'ports_found': findings.get('ports_count', 0),
            'vulnerabilities_found': len(findings.get('vulnerabilities', [])),
            'raw_output': result.stdout[:10000]  # Truncate
        }
    except subprocess.TimeoutExpired:
        return {'error': 'Scan timed out'}
    except Exception as e:
        return {'error': str(e)}


def run_nikto_scan(scan_id: str, target: str, config: Dict, task) -> Dict:
    """Run Nikto scan"""
    update_scan_status(scan_id, 'running', progress=10)
    
    cmd = ['docker', 'exec', 'vapt-nikto', 'nikto', '-h', target, '-Format', 'json']
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=config.get('timeout', 1800))
        update_scan_status(scan_id, 'running', progress=80)
        
        # Parse and save findings
        findings = parse_nikto_results(result.stdout)
        for finding in findings:
            save_vulnerability(scan_id, finding)
        
        return {
            'tool': 'nikto',
            'target': target,
            'vulnerabilities_found': len(findings),
            'raw_output': result.stdout[:10000]
        }
    except subprocess.TimeoutExpired:
        return {'error': 'Scan timed out'}
    except Exception as e:
        return {'error': str(e)}


def run_nuclei_scan(scan_id: str, target: str, config: Dict, task) -> Dict:
    """Run Nuclei scan"""
    update_scan_status(scan_id, 'running', progress=10)
    
    templates = config.get('templates', '')
    severity = config.get('severity', 'critical,high,medium')
    
    cmd = ['docker', 'exec', 'vapt-nuclei', 'nuclei', '-u', target, '-json', '-severity', severity]
    if templates:
        cmd.extend(['-t', templates])
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=config.get('timeout', 1800))
        update_scan_status(scan_id, 'running', progress=80)
        
        findings = parse_nuclei_results(result.stdout)
        for finding in findings:
            save_vulnerability(scan_id, finding)
        
        return {
            'tool': 'nuclei',
            'target': target,
            'vulnerabilities_found': len(findings),
            'raw_output': result.stdout[:10000]
        }
    except subprocess.TimeoutExpired:
        return {'error': 'Scan timed out'}
    except Exception as e:
        return {'error': str(e)}


def run_zap_scan(scan_id: str, target: str, config: Dict, task) -> Dict:
    """Run OWASP ZAP scan"""
    import requests
    
    update_scan_status(scan_id, 'running', progress=10)
    
    zap_url = os.getenv('ZAP_API_URL', 'http://zap:8080')
    api_key = os.getenv('ZAP_API_KEY', 'zap-api-key-2024')
    
    try:
        # Start spider
        requests.get(f"{zap_url}/JSON/spider/action/scan/", params={
            'apikey': api_key,
            'url': target
        })
        update_scan_status(scan_id, 'running', progress=30)
        
        # Wait for spider
        import time
        while True:
            status = requests.get(f"{zap_url}/JSON/spider/view/status/", params={
                'apikey': api_key
            }).json()
            if int(status.get('status', '100')) >= 100:
                break
            time.sleep(5)
        
        # Start active scan
        requests.get(f"{zap_url}/JSON/ascan/action/scan/", params={
            'apikey': api_key,
            'url': target
        })
        update_scan_status(scan_id, 'running', progress=50)
        
        # Wait for scan
        while True:
            status = requests.get(f"{zap_url}/JSON/ascan/view/status/", params={
                'apikey': api_key
            }).json()
            if int(status.get('status', '100')) >= 100:
                break
            time.sleep(10)
        
        update_scan_status(scan_id, 'running', progress=80)
        
        # Get alerts
        alerts = requests.get(f"{zap_url}/JSON/core/view/alerts/", params={
            'apikey': api_key,
            'baseurl': target
        }).json()
        
        findings = parse_zap_results(alerts.get('alerts', []))
        for finding in findings:
            save_vulnerability(scan_id, finding)
        
        return {
            'tool': 'zap',
            'target': target,
            'vulnerabilities_found': len(findings),
            'alerts': alerts.get('alerts', [])[:50]  # Limit
        }
    except Exception as e:
        return {'error': str(e)}


def run_sqlmap_scan(scan_id: str, target: str, config: Dict, task) -> Dict:
    """Run SQLMap scan"""
    update_scan_status(scan_id, 'running', progress=10)
    
    cmd = ['docker', 'exec', 'vapt-sqlmap', 'python', '/sqlmap/sqlmap.py', 
           '-u', target, '--batch', '--random-agent', '--level=3']
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=config.get('timeout', 1800))
        update_scan_status(scan_id, 'running', progress=80)
        
        # Check for SQL injection
        vuln_found = 'is vulnerable' in result.stdout.lower()
        
        if vuln_found:
            save_vulnerability(scan_id, {
                'title': 'SQL Injection Vulnerability',
                'description': 'SQLMap detected SQL injection vulnerability',
                'severity': 'critical',
                'cvss_score': 9.8,
                'cwe_id': 'CWE-89',
                'affected_url': target,
                'evidence': result.stdout[:2000],
                'remediation': 'Use parameterized queries and input validation',
                'found_by_tool': 'sqlmap'
            })
        
        return {
            'tool': 'sqlmap',
            'target': target,
            'vulnerable': vuln_found,
            'raw_output': result.stdout[:10000]
        }
    except subprocess.TimeoutExpired:
        return {'error': 'Scan timed out'}
    except Exception as e:
        return {'error': str(e)}


def run_gobuster_scan(scan_id: str, target: str, config: Dict, task) -> Dict:
    """Run Gobuster scan"""
    update_scan_status(scan_id, 'running', progress=10)
    
    wordlist = config.get('wordlist', '/wordlists/common.txt')
    threads = config.get('threads', 10)
    
    cmd = ['docker', 'exec', 'vapt-gobuster', 'gobuster', 'dir',
           '-u', target, '-w', wordlist, '-t', str(threads), '-o', '-']
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=config.get('timeout', 600))
        update_scan_status(scan_id, 'running', progress=80)
        
        directories = parse_gobuster_results(result.stdout)
        
        return {
            'tool': 'gobuster',
            'target': target,
            'directories_found': len(directories),
            'directories': directories[:100],
            'raw_output': result.stdout[:10000]
        }
    except subprocess.TimeoutExpired:
        return {'error': 'Scan timed out'}
    except Exception as e:
        return {'error': str(e)}


def run_dirb_scan(scan_id: str, target: str, config: Dict, task) -> Dict:
    """Run Dirb scan (similar to Gobuster)"""
    return run_gobuster_scan(scan_id, target, config, task)


def run_katana_scan(scan_id: str, target: str, config: Dict, task) -> Dict:
    """Run Katana crawler"""
    update_scan_status(scan_id, 'running', progress=10)
    
    depth = config.get('depth', 3)
    
    cmd = ['docker', 'exec', 'vapt-katana', 'katana', '-u', target, '-d', str(depth), '-json']
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=config.get('timeout', 600))
        update_scan_status(scan_id, 'running', progress=80)
        
        urls = parse_katana_results(result.stdout)
        
        return {
            'tool': 'katana',
            'target': target,
            'urls_found': len(urls),
            'urls': urls[:200],
            'raw_output': result.stdout[:10000]
        }
    except subprocess.TimeoutExpired:
        return {'error': 'Scan timed out'}
    except Exception as e:
        return {'error': str(e)}


def run_wpscan_scan(scan_id: str, target: str, config: Dict, task) -> Dict:
    """Run WPScan"""
    update_scan_status(scan_id, 'running', progress=10)
    
    api_token = os.getenv('WPSCAN_API_TOKEN', '')
    
    cmd = ['docker', 'exec', 'vapt-wpscan', 'wpscan', '--url', target, '--format', 'json']
    if api_token:
        cmd.extend(['--api-token', api_token])
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=config.get('timeout', 1200))
        update_scan_status(scan_id, 'running', progress=80)
        
        findings = parse_wpscan_results(result.stdout)
        for finding in findings:
            save_vulnerability(scan_id, finding)
        
        return {
            'tool': 'wpscan',
            'target': target,
            'vulnerabilities_found': len(findings),
            'raw_output': result.stdout[:10000]
        }
    except subprocess.TimeoutExpired:
        return {'error': 'Scan timed out'}
    except Exception as e:
        return {'error': str(e)}


def run_hydra_scan(scan_id: str, target: str, config: Dict, task) -> Dict:
    """Run Hydra password brute-force"""
    update_scan_status(scan_id, 'running', progress=10)
    
    service = config.get('service', 'ssh')
    userlist = config.get('userlist', '/wordlists/users.txt')
    passlist = config.get('passlist', '/wordlists/passwords.txt')
    
    cmd = ['docker', 'exec', 'vapt-hydra', 'hydra', '-L', userlist, '-P', passlist,
           target, service, '-t', '4']
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=config.get('timeout', 1800))
        update_scan_status(scan_id, 'running', progress=80)
        
        # Check for found credentials
        creds_found = 'login:' in result.stdout.lower()
        
        if creds_found:
            save_vulnerability(scan_id, {
                'title': 'Weak Credentials Found',
                'description': f'Hydra found weak credentials for {service}',
                'severity': 'high',
                'cvss_score': 8.1,
                'cwe_id': 'CWE-521',
                'affected_component': service,
                'evidence': result.stdout[:1000],
                'remediation': 'Use strong, unique passwords and enable account lockout',
                'found_by_tool': 'hydra'
            })
        
        return {
            'tool': 'hydra',
            'target': target,
            'service': service,
            'credentials_found': creds_found,
            'raw_output': result.stdout[:5000]
        }
    except subprocess.TimeoutExpired:
        return {'error': 'Scan timed out'}
    except Exception as e:
        return {'error': str(e)}


def run_full_scan(scan_id: str, target: str, config: Dict, task) -> Dict:
    """Run full scan with multiple tools"""
    results = {}
    
    # Nmap
    update_scan_status(scan_id, 'running', progress=10)
    results['nmap'] = run_nmap_scan(scan_id, target, config, task)
    
    # Nikto
    update_scan_status(scan_id, 'running', progress=30)
    results['nikto'] = run_nikto_scan(scan_id, target, config, task)
    
    # Nuclei
    update_scan_status(scan_id, 'running', progress=50)
    results['nuclei'] = run_nuclei_scan(scan_id, target, config, task)
    
    # Gobuster
    update_scan_status(scan_id, 'running', progress=70)
    results['gobuster'] = run_gobuster_scan(scan_id, target, config, task)
    
    # ZAP
    update_scan_status(scan_id, 'running', progress=90)
    results['zap'] = run_zap_scan(scan_id, target, config, task)
    
    total_vulns = sum(r.get('vulnerabilities_found', 0) for r in results.values() if isinstance(r, dict))
    
    return {
        'tool': 'full',
        'target': target,
        'total_vulnerabilities': total_vulns,
        'scan_results': results
    }


# Parser functions
def parse_nmap_results(xml_output: str) -> Dict:
    """Parse Nmap XML output"""
    from defusedxml import ElementTree as ET
    
    try:
        root = ET.fromstring(xml_output)
        findings = {'hosts_count': 0, 'ports_count': 0, 'vulnerabilities': []}
        
        for host in root.findall('.//host'):
            findings['hosts_count'] += 1
            
            for port in host.findall('.//port'):
                findings['ports_count'] += 1
                
                for script in port.findall('.//script'):
                    if 'vuln' in script.get('id', '').lower():
                        findings['vulnerabilities'].append({
                            'title': script.get('id'),
                            'description': script.get('output', ''),
                            'severity': 'medium',
                            'affected_component': f"Port {port.get('portid')}",
                            'found_by_tool': 'nmap'
                        })
        
        return findings
    except:
        return {'hosts_count': 0, 'ports_count': 0, 'vulnerabilities': []}


def parse_nikto_results(json_output: str) -> list:
    """Parse Nikto JSON output"""
    findings = []
    try:
        data = json.loads(json_output)
        for vuln in data.get('vulnerabilities', []):
            findings.append({
                'title': vuln.get('msg', 'Nikto Finding'),
                'description': vuln.get('msg', ''),
                'severity': 'medium',
                'affected_url': vuln.get('url', ''),
                'found_by_tool': 'nikto'
            })
    except:
        pass
    return findings


def parse_nuclei_results(json_output: str) -> list:
    """Parse Nuclei JSON output"""
    findings = []
    severity_map = {'critical': 'critical', 'high': 'high', 'medium': 'medium', 'low': 'low', 'info': 'info'}
    
    for line in json_output.strip().split('\n'):
        try:
            data = json.loads(line)
            findings.append({
                'title': data.get('info', {}).get('name', 'Nuclei Finding'),
                'description': data.get('info', {}).get('description', ''),
                'severity': severity_map.get(data.get('info', {}).get('severity', 'info'), 'info'),
                'cve_id': ','.join(data.get('info', {}).get('classification', {}).get('cve-id', [])),
                'cwe_id': ','.join(data.get('info', {}).get('classification', {}).get('cwe-id', [])),
                'affected_url': data.get('matched-at', ''),
                'remediation': data.get('info', {}).get('remediation', ''),
                'references': data.get('info', {}).get('reference', []),
                'found_by_tool': 'nuclei'
            })
        except:
            continue
    return findings


def parse_zap_results(alerts: list) -> list:
    """Parse ZAP alerts"""
    risk_map = {'3': 'high', '2': 'medium', '1': 'low', '0': 'info'}
    
    findings = []
    for alert in alerts:
        findings.append({
            'title': alert.get('name', 'ZAP Finding'),
            'description': alert.get('description', ''),
            'severity': risk_map.get(str(alert.get('riskcode', 0)), 'info'),
            'cwe_id': f"CWE-{alert.get('cweid')}" if alert.get('cweid') else None,
            'affected_url': alert.get('url', ''),
            'evidence': alert.get('evidence', ''),
            'remediation': alert.get('solution', ''),
            'found_by_tool': 'zap'
        })
    return findings


def parse_gobuster_results(output: str) -> list:
    """Parse Gobuster output"""
    directories = []
    for line in output.strip().split('\n'):
        if line.startswith('/') or 'Status:' in line:
            directories.append(line.strip())
    return directories


def parse_katana_results(json_output: str) -> list:
    """Parse Katana JSON output"""
    urls = []
    for line in json_output.strip().split('\n'):
        try:
            data = json.loads(line)
            urls.append(data.get('request', {}).get('endpoint', ''))
        except:
            continue
    return [u for u in urls if u]


def parse_wpscan_results(json_output: str) -> list:
    """Parse WPScan JSON output"""
    findings = []
    try:
        data = json.loads(json_output)
        
        # Check for vulnerable plugins
        for plugin, info in data.get('plugins', {}).items():
            for vuln in info.get('vulnerabilities', []):
                findings.append({
                    'title': vuln.get('title', f'WordPress Plugin Vulnerability: {plugin}'),
                    'description': vuln.get('description', ''),
                    'severity': 'high',
                    'cve_id': ','.join(vuln.get('references', {}).get('cve', [])),
                    'affected_component': f'Plugin: {plugin}',
                    'remediation': 'Update the plugin to the latest version',
                    'found_by_tool': 'wpscan'
                })
        
        # Check for vulnerable themes
        for theme, info in data.get('themes', {}).items():
            for vuln in info.get('vulnerabilities', []):
                findings.append({
                    'title': vuln.get('title', f'WordPress Theme Vulnerability: {theme}'),
                    'description': vuln.get('description', ''),
                    'severity': 'high',
                    'cve_id': ','.join(vuln.get('references', {}).get('cve', [])),
                    'affected_component': f'Theme: {theme}',
                    'remediation': 'Update the theme to the latest version',
                    'found_by_tool': 'wpscan'
                })
    except:
        pass
    return findings


@celery_app.task(bind=True, name='generate_report_task')
def generate_report_task(self, report_id: str, project_id: str, report_type: str, format: str):
    """Generate report task"""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    
    DATABASE_URL = os.getenv('DATABASE_URL', '').replace('+asyncpg', '')
    engine = create_engine(DATABASE_URL)
    Session = sessionmaker(bind=engine)
    session = Session()
    
    try:
        from models import Report, Project, Vulnerability
        from report_generator import generate_report
        
        report = session.query(Report).filter(Report.id == report_id).first()
        if not report:
            return {'error': 'Report not found'}
        
        project = session.query(Project).filter(Project.id == project_id).first()
        vulns = session.query(Vulnerability).filter(Vulnerability.project_id == project_id).all()
        
        # Generate report
        file_path = generate_report(project, vulns, report_type, format)
        
        report.file_path = file_path
        report.status = 'completed'
        session.commit()
        
        return {'status': 'completed', 'file_path': file_path}
    except Exception as e:
        report = session.query(Report).filter(Report.id == report_id).first()
        if report:
            report.status = 'failed'
            session.commit()
        return {'error': str(e)}
    finally:
        session.close()
