"""
NoovaStack VAPT Platform - Main FastAPI Application
"""
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import settings
from database import engine
from database.models import Base
from api.routes import (
    auth, projects, engagements, assets, scans,
    scan_schedules, findings, reports, dashboard, administration, ai_agents, cve, approvals,
)
from scans.profiles import DEFAULT_SCAN_PROFILES


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await _seed_scan_profiles()
    yield


async def _seed_scan_profiles():
    from database import AsyncSessionLocal
    from database.models import ScanProfile, User
    from sqlalchemy import select
    from auth import get_password_hash

    async with AsyncSessionLocal() as session:
        for profile_data in DEFAULT_SCAN_PROFILES:
            result = await session.execute(
                select(ScanProfile).where(ScanProfile.id == profile_data["id"])
            )
            profile = result.scalar_one_or_none()
            if not profile:
                session.add(ScanProfile(**profile_data))
            else:
                profile.name = profile_data["name"]
                profile.category = profile_data["category"]
                profile.depth = profile_data["depth"]
                profile.assessment_modes = profile_data["assessment_modes"]
                profile.enabled_modules = profile_data["enabled_modules"]
                profile.risk_level = profile_data["risk_level"]
                profile.approval_required = profile_data["approval_required"]
                profile.senior_approval_required = profile_data["senior_approval_required"]

        # Seed default admin user
        admin = await session.execute(
            select(User).where(User.email == "admin@noovastack.local")
        )
        if not admin.scalar_one_or_none():
            session.add(User(
                email="admin@noovastack.local",
                username="admin",
                password_hash=get_password_hash("AdminSecure2024!"),
                full_name="System Administrator",
                role="admin",
                is_active=True,
                is_verified=True,
            ))

        await session.commit()


app = FastAPI(
    title="NoovaStack VAPT Platform",
    description="AI-Assisted Vulnerability Assessment and Penetration Testing Platform",
    version=settings.APP_VERSION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Route registration
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(projects.router, prefix="/api/projects", tags=["Projects"])
app.include_router(engagements.router, prefix="/api", tags=["Engagements"])
app.include_router(assets.router, prefix="/api", tags=["Assets"])
app.include_router(scans.router, prefix="/api/scans", tags=["Scans"])
app.include_router(scan_schedules.router, prefix="/api/scan-schedules", tags=["Scan Schedules"])
app.include_router(findings.router, prefix="/api/findings", tags=["Findings"])
app.include_router(reports.router, prefix="/api/reports", tags=["Reports"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(administration.router, prefix="/api/admin", tags=["Administration"])
app.include_router(ai_agents.router, prefix="/api/ai-agents", tags=["AI Agents"])
app.include_router(cve.router, prefix="/api/cve", tags=["CVE Database"])
app.include_router(approvals.router, prefix="/api/approvals", tags=["Approvals"])


@app.get("/")
async def root():
    return {
        "name": "NoovaStack VAPT Platform API",
        "version": settings.APP_VERSION,
        "status": "operational",
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "components": {
            "api": "operational",
            "database": "operational",
            "redis": "operational",
        },
    }


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "error": str(exc)},
    )
