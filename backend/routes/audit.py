from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from database import db
from utils.auth_helpers import admin_required
from extensions import limiter

audit_bp = Blueprint('audit', __name__)


@audit_bp.route('/', methods=['GET'])
@jwt_required()
@admin_required
@limiter.limit("60 per minute")
def get_audit_logs():
    """Return the most recent audit log entries. Admin only (SEC-29 fix)."""
    try:
        limit = min(int(request.args.get('limit', 100)), 500)
    except (ValueError, TypeError):
        return jsonify({"msg": "Invalid limit parameter"}), 400
    logs = list(db.AuditLogs.find().sort("timestamp", -1).limit(limit))
    for log in logs:
        log['_id'] = str(log['_id'])
    return jsonify(logs), 200
