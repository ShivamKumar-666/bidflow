from flask import Blueprint, jsonify, Response
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from services import AnalyticsService

analytics_bp = Blueprint('analytics', __name__)


@analytics_bp.route('/dashboard', methods=['GET'])
@jwt_required()
def get_dashboard_metrics():
    user_id = get_jwt_identity()
    role = get_jwt().get('role')
    metrics = AnalyticsService.get_dashboard_metrics(user_id, role)
    return jsonify(metrics), 200


@analytics_bp.route('/export/excel', methods=['GET'])
@jwt_required()
def export_bids_excel():
    user_id = get_jwt_identity()
    role = get_jwt().get('role')
    csv_data = AnalyticsService.export_bids_csv(user_id, role)

    return Response(
        csv_data,
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment;filename=bids_export.csv"}
    )


@analytics_bp.route('/model-stats', methods=['GET'])
@jwt_required()
def get_model_stats():
    stats = AnalyticsService.get_model_stats()
    return jsonify(stats), 200
