import base64
import hashlib
import html
from datetime import datetime, timezone

import httpx
from cryptography.fernet import Fernet, InvalidToken

from config import settings

TELEGRAM_API = "https://api.telegram.org"
EVENT_CATEGORIES = ("projects", "scans", "findings", "patches", "mitigations", "approvals", "reports", "assets", "system")
FINDING_SEVERITIES = ("critical", "high", "medium", "low", "informational")


def _fernet() -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest())
    return Fernet(key)


def encrypt_token(token: str) -> str:
    return _fernet().encrypt(token.strip().encode()).decode()


def decrypt_token(encrypted: str) -> str:
    try:
        return _fernet().decrypt(encrypted.encode()).decode()
    except (InvalidToken, ValueError) as exc:
        raise ValueError("Stored Telegram token cannot be decrypted") from exc


def mask_token(token: str) -> str:
    if not token:
        return ""
    prefix, _, suffix = token.partition(":")
    return f"{prefix[:4]}••••:{'•' * min(max(len(suffix) - 4, 4), 12)}{suffix[-4:]}"


def event_category(event_type: str, action: str) -> str:
    text = f"{event_type} {action}".lower()
    if "project" in text:
        return "projects"
    if "approval" in text:
        return "approvals"
    if "finding" in text or "retest" in text:
        return "findings"
    if "patch" in text:
        return "patches"
    if "mitigation" in text:
        return "mitigations"
    if "report" in text:
        return "reports"
    if "asset" in text or "discovery" in text or "domain" in text:
        return "assets"
    if "scan" in text or "schedule" in text:
        return "scans"
    return "system"


def should_deliver_event(
    event_type: str,
    action: str,
    details: dict | None,
    categories: set[str],
    finding_severities: set[str],
) -> bool:
    category = event_category(event_type, action)
    if category not in categories:
        return False
    severity = str((details or {}).get("severity") or "").lower()
    return category != "findings" or not severity or severity in finding_severities


def activity_message(event_type: str, action: str, details: dict | None, created_at: datetime | None) -> str:
    details = details or {}
    category = event_category(event_type, action)
    icons = {"projects": "🗂️", "scans": "🔎", "findings": "🛡️", "patches": "🩹", "mitigations": "🧯", "approvals": "✅", "reports": "📄", "assets": "🌐", "system": "⚙️"}
    title = action.replace("_", " ").strip().title() or "Platform activity"
    timestamp = (created_at or datetime.now(timezone.utc)).astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    safe_lines = []
    for key in ("mitigation_id", "project_name", "scan_name", "title", "severity", "cvss_score", "asset", "status", "previous_status", "new_status", "priority", "risk_level", "environment", "actor_email", "result", "reason", "cve_id", "records_synced"):
        value = details.get(key)
        if value not in (None, "", [], {}):
            safe_lines.append(f"<b>{html.escape(key.replace('_', ' ').title())}:</b> {html.escape(str(value))}")
    body = "\n".join(safe_lines[:6])
    return f"{icons[category]} <b>NoovaStack · {html.escape(title)}</b>\n{body + chr(10) if body else ''}<i>{timestamp}</i>"


def telegram_request(token: str, method: str, payload: dict | None = None) -> dict:
    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.post(f"{TELEGRAM_API}/bot{token}/{method}", json=payload or {})
        data = response.json() if response.content else {}
    except (httpx.HTTPError, ValueError) as exc:
        # Do not let an httpx exception leak the bot token embedded in the URL.
        raise ValueError("Telegram API could not be reached or returned an invalid response") from None
    if not response.is_success or not data.get("ok"):
        description = data.get("description") or f"Telegram returned HTTP {response.status_code}"
        raise ValueError(str(description))
    return data


def send_message(token: str, chat_id: str, text: str) -> dict:
    return telegram_request(token, "sendMessage", {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    })
