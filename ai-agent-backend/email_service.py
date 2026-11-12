"""
Neptune AI   Email Notification Service
Handles SMTP email delivery for strategy trigger notifications.
Completely standalone   does NOT touch any existing logic.
"""

import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage
from typing import Optional, Dict
from dotenv import load_dotenv

load_dotenv()

# --- SMTP Configuration (from environment) ---

def _get_smtp_config():
    load_dotenv()
    return {
        "host": os.getenv("SMTP_HOST", "smtp.gmail.com"),
        "port": int(os.getenv("SMTP_PORT", "587")),
        "user": os.getenv("SMTP_USER", ""),
        "password": os.getenv("SMTP_PASSWORD", ""),
        "from_name": os.getenv("SMTP_FROM_NAME", "Neptune AI"),
        "from_email": os.getenv("SMTP_FROM_EMAIL", os.getenv("SMTP_USER", ""))
    }

def is_email_configured() -> bool:
    """Check if SMTP credentials are set."""
    cfg = _get_smtp_config()
    return bool(cfg["user"] and cfg["password"])


def send_email(
    to_email: str,
    subject: str,
    html_body: str,
    text_body: Optional[str] = None,
    inline_images: Optional[Dict[str, str]] = None
) -> bool:
    """
    Send an email via SMTP with optional inline CID images.
    Returns True on success, False on failure.
    """
    if not is_email_configured():
        print("[EMAIL] SMTP not configured   skipping email")
        return False

    if not to_email:
        print("[EMAIL] No recipient email   skipping")
        return False

    cfg = _get_smtp_config()
    try:
        msg_root = MIMEMultipart("related")
        msg_root["Subject"] = subject
        msg_root["From"] = f"{cfg['from_name']} <{cfg['from_email']}>"
        msg_root["To"] = to_email

        msg_alt = MIMEMultipart("alternative")
        msg_root.attach(msg_alt)

        # Plain text fallback
        if text_body:
            msg_alt.attach(MIMEText(text_body, "plain", "utf-8"))

        # HTML body
        msg_alt.attach(MIMEText(html_body, "html", "utf-8"))

        # Attach inline images (CID)
        if inline_images:
            for cid, img_path in inline_images.items():
                if os.path.exists(img_path):
                    with open(img_path, "rb") as f:
                        img = MIMEImage(f.read())
                        img.add_header("Content-ID", f"<{cid}>")
                        img.add_header("Content-Disposition", "inline", filename=os.path.basename(img_path))
                        msg_root.attach(img)

        print(f"[EMAIL] Connecting to SMTP server {cfg['host']}:{cfg['port']} with a 5s timeout...", flush=True)
        with smtplib.SMTP(cfg['host'], cfg['port'], timeout=5.0) as server:
            server.starttls()
            server.login(cfg['user'], cfg['password'])
            server.sendmail(cfg['from_email'], to_email, msg_root.as_string())

        print(f"[EMAIL] Sent to {to_email}: {subject}")
        return True

    except Exception as e:
        print(f"[EMAIL] Failed to send to {to_email}: {e}")
        return False
