from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from services import NotificationService
from database import db
from extensions import limiter

notifications_bp = Blueprint('notifications', __name__)


def create_notification(user_id: str, title: str, message: str,
                        notif_type: str = "system", ref_id: str = None):
    return NotificationService.create(user_id, title, message, notif_type, ref_id)


@notifications_bp.route('/', methods=['GET'])
@jwt_required()
@limiter.limit("60 per minute")
def get_notifications():
    user_id = get_jwt_identity()
    docs = NotificationService.get_user_notifications(user_id)
    if isinstance(docs, list):
        docs = docs[:200]
    return jsonify(docs), 200


@notifications_bp.route('/<notif_id>/read', methods=['POST'])
@jwt_required()
@limiter.limit("60 per minute")
def mark_read(notif_id):
    user_id = get_jwt_identity()
    if NotificationService.mark_read(notif_id, user_id):
        return jsonify({"msg": "Marked as read"}), 200
    return jsonify({"msg": "Notification not found"}), 404


@notifications_bp.route('/read-all', methods=['POST'])
@jwt_required()
@limiter.limit("10 per minute")
def mark_all_read():
    user_id = get_jwt_identity()
    NotificationService.mark_all_read(user_id)
    return jsonify({"msg": "All notifications marked as read"}), 200
