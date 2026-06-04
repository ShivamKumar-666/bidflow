from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required
from database import db
from utils.auth_helpers import admin_required

audit_bp = Blueprint('audit', __name__)


@audit_bp.route('/', methods=['GET'])
@jwt_required()
@admin_required
def get_audit_logs():
    """Return the most recent audit log entries. Admin only (SEC-29 fix)."""
    logs = list(db.AuditLogs.find().sort("timestamp", -1))
    for log in logs:
        log['_id'] = str(log['_id'])
    return jsonify(logs), 200
