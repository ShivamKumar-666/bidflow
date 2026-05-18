from flask import Blueprint, jsonify, Response
from flask_jwt_extended import jwt_required
import io
import csv
from database import db

analytics_bp = Blueprint('analytics', __name__)

@analytics_bp.route('/dashboard', methods=['GET'])
@jwt_required()
def get_dashboard_metrics():
    total_enquiries = db.Enquiries.count_documents({})
    active_bids = db.Bids.count_documents({"status": {"$nin": ["Completed", "Approved / Rejected", "Order Received", "Rejected"]}})
    won_bids = db.Bids.count_documents({"status": "Order Received"})
    lost_bids = db.Bids.count_documents({"status": "Rejected"})
    
    # Calculate revenue generated from won bids
    revenue_pipeline = [
        {"$match": {"status": "Order Received"}},
        {"$group": {"_id": None, "totalRevenue": {"$sum": "$amount"}}}
    ]
    revenue_result = list(db.Bids.aggregate(revenue_pipeline))
    revenue_generated = revenue_result[0]['totalRevenue'] if revenue_result else 0
    
    # Additional KPIs
    total_bids_for_rate = won_bids + lost_bids
    win_rate = round((won_bids / total_bids_for_rate * 100) if total_bids_for_rate > 0 else 0, 1)
    
    avg_pipeline = [
        {"$group": {"_id": None, "avgSize": {"$avg": "$amount"}}}
    ]
    avg_result = list(db.Bids.aggregate(avg_pipeline))
    avg_bid_size = avg_result[0]['avgSize'] if avg_result else 0
    
    pending_approvals = db.Bids.count_documents({"status": "Under Review"}) # Or however we define pending approvals
    
    return jsonify({
        "totalEnquiries": total_enquiries,
        "activeBids": active_bids,
        "wonBids": won_bids,
        "lostBids": lost_bids,
        "revenueGenerated": revenue_generated,
        "pendingApprovals": pending_approvals,
        "winRate": win_rate,
        "avgBidSize": avg_bid_size
    }), 200

@analytics_bp.route('/export/excel', methods=['GET'])
@jwt_required()
def export_bids_excel():
    bids = list(db.Bids.find({}))
    
    # Create CSV (since pandas might not be installed, using standard csv as simple excel replacement)
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
            bid.get('submissionDate', '')
        ])
    
    output.seek(0)
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment;filename=bids_export.csv"}
    )
