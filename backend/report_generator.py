"""
VAPT Platform - Report Generator Module
Generates PDF, HTML, DOCX, and JSON reports for security assessments
"""
import os
import json
from datetime import datetime
from typing import Optional, List, Dict, Any
from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML, CSS
from docx import Document
from docx.shared import Inches, Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models import Project, Target, Scan, Vulnerability, Report
from schemas import ReportType, ReportFormat, Severity


class ReportGenerator:
    """Generates security assessment reports in multiple formats"""
    
    def __init__(self, db: AsyncSession, reports_dir: str = "/app/reports"):
        self.db = db
        self.reports_dir = reports_dir
        self.template_dir = os.path.join(os.path.dirname(__file__), "templates")
        os.makedirs(self.reports_dir, exist_ok=True)
        
        # Setup Jinja2 template environment
        self.jinja_env = Environment(
            loader=FileSystemLoader(self.template_dir),
            autoescape=True
        )
    
    async def generate_report(
        self,
        project_id: str,
        report_type: ReportType,
        report_format: ReportFormat,
        title: Optional[str] = None
    ) -> Report:
        """Generate a report for a project"""
        
        # Fetch project data
        project = await self._get_project_data(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")
        
        # Generate report content based on type
        report_data = await self._prepare_report_data(project, report_type)
        
        # Create report record
        report_title = title or f"{project['name']} - {report_type.value.title()} Report"
        report = Report(
            title=report_title,
            project_id=project_id,
            report_type=report_type,
            format=report_format,
            status="generating"
        )
        self.db.add(report)
        await self.db.commit()
        await self.db.refresh(report)
        
        try:
            # Generate file based on format
            if report_format == ReportFormat.PDF:
                file_path = await self._generate_pdf(report, report_data)
            elif report_format == ReportFormat.HTML:
                file_path = await self._generate_html(report, report_data)
            elif report_format == ReportFormat.DOCX:
                file_path = await self._generate_docx(report, report_data)
            elif report_format == ReportFormat.JSON:
                file_path = await self._generate_json(report, report_data)
            else:
                raise ValueError(f"Unsupported format: {report_format}")
            
            # Update report with file path
            report.file_path = file_path
            report.status = "completed"
            await self.db.commit()
            
        except Exception as e:
            report.status = "failed"
            await self.db.commit()
            raise e
        
        return report
    
    async def _get_project_data(self, project_id: str) -> Optional[Dict[str, Any]]:
        """Fetch all project data including targets, scans, and vulnerabilities"""
        
        result = await self.db.execute(
            select(Project).where(Project.id == project_id)
        )
        project = result.scalar_one_or_none()
        if not project:
            return None
        
        # Fetch targets
        targets_result = await self.db.execute(
            select(Target).where(Target.project_id == project_id)
        )
        targets = targets_result.scalars().all()
        
        # Fetch scans
        scans_result = await self.db.execute(
            select(Scan).where(Scan.project_id == project_id)
        )
        scans = scans_result.scalars().all()
        
        # Fetch vulnerabilities
        vulns_result = await self.db.execute(
            select(Vulnerability).where(Vulnerability.project_id == project_id)
        )
        vulnerabilities = vulns_result.scalars().all()
        
        return {
            "id": str(project.id),
            "name": project.name,
            "description": project.description,
            "project_type": project.project_type.value,
            "status": project.status.value,
            "start_date": project.start_date,
            "end_date": project.end_date,
            "created_at": project.created_at,
            "targets": [self._target_to_dict(t) for t in targets],
            "scans": [self._scan_to_dict(s) for s in scans],
            "vulnerabilities": [self._vuln_to_dict(v) for v in vulnerabilities]
        }
    
    def _target_to_dict(self, target: Target) -> Dict[str, Any]:
        return {
            "id": str(target.id),
            "name": target.name,
            "target_type": target.target_type.value,
            "host": target.host,
            "port": target.port,
            "url": target.url
        }
    
    def _scan_to_dict(self, scan: Scan) -> Dict[str, Any]:
        return {
            "id": str(scan.id),
            "scan_type": scan.scan_type.value,
            "status": scan.status.value,
            "started_at": scan.started_at,
            "completed_at": scan.completed_at
        }
    
    def _vuln_to_dict(self, vuln: Vulnerability) -> Dict[str, Any]:
        return {
            "id": str(vuln.id),
            "title": vuln.title,
            "description": vuln.description,
            "severity": vuln.severity.value,
            "status": vuln.status.value,
            "cve_id": vuln.cve_id,
            "cvss_score": vuln.cvss_score,
            "affected_url": vuln.affected_url,
            "affected_parameter": vuln.affected_parameter,
            "remediation": vuln.remediation,
            "proof_of_concept": vuln.proof_of_concept,
            "found_by_tool": vuln.found_by_tool
        }
    
    async def _prepare_report_data(
        self,
        project: Dict[str, Any],
        report_type: ReportType
    ) -> Dict[str, Any]:
        """Prepare report data based on report type"""
        
        vulnerabilities = project["vulnerabilities"]
        
        # Calculate statistics
        stats = {
            "total_vulnerabilities": len(vulnerabilities),
            "critical": len([v for v in vulnerabilities if v["severity"] == "critical"]),
            "high": len([v for v in vulnerabilities if v["severity"] == "high"]),
            "medium": len([v for v in vulnerabilities if v["severity"] == "medium"]),
            "low": len([v for v in vulnerabilities if v["severity"] == "low"]),
            "info": len([v for v in vulnerabilities if v["severity"] == "info"]),
            "total_targets": len(project["targets"]),
            "total_scans": len(project["scans"]),
            "completed_scans": len([s for s in project["scans"] if s["status"] == "completed"])
        }
        
        # Calculate risk score
        risk_score = (
            stats["critical"] * 10 +
            stats["high"] * 7 +
            stats["medium"] * 4 +
            stats["low"] * 1
        )
        stats["risk_score"] = min(100, risk_score)
        stats["risk_level"] = self._get_risk_level(stats["risk_score"])
        
        report_data = {
            "project": project,
            "stats": stats,
            "generated_at": datetime.utcnow().isoformat(),
            "report_type": report_type.value
        }
        
        # Filter content based on report type
        if report_type == ReportType.EXECUTIVE:
            # Executive summary - high level overview only
            report_data["vulnerabilities"] = [
                v for v in vulnerabilities 
                if v["severity"] in ["critical", "high"]
            ][:10]  # Top 10 critical/high
            report_data["include_technical"] = False
            report_data["include_poc"] = False
            
        elif report_type == ReportType.TECHNICAL:
            # Technical report - all details
            report_data["vulnerabilities"] = vulnerabilities
            report_data["include_technical"] = True
            report_data["include_poc"] = True
            
        elif report_type == ReportType.COMPLIANCE:
            # Compliance report - focus on compliance mappings
            report_data["vulnerabilities"] = vulnerabilities
            report_data["include_technical"] = False
            report_data["include_poc"] = False
            report_data["compliance_mappings"] = self._get_compliance_mappings(vulnerabilities)
            
        else:  # Full report
            report_data["vulnerabilities"] = vulnerabilities
            report_data["include_technical"] = True
            report_data["include_poc"] = True
        
        return report_data
    
    def _get_risk_level(self, score: int) -> str:
        if score >= 80:
            return "Critical"
        elif score >= 60:
            return "High"
        elif score >= 40:
            return "Medium"
        elif score >= 20:
            return "Low"
        return "Informational"
    
    def _get_compliance_mappings(self, vulnerabilities: List[Dict]) -> Dict[str, List[str]]:
        """Map vulnerabilities to compliance frameworks"""
        mappings = {
            "OWASP Top 10": [],
            "CWE": [],
            "PCI-DSS": [],
            "HIPAA": [],
            "GDPR": []
        }
        
        for vuln in vulnerabilities:
            title_lower = vuln["title"].lower()
            
            # OWASP mappings
            if "injection" in title_lower or "sqli" in title_lower:
                mappings["OWASP Top 10"].append("A03:2021 - Injection")
            if "xss" in title_lower or "cross-site" in title_lower:
                mappings["OWASP Top 10"].append("A03:2021 - Injection")
            if "authentication" in title_lower or "session" in title_lower:
                mappings["OWASP Top 10"].append("A07:2021 - Identification and Authentication Failures")
            if "sensitive" in title_lower or "exposure" in title_lower:
                mappings["OWASP Top 10"].append("A02:2021 - Cryptographic Failures")
            
            # Add CWE if available
            if vuln.get("cve_id"):
                mappings["CWE"].append(vuln["cve_id"])
        
        # Remove duplicates
        for key in mappings:
            mappings[key] = list(set(mappings[key]))
        
        return mappings
    
    async def _generate_pdf(self, report: Report, data: Dict[str, Any]) -> str:
        """Generate PDF report using WeasyPrint"""
        
        # Render HTML template
        html_content = self._render_html_template(data)
        
        # Generate PDF
        file_name = f"{report.id}.pdf"
        file_path = os.path.join(self.reports_dir, file_name)
        
        # CSS for PDF styling
        css = CSS(string='''
            @page { size: A4; margin: 2cm; }
            body { font-family: 'Helvetica', sans-serif; font-size: 11pt; line-height: 1.4; }
            h1 { color: #1a365d; font-size: 24pt; margin-bottom: 20px; }
            h2 { color: #2c5282; font-size: 18pt; margin-top: 30px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; }
            h3 { color: #2d3748; font-size: 14pt; margin-top: 20px; }
            table { width: 100%; border-collapse: collapse; margin: 15px 0; }
            th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; }
            th { background-color: #4a5568; color: white; }
            .critical { color: #e53e3e; font-weight: bold; }
            .high { color: #dd6b20; font-weight: bold; }
            .medium { color: #d69e2e; font-weight: bold; }
            .low { color: #38a169; }
            .info { color: #3182ce; }
            .stat-box { display: inline-block; padding: 15px; margin: 10px; background: #f7fafc; border-radius: 8px; text-align: center; }
            .stat-number { font-size: 28pt; font-weight: bold; color: #2d3748; }
            .stat-label { font-size: 10pt; color: #718096; }
            code { background: #edf2f7; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
            pre { background: #2d3748; color: #e2e8f0; padding: 15px; border-radius: 8px; overflow-x: auto; }
        ''')
        
        HTML(string=html_content).write_pdf(file_path, stylesheets=[css])
        
        return file_path
    
    async def _generate_html(self, report: Report, data: Dict[str, Any]) -> str:
        """Generate standalone HTML report"""
        
        html_content = self._render_html_template(data, standalone=True)
        
        file_name = f"{report.id}.html"
        file_path = os.path.join(self.reports_dir, file_name)
        
        with open(file_path, 'w') as f:
            f.write(html_content)
        
        return file_path
    
    def _render_html_template(self, data: Dict[str, Any], standalone: bool = False) -> str:
        """Render HTML template with data"""
        
        project = data["project"]
        stats = data["stats"]
        vulns = data["vulnerabilities"]
        
        # Build HTML content
        html = f'''
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{project["name"]} - Security Assessment Report</title>
    {"<style>" + self._get_standalone_css() + "</style>" if standalone else ""}
</head>
<body>
    <header>
        <h1>Security Assessment Report</h1>
        <p><strong>Project:</strong> {project["name"]}</p>
        <p><strong>Generated:</strong> {data["generated_at"]}</p>
        <p><strong>Report Type:</strong> {data["report_type"].title()}</p>
    </header>
    
    <section id="executive-summary">
        <h2>Executive Summary</h2>
        <div class="stats-grid">
            <div class="stat-box">
                <div class="stat-number">{stats["total_vulnerabilities"]}</div>
                <div class="stat-label">Total Vulnerabilities</div>
            </div>
            <div class="stat-box critical-bg">
                <div class="stat-number">{stats["critical"]}</div>
                <div class="stat-label">Critical</div>
            </div>
            <div class="stat-box high-bg">
                <div class="stat-number">{stats["high"]}</div>
                <div class="stat-label">High</div>
            </div>
            <div class="stat-box medium-bg">
                <div class="stat-number">{stats["medium"]}</div>
                <div class="stat-label">Medium</div>
            </div>
            <div class="stat-box low-bg">
                <div class="stat-number">{stats["low"]}</div>
                <div class="stat-label">Low</div>
            </div>
        </div>
        <p><strong>Risk Score:</strong> {stats["risk_score"]}/100 ({stats["risk_level"]})</p>
    </section>
    
    <section id="scope">
        <h2>Assessment Scope</h2>
        <p><strong>Targets Assessed:</strong> {stats["total_targets"]}</p>
        <p><strong>Scans Completed:</strong> {stats["completed_scans"]}/{stats["total_scans"]}</p>
        <table>
            <thead>
                <tr>
                    <th>Target</th>
                    <th>Type</th>
                    <th>Host/URL</th>
                </tr>
            </thead>
            <tbody>
                {"".join(f'<tr><td>{t["name"]}</td><td>{t["target_type"]}</td><td>{t.get("url") or t.get("host", "N/A")}</td></tr>' for t in project["targets"])}
            </tbody>
        </table>
    </section>
    
    <section id="findings">
        <h2>Vulnerability Findings</h2>
        {"".join(self._render_vulnerability_html(v, data.get("include_technical", False), data.get("include_poc", False)) for v in vulns)}
    </section>
    
    <section id="recommendations">
        <h2>Recommendations</h2>
        <ol>
            <li>Address all <strong>Critical</strong> and <strong>High</strong> severity vulnerabilities immediately.</li>
            <li>Implement a regular vulnerability scanning schedule.</li>
            <li>Conduct security awareness training for development teams.</li>
            <li>Establish a secure development lifecycle (SDLC) process.</li>
            <li>Perform regular penetration testing on a quarterly basis.</li>
        </ol>
    </section>
    
    <footer>
        <p>Generated by VAPT Platform | Confidential</p>
    </footer>
</body>
</html>
'''
        return html
    
    def _render_vulnerability_html(self, vuln: Dict, include_technical: bool, include_poc: bool) -> str:
        """Render single vulnerability as HTML"""
        
        severity_class = vuln["severity"]
        
        html = f'''
        <div class="vulnerability {severity_class}">
            <h3>{vuln["title"]}</h3>
            <p class="severity {severity_class}">Severity: {vuln["severity"].upper()}</p>
            {f'<p><strong>CVE:</strong> {vuln["cve_id"]}</p>' if vuln.get("cve_id") else ''}
            {f'<p><strong>CVSS Score:</strong> {vuln["cvss_score"]}</p>' if vuln.get("cvss_score") else ''}
            <p><strong>Status:</strong> {vuln["status"]}</p>
            
            <h4>Description</h4>
            <p>{vuln.get("description", "No description available.")}</p>
            
            {f'<p><strong>Affected URL:</strong> <code>{vuln["affected_url"]}</code></p>' if vuln.get("affected_url") else ''}
            {f'<p><strong>Affected Parameter:</strong> <code>{vuln["affected_parameter"]}</code></p>' if include_technical and vuln.get("affected_parameter") else ''}
            
            {f'<h4>Proof of Concept</h4><pre>{vuln["proof_of_concept"]}</pre>' if include_poc and vuln.get("proof_of_concept") else ''}
            
            <h4>Remediation</h4>
            <p>{vuln.get("remediation", "Consult security best practices for remediation guidance.")}</p>
        </div>
        <hr>
        '''
        return html
    
    def _get_standalone_css(self) -> str:
        """CSS for standalone HTML reports"""
        return '''
            * { box-sizing: border-box; }
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 1200px; margin: 0 auto; padding: 40px; background: #f8fafc; color: #1a202c; }
            header { background: linear-gradient(135deg, #1a365d, #2c5282); color: white; padding: 40px; border-radius: 12px; margin-bottom: 30px; }
            header h1 { margin: 0 0 20px 0; font-size: 32px; }
            header p { margin: 5px 0; opacity: 0.9; }
            section { background: white; padding: 30px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
            h2 { color: #2c5282; border-bottom: 3px solid #4299e1; padding-bottom: 10px; }
            h3 { color: #2d3748; }
            h4 { color: #4a5568; margin-top: 15px; }
            .stats-grid { display: flex; flex-wrap: wrap; gap: 15px; margin: 20px 0; }
            .stat-box { flex: 1; min-width: 120px; padding: 20px; background: #f7fafc; border-radius: 8px; text-align: center; border: 1px solid #e2e8f0; }
            .stat-number { font-size: 36px; font-weight: bold; }
            .stat-label { color: #718096; margin-top: 5px; }
            .critical-bg { background: #fed7d7; border-color: #fc8181; }
            .critical-bg .stat-number { color: #c53030; }
            .high-bg { background: #feebc8; border-color: #f6ad55; }
            .high-bg .stat-number { color: #c05621; }
            .medium-bg { background: #fefcbf; border-color: #f6e05e; }
            .medium-bg .stat-number { color: #b7791f; }
            .low-bg { background: #c6f6d5; border-color: #68d391; }
            .low-bg .stat-number { color: #276749; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #e2e8f0; }
            th { background: #4a5568; color: white; font-weight: 600; }
            tr:hover { background: #f7fafc; }
            .vulnerability { padding: 20px; margin: 15px 0; border-radius: 8px; border-left: 4px solid; }
            .vulnerability.critical { border-color: #e53e3e; background: #fff5f5; }
            .vulnerability.high { border-color: #dd6b20; background: #fffaf0; }
            .vulnerability.medium { border-color: #d69e2e; background: #fffff0; }
            .vulnerability.low { border-color: #38a169; background: #f0fff4; }
            .vulnerability.info { border-color: #3182ce; background: #ebf8ff; }
            .severity { font-weight: bold; padding: 4px 12px; border-radius: 20px; display: inline-block; }
            .severity.critical { background: #e53e3e; color: white; }
            .severity.high { background: #dd6b20; color: white; }
            .severity.medium { background: #d69e2e; color: white; }
            .severity.low { background: #38a169; color: white; }
            .severity.info { background: #3182ce; color: white; }
            code { background: #edf2f7; padding: 2px 8px; border-radius: 4px; font-family: 'Consolas', monospace; }
            pre { background: #2d3748; color: #e2e8f0; padding: 20px; border-radius: 8px; overflow-x: auto; font-family: 'Consolas', monospace; font-size: 13px; }
            footer { text-align: center; padding: 30px; color: #718096; border-top: 1px solid #e2e8f0; margin-top: 40px; }
            hr { border: none; border-top: 1px solid #e2e8f0; margin: 20px 0; }
            ol { padding-left: 25px; }
            ol li { margin: 10px 0; line-height: 1.6; }
        '''
    
    async def _generate_docx(self, report: Report, data: Dict[str, Any]) -> str:
        """Generate Word document report"""
        
        doc = Document()
        project = data["project"]
        stats = data["stats"]
        vulns = data["vulnerabilities"]
        
        # Title
        title = doc.add_heading(f'Security Assessment Report', 0)
        title.alignment = WD_ALIGN_PARAGRAPH.CENTER
        
        # Project Info
        doc.add_paragraph(f'Project: {project["name"]}')
        doc.add_paragraph(f'Generated: {data["generated_at"]}')
        doc.add_paragraph(f'Report Type: {data["report_type"].title()}')
        
        # Executive Summary
        doc.add_heading('Executive Summary', level=1)
        doc.add_paragraph(
            f'This security assessment identified {stats["total_vulnerabilities"]} vulnerabilities '
            f'across {stats["total_targets"]} targets. The overall risk score is '
            f'{stats["risk_score"]}/100 ({stats["risk_level"]}).'
        )
        
        # Statistics table
        table = doc.add_table(rows=2, cols=5)
        table.style = 'Table Grid'
        headers = ['Critical', 'High', 'Medium', 'Low', 'Info']
        values = [stats["critical"], stats["high"], stats["medium"], stats["low"], stats["info"]]
        
        for i, header in enumerate(headers):
            table.rows[0].cells[i].text = header
            table.rows[1].cells[i].text = str(values[i])
        
        # Findings
        doc.add_heading('Vulnerability Findings', level=1)
        
        for vuln in vulns:
            doc.add_heading(vuln["title"], level=2)
            doc.add_paragraph(f'Severity: {vuln["severity"].upper()}')
            if vuln.get("cve_id"):
                doc.add_paragraph(f'CVE: {vuln["cve_id"]}')
            doc.add_paragraph(vuln.get("description", "No description available."))
            
            if vuln.get("remediation"):
                doc.add_heading('Remediation', level=3)
                doc.add_paragraph(vuln["remediation"])
        
        # Recommendations
        doc.add_heading('Recommendations', level=1)
        recommendations = [
            'Address all Critical and High severity vulnerabilities immediately.',
            'Implement a regular vulnerability scanning schedule.',
            'Conduct security awareness training for development teams.',
            'Establish a secure development lifecycle (SDLC) process.',
            'Perform regular penetration testing on a quarterly basis.'
        ]
        for rec in recommendations:
            doc.add_paragraph(rec, style='List Bullet')
        
        # Save
        file_name = f"{report.id}.docx"
        file_path = os.path.join(self.reports_dir, file_name)
        doc.save(file_path)
        
        return file_path
    
    async def _generate_json(self, report: Report, data: Dict[str, Any]) -> str:
        """Generate JSON report"""
        
        file_name = f"{report.id}.json"
        file_path = os.path.join(self.reports_dir, file_name)
        
        # Clean data for JSON serialization
        json_data = {
            "report_id": str(report.id),
            "title": report.title,
            "generated_at": data["generated_at"],
            "report_type": data["report_type"],
            "project": {
                "id": data["project"]["id"],
                "name": data["project"]["name"],
                "description": data["project"]["description"],
                "type": data["project"]["project_type"],
                "status": data["project"]["status"]
            },
            "statistics": data["stats"],
            "targets": data["project"]["targets"],
            "scans": data["project"]["scans"],
            "vulnerabilities": data["vulnerabilities"]
        }
        
        with open(file_path, 'w') as f:
            json.dump(json_data, f, indent=2, default=str)
        
        return file_path
