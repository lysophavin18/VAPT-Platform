"""
VAPT Platform - Audit Logging Utility
Designed by VINNZz
"""
from typing import Optional, Any
from uuid import UUID
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import insert

from ..models import AuditLog


async def log_audit_action(
    db: AsyncSession,
    user_id: Optional[UUID],
    action: str,
    resource_type: str,
    resource_id: Optional[UUID] = None,
    old_value: Optional[dict] = None,
    new_value: Optional[dict] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    session_id: Optional[str] = None,
    success: bool = True,
    error_message: Optional[str] = None
):
    """
    Log an audit action to the database.
    
    Args:
        db: Database session
        user_id: ID of the user performing the action
        action: Type of action (create, update, delete, login, etc.)
        resource_type: Type of resource being acted upon (user, project, scan, etc.)
        resource_id: ID of the resource
        old_value: Previous value (for updates/deletes)
        new_value: New value (for creates/updates)
        ip_address: Client IP address
        user_agent: Client user agent string
        session_id: Session identifier
        success: Whether the action succeeded
        error_message: Error message if action failed
    """
    try:
        audit_log = AuditLog(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            old_value=old_value,
            new_value=new_value,
            ip_address=ip_address,
            user_agent=user_agent,
            session_id=session_id,
            success=success,
            error_message=error_message,
            created_at=datetime.now(timezone.utc)
        )
        db.add(audit_log)
        await db.flush()
    except Exception as e:
        # Don't fail the main operation if audit logging fails
        # Just log to stderr
        import sys
        print(f"Audit logging failed: {e}", file=sys.stderr)


class AuditContext:
    """Context manager for automatic audit logging."""
    
    def __init__(
        self,
        db: AsyncSession,
        user_id: UUID,
        action: str,
        resource_type: str,
        resource_id: Optional[UUID] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ):
        self.db = db
        self.user_id = user_id
        self.action = action
        self.resource_type = resource_type
        self.resource_id = resource_id
        self.ip_address = ip_address
        self.user_agent = user_agent
        self.old_value = None
        self.new_value = None
        self.success = True
        self.error_message = None
    
    def set_old_value(self, value: Any):
        self.old_value = value
    
    def set_new_value(self, value: Any):
        self.new_value = value
    
    def set_resource_id(self, resource_id: UUID):
        self.resource_id = resource_id
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            self.success = False
            self.error_message = str(exc_val)
        
        await log_audit_action(
            db=self.db,
            user_id=self.user_id,
            action=self.action,
            resource_type=self.resource_type,
            resource_id=self.resource_id,
            old_value=self.old_value,
            new_value=self.new_value,
            ip_address=self.ip_address,
            user_agent=self.user_agent,
            success=self.success,
            error_message=self.error_message
        )
        
        # Don't suppress exceptions
        return False
