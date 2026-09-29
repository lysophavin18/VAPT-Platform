import os

import pytest
from fastapi.testclient import TestClient
from main import app
from database import engine, Base
from database.models import User
from config import settings

import bcrypt


ADMIN_PASSWORD = os.environ["INITIAL_ADMIN_PASSWORD"]


@pytest.fixture(scope="session")
def test_client():
    with TestClient(app) as client:
        yield client


@pytest.fixture
def auth_headers(test_client):
    """Create a test user and return auth headers."""
    import asyncio
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    async def _setup():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    loop.run_until_complete(_setup())

    response = test_client.post(
        "/api/auth/login",
        data={"username": "admin@noovastack.local", "password": ADMIN_PASSWORD},
    )
    if response.status_code == 200:
        token = response.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    # Register if login fails
    test_client.post(
        "/api/auth/register",
        json={
            "email": "admin@noovastack.local",
            "username": "admin",
            "password": ADMIN_PASSWORD,
            "full_name": "Test Admin",
        },
    )

    # Try login again
    response = test_client.post(
        "/api/auth/login",
        data={"username": "admin@noovastack.local", "password": ADMIN_PASSWORD},
    )
    if response.status_code == 200:
        token = response.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    return {}
