"""
NoovaStack VAPT Platform - Main FastAPI Application
"""
from contextlib import asynccontextmanager
from datetime import datetime
import logging
from fastapi import FastAPI, Request, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from config import settings
from database import engine
from database.models import Base
from api.routes import api_tokens
from api.routes import (
    auth, projects, engagements, assets, asset_groups, scans,
    scan_schedules, findings, reports, dashboard, administration, ai_agents, cve, approvals,
    domain_monitors,
)
from scans.profiles import DEFAULT_SCAN_PROFILES


logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _ensure_schema_compatibility(conn)
    await _seed_scan_profiles()
    await _seed_ai_agents()
    yield


async def _ensure_schema_compatibility(conn):
    # create_all does not add columns to existing tables. Keep local/dev DBs compatible
    # with newer models without dropping user data.
    await conn.execute(text("ALTER TABLE approvals ADD COLUMN IF NOT EXISTS ai_tool_request_id UUID"))


SEED_AI_AGENTS = [
    {"slug": "engagement-planner", "name": "Engagement Planner", "agent_type": "Planner", "purpose": "Plans and scopes authorized assessments", "risk_level": "low"},
    {"slug": "asset-discovery", "name": "Asset Discovery", "agent_type": "Discovery", "purpose": "Discovers and normalizes approved assets", "risk_level": "low"},
    {"slug": "web-security-agent", "name": "Web Security Agent", "agent_type": "Scanner", "purpose": "Web vulnerability analysis", "risk_level": "medium"},
    {"slug": "api-security-agent", "name": "API Security Agent", "agent_type": "Scanner", "purpose": "API security assessment", "risk_level": "medium"},
    {"slug": "evidence-validator", "name": "Evidence Validator", "agent_type": "Validator", "purpose": "Validates evidence integrity", "risk_level": "low"},
    {"slug": "finding-judge", "name": "Finding Judge", "agent_type": "Validator", "purpose": "Reviews and triages candidate findings", "risk_level": "high"},
    {"slug": "remediation-advisor", "name": "Remediation Advisor", "agent_type": "Advisor", "purpose": "Suggests remediation", "risk_level": "low"},
    {"slug": "report-writer", "name": "Report Writer", "agent_type": "Writer", "purpose": "Drafts report content", "risk_level": "low"},
    {"slug": "retest-analyst", "name": "Retest Analyst", "agent_type": "Validator", "purpose": "Compares retest results", "risk_level": "low"},
]


async def _seed_ai_agents():
    from database import AsyncSessionLocal
    from database.models import AIAgent
    from sqlalchemy import select
    from config import settings

    async with AsyncSessionLocal() as session:
        for entry in SEED_AI_AGENTS:
            existing = await session.execute(select(AIAgent).where(AIAgent.slug == entry["slug"]))
            if existing.scalar_one_or_none():
                continue
            session.add(AIAgent(
                **entry,
                status="idle",
                description=f"{entry['purpose']} through the autonomous DeepSeek agent worker.",
                model=settings.AI_MODEL,
                provider=settings.AI_PROVIDER,
            ))
        await session.commit()


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
        admin_result = await session.execute(
            select(User).where(User.email == "admin@noovastack.local")
        )
        admin = admin_result.scalar_one_or_none()
        if not admin:
            if settings.INITIAL_ADMIN_PASSWORD is None:
                raise RuntimeError(
                    "INITIAL_ADMIN_PASSWORD is required to create the initial administrator"
                )
            session.add(User(
                email="admin@noovastack.local",
                username="admin",
                password_hash=get_password_hash(settings.INITIAL_ADMIN_PASSWORD),
                full_name="System Administrator",
                role="admin",
                is_active=True,
                is_verified=True,
            ))
        elif settings.INITIAL_ADMIN_PASSWORD is not None:
            admin.password_hash = get_password_hash(settings.INITIAL_ADMIN_PASSWORD)

        await session.commit()


app = FastAPI(
    title="NoovaStack VAPT Platform",
    description="AI-Assisted Vulnerability Assessment and Penetration Testing Platform",
    version=settings.APP_VERSION,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
)

@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; "
        "font-src 'self'; "
        "connect-src 'self'"
    )
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
    return response

# Route registration
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(projects.router, prefix="/api/projects", tags=["Projects"])
app.include_router(engagements.router, prefix="/api", tags=["Engagements"])
app.include_router(assets.router, prefix="/api", tags=["Assets"])
app.include_router(asset_groups.router, prefix="/api", tags=["Asset Groups"])
app.include_router(scans.router, prefix="/api/scans", tags=["Scans"])
app.include_router(scan_schedules.router, prefix="/api/scan-schedules", tags=["Scan Schedules"])
app.include_router(findings.router, prefix="/api/findings", tags=["Findings"])
app.include_router(reports.router, prefix="/api/reports", tags=["Reports"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(administration.router, prefix="/api/admin", tags=["Administration"])
app.include_router(ai_agents.router, prefix="/api/ai-agents", tags=["AI Agents"])
app.include_router(cve.router, prefix="/api/cve", tags=["CVE Database"])
app.include_router(approvals.router, prefix="/api/approvals", tags=["Approvals"])
app.include_router(domain_monitors.router, prefix="/api", tags=["Domain Monitoring"])
app.include_router(api_tokens.router, prefix="/api", tags=["API Tokens"])


async def _require_admin_from_request(request: Request):
    """Extract JWT from Authorization header and verify admin role."""
    from jose import JWTError, jwt as jose_jwt
    import uuid as _uuid
    from sqlalchemy import select as _select
    from database import AsyncSessionLocal
    from database.models import User

    auth_header = request.headers.get("authorization", "")
    token = auth_header.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    try:
        payload = jose_jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        if payload.get("type") != "access":
            raise ValueError("not access token")
        user_id = _uuid.UUID(payload["sub"])
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    async with AsyncSessionLocal() as db:
        result = await db.execute(_select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


@app.get("/api/docs", include_in_schema=False)
async def get_docs(request: Request):
    from fastapi.openapi.docs import get_swagger_ui_html
    await _require_admin_from_request(request)
    return get_swagger_ui_html(openapi_url="/api/openapi.json", title="NoovaStack VAPT API Docs")


@app.get("/api/redoc", include_in_schema=False)
async def get_redoc(request: Request):
    from fastapi.openapi.docs import get_redoc_html
    await _require_admin_from_request(request)
    return get_redoc_html(openapi_url="/api/openapi.json", title="NoovaStack VAPT API Docs")


@app.get("/api/openapi.json", include_in_schema=False)
async def get_openapi_json(request: Request):
    from fastapi.openapi.utils import get_openapi
    await _require_admin_from_request(request)
    return JSONResponse(get_openapi(title=app.title, version=app.version, routes=app.routes))


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
    logger.exception(
        "Unhandled exception while processing %s %s",
        request.method,
        request.url.path,
        exc_info=(type(exc), exc, exc.__traceback__),
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )
