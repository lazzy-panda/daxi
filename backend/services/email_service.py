import logging
import httpx
from config import settings

logger = logging.getLogger(__name__)


def _send(to: str, subject: str, html: str) -> bool:
    if settings.BREVO_API_KEY:
        return _send_brevo(to, subject, html)
    if settings.RESEND_API_KEY:
        return _send_resend(to, subject, html)
    logger.info("No email provider configured — skipping email to %s: %s", to, subject)
    return False


def _send_brevo(to: str, subject: str, html: str) -> bool:
    try:
        sender_email = settings.EMAIL_FROM
        # Parse "Name <email>" format if present
        if "<" in sender_email and ">" in sender_email:
            name = sender_email.split("<")[0].strip()
            email = sender_email.split("<")[1].rstrip(">").strip()
        else:
            name = "Daxi"
            email = sender_email
        resp = httpx.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={"api-key": settings.BREVO_API_KEY, "Content-Type": "application/json"},
            json={
                "sender": {"name": name, "email": email},
                "to": [{"email": to}],
                "subject": subject,
                "htmlContent": html,
            },
            timeout=10,
        )
        resp.raise_for_status()
        return True
    except Exception as exc:
        logger.error("Brevo email send failed to %s: %s", to, exc)
        return False


def _send_resend(to: str, subject: str, html: str) -> bool:
    try:
        resp = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
            json={"from": settings.EMAIL_FROM, "to": [to], "subject": subject, "html": html},
            timeout=10,
        )
        resp.raise_for_status()
        return True
    except Exception as exc:
        logger.error("Resend email send failed to %s: %s", to, exc)
        return False


def send_verification_email(to: str, token: str) -> bool:
    link = f"{settings.FRONTEND_URL}/verify-email?token={token}"
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
      <h2 style="color:#1d4ed8">Verify your email</h2>
      <p>Thanks for signing up for Daxi! Please verify your email address to get started.</p>
      <a href="{link}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">
        Verify Email
      </a>
      <p style="color:#6b7280;font-size:14px">Or copy this link:<br><a href="{link}">{link}</a></p>
      <p style="color:#6b7280;font-size:12px">This link expires in 24 hours. If you didn't sign up, ignore this email.</p>
    </div>
    """
    return _send(to, "Verify your Daxi email", html)


def send_password_reset_email(to: str, token: str) -> bool:
    link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
      <h2 style="color:#1d4ed8">Reset your password</h2>
      <p>We received a request to reset your Daxi password.</p>
      <a href="{link}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">
        Reset Password
      </a>
      <p style="color:#6b7280;font-size:14px">Or copy this link:<br><a href="{link}">{link}</a></p>
      <p style="color:#6b7280;font-size:12px">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
    </div>
    """
    return _send(to, "Reset your Daxi password", html)
