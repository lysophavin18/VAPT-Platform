import asyncio
import os
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from database import AsyncSessionLocal
from database.models import MitigationPlan
from api.routes.mitigations import TRANSITIONS, SLA_HOURS
from main import app


@pytest.fixture(scope="module")
def test_client():
    with TestClient(app) as client:
        yield client


@pytest.fixture(scope="module")
def auth_headers(test_client):
    response = test_client.post("/api/auth/login", data={"username": "admin@noovastack.local", "password": os.environ["INITIAL_ADMIN_PASSWORD"]})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_workflow_graph_rejects_unsafe_shortcuts():
    assert "verified" not in TRANSITIONS["draft"]
    assert "closed" not in TRANSITIONS["implemented"]
    assert TRANSITIONS["verification_failed"] == {"in_progress"}
    assert SLA_HOURS == {"critical": 72, "high": 168, "medium": 720, "low": 2160}


def test_create_submit_and_self_approval_guard(test_client, auth_headers):
    findings = test_client.get("/api/findings", headers=auth_headers)
    assert findings.status_code == 200
    if not findings.json():
        return
    finding = findings.json()[0]
    scans = test_client.get("/api/scans", headers=auth_headers)
    assert scans.status_code == 200
    scan = next(item for item in scans.json() if item["id"] == finding["scan_id"])
    expires = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    response = test_client.post("/api/mitigations", headers=auth_headers, json={
        "project_id": scan["project_id"], "finding_id": finding["id"],
        "asset_ids": [finding["asset_id"]] if finding.get("asset_id") else [],
        "title": "Automated mitigation workflow validation",
        "mitigation_type": "temporary", "strategy": "network_restriction",
        "proposed_mitigation": "Restrict the affected service to an approved allowlist.",
        "verification_criteria": "Confirm external access is blocked and approved access remains functional.",
        "temporary_expires_at": expires,
        "owner_id": None,
        "tasks": [],
        "controls": [{"control_type": "network_restriction", "description": "Apply an approved firewall allowlist.", "verification_method": "Independent connectivity test", "expires_at": expires}],
        "risk": {"expected_residual_risk": "medium"},
    })
    assert response.status_code == 201, response.text
    plan = response.json(); plan_id = plan["id"]
    try:
        # Owner is required before submission.
        blocked = test_client.post(f"/api/mitigations/{plan_id}/transition", headers=auth_headers, json={"status": "pending_approval"})
        assert blocked.status_code == 400
        me = test_client.get("/api/auth/me", headers=auth_headers).json()
        updated = test_client.patch(f"/api/mitigations/{plan_id}", headers=auth_headers, json={"owner_id": me["id"]})
        assert updated.status_code == 200
        submitted = test_client.post(f"/api/mitigations/{plan_id}/transition", headers=auth_headers, json={"status": "pending_approval"})
        assert submitted.status_code == 200, submitted.text
        approval_id = submitted.json()["approvals"][0]["id"]
        self_approval = test_client.post(f"/api/mitigations/{plan_id}/approvals/{approval_id}", headers=auth_headers, json={"decision": "approved", "comments": "Must be rejected as self approval."})
        assert self_approval.status_code == 403
        invalid = test_client.post(f"/api/mitigations/{plan_id}/transition", headers=auth_headers, json={"status": "verified"})
        assert invalid.status_code == 409
    finally:
        async def cleanup():
            async with AsyncSessionLocal() as db:
                await db.execute(delete(MitigationPlan).where(MitigationPlan.id == plan_id))
                await db.commit()
        asyncio.run(cleanup())
