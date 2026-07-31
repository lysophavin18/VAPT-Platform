"""
NoovaStack VAPT Platform - Report Routes
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import HTMLResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from datetime import datetime
from html import escape
from io import BytesIO

from database import get_db
from database.models import Asset, Finding, Project, Scan, ScanAsset, ScanModule
from auth import require_user, User
from api.schemas import ReportGenerateRequest, ReportResponse
from config import settings
from reporting.professional_report import (
    normalize_report,
    render_docx_report,
    render_evidence_zip,
    render_html_report,
    render_markdown_report,
    render_pdf_report,
)

router = APIRouter()

BRAND_PRODUCT_NAME = "NoovaStack VAPT"
BRAND_REPORT_TITLE = "NoovaStack VAPT Technical Security Assessment Report"
BRAND_COMPANY_NAME = "Noova Stack Technology Co., Ltd."
BRAND_CONFIDENTIALITY = "CONFIDENTIAL"
BRAND_DISTRIBUTION_NOTICE = "Do not distribute without authorization"
BRAND_PRIMARY_BLUE = "#0B5E9E"
BRAND_DARK_BLUE = "#083F6B"
BRAND_LIGHT_BLUE = "#EAF4FB"
BRAND_NAVY = "#0B1F33"


@router.post("/generate", response_model=ReportResponse)
async def generate_report(
    request: ReportGenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    result = await db.execute(select(Scan).where(Scan.id == request.scan_id))
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    from workers.celery_app import generate_report_task
    task = generate_report_task.delay(
        str(scan.id), request.report_type, request.format, request.include_evidence
    )
    return {
        "id": task.id,
        "scan_id": str(scan.id),
        "format": request.format,
        "status": "generating",
    }


@router.get("/scan/{scan_id}/data")
async def get_scan_report_data(
    scan_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Scan).where(Scan.id == scan_id))
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    project_result = await db.execute(select(Project).where(Project.id == scan.project_id))
    project = project_result.scalar_one_or_none()

    asset_result = await db.execute(
        select(Asset)
        .join(ScanAsset, ScanAsset.asset_id == Asset.id)
        .where(ScanAsset.scan_id == scan_id)
    )
    assets = asset_result.scalars().all()

    finding_result = await db.execute(
        select(Finding)
        .options(selectinload(Finding.evidence_items), selectinload(Finding.asset))
        .where(Finding.scan_id == scan_id)
    )
    findings = finding_result.scalars().all()

    module_result = await db.execute(
        select(ScanModule).where(ScanModule.scan_id == scan_id).order_by(ScanModule.started_at)
    )
    modules = module_result.scalars().all()

    severity_counts: dict[str, int] = {}
    for finding in findings:
        severity_counts[finding.severity] = severity_counts.get(finding.severity, 0) + 1

    ordered_severities = ["critical", "high", "medium", "low", "informational"]
    highest_severity = next((severity for severity in ordered_severities if severity_counts.get(severity)), "none")
    risk_rating = {
        "critical": "Critical",
        "high": "High",
        "medium": "Medium",
        "low": "Low",
        "informational": "Informational",
        "none": "No Confirmed Risk",
    }[highest_severity]

    module_rows = [
        {
            "name": module.module_name,
            "status": module.status,
            "started_at": module.started_at.isoformat() if module.started_at else None,
            "completed_at": module.completed_at.isoformat() if module.completed_at else None,
            "issues_found": (module.output or {}).get("issues_found", 0),
            "checks_performed": (module.output or {}).get("checks_performed", 0),
            "message": (module.output or {}).get("message"),
        }
        for module in modules
    ]
    discovered_services = _extract_discovered_services(modules)
    remediation_plan = _build_remediation_plan(findings)
    finding_payload = [
        {
            "id": str(finding.id),
            "title": _public_finding_text(finding.title),
            "severity": finding.severity,
            "status": finding.status,
            "integrity_status": finding.integrity_status,
            "description": _public_finding_text(finding.description),
            "owasp_category": finding.owasp_category,
            "cwe_id": finding.cwe_id,
            "cvss_score": finding.cvss_score,
            "remediation": _public_finding_text(finding.remediation),
            "affected_asset": finding.asset.value if finding.asset else None,
            "evidence": _finding_evidence_payload(finding),
        }
        for finding in findings
    ]

    report = {
        "report_name": "NoovaStack Vulnerability Assessment Report",
        "report_type": "vulnerability_assessment",
        "classification": "Internal / Authorized Security Testing",
        "generated_by": {
            "id": "noovastack-platform",
            "name": BRAND_PRODUCT_NAME,
            "email": "system@noovastack.local",
            "role": "automated_report_service",
        },
        "viewed_by": None,
        "generated_at": datetime.utcnow().isoformat(),
        "scan": {
            "id": str(scan.id),
            "name": scan.name,
            "status": scan.status,
            "assessment_mode": scan.assessment_mode,
            "scan_category": scan.scan_category,
            "scan_depth": scan.scan_depth,
            "started_at": scan.started_at.isoformat() if scan.started_at else None,
            "completed_at": scan.completed_at.isoformat() if scan.completed_at else None,
        },
        "project": {
            "id": str(project.id) if project else None,
            "name": project.name if project else None,
            "environment": project.environment if project else None,
        },
        "assets": [
            {
                "id": str(asset.id),
                "type": asset.asset_type,
                "value": asset.value,
                "scope_status": asset.scope_status,
                "approval_status": asset.approval_status,
            }
            for asset in assets
        ],
        "summary": {
            "total_findings": len(findings),
            "severity_counts": severity_counts,
            "verified_findings": len([finding for finding in findings if finding.integrity_status == "verified"]),
            "highest_severity": highest_severity,
            "risk_rating": risk_rating,
            "report_note": "Report data is generated from stored scan, asset, and finding records. Sensitive values are omitted by default.",
        },
        "findings": finding_payload,
    }
    report["sections"] = {
        "executive_summary": {
            "title": "Executive Summary",
            "overview": _executive_overview(project.name if project else None, assets, findings, risk_rating),
            "risk_rating": risk_rating,
            "key_observations": _key_observations(severity_counts, discovered_services, findings),
        },
        "assessment_scope": {
            "title": "Assessment Scope",
            "assessment_type": "Black-box vulnerability assessment" if scan.assessment_mode == "black_box" else f"{scan.assessment_mode.replace('_', ' ').title()} assessment",
            "environment": project.environment if project else None,
            "assets_in_scope": report["assets"],
            "authorization_note": "Testing was limited to assets recorded in this authorized assessment and executed with safe, non-destructive defaults unless explicitly approved.",
        },
        "methodology": {
            "title": "Methodology",
            "steps": [
                "Validated target reachability from the assessment network.",
                "Performed safe service discovery and lightweight service validation.",
                "Collected HTTP response metadata and browser security header posture.",
                "Performed bounded web vulnerability checks with non-destructive test behavior.",
                "Normalized verified findings into OWASP, CWE, CVSS, and remediation fields.",
            ],
            "standards": ["OWASP Web Security Testing Guide", "OWASP Top 10 2021", "CWE", "CVSS-style severity scoring"],
            "limitations": [
                "No destructive exploitation, brute force, credential attacks, or denial-of-service testing was performed.",
                "Unauthenticated black-box checks can miss issues requiring valid user roles or source-code access.",
            ],
        },
        "scan_sessions": {
            "title": "Scan Sessions and Tools",
            "modules": module_rows,
        },
        "service_discovery": {
            "title": "Discovered Services",
            "services": discovered_services,
        },
        "findings_overview": {
            "title": "Vulnerability Findings",
            "severity_counts": severity_counts,
            "findings": finding_payload,
        },
        "evidence_gallery": {
            "title": "Evidence Gallery",
            "description": "Evidence is redacted to preserve sensitive values while keeping enough context for remediation and retesting.",
            "items": _evidence_gallery(finding_payload),
        },
        "remediation_plan": {
            "title": "Remediation Plan",
            "priorities": remediation_plan,
        },
        "conclusion": {
            "title": "Conclusion",
            "statement": _conclusion_statement(findings, risk_rating),
        },
    }
    return report


@router.get("/scan/{scan_id}/ai-improvements")
async def get_scan_report_ai_improvements(
    scan_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    result = await db.execute(select(Scan).where(Scan.id == scan_id))
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    asset_result = await db.execute(
        select(Asset)
        .join(ScanAsset, ScanAsset.asset_id == Asset.id)
        .where(ScanAsset.scan_id == scan_id)
    )
    assets = asset_result.scalars().all()

    finding_result = await db.execute(
        select(Finding)
        .options(selectinload(Finding.evidence_items), selectinload(Finding.asset))
        .where(Finding.scan_id == scan_id)
    )
    findings = finding_result.scalars().all()

    module_result = await db.execute(
        select(ScanModule).where(ScanModule.scan_id == scan_id).order_by(ScanModule.started_at)
    )
    modules = module_result.scalars().all()

    return _build_report_ai_improvements(scan, assets, findings, modules)


@router.get("/scan/{scan_id}/export")
async def export_scan_report(
    scan_id: str,
    format: str = "pdf",
    db: AsyncSession = Depends(get_db),
):
    report = _report_export_payload(await get_scan_report_data(scan_id, db))
    normalized = format.lower()
    filename = f"noovastack-vapt-report-{scan_id}"

    if normalized == "json":
        import json
        return Response(
            content=json.dumps(normalize_report(report), indent=2),
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{filename}.json"'},
        )

    if normalized == "html":
        rendered = render_html_report(report)
        return HTMLResponse(
            content=rendered.html,
            headers={"Content-Disposition": f'attachment; filename="{filename}.html"'},
        )

    if normalized == "pdf":
        pdf, validation = render_pdf_report(report)
        return Response(
            content=pdf,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}.pdf"',
                "X-Report-SHA256": validation.get("export_sha256", ""),
            },
        )

    if normalized in ("md", "markdown"):
        return Response(
            content=render_markdown_report(report),
            media_type="text/markdown; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}.md"'},
        )

    if normalized == "docx":
        return Response(
            content=render_docx_report(report),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{filename}.docx"'},
        )

    if normalized in ("evidence", "evidence_zip", "zip"):
        return Response(
            content=render_evidence_zip(report),
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{filename}-evidence.zip"'},
        )

    raise HTTPException(status_code=400, detail="Unsupported report format. Use pdf, html, json, markdown, docx, or evidence_zip.")


def _report_to_html(report: dict) -> str:
    severity_counts = report.get("summary", {}).get("severity_counts", {})
    total_findings = report.get("summary", {}).get("total_findings", 0)
    severity_cards = "".join(
        f"<div class='severity {severity}'><span>{severity.title()}</span><strong>{severity_counts.get(severity, 0)}</strong></div>"
        for severity in ["critical", "high", "medium", "low", "informational"]
    )
    findings = "".join(
        f"""
        <section class="finding">
          <h3>{escape(finding.get('title') or 'Untitled Finding')}</h3>
          <table>
            <tr><th>Severity</th><td>{escape(finding.get('severity') or 'Not Provided')}</td></tr>
            <tr><th>CVSS</th><td>{escape(str(finding.get('cvss_score') if finding.get('cvss_score') is not None else 'Not Provided'))}</td></tr>
            <tr><th>OWASP</th><td>{escape(finding.get('owasp_category') or 'Not Provided')}</td></tr>
            <tr><th>CWE</th><td>{escape(finding.get('cwe_id') or 'Not Provided')}</td></tr>
            <tr><th>Status</th><td>{escape(finding.get('status') or 'Not Provided')}</td></tr>
            <tr><th>Integrity</th><td>{escape(finding.get('integrity_status') or 'Not Provided')}</td></tr>
          </table>
          <p><strong>Description:</strong> {escape(finding.get('description') or 'Not Provided')}</p>
          <p><strong>Remediation:</strong> {escape(finding.get('remediation') or 'Not Provided')}</p>
        </section>
        """
        for finding in report.get("findings", [])
    )
    services = "".join(
        f"<tr><td>{escape(str(s.get('host') or 'Not Provided'))}</td><td>{escape(str(s.get('port') or 'Not Provided'))}</td><td>{escape(str(s.get('service') or 'Not Provided'))}</td><td>{escape(str(s.get('status_code') or 'Not Provided'))}</td><td>{escape(str(s.get('server') or s.get('product') or 'Not Provided'))}</td></tr>"
        for s in report.get("sections", {}).get("service_discovery", {}).get("services", [])
    )
    evidence_items = "".join(
        f"""
        <article class="evidence-card">
          <p class="evidence-label">{escape(item.get('evidence_type') or 'Evidence')}</p>
          <h3>{escape(item.get('finding_title') or 'Finding Evidence')}</h3>
          <p><strong>Affected asset:</strong> {escape(item.get('affected_asset') or 'Not Provided')}</p>
          <p>{escape(item.get('summary') or 'Redacted evidence is available for this finding.')}</p>
          <pre>{escape(item.get('details') or 'No additional details captured.')}</pre>
          <p class="hash">Integrity hash: {escape(item.get('hash_value') or 'Not Provided')}</p>
        </article>
        """
        for item in report.get("sections", {}).get("evidence_gallery", {}).get("items", [])
    )
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><title>{escape(report.get('report_name') or BRAND_REPORT_TITLE)}</title>
<style>
@page {{ size: A4; margin: 18mm; }}
body {{ font-family: Arial, sans-serif; color: #102033; background: white; line-height: 1.5; }}
header, footer {{ font-size: 11px; color: #667085; border-bottom: 1px solid #ddd; padding-bottom: 8px; }}
footer {{ border-bottom: 0; border-top: 1px solid #ddd; padding-top: 8px; margin-top: 32px; }}
h1 {{ color: #102033; font-size: 34px; margin-bottom: 8px; }} h2 {{ color: #102033; border-bottom: 2px solid {BRAND_PRIMARY_BLUE}; padding-bottom: 6px; margin-top: 28px; }}
table {{ width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }}
th {{ background: {BRAND_NAVY}; color: white; text-align: left; }} th, td {{ border: 1px solid #DCE3EA; padding: 9px; vertical-align: top; }}
.brand {{ display: flex; align-items: center; gap: 12px; }} .brand img {{ height: 42px; max-width: 220px; object-fit: contain; }}
.cover {{ border-radius: 24px; background: linear-gradient(135deg, {BRAND_NAVY}, {BRAND_PRIMARY_BLUE}); color: white; padding: 28px; margin: 18px 0; }}
.cover h1 {{ color: white; margin: 8px 0; }} .cover p {{ color: {BRAND_LIGHT_BLUE}; }}
.meta {{ display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 16px 0; }}
.meta div {{ border: 1px solid #D0D5DD; border-radius: 14px; padding: 12px; background: #FCFCFD; }}
.meta span {{ display: block; color: #667085; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }} .meta strong {{ display: block; margin-top: 4px; font-size: 16px; }}
.cycle {{ display: grid; grid-template-columns: 180px 1fr; gap: 20px; align-items: center; margin: 18px 0; padding: 20px; border-radius: 24px; background: linear-gradient(135deg, {BRAND_NAVY}, {BRAND_DARK_BLUE}); color: white; }}
.donut {{ width: 150px; height: 150px; border-radius: 999px; border: 24px solid {BRAND_LIGHT_BLUE}; display: grid; place-items: center; background: white; color: #102033; box-shadow: inset 0 0 0 8px #F8FAFC; }}
.donut strong {{ font-size: 42px; display: block; line-height: 1; }} .donut span {{ font-size: 11px; text-transform: uppercase; letter-spacing: 0.16em; color: #667085; }}
.severity-grid {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }}
.severity {{ border-radius: 16px; padding: 10px 12px; background: rgba(255,255,255,0.13); display: flex; justify-content: space-between; }}
.finding {{ page-break-inside: avoid; margin-bottom: 22px; padding: 16px; border: 1px solid #E4E7EC; border-radius: 18px; }} .badge {{ display: inline-block; background: {BRAND_LIGHT_BLUE}; padding: 4px 8px; border-radius: 999px; }}
.evidence-grid {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }}
.evidence-card {{ page-break-inside: avoid; border: 1px solid #D0D5DD; border-radius: 18px; padding: 14px; background: #FCFCFD; }}
.evidence-label {{ display: inline-block; margin: 0; border-radius: 999px; background: {BRAND_LIGHT_BLUE}; color: {BRAND_PRIMARY_BLUE}; padding: 4px 9px; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: .08em; }}
.evidence-card pre {{ white-space: pre-wrap; background: #FFFFFF; color: #102033; border: 1px solid #D0D5DD; padding: 12px; border-radius: 12px; font-size: 11px; }}
.hash {{ color: #667085; font-size: 11px; }}
</style></head><body>
<header><div class="brand"><img src="/branding/nst-logo-full.png" alt="NST - Noova Stack Technology Co., Ltd."><span>{BRAND_COMPANY_NAME} | {BRAND_CONFIDENTIALITY}</span></div></header>
<section class="cover"><p><strong>{BRAND_COMPANY_NAME}</strong> | {BRAND_CONFIDENTIALITY}</p><h1>{BRAND_REPORT_TITLE}</h1><p>{escape(report.get('sections', {}).get('executive_summary', {}).get('overview') or f'Security assessment report generated by {BRAND_PRODUCT_NAME}.')}</p></section>
<div class="meta"><div><span>Risk Rating</span><strong>{escape(report.get('summary', {}).get('risk_rating') or 'Not Provided')}</strong></div><div><span>Total Findings</span><strong>{report.get('summary', {}).get('total_findings', 'Not Provided')}</strong></div><div><span>Verified Findings</span><strong>{report.get('summary', {}).get('verified_findings', 'Not Provided')}</strong></div><div><span>Generated</span><strong>{escape(report.get('generated_at') or 'Not Provided')}</strong></div></div>
<h2>Executive Summary</h2><p>{escape(report.get('sections', {}).get('executive_summary', {}).get('overview') or 'Not Provided')}</p>
<table><tr><th>Risk Rating</th><th>Total Findings</th><th>Verified Findings</th><th>Scan Status</th></tr><tr><td>{escape(report.get('summary', {}).get('risk_rating') or 'Not Provided')}</td><td>{report.get('summary', {}).get('total_findings', 'Not Provided')}</td><td>{report.get('summary', {}).get('verified_findings', 'Not Provided')}</td><td>{escape(report.get('scan', {}).get('status') or 'Not Provided')}</td></tr></table>
<h2>Security Findings Cycle</h2><div class="cycle"><div class="donut"><div><strong>{total_findings}</strong><span>Findings</span></div></div><div class="severity-grid">{severity_cards}</div></div>
<h2>Assessment Overview</h2><table><tr><th>Project</th><td>{escape(report.get('project', {}).get('name') or 'Not Provided')}</td></tr><tr><th>Assessment Type</th><td>{escape(report.get('scan', {}).get('assessment_mode') or 'Not Provided')}</td></tr><tr><th>Started</th><td>{escape(report.get('scan', {}).get('started_at') or 'Not Provided')}</td></tr><tr><th>Completed</th><td>{escape(report.get('scan', {}).get('completed_at') or 'Not Provided')}</td></tr></table>
<h2>Discovered Services</h2><table><tr><th>Host</th><th>Port</th><th>Service</th><th>Status</th><th>Technology</th></tr>{services}</table>
<h2>Evidence Gallery</h2><p>{escape(report.get('sections', {}).get('evidence_gallery', {}).get('description') or 'Evidence is redacted by default.')}</p><div class="evidence-grid">{evidence_items}</div>
<h2>Detailed Findings</h2>{findings}
<h2>Conclusion</h2><p>{escape(report.get('sections', {}).get('conclusion', {}).get('statement') or 'Not Provided')}</p>
<footer>{BRAND_COMPANY_NAME} | {BRAND_DISTRIBUTION_NOTICE}</footer>
</body></html>"""


def _report_to_pdf(report: dict) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table

    buffer = BytesIO()

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.drawString(36, 820, f"{BRAND_COMPANY_NAME} | {BRAND_CONFIDENTIALITY}")
        canvas.drawString(36, 24, f"{BRAND_COMPANY_NAME} | {BRAND_DISTRIBUTION_NOTICE}")
        canvas.drawRightString(560, 24, f"Page {doc.page}")
        canvas.restoreState()

    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=36, leftMargin=36, topMargin=54, bottomMargin=42)
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="BrandHeading", parent=styles["Heading2"], textColor=colors.HexColor(BRAND_PRIMARY_BLUE), spaceBefore=14))
    story = [Paragraph(BRAND_REPORT_TITLE, styles["Title"]), Spacer(1, 12)]
    story += [Table([["Classification", BRAND_CONFIDENTIALITY], ["Prepared By", BRAND_COMPANY_NAME], ["Platform", BRAND_PRODUCT_NAME], ["Generated", report.get("generated_at") or "Not Provided"]], style=[("BACKGROUND", (0, 0), (0, -1), colors.HexColor(BRAND_NAVY)), ("TEXTCOLOR", (0, 0), (0, -1), colors.white), ("GRID", (0, 0), (-1, -1), 0.5, colors.grey), ("PADDING", (0, 0), (-1, -1), 8)]), Spacer(1, 18)]
    story += [Paragraph("Executive Summary", styles["BrandHeading"]), Paragraph(report.get("sections", {}).get("executive_summary", {}).get("overview") or "Not Provided", styles["BodyText"])]
    summary = report.get("summary", {})
    story += [Spacer(1, 12), Table([["Risk Rating", "Total Findings", "Verified Findings"], [summary.get("risk_rating", "Not Provided"), summary.get("total_findings", "Not Provided"), summary.get("verified_findings", "Not Provided")]], style=[("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(BRAND_PRIMARY_BLUE)), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("GRID", (0, 0), (-1, -1), 0.5, colors.grey), ("PADDING", (0, 0), (-1, -1), 6)])]
    severity_counts = summary.get("severity_counts", {})
    story += [Paragraph("Security Findings Cycle", styles["BrandHeading"]), Table(
        [["Critical", "High", "Medium", "Low", "Informational"], [severity_counts.get("critical", 0), severity_counts.get("high", 0), severity_counts.get("medium", 0), severity_counts.get("low", 0), severity_counts.get("informational", 0)]],
        style=[("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(BRAND_NAVY)), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("GRID", (0, 0), (-1, -1), 0.5, colors.grey), ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("PADDING", (0, 0), (-1, -1), 8)]
    )]
    story += [Paragraph("Assessment Overview", styles["BrandHeading"]), Table([["Project", report.get("project", {}).get("name") or "Not Provided"], ["Scan", report.get("scan", {}).get("name") or "Not Provided"], ["Started", report.get("scan", {}).get("started_at") or "Not Provided"], ["Completed", report.get("scan", {}).get("completed_at") or "Not Provided"]], style=[("GRID", (0, 0), (-1, -1), 0.5, colors.grey), ("BACKGROUND", (0, 0), (0, -1), colors.HexColor(BRAND_LIGHT_BLUE)), ("PADDING", (0, 0), (-1, -1), 6)])]
    evidence = report.get("sections", {}).get("evidence_gallery", {}).get("items", [])
    if evidence:
        story += [Paragraph("Evidence Gallery", styles["BrandHeading"]), Paragraph(report.get("sections", {}).get("evidence_gallery", {}).get("description") or "Evidence is redacted by default.", styles["BodyText"])]
        for item in evidence:
            story += [Paragraph(escape(item.get("finding_title") or "Finding Evidence"), styles["Heading3"])]
            story += [Table([["Type", item.get("evidence_type") or "Evidence"], ["Affected Asset", item.get("affected_asset") or "Not Provided"], ["Summary", item.get("summary") or "Not Provided"], ["Details", item.get("details") or "Not Provided"], ["Integrity Hash", item.get("hash_value") or "Not Provided"]], style=[("GRID", (0, 0), (-1, -1), 0.5, colors.grey), ("BACKGROUND", (0, 0), (0, -1), colors.HexColor(BRAND_LIGHT_BLUE)), ("PADDING", (0, 0), (-1, -1), 6), ("VALIGN", (0, 0), (-1, -1), "TOP")]), Spacer(1, 8)]
    story += [Paragraph("Detailed Findings", styles["BrandHeading"])]
    for finding in report.get("findings", []):
        story += [Paragraph(escape(finding.get("title") or "Untitled Finding"), styles["Heading3"])]
        story += [Table([["Severity", finding.get("severity") or "Not Provided"], ["CVSS", str(finding.get("cvss_score") if finding.get("cvss_score") is not None else "Not Provided")], ["OWASP", finding.get("owasp_category") or "Not Provided"], ["CWE", finding.get("cwe_id") or "Not Provided"], ["Status", finding.get("status") or "Not Provided"]], style=[("GRID", (0, 0), (-1, -1), 0.5, colors.grey), ("BACKGROUND", (0, 0), (0, -1), colors.HexColor(BRAND_LIGHT_BLUE)), ("PADDING", (0, 0), (-1, -1), 6)])]
        story += [Paragraph(f"<b>Description:</b> {escape(finding.get('description') or 'Not Provided')}", styles["BodyText"]), Paragraph(f"<b>Remediation:</b> {escape(finding.get('remediation') or 'Not Provided')}", styles["BodyText"]), Spacer(1, 10)]
    story += [Paragraph("Conclusion", styles["BrandHeading"]), Paragraph(report.get("sections", {}).get("conclusion", {}).get("statement") or "Not Provided", styles["BodyText"])]
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buffer.getvalue()


def _module_tool_name(module_name: str) -> str:
    if module_name in ("tcp_port_scan", "service_detection", "version_detection"):
        return "nmap/native probe"
    if module_name == "wapiti_scan":
        return "wapiti"
    if module_name in ("security_headers", "safe_nuclei_templates", "http_probe", "tls_check"):
        return "NoovaStack safe HTTP checks"
    return "NoovaStack"


def _public_finding_text(value: str | None) -> str | None:
    if not value:
        return value
    replacements = {
        "Wapiti: ": "Web Security Finding: ",
        "Wapiti reported": "The assessment identified",
        "recommended by Wapiti": "recommended for this vulnerability class",
        "NoovaStack discovered": "The assessment discovered",
        "NoovaStack could not connect": "The assessment could not connect",
        "NoovaStack": "The platform",
    }
    cleaned = value
    for source, target in replacements.items():
        cleaned = cleaned.replace(source, target)
    return cleaned


def _finding_evidence_payload(finding: Finding) -> list[dict]:
    if finding.evidence_items:
        return [
            {
                "id": str(item.id),
                "evidence_type": _friendly_evidence_type(item.evidence_type),
                "summary": _public_finding_text((item.metadata_json or {}).get("summary")) or "Evidence captured during validation.",
                "details": _evidence_details(item.metadata_json or {}),
                "hash_value": item.hash_value,
                "created_at": item.created_at.isoformat() if item.created_at else None,
            }
            for item in finding.evidence_items
        ]

    return [
        {
            "id": f"fallback-{finding.id}",
            "evidence_type": "Validated Observation",
            "summary": _public_finding_text(finding.description) or "Finding was validated during the assessment.",
            "details": _fallback_evidence_details(finding),
            "hash_value": "Generated from stored finding record",
            "created_at": finding.updated_at.isoformat() if finding.updated_at else None,
        }
    ]


def _evidence_gallery(findings: list[dict]) -> list[dict]:
    gallery = []
    for finding in findings:
        for item in finding.get("evidence") or []:
            gallery.append({
                "id": item.get("id"),
                "finding_id": finding.get("id"),
                "finding_title": finding.get("title"),
                "severity": finding.get("severity"),
                "affected_asset": finding.get("affected_asset"),
                "evidence_type": item.get("evidence_type"),
                "summary": item.get("summary"),
                "details": item.get("details"),
                "hash_value": item.get("hash_value"),
                "created_at": item.get("created_at"),
            })
    return gallery


def _friendly_evidence_type(value: str | None) -> str:
    labels = {
        "http_response": "HTTP Response Snapshot",
        "service_observation": "Service Observation",
        "web_observation": "Web Finding Observation",
        "validated_observation": "Validated Observation",
    }
    return labels.get(value or "", (value or "Evidence").replace("_", " ").title())


def _evidence_details(metadata: dict) -> str:
    safe_keys = ["url", "path", "parameter", "status_code", "header", "missing_headers", "open_services", "observed_value", "recommendation"]
    rows = []
    for key in safe_keys:
        value = metadata.get(key)
        if value is None or value == "":
            continue
        rows.append(f"{key.replace('_', ' ').title()}: {_redact_value(value)}")
    return "\n".join(rows) or "Sensitive request and response values are redacted."


def _fallback_evidence_details(finding: Finding) -> str:
    rows = [
        f"Finding ID: {finding.id}",
        f"Affected Asset: {finding.asset.value if finding.asset else 'Not Provided'}",
        f"Severity: {finding.severity}",
        f"Status: {finding.status}",
        f"Integrity: {finding.integrity_status}",
    ]
    if finding.cvss_score is not None:
        rows.append(f"CVSS: {finding.cvss_score}")
    if finding.cwe_id:
        rows.append(f"CWE: {finding.cwe_id}")
    return "\n".join(rows)


def _redact_value(value) -> str:
    if isinstance(value, list):
        return ", ".join(str(_redact_value(item)) for item in value)
    if isinstance(value, dict):
        return ", ".join(f"{key}={_redact_value(item)}" for key, item in value.items())
    text = str(value)
    if len(text) > 500:
        text = text[:500] + "..."
    return text.replace("\r", " ").replace("\x00", "")


def _report_export_payload(report: dict) -> dict:
    exported = dict(report)
    exported["findings"] = [
        {key: value for key, value in finding.items() if key != "found_by_tool"}
        for finding in report.get("findings", [])
    ]
    sections = dict(report.get("sections", {}))
    sections.pop("scan_sessions", None)
    if "findings_overview" in sections:
        findings_overview = dict(sections["findings_overview"])
        findings_overview["findings"] = exported["findings"]
        sections["findings_overview"] = findings_overview
    if "service_discovery" in sections:
        service_discovery = dict(sections["service_discovery"])
        service_discovery["services"] = [
            {key: value for key, value in service.items() if key != "detected_by"}
            for service in service_discovery.get("services", [])
        ]
        sections["service_discovery"] = service_discovery
    exported["sections"] = sections
    return exported


def _extract_discovered_services(modules: list[ScanModule]) -> list[dict]:
    services: dict[str, dict] = {}
    for module in modules:
        output = module.output or {}
        for observation in output.get("observations") or []:
            host = observation.get("host")
            for item in observation.get("open_ports") or []:
                key = f"{host}:{item.get('port')}"
                services[key] = {
                    "host": host,
                    "port": item.get("port"),
                    "service": item.get("service"),
                    "url": item.get("url"),
                    "status_code": item.get("status_code"),
                    "server": item.get("server"),
                    "product": item.get("product"),
                    "version": item.get("version"),
                    "detected_by": output.get("tool") or _module_tool_name(module.module_name),
                }
    return sorted(services.values(), key=lambda item: (str(item.get("host")), int(item.get("port") or 0)))


def _executive_overview(project_name: str | None, assets: list[Asset], findings: list[Finding], risk_rating: str) -> str:
    target_name = project_name or "the assessed target"
    return (
        f"NoovaStack completed a vulnerability assessment of {target_name} covering {len(assets)} in-scope asset(s). "
        f"The assessment identified {len(findings)} finding(s), with an overall risk rating of {risk_rating}. "
        "The most important remediation focus is to reduce exposed attack surface and resolve verified web security misconfigurations."
    )


def _key_observations(severity_counts: dict[str, int], services: list[dict], findings: list[Finding]) -> list[str]:
    observations = []
    if services:
        observations.append("Reachable services were discovered on: " + ", ".join(f"{svc.get('host')}:{svc.get('port')}" for svc in services) + ".")
    if severity_counts:
        observations.append("Finding distribution: " + ", ".join(f"{count} {severity}" for severity, count in sorted(severity_counts.items())) + ".")
    if findings:
        observations.append("Verified findings confirmed browser-side and service exposure security control gaps.")
    if not observations:
        observations.append("No verified vulnerabilities were recorded for this scan.")
    return observations


def _build_remediation_plan(findings: list[Finding]) -> list[dict]:
    priority_map = {"critical": 1, "high": 1, "medium": 2, "low": 3, "informational": 4}
    labels = {1: "Immediate", 2: "High Priority", 3: "Planned Hardening", 4: "Review"}
    grouped: dict[int, list[str]] = {}
    for finding in findings:
        priority = priority_map.get(finding.severity, 4)
        grouped.setdefault(priority, []).append(finding.remediation or f"Review and remediate: {finding.title}")
    return [
        {"priority": labels[priority], "actions": sorted(set(actions))}
        for priority, actions in sorted(grouped.items())
    ]


def _conclusion_statement(findings: list[Finding], risk_rating: str) -> str:
    if not findings:
        return "No verified vulnerabilities were identified during this assessment. Continue periodic scanning and validate authenticated functionality where applicable."
    return (
        f"The assessment completed successfully and produced an overall {risk_rating} risk posture. "
        "Remediation should prioritize transport security, browser security headers, exposed service review, and validation through a follow-up retest."
    )


def _build_report_ai_improvements(scan: Scan, assets: list[Asset], findings: list[Finding], modules: list[ScanModule]) -> dict:
    services = _extract_discovered_services(modules)
    severity_counts: dict[str, int] = {}
    for finding in findings:
        severity_counts[finding.severity] = severity_counts.get(finding.severity, 0) + 1

    checks = []
    findings_without_evidence = [finding for finding in findings if not finding.evidence_items]
    findings_without_cvss = [finding for finding in findings if finding.severity in ("critical", "high", "medium") and finding.cvss_score is None]
    findings_without_remediation = [finding for finding in findings if not finding.remediation]
    assets_outside_scope = [asset for asset in assets if asset.scope_status not in ("in_scope", "approved")]

    checks.append(_report_ai_check(
        "evidence-coverage",
        "Evidence Coverage",
        "warning" if findings_without_evidence else "pass",
        f"{len(findings) - len(findings_without_evidence)} of {len(findings)} findings include report evidence.",
        "Add concise, redacted request/response or service observation evidence for each finding before export." if findings_without_evidence else "Evidence coverage is ready for reporting.",
    ))
    checks.append(_report_ai_check(
        "severity-rationale",
        "Severity Rationale",
        "warning" if findings_without_cvss else "pass",
        f"{len(findings_without_cvss)} medium-or-higher finding(s) do not include a CVSS score.",
        "Add CVSS scores or clear business-impact rationale for medium, high, and critical findings." if findings_without_cvss else "Severity fields are clear for report readers.",
    ))
    checks.append(_report_ai_check(
        "remediation-quality",
        "Remediation Quality",
        "warning" if findings_without_remediation else "pass",
        f"{len(findings_without_remediation)} finding(s) need stronger remediation guidance.",
        "Include immediate mitigation, long-term fix, and retest criteria for affected findings." if findings_without_remediation else "Remediation guidance is populated.",
    ))
    checks.append(_report_ai_check(
        "scope-clarity",
        "Scope Clarity",
        "warning" if assets_outside_scope or not assets else "pass",
        f"{len(assets)} asset(s) and {len(services)} discovered service(s) are available for the scope section.",
        "Confirm every listed asset is in scope and remove ambiguous entries from the final report." if assets_outside_scope or not assets else "Scope and service discovery sections are ready.",
    ))
    checks.append(_report_ai_check(
        "executive-readiness",
        "Executive Readiness",
        "pass" if findings or services else "warning",
        f"Overall report risk uses {sum(severity_counts.values())} verified finding(s) across {len(severity_counts)} severity level(s).",
        "Use the report summary to explain business impact, remediation priority, and residual risk without naming tools.",
    ))

    score = round((sum(1 for check in checks if check["status"] == "pass") / len(checks)) * 100)
    return {
        "agent": {
            "id": "report-writer",
            "name": "Report Writer",
            "role": "AI Report Agent",
            "status": "Ready",
            "model": settings.AI_MODEL,
        },
        "scan_id": str(scan.id),
        "score": score,
        "summary": f"AI Report Agent reviewed {len(findings)} finding(s), {len(assets)} asset(s), and {len(services)} service observation(s) for report readiness.",
        "checks": checks,
        "suggested_sections": [
            "Executive summary should lead with risk rating, affected business area, and remediation priority.",
            "Finding narratives should remain tool-neutral and include readable redacted evidence.",
            "Remediation plan should group work into immediate, high-priority, planned hardening, and review actions.",
        ],
        "export_ready": score >= 80,
    }


def _report_ai_check(check_id: str, title: str, status: str, detail: str, recommendation: str) -> dict:
    return {
        "id": check_id,
        "title": title,
        "status": status,
        "detail": detail,
        "recommendation": recommendation,
    }


@router.get("/{report_id}")
async def get_report(
    report_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    return await get_scan_report_data(report_id, db)


@router.post("/{report_id}/export")
async def export_report(
    report_id: str,
    format: str = "pdf",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    return await export_scan_report(report_id, format, db)
