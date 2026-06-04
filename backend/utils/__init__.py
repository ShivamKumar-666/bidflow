import datetime
import logging
from database import db
from flask_jwt_extended import get_jwt_identity
from bson.objectid import ObjectId
from utils.auth_helpers import now_utc

# Re-export so callers can `from utils import now_utc` if desired
__all__ = ["log_audit", "now_utc"]


def log_audit(action, details, user_id=None):
    """Insert an entry into the audit log.

    Best-effort: failures are logged but never raised (audit logging
    must not break the originating request).
    """
    if not user_id:
        try:
            user_id = get_jwt_identity()
        except Exception:
            # No JWT context (e.g. background task) — record as System.
            user_id = None

    user_name = "System"
    if user_id and ObjectId.is_valid(user_id):
        try:
            user = db.Users.find_one({"_id": ObjectId(user_id)}, {"name": 1})
            if user:
                user_name = user.get('name', 'Unknown')
        except Exception:
            # Don't let a DB hiccup block the request path.
            logging.getLogger(__name__).exception("log_audit user lookup failed")

    log_entry = {
        "action":    action,
        "details":   details,
        "user":      user_name,
        "timestamp": now_utc(),
    }
    try:
        db.AuditLogs.insert_one(log_entry)
    except Exception:
        logging.getLogger(__name__).exception("log_audit insert failed for %s", action)
