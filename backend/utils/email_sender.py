import html as _html
from concurrent.futures import ThreadPoolExecutor

from flask import current_app
from flask_mail import Message
from extensions import mail
from config import Config

_email_executor = ThreadPoolExecutor(max_workers=3)


def send_verification_email(user_name: str, user_email: str, token: str):
    """Send the account verification email."""
    verify_url = f"{Config.FRONTEND_URL}/verify-email?token={token}"
    safe_name = _html.escape(user_name)

    # Plain-text fallback
    text_body = f"""Hi {safe_name},

Welcome to BidFlow! Please verify your email address by clicking the link below:

{verify_url}

This link expires in 24 hours.

If you did not create this account, you can safely ignore this email.

– The BidFlow Team
"""

    # HTML body — clean, professional (inline styles for Gmail compatibility)
    html_body = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="margin:0; padding:0; background:#f3f4f6; font-family:Arial, sans-serif;">
  <div style="max-width:520px; margin:40px auto; background:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e5e7eb;">
    <div style="background:#0f172a; padding:28px 32px;">
      <p style="color:#ffffff; font-size:20px; font-weight:700; margin:0;">Bid<span style="color:#1a56db;">Flow</span></p>
    </div>
    <div style="padding:32px;">
      <p style="font-size:18px; font-weight:600; color:#111827; margin:0 0 12px 0;">Verify your email address</p>
      <p style="font-size:14px; color:#6b7280; line-height:1.6; margin:0 0 24px 0;">Hi {safe_name},<br><br>
        Welcome to BidFlow! Click the button below to verify your email address
        and activate your account.
      </p>
      <a href="{verify_url}" style="display:inline-block; background:#1a56db; color:#ffffff; font-size:14px; font-weight:600; padding:12px 28px; border-radius:8px; text-decoration:none;">Verify Email Address</a>
      <p style="font-size:12px; color:#9ca3af; margin-top:20px;">This link expires in 24 hours.</p>
    </div>
    <div style="background:#f9fafb; padding:16px 32px; font-size:12px; color:#9ca3af; border-top:1px solid #e5e7eb;">
      If you didn't create a BidFlow account, you can safely ignore this email.
    </div>
  </div>
</body>
</html>
"""

    msg = Message(
        subject="Verify your BidFlow account",
        recipients=[user_email],
        body=text_body,
        html=html_body
    )
    _email_executor.submit(_send_async, msg, current_app._get_current_object())


def send_already_verified_email(user_email: str):
    """Gently inform the user if they try to verify an already-active account."""
    msg = Message(
        subject="BidFlow account already verified",
        recipients=[user_email],
        body="Your BidFlow account is already verified. You can log in at any time."
    )
    _email_executor.submit(_send_async, msg, current_app._get_current_object())


def send_password_reset_email(user_email: str, token: str):
    """Send the password-reset email with a time-limited link."""
    reset_url = f"{Config.FRONTEND_URL}/reset-password?token={token}"

    text_body = f"""Hi,

You requested a password reset for your BidFlow account. Click the link below to set a new password:

{reset_url}

This link expires in 1 hour.

If you did not request this, you can safely ignore this email.

– The BidFlow Team
"""

    html_body = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="margin:0; padding:0; background:#f3f4f6; font-family:Arial, sans-serif;">
  <div style="max-width:520px; margin:40px auto; background:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e5e7eb;">
    <div style="background:#0f172a; padding:28px 32px;">
      <p style="color:#ffffff; font-size:20px; font-weight:700; margin:0;">Bid<span style="color:#1a56db;">Flow</span></p>
    </div>
    <div style="padding:32px;">
      <p style="font-size:18px; font-weight:600; color:#111827; margin:0 0 12px 0;">Reset your password</p>
      <p style="font-size:14px; color:#6b7280; line-height:1.6; margin:0 0 24px 0;">
        We received a request to reset the password for your BidFlow account.
        Click the button below to choose a new password.
      </p>
      <a href="{reset_url}" style="display:inline-block; background:#1a56db; color:#ffffff; font-size:14px; font-weight:600; padding:12px 28px; border-radius:8px; text-decoration:none;">Reset Password</a>
      <p style="font-size:12px; color:#9ca3af; margin-top:20px;">This link expires in 1 hour.</p>
    </div>
    <div style="background:#f9fafb; padding:16px 32px; font-size:12px; color:#9ca3af; border-top:1px solid #e5e7eb;">
      If you didn't request a password reset, you can safely ignore this email.
    </div>
  </div>
</body>
</html>
"""

    msg = Message(
        subject="Reset your BidFlow password",
        recipients=[user_email],
        body=text_body,
        html=html_body
    )
    _email_executor.submit(_send_async, msg, current_app._get_current_object())


def _send_async(msg, app):
    with app.app_context():
        try:
            mail.send(msg)
        except Exception as e:
            import logging
            logging.getLogger(__name__).error("Async email send failed: %s", e)
