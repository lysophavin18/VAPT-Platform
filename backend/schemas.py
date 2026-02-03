"""
VAPT Platform - Pydantic Schemas
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Any, Dict
from datetime import datetime
from uuid import UUID
from enum import Enum
import re


# Enums
class UserRole(str, Enum):
    admin = "admin"
    manager = "manager"
    analyst = "analyst"
    viewer = "viewer"


class ProjectType(str, Enum):
    web = "web"
    api = "api"
    network = "network"
    mobile = "mobile"


class ProjectStatus(str, Enum):
    active = "active"
    completed = "completed"
    archived = "archived"


class ScanStatus(str, Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class ScanType(str, Enum):
    nmap = "nmap"
    nikto = "nikto"
    nuclei = "nuclei"
    zap = "zap"
    sqlmap = "sqlmap"
    gobuster = "gobuster"
    dirb = "dirb"
    katana = "katana"
    wpscan = "wpscan"
    hydra = "hydra"
    metasploit = "metasploit"
    full = "full"


class Severity(str, Enum):
    critical = "critical"
    high = "high"
    medium = "medium"
    low = "low"
    info = "info"


class VulnerabilityStatus(str, Enum):
    open = "open"
    confirmed = "confirmed"
    fixed = "fixed"
    false_positive = "false_positive"
    accepted_risk = "accepted_risk"


# Auth Schemas
class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    email: str
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=8)
    full_name: Optional[str] = None


# User Schemas
class UserBase(BaseModel):
    email: str
    username: str
    full_name: Optional[str] = None
    role: UserRole = UserRole.analyst


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    email: Optional[str] = None
    username: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None


class UserResponse(UserBase):
    id: UUID
    is_active: bool
    is_verified: bool
    avatar_url: Optional[str] = None
    last_login: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


# Project Schemas
class ProjectBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    client_name: Optional[str] = None
    project_type: ProjectType = ProjectType.web
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    client_name: Optional[str] = None
    project_type: Optional[ProjectType] = None
    status: Optional[ProjectStatus] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None


class ProjectResponse(ProjectBase):
    id: UUID
    status: ProjectStatus
    created_by: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime
    target_count: Optional[int] = 0
    scan_count: Optional[int] = 0
    vulnerability_count: Optional[int] = 0

    class Config:
        from_attributes = True


# Target Schemas
class TargetBase(BaseModel):
    name: str
    target_type: str  # url, ip, domain, api_endpoint
    target_value: str
    description: Optional[str] = None
    is_in_scope: bool = True


class TargetCreate(TargetBase):
    project_id: UUID


class TargetUpdate(BaseModel):
    name: Optional[str] = None
    target_type: Optional[str] = None
    target_value: Optional[str] = None
    description: Optional[str] = None
    is_in_scope: Optional[bool] = None


class TargetResponse(TargetBase):
    id: UUID
    project_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Scan Schemas
class ScanConfig(BaseModel):
    ports: Optional[str] = None
    wordlist: Optional[str] = None
    threads: Optional[int] = 10
    timeout: Optional[int] = 300
    extra_args: Optional[List[str]] = []
    options: Optional[Dict[str, Any]] = {}


class ScanCreate(BaseModel):
    project_id: UUID
    target_id: UUID
    scan_name: str
    scan_type: ScanType
    scan_profile: Optional[str] = "default"
    scan_config: Optional[ScanConfig] = None


class ScanUpdate(BaseModel):
    scan_name: Optional[str] = None
    status: Optional[ScanStatus] = None
    progress: Optional[int] = None


class ScanResponse(BaseModel):
    id: UUID
    project_id: UUID
    target_id: UUID
    scan_name: str
    scan_type: str
    scan_profile: Optional[str]
    status: ScanStatus
    progress: int
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    celery_task_id: Optional[str]
    scan_config: Optional[Dict]
    results_summary: Optional[Dict]
    created_by: Optional[UUID]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Vulnerability Schemas
class VulnerabilityBase(BaseModel):
    title: str
    description: Optional[str] = None
    severity: Severity
    cvss_score: Optional[float] = None
    cve_id: Optional[str] = None
    cwe_id: Optional[str] = None
    affected_component: Optional[str] = None
    affected_url: Optional[str] = None
    evidence: Optional[str] = None
    remediation: Optional[str] = None
    references: Optional[List[str]] = []


class VulnerabilityCreate(VulnerabilityBase):
    scan_id: UUID
    project_id: UUID
    target_id: UUID
    found_by_tool: Optional[str] = None
    raw_output: Optional[Dict] = None


class VulnerabilityUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    severity: Optional[Severity] = None
    status: Optional[VulnerabilityStatus] = None
    remediation: Optional[str] = None
    is_verified: Optional[bool] = None


class VulnerabilityResponse(VulnerabilityBase):
    id: UUID
    scan_id: UUID
    project_id: UUID
    target_id: UUID
    status: VulnerabilityStatus
    is_verified: bool
    found_by_tool: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Report Schemas
class ReportCreate(BaseModel):
    project_id: UUID
    report_name: str
    report_type: str = "full"  # executive, technical, full, compliance
    format: str = "pdf"  # pdf, html, docx, json


class ReportResponse(BaseModel):
    id: UUID
    project_id: UUID
    report_name: str
    report_type: str
    format: str
    status: str
    file_path: Optional[str]
    generated_by: Optional[UUID]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Dashboard Schemas
class DashboardStats(BaseModel):
    total_projects: int
    active_scans: int
    total_vulnerabilities: int
    critical_vulnerabilities: int
    high_vulnerabilities: int
    medium_vulnerabilities: int
    low_vulnerabilities: int
    info_vulnerabilities: int


class VulnerabilityTrend(BaseModel):
    date: str
    critical: int
    high: int
    medium: int
    low: int


class RecentActivity(BaseModel):
    id: UUID
    action: str
    entity_type: str
    entity_id: Optional[UUID]
    details: Optional[Dict]
    created_at: datetime
    user_name: Optional[str]


# Pagination
class PaginatedResponse(BaseModel):
    items: List[Any]
    total: int
    page: int
    per_page: int
    pages: int
