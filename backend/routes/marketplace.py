import datetime
import re

from bson.objectid import ObjectId
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import db
from extensions import limiter, socketio
from services import BidService, EnquiryService, NotificationService
from utils.auth_helpers import now_utc, get_user_role
from utils import log_audit


marketplace_bp = Blueprint('marketplace', __name__)


@marketplace_bp.route('/', methods=['GET'])
@jwt_required()
@limiter.limit("60 per minute")
def list_marketplace():
    user_id = get_jwt_identity()
    role = get_user_role()

    if role not in ('Admin', 'Bidder', 'Company', 'Sales Executive'):
        return jsonify({"msg": "Forbidden"}), 403

    try:
        page = min(int(request.args.get('page', 1)), 100)
        size = min(int(request.args.get('size', 20)), 100)
    except ValueError:
        return jsonify({"msg": "Invalid pagination parameters"}), 400
    skip = (page - 1) * size

    enq_filter = {"visibility": "public"}
    if role == 'Admin':
        enq_filter = {}

    and_clauses = []

    search = request.args.get('search', '').strip()
    if search:
        search_escaped = re.escape(search)
        and_clauses.append({"$or": [
            {"customerName": {"$regex": search_escaped, "$options": "i"}},
            {"productServiceRequired": {"$regex": search_escaped, "$options": "i"}},
        ]})

    industry = request.args.get('industry', '').strip()
    if industry:
        industry_escaped = re.escape(industry.lower())
        industry_exact = re.escape(industry)
        and_clauses.append({"$or": [
            {"tags": {"$regex": f"\\b{industry_escaped}\\b", "$options": "i"}},
            {"industry": {"$regex": f"^{industry_exact}$", "$options": "i"}},
        ]})

    if len(and_clauses) == 1:
        enq_filter.update(and_clauses[0])
    elif len(and_clauses) > 1:
        enq_filter["$and"] = and_clauses

    priority = request.args.get('priority', '').strip()
    if priority:
        enq_filter["priority"] = priority

    sort_field = request.args.get('sort', '-date')
    sort_map = {
        'date': ("date", 1),
        '-date': ("date", -1),
        'priority': ("priority", 1),
        '-bidCount': ("bidCount", -1),
    }
    sort_key, sort_dir = sort_map.get(sort_field, ("date", -1))

    total = db.Enquiries.count_documents(enq_filter)
    enquiries = list(
        db.Enquiries.find(enq_filter)
        .sort(sort_key, sort_dir)
        .skip(skip)
        .limit(size)
    )

    items = []
    for e in enquiries:
        doc = {
            "_id": str(e["_id"]),
            "enquiryId": e.get("enquiryId"),
            "customerName": e.get("customerName"),
            "productServiceRequired": e.get("productServiceRequired"),
            "priority": e.get("priority"),
            "status": e.get("status"),
            "negotiable": e.get("negotiable", True),
            "tags": e.get("tags", []),
            "industry": e.get("industry"),
            "bidCount": e.get("bidCount", 0),
            "listingDeadline": e.get("listingDeadline").isoformat() if isinstance(e.get("listingDeadline"), datetime.datetime) else None,
            "date": e.get("date").isoformat() if isinstance(e.get("date"), datetime.datetime) else None,
        }
        items.append(doc)

    return jsonify({
        "items": items,
        "page": page,
        "size": size,
        "total": total,
    }), 200


@marketplace_bp.route('/<enquiry_id>', methods=['GET'])
@jwt_required()
@limiter.limit("60 per minute")
def get_marketplace_enquiry(enquiry_id):
    user_id = get_jwt_identity()
    role = get_user_role()

    enquiry = db.Enquiries.find_one({"enquiryId": enquiry_id})
    if not enquiry:
        return jsonify({"msg": "Enquiry not found"}), 404

    if enquiry.get("visibility") != "public" and role != 'Admin':
        return jsonify({"msg": "Enquiry not found"}), 404

    bids = list(db.Bids.find({"enquiryId": enquiry_id}))
    my_bids = [b for b in bids if b.get("createdBy") == user_id] if role == 'Bidder' else []
    all_bids_for_company = bids if (role == 'Company' and enquiry.get("createdBy") == user_id) or role == 'Admin' else []

    enquiry_docs = list(db.Documents.find({"enquiryId": enquiry_id}))
    bid_ids = [b.get("bidId") for b in bids if b.get("bidId")]
    bid_docs = list(db.Documents.find({"bidId": {"$in": bid_ids}})) if bid_ids else []
    all_docs = []
    seen = set()
    for doc in enquiry_docs + bid_docs:
        if doc["_id"] not in seen:
            seen.add(doc["_id"])
            all_docs.append({
                "_id": str(doc["_id"]),
                "filename": doc["filename"],
                "uploadDate": doc.get("uploadDate").isoformat() if isinstance(doc.get("uploadDate"), datetime.datetime) else doc.get("uploadDate"),
            })

    enquiry_creator = enquiry.get("createdBy")
    is_owner = str(enquiry_creator) == user_id if enquiry_creator else False
    is_admin = role == 'Admin'

    return jsonify({
        "enquiry": {
            "_id": str(enquiry["_id"]),
            "enquiryId": enquiry.get("enquiryId"),
            "customerName": enquiry.get("customerName"),
            "contactInformation": enquiry.get("contactInformation") if (is_owner or is_admin) else None,
            "productServiceRequired": enquiry.get("productServiceRequired"),
            "priority": enquiry.get("priority"),
            "status": enquiry.get("status"),
            "negotiable": enquiry.get("negotiable", True),
            "notes": enquiry.get("notes", "") if (is_owner or is_admin) else "",
            "tags": enquiry.get("tags", []),
            "industry": enquiry.get("industry"),
            "bidCount": enquiry.get("bidCount", 0),
            "listingDeadline": enquiry.get("listingDeadline").isoformat() if isinstance(enquiry.get("listingDeadline"), datetime.datetime) else None,
            "date": enquiry.get("date").isoformat() if isinstance(enquiry.get("date"), datetime.datetime) else None,
        },
        "documents": all_docs,
        "myBids": [{
            "_id": str(b["_id"]),
            "bidId": b.get("bidId"),
            "amount": b.get("amount"),
            "status": b.get("status"),
            "remarks": b.get("remarks", ""),
            "aiPrediction": b.get("aiPrediction"),
            "shapExplanations": b.get("shapExplanations", []),
            "submissionDate": b.get("submissionDate"),
            "createdBy": b.get("createdBy"),
            "history": b.get("history", []),
        } for b in my_bids],
        "allBids": [{
            "_id": str(b["_id"]),
            "bidId": b.get("bidId"),
            "amount": b.get("amount"),
            "status": b.get("status"),
            "remarks": b.get("remarks", ""),
            "aiPrediction": b.get("aiPrediction"),
            "submissionDate": b.get("submissionDate"),
            "createdBy": b.get("createdBy"),
        } for b in all_bids_for_company],
    }), 200


@marketplace_bp.route('/<enquiry_id>/bid', methods=['POST'])
@jwt_required()
@limiter.limit("10 per minute")
def submit_marketplace_bid(enquiry_id):
    user_id = get_jwt_identity()
    role = get_user_role()

    if role not in ('Bidder', 'Sales Executive', 'Company'):
        return jsonify({"msg": "Only bidders can submit bids on marketplace enquiries"}), 403

    enquiry = db.Enquiries.find_one({"enquiryId": enquiry_id})
    if not enquiry:
        return jsonify({"msg": "Enquiry not found"}), 404

    if enquiry.get("visibility") != "public":
        return jsonify({"msg": "This enquiry is not listed on the marketplace"}), 403

    listing_deadline = enquiry.get("listingDeadline")
    if listing_deadline and isinstance(listing_deadline, datetime.datetime):
        deadline = listing_deadline
        if deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=datetime.timezone.utc)
        if now_utc() > deadline:
            return jsonify({"msg": "The bidding deadline for this enquiry has passed"}), 400

    data = request.get_json() or {}
    amount = data.get("amount")
    if amount is None:
        return jsonify({"msg": "Amount is required"}), 400

    try:
        data["amount"] = float(amount)
    except (TypeError, ValueError):
        return jsonify({"msg": "Amount must be a number"}), 400

    if data["amount"] < 0:
        return jsonify({"msg": "Amount must be non-negative"}), 400

    data["enquiryId"] = enquiry_id
    if not data.get("industry"):
        data["industry"] = enquiry.get("tags", ["Other"])[0] if enquiry.get("tags") else "Other"

    if not data.get("assignedEmployee"):
        current_user = db.Users.find_one({"_id": ObjectId(user_id)}, {"name": 1})
        if current_user:
            data["assignedEmployee"] = current_user.get("name")

    new_bid = BidService.create_bid(data, user_id)

    log_audit("CREATE_BID", f"Marketplace bid {new_bid['bidId']} created for enquiry {enquiry_id}")

    # Notify enquiry creator
    enquiry_creator_id = str(enquiry.get("createdBy"))
    if enquiry_creator_id and enquiry_creator_id != user_id:
        notif = NotificationService.create(
            user_id=enquiry_creator_id,
            title="New Bid Received",
            message=f"New bid {new_bid['bidId']} received for enquiry {enquiry_id}",
            notif_type="status_change",
            ref_id=str(new_bid["_id"])
        )
        socketio.emit('notification', notif, room=f"user_{enquiry_creator_id}")  # type: ignore[call-arg]

    return jsonify({
        "msg": "Bid submitted successfully",
        "bid": {
            "_id": str(new_bid["_id"]),
            "bidId": new_bid.get("bidId"),
            "amount": new_bid.get("amount"),
            "currency": new_bid.get("currency", "USD"),
            "status": new_bid.get("status"),
            "aiPrediction": new_bid.get("aiPrediction"),
            "shapExplanations": new_bid.get("shapExplanations", []),
        }
    }), 201
