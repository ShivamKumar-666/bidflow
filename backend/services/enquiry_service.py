import datetime
import secrets
import uuid

import bleach
from bson.objectid import ObjectId
from database import db
from flask import current_app
from utils.auth_helpers import now_utc


def _clean_text(value, max_length=None):
    if not isinstance(value, str):
        return value
    cleaned = bleach.clean(value, strip=True)
    if max_length and len(cleaned) > max_length:
        cleaned = cleaned[:max_length]
    return cleaned


class EnquiryService:
    """Business logic for enquiry management, sharing, and visibility."""

    FIELD_LIMITS = {
        "customerName": 200,
        "contactInformation": 500,
        "productServiceRequired": 500,
        "notes": 5000,
    }

    @classmethod
    def generate_enquiry_id(cls) -> str:
        for _ in range(3):
            token = secrets.token_hex(4)
            enq_id = f"ENQ-{token}"
            if not db.Enquiries.find_one({"enquiryId": enq_id}):
                return enq_id
        return f"ENQ-{secrets.token_hex(6)}"

    @classmethod
    def get_visibility_filter(cls, user_id: str, role: str) -> dict:
        if role == 'Admin':
            return {}
        if role == 'Bidder':
            return {"visibility": "public"}
        if role == 'Company':
            return {"createdBy": user_id}
        if not user_id:
            return {"_id": {"$exists": False}}
        return {"createdBy": user_id}

    @classmethod
    def validate_fields(cls, data: dict) -> str | None:
        customer_name = data.get("customerName")
        contact_information = data.get("contactInformation")
        product_service = data.get("productServiceRequired")

        if not customer_name or not contact_information or not product_service:
            return "customerName, contactInformation, and productServiceRequired are required"

        for field, value, limit in (
            ("customerName", customer_name, 200),
            ("contactInformation", contact_information, 500),
            ("productServiceRequired", product_service, 500),
            ("notes", data.get("notes", ""), 5000),
        ):
            if isinstance(value, str) and len(value) > limit:
                return f"{field} exceeds maximum length of {limit} chars"

        return None

    @classmethod
    def create_enquiry(cls, data: dict, user_id: str) -> dict:
        tags = [t.strip().lower() for t in data.get("tags", []) if isinstance(t, str) and t.strip()]
        industry = data.get("industry", "").strip() if isinstance(data.get("industry"), str) else ""
        if industry and industry.lower() not in tags:
            tags.insert(0, industry.lower())

        new_enquiry = {
            "enquiryId": cls.generate_enquiry_id(),
            "customerName": _clean_text(data.get("customerName"), 200),
            "contactInformation": _clean_text(data.get("contactInformation"), 500),
            "productServiceRequired": _clean_text(data.get("productServiceRequired"), 500),
            "date": now_utc(),
            "priority": data.get("priority", "Medium"),
            "notes": _clean_text(data.get("notes", ""), 5000),
            "tags": tags,
            "status": "Under Review",
            "negotiable": data.get("negotiable", True),
            "visibility": data.get("visibility", "public"),
            "industry": industry or None,
            "createdBy": user_id,
        }

        listing_deadline = data.get("listingDeadline")
        if listing_deadline:
            try:
                if isinstance(listing_deadline, str):
                    listing_deadline = datetime.datetime.fromisoformat(listing_deadline)
                new_enquiry["listingDeadline"] = listing_deadline
            except (TypeError, ValueError):
                pass

        db.Enquiries.insert_one(new_enquiry)
        return new_enquiry

    VALID_STATUSES = {"Under Review", "Shortlisted", "Negotiation", "Rejected", "Order Received", "Quotation Prepared"}

    @classmethod
    def update_enquiry(cls, enq_oid: ObjectId, data: dict) -> tuple:
        ALLOWED_FIELDS = {"customerName", "contactInformation", "productServiceRequired",
                          "priority", "notes", "tags", "status", "negotiable", "visibility", "industry"}
        update_data = {k: v for k, v in data.items() if k in ALLOWED_FIELDS}

        if not update_data:
            return None, "No valid fields to update"

        if "status" in update_data and update_data["status"] not in cls.VALID_STATUSES:
            return None, f"Invalid status. Must be one of: {', '.join(sorted(cls.VALID_STATUSES))}"

        if "tags" in update_data:
            update_data["tags"] = [t.strip().lower() for t in update_data["tags"] if isinstance(t, str) and t.strip()]

        text_fields = {
            "customerName": 200,
            "contactInformation": 500,
            "productServiceRequired": 500,
            "notes": 5000,
        }
        for field, max_len in text_fields.items():
            if field in update_data:
                update_data[field] = _clean_text(update_data[field], max_len)

        result = db.Enquiries.update_one({"_id": enq_oid}, {"$set": update_data})
        if result.matched_count:
            enq = db.Enquiries.find_one({"_id": enq_oid})
            return enq, None
        return None, "Enquiry not found"

    @classmethod
    def delete_enquiry(cls, enq_oid: ObjectId) -> tuple:
        from services import DocumentService, NotificationService

        enq = db.Enquiries.find_one({"_id": enq_oid})
        if not enq:
            return None, "Enquiry not found"

        enquiry_id = enq.get("enquiryId")

        associated_bids = list(db.Bids.find({"enquiryId": enquiry_id}))
        for bid in associated_bids:
            DocumentService.delete_bid_documents(str(bid["_id"]))

        if associated_bids:
            bid_ids = [str(b["_id"]) for b in associated_bids]
            for bid_id in bid_ids:
                NotificationService.delete_by_ref(bid_id)

        db.Bids.delete_many({"enquiryId": enquiry_id})

        DocumentService.delete_enquiry_documents(enquiry_id)

        result = db.Enquiries.delete_one({"_id": enq_oid})
        if result.deleted_count:
            return enq, None
        return None, "Enquiry not found"

    @classmethod
    def generate_share_token(cls, enq_oid: ObjectId) -> tuple:
        token = str(uuid.uuid4())
        now = now_utc()

        result = db.Enquiries.update_one(
            {"_id": enq_oid},
            {"$set": {"shareToken": token, "shareTokenCreatedAt": now}}
        )

        if result.matched_count:
            enq = db.Enquiries.find_one({"_id": enq_oid})
            frontend_url = current_app.config.get('FRONTEND_URL', 'http://localhost:5173')
            return {
                "shareToken": token,
                "shareUrl": f"{frontend_url}/share/{token}",
                "enquiry": enq,
            }, None
        return None, "Enquiry not found"

    @classmethod
    def validate_share_token(cls, token: str) -> tuple:
        enq = db.Enquiries.find_one({"shareToken": token})
        if not enq:
            return None, "Invalid share link"

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
                    return None, "This share link has expired. Links are valid for 90 days."

        return enq, None

    @classmethod
    def get_public_share_data(cls, enq: dict) -> dict:
        bid = db.Bids.find_one({"enquiryId": enq.get("enquiryId")})
        bid_data = None
        docs = list(db.Documents.find({"enquiryId": enq.get("enquiryId")}))

        if bid:
            for doc in db.Documents.find({"bidId": bid.get("bidId")}):
                if not any(d["_id"] == doc["_id"] for d in docs):
                    docs.append(doc)

            bid_data = {
                "bidId": bid.get("bidId"),
                "status": bid.get("status"),
                "submissionDate": bid.get("submissionDate"),
                "remarks": bid.get("remarks", ""),
                "history": bid.get("history", []),
            }
            for h in bid_data["history"]:
                if isinstance(h.get("date"), datetime.datetime):
                    h["date"] = h["date"].isoformat()

        return {
            "enquiry": {
                "enquiryId": enq.get("enquiryId"),
                "customerName": enq.get("customerName"),
                "productServiceRequired": enq.get("productServiceRequired"),
                "date": enq.get("date").isoformat() if isinstance(enq.get("date"), datetime.datetime) else enq.get("date"),
                "status": enq.get("status"),
                "negotiable": enq.get("negotiable", True),
            },
            "bid": bid_data,
            "documents": [{
                "_id": str(doc["_id"]),
                "filename": doc["filename"],
                "uploadDate": doc.get("uploadDate").isoformat() if isinstance(doc.get("uploadDate"), datetime.datetime) else doc.get("uploadDate"),
            } for doc in docs],
        }

    @classmethod
    def get_shared_bid(cls, enq: dict) -> dict | None:
        return db.Bids.find_one({"enquiryId": enq.get("enquiryId")})
