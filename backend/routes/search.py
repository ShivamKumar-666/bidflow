from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from database import db

search_bp = Blueprint('search', __name__)


@search_bp.route('/', methods=['GET'])
@search_bp.route('', methods=['GET'])
@jwt_required()
def global_search():
    """Global search across Enquiries, Bids, and Documents using partial matching."""
    try:
        query = request.args.get('q', '').strip()
        if not query:
            return jsonify({"enquiries": [], "bids": [], "documents": []}), 200

        # Construct a case-insensitive regex search dictionary
        regex_query = {"$regex": query, "$options": "i"}

        # 1. Search Enquiries
        enquiries_cursor = db.Enquiries.find({
            "$or": [
                {"enquiryId": regex_query},
                {"customerName": regex_query},
                {"productServiceRequired": regex_query},
                {"notes": regex_query},
                {"status": regex_query}
            ]
        }).limit(10)

        enquiries = []
        for enq in enquiries_cursor:
            enq['_id'] = str(enq['_id'])
            enquiries.append(enq)

        # 2. Search Bids
        bids_cursor = db.Bids.find({
            "$or": [
                {"bidId": regex_query},
                {"enquiryId": regex_query},
                {"remarks": regex_query},
                {"assignedEmployee": regex_query},
                {"status": regex_query},
                {"industry": regex_query}
            ]
        }).limit(10)

        bids = []
        for bid in bids_cursor:
            bid['_id'] = str(bid['_id'])
            # Fetch associated enquiry for customer name context if available
            enq = db.Enquiries.find_one({"enquiryId": bid.get("enquiryId")}, {"customerName": 1})
            if enq:
                bid['customerName'] = enq.get('customerName')
            else:
                bid['customerName'] = 'Unknown Client'
            bids.append(bid)

        # 3. Search Documents
        docs_cursor = db.Documents.find({
            "$or": [
                {"filename": regex_query},
                {"bidId": regex_query}
            ]
        }).limit(10)

        documents = []
        for doc in docs_cursor:
            doc['_id'] = str(doc['_id'])
            documents.append(doc)

        return jsonify({
            "enquiries": enquiries,
            "bids": bids,
            "documents": documents
        }), 200
    except Exception as e:
        return jsonify({"msg": f"Search error: {str(e)}"}), 500
