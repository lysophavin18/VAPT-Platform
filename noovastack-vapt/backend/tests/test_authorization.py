import asyncio
import uuid

from fastapi import HTTPException

from auth.authorization import get_scan_or_404, get_schedule_or_404, project_access_clause
from database.models import User


class _Result:
    def __init__(self, value=None):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class _Database:
    def __init__(self, value=None):
        self.value = value
        self.statement = None

    async def execute(self, statement):
        self.statement = statement
        return _Result(self.value)


def _user(role: str) -> User:
    return User(id=uuid.uuid4(), role=role, is_active=True)


def test_project_access_clause_is_global_only_for_admin_and_manager():
    assert project_access_clause(_user("admin")) is True
    assert project_access_clause(_user("manager")) is True
    assert "projects.owner_id" in str(project_access_clause(_user("analyst")))
    assert "projects.owner_id" in str(project_access_clause(_user("viewer")))


def test_inaccessible_scan_loader_returns_not_found_and_filters_by_project_owner():
    db = _Database()
    user = _user("analyst")

    try:
        asyncio.run(get_scan_or_404(db, uuid.uuid4(), user))
        assert False, "Expected inaccessible scan to return 404"
    except HTTPException as exc:
        assert exc.status_code == 404

    statement = str(db.statement)
    assert "JOIN projects" in statement
    assert "projects.owner_id" in statement
    assert "scans.id" in statement


def test_inaccessible_schedule_loader_returns_not_found_and_filters_by_project_owner():
    db = _Database()
    user = _user("viewer")

    try:
        asyncio.run(get_schedule_or_404(db, uuid.uuid4(), user))
        assert False, "Expected inaccessible schedule to return 404"
    except HTTPException as exc:
        assert exc.status_code == 404

    statement = str(db.statement)
    assert "JOIN projects" in statement
    assert "projects.owner_id" in statement
    assert "scan_schedules.id" in statement
