"""
VAPT Platform - Main FastAPI Application
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import structlog
from datetime import datetime

from config import settings
from database import engine, Base
from routers import auth, users, projects, targets, scans, vulnerabilities, reports, dashboard

# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer()
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
)

logger = structlog.get_logger()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    logger.info("Starting VAPT Platform API", version=settings.APP_VERSION)
    # Create database tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    logger.info("Shutting down VAPT Platform API")

app = FastAPI(
    title="VAPT Platform API",
    description="Vulnerability Assessment and Penetration Testing Platform",
    version=settings.APP_VERSION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(projects.router, prefix="/api/projects", tags=["Projects"])
app.include_router(targets.router, prefix="/api/targets", tags=["Targets"])
app.include_router(scans.router, prefix="/api/scans", tags=["Scans"])
app.include_router(vulnerabilities.router, prefix="/api/vulnerabilities", tags=["Vulnerabilities"])
app.include_router(reports.router, prefix="/api/reports", tags=["Reports"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": "VAPT Platform API",
        "version": settings.APP_VERSION,
        "status": "operational",
        "timestamp": datetime.utcnow().isoformat()
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "components": {
            "api": "operational",
            "database": "operational",
            "redis": "operational"
        }
    }

@app.get("/api/tools")
async def list_tools():
    """List available security tools"""
    return {
        "tools": [
            {"name": "nmap", "description": "Network scanner", "status": "available"},
            {"name": "nikto", "description": "Web server scanner", "status": "available"},
            {"name": "nuclei", "description": "Vulnerability scanner", "status": "available"},
            {"name": "zap", "description": "OWASP ZAP scanner", "status": "available"},
            {"name": "sqlmap", "description": "SQL injection tester", "status": "available"},
            {"name": "gobuster", "description": "Directory brute-forcer", "status": "available"},
            {"name": "katana", "description": "Web crawler", "status": "available"},
            {"name": "wpscan", "description": "WordPress scanner", "status": "available"},
            {"name": "hydra", "description": "Password brute-forcer", "status": "available"},
            {"name": "metasploit", "description": "Exploitation framework", "status": "available"}
        ]
    }

# Exception handlers
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception", error=str(exc), path=request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "error": str(exc)}
    )
