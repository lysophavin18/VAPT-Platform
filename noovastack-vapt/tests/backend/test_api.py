"""
NoovaStack VAPT Platform - Backend Tests
"""
import pytest
from datetime import datetime


@pytest.mark.asyncio
async def test_health_check(test_client):
    response = test_client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


@pytest.mark.asyncio
async def test_root(test_client):
    response = test_client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "NoovaStack VAPT Platform API"


@pytest.mark.asyncio
async def test_create_project(test_client, auth_headers):
    response = test_client.post(
        "/api/projects",
        json={"name": "Test Project", "environment": "testing"},
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Test Project"
    assert data["environment"] == "testing"
    return data["id"]


@pytest.mark.asyncio
async def test_list_projects(test_client, auth_headers):
    response = test_client.get("/api/projects", headers=auth_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)


@pytest.mark.asyncio
async def test_create_engagement(test_client, auth_headers):
    # Create project first
    proj_res = test_client.post(
        "/api/projects",
        json={"name": "Eng Test Project", "environment": "testing"},
        headers=auth_headers,
    )
    project_id = proj_res.json()["id"]

    response = test_client.post(
        f"/api/projects/{project_id}/engagements",
        json={
            "name": "Test Engagement",
            "assessment_mode": "black_box",
            "rules_of_engagement": "Test only authorized targets",
        },
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["assessment_mode"] == "black_box"


@pytest.mark.asyncio
async def test_create_asset(test_client, auth_headers):
    proj_res = test_client.post(
        "/api/projects",
        json={"name": "Asset Test Project"},
        headers=auth_headers,
    )
    project_id = proj_res.json()["id"]

    response = test_client.post(
        f"/api/projects/{project_id}/assets",
        json={
            "asset_type": "domain",
            "value": "example.com",
            "name": "Example Domain",
        },
        headers=auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["value"] == "example.com"


@pytest.mark.asyncio
async def test_create_scan(test_client, auth_headers):
    proj_res = test_client.post(
        "/api/projects",
        json={"name": "Scan Test Project"},
        headers=auth_headers,
    )
    project_id = proj_res.json()["id"]

    response = test_client.post(
        "/api/scans",
        json={
            "project_id": project_id,
            "name": "Quick Website Test",
            "assessment_mode": "black_box",
            "scan_category": "website",
            "scan_depth": "quick",
        },
        headers=auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["status"] == "draft"


@pytest.mark.asyncio
async def test_create_schedule(test_client, auth_headers):
    proj_res = test_client.post(
        "/api/projects",
        json={"name": "Schedule Test Project"},
        headers=auth_headers,
    )
    project_id = proj_res.json()["id"]

    response = test_client.post(
        "/api/scan-schedules",
        json={
            "project_id": project_id,
            "name": "Daily Quick Scan",
            "assessment_mode": "black_box",
            "scan_category": "website",
            "scan_depth": "quick",
            "recurrence_rule": "daily",
            "next_run_at": "2026-07-17T00:00:00Z",
        },
        headers=auth_headers,
    )
    assert response.status_code == 201


@pytest.mark.asyncio
async def test_dashboard_stats(test_client, auth_headers):
    response = test_client.get("/api/dashboard/stats", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "total_projects" in data


@pytest.mark.asyncio
async def test_list_scan_profiles(test_client, auth_headers):
    response = test_client.get("/api/admin/scan-profiles", headers=auth_headers)
    assert response.status_code == 200
    assert len(response.json()) > 0


@pytest.mark.asyncio
async def test_unauthorized_access(test_client):
    response = test_client.get("/api/projects")
    assert response.status_code in (401, 403)


@pytest.mark.asyncio
async def test_invalid_login(test_client):
    response = test_client.post(
        "/api/auth/login",
        data={"username": "nonexistent@test.com", "password": "wrong"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_safety_blocked_action():
    from safety import SafetyContext, is_safe
    ctx = SafetyContext(
        target="example.com",
        action="ddos",
        is_approved=True,
    )
    safe, reasons = is_safe(ctx)
    assert not safe
    assert any("ddos" in r.lower() or "blocked" in r.lower() for r in reasons)


@pytest.mark.asyncio
async def test_safety_approval_required():
    from safety import SafetyContext, is_safe
    ctx = SafetyContext(
        target="example.com",
        scan_depth="deep",
        tool="sqlmap",
        action="scan",
        is_approved=False,
    )
    safe, reasons = is_safe(ctx)
    assert not safe


@pytest.mark.asyncio
async def test_safety_internal_target_blocked():
    from safety import SafetyContext, is_safe
    ctx = SafetyContext(
        target="192.168.1.1",
        action="scan",
        is_approved=True,
    )
    safe, reasons = is_safe(ctx)
    assert not safe


@pytest.mark.asyncio
async def test_asset_normalization():
    from workers.tasks_discovery import _normalize_target
    results = _normalize_target("example.com")
    assert len(results) > 0
    types_found = [r[0] for r in results]
    assert "domain" in types_found


@pytest.mark.asyncio
async def test_scan_profiles_seeded(test_client, auth_headers):
    response = test_client.get("/api/admin/scan-profiles", headers=auth_headers)
    profiles = response.json()
    profile_names = [p["id"] for p in profiles]
    assert "quick_web_black_box" in profile_names
    assert "white_box_complete" in profile_names
    assert "standard_api_black_box" in profile_names
