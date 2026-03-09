"""
Neptune AI   Email Notification Service
Handles SMTP email delivery for strategy trigger notifications.
Completely standalone   does NOT touch any existing logic.
"""

import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional


#   SMTP Configuration (from environment)  

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "Neptune AI")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", SMTP_USER)


def is_email_configured() -> bool:
    """Check if SMTP credentials are set."""
    return bool(SMTP_USER and SMTP_PASSWORD)


def send_email(
    to_email: str,
    subject: str,
    html_body: str,
    text_body: Optional[str] = None
) -> bool:
    """
    Send an email via SMTP.
    Returns True on success, False on failure.
    """
    if not is_email_configured():
        print("[EMAIL] SMTP not configured   skipping email")
        return False

    if not to_email:
        print("[EMAIL] No recipient email   skipping")
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{SMTP_FROM_NAME} <{SMTP_FROM_EMAIL}>"
        msg["To"] = to_email

        # Plain text fallback
        if text_body:
            msg.attach(MIMEText(text_body, "plain"))

        # HTML body
        msg.attach(MIMEText(html_body, "html"))

        print(f"[EMAIL] Connecting to SMTP server {SMTP_HOST}:{SMTP_PORT} with a 5s timeout...", flush=True)
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=5.0) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM_EMAIL, to_email, msg.as_string())

        print(f"[EMAIL] Sent to {to_email}: {subject}")
        return True

    except Exception as e:
        print(f"[EMAIL] Failed to send to {to_email}: {e}")
        return False
