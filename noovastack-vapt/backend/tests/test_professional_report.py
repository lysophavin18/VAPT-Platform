import json
import zipfile
from io import BytesIO

from reporting.professional_report import (
    format_datetime,
    render_docx_report,
    render_evidence_zip,
    render_html_report,
    render_markdown_report,
    render_pdf_report,
)


def sample_report():
    return {
        "generated_at": "2026-07-21T08:38:37.077294",
        "scan": {
            "id": "abcd1234-1111-2222-3333-444455556666",
            "name": "Scheduled External Web Scan",
            "status": "completed",
            "assessment_mode": "black_box",
            "scan_category": "vulnerability_assessment",
            "scan_depth": "standard",
            "started_at": "2026-07-21T08:37:31.000000",
            "completed_at": "2026-07-21T08:38:37.000000",
        },
        "project": {"name": "Scheduled External Web Scan", "environment": "External"},
        "assets": [{"type": "url", "value": "http://178.128.117.187:8080", "scope_status": "in_scope", "approval_status": "approved"}],
        "summary": {"severity_counts": {"medium": 1, "low": 1, "informational": 1}},
        "sections": {
            "methodology": {"standards": ["OWASP Top 10", "CWE", "CVSS", "OWASP Web Security Testing Guide"]},
            "service_discovery": {"services": [{"host": "178.128.117.187", "port": 8080, "service": "http"}]},
        },
        "findings": [
            {
                "id": "f1",
                "title": "Missing Browser Security Headers",
                "severity": "medium",
                "status": "open",
                "integrity_status": "verified",
                "description": "Missing Content-Security-Policy and X-Content-Type-Options headers.",
                "owasp_category": "Security Misconfiguration",
                "cwe_id": "CWE-693",
                "cvss_score": 5.3,
                "affected_asset": "http://178.128.117.187:8080",
                "remediation": "Configure appropriate browser security headers.",
                "evidence": [{"id": "e1", "evidence_type": "HTTP Response Snapshot", "summary": "Headers were absent.", "details": "Url: http://178.128.117.187:8080\nMissing Headers: Content-Security-Policy, X-Content-Type-Options, Referrer-Policy", "hash_value": "dc4b26ba1e9dc2cb1ff0b4319a9d77f8a5dc862bd0755184c74bde809b2a5c7b", "created_at": "2026-07-21T08:38:00"}],
            },
            {
                "id": "f2",
                "title": "Server Header Disclosure",
                "severity": "low",
                "status": "open",
                "integrity_status": "verified",
                "description": "Server header disclosed technology.",
                "owasp_category": "Security Misconfiguration",
                "cwe_id": "CWE-200",
                "cvss_score": 3.1,
                "affected_asset": "http://178.128.117.187:8080",
                "remediation": "Reduce unnecessary server header detail.",
                "evidence": [{"id": "e2", "evidence_type": "HTTP Response Snapshot", "summary": "Server header observed.", "details": "Header: Server\nObserved Value: HexStrikeDashboard/1.0 Python/3.14.4", "hash_value": "abcd" * 16, "created_at": "2026-07-21T08:38:02"}],
            },
            {
                "id": "f3",
                "title": "Open TCP Services Discovered",
                "severity": "informational",
                "status": "open",
                "integrity_status": "verified",
                "description": "One TCP service was reachable.",
                "affected_asset": "178.128.117.187:8080",
                "remediation": "Validate operational necessity.",
                "evidence": [{"id": "e3", "evidence_type": "Service Observation", "summary": "TCP 8080 reachable.", "details": "Host: 178.128.117.187\nPort: 8080\nService: http", "hash_value": "1234" * 16, "created_at": "2026-07-21T08:38:03"}],
            },
            {"id": "f4", "title": "Rejected Finding", "severity": "critical", "status": "rejected", "affected_asset": "x"},
        ],
    }


def test_human_readable_date_formatting():
    assert format_datetime("2026-07-21T08:38:37.077294") == "21 July 2026, 08:38 UTC"


def test_html_report_contains_required_professional_sections_and_no_raw_iso_dates():
    rendered = render_html_report(sample_report())
    html = rendered.html
    assert rendered.validation["passed"] is True
    assert "NOOVASTACK VAPT" in html
    assert "NOOVASTACK VAPT PLATFORM" not in html
    assert "TECHNICAL SECURITY<br>ASSESSMENT REPORT" in html
    assert "Document Control" in html
    assert "Table of Contents" in html
    assert "Findings Severity Summary" in html
    assert "Security Findings Cycle" not in html
    assert "NST-WEB-001" in html
    assert "NST-WEB-002" in html
    assert "NST-NET-001" in html
    assert "Publicly Accessible TCP Service" in html
    assert "Rejected Finding" not in html
    assert "2026-07-21T08:38" not in html
    assert "overflow-wrap: anywhere" in html
    assert "page-break-inside: avoid" in html


def test_export_formats_are_generated():
    report = sample_report()
    pdf, validation = render_pdf_report(report)
    assert pdf.startswith(b"%PDF")
    assert len(validation["export_sha256"]) == 64
    docx = render_docx_report(report)
    assert docx.startswith(b"PK")
    markdown = render_markdown_report(report)
    assert "# NoovaStack VAPT Technical Security Assessment Report" in markdown
    evidence_zip = render_evidence_zip(report)
    with zipfile.ZipFile(BytesIO(evidence_zip)) as zf:
        manifest = json.loads(zf.read("manifest.json"))
        assert manifest[0]["finding_id"] == "NST-WEB-001"
