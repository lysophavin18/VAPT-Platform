"""
NoovaStack VAPT Platform - Celery Workers
"""
import sys
from pathlib import Path

from celery import Celery
from config import settings

APP_ROOT = Path(__file__).resolve().parents[1]
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))

app = Celery(
    "noovastack_vapt",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "workers.tasks_scan",
        "workers.tasks_discovery",
        "workers.tasks_reporting",
        "workers.tasks_scheduling",
        "workers.tasks_ai",
    ],
)

app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_queues={
        "celery": {"exchange": "celery", "routing_key": "celery"},
        "asset_discovery": {"exchange": "asset_discovery", "routing_key": "asset_discovery"},
        "scan": {"exchange": "scan", "routing_key": "scan"},
        "reporting": {"exchange": "reporting", "routing_key": "reporting"},
        "scheduling": {"exchange": "scheduling", "routing_key": "scheduling"},
        "ai": {"exchange": "ai", "routing_key": "ai"},
        "monitoring": {"exchange": "monitoring", "routing_key": "monitoring"},
    },
    task_routes={
        "workers.tasks_discovery.*": {"queue": "asset_discovery"},
        "workers.tasks_scan.*": {"queue": "scan"},
        "workers.tasks_reporting.*": {"queue": "reporting"},
        "workers.tasks_scheduling.*": {"queue": "scheduling"},
        "workers.tasks_ai.*": {"queue": "ai"},
        "workers.tasks_monitoring.*": {"queue": "monitoring"},
    },
    beat_schedule={
        "check-scheduled-scans": {
            "task": "workers.tasks_scheduling.check_scheduled_scans",
            "schedule": 60.0,
        },
        "run-due-domain-monitors": {
            "task": "workers.tasks_monitoring.run_due_domain_monitors",
            "schedule": 3600.0,   # dispatcher runs every hour; per-monitor interval controls actual frequency
        },
    },
)

run_asset_discovery = app.signature("workers.tasks_discovery.run_asset_discovery")
run_scan = app.signature("workers.tasks_scan.run_scan")
generate_report_task = app.signature("workers.tasks_reporting.generate_report")
run_domain_monitor_check = app.signature("workers.tasks_monitoring.run_domain_monitor_check")
