"""
VAPT Platform - Database Models
"""
from sqlalchemy import Column, String, Boolean, Integer, Text, DateTime, ForeignKey, DECIMAL, ARRAY
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from database import Base


class User(Base):
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255))
    role = Column(String(50), default="analyst")
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    avatar_url = Column(String(500))
    last_login = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    projects = relationship("Project", back_populates="creator")
    scans = relationship("Scan", back_populates="creator")


class Project(Base):
    __tablename__ = "projects"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    client_name = Column(String(255))
    project_type = Column(String(50), default="web")
    status = Column(String(50), default="active")
    start_date = Column(DateTime)
    end_date = Column(DateTime)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    creator = relationship("User", back_populates="projects")
    targets = relationship("Target", back_populates="project", cascade="all, delete-orphan")
    scans = relationship("Scan", back_populates="project", cascade="all, delete-orphan")
    vulnerabilities = relationship("Vulnerability", back_populates="project", cascade="all, delete-orphan")


class Target(Base):
    __tablename__ = "targets"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"))
    name = Column(String(255), nullable=False)
    target_type = Column(String(50), nullable=False)  # url, ip, domain, api_endpoint
    target_value = Column(String(500), nullable=False)
    description = Column(Text)
    is_in_scope = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    project = relationship("Project", back_populates="targets")
    scans = relationship("Scan", back_populates="target")
    vulnerabilities = relationship("Vulnerability", back_populates="target")


class Scan(Base):
    __tablename__ = "scans"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"))
    target_id = Column(UUID(as_uuid=True), ForeignKey("targets.id", ondelete="CASCADE"))
    scan_name = Column(String(255), nullable=False)
    scan_type = Column(String(100), nullable=False)
    scan_profile = Column(String(100))
    status = Column(String(50), default="pending")
    progress = Column(Integer, default=0)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    celery_task_id = Column(String(255))
    scan_config = Column(JSONB, default={})
    results_summary = Column(JSONB, default={})
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    project = relationship("Project", back_populates="scans")
    target = relationship("Target", back_populates="scans")
    creator = relationship("User", back_populates="scans")
    vulnerabilities = relationship("Vulnerability", back_populates="scan", cascade="all, delete-orphan")
    results = relationship("ScanResult", back_populates="scan", cascade="all, delete-orphan")


class Vulnerability(Base):
    __tablename__ = "vulnerabilities"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scan_id = Column(UUID(as_uuid=True), ForeignKey("scans.id", ondelete="CASCADE"))
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"))
    target_id = Column(UUID(as_uuid=True), ForeignKey("targets.id", ondelete="CASCADE"))
    title = Column(String(500), nullable=False)
    description = Column(Text)
    severity = Column(String(20), nullable=False)
    cvss_score = Column(DECIMAL(3, 1))
    cve_id = Column(String(50))
    cwe_id = Column(String(50))
    affected_component = Column(String(500))
    affected_url = Column(String(1000))
    evidence = Column(Text)
    remediation = Column(Text)
    references = Column(ARRAY(Text))
    status = Column(String(50), default="open")
    is_verified = Column(Boolean, default=False)
    verified_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    verified_at = Column(DateTime)
    found_by_tool = Column(String(100))
    raw_output = Column(JSONB)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    scan = relationship("Scan", back_populates="vulnerabilities")
    project = relationship("Project", back_populates="vulnerabilities")
    target = relationship("Target", back_populates="vulnerabilities")


class ScanResult(Base):
    __tablename__ = "scan_results"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scan_id = Column(UUID(as_uuid=True), ForeignKey("scans.id", ondelete="CASCADE"))
    result_type = Column(String(100))
    result_data = Column(JSONB)
    file_path = Column(String(500))
    created_at = Column(DateTime, server_default=func.now())
    
    # Relationships
    scan = relationship("Scan", back_populates="results")


class Report(Base):
    __tablename__ = "reports"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"))
    report_name = Column(String(255), nullable=False)
    report_type = Column(String(50), default="full")
    format = Column(String(20), default="pdf")
    status = Column(String(50), default="pending")
    file_path = Column(String(500))
    generated_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class ScheduledScan(Base):
    __tablename__ = "scheduled_scans"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"))
    target_id = Column(UUID(as_uuid=True), ForeignKey("targets.id", ondelete="CASCADE"))
    scan_type = Column(String(100), nullable=False)
    scan_config = Column(JSONB, default={})
    schedule_type = Column(String(50), nullable=False)
    cron_expression = Column(String(100))
    next_run_at = Column(DateTime)
    last_run_at = Column(DateTime)
    is_active = Column(Boolean, default=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class ActivityLog(Base):
    __tablename__ = "activity_logs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    action = Column(String(100), nullable=False)
    entity_type = Column(String(100))
    entity_id = Column(UUID(as_uuid=True))
    details = Column(JSONB)
    ip_address = Column(String(45))
    user_agent = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
