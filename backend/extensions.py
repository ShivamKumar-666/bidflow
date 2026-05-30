from flask_socketio import SocketIO
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_mail import Mail

socketio = SocketIO(cors_allowed_origins=["http://localhost:5173", "http://127.0.0.1:5173"])
mail = Mail()          # ← add this

# Rate limiter — uses in-memory storage (swap to Redis URI via LIMITER_STORAGE_URI env var for prod)
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["200 per minute"],
    storage_uri="memory://",
)

