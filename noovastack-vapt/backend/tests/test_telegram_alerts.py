from datetime import datetime, timezone
from unittest.mock import patch

import httpx

from integrations.telegram import activity_message, event_category, should_deliver_event, telegram_request


def test_finding_and_retest_events_are_triage_activity():
    assert event_category("finding", "finding_detected") == "findings"
    assert event_category("scan", "create_retest") == "findings"


def test_new_finding_alerts_respect_configured_severity():
    categories = {"findings", "scans"}
    severities = {"critical", "high"}

    assert should_deliver_event("finding", "finding_detected", {"severity": "critical"}, categories, severities)
    assert should_deliver_event("finding", "finding_detected", {"severity": "HIGH"}, categories, severities)
    assert not should_deliver_event("finding", "finding_detected", {"severity": "medium"}, categories, severities)
    assert not should_deliver_event("patch", "patch_created", {"priority": "critical"}, categories, severities)


def test_finding_workflow_events_without_severity_are_still_delivered():
    assert should_deliver_event(
        "finding",
        "status_updated",
        {"new_status": "confirmed"},
        {"findings"},
        {"critical"},
    )


def test_triage_message_contains_context_and_escapes_html():
    message = activity_message(
        "finding",
        "finding_detected",
        {
            "scan_name": "Production <scan>",
            "title": "SQL injection & auth bypass",
            "severity": "critical",
            "cvss_score": 9.8,
            "asset": "https://app.example.test?a=1&b=2",
            "status": "candidate",
        },
        datetime(2026, 11, 3, 10, 15, tzinfo=timezone.utc),
    )

    assert "Finding Detected" in message
    assert "<b>Severity:</b> critical" in message
    assert "<b>Cvss Score:</b> 9.8" in message
    assert "Production &lt;scan&gt;" in message
    assert "SQL injection &amp; auth bypass" in message
    assert "2026-11-03 10:15 UTC" in message


def test_transport_errors_do_not_expose_bot_token():
    token = "123456:super-secret-bot-token"
    request = httpx.Request("POST", f"https://api.telegram.org/bot{token}/getMe")
    with patch("integrations.telegram.httpx.Client") as client:
        client.return_value.__enter__.return_value.post.side_effect = httpx.ConnectError(
            "connection failed",
            request=request,
        )
        try:
            telegram_request(token, "getMe")
            assert False, "expected Telegram request to fail"
        except ValueError as exc:
            assert token not in str(exc)
            assert exc.__cause__ is None
