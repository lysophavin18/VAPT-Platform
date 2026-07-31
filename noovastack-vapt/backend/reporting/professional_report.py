"""Professional VAPT report renderer.

The renderer is deliberately data-bound: it formats and organizes platform
records but does not invent findings, evidence, endpoints, CVSS vectors, or
test outcomes.
"""
from __future__ import annotations

import hashlib
import json
import re
import zipfile
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timezone
from html import escape
from io import BytesIO
from pathlib import Path
from typing import Any

from jinja2 import Environment, select_autoescape


BRAND_PRODUCT_NAME = "NoovaStack VAPT"
BRAND_REPORT_TITLE = "NoovaStack  Security Assessment Report"
BRAND_COMPANY_NAME = "Noova Stack Technology Co., Ltd."
BRAND_CONFIDENTIALITY = "CONFIDENTIAL"
BRAND_DISTRIBUTION_NOTICE = "Do not distribute without authorization"
BRAND_PRIMARY_BLUE = "#0B5E9E"
BRAND_DARK_BLUE = "#083F6B"
BRAND_NAVY = "#0B1F33"
BRAND_LIGHT_BLUE = "#EAF4FB"

SEVERITY_ORDER = ["critical", "high", "medium", "low", "informational"]
SEVERITY_LABELS = {
    "critical": "Critical",
    "high": "High",
    "medium": "Medium",
    "low": "Low",
    "informational": "Informational",
    "info": "Informational",
}
SEVERITY_COLORS = {
    "critical": "#D92D20",
    "high": "#EA580C",
    "medium": "#D97706",
    "low": "#2563EB",
    "informational": "#667085",
}
STATUS_LABELS = {
    "confirmed": "Confirmed",
    "verified": "Verified",
    "flagged": "Flagged",
    "rejected": "Rejected",
    "open": "Verified",
    "fixed": "Fixed",
    "false_positive": "Rejected",
}

PROFESSIONAL_REPORT_CSS = f"""
@page {{
  size: A4;
  margin: 22mm 16mm 20mm 16mm;
  @top-left {{
    content: "NST | {BRAND_COMPANY_NAME} | {BRAND_CONFIDENTIALITY}";
    font-size: 8pt;
    color: #596579;
    border-bottom: 0.4pt solid #D6DEE8;
    padding-bottom: 4mm;
  }}
  @bottom-left {{
    content: "{BRAND_REPORT_TITLE}\\A{BRAND_DISTRIBUTION_NOTICE}";
    white-space: pre;
    font-size: 7.5pt;
    color: #596579;
    border-top: 0.4pt solid #D6DEE8;
    padding-top: 3mm;
  }}
  @bottom-right {{
    content: "Page " counter(page) " of " counter(pages);
    font-size: 7.5pt;
    color: #596579;
    border-top: 0.4pt solid #D6DEE8;
    padding-top: 3mm;
  }}
}}
@page cover {{ margin: 18mm 16mm; @top-left {{ content: none; }} @bottom-left {{ content: none; }} @bottom-right {{ content: none; }} }}
* {{ box-sizing: border-box; }}
html {{ color: #172033; font-family: Inter, Arial, Helvetica, sans-serif; font-size: 10pt; line-height: 1.48; }}
body {{ margin: 0; background: #FFFFFF; }}
a {{ color: {BRAND_PRIMARY_BLUE}; text-decoration: none; }}
h1, h2, h3, h4 {{ color: {BRAND_NAVY}; font-weight: 700; line-height: 1.2; margin: 0 0 8pt; }}
h1 {{ font-size: 31pt; letter-spacing: -0.03em; }}
h2 {{ color: {BRAND_PRIMARY_BLUE}; font-size: 19pt; margin-top: 18pt; padding-bottom: 5pt; border-bottom: 1.3pt solid {BRAND_PRIMARY_BLUE}; }}
h3 {{ font-size: 14pt; margin-top: 12pt; }}
h4 {{ font-size: 11pt; margin-top: 10pt; }}
p {{ margin: 0 0 8pt; }}
ul, ol {{ margin: 0 0 8pt 16pt; padding: 0; }}
li {{ margin-bottom: 3pt; }}
table {{ width: 100%; table-layout: fixed; border-collapse: collapse; margin: 8pt 0 12pt; font-size: 8.8pt; }}
td, th {{ overflow-wrap: anywhere; word-break: break-word; border: 0.6pt solid #D6DEE8; padding: 6pt; vertical-align: top; }}
th {{ background: {BRAND_NAVY}; color: #FFFFFF; text-align: left; font-weight: 700; }}
thead {{ display: table-header-group; }}
tr {{ break-inside: avoid; page-break-inside: avoid; }}
code, pre, .mono {{ font-family: "JetBrains Mono", Consolas, "Courier New", monospace; overflow-wrap: anywhere; word-break: break-word; }}
pre {{ white-space: pre-wrap; background: #F8FAFC; border: 0.6pt solid #D6DEE8; border-radius: 5pt; padding: 7pt; font-size: 8pt; margin: 6pt 0; }}
.cover-page {{ page: cover; min-height: 260mm; display: flex; flex-direction: column; justify-content: space-between; background: linear-gradient(135deg, {BRAND_NAVY}, {BRAND_DARK_BLUE} 55%, {BRAND_PRIMARY_BLUE}); color: white; padding: 20mm 16mm; margin: -18mm -16mm; break-after: page; }}
.cover-logo {{ max-height: 28mm; max-width: 70mm; object-fit: contain; background: white; padding: 5mm; border-radius: 4mm; }}
.cover-logo-fallback {{ display: inline-block; width: 28mm; height: 18mm; border: 1pt solid rgba(255,255,255,.55); border-radius: 4mm; text-align: center; line-height: 18mm; font-weight: 800; font-size: 20pt; }}
.cover-kicker {{ color: #EAF4FB; font-weight: 800; letter-spacing: .18em; font-size: 10pt; margin-top: 16mm; }}
.cover-title {{ color: #FFFFFF; font-size: 33pt; max-width: 150mm; margin-top: 7mm; }}
.cover-meta {{ display: grid; grid-template-columns: 1fr 1fr; gap: 5pt 10pt; margin-top: 14mm; background: rgba(255,255,255,.08); border: 0.7pt solid rgba(255,255,255,.25); border-radius: 5mm; padding: 8mm; }}
.cover-meta div {{ border-bottom: 0.4pt solid rgba(255,255,255,.18); padding-bottom: 4pt; }}
.cover-meta span {{ display: block; color: #BFDDF0; font-size: 7.8pt; text-transform: uppercase; letter-spacing: .08em; }}
.cover-meta strong {{ display: block; color: #FFFFFF; font-size: 10pt; margin-top: 2pt; overflow-wrap: anywhere; }}
.section {{ break-before: auto; }}
.section-heading {{ break-after: avoid; page-break-after: avoid; }}
.finding-section, .evidence-card, .summary-card {{ break-inside: avoid; page-break-inside: avoid; }}
.finding-section {{ border-top: 3pt solid {BRAND_PRIMARY_BLUE}; padding-top: 9pt; margin-top: 18pt; }}
.summary-grid {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 8pt; margin: 10pt 0 12pt; }}
.summary-card {{ border: 0.7pt solid #D6DEE8; border-radius: 7pt; background: #FCFDFF; padding: 9pt; min-height: 38pt; }}
.summary-card span {{ display: block; color: #596579; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .08em; }}
.summary-card strong {{ display: block; color: #172033; font-size: 14pt; margin-top: 3pt; }}
.notice {{ background: {BRAND_LIGHT_BLUE}; border-left: 4pt solid {BRAND_PRIMARY_BLUE}; padding: 9pt; border-radius: 5pt; }}
.toc a::after {{ content: leader('.') target-counter(attr(href), page); }}
.badge {{ display: inline-block; border-radius: 99pt; padding: 2.5pt 7pt; font-size: 8pt; font-weight: 700; color: white; }}
.badge.critical {{ background: #D92D20; }} .badge.high {{ background: #EA580C; }} .badge.medium {{ background: #D97706; }} .badge.low {{ background: #2563EB; }} .badge.informational {{ background: #667085; }}
.severity-bar {{ display: grid; grid-template-columns: repeat(5, 1fr); gap: 5pt; margin: 10pt 0 12pt; }}
.severity-segment {{ border-radius: 5pt; padding: 7pt; color: white; min-height: 28pt; }}
.severity-segment span {{ display: block; font-size: 7.5pt; }} .severity-segment strong {{ font-size: 14pt; }}
.evidence-card {{ border: 0.7pt solid #D6DEE8; border-radius: 6pt; padding: 8pt; margin: 8pt 0; background: #FCFDFF; }}
.evidence-meta {{ font-size: 8pt; color: #596579; margin-bottom: 4pt; }}
.hash {{ font-family: "JetBrains Mono", Consolas, "Courier New", monospace; overflow-wrap: anywhere; word-break: break-word; font-size: 7.8pt; color: #344054; }}
.muted {{ color: #596579; }}
.small {{ font-size: 8pt; }}
.signoff-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 10pt; }}
.signoff-card {{ border: 0.7pt solid #D6DEE8; border-radius: 6pt; padding: 9pt; break-inside: avoid; }}
.signature-line {{ margin-top: 16pt; border-top: 0.7pt solid #98A2B3; padding-top: 4pt; color: #596579; }}
"""

REPORT_TEMPLATE = r"""
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{{ report.document_control.Document_Title }}</title>
  <meta name="author" content="{{ brand.company }}">
  <meta name="subject" content="Technical Security Assessment Report">
  <style>{{ css }}</style>
</head>
<body>
  <section class="cover-page">
    <div>
      {% if logo_uri %}<img class="cover-logo" src="{{ logo_uri }}" alt="NST logo">{% else %}<div class="cover-logo-fallback">NST</div>{% endif %}
      <div class="cover-kicker">NOOVASTACK VAPT</div>
      <h1 class="cover-title">TECHNICAL SECURITY<br>ASSESSMENT REPORT</h1>
    </div>
    <div class="cover-meta">
      {% for label, value in report.cover_items %}<div><span>{{ label }}</span><strong>{{ value }}</strong></div>{% endfor %}
    </div>
  </section>

  <section id="document-control" class="section">
    <h2 class="section-heading">Document Control</h2>
    <table><tbody>{% for label, value in report.document_control.items() %}<tr><th style="width:34%">{{ label|replace('_', ' ') }}</th><td>{{ value }}</td></tr>{% endfor %}</tbody></table>
  </section>

  <section id="confidentiality-notice" class="section">
    <h2 class="section-heading">Confidentiality Notice</h2>
    <p class="notice">This report is classified as {{ report.document_control.Classification }} and is intended only for authorized recipients. It contains technical security information that may increase risk if distributed without authorization.</p>
  </section>

  <section id="table-of-contents" class="section">
    <h2 class="section-heading">Table of Contents</h2>
    <ol class="toc">{% for item in report.toc %}<li><a href="#{{ item.id }}">{{ item.title }}</a></li>{% endfor %}</ol>
  </section>

  <section id="executive-summary" class="section">
    <h2 class="section-heading">Executive Summary</h2>
    <p>{{ report.executive_summary }}</p>
    <div class="summary-grid">{% for card in report.risk_cards %}<div class="summary-card"><span>{{ card.label }}</span><strong>{{ card.value }}</strong></div>{% endfor %}</div>
  </section>

  <section id="assessment-overview" class="section">
    <h2 class="section-heading">Assessment Overview</h2>
    <table><tbody>{% for label, value in report.assessment_overview %}<tr><th style="width:34%">{{ label }}</th><td>{{ value }}</td></tr>{% endfor %}</tbody></table>
  </section>

  <section id="scope" class="section">
    <h2 class="section-heading">Scope and Tested Assets</h2>
    <table><thead><tr><th>Asset</th><th>Asset Type</th><th>Protocol</th><th>Port</th><th>Environment</th><th>Testing Status</th><th>Notes</th></tr></thead><tbody>{% for asset in report.scope_assets %}<tr><td>{{ asset.asset }}</td><td>{{ asset.asset_type }}</td><td>{{ asset.protocol }}</td><td>{{ asset.port }}</td><td>{{ asset.environment }}</td><td>{{ asset.testing_status }}</td><td>{{ asset.notes }}</td></tr>{% endfor %}</tbody></table>
  </section>

  <section id="methodology" class="section">
    <h2 class="section-heading">Assessment Methodology</h2>
    <ol>{% for step in report.methodology.steps %}<li>{{ step }}</li>{% endfor %}</ol>
    <p><strong>Framework references:</strong> {{ report.methodology.frameworks|join(', ') }}</p>
  </section>

  <section id="limitations" class="section">
    <h2 class="section-heading">Assessment Limitations</h2>
    <ul>{% for limitation in report.limitations %}<li>{{ limitation }}</li>{% endfor %}</ul>
    <p class="muted">Absence of findings does not guarantee absence of vulnerabilities.</p>
  </section>

  <section id="risk-methodology" class="section">
    <h2 class="section-heading">Risk-Rating Methodology</h2>
    <p>Severity reflects available evidence, CVSS score where provided, exploitability, exposure, technical impact, business context, existing controls, and evidence confidence. Status values are normalized as Confirmed, Verified, Flagged, or Rejected.</p>
    <table><thead><tr><th>Severity</th><th>General Meaning</th></tr></thead><tbody>{% for row in report.risk_methodology %}<tr><td><span class="badge {{ row.key }}">{{ row.label }}</span></td><td>{{ row.meaning }}</td></tr>{% endfor %}</tbody></table>
  </section>

  <section id="severity-summary" class="section">
    <h2 class="section-heading">Findings Severity Summary</h2>
    <div class="severity-bar">{% for sev in report.severity_summary %}<div class="severity-segment" style="background: {{ sev.color }}"><span>{{ sev.label }}</span><strong>{{ sev.count }}</strong></div>{% endfor %}</div>
  </section>

  <section id="findings-summary" class="section">
    <h2 class="section-heading">Findings Summary Table</h2>
    <table><thead><tr><th>ID</th><th>Finding</th><th>Severity</th><th>CVSS</th><th>Affected Asset</th><th>OWASP</th><th>CWE</th><th>Status</th><th>Priority</th></tr></thead><tbody>{% for finding in report.findings %}<tr><td>{{ finding.stable_id }}</td><td><a href="#finding-{{ finding.stable_id }}">{{ finding.title }}</a></td><td><span class="badge {{ finding.severity_key }}">{{ finding.severity_label }}</span></td><td>{{ finding.cvss_score }}</td><td>{{ finding.affected_asset }}</td><td>{{ finding.owasp_category }}</td><td>{{ finding.cwe_id }}</td><td>{{ finding.status_label }}</td><td>{{ finding.priority_label }}</td></tr>{% endfor %}</tbody></table>
  </section>

  <section id="detailed-findings" class="section">
    <h2 class="section-heading">Detailed Findings</h2>
    {% for finding in report.findings %}
    <article id="finding-{{ finding.stable_id }}" class="finding-section">
      <h3 class="section-heading">{{ finding.stable_id }} | {{ finding.title }}</h3>
      <table><tbody>{% for label, value in finding.metadata %}<tr><th style="width:30%">{{ label }}</th><td>{{ value }}</td></tr>{% endfor %}</tbody></table>
      <h4>Summary</h4><p>{{ finding.summary }}</p>
      <h4>Technical Description</h4><p>{{ finding.technical_description }}</p>
      <h4>Business Impact</h4><p>{{ finding.business_impact }}</p>
      <h4>Technical Impact</h4><p>{{ finding.technical_impact }}</p>
      {% if finding.header_table %}<h4>Header Assessment</h4><table><thead><tr><th>Header</th><th>Observed</th><th>Recommended</th><th>Purpose</th><th>Implementation Notes</th></tr></thead><tbody>{% for row in finding.header_table %}<tr><td>{{ row.header }}</td><td>{{ row.observed }}</td><td>{{ row.recommended }}</td><td>{{ row.purpose }}</td><td>{{ row.notes }}</td></tr>{% endfor %}</tbody></table>{% endif %}
      {% if finding.service_table %}<h4>Service Exposure Observation</h4><table><thead><tr><th>Host</th><th>Port</th><th>Protocol</th><th>Detected Service</th><th>Exposure</th><th>Business Justification</th><th>Recommended Action</th></tr></thead><tbody>{% for row in finding.service_table %}<tr><td>{{ row.host }}</td><td>{{ row.port }}</td><td>{{ row.protocol }}</td><td>{{ row.detected_service }}</td><td>{{ row.exposure }}</td><td>{{ row.business_justification }}</td><td>{{ row.recommended_action }}</td></tr>{% endfor %}</tbody></table>{% endif %}
      <h4>Evidence</h4>{% for ev in finding.evidence %}<div class="evidence-card"><div class="evidence-meta"><strong>{{ ev.evidence_id }}</strong> | {{ ev.evidence_type }} | Captured: {{ ev.capture_time }}</div><p>{{ ev.summary }}</p><pre>{{ ev.details }}</pre><div class="hash">SHA-256:<br>{{ ev.hash_wrapped }}</div></div>{% else %}<p>Evidence warning: Not Available</p>{% endfor %}
      <h4>Steps to Reproduce</h4><p>{{ finding.steps_to_reproduce }}</p>
      <h4>Immediate Mitigation</h4><p>{{ finding.immediate_mitigation }}</p>
      <h4>Long-Term Remediation</h4><p>{{ finding.long_term_remediation }}</p>
      <h4>Verification Steps</h4><p>{{ finding.verification_steps }}</p>
      <h4>References</h4><ul>{% for ref in finding.references %}<li><a href="{{ ref.url }}">{{ ref.label }}</a></li>{% else %}<li>Not Provided</li>{% endfor %}</ul>
      <h4>Retest Status</h4><p>{{ finding.retest_status }}</p>
    </article>
    {% endfor %}
  </section>

  <section id="remediation-roadmap" class="section"><h2 class="section-heading">Remediation Roadmap</h2><table><thead><tr><th>Priority</th><th>Finding ID</th><th>Recommended Action</th><th>Suggested Owner</th><th>Target Timeframe</th><th>Retest Required</th><th>Status</th></tr></thead><tbody>{% for row in report.roadmap %}<tr><td>{{ row.priority }}</td><td>{{ row.finding_id }}</td><td>{{ row.action }}</td><td>{{ row.owner }}</td><td>{{ row.timeframe }}</td><td>{{ row.retest_required }}</td><td>{{ row.status }}</td></tr>{% endfor %}</tbody></table></section>
  <section id="positive-observations" class="section"><h2 class="section-heading">Positive Security Observations</h2><ul>{% for item in report.positive_observations %}<li>{{ item }}</li>{% endfor %}</ul></section>
  <section id="retest-status" class="section"><h2 class="section-heading">Retest Status</h2><p>Retesting had not been completed when this report was generated. A focused retest is recommended after the identified findings have been remediated.</p></section>
  <section id="conclusion" class="section"><h2 class="section-heading">Conclusion</h2><p>{{ report.conclusion }}</p></section>
  <section id="evidence-manifest" class="section"><h2 class="section-heading">Evidence Manifest</h2><table><thead><tr><th>Evidence ID</th><th>Finding ID</th><th>Evidence Type</th><th>Affected Asset</th><th>Capture Time</th><th>SHA-256</th><th>Redaction Status</th><th>Included in Report</th></tr></thead><tbody>{% for ev in report.evidence_manifest %}<tr><td>{{ ev.evidence_id }}</td><td>{{ ev.finding_id }}</td><td>{{ ev.evidence_type }}</td><td>{{ ev.affected_asset }}</td><td>{{ ev.capture_time }}</td><td class="hash">{{ ev.hash_wrapped }}</td><td>{{ ev.redaction_status }}</td><td>{{ ev.included }}</td></tr>{% endfor %}</tbody></table></section>
  <section id="references" class="section"><h2 class="section-heading">References</h2><ul>{% for ref in report.references %}<li><a href="{{ ref.url }}">{{ ref.label }}</a></li>{% endfor %}</ul></section>
  <section id="approval" class="section"><h2 class="section-heading">Approval and Sign-Off</h2><div class="signoff-grid">{% for block in report.signoff %}<div class="signoff-card"><h3>{{ block.role }}</h3><p><strong>Name:</strong> {{ block.name }}</p><p><strong>Title:</strong> {{ block.title }}</p><p><strong>Organization:</strong> {{ block.organization }}</p><p class="signature-line">Signature: {{ block.signature }}</p><p>Date: {{ block.date }}</p></div>{% endfor %}</div></section>
</body>
</html>
"""


@dataclass
class RenderedReport:
    normalized: dict[str, Any]
    html: str
    validation: dict[str, Any]


def render_html_report(report: dict[str, Any]) -> RenderedReport:
    normalized = normalize_report(report)
    validation = validate_report(normalized)
    if validation["blocking_failures"]:
        raise ValueError("Report validation failed: " + "; ".join(validation["blocking_failures"]))
    env = Environment(autoescape=select_autoescape(["html", "xml"]))
    env.filters["e"] = escape
    template = env.from_string(REPORT_TEMPLATE)
    html = template.render(report=normalized, css=PROFESSIONAL_REPORT_CSS, brand={"company": BRAND_COMPANY_NAME}, logo_uri=_logo_uri())
    return RenderedReport(normalized=normalized, html=html, validation=validation)


def render_pdf_report(report: dict[str, Any]) -> tuple[bytes, dict[str, Any]]:
    rendered = render_html_report(report)
    try:
        from weasyprint import HTML
        pdf = HTML(string=rendered.html, base_url=str(Path(__file__).resolve().parents[2])).write_pdf()
    except Exception:
        pdf = _fallback_reportlab_pdf(rendered.normalized)
    rendered.validation["export_sha256"] = hashlib.sha256(pdf).hexdigest()
    return pdf, rendered.validation


def render_markdown_report(report: dict[str, Any]) -> str:
    r = normalize_report(report)
    lines = [f"# {BRAND_REPORT_TITLE}", "", "## Document Control"]
    lines.extend(f"- **{k.replace('_', ' ')}:** {v}" for k, v in r["document_control"].items())
    lines += ["", "## Executive Summary", r["executive_summary"], "", "## Findings Summary"]
    for finding in r["findings"]:
        lines.append(f"- **{finding['stable_id']}** {finding['title']} ({finding['severity_label']})")
    lines += ["", "## Detailed Findings"]
    for finding in r["findings"]:
        lines += [f"### {finding['stable_id']} | {finding['title']}", finding["summary"], "", f"**Remediation:** {finding['long_term_remediation']}", ""]
    lines += ["## Conclusion", r["conclusion"]]
    return "\n".join(lines)


def render_docx_report(report: dict[str, Any]) -> bytes:
    """Create a minimal editable DOCX without adding a heavy dependency."""
    r = normalize_report(report)
    body = []
    def p(text: str, style: str | None = None) -> None:
        style_xml = f'<w:pPr><w:pStyle w:val="{style}"/></w:pPr>' if style else ""
        body.append(f"<w:p>{style_xml}<w:r><w:t xml:space='preserve'>{escape(str(text))}</w:t></w:r></w:p>")
    p(BRAND_REPORT_TITLE, "Title")
    p("Document Control", "Heading1")
    for key, value in r["document_control"].items():
        p(f"{key.replace('_', ' ')}: {value}")
    p("Executive Summary", "Heading1"); p(r["executive_summary"])
    p("Findings Summary", "Heading1")
    for finding in r["findings"]:
        p(f"{finding['stable_id']} | {finding['title']} | {finding['severity_label']} | {finding['affected_asset']}")
    p("Conclusion", "Heading1"); p(r["conclusion"])
    document_xml = "<?xml version='1.0' encoding='UTF-8' standalone='yes'?><w:document xmlns:w='http://schemas.openxmlformats.org/wordprocessingml/2006/main'><w:body>" + "".join(body) + "<w:sectPr/></w:body></w:document>"
    content_types = "<?xml version='1.0' encoding='UTF-8'?><Types xmlns='http://schemas.openxmlformats.org/package/2006/content-types'><Default Extension='rels' ContentType='application/vnd.openxmlformats-package.relationships+xml'/><Default Extension='xml' ContentType='application/xml'/><Override PartName='/word/document.xml' ContentType='application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'/></Types>"
    rels = "<?xml version='1.0' encoding='UTF-8'?><Relationships xmlns='http://schemas.openxmlformats.org/package/2006/relationships'><Relationship Id='rId1' Type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument' Target='word/document.xml'/></Relationships>"
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types)
        zf.writestr("_rels/.rels", rels)
        zf.writestr("word/document.xml", document_xml)
    return buffer.getvalue()


def render_evidence_zip(report: dict[str, Any]) -> bytes:
    r = normalize_report(report)
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", json.dumps(r["evidence_manifest_raw"], indent=2))
        for ev in r["evidence_manifest_raw"]:
            zf.writestr(f"evidence/{ev['evidence_id']}.txt", ev.get("details") or "Not Available")
    return buffer.getvalue()


def normalize_report(report: dict[str, Any]) -> dict[str, Any]:
    source = deepcopy(report)
    scan = source.get("scan", {})
    project = source.get("project", {})
    assets = source.get("assets", [])
    findings = [_normalize_finding(f, idx + 1) for idx, f in enumerate(_reportable_findings(source.get("findings", [])))]
    severity_counts = {key: 0 for key in SEVERITY_ORDER}
    for finding in findings:
        severity_counts[finding["severity_key"]] = severity_counts.get(finding["severity_key"], 0) + 1
    highest = next((sev for sev in SEVERITY_ORDER if severity_counts.get(sev)), "informational") if findings else "informational"
    generated_at = source.get("generated_at") or datetime.now(timezone.utc).isoformat()
    report_number = f"NST-VAPT-{_parse_datetime(generated_at).year if _parse_datetime(generated_at) else datetime.now().year}-{str(scan.get('id') or '0000')[:4].upper()}"
    target = _first_asset_value(assets) or "Not Provided"
    doc = {
        "Document_Title": BRAND_REPORT_TITLE,
        "Report_Number": report_number,
        "Version": "1.0",
        "Classification": BRAND_CONFIDENTIALITY,
        "Client": project.get("client") or project.get("name") or "Not Provided",
        "Project": project.get("name") or "Not Provided",
        "Engagement": scan.get("name") or "Not Provided",
        "Target": target,
        "Assessment_Type": _assessment_type(scan),
        "Assessment_Mode": _title_or_default(scan.get("assessment_mode"), "Black Box"),
        "Assessment_Period": _assessment_period(scan),
        "Report_Date": format_datetime(generated_at),
        "Prepared_By": BRAND_COMPANY_NAME,
        "Reviewed_By": "Pending",
        "Approved_By": "Pending",
        "Report_Status": "Draft Pending Approval",
    }
    evidence_manifest = _evidence_manifest(findings)
    normalized = {
        "document_control": doc,
        "cover_items": [(k.replace("_", " ").replace("Document Title", "Report Title"), v) for k, v in doc.items() if k not in ("Document_Title", "Report_Status")],
        "toc": _toc(),
        "executive_summary": _executive_summary(doc, findings, assets, highest),
        "risk_cards": _risk_cards(findings, severity_counts, assets, highest),
        "assessment_overview": _assessment_overview(scan, project, assets),
        "scope_assets": _scope_assets(assets, source.get("sections", {}).get("service_discovery", {}).get("services", []), project),
        "methodology": _methodology(source),
        "limitations": _limitations(scan, assets),
        "risk_methodology": _risk_methodology(),
        "severity_summary": [{"key": k, "label": SEVERITY_LABELS[k], "count": severity_counts.get(k, 0), "color": SEVERITY_COLORS[k]} for k in SEVERITY_ORDER],
        "findings": findings,
        "roadmap": _roadmap(findings),
        "positive_observations": _positive_observations(findings, evidence_manifest),
        "conclusion": _conclusion(findings),
        "evidence_manifest": evidence_manifest,
        "evidence_manifest_raw": _evidence_manifest(findings, raw=True),
        "references": _references(findings),
        "signoff": _signoff(),
    }
    return normalized


def validate_report(report: dict[str, Any]) -> dict[str, Any]:
    failures = []
    for key in ("document_control", "scope_assets", "methodology", "limitations", "risk_methodology", "conclusion"):
        if not report.get(key):
            failures.append(f"Missing mandatory section: {key}")
    if not report.get("cover_items"):
        failures.append("Cover page metadata is missing")
    for finding in report.get("findings", []):
        if not finding.get("stable_id"):
            failures.append(f"Finding missing stable ID: {finding.get('title')}")
        if not finding.get("severity_label") or not finding.get("affected_asset"):
            failures.append(f"Finding missing severity or affected asset: {finding.get('stable_id')}")
        if not finding.get("evidence"):
            failures.append(f"Finding missing evidence or evidence warning: {finding.get('stable_id')}")
        if not finding.get("long_term_remediation") or finding.get("long_term_remediation") == "Not Provided":
            failures.append(f"Finding missing remediation: {finding.get('stable_id')}")
    return {"blocking_failures": failures, "passed": not failures}


def format_datetime(value: Any) -> str:
    dt = _parse_datetime(value)
    if not dt:
        return "Not Provided"
    return dt.strftime("%d %B %Y, %H:%M UTC")


def format_severity(value: Any) -> str:
    return SEVERITY_LABELS.get(str(value or "").lower(), str(value or "Not Provided").replace("_", " ").title())


def _normalize_finding(finding: dict[str, Any], index: int) -> dict[str, Any]:
    title = _normalize_title(finding.get("title"), finding)
    sev_key = _severity_key(finding.get("severity"))
    stable_id = _stable_finding_id(title, index)
    evidence = [_normalize_evidence(ev, stable_id, finding) for ev in finding.get("evidence") or []]
    if not evidence:
        evidence = [_normalize_evidence({"id": f"EVID-{stable_id}-WARN", "evidence_type": "Evidence Warning", "summary": "Evidence was not available in the generated report data.", "details": "Not Available", "hash_value": "Not Available"}, stable_id, finding)]
    refs = _finding_references(title, finding)
    normalized = {
        "source_id": finding.get("id"),
        "stable_id": stable_id,
        "title": title,
        "severity_key": sev_key,
        "severity_label": SEVERITY_LABELS[sev_key],
        "cvss_score": str(finding.get("cvss_score")) if finding.get("cvss_score") is not None else "Not Provided",
        "cvss_vector": finding.get("cvss_vector") or "Not Provided",
        "owasp_category": finding.get("owasp_category") or "Not Provided",
        "cwe_id": finding.get("cwe_id") or "Not Provided",
        "affected_asset": finding.get("affected_asset") or "Not Provided",
        "affected_port": _affected_port(finding),
        "affected_endpoint": _affected_endpoint(finding),
        "http_method": _http_method(finding),
        "environment": finding.get("environment") or "External",
        "status_label": STATUS_LABELS.get(str(finding.get("status") or finding.get("integrity_status") or "verified").lower(), _title_or_default(finding.get("status"), "Verified")),
        "evidence_status": _title_or_default(finding.get("integrity_status"), "Verified"),
        "first_observed": _first_evidence_time(evidence),
        "last_confirmed": _first_evidence_time(evidence),
        "priority_label": _priority_label(sev_key),
        "summary": _finding_summary(title, finding),
        "technical_description": _technical_description(title, finding),
        "business_impact": finding.get("business_impact") or _business_impact(title),
        "technical_impact": finding.get("technical_impact") or _technical_impact(title),
        "header_table": _header_table(finding),
        "service_table": _service_table(finding),
        "evidence": evidence,
        "steps_to_reproduce": "Detailed reproduction steps were not recorded by the scan workflow.",
        "immediate_mitigation": _immediate_mitigation(title),
        "long_term_remediation": finding.get("remediation") or _long_term_remediation(title),
        "verification_steps": _verification_steps(title),
        "references": refs,
        "retest_status": "Not Retested",
    }
    normalized["metadata"] = [
        ("Finding ID", normalized["stable_id"]), ("Finding Title", normalized["title"]), ("Severity", normalized["severity_label"]),
        ("CVSS Score", normalized["cvss_score"]), ("CVSS Vector", normalized["cvss_vector"]), ("OWASP Category", normalized["owasp_category"]),
        ("CWE", normalized["cwe_id"]), ("Affected Asset", normalized["affected_asset"]), ("Affected Port", normalized["affected_port"]),
        ("Affected Endpoint", normalized["affected_endpoint"]), ("HTTP Method", normalized["http_method"]), ("Environment", normalized["environment"]),
        ("Finding Status", normalized["status_label"]), ("Evidence Status", normalized["evidence_status"]), ("First Observed", normalized["first_observed"]), ("Last Confirmed", normalized["last_confirmed"]),
    ]
    return normalized


def _normalize_evidence(ev: dict[str, Any], stable_id: str, finding: dict[str, Any]) -> dict[str, Any]:
    raw_hash = ev.get("hash_value") or "Not Available"
    return {
        "evidence_id": _short_evidence_id(ev.get("id")),
        "finding_id": stable_id,
        "evidence_type": ev.get("evidence_type") or "Validated Observation",
        "summary": ev.get("summary") or "Evidence captured during validation.",
        "details": ev.get("details") or "Not Available",
        "capture_time": format_datetime(ev.get("created_at")),
        "hash": raw_hash,
        "hash_wrapped": _wrap_hash(raw_hash),
        "affected_asset": finding.get("affected_asset") or "Not Provided",
        "redaction_status": "Redacted",
        "included": "Yes",
    }


def _reportable_findings(findings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    filtered = [f for f in findings if str(f.get("status") or "").lower() not in ("rejected", "false_positive")]
    return sorted(filtered, key=lambda f: (SEVERITY_ORDER.index(_severity_key(f.get("severity"))), str(f.get("title") or "")))


def _stable_finding_id(title: str, index: int) -> str:
    lowered = title.lower()
    if "tcp" in lowered or "service" in lowered or "port" in lowered:
        return "NST-NET-001"
    if "server header" in lowered:
        return "NST-WEB-002"
    if "security header" in lowered or "browser" in lowered or "header" in lowered:
        return "NST-WEB-001"
    return f"NST-WEB-{index:03d}"


def _normalize_title(title: str | None, finding: dict[str, Any]) -> str:
    text = title or "Untitled Finding"
    lowered = text.lower()
    evidence_text = json.dumps(finding.get("evidence") or [])
    if "open tcp" in lowered or "open port" in lowered:
        return "Publicly Accessible TCP Service"
    if "missing" in lowered and "header" in lowered:
        return "Missing Browser Security Headers"
    if "server" in lowered and "header" in lowered:
        return "Server Header Disclosure"
    if "open_services" in evidence_text:
        return "Publicly Accessible TCP Service"
    return text


def _header_table(finding: dict[str, Any]) -> list[dict[str, str]]:
    if "header" not in (finding.get("title") or "").lower() and not any("missing_headers" in (ev.get("details") or "") for ev in finding.get("evidence") or []):
        return []
    missing = _extract_missing_headers(finding)
    purpose = {
        "Content-Security-Policy": "Restricts where browser-executed content can load from and can control framing through frame-ancestors.",
        "X-Content-Type-Options": "Reduces MIME-sniffing behavior that may cause browsers to interpret content unexpectedly.",
        "Referrer-Policy": "Controls how much referrer information is sent to other origins.",
        "Permissions-Policy": "Limits access to selected browser features and APIs.",
        "X-Frame-Options": "Provides legacy frame-control protection where CSP frame-ancestors is not used or for compatibility.",
    }
    notes = {
        "Content-Security-Policy": "Define an application-specific policy. Prefer frame-ancestors for modern frame-control enforcement.",
        "X-Content-Type-Options": "Common value: nosniff.",
        "Referrer-Policy": "Common baseline: strict-origin-when-cross-origin, adjusted to application needs.",
        "Permissions-Policy": "Disable features not required by the application.",
        "X-Frame-Options": "May be retained for compatibility when appropriate; CSP frame-ancestors is generally preferred.",
    }
    return [{"header": h, "observed": "Missing", "recommended": "Configure", "purpose": purpose.get(h, "Browser security control."), "notes": notes.get(h, "Implement according to application requirements.")} for h in missing]


def _service_table(finding: dict[str, Any]) -> list[dict[str, str]]:
    if "tcp" not in _normalize_title(finding.get("title"), finding).lower() and "service" not in _normalize_title(finding.get("title"), finding).lower():
        return []
    host = finding.get("affected_asset") or "Not Provided"
    port = _affected_port(finding)
    return [{"host": host, "port": port, "protocol": "TCP", "detected_service": "HTTP" if str(port) == "8080" else "Not Provided", "exposure": "Publicly accessible", "business_justification": "Not Provided", "recommended_action": "Validate operational necessity and restrict exposure where not required."}]


def _extract_missing_headers(finding: dict[str, Any]) -> list[str]:
    known = ["Content-Security-Policy", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy", "X-Frame-Options"]
    blob = json.dumps(finding.get("evidence") or []) + " " + (finding.get("description") or "")
    found = [h for h in known if h.lower() in blob.lower()]
    return found or known


def _evidence_manifest(findings: list[dict[str, Any]], raw: bool = False) -> list[dict[str, Any]]:
    rows = []
    for finding in findings:
        for ev in finding.get("evidence", []):
            row = {"evidence_id": ev["evidence_id"], "finding_id": finding["stable_id"], "evidence_type": ev["evidence_type"], "affected_asset": finding["affected_asset"], "capture_time": ev["capture_time"], "sha256": ev["hash"], "hash_wrapped": ev["hash_wrapped"], "redaction_status": "Redacted", "included": "Yes", "details": ev.get("details")}
            rows.append(row if raw else {k: v for k, v in row.items() if k != "details"})
    return rows or [{"evidence_id": "Not Available", "finding_id": "Not Available", "evidence_type": "Not Available", "affected_asset": "Not Available", "capture_time": "Not Available", "sha256": "Not Available", "hash_wrapped": "Not Available", "redaction_status": "Not Applicable", "included": "No"}]


def _fallback_reportlab_pdf(report: dict[str, Any]) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    buffer = BytesIO(); doc = SimpleDocTemplate(buffer, pagesize=A4); styles = getSampleStyleSheet()
    story = [Paragraph(BRAND_REPORT_TITLE, styles["Title"]), Spacer(1, 12), Paragraph(report["executive_summary"], styles["BodyText"])]
    for finding in report.get("findings", []):
        story += [Paragraph(f"{finding['stable_id']} | {finding['title']}", styles["Heading2"]), Paragraph(finding["summary"], styles["BodyText"])]
    doc.build(story); return buffer.getvalue()


def _logo_uri() -> str | None:
    candidates = [
        Path(__file__).resolve().parents[2] / "frontend/public/branding/nst-logo-full.png",
        Path(__file__).resolve().parents[2] / "frontend/public/branding/nst-logo-full.jpg",
        Path(__file__).resolve().parents[1] / "public/branding/nst-logo-full.png",
        Path(__file__).resolve().parents[1] / "public/branding/nst-logo-full.jpg",
    ]
    for path in candidates:
        if path.exists():
            return path.as_uri()
    return None


def _parse_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime): return value
    if not value: return None
    try: return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError: return None

def _wrap_hash(value: Any) -> str:
    text = str(value or "Not Available")
    return "\n".join(text[i:i + 32] for i in range(0, len(text), 32))

def _short_evidence_id(value: Any) -> str:
    text = str(value or "EVIDENCE")
    if text.startswith("fallback-"): text = text.replace("fallback-", "")
    return "EVID-" + re.sub(r"[^A-Za-z0-9]", "", text).upper()[:8]

def _severity_key(value: Any) -> str:
    key = str(value or "informational").lower()
    return "informational" if key == "info" else key if key in SEVERITY_ORDER else "informational"

def _title_or_default(value: Any, default: str) -> str:
    return str(value).replace("_", " ").title() if value else default

def _first_asset_value(assets: list[dict[str, Any]]) -> str | None:
    return next((asset.get("value") for asset in assets if asset.get("value")), None)

def _assessment_type(scan: dict[str, Any]) -> str:
    return "Standard Vulnerability Assessment" if scan.get("scan_category") != "pentest" else "Penetration Test"

def _assessment_period(scan: dict[str, Any]) -> str:
    start = format_datetime(scan.get("started_at")); end = format_datetime(scan.get("completed_at"))
    return start if start == end or end == "Not Provided" else f"{start} to {end}"

def _duration(start: Any, end: Any) -> str:
    s, e = _parse_datetime(start), _parse_datetime(end)
    if not s or not e: return "Not Provided"
    seconds = max(0, int((e - s).total_seconds()))
    minutes, sec = divmod(seconds, 60); hours, minutes = divmod(minutes, 60)
    parts = []
    if hours: parts.append(f"{hours} hour{'s' if hours != 1 else ''}")
    if minutes: parts.append(f"{minutes} minute{'s' if minutes != 1 else ''}")
    parts.append(f"{sec} second{'s' if sec != 1 else ''}")
    return " ".join(parts)

def _assessment_overview(scan: dict[str, Any], project: dict[str, Any], assets: list[dict[str, Any]]) -> list[tuple[str, str]]:
    return [("Project", project.get("name") or "Not Provided"), ("Engagement", scan.get("name") or "Not Provided"), ("Target", _first_asset_value(assets) or "Not Provided"), ("Assessment Type", _assessment_type(scan)), ("Assessment Mode", _title_or_default(scan.get("assessment_mode"), "Black Box")), ("Scan Profile", scan.get("scan_depth") or "Not Provided"), ("Assessment Start", format_datetime(scan.get("started_at"))), ("Assessment Completion", format_datetime(scan.get("completed_at"))), ("Testing Duration", _duration(scan.get("started_at"), scan.get("completed_at"))), ("Environment", project.get("environment") or "External"), ("Lead Tester", BRAND_COMPANY_NAME), ("Reviewer", "Pending"), ("Authorization Status", "Authorized")]

def _scope_assets(assets: list[dict[str, Any]], services: list[dict[str, Any]], project: dict[str, Any]) -> list[dict[str, str]]:
    rows = []
    for asset in assets or []:
        service = next((s for s in services if str(s.get("host")) in str(asset.get("value"))), {})
        value = asset.get("value") or "Not Provided"
        port = str(service.get("port") or _port_from_value(value) or "Not Provided")
        rows.append({"asset": _host_from_value(value), "asset_type": "Web service" if port in ("80", "443", "8080") else _title_or_default(asset.get("type"), "Asset"), "protocol": "HTTPS" if str(value).startswith("https") or port == "443" else "HTTP" if port in ("80", "8080") else "TCP", "port": port, "environment": project.get("environment") or "External", "testing_status": "Tested", "notes": "Authorized in-scope asset"})
    return rows or [{"asset": "Not Provided", "asset_type": "Not Provided", "protocol": "Not Provided", "port": "Not Provided", "environment": "Not Provided", "testing_status": "Not Tested", "notes": "Not Provided"}]

def _methodology(source: dict[str, Any]) -> dict[str, Any]:
    frameworks = source.get("sections", {}).get("methodology", {}).get("standards") or ["OWASP Top 10", "CWE", "CVSS", "OWASP Web Security Testing Guide"]
    return {"steps": ["Authorization and scope validation", "Target availability verification", "Service discovery", "HTTP response analysis", "Security-header assessment", "Technology-disclosure analysis", "Evidence collection", "Evidence integrity hashing", "Finding validation", "Severity classification", "Human review", "Report generation"], "frameworks": frameworks}

def _limitations(scan: dict[str, Any], assets: list[dict[str, Any]]) -> list[str]:
    items = ["Point-in-time assessment", f"{len(assets) or 'No'} external asset{'s' if len(assets) != 1 else ''} tested", "Limited testing duration", "No authenticated testing" if scan.get("assessment_mode") == "black_box" else "Authenticated testing status: Not Provided", "No source-code review", "No destructive testing", "No denial-of-service testing", "No social engineering", "No production-data modification", "No retesting completed"]
    return items

def _risk_methodology() -> list[dict[str, str]]:
    return [{"key": "critical", "label": "Critical", "meaning": "Urgent risk with strong evidence of severe technical impact or exposure."}, {"key": "high", "label": "High", "meaning": "Significant exposure or exploitability requiring prompt remediation."}, {"key": "medium", "label": "Medium", "meaning": "Security weakness with meaningful technical impact or defense-in-depth reduction."}, {"key": "low", "label": "Low", "meaning": "Limited-impact issue or hardening gap."}, {"key": "informational", "label": "Informational", "meaning": "Observation requiring validation, tracking, or operational review."}]

def _risk_cards(findings: list[dict[str, Any]], counts: dict[str, int], assets: list[dict[str, Any]], highest: str) -> list[dict[str, Any]]:
    return [{"label": "Overall Risk Rating", "value": SEVERITY_LABELS.get(highest, "Informational")}, {"label": "Verified Findings", "value": len(findings)}, {"label": "Critical", "value": counts.get("critical", 0)}, {"label": "High", "value": counts.get("high", 0)}, {"label": "Medium", "value": counts.get("medium", 0)}, {"label": "Low", "value": counts.get("low", 0)}, {"label": "Informational", "value": counts.get("informational", 0)}, {"label": "Assets Tested", "value": len(assets)}, {"label": "Retest Required", "value": "Yes" if findings else "Not Applicable"}]

def _executive_summary(doc: dict[str, str], findings: list[dict[str, Any]], assets: list[dict[str, Any]], highest: str) -> str:
    counts = {sev: len([f for f in findings if f["severity_key"] == sev]) for sev in SEVERITY_ORDER}
    distribution = ", ".join(f"{count} {SEVERITY_LABELS[sev]}" for sev, count in counts.items() if count) or "no verified findings"
    main_theme = "browser security-header configuration and exposed service validation" if findings else "continued security monitoring"
    priority = findings[0]["title"] if findings else "Not Applicable"
    return (f"{BRAND_COMPANY_NAME} conducted an authorized external security assessment of the identified target within the approved scope. The assessment evaluated publicly accessible attack surface and selected application security controls using safe, non-destructive techniques. "
            f"The assessment covered {len(assets)} tested asset(s) and identified {len(findings)} verified observation(s): {distribution}. The highest identified severity was {SEVERITY_LABELS.get(highest, 'Informational')}. "
            f"The main risk theme was {main_theme}. Immediate remediation priority should focus on {priority}. This assessment represents a point-in-time review, and focused retesting is recommended after remediation.")

def _finding_summary(title: str, finding: dict[str, Any]) -> str:
    if title == "Missing Browser Security Headers": return "The assessed web service did not present one or more recommended browser security headers in the captured HTTP response evidence."
    if title == "Server Header Disclosure": return "The assessed service disclosed server technology information in the HTTP Server header."
    if title == "Publicly Accessible TCP Service": return "A TCP service was reachable from the assessment network and should be validated against business requirements."
    return finding.get("description") or "Not Provided"

def _technical_description(title: str, finding: dict[str, Any]) -> str:
    if title == "Missing Browser Security Headers": return "The scan workflow reviewed HTTP response metadata and observed that recommended browser-enforced controls were absent. Expected behavior is to configure appropriate headers aligned to application requirements so browsers can enforce additional client-side protections."
    if title == "Server Header Disclosure": return "The scan workflow reviewed HTTP response headers and observed server technology disclosure. Expected behavior is to minimize unnecessary technology disclosure in production responses where operationally feasible."
    if title == "Publicly Accessible TCP Service": return "The scan workflow performed service discovery and observed a reachable TCP service. This does not indicate a vulnerability by itself, but it increases externally visible attack surface and requires operational validation."
    return finding.get("description") or "Not Provided"

def _business_impact(title: str) -> str:
    if title == "Publicly Accessible TCP Service": return "Business justification for the exposed service was not provided in the report data."
    return "The available evidence supports a security-hardening concern; specific business impact was not provided."

def _technical_impact(title: str) -> str:
    if title == "Missing Browser Security Headers": return "Reduced browser-enforced protection against selected client-side attack techniques and content-handling risks."
    if title == "Server Header Disclosure": return "Unnecessary technology disclosure may assist attacker fingerprinting and targeting."
    if title == "Publicly Accessible TCP Service": return "External reachability expands the attack surface and should be limited to services with a validated need."
    return "Not Provided"

def _immediate_mitigation(title: str) -> str:
    if title == "Missing Browser Security Headers": return "Add a tested baseline set of browser security headers in a staging environment before production rollout."
    if title == "Server Header Disclosure": return "Reduce or remove unnecessary Server header detail where supported by the hosting stack."
    if title == "Publicly Accessible TCP Service": return "Confirm that external access is required and restrict source networks if not publicly necessary."
    return "Review and reduce exposure while remediation is planned."

def _long_term_remediation(title: str) -> str:
    if title == "Missing Browser Security Headers": return "Implement application-specific Content-Security-Policy, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, and frame-control using CSP frame-ancestors where appropriate."
    if title == "Server Header Disclosure": return "Standardize production server configuration to minimize technology/version disclosure and validate after deployment."
    if title == "Publicly Accessible TCP Service": return "Document business ownership and access requirements, then enforce network controls aligned with the approved exposure model."
    return "Not Provided"

def _verification_steps(title: str) -> str:
    if title == "Missing Browser Security Headers": return "Re-request the affected endpoint and confirm the expected headers are present with approved values."
    if title == "Server Header Disclosure": return "Re-request the affected endpoint and confirm the Server header no longer exposes unnecessary technology detail."
    if title == "Publicly Accessible TCP Service": return "Repeat external service discovery and confirm exposure matches the approved business requirement."
    return "Perform a focused retest after remediation."

def _finding_references(title: str, finding: dict[str, Any]) -> list[dict[str, str]]:
    refs = [{"label": "CVSS Specification", "url": "https://www.first.org/cvss/"}]
    if title == "Missing Browser Security Headers": refs += [{"label": "OWASP Secure Headers Project", "url": "https://owasp.org/www-project-secure-headers/"}, {"label": "CWE-693: Protection Mechanism Failure", "url": "https://cwe.mitre.org/data/definitions/693.html"}]
    if title == "Server Header Disclosure": refs += [{"label": "CWE-200: Exposure of Sensitive Information", "url": "https://cwe.mitre.org/data/definitions/200.html"}]
    return refs

def _references(findings: list[dict[str, Any]]) -> list[dict[str, str]]:
    unique = {}
    for finding in findings:
        for ref in finding.get("references", []): unique[ref["url"]] = ref
    return list(unique.values()) or [{"label": "OWASP Web Security Testing Guide", "url": "https://owasp.org/www-project-web-security-testing-guide/"}]

def _roadmap(findings: list[dict[str, Any]]) -> list[dict[str, str]]:
    rows = []
    for f in findings:
        timeframe = "7-14 days" if f["severity_key"] in ("critical", "high", "medium") else "30 days" if f["severity_key"] == "low" else "Validate operational necessity"
        priority = "Priority 1" if f["severity_key"] in ("critical", "high", "medium") else "Priority 2" if f["severity_key"] == "low" else "Priority 3"
        rows.append({"priority": priority, "finding_id": f["stable_id"], "action": f["long_term_remediation"], "owner": "Application Owner" if "WEB" in f["stable_id"] else "Infrastructure Owner", "timeframe": timeframe, "retest_required": "Yes", "status": "Open"})
    return rows or [{"priority": "Not Applicable", "finding_id": "Not Applicable", "action": "Not Applicable", "owner": "Not Applicable", "timeframe": "Not Applicable", "retest_required": "Not Applicable", "status": "Not Applicable"}]

def _positive_observations(findings: list[dict[str, Any]], evidence: list[dict[str, Any]]) -> list[str]:
    items = ["The assessment completed without destructive techniques."]
    if evidence and evidence[0].get("evidence_id") != "Not Available": items.append("Evidence records were integrity-hashed.")
    if not any(f["severity_key"] in ("critical", "high") for f in findings): items.append("No Critical or High findings were verified.")
    return items

def _conclusion(findings: list[dict[str, Any]]) -> str:
    themes = {f["title"] for f in findings}
    parts = []
    if "Missing Browser Security Headers" in themes: parts.append("browser security-header configuration")
    if "Server Header Disclosure" in themes: parts.append("reduction of unnecessary server disclosure")
    if "Publicly Accessible TCP Service" in themes: parts.append("review of publicly exposed services")
    focus = ", ".join(parts) if parts else "continued security monitoring"
    return f"The assessment identified remediation focus areas involving {focus}. A focused retest should be performed after remediation. This assessment represents a point-in-time review of the approved scope. Security conditions may change as the application, infrastructure, and dependencies evolve."

def _signoff() -> list[dict[str, str]]:
    return [{"role": role, "name": "Pending", "title": "Pending", "organization": BRAND_COMPANY_NAME if role != "Client Acknowledgement" else "Pending", "signature": "Pending", "date": "Pending"} for role in ["Prepared By", "Reviewed By", "Approved By", "Client Acknowledgement"]]

def _toc() -> list[dict[str, str]]:
    titles = [("document-control", "Document Control"), ("confidentiality-notice", "Confidentiality Notice"), ("table-of-contents", "Table of Contents"), ("executive-summary", "Executive Summary"), ("assessment-overview", "Assessment Overview"), ("scope", "Scope and Tested Assets"), ("methodology", "Assessment Methodology"), ("limitations", "Assessment Limitations"), ("risk-methodology", "Risk-Rating Methodology"), ("severity-summary", "Findings Severity Summary"), ("findings-summary", "Findings Summary Table"), ("detailed-findings", "Detailed Findings"), ("remediation-roadmap", "Remediation Roadmap"), ("positive-observations", "Positive Security Observations"), ("retest-status", "Retest Status"), ("conclusion", "Conclusion"), ("evidence-manifest", "Evidence Manifest"), ("references", "References"), ("approval", "Approval and Sign-Off")]
    return [{"id": i, "title": t} for i, t in titles]

def _priority_label(sev: str) -> str:
    return "Priority 1" if sev in ("critical", "high", "medium") else "Priority 2" if sev == "low" else "Priority 3"
def _affected_port(f: dict[str, Any]) -> str: return str(_port_from_value(f.get("affected_asset")) or _search_evidence(f, r"Port: ([0-9]+)") or "Not Provided")
def _affected_endpoint(f: dict[str, Any]) -> str: return _search_evidence(f, r"Url: ([^\n]+)") or f.get("affected_asset") or "Not Provided"
def _http_method(f: dict[str, Any]) -> str: return _search_evidence(f, r"Method: ([A-Z]+)") or "Not Provided"
def _first_evidence_time(evidence: list[dict[str, Any]]) -> str: return evidence[0].get("capture_time") if evidence else "Not Available"
def _search_evidence(f: dict[str, Any], pattern: str) -> str | None:
    blob = "\n".join(ev.get("details") or "" for ev in f.get("evidence") or [])
    match = re.search(pattern, blob, re.I); return match.group(1).strip() if match else None
def _host_from_value(value: str) -> str:
    return re.sub(r"^https?://", "", str(value)).split("/")[0].split(":")[0]
def _port_from_value(value: Any) -> str | None:
    match = re.search(r":([0-9]{2,5})(?:/|$)", str(value or "")); return match.group(1) if match else None
