from flask import Blueprint, request, jsonify, current_app, send_from_directory
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from database import db
from services import EnquiryService
from utils import log_audit
from utils.auth_helpers import require_oid, admin_required
from extensions import limiter

enquiries_bp = Blueprint('enquiries', __name__)


@enquiries_bp.route('/', methods=['GET'])
@jwt_required()
@limiter.limit("60 per minute")
def get_enquiries():
    user_id = get_jwt_identity()
    role = get_jwt().get('role')
    filter_query = EnquiryService.get_visibility_filter(user_id, role)

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
        "page": page,
        "size": size,
        "total": db.Enquiries.count_documents(filter_query),
    }), 200


@enquiries_bp.route('/', methods=['POST'])
@jwt_required()
@limiter.limit("30 per minute")
def create_enquiry():
    data = request.get_json() or {}

    error = EnquiryService.validate_fields(data)
    if error:
        return jsonify({"msg": error}), 400

    new_enquiry = EnquiryService.create_enquiry(data, get_jwt_identity())
    log_audit("CREATE_ENQUIRY", f"Created enquiry {new_enquiry['enquiryId']}")
    new_enquiry['_id'] = str(new_enquiry['_id'])
    return jsonify(new_enquiry), 201


@enquiries_bp.route('/<id>', methods=['PUT'])
@jwt_required()
@limiter.limit("30 per minute")
def update_enquiry(id):
    user_id = get_jwt_identity()
    role = get_jwt().get('role')
    enq_oid = require_oid(id)
    if enq_oid is None:
        return jsonify({"msg": "Invalid id"}), 400

    enq = db.Enquiries.find_one({"_id": enq_oid})
    if not enq:
        return jsonify({"msg": "Enquiry not found"}), 404
    if role != 'Admin' and enq.get("createdBy") != user_id:
        return jsonify({"msg": "Forbidden"}), 403

    data = request.get_json() or {}
    enq, error = EnquiryService.update_enquiry(enq_oid, data)
    if error:
        status = 400 if error == "No valid fields to update" else 404
        return jsonify({"msg": error}), status

    log_audit("UPDATE_ENQUIRY", f"Updated enquiry {enq['enquiryId']}")
    return jsonify({"msg": "Enquiry updated"}), 200


@enquiries_bp.route('/<id>', methods=['DELETE'])
@jwt_required()
@admin_required
@limiter.limit("10 per minute")
def delete_enquiry(id):
    enq_oid = require_oid(id)
    if enq_oid is None:
        return jsonify({"msg": "Invalid id"}), 400

    enq, error = EnquiryService.delete_enquiry(enq_oid)
    if error:
        return jsonify({"msg": error}), 404

    log_audit("DELETE_ENQUIRY", f"Deleted enquiry {enq.get('enquiryId')}")
    return jsonify({"msg": "Enquiry deleted"}), 200


@enquiries_bp.route('/<id>/share', methods=['POST'])
@jwt_required()
@limiter.limit("10 per minute")
def generate_share_token(id):
    user_id = get_jwt_identity()
    role = get_jwt().get('role')
    enq_oid = require_oid(id)
    if enq_oid is None:
        return jsonify({"msg": "Invalid id"}), 400

    enq = db.Enquiries.find_one({"_id": enq_oid})
    if not enq:
        return jsonify({"msg": "Enquiry not found"}), 404
    if role != 'Admin' and enq.get("createdBy") != user_id:
        return jsonify({"msg": "Forbidden"}), 403

    try:
        result, error = EnquiryService.generate_share_token(enq_oid)
        if error:
            return jsonify({"msg": error}), 404

        log_audit("GENERATE_SHARE_LINK", f"Generated public share link for enquiry {result['enquiry'].get('enquiryId')}")
        return jsonify({
            "shareToken": result["shareToken"],
            "shareUrl": result["shareUrl"],
        }), 200
    except Exception as e:
        current_app.logger.exception("generate_share_token failed")
        return jsonify({"msg": "Failed to generate share token"}), 500


@enquiries_bp.route('/public/share/<token>', methods=['GET'])
@limiter.limit("30 per minute")
def get_public_share(token):
    try:
        enq, error = EnquiryService.validate_share_token(token)
        if error:
            return jsonify({"msg": error}), 403 if "expired" in error else 404

        public_data = EnquiryService.get_public_share_data(enq)
        return jsonify(public_data), 200
    except Exception:
        current_app.logger.exception("get_public_share failed")
        return jsonify({"msg": "Failed to load customer portal data"}), 500


@enquiries_bp.route('/public/share/<token>/download/<doc_id>', methods=['GET'])
@limiter.limit("20 per minute")
def download_public_share_file(token, doc_id):
    try:
        enq, error = EnquiryService.validate_share_token(token)
        if error:
            return jsonify({"msg": error}), 403 if "expired" in error else 404

        bid = EnquiryService.get_shared_bid(enq)
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
