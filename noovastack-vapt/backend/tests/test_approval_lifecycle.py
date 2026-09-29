import asyncio
from datetime import datetime, timedelta
import uuid

from pydantic import ValidationError

from api.routes.approvals import approval_is_valid, expire_pending_approval, resource_status_for_decision
from api.routes.scan_schedules import _schedule_enable_allowed, _supersede_schedule_approvals
from api.routes.scans import _changed_fields, _supersede_scan_approvals
from api.schemas import EmergencyStopRequest, ScanScheduleUpdate, ScanUpdate
from database.models import Approval, Scan, ScanProfile, ScanSchedule, User


class _Scalars:
    def __init__(self, values):
        self.values = values

    def all(self):
        return self.values


class _Result:
    def __init__(self, values):
        self.values = values

    def scalars(self):
        return _Scalars(self.values)


class _Database:
    def __init__(self, values):
        self.values = values
        self.added = []

    async def execute(self, _statement):
        return _Result(self.values)

    def add(self, value):
        self.added.append(value)


def test_expired_pending_approval_is_persistable_and_never_valid():
    now = datetime.utcnow()
    approval = Approval(status="pending", expires_at=now - timedelta(seconds=1))

    assert expire_pending_approval(approval, now)
    assert approval.status == "expired"
    assert approval.decided_at == now
    assert not approval_is_valid(approval, now)

    approval.status = "approved"
    approval.approved_by = uuid.uuid4()
    assert not approval_is_valid(approval, now)


def test_approved_approval_requires_approver_and_future_or_no_expiry():
    now = datetime.utcnow()
    approval = Approval(status="approved", expires_at=now + timedelta(hours=1))
    assert not approval_is_valid(approval, now)

    approval.approved_by = uuid.uuid4()
    assert approval_is_valid(approval, now)
    approval.expires_at = None
    assert approval_is_valid(approval, now)


def test_more_information_returns_scan_and_schedule_to_editable_draft():
    assert resource_status_for_decision("more_information") == "draft"
    assert resource_status_for_decision("more_information", schedule=True) == "draft"
    assert resource_status_for_decision("rejected") == "blocked"
    assert resource_status_for_decision("rejected", schedule=True) == "paused"


def test_scan_security_changes_invalidate_but_name_only_does_not():
    scan = Scan(
        name="Original",
        assessment_mode="black_box",
        scan_category="website",
        scan_depth="standard",
        config={"ports": [443]},
    )
    fields = {"assessment_mode", "scan_category", "scan_depth", "engagement_id", "scan_profile_id", "config"}

    assert _changed_fields(scan, {"name": "Renamed"}, fields) == set()
    assert _changed_fields(scan, {"scan_depth": "deep"}, fields) == {"scan_depth"}
    assert _changed_fields(scan, {"config": {"ports": [80]}}, fields) == {"config"}


def test_superseding_scan_approvals_clears_sticky_approver_and_returns_to_draft():
    user = User(id=uuid.uuid4(), role="analyst", is_active=True)
    scan = Scan(id=uuid.uuid4(), project_id=uuid.uuid4(), status="approved", approved_by=uuid.uuid4())
    pending = Approval(id=uuid.uuid4(), status="pending")
    approved = Approval(id=uuid.uuid4(), status="approved", approved_by=uuid.uuid4())
    db = _Database([pending, approved])

    asyncio.run(_supersede_scan_approvals(db, scan, user, {"scan_depth"}))

    assert pending.status == "superseded"
    assert approved.status == "superseded"
    assert scan.approved_by is None
    assert scan.status == "draft"


def test_schedule_always_requires_a_valid_security_team_approval_to_enable():
    low = ScanSchedule(scan_depth="quick", assessment_mode="black_box")
    high = ScanSchedule(scan_depth="deep", assessment_mode="black_box")
    high_profile = ScanProfile(risk_level="critical")
    valid = Approval(
        status="approved",
        approved_by=uuid.uuid4(),
        expires_at=datetime.utcnow() + timedelta(hours=1),
    )
    expired = Approval(
        status="approved",
        approved_by=uuid.uuid4(),
        expires_at=datetime.utcnow() - timedelta(hours=1),
    )

    # Every schedule now requires Security Team approval, regardless of depth/profile risk.
    assert not _schedule_enable_allowed(low, None, [])
    assert not _schedule_enable_allowed(high, None, [])
    assert not _schedule_enable_allowed(low, high_profile, [expired])
    assert _schedule_enable_allowed(high, None, [valid])
    assert _schedule_enable_allowed(low, None, [valid])


def test_schedule_security_change_supersedes_approval_and_returns_to_draft():
    user = User(id=uuid.uuid4(), role="viewer", is_active=True)
    schedule = ScanSchedule(id=uuid.uuid4(), project_id=uuid.uuid4(), status="active")
    approval = Approval(id=uuid.uuid4(), status="approved", approved_by=uuid.uuid4())
    db = _Database([approval])

    asyncio.run(_supersede_schedule_approvals(db, schedule, user, {"assessment_mode"}))

    assert approval.status == "superseded"
    assert schedule.status == "draft"


def test_touched_request_schemas_reject_unknown_fields():
    for schema, payload in [
        (ScanUpdate, {"name": "renamed", "status": "approved"}),
        (ScanScheduleUpdate, {"name": "renamed", "created_by": str(uuid.uuid4())}),
        (EmergencyStopRequest, {"confirmation": "STOP SCAN", "force": True}),
    ]:
        try:
            schema.model_validate(payload)
            assert False, "Expected unknown field to be rejected"
        except ValidationError as exc:
            assert any(error["type"] == "extra_forbidden" for error in exc.errors())
