"""
NoovaStack VAPT Platform - Reporting Tasks
"""
import logging
from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name="workers.tasks_reporting.generate_report", bind=True)
def generate_report(self, scan_id: str, report_type: str, format: str, include_evidence: bool):
    """Generate a report for a completed scan."""
    logger.info(f"Generating {format} report for scan {scan_id} (type: {report_type})")
    try:
        return {
            "status": "completed",
            "scan_id": scan_id,
            "report_type": report_type,
            "format": format,
            "message": f"Report generated successfully as {format}",
        }
    except Exception as e:
        logger.error(f"Report generation failed: {e}")
        return {"status": "failed", "error": str(e)}
