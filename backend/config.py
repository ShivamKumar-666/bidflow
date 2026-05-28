import os
from datetime import timedelta
from urllib.parse import quote_plus


def _build_mongo_uri():
    """Build authenticated MongoDB URI from env vars if credentials are provided."""
    base_uri = os.environ.get('MONGO_URI')
    if base_uri:
        return base_uri  # Fully specified URI takes precedence

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
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=1)  # Reduced from 24h for security

    # ── JWT blocklist ──────────────────────────────────────────────────────────
    # Flask-JWT-Extended checks the token_in_blocklist_loader on every protected
    # request. The actual store is MongoDB (RevokedTokens collection) set up in
    # app.py. This flag enables the check mechanism.
    JWT_COOKIE_SECURE       = False   # set True in prod (HTTPS)
    JWT_TOKEN_LOCATION      = ["headers"]

    # File uploads
    UPLOAD_FOLDER       = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
    MAX_CONTENT_LENGTH  = 16 * 1024 * 1024   # 16 MB

    # Flask env
    FLASK_ENV = os.environ.get('FLASK_ENV', 'development')
    RATELIMIT_ENABLED = (os.environ.get('FLASK_ENV') != 'testing')
