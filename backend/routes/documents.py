from flask import Blueprint, request, jsonify, send_from_directory, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from database import db
from services import DocumentService
from utils.auth_helpers import require_oid
from extensions import limiter

documents_bp = Blueprint('documents', __name__)


@documents_bp.route('/upload', methods=['POST'])
@jwt_required()
@limiter.limit("30 per minute")
def upload_file():
    if 'file' not in request.files:
        return jsonify({"msg": "No file part"}), 400
    file = request.files['file']

    file, error = DocumentService.validate_file(file)
    if error:
        status = 413 if "too large" in error else 400
        return jsonify({"msg": error}), status

    bid_id = request.form.get('bidId')
    if not bid_id:
        return jsonify({"msg": "bidId is required"}), 400

    bid_oid = require_oid(bid_id)
    if bid_oid is None:
        return jsonify({"msg": "Invalid bidId"}), 400

    bid = db.Bids.find_one({"_id": bid_oid})
    if not bid:
        return jsonify({"msg": "Bid not found"}), 404

    user_id = get_jwt_identity()
    role = get_jwt().get('role')
    if not DocumentService.check_user_bid_access(user_id, role, bid):
        return jsonify({"msg": "Forbidden: you are not assigned to this bid"}), 403

    document, error = DocumentService.upload_document(file, str(bid_oid), user_id)
    if error:
        return jsonify({"msg": error}), 400

    document['_id'] = str(document['_id'])
    return jsonify(document), 201


@documents_bp.route('/download/<doc_id>', methods=['GET'])
@jwt_required()
@limiter.limit("30 per minute")
def download_file(doc_id):
    doc_oid = require_oid(doc_id)
    if doc_oid is None:
        return jsonify({"msg": "Invalid document id"}), 400

    doc = DocumentService.get_document(doc_id)
    if not doc:
        return jsonify({"msg": "Document not found"}), 404

    bid_oid = require_oid(doc.get("bidId"))
    bid = db.Bids.find_one({"_id": bid_oid}) if bid_oid else None

    user_id = get_jwt_identity()
    role = get_jwt().get('role')
    if not DocumentService.check_user_bid_access(user_id, role, bid):
        if not DocumentService.check_enquiry_is_public(doc.get("enquiryId")):
            return jsonify({"msg": "Forbidden"}), 403

    return send_from_directory(
        current_app.config['UPLOAD_FOLDER'],
        doc["path"],
        as_attachment=True,
        download_name=doc["filename"],
    )


@documents_bp.route('/bid/<bid_id>', methods=['GET'])
@jwt_required()
def get_bid_documents(bid_id):
    bid_oid = require_oid(bid_id)
    if bid_oid is None:
        return jsonify({"msg": "Invalid bidId"}), 400

    bid = db.Bids.find_one({"_id": bid_oid})
    if not bid:
        return jsonify({"msg": "Bid not found"}), 404

    user_id = get_jwt_identity()
    role = get_jwt().get('role')
    if not DocumentService.check_user_bid_access(user_id, role, bid):
        return jsonify({"msg": "Forbidden"}), 403

    docs = DocumentService.get_bid_documents(bid_id)
    return jsonify(docs), 200
