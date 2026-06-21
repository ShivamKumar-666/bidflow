from flask import Blueprint, jsonify, Response, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from services import AnalyticsService
from extensions import limiter
from utils.auth_helpers import get_user_role

analytics_bp = Blueprint('analytics', __name__)


@analytics_bp.route('/dashboard', methods=['GET'])
@jwt_required()
@limiter.limit("60 per minute")
def get_dashboard_metrics():
    try:
        user_id = get_jwt_identity()
        role = get_user_role()
        metrics = AnalyticsService.get_dashboard_metrics(user_id, role)
        return jsonify(metrics), 200
    except Exception:
        current_app.logger.exception("get_dashboard_metrics failed")
        return jsonify({"msg": "Failed to load dashboard metrics"}), 500


@analytics_bp.route('/export/csv', methods=['GET'])
@jwt_required()
@limiter.limit("10 per minute")
def export_bids_excel():
    try:
        user_id = get_jwt_identity()
        role = get_user_role()
        csv_data = AnalyticsService.export_bids_csv(user_id, role)

        return Response(
            csv_data,
            mimetype="text/csv",
            headers={"Content-Disposition": "attachment;filename=bids_export.csv"}
        )
    except Exception:
        current_app.logger.exception("export_bids_csv failed")
        return jsonify({"msg": "Failed to export CSV"}), 500


@analytics_bp.route('/model-stats', methods=['GET'])
@jwt_required()
@limiter.limit("30 per minute")
def get_model_stats():
    try:
        stats = AnalyticsService.get_model_stats()
        return jsonify(stats), 200
    except Exception:
        current_app.logger.exception("get_model_stats failed")
        return jsonify({"msg": "Failed to load model stats"}), 500
