from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import db
from bson.objectid import ObjectId

audit_bp = Blueprint('audit', __name__)

@audit_bp.route('/', methods=['GET'])
@jwt_required()
def get_audit_logs():
    # Only Admin should access this
    user_id = get_jwt_identity()
    user = db.Users.find_one({"_id": ObjectId(user_id)})
    
    if not user or user.get('role') != 'Admin':
        return jsonify({"msg": "Unauthorized access"}), 403
        
    logs = list(db.AuditLogs.find().sort("timestamp", -1))
    for log in logs:
        log['_id'] = str(log['_id'])
        
    return jsonify(logs), 200
