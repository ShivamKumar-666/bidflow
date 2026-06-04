from flask import Blueprint, request, jsonify, current_app, send_from_directory
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from database import db
from bson.objectid import ObjectId
import datetime
import secrets
import uuid
from utils import log_audit
from utils.auth_helpers import now_utc, require_oid, current_user_and_role
from extensions import limiter

enquiries_bp = Blueprint('enquiries', __name__)


def generate_enquiry_id():
    """Non-sequential, collision-resistant enquiry ID. ENQ-<8 hex chars>."""
    for _ in range(3):
        token  = secrets.token_hex(4)
        enq_id = f"ENQ-{token}"
        if not db.Enquiries.find_one({"enquiryId": enq_id}):
            return enq_id
    return f"ENQ-{secrets.token_hex(6)}"


def _user_assigned_employee_name(user_id):
    """Return the user's name (used as the `assignedEmployee` field on bids/enquiries)."""
    if not user_id or not ObjectId.is_valid(user_id):
        return None
    user = db.Users.find_one({"_id": ObjectId(user_id)}, {"name": 1})
    return user.get('name') if user else None


def _enquiry_visible_filter(user_id, role):
    """
    Build the Mongo filter that scopes enquiries to the caller's tenant view.

    - Admin    → all enquiries.
    - Everyone → enquiries they created (createdBy == user_id).
      Fallback: if old enquiries have no createdBy field, they're only
      visible to Admins (defence-in-depth).
    """
    if role == 'Admin':
        return {}
    if not user_id:
        return {"_id": {"$exists": False}}
    return {"createdBy": user_id}


@enquiries_bp.route('/', methods=['GET'])
@jwt_required()
def get_enquiries():
    """List enquiries scoped to the caller's role (closes the SEC-26 IDOR)."""
    user_id = get_jwt_identity()
    role    = get_jwt().get('role')

    filter_query = _enquiry_visible_filter(user_id, role)

    # Pagination (defaults aligned with PERF-01 fix recommendation)
    try:
        page = max(int(request.args.get('page', 1)), 1)
        size = min(max(int(request.args.get('size', 50)), 1), 200)
    except ValueError:
        return jsonify({"msg": "Invalid pagination parameters"}), 400

    cursor = (
        db.Enquiries.find(filter_query)
        .sort("date", -1)
        .skip((page - 1) * size)
        .limit(size)
    )
    enquiries = list(cursor)
    for enq in enquiries:
        enq['_id'] = str(enq['_id'])
    return jsonify({
        "items": enquiries,
        "page":  page,
        "size":  size,
        "total": db.Enquiries.count_documents(filter_query),
    }), 200


@enquiries_bp.route('/', methods=['POST'])
@jwt_required()
def create_enquiry():
    data = request.get_json() or {}
    customer_name         = data.get("customerName")
    contact_information   = data.get("contactInformation")
    product_service       = data.get("productServiceRequired")

    if not customer_name or not contact_information or not product_service:
        return jsonify({"msg": "customerName, contactInformation, and productServiceRequired are required"}), 400

    # Length cap to prevent DoS via megabyte fields (SEC-13 fix).
    for field, value, limit in (
        ("customerName",         customer_name,         200),
        ("contactInformation",   contact_information,   500),
        ("productServiceRequired", product_service,     500),
        ("notes",                data.get("notes", ""), 5000),
    ):
        if isinstance(value, str) and len(value) > limit:
            return jsonify({"msg": f"{field} exceeds maximum length of {limit} chars"}), 400

    tags = [t.strip().lower() for t in data.get("tags", []) if isinstance(t, str) and t.strip()]

    new_enquiry = {
        "enquiryId":              generate_enquiry_id(),
        "customerName":           customer_name,
        "contactInformation":     contact_information,
        "productServiceRequired": product_service,
        "date":                   now_utc(),
        "priority":               data.get("priority", "Medium"),
        "notes":                  data.get("notes", ""),
        "tags":                   tags,
        "status":                 "Under Review",
        "createdBy":              get_jwt_identity(),
    }
    db.Enquiries.insert_one(new_enquiry)
    log_audit("CREATE_ENQUIRY", f"Created enquiry {new_enquiry['enquiryId']}")
    new_enquiry['_id'] = str(new_enquiry['_id'])
    return jsonify(new_enquiry), 201


@enquiries_bp.route('/<id>', methods=['PUT'])
@jwt_required()
def update_enquiry(id):
    enq_oid = require_oid(id)
    if enq_oid is None:
        return jsonify({"msg": "Invalid id"}), 400

    data = request.get_json() or {}
    ALLOWED_FIELDS = {"customerName", "contactInformation", "productServiceRequired",
                      "priority", "notes", "tags", "status"}
    update_data = {k: v for k, v in data.items() if k in ALLOWED_FIELDS}

    if not update_data:
        return jsonify({"msg": "No valid fields to update"}), 400

    if "tags" in update_data:
        update_data["tags"] = [t.strip().lower() for t in update_data["tags"] if isinstance(t, str) and t.strip()]

    result = db.Enquiries.update_one({"_id": enq_oid}, {"$set": update_data})
    if result.matched_count:
        enq = db.Enquiries.find_one({"_id": enq_oid})
        if enq:
            log_audit("UPDATE_ENQUIRY", f"Updated enquiry {enq['enquiryId']}")
        return jsonify({"msg": "Enquiry updated"}), 200
    return jsonify({"msg": "Enquiry not found"}), 404


@enquiries_bp.route('/<id>', methods=['DELETE'])
@jwt_required()
def delete_enquiry(id):
    if get_jwt().get('role') != 'Admin':
        return jsonify({"msg": "Admin access required"}), 403

    enq_oid = require_oid(id)
    if enq_oid is None:
        return jsonify({"msg": "Invalid id"}), 400

    enq = db.Enquiries.find_one({"_id": enq_oid})
    result = db.Enquiries.delete_one({"_id": enq_oid})
    if result.deleted_count:
        if enq:
            log_audit("DELETE_ENQUIRY", f"Deleted enquiry {enq.get('enquiryId')}")
        return jsonify({"msg": "Enquiry deleted"}), 200
    return jsonify({"msg": "Enquiry not found"}), 404


@enquiries_bp.route('/<id>/share', methods=['POST'])
@jwt_required()
def generate_share_token(id):
    """Generate a 90-day public sharing token for an enquiry."""
    enq_oid = require_oid(id)
    if enq_oid is None:
        return jsonify({"msg": "Invalid id"}), 400

    try:
        token = str(uuid.uuid4())
        now   = now_utc()

        result = db.Enquiries.update_one(
            {"_id": enq_oid},
            {"$set": {"shareToken": token, "shareTokenCreatedAt": now}}
        )

        if result.matched_count:
            enq = db.Enquiries.find_one({"_id": enq_oid})
            if enq:
                log_audit("GENERATE_SHARE_LINK", f"Generated public share link for enquiry {enq.get('enquiryId')}")
            frontend_url = current_app.config.get('FRONTEND_URL', 'http://localhost:5173')
            return jsonify({
                "shareToken": token,
                "shareUrl":   f"{frontend_url}/share/{token}",
            }), 200
        return jsonify({"msg": "Enquiry not found"}), 404
    except Exception as e:
        current_app.logger.exception("generate_share_token failed")
        return jsonify({"msg": "Failed to generate share token"}), 500


@enquiries_bp.route('/public/share/<token>', methods=['GET'])
@limiter.limit("30 per minute")
def get_public_share(token):
    """Public status page for a shared enquiry (no auth required)."""
    try:
        enq = db.Enquiries.find_one({"shareToken": token})
        if not enq:
            return jsonify({"msg": "Invalid share link"}), 404

        created_at = enq.get("shareTokenCreatedAt")
        if created_at:
            if isinstance(created_at, str):
                try:
                    created_at = datetime.datetime.fromisoformat(created_at)
                except (TypeError, ValueError):
                    created_at = None
            if created_at:
                # Normalize: strip tz if naive utcnow was used historically.
                if created_at.tzinfo is None:
                    created_at = created_at.replace(tzinfo=datetime.timezone.utc)
                age = now_utc() - created_at
                if age.days >= 90:
                    return jsonify({"msg": "This share link has expired. Links are valid for 90 days."}), 403

        bid = db.Bids.find_one({"enquiryId": enq.get("enquiryId")})
        bid_data = None
        docs     = []

        if bid:
            for doc in db.Documents.find({"bidId": bid.get("bidId")}):
                docs.append({
                    "_id":        str(doc["_id"]),
                    "filename":   doc["filename"],
                    "uploadDate": doc.get("uploadDate").isoformat() if isinstance(doc.get("uploadDate"), datetime.datetime) else doc.get("uploadDate"),
                })

            bid_data = {
                "bidId":          bid.get("bidId"),
                "status":         bid.get("status"),
                "submissionDate": bid.get("submissionDate"),
                "remarks":        bid.get("remarks", ""),
                "history":        bid.get("history", []),
            }
            for h in bid_data["history"]:
                if isinstance(h.get("date"), datetime.datetime):
                    h["date"] = h["date"].isoformat()

        public_data = {
            "enquiry": {
                "enquiryId":              enq.get("enquiryId"),
                "customerName":           enq.get("customerName"),
                "productServiceRequired": enq.get("productServiceRequired"),
                "date":   enq.get("date").isoformat() if isinstance(enq.get("date"), datetime.datetime) else enq.get("date"),
                "status": enq.get("status"),
            },
            "bid":       bid_data,
            "documents": docs,
        }
        return jsonify(public_data), 200
    except Exception:
        current_app.logger.exception("get_public_share failed")
        return jsonify({"msg": "Failed to load customer portal data"}), 500


@enquiries_bp.route('/public/share/<token>/download/<doc_id>', methods=['GET'])
@limiter.limit("20 per minute")
def download_public_share_file(token, doc_id):
    """Public download of a file attached to a shared enquiry."""
    try:
        enq = db.Enquiries.find_one({"shareToken": token})
        if not enq:
            return jsonify({"msg": "Invalid share link"}), 404

        created_at = enq.get("shareTokenCreatedAt")
        if created_at:
            if isinstance(created_at, str):
                try:
                    created_at = datetime.datetime.fromisoformat(created_at)
                except (TypeError, ValueError):
                    created_at = None
            if created_at:
                if created_at.tzinfo is None:
                    created_at = created_at.replace(tzinfo=datetime.timezone.utc)
                age = now_utc() - created_at
                if age.days >= 90:
                    return jsonify({"msg": "This share link has expired. Links are valid for 90 days."}), 403

        bid = db.Bids.find_one({"enquiryId": enq.get("enquiryId")})
        if not bid:
            return jsonify({"msg": "Associated bid not found"}), 404

        doc_oid = require_oid(doc_id)
        if doc_oid is None:
            return jsonify({"msg": "Invalid document id"}), 400

        doc = db.Documents.find_one({"_id": doc_oid, "bidId": bid.get("bidId")})
        if not doc:
            return jsonify({"msg": "Document not found or unauthorized access"}), 404

        return send_from_directory(
            current_app.config['UPLOAD_FOLDER'],
            doc["path"],
            as_attachment=True,
            download_name=doc["filename"],
        )
    except Exception:
        current_app.logger.exception("download_public_share_file failed")
        return jsonify({"msg": "Failed to download document"}), 500
