from flask import Blueprint, jsonify, Response
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from bson.objectid import ObjectId
import io
import csv
import os
from database import db

analytics_bp = Blueprint('analytics', __name__)


def _scope(user_id, role):
    """Return a Mongo filter scoping bids to the caller's tenant view.
    Admins get `{}` (everything). Non-admins get bids assigned to them.
    Returns (filter_dict, employee_name_or_None).
    """
    if role == 'Admin':
        return {}, None
    if not user_id or not ObjectId.is_valid(user_id):
        return {"_id": {"$exists": False}}, None
    user = db.Users.find_one({"_id": ObjectId(user_id)}, {"name": 1})
    name = user.get('name') if user else None
    if not name:
        return {"_id": {"$exists": False}}, None
    return {"assignedEmployee": name}, name


@analytics_bp.route('/dashboard', methods=['GET'])
@jwt_required()
def get_dashboard_metrics():
    """Aggregate dashboard metrics. Scoped to the caller's tenant view so
    non-admin users only see their own bid stats (closes a cross-tenant leak)."""
    user_id = get_jwt_identity()
    role    = get_jwt().get('role')
    bid_filter, _ = _scope(user_id, role)

    # Enquiries: scoped by createdBy (not bid-linked — a user should see
    # all enquiries they created, not just ones with bids).
    if role == 'Admin':
        enq_filter = {}
    else:
        enq_filter = {"createdBy": user_id} if user_id else {"_id": {"$exists": False}}

    total_enquiries = db.Enquiries.count_documents(enq_filter)
    active_bids = db.Bids.count_documents({**bid_filter, "status": {"$nin": ["Completed", "Approved / Rejected", "Order Received", "Rejected"]}})
    won_bids = db.Bids.count_documents({**bid_filter, "status": "Order Received"})
    lost_bids = db.Bids.count_documents({**bid_filter, "status": "Rejected"})

    revenue_pipeline = [
        {"$match": {**bid_filter, "status": "Order Received"}},
        {"$group": {"_id": None, "totalRevenue": {"$sum": "$amount"}}}
    ]
    revenue_result = list(db.Bids.aggregate(revenue_pipeline))
    revenue_generated = revenue_result[0]['totalRevenue'] if revenue_result else 0

    total_bids_for_rate = won_bids + lost_bids
    win_rate = round((won_bids / total_bids_for_rate * 100) if total_bids_for_rate > 0 else 0, 1)

    avg_pipeline = [
        {"$match": bid_filter},
        {"$group": {"_id": None, "avgSize": {"$avg": "$amount"}}}
    ]
    avg_result = list(db.Bids.aggregate(avg_pipeline))
    avg_bid_size = avg_result[0]['avgSize'] if avg_result else 0

    pending_approvals = db.Bids.count_documents({**bid_filter, "status": "Under Review"})

    return jsonify({
        "totalEnquiries":   total_enquiries,
        "activeBids":       active_bids,
        "wonBids":          won_bids,
        "lostBids":         lost_bids,
        "revenueGenerated": revenue_generated,
        "pendingApprovals": pending_approvals,
        "winRate":          win_rate,
        "avgBidSize":       avg_bid_size,
    }), 200


@analytics_bp.route('/export/excel', methods=['GET'])
@jwt_required()
def export_bids_excel():
    """CSV export of bids. Scoped to the caller's tenant view (closes the
    cross-tenant export IDOR — any user previously got every bid in the DB)."""
    user_id = get_jwt_identity()
    role    = get_jwt().get('role')
    bid_filter, _ = _scope(user_id, role)

    bids = list(db.Bids.find(bid_filter))

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['Bid ID', 'Enquiry ID', 'Amount', 'Status', 'Assigned To', 'Submission Date'])
    for bid in bids:
        writer.writerow([
            bid.get('bidId', ''),
            bid.get('enquiryId', ''),
            bid.get('amount', 0),
            bid.get('status', ''),
            bid.get('assignedEmployee', ''),
            bid.get('submissionDate', ''),
        ])

    output.seek(0)
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment;filename=bids_export.csv"}
    )


@analytics_bp.route('/model-stats', methods=['GET'])
@jwt_required()
def get_model_stats():
    """Return ML model performance stats for the dashboard widget."""
    # Active model version
    active = db.ModelVersions.find_one({"isActive": True})
    model_info = None
    if active:
        trained_at = active.get("trainedAt")
        if trained_at:
            if hasattr(trained_at, 'isoformat'):
                trained_at = trained_at.isoformat()
        model_info = {
            "version": active.get("version"),
            "accuracy": active.get("accuracy"),
            "records": active.get("records"),
            "trainedAt": trained_at,
        }

    # Count bids with AI predictions
    total_predictions = db.Bids.count_documents({"aiPrediction": {"$exists": True}})

    # Average confidence
    avg_pipeline = [
        {"$match": {"aiPrediction": {"$exists": True}}},
        {"$group": {"_id": None, "avgConfidence": {"$avg": "$aiPrediction"}}}
    ]
    avg_result = list(db.Bids.aggregate(avg_pipeline))
    avg_confidence = round(avg_result[0]["avgConfidence"], 1) if avg_result else 0

    # Terminal bid count (for retrain readiness)
    terminal_count = db.Bids.count_documents({"status": {"$in": ["Order Received", "Rejected"]}})

    # Check if local model file exists
    ml_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ml')
    model_exists = os.path.exists(os.path.join(ml_dir, 'bid_model.pkl'))

    return jsonify({
        "model": model_info,
        "totalPredictions": total_predictions,
        "avgConfidence": avg_confidence,
        "terminalBids": terminal_count,
        "retrainReady": terminal_count >= 50,
        "modelFileExists": model_exists,
    }), 200
