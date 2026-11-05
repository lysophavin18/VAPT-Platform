import smtplib
import ssl
from email.message import EmailMessage


def send_email(
    *, host: str, port: int, username: str, password: str, use_tls: bool,
    from_email: str, recipients: list[str], subject: str, text: str,
) -> None:
    message = EmailMessage()
    message["From"] = from_email
    message["To"] = ", ".join(recipients)
    message["Subject"] = subject
    message.set_content(text)
    context = ssl.create_default_context()
    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=12, context=context) as client:
            if username:
                client.login(username, password)
            client.send_message(message)
        return
    with smtplib.SMTP(host, port, timeout=12) as client:
        client.ehlo()
        if use_tls:
            client.starttls(context=context)
            client.ehlo()
        if username:
            client.login(username, password)
        client.send_message(message)


def activity_email(event_type: str, action: str, details: dict | None, created_at) -> tuple[str, str]:
    title = action.replace("_", " ").strip().title() or "Platform Activity"
    lines = [f"NoovaStack activity: {title}", "", f"Event: {event_type}"]
    for key in ("name", "status", "severity", "result", "reason", "cve_id", "records_synced"):
        value = (details or {}).get(key)
        if value not in (None, "", [], {}):
            lines.append(f"{key.replace('_', ' ').title()}: {value}")
    if created_at:
        lines.extend(["", f"Recorded at: {created_at} UTC"])
    lines.extend(["", "This message was sent by your NoovaStack notification configuration."])
    return f"NoovaStack · {title}", "\n".join(lines)
