"""
backend/routes/admin.py
───────────────────────
Admin-only operations: model retraining, model status.

Endpoints
─────────
POST /api/admin/retrain       — trigger live model retraining from db.Bids
GET  /api/admin/model-status  — show current model file metadata
"""

from flask import Blueprint, jsonify, request
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


@admin_bp.route('/sla/check', methods=['POST'])
@jwt_required()
def trigger_sla_check():
    """Manually run the SLA breach checker. Requires Admin role."""
    _, err = _require_admin()
    if err:
        return err

    from celery_app import check_sla_breaches
    try:
        results = check_sla_breaches()
        log_audit("SLA_CHECK_TRIGGERED", f"SLA check run manually. Checked {results['checked']} bids, found {results['breaches']} breaches.")
        return jsonify(results), 200
    except Exception as e:
        return jsonify({"msg": f"Failed to run SLA check: {str(e)}"}), 500


@admin_bp.route('/sla/report', methods=['GET'])
@jwt_required()
def get_sla_report():
    """Retrieve SLA breach reports grouped by stage and employee. Requires Admin role."""
    _, err = _require_admin()
    if err:
        return err

    try:
        # Group current breaches by status stage
        stage_summary = list(db.Bids.aggregate([
            {"$match": {"slaBreached": True}},
            {"$group": {"_id": "$status", "count": {"$sum": 1}}}
        ]))
        
        # Group current breaches by assigned employee
        employee_summary = list(db.Bids.aggregate([
            {"$match": {"slaBreached": True}},
            {"$group": {"_id": "$assignedEmployee", "count": {"$sum": 1}}}
        ]))

        # Retrieve details of breached bids
        breached_bids = list(db.Bids.find(
            {"slaBreached": True},
            {"bidId": 1, "status": 1, "assignedEmployee": 1, "amount": 1, "slaElapsedDays": 1, "slaThresholdDays": 1}
        ))
        for b in breached_bids:
            b["_id"] = str(b["_id"])

        report = {
            "by_stage": [{"stage": item["_id"], "count": item["count"]} for item in stage_summary],
            "by_employee": [{"employee": item["_id"] or "Unassigned", "count": item["count"]} for item in employee_summary],
            "details": breached_bids
        }
        
        return jsonify(report), 200
    except Exception as e:
        return jsonify({"msg": f"Failed to load SLA report: {str(e)}"}), 500


@admin_bp.route('/models', methods=['GET'])
@jwt_required()
def get_model_versions():
    """Retrieve list of all model versions. Requires Admin role."""
    _, err = _require_admin()
    if err:
        return err

    try:
        versions = list(db.ModelVersions.find(
            {},
            {"version": 1, "isActive": 1, "accuracy": 1, "records": 1, "trainedAt": 1}
        ).sort("version", -1))
        
        for v in versions:
            v["_id"] = str(v["_id"])
            if "trainedAt" in v and isinstance(v["trainedAt"], datetime.datetime):
                v["trainedAt"] = v["trainedAt"].isoformat()

        return jsonify(versions), 200
    except Exception as e:
        return jsonify({"msg": f"Failed to fetch model versions: {str(e)}"}), 500


@admin_bp.route('/models/rollback', methods=['POST'])
@jwt_required()
def rollback_model_version():
    """Roll back active model to a specific version. Requires Admin role."""
    _, err = _require_admin()
    if err:
        return err

    data = request.get_json()
    version = data.get("version")
    if version is None:
        return jsonify({"msg": "Missing version parameter"}), 400

    try:
        target = db.ModelVersions.find_one({"version": int(version)})
        if not target:
            return jsonify({"msg": f"Model version {version} not found"}), 404

        db.ModelVersions.update_many({}, {"$set": {"isActive": False}})
        db.ModelVersions.update_one({"version": int(version)}, {"$set": {"isActive": True}})
        
        # Trigger hotswap in bids route
        from routes.bids import get_model_and_encoder
        get_model_and_encoder()

        log_audit("MODEL_ROLLBACK", f"Model rolled back to version {version}. Accuracy: {target.get('accuracy')}")
        
        return jsonify({"msg": f"Successfully rolled back to version {version}", "version": version}), 200
    except Exception as e:
        return jsonify({"msg": f"Rollback failed: {str(e)}"}), 500

