"""Exercise actual ORM predicates and HTTP role gates using isolated SQLite data."""
import asyncio
import unittest
import uuid
from unittest.mock import patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from auth import require_user
from database import get_db
from database.models import (
    Base, User, Project, DomainMonitor, DomainMonitorEvent, Asset, AuditLog,
    Approval, Scan, ScanSchedule, AIToolRequest,
)
from api.routes import domain_monitors, projects, assets, dashboard, approvals


@compiles(JSONB, "sqlite")
def sqlite_json(type_, compiler, **kw):
    return "JSON"


class AsyncAdapter:
    def __init__(self, session):
        self.session = session

    async def execute(self, statement):
        return self.session.execute(statement)

    def add(self, obj):
        self.session.add(obj)

    async def commit(self):
        self.session.commit()

    async def refresh(self, obj):
        self.session.refresh(obj)

    async def delete(self, obj):
        self.session.delete(obj)


class MonitorIsolationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
        tables = [m.__table__ for m in (User, Project, Asset, DomainMonitor, DomainMonitorEvent, AuditLog, Scan, ScanSchedule, AIToolRequest, Approval)]
        Base.metadata.create_all(self.engine, tables=tables)
        self.session = Session(self.engine, expire_on_commit=False)
        self.db = AsyncAdapter(self.session)
        self.owner = User(id=uuid.uuid4(), email="owner@example.test", username="owner", password_hash="unused", role="analyst")
        self.other = User(id=uuid.uuid4(), email="other@example.test", username="other", password_hash="unused", role="analyst")
        self.session.add_all([self.owner, self.other])
        self.p1 = Project(id=uuid.uuid4(), name="Own project", owner_id=self.owner.id)
        self.p2 = Project(id=uuid.uuid4(), name="Private project", owner_id=self.other.id)
        self.m1 = DomainMonitor(id=uuid.uuid4(), project_id=self.p1.id, domain="own.example", events=[])
        self.m2 = DomainMonitor(id=uuid.uuid4(), project_id=self.p2.id, domain="private.example", events=[])
        self.e2 = DomainMonitorEvent(id=uuid.uuid4(), monitor_id=self.m2.id, event_type="new_asset", summary="private")
        self.session.add_all([self.p1, self.p2, self.m1, self.m2, self.e2,
            Asset(project_id=self.p1.id, value="own.example", asset_type="domain"),
            Asset(project_id=self.p2.id, value="private.example", asset_type="domain")])
        self.session.commit()
        app = FastAPI()
        app.include_router(domain_monitors.router)
        app.dependency_overrides[require_user] = lambda: self.owner
        app.dependency_overrides[get_db] = lambda: self.db
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.session.close()
        self.engine.dispose()

    def test_foreign_monitor_operations_denied_without_dispatch(self):
        with patch("workers.celery_app.run_domain_monitor_check.delay") as dispatch:
            for role in ("manager", "security_team", "analyst", "viewer"):
                self.owner.role = role
                for method, suffix, body in [
                    ("GET", "", None), ("GET", "/events", None),
                    ("PATCH", "", {"status": "paused"}), ("DELETE", "", None),
                    ("POST", "/check-now", None), ("POST", f"/events/{self.e2.id}/ack", None),
                ]:
                    with self.subTest(role=role, method=method, suffix=suffix):
                        response = self.client.request(method, f"/domain-monitors/{self.m2.id}{suffix}", json=body)
                        expected = 403 if role == "viewer" and method != "GET" else 404
                        self.assertEqual(response.status_code, expected, response.text)
            dispatch.assert_not_called()
        self.assertEqual(self.m2.status, "active")
        self.assertIsNone(self.e2.acknowledged_at)
        self.assertIsNotNone(self.session.get(DomainMonitor, self.m2.id))

    def test_own_and_admin_access_with_mismatched_event_denial(self):
        for role in ("analyst", "manager", "security_team", "viewer"):
            self.owner.role = role
            self.assertEqual(self.client.get(f"/domain-monitors/{self.m1.id}").status_code, 200)
        self.owner.role = "analyst"
        self.assertEqual(self.client.patch(f"/domain-monitors/{self.m1.id}", json={"label": "Mine"}).status_code, 200)
        self.assertEqual(self.client.post(f"/domain-monitors/{self.m1.id}/events/{self.e2.id}/ack").status_code, 404)
        self.owner.role = "admin"
        self.assertEqual(self.client.get(f"/domain-monitors/{self.m2.id}").status_code, 200)
        self.assertEqual(self.client.patch(f"/domain-monitors/{self.m2.id}", json={"label": "Reviewed"}).status_code, 200)

    def test_owned_monitor_actions_and_uuid_encodings(self):
        event = DomainMonitorEvent(id=uuid.uuid4(), monitor_id=self.m1.id, event_type="new_asset", summary="own")
        self.session.add(event)
        self.session.commit()
        self.assertEqual(self.client.get(f"/domain-monitors/{str(self.m2.id).upper()}").status_code, 404)
        self.assertEqual(self.client.get(f"/domain-monitors/{uuid.uuid4()}").status_code, 404)
        self.assertEqual(self.client.get(f"/domain-monitors/{self.m1.id}/events").status_code, 200)
        self.assertEqual(self.client.post(f"/domain-monitors/{self.m1.id}/events/{event.id}/ack").status_code, 200)
        with patch("workers.celery_app.run_domain_monitor_check.delay") as dispatch:
            dispatch.return_value.id = "test-job"
            self.assertEqual(self.client.post(f"/domain-monitors/{self.m1.id}/check-now").status_code, 200)
            dispatch.assert_called_once_with(str(self.m1.id))
        self.assertEqual(self.client.delete(f"/domain-monitors/{self.m1.id}").status_code, 204)

    def test_registration_listing_and_forged_project_fields(self):
        for role in ("analyst", "manager", "security_team"):
            self.owner.role = role
            base = f"/projects/{self.p2.id}/domain-monitors"
            self.assertEqual(self.client.get(base).status_code, 404)
            self.assertEqual(self.client.post(base, json={"domain": "new.example"}).status_code, 404)
        base = f"/projects/{self.p1.id}/domain-monitors"
        self.assertEqual(self.client.post(base, json={"domain": "new.example"}).status_code, 201)
        self.assertEqual(len(self.client.get(base).json()), 2)
        self.assertEqual(self.client.patch(f"/domain-monitors/{self.m1.id}", json={"project_id": str(self.p2.id)}).status_code, 422)
        self.assertEqual(self.client.get("/domain-monitors/not-a-uuid").status_code, 422)
        self.owner.role = "viewer"
        self.assertEqual(self.client.post(base, json={"domain": "viewer.example"}).status_code, 403)
        self.assertEqual(self.client.patch(f"/domain-monitors/{self.m1.id}", json={"status": "paused"}).status_code, 403)

    def test_sibling_lists_and_dashboard_are_owner_scoped(self):
        for role in ("manager", "security_team", "analyst", "viewer", "admin"):
            self.owner.role = role
            expected = 2 if role == "admin" else 1
            result = asyncio.run(projects.list_projects(status_filter=None, db=self.db, current_user=self.owner))
            self.assertEqual(len(result), expected)
            result = asyncio.run(assets.list_all_assets(db=self.db, current_user=self.owner))
            self.assertEqual(len(result), expected)
            result = self.session.scalars(select(Project).where(*dashboard._project_filter(self.owner, None))).all()
            self.assertEqual(len(result), expected)

    def test_discovery_job_must_belong_to_project(self):
        self.session.add(AuditLog(project_id=self.p2.id, event_type="asset_discovery", action="started", details={"job_id": "foreign-job"}))
        self.session.commit()
        with patch("celery.result.AsyncResult") as result:
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(assets.get_discovery_job_status(self.p1.id, "foreign-job", self.db, self.owner))
            self.assertEqual(raised.exception.status_code, 404)
            result.assert_not_called()
        self.session.add(AuditLog(project_id=self.p1.id, event_type="asset_discovery", action="started", details={"job_id": "own-job"}))
        self.session.commit()
        with patch("celery.result.AsyncResult") as result:
            result.return_value.state = "SUCCESS"
            result.return_value.info = {}
            result.return_value.result = {"status": "completed", "assets_found": 0, "assets": []}
            status = asyncio.run(assets.get_discovery_job_status(self.p1.id, "own-job", self.db, self.owner))
            self.assertEqual(status.state, "SUCCESS")
            result.assert_called_once()

    def test_approval_scope_handles_all_resource_types_and_mixed_links(self):
        own_scan, foreign_scan = uuid.uuid4(), uuid.uuid4()
        own_schedule, foreign_task = uuid.uuid4(), uuid.uuid4()
        self.session.add_all([
            Scan(id=own_scan, project_id=self.p1.id, name="own", assessment_mode="black_box", scan_category="web", scan_depth="safe"),
            Scan(id=foreign_scan, project_id=self.p2.id, name="foreign", assessment_mode="black_box", scan_category="web", scan_depth="safe"),
            ScanSchedule(id=own_schedule, project_id=self.p1.id, name="own", assessment_mode="black_box", scan_category="web", scan_depth="safe", recurrence_rule="daily", cron_expression="0 0 * * *"),
            AIToolRequest(id=foreign_task, project_id=self.p2.id, target="private.example", assessment_mode="black_box", scan_category="web", scan_depth="safe", risk_level="low"),
        ])
        self.session.add_all([
            Approval(scan_id=own_scan, action="own"),
            Approval(scan_id=foreign_scan, action="foreign"),
            Approval(schedule_id=own_schedule, action="schedule"),
            Approval(ai_tool_request_id=foreign_task, action="ai"),
            Approval(scan_id=own_scan, ai_tool_request_id=foreign_task, action="mixed"),
            Approval(action="unbound"),
        ])
        self.session.commit()
        self.owner.role = "manager"
        visible = self.session.scalars(select(Approval).where(approvals.approval_access_clause(self.owner))).all()
        self.assertEqual({a.action for a in visible}, {"own", "schedule"})
        self.owner.role = "admin"
        self.assertEqual(len(self.session.scalars(select(Approval).where(approvals.approval_access_clause(self.owner))).all()), 6)


if __name__ == "__main__":
    unittest.main()
