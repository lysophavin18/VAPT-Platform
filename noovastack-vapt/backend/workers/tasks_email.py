from datetime import datetime, timezone

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from config import settings
from database.models import AuditLog, IntegrationSetting
from integrations.email import activity_email, send_email
from integrations.telegram import decrypt_token, event_category
from workers.celery_app import app


@app.task(name="workers.tasks_email.deliver_activity_notifications")
def deliver_activity_notifications() -> dict:
    engine = create_engine(settings.DATABASE_URL_SYNC, pool_pre_ping=True)
    delivered = 0
    try:
        with Session(engine) as session:
            integration = session.get(IntegrationSetting, "email")
            if not integration or not integration.enabled:
                return {"status": "disabled", "delivered": 0}
            config = integration.config or {}
            categories = set(config.get("event_categories") or [])
            if not config.get("smtp_host") or not config.get("recipients") or not categories:
                return {"status": "not_configured", "delivered": 0}
            cursor = config.get("last_event_at")
            cursor_at = datetime.fromisoformat(cursor) if cursor else datetime.now(timezone.utc)
            if cursor_at.tzinfo is not None:
                cursor_at = cursor_at.replace(tzinfo=None)
            events = session.execute(select(AuditLog).where(AuditLog.created_at > cursor_at).order_by(AuditLog.created_at.asc()).limit(100)).scalars().all()
            password = decrypt_token(integration.secret_encrypted) if integration.secret_encrypted else ""
            latest = cursor_at
            for event in events:
                latest = max(latest, event.created_at)
                if event_category(event.event_type, event.action) not in categories:
                    continue
                subject, body = activity_email(event.event_type, event.action, event.details, event.created_at)
                send_email(
                    host=config["smtp_host"], port=int(config["smtp_port"]), username=config.get("smtp_username", ""),
                    password=password, use_tls=bool(config.get("use_tls", True)), from_email=config["from_email"],
                    recipients=config["recipients"], subject=subject, text=body,
                )
                delivered += 1
            if events:
                integration.config = {**config, "last_event_at": latest.replace(tzinfo=timezone.utc).isoformat()}
                session.commit()
            return {"status": "success", "delivered": delivered, "processed": len(events)}
    finally:
        engine.dispose()
