from flask import Blueprint, request, jsonify, send_from_directory, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from werkzeug.utils import secure_filename
import os
from database import db
from bson.objectid import ObjectId
from utils.auth_helpers import now_utc, require_oid

documents_bp = Blueprint('documents', __name__)

ALLOWED_EXTENSIONS = {'txt', 'pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx', 'xls', 'xlsx'}

# SEC-08: validate MIME type so attackers cannot bypass the extension check
# by simply renaming a file (e.g. malware.exe → document.pdf).
ALLOWED_MIMES = {
    "application/pdf",
    "text/plain",
    "image/png",
    "image/jpeg",
    "application/msword",                                                      # .doc
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", # .docx
    "application/vnd.ms-excel",                                                # .xls
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",       # .xlsx
}

MAX_FILE_BYTES = 16 * 1024 * 1024   # 16 MB — matches Config.MAX_CONTENT_LENGTH


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def _user_can_access_bid(user_id, role, bid):
    """
    Authorization gate for bid-scoped resources.
    - Admins can access any bid.
    - Otherwise the user must be the assigned employee on the bid.
    Returns True/False.
    """
    if role == 'Admin':
        return True
    if not bid or not user_id:
        return False
    user = db.Users.find_one({"_id": ObjectId(user_id)}, {"name": 1})
    return bool(user and user.get('name') == bid.get('assignedEmployee'))


@documents_bp.route('/upload', methods=['POST'])
@jwt_required()
def upload_file():
    if 'file' not in request.files:
        return jsonify({"msg": "No file part"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"msg": "No selected file"}), 400

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
    role    = get_jwt().get('role')
    if not _user_can_access_bid(user_id, role, bid):
        return jsonify({"msg": "Forbidden: you are not assigned to this bid"}), 403

    if file and allowed_file(file.filename):
        # Reject files that exceed the size cap (defence-in-depth)
        file.seek(0, os.SEEK_END)
        size = file.tell()
        file.seek(0)
        if size > MAX_FILE_BYTES:
            return jsonify({"msg": "File too large (max 16 MB)"}), 413

        # Validate MIME type against client-declared Content-Type (SEC-08)
        if file.content_type and file.content_type not in ALLOWED_MIMES:
            return jsonify({"msg": "File type not allowed"}), 400

        filename = secure_filename(file.filename)
        unique_filename = f"{now_utc().timestamp()}_{filename}"
        filepath = os.path.join(current_app.config['UPLOAD_FOLDER'], unique_filename)
        file.save(filepath)

        document = {
            "bidId":      str(bid_oid),
            "filename":   filename,
            "path":       unique_filename,
            "uploadDate": now_utc(),
            "uploadedBy": user_id,
        }
        db.Documents.insert_one(document)
        document['_id'] = str(document['_id'])
        return jsonify(document), 201

    return jsonify({"msg": "File type not allowed"}), 400


@documents_bp.route('/download/<doc_id>', methods=['GET'])
@jwt_required()
def download_file(doc_id):
    """Download a document by its database ID. Requires the caller to be Admin
    or the assigned employee on the parent bid (closes the SEC-24 IDOR)."""
    doc_oid = require_oid(doc_id)
    if doc_oid is None:
        return jsonify({"msg": "Invalid document id"}), 400

    doc = db.Documents.find_one({"_id": doc_oid})
    if not doc:
        return jsonify({"msg": "Document not found"}), 404

    bid_oid = require_oid(doc.get("bidId"))
    bid = db.Bids.find_one({"_id": bid_oid}) if bid_oid else None

    user_id = get_jwt_identity()
    role    = get_jwt().get('role')
    if not _user_can_access_bid(user_id, role, bid):
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
    """List all documents for a bid. Requires the caller to be Admin or the
    assigned employee (closes the SEC-25 IDOR)."""
    bid_oid = require_oid(bid_id)
    if bid_oid is None:
        return jsonify({"msg": "Invalid bidId"}), 400

    bid = db.Bids.find_one({"_id": bid_oid})
    if not bid:
        return jsonify({"msg": "Bid not found"}), 404

    user_id = get_jwt_identity()
    role    = get_jwt().get('role')
    if not _user_can_access_bid(user_id, role, bid):
        return jsonify({"msg": "Forbidden"}), 403

    docs = list(db.Documents.find({"bidId": str(bid_oid)}))
    for doc in docs:
        doc['_id'] = str(doc['_id'])
    return jsonify(docs), 200
