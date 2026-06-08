import os

from bson.objectid import ObjectId
from database import db
from flask import current_app
from utils.auth_helpers import now_utc
from werkzeug.utils import secure_filename


class DocumentService:
    """Business logic for document upload, download, and access control."""

    ALLOWED_EXTENSIONS = {'txt', 'pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx', 'xls', 'xlsx'}

    ALLOWED_MIMES = {
        "application/pdf",
        "text/plain",
        "image/png",
        "image/jpeg",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }

    MAX_FILE_BYTES = 16 * 1024 * 1024

    @classmethod
    def allowed_file(cls, filename: str) -> bool:
        return '.' in filename and filename.rsplit('.', 1)[1].lower() in cls.ALLOWED_EXTENSIONS

    @classmethod
    def check_user_bid_access(cls, user_id: str, role: str, bid: dict) -> bool:
        if role == 'Admin':
            return True
        if not bid or not user_id:
            return False
        user = db.Users.find_one({"_id": ObjectId(user_id)}, {"name": 1})
        return bool(user and user.get('name') == bid.get('assignedEmployee'))

    @classmethod
    def validate_file(cls, file) -> tuple:
        if not file or file.filename == '':
            return None, "No file selected"

        if not cls.allowed_file(file.filename):
            return None, "File type not allowed"

        file.seek(0, os.SEEK_END)
        size = file.tell()
        file.seek(0)
        if size > cls.MAX_FILE_BYTES:
            return None, "File too large (max 16 MB)"

        if file.content_type and file.content_type not in cls.ALLOWED_MIMES:
            return None, "File type not allowed"

        return file, None

    @classmethod
    def upload_document(cls, file, bid_id: str, user_id: str) -> tuple:
        bid_oid = ObjectId(bid_id) if ObjectId.is_valid(bid_id) else None
        if not bid_oid:
            return None, "Invalid bidId"

        bid = db.Bids.find_one({"_id": bid_oid})
        if not bid:
            return None, "Bid not found"

        filename = secure_filename(file.filename)
        unique_filename = f"{now_utc().timestamp()}_{filename}"
        filepath = os.path.join(current_app.config['UPLOAD_FOLDER'], unique_filename)
        file.save(filepath)

        document = {
            "bidId": str(bid_oid),
            "filename": filename,
            "path": unique_filename,
            "uploadDate": now_utc(),
            "uploadedBy": user_id,
        }
        db.Documents.insert_one(document)
        return document, None

    @classmethod
    def get_document(cls, doc_id: str) -> dict | None:
        doc_oid = ObjectId(doc_id) if ObjectId.is_valid(doc_id) else None
        if not doc_oid:
            return None
        return db.Documents.find_one({"_id": doc_oid})

    @classmethod
    def get_bid_documents(cls, bid_id: str) -> list:
        docs = list(db.Documents.find({"bidId": str(bid_id)}))
        for doc in docs:
            doc['_id'] = str(doc['_id'])
        return docs

    @classmethod
    def delete_bid_documents(cls, bid_id: str) -> int:
        result = db.Documents.delete_many({"bidId": bid_id})
        return result.deleted_count
