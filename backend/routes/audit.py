from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import db
from extensions import limiter
from utils.auth_helpers import get_user_role

audit_bp = Blueprint('audit', __name__)


@audit_bp.route('/', methods=['GET'])
@jwt_required()
@limiter.limit("60 per minute")
def get_audit_logs():
    """Return audit log entries. Admin sees all, others see only their own."""
    user_id = get_jwt_identity()
    role = get_user_role()

    try:
        limit = min(int(request.args.get('limit', 100)), 500)
    except (ValueError, TypeError):
        return jsonify({"msg": "Invalid limit parameter"}), 400

    enq_filter = {}
    if role != 'Admin':
        enq_filter["userId"] = user_id
    else:
        filter_user_id = request.args.get('user_id', '').strip()
        if filter_user_id:
            enq_filter["userId"] = filter_user_id

    logs = list(db.AuditLogs.find(enq_filter).sort("timestamp", -1).limit(limit))
    for log in logs:
        log['_id'] = str(log['_id'])
    return jsonify(logs), 200
