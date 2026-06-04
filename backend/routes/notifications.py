from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import db
from bson.objectid import ObjectId
import datetime
from utils.auth_helpers import now_utc

notifications_bp = Blueprint('notifications', __name__)


# ── Public helper — called by other route modules ─────────────────────────────

def create_notification(user_id: str, title: str, message: str,
                        notif_type: str = "system", ref_id: str = None):
    """Insert a notification document into MongoDB and return it."""
    doc = {
        "userId":    user_id,
        "title":     title,
        "message":   message,
        "type":      notif_type,
        "refId":     ref_id,
        "isRead":    False,
        "createdAt": now_utc(),
    }
    db.Notifications.insert_one(doc)
    doc["_id"] = str(doc["_id"])
    doc["createdAt"] = doc["createdAt"].isoformat()   # make JSON-serializable for socketio.emit
    return doc


def _serialize(n):
    """Convert a MongoDB notification doc to a JSON-safe dict."""
    n["_id"] = str(n["_id"])
    if isinstance(n.get("createdAt"), datetime.datetime):
        n["createdAt"] = n["createdAt"].isoformat()
    return n


# ── REST Endpoints ────────────────────────────────────────────────────────────

@notifications_bp.route('/', methods=['GET'])
@jwt_required()
def get_notifications():
    """Return the 50 most recent notifications for the current user."""
    user_id = get_jwt_identity()
    docs = list(
        db.Notifications.find({"userId": user_id})
        .sort("createdAt", -1)
        .limit(50)
    )
    return jsonify([_serialize(n) for n in docs]), 200


@notifications_bp.route('/<notif_id>/read', methods=['POST'])
@jwt_required()
def mark_read(notif_id):
    """Mark a single notification as read (must belong to the current user)."""
    user_id = get_jwt_identity()
    result = db.Notifications.update_one(
        {"_id": ObjectId(notif_id), "userId": user_id},
        {"$set": {"isRead": True}}
    )
    if result.matched_count:
        return jsonify({"msg": "Marked as read"}), 200
    return jsonify({"msg": "Notification not found"}), 404


@notifications_bp.route('/read-all', methods=['POST'])
@jwt_required()
def mark_all_read():
    """Mark every unread notification as read for the current user."""
    user_id = get_jwt_identity()
    db.Notifications.update_many(
        {"userId": user_id, "isRead": False},
        {"$set": {"isRead": True}}
    )
    return jsonify({"msg": "All notifications marked as read"}), 200
