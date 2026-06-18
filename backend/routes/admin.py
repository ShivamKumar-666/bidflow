"""
backend/routes/admin.py
───────────────────────
Admin-only operations: model retraining, model status.

Endpoints
─────────
POST /api/v1/admin/retrain       — trigger live model retraining from db.Bids
GET  /api/v1/admin/model-status  — show current model file metadata
"""

from flask import Blueprint, jsonify, request, current_app
from flask_jwt_extended import jwt_required
from database import db
from utils import log_audit
from utils.auth_helpers import admin_required, now_utc
from extensions import limiter
import os
import datetime

admin_bp = Blueprint('admin', __name__)

ML_DIR       = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ml')
MODEL_PATH   = os.path.join(ML_DIR, 'bid_model.pkl')
ENCODER_PATH = os.path.join(ML_DIR, 'industry_encoder.pkl')


@admin_bp.route('/retrain', methods=['POST'])
@jwt_required()
@admin_required
@limiter.limit("3 per hour")
def retrain_model():
    """Trigger a live model retrain from real MongoDB bid outcomes.
    Requires Admin role. Returns a JSON summary (status, records, accuracy, timestamp)."""
    try:
        from ml.retrain import retrain_from_db
        result = retrain_from_db(db)
    except Exception:
        current_app.logger.exception("retrain_model failed")
        return jsonify({"status": "error", "msg": "Retraining failed"}), 500

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
@admin_required
@limiter.limit("30 per minute")
def model_status():
    """Return metadata about the currently deployed model files."""

    def file_info(path):
        if os.path.exists(path):
            mtime = os.path.getmtime(path)
            return {
                "exists":         True,
                "size_kb":        round(os.path.getsize(path) / 1024, 1),
                "last_modified":  datetime.datetime.fromtimestamp(mtime, tz=datetime.timezone.utc).isoformat(),
            }
        return {"exists": False}

    # Count terminal bids available for next retrain
    terminal_count = db.Bids.count_documents(
        {"status": {"$in": ["Order Received", "Rejected"]}}
    )

    return jsonify({
        "model":            file_info(MODEL_PATH),
        "encoder":          file_info(ENCODER_PATH),
        "terminal_bids":    terminal_count,
        "min_to_retrain":   50,
        "ready_to_retrain": terminal_count >= 50,
    }), 200


@admin_bp.route('/sla/check', methods=['POST'])
@jwt_required()
@admin_required
@limiter.limit("5 per minute")
def trigger_sla_check():
    """Manually run the SLA breach checker. Requires Admin role."""
    from celery_app import check_sla_breaches
    try:
        result = check_sla_breaches.delay()
        results = result.get(timeout=30)
        log_audit("SLA_CHECK_TRIGGERED", f"SLA check run manually. Checked {results['checked']} bids, found {results['breaches']} breaches.")
        return jsonify(results), 200
    except Exception:
        try:
            results = check_sla_breaches()
            log_audit("SLA_CHECK_TRIGGERED", f"SLA check run manually (fallback). Checked {results['checked']} bids, found {results['breaches']} breaches.")
            return jsonify(results), 200
        except Exception:
            current_app.logger.exception("trigger_sla_check failed")
            return jsonify({"msg": "Failed to run SLA check"}), 500


@admin_bp.route('/sla/report', methods=['GET'])
@jwt_required()
@admin_required
@limiter.limit("30 per minute")
def get_sla_report():
    """Retrieve SLA breach reports grouped by stage and employee. Requires Admin role."""
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
            "by_stage":    [{"stage": item["_id"], "count": item["count"]} for item in stage_summary],
            "by_employee": [{"employee": item["_id"] or "Unassigned", "count": item["count"]} for item in employee_summary],
            "details":     breached_bids,
        }
        return jsonify(report), 200
    except Exception:
        current_app.logger.exception("get_sla_report failed")
        return jsonify({"msg": "Failed to load SLA report"}), 500


@admin_bp.route('/models', methods=['GET'])
@jwt_required()
@admin_required
@limiter.limit("30 per minute")
def get_model_versions():
    """Retrieve list of all model versions. Requires Admin role."""
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
    except Exception:
        current_app.logger.exception("get_model_versions failed")
        return jsonify({"msg": "Failed to fetch model versions"}), 500


@admin_bp.route('/models/rollback', methods=['POST'])
@jwt_required()
@admin_required
@limiter.limit("5 per minute")
def rollback_model_version():
    """Roll back active model to a specific version. Requires Admin role."""
    data = request.get_json() or {}
    version = data.get("version")
    if version is None:
        return jsonify({"msg": "Missing version parameter"}), 400

    try:
        target = db.ModelVersions.find_one({"version": int(version)})
        if not target:
            return jsonify({"msg": f"Model version {version} not found"}), 404

        db.ModelVersions.update_many(
            {"version": {"$ne": int(version)}, "isActive": True},
            {"$set": {"isActive": False}}
        )

        result = db.ModelVersions.update_one(
            {"version": int(version)},
            {"$set": {"isActive": True}}
        )
        if result.matched_count == 0:
            return jsonify({"msg": "Failed to activate version"}), 500

        # Trigger hotswap in BidService
        from services import BidService
        BidService.get_model_and_encoder()

        log_audit("MODEL_ROLLBACK", f"Model rolled back to version {version}. Accuracy: {target.get('accuracy')}")

        return jsonify({"msg": f"Successfully rolled back to version {version}", "version": version}), 200
    except Exception:
        current_app.logger.exception("rollback_model_version failed")
        return jsonify({"msg": "Rollback failed"}), 500

