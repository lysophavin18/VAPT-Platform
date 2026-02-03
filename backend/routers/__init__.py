"""
VAPT Platform - Routers Package
"""
from . import auth, users, projects, targets, scans, vulnerabilities, reports, dashboard

__all__ = [
    "auth",
    "users", 
    "projects",
    "targets",
    "scans",
    "vulnerabilities",
    "reports",
    "dashboard"
]
