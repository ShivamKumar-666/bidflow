"""
backend/routes/admin.py
───────────────────────
Admin-only operations: model retraining, model status.

Endpoints
─────────
POST /api/admin/retrain       — trigger live model retraining from db.Bids
GET  /api/admin/model-status  — show current model file metadata
"""

from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from database import db
from utils import log_audit
import os
import datetime

admin_bp = Blueprint('admin', __name__)

ML_DIR       = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ml')
MODEL_PATH   = os.path.join(ML_DIR, 'bid_model.pkl')
ENCODER_PATH = os.path.join(ML_DIR, 'industry_encoder.pkl')


def _require_admin():
    """Returns (claims, error_response) — error_response is None if OK."""
    claims = get_jwt()
    if claims.get('role') != 'Admin':
        return claims, (jsonify({'msg': 'Admin access required'}), 403)
    return claims, None


@admin_bp.route('/retrain', methods=['POST'])
@jwt_required()
def retrain_model():
    """
    Trigger a live model retrain from real MongoDB bid outcomes.
    Requires Admin role.
    Returns a JSON summary (status, records used, accuracy, timestamp).
    """
    _, err = _require_admin()
    if err:
        return err

    from ml.retrain import retrain_from_db
    result = retrain_from_db(db)

    if result['status'] == 'success':
        log_audit(
            "RETRAIN_MODEL",
            f"Model retrained on {result['records']} records. "
            f"Accuracy: {result['accuracy']:.2%}"
        )
    else:
        log_audit(
            "RETRAIN_MODEL_SKIPPED",
            f"Not enough data ({result['records']}/{result['min_required']} records)"
        )

    return jsonify(result), 200


@admin_bp.route('/model-status', methods=['GET'])
@jwt_required()
def model_status():
    """Return metadata about the currently deployed model files."""
    _, err = _require_admin()
    if err:
        return err

    def file_info(path):
        if os.path.exists(path):
            mtime = os.path.getmtime(path)
            return {
                "exists": True,
                "size_kb": round(os.path.getsize(path) / 1024, 1),
                "last_modified": datetime.datetime.utcfromtimestamp(mtime).isoformat()
            }
        return {"exists": False}

    # Count terminal bids available for next retrain
    terminal_count = db.Bids.count_documents(
        {"status": {"$in": ["Order Received", "Rejected"]}}
    )

    return jsonify({
        "model":             file_info(MODEL_PATH),
        "encoder":           file_info(ENCODER_PATH),
        "terminal_bids":     terminal_count,
        "min_to_retrain":    50,
        "ready_to_retrain":  terminal_count >= 50
    }), 200
