import csv
import io
import os

from bson.objectid import ObjectId
from database import db


class AnalyticsService:
    """Business logic for analytics, dashboard metrics, and exports."""

    @classmethod
    def get_bid_scope(cls, user_id: str, role: str) -> tuple:
        if role == 'Admin':
            return {}, None
        if not user_id or not ObjectId.is_valid(user_id):
            return {"_id": {"$exists": False}}, None
        user = db.Users.find_one({"_id": ObjectId(user_id)}, {"name": 1})
        name = user.get('name') if user else None
        if not name:
            return {"_id": {"$exists": False}}, None
        return {"assignedEmployee": name}, name

    @classmethod
    def get_enquiry_scope(cls, user_id: str, role: str) -> dict:
        if role == 'Admin':
            return {}
        if not user_id:
            return {"_id": {"$exists": False}}
        return {"createdBy": user_id}

    @classmethod
    def get_dashboard_metrics(cls, user_id: str, role: str) -> dict:
        bid_filter, _ = cls.get_bid_scope(user_id, role)
        enq_filter = cls.get_enquiry_scope(user_id, role)

        total_enquiries = db.Enquiries.count_documents(enq_filter)

        pipeline = [
            {"$match": bid_filter},
            {"$facet": {
                "status_counts": [
                    {"$group": {"_id": "$status", "count": {"$sum": 1}}}
                ],
                "revenue": [
                    {"$match": {"status": "Order Received"}},
                    {"$group": {"_id": None, "totalRevenue": {"$sum": "$amount"}}}
                ],
                "avg_size": [
                    {"$group": {"_id": None, "avgSize": {"$avg": "$amount"}}}
                ],
            }}
        ]
        result = list(db.Bids.aggregate(pipeline))
        facet = result[0] if result else {}

        status_map = {}
        for item in facet.get("status_counts", []):
            status_map[item["_id"]] = item["count"]

        active_statuses = {"Quotation Prepared", "Under Review", "Negotiation"}
        active_bids = sum(c for s, c in status_map.items() if s in active_statuses)
        won_bids = status_map.get("Order Received", 0)
        lost_bids = status_map.get("Rejected", 0)
        pending_approvals = status_map.get("Under Review", 0)

        revenue_result = facet.get("revenue", [])
        revenue_generated = revenue_result[0]['totalRevenue'] if revenue_result else 0

        avg_result = facet.get("avg_size", [])
        avg_bid_size = avg_result[0]['avgSize'] if avg_result else 0

        total_bids_for_rate = won_bids + lost_bids
        win_rate = round((won_bids / total_bids_for_rate * 100) if total_bids_for_rate > 0 else 0, 1)

        return {
            "totalEnquiries": total_enquiries,
            "activeBids": active_bids,
            "wonBids": won_bids,
            "lostBids": lost_bids,
            "revenueGenerated": revenue_generated,
            "pendingApprovals": pending_approvals,
            "winRate": win_rate,
            "avgBidSize": avg_bid_size,
        }

    @classmethod
    def export_bids_csv(cls, user_id: str, role: str) -> str:
        bid_filter, _ = cls.get_bid_scope(user_id, role)
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
        return output.getvalue()

    @classmethod
    def get_model_stats(cls) -> dict:
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

        total_predictions = db.Bids.count_documents({"aiPrediction": {"$exists": True}})

        avg_pipeline = [
            {"$match": {"aiPrediction": {"$exists": True}}},
            {"$group": {"_id": None, "avgConfidence": {"$avg": "$aiPrediction"}}}
        ]
        avg_result = list(db.Bids.aggregate(avg_pipeline))
        avg_confidence = round(avg_result[0]["avgConfidence"], 1) if avg_result else 0

        terminal_count = db.Bids.count_documents({"status": {"$in": ["Order Received", "Rejected"]}})

        ml_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ml')
        model_exists = os.path.exists(os.path.join(ml_dir, 'bid_model.pkl'))

        return {
            "model": model_info,
            "totalPredictions": total_predictions,
            "avgConfidence": avg_confidence,
            "terminalBids": terminal_count,
            "retrainReady": terminal_count >= 50,
            "modelFileExists": model_exists,
        }
