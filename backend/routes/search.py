from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from bson.objectid import ObjectId
from database import db
import re

search_bp = Blueprint('search', __name__)


@search_bp.route('/', methods=['GET'])
@search_bp.route('', methods=['GET'])
@jwt_required()
def global_search():
    """Global search across Enquiries, Bids, and Documents. Bids are scoped
    to the caller's tenant view; Enquiries are scoped by createdBy (or
    Admin sees everything)."""
    try:
        query = request.args.get('q', '').strip()
        if not query:
            return jsonify({"enquiries": [], "bids": [], "documents": []}), 200

        user_id = get_jwt_identity()
        role    = get_jwt().get('role')

        if role == 'Admin':
            bid_filter = {}
            enq_filter = {}
        else:
            user = db.Users.find_one({"_id": ObjectId(user_id)}, {"name": 1}) if ObjectId.is_valid(user_id) else None
            employee_name = user.get('name') if user else None
            bid_filter = {"assignedEmployee": employee_name} if employee_name else {"_id": {"$exists": False}}
            enq_filter = {"createdBy": user_id} if user_id else {"_id": {"$exists": False}}

        # Construct a case-insensitive regex search dictionary
        regex_query = {"$regex": re.escape(query), "$options": "i"}  # Escape to prevent ReDoS

        # 1. Search Enquiries (scoped)
        enquiries_cursor = db.Enquiries.find({**enq_filter, "$or": [
            {"enquiryId":              regex_query},
            {"customerName":           regex_query},
            {"productServiceRequired": regex_query},
            {"notes":                  regex_query},
            {"status":                 regex_query},
        ]}).limit(10)

        enquiries = []
        for enq in enquiries_cursor:
            enq['_id'] = str(enq['_id'])
            enquiries.append(enq)

        # 2. Search Bids (scoped)
        bids_cursor = db.Bids.find({**bid_filter, "$or": [
            {"bidId":            regex_query},
            {"enquiryId":        regex_query},
            {"remarks":          regex_query},
            {"assignedEmployee": regex_query},
            {"status":           regex_query},
            {"industry":         regex_query},
        ]}).limit(10)

        bids_list = list(bids_cursor)
        bids = []
        enq_ids = [b.get("enquiryId") for b in bids_list if b.get("enquiryId")]
        enq_map = {}
        if enq_ids:
            for enq in db.Enquiries.find({"enquiryId": {"$in": enq_ids}}, {"customerName": 1, "enquiryId": 1}):
                enq_map[enq["enquiryId"]] = enq.get("customerName", "Unknown Client")
        for bid in bids_list:
            bid['_id'] = str(bid['_id'])
            bid['customerName'] = enq_map.get(bid.get("enquiryId"), 'Unknown Client')
            bids.append(bid)

        # 3. Search Documents — restricted to documents on bids the caller can see
        visible_bid_ids = [b.get("bidId") for b in db.Bids.find(bid_filter, {"bidId": 1}) if b.get("bidId")]
        doc_or = [
            {"filename": regex_query},
            {"bidId":    regex_query if not visible_bid_ids else {"$in": visible_bid_ids + [query]}},
        ]
        if visible_bid_ids:
            doc_or = [
                {"filename": regex_query},
                {"bidId":    {"$in": visible_bid_ids}},
            ]
        else:
            doc_or = [{"_id": {"$exists": False}}]

        docs_cursor = db.Documents.find({"$or": doc_or}).limit(10)

        documents = []
        for doc in docs_cursor:
            doc['_id'] = str(doc['_id'])
            documents.append(doc)

        return jsonify({
            "enquiries": enquiries,
            "bids":      bids,
            "documents": documents,
        }), 200
    except Exception:
        current_app.logger.exception("global_search failed")
        return jsonify({"msg": "Search error"}), 500
