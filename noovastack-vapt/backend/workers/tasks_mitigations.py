from datetime import datetime, timedelta

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from config import settings
from database.models import AuditLog, MitigationException, MitigationHistory, MitigationPlan
from workers.celery_app import app


TERMINAL = {"closed", "cancelled", "rejected", "risk_accepted"}


def _emit_once(session: Session, plan: MitigationPlan, action: str, details: dict) -> bool:
    exists = session.execute(select(MitigationHistory.id).where(MitigationHistory.plan_id == plan.id, MitigationHistory.action == action)).scalar_one_or_none()
    if exists:
        return False
    payload = {"mitigation_id": str(plan.id), "title": plan.title, "status": plan.status, "severity": plan.severity, **details}
    session.add(MitigationHistory(plan_id=plan.id, action=action, new_status=plan.status, details=payload))
    session.add(AuditLog(project_id=plan.project_id, event_type="mitigation", action=action, details=payload))
    return True


@app.task(name="workers.tasks_mitigations.monitor_mitigation_deadlines")
def monitor_mitigation_deadlines() -> dict:
    engine = create_engine(settings.DATABASE_URL_SYNC, pool_pre_ping=True)
    emitted = 0
    now = datetime.utcnow()
    try:
        with Session(engine) as session:
            plans = session.execute(select(MitigationPlan).where(MitigationPlan.status.notin_(TERMINAL))).scalars().all()
            for plan in plans:
                remaining = plan.sla_deadline - now
                total = plan.sla_deadline - (plan.created_at or now)
                consumed = 1 - (remaining.total_seconds() / max(total.total_seconds(), 1))
                if consumed >= .5 and remaining.total_seconds() > 86400:
                    emitted += _emit_once(session, plan, "mitigation_sla_50_percent", {"deadline": plan.sla_deadline.isoformat()})
                if timedelta(0) < remaining <= timedelta(hours=24):
                    emitted += _emit_once(session, plan, "mitigation_sla_24_hours", {"deadline": plan.sla_deadline.isoformat()})
                if remaining <= timedelta(0):
                    emitted += _emit_once(session, plan, "mitigation_sla_deadline_reached", {"deadline": plan.sla_deadline.isoformat()})
                    overdue_days = (now - plan.sla_deadline).days
                    for days in (1, 3, 7):
                        if overdue_days >= days:
                            emitted += _emit_once(session, plan, f"mitigation_sla_overdue_{days}d", {"deadline": plan.sla_deadline.isoformat(), "overdue_days": overdue_days})
                if plan.temporary_expires_at and plan.temporary_expires_at <= now:
                    emitted += _emit_once(session, plan, "mitigation_temporary_control_expired", {"temporary_expires_at": plan.temporary_expires_at.isoformat()})
            exceptions = session.execute(select(MitigationException).where(MitigationException.review_at <= now + timedelta(days=7))).scalars().all()
            plans_by_id = {plan.id: plan for plan in plans}
            for exception in exceptions:
                plan = plans_by_id.get(exception.plan_id) or session.get(MitigationPlan, exception.plan_id)
                if plan:
                    emitted += _emit_once(session, plan, "mitigation_risk_acceptance_review_due", {"review_at": exception.review_at.isoformat(), "residual_risk": exception.residual_risk})
            session.commit()
            return {"status": "success", "plans_checked": len(plans), "notifications_created": emitted}
    finally:
        engine.dispose()
