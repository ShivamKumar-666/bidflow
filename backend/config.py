"""Application configuration loaded from environment variables.

Fail-fast behaviour:
- In production (`FLASK_ENV=production`), missing/weak secrets raise
  `RuntimeError` at import time so the process refuses to start (SEC-02).
- In development/test, the historical placeholder defaults are still
  accepted (with a one-time warning) so the local dev experience is
  unchanged.
"""

import os
from datetime import timedelta
from urllib.parse import quote_plus


_PLACEHOLDER_SUBSTRINGS = ("change-this", "dev-only", "not-for-production")


def _is_weak(value: str | None) -> bool:
    if not value:
        return True
    return any(s in value for s in _PLACEHOLDER_SUBSTRINGS)


def _build_mongo_uri():
    """Build an authenticated MongoDB URI from env vars if credentials are provided."""
    base_uri = os.environ.get('MONGO_URI')
    if base_uri:
        return base_uri

    host = os.environ.get('MONGO_HOST', 'localhost')
    port = os.environ.get('MONGO_PORT', '27017')
    db   = os.environ.get('MONGO_DB', 'bidflow')
    user = os.environ.get('MONGO_USERNAME', '')
    pwd  = os.environ.get('MONGO_PASSWORD', '')

    if user and pwd:
        return f"mongodb://{quote_plus(user)}:{quote_plus(pwd)}@{host}:{port}/{db}?authSource=admin"
    return f"mongodb://{host}:{port}/{db}"


class Config:
    SECRET_KEY     = os.environ.get('SECRET_KEY') or 'dev-only-secret-key-not-for-production'
    MONGO_URI      = _build_mongo_uri()
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY') or 'dev-only-jwt-key-not-for-production'

    # Token lifetime
    JWT_ACCESS_TOKEN_EXPIRES   = timedelta(hours=1)
    JWT_REFRESH_TOKEN_EXPIRES  = timedelta(days=7)   # SEC-06: refresh token

    # ── JWT blocklist ──────────────────────────────────────────────────────────
    # SEC-01: JWT stored in httpOnly cookies (not localStorage).
    # "cookies" is preferred; "headers" is kept as fallback so existing
    # clients and testing tools still work with Authorization: Bearer.
    JWT_TOKEN_LOCATION      = ["cookies", "headers"]
    JWT_COOKIE_SECURE       = os.environ.get('FLASK_ENV') == 'production'   # True on Render (HTTPS)
    JWT_COOKIE_SAMESITE     = "Lax"
    JWT_ACCESS_COOKIE_NAME  = "access_token_cookie"

    # SEC-04: CSRF protection using double-submit cookie pattern.
    # Flask-JWT-Extended sets a separate CSRF cookie; the frontend reads it
    # and sends it back as X-CSRF-TOKEN header for state-changing methods.
    JWT_COOKIE_CSRF_PROTECT = True
    JWT_CSRF_IN_COOKIES     = True
    JWT_ACCESS_CSRF_COOKIE_NAME = "csrf_access_token"

    # SEC-06: refresh token cookie name and settings
    JWT_REFRESH_COOKIE_NAME = "refresh_token_cookie"

    # File uploads — use /tmp on Render (serverless), local uploads/ otherwise
    _default_upload = '/tmp/bidflow_uploads' if os.environ.get('RENDER') else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
    UPLOAD_FOLDER       = os.environ.get('UPLOAD_FOLDER', _default_upload)
    MAX_CONTENT_LENGTH  = 16 * 1024 * 1024   # 16 MB

    # Flask env
    FLASK_ENV        = os.environ.get('FLASK_ENV', 'development')
    RATELIMIT_ENABLED = (os.environ.get('FLASK_ENV') != 'testing')

    # Email (use SendGrid SMTP, Gmail, or Mailtrap for dev)
    MAIL_SERVER   = os.environ.get('MAIL_SERVER', 'smtp.mailtrap.io')
    MAIL_PORT     = int(os.environ.get('MAIL_PORT', 587))
    MAIL_USE_TLS  = os.environ.get('MAIL_USE_TLS', 'true').lower() == 'true'
    MAIL_USERNAME = os.environ.get('MAIL_USERNAME')
    MAIL_PASSWORD = os.environ.get('MAIL_PASSWORD')
    MAIL_DEFAULT_SENDER = os.environ.get('MAIL_DEFAULT_SENDER', 'noreply@bidflow.com')

    # Token signing secret
    EMAIL_TOKEN_SECRET = os.environ.get('EMAIL_TOKEN_SECRET', 'change-this-in-production')
    FRONTEND_URL       = os.environ.get('FRONTEND_URL', 'http://localhost:5173')
    GOOGLE_CLIENT_ID   = os.environ.get('GOOGLE_CLIENT_ID')

    REDIS_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')

    # Production-only fail-fast guard (SEC-02)
    @classmethod
    def validate_secrets(cls):
        """Raise RuntimeError if running in production with weak/missing secrets."""
        if os.environ.get('FLASK_ENV') != 'production':
            return
        weak = []
        for key in ('SECRET_KEY', 'JWT_SECRET_KEY', 'EMAIL_TOKEN_SECRET'):
            value = os.environ.get(key)
            if _is_weak(value):
                weak.append(key)
        if weak:
            raise RuntimeError(
                f"Refusing to start: the following secrets are missing or weak in "
                f"production: {', '.join(weak)}. Set strong values in your env."
            )
