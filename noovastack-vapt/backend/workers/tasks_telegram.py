from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import and_, create_engine, or_, select
from sqlalchemy.orm import Session

from config import settings
from database.models import AuditLog, IntegrationSetting
from integrations.telegram import FINDING_SEVERITIES, activity_message, decrypt_token, send_message, should_deliver_event
from workers.celery_app import app


@app.task(name="workers.tasks_telegram.deliver_activity_notifications")
def deliver_activity_notifications() -> dict:
    engine = create_engine(settings.DATABASE_URL_SYNC, pool_pre_ping=True)
    delivered = 0
    try:
        with Session(engine) as session:
            integration = session.get(IntegrationSetting, "telegram")
            if not integration or not integration.enabled or not integration.secret_encrypted:
                return {"status": "disabled", "delivered": 0}
            config = integration.config or {}
            chat_id = str(config.get("chat_id") or "").strip()
            categories = set(config.get("event_categories") or [])
            if not chat_id or not categories:
                return {"status": "not_configured", "delivered": 0}
            cursor = config.get("last_event_at")
            cursor_at = datetime.fromisoformat(cursor) if cursor else datetime.now(timezone.utc)
            if cursor_at.tzinfo is not None:
                cursor_at = cursor_at.replace(tzinfo=None)
            cursor_id = config.get("last_event_id")
            try:
                cursor_uuid = UUID(cursor_id) if cursor_id else None
            except (TypeError, ValueError):
                cursor_uuid = None
            after_cursor = AuditLog.created_at > cursor_at
            if cursor_uuid:
                after_cursor = or_(
                    after_cursor,
                    and_(AuditLog.created_at == cursor_at, AuditLog.id > cursor_uuid),
                )
            events = session.execute(select(AuditLog).where(after_cursor).order_by(
                AuditLog.created_at.asc(), AuditLog.id.asc()
            ).limit(100)).scalars().all()
            token = decrypt_token(integration.secret_encrypted)
            finding_severities = set(config.get("finding_severities") or FINDING_SEVERITIES[:2])
            for event in events:
                details = event.details or {}
                if should_deliver_event(event.event_type, event.action, details, categories, finding_severities):
                    send_message(token, chat_id, activity_message(event.event_type, event.action, details, event.created_at))
                    delivered += 1

                # Advance after every successfully handled event. If Telegram fails,
                # that event remains at the cursor and is retried by the next run.
                event_at = event.created_at.replace(tzinfo=timezone.utc)
                config = {
                    **config,
                    "last_event_at": event_at.isoformat(),
                    "last_event_id": str(event.id),
                }
                integration.config = config
                session.commit()
            return {"status": "success", "delivered": delivered, "processed": len(events)}
    finally:
        engine.dispose()
