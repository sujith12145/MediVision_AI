"""
Email service for MediVision AI approval workflow.

Design
------
* The approval link is ALWAYS printed to the console first.
  This ensures the workflow works in development without any SMTP config.
* SMTP delivery is attempted only when SMTP_USER and SMTP_PASSWORD are set.
* Failures are logged and swallowed — the endpoint must not fail because
  an email bounced.
* Call this from a FastAPI BackgroundTask so the endpoint responds instantly.

Environment variables (all optional — console fallback handles missing values)
---------------------------------------------------------------------------
  SMTP_HOST      — defaults to smtp.gmail.com
  SMTP_PORT      — defaults to 587  (STARTTLS)
  SMTP_USER      — sender address (e.g. anso2020vja@gmail.com)
  SMTP_PASSWORD  — app password (16-char Google app password, spaces OK)
  FRONTEND_URL   — defaults to http://localhost:5173  (Vite dev server)
  ADMIN_EMAIL    — where approval emails are sent
"""

import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)


def send_approval_email(admin_email: str, user_email: str, token: str) -> None:
    """
    Notify the admin that a new access request is waiting for approval.

    Parameters
    ----------
    admin_email : str
        Where the approval email is sent.
    user_email : str
        The applicant's email address.
    token : str
        The UUID token that authorises the approval action.
    """
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
    approval_link = f"{frontend_url}/approve?token={token}"

    # ── Always print to console (works even without SMTP) ──────────────────
    border = "═" * 70
    print(f"\n{border}")
    print("  📧  NEW ACCESS REQUEST")
    print(f"  User  : {user_email}")
    print(f"  Admin : {admin_email}")
    print(f"  Link  : {approval_link}")
    print(f"{border}")
    print("  👆  Paste that link into a browser to approve.\n")

    # ── SMTP delivery (only when credentials are present) ──────────────────
    smtp_user = os.getenv("SMTP_USER", "").strip()
    smtp_pass = os.getenv("SMTP_PASSWORD", "").strip()

    if not smtp_user or not smtp_pass:
        logger.info(
            "SMTP not configured — approval link printed to console only."
        )
        return

    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))

    html_body = f"""\
<html>
<body style="font-family: 'Inter', Arial, sans-serif; background: #f8fafc; padding: 40px; margin: 0;">
  <div style="max-width: 520px; margin: auto; background: #ffffff;
              border-radius: 16px; box-shadow: 0 4px 32px rgba(0,0,0,.10); padding: 40px;">

    <!-- Header -->
    <div style="text-align: center; margin-bottom: 32px;">
      <h1 style="font-size: 24px; font-weight: 800; color: #0A74DA; margin: 0;">
        MediVision AI
      </h1>
      <p style="color: #64748b; font-size: 14px; margin: 4px 0 0;">
        Access Request Notification
      </p>
    </div>

    <!-- Body -->
    <h2 style="color: #1e293b; font-size: 18px; margin-bottom: 16px;">
      New Access Request
    </h2>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 28px;">
      <tr>
        <td style="padding: 8px 0; color: #64748b; font-size: 14px; width: 40%;">Email</td>
        <td style="padding: 8px 0; color: #1e293b; font-size: 14px; font-weight: 600;">{user_email}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Requested Role</td>
        <td style="padding: 8px 0; color: #1e293b; font-size: 14px; font-weight: 600;">admin</td>
      </tr>
    </table>

    <!-- CTA Button -->
    <div style="text-align: center; margin-bottom: 28px;">
      <a href="{approval_link}"
         style="display: inline-block; background: linear-gradient(135deg, #0A74DA, #0081FF);
                color: #ffffff; padding: 14px 36px; border-radius: 10px;
                text-decoration: none; font-weight: 700; font-size: 15px;
                box-shadow: 0 4px 12px rgba(10, 116, 218, 0.35);">
        ✅ Approve Access
      </a>
    </div>

    <!-- Fallback link -->
    <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 0 0 4px;">
      Or paste this URL directly into your browser:
    </p>
    <p style="background: #f1f5f9; border-radius: 6px; padding: 10px 14px;
              font-size: 12px; color: #475569; word-break: break-all; margin: 0 0 24px;">
      {approval_link}
    </p>

    <!-- Footer -->
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin-bottom: 16px;">
    <p style="color: #cbd5e1; font-size: 11px; text-align: center; margin: 0;">
      This link is single-use. If you did not expect this request, ignore this email.
    </p>
  </div>
</body>
</html>"""

    msg = MIMEMultipart("alternative")
    msg["From"] = smtp_user
    msg["To"] = admin_email
    msg["Subject"] = f"[MediVision AI] Access request from {user_email}"
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.send_message(msg)
        logger.info("✅ Approval email sent to %s", admin_email)
        print(f"  ✅  Email delivered to {admin_email}\n")
    except smtplib.SMTPAuthenticationError:
        logger.warning(
            "SMTP authentication failed. Check SMTP_USER / SMTP_PASSWORD. "
            "For Gmail, use a 16-character App Password "
            "(Google Account → Security → App Passwords)."
        )
        print("  ⚠️  SMTP auth failed — use the console link above.\n")
    except Exception as exc:
        logger.warning("Email delivery failed: %s", exc)
        print(f"  ⚠️  Email delivery failed ({exc}) — use the console link above.\n")
