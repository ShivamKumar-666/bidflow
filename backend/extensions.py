import os
from flask_socketio import SocketIO
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_mail import Mail


def get_allowed_origins():
    """Single source of truth for CORS origins (SEC-NEW-11)."""
    _dev_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
    if os.environ.get("FLASK_ENV") == "production":
        return [
            o.strip() for o in os.environ.get("CORS_ALLOWED_ORIGINS", "").split(",")
            if o.strip()
        ] or [os.environ.get("FRONTEND_URL", "http://localhost:5173")]
    return _dev_origins


_socketio_origins = get_allowed_origins()

socketio = SocketIO(cors_allowed_origins=_socketio_origins)
mail = Mail()

# Rate limiter — uses Redis in production (via LIMITER_STORAGE_URI env var),
# falls back to in-memory for development (SEC-NEW-07).
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["200 per minute"],
    storage_uri=os.environ.get("LIMITER_STORAGE_URI", "memory://"),
)

