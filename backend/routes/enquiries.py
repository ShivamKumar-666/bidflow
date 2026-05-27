from flask import Blueprint, request, jsonify, current_app, send_from_directory
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from database import db
from bson.objectid import ObjectId
import datetime
import secrets
import uuid
from utils import log_audit

enquiries_bp = Blueprint('enquiries', __name__)

def generate_enquiry_id():
    """
    Non-sequential, collision-resistant enquiry ID.
    Format: ENQ-<8 hex chars>  e.g. ENQ-a4c82d1f
    """
    for _ in range(3):
        token     = secrets.token_hex(4)
        enq_id    = f"ENQ-{token}"
        if not db.Enquiries.find_one({"enquiryId": enq_id}):
            return enq_id
    return f"ENQ-{secrets.token_hex(6)}"

@enquiries_bp.route('/', methods=['GET'])
@jwt_required()
def get_enquiries():
    enquiries = list(db.Enquiries.find({}))
    for enq in enquiries:
        enq['_id'] = str(enq['_id'])
    return jsonify(enquiries), 200

@enquiries_bp.route('/', methods=['POST'])
@jwt_required()
def create_enquiry():
    data = request.get_json()
    
    # Process and sanitize tags array
    tags = [t.strip().lower() for t in data.get("tags", []) if isinstance(t, str) and t.strip()]
    
    new_enquiry = {
        "enquiryId": generate_enquiry_id(),
        "customerName": data.get("customerName"),
        "contactInformation": data.get("contactInformation"),
        "productServiceRequired": data.get("productServiceRequired"),
        "date": datetime.datetime.utcnow(),
        "priority": data.get("priority", "Medium"),
        "notes": data.get("notes", ""),
        "tags": tags,
        "status": "Under Review"
    }
    db.Enquiries.insert_one(new_enquiry)
    log_audit("CREATE_ENQUIRY", f"Created enquiry {new_enquiry['enquiryId']}")
    new_enquiry['_id'] = str(new_enquiry['_id'])
    return jsonify(new_enquiry), 201

@enquiries_bp.route('/<id>', methods=['PUT'])
@jwt_required()
def update_enquiry(id):
    data = request.get_json()
    
    # Process and sanitize tags if updating them
    if "tags" in data:
        data["tags"] = [t.strip().lower() for t in data["tags"] if isinstance(t, str) and t.strip()]
        
    result = db.Enquiries.update_one({"_id": ObjectId(id)}, {"$set": data})
    if result.matched_count:
        enq = db.Enquiries.find_one({"_id": ObjectId(id)})
        if enq:
            log_audit("UPDATE_ENQUIRY", f"Updated enquiry {enq['enquiryId']}")
        return jsonify({"msg": "Enquiry updated"}), 200
    return jsonify({"msg": "Enquiry not found"}), 404

@enquiries_bp.route('/<id>', methods=['DELETE'])
@jwt_required()
def delete_enquiry(id):
    claims = get_jwt()
    if claims.get('role') != 'Admin':
        return jsonify({"msg": "Admin access required"}), 403
    
    enq = db.Enquiries.find_one({"_id": ObjectId(id)})
    
    result = db.Enquiries.delete_one({"_id": ObjectId(id)})
    if result.deleted_count:
        if enq:
            log_audit("DELETE_ENQUIRY", f"Deleted enquiry {enq.get('enquiryId')}")
        return jsonify({"msg": "Enquiry deleted"}), 200
    return jsonify({"msg": "Enquiry not found"}), 404


@enquiries_bp.route('/<id>/share', methods=['POST'])
@jwt_required()
def generate_share_token(id):
    """Generate a 90-day public sharing token for an enquiry."""
    try:
        token = str(uuid.uuid4())
        now = datetime.datetime.utcnow()
        
        result = db.Enquiries.update_one(
            {"_id": ObjectId(id)},
            {"$set": {"shareToken": token, "shareTokenCreatedAt": now}}
        )
        
        if result.matched_count:
            # Audit log the link generation
            enq = db.Enquiries.find_one({"_id": ObjectId(id)})
            if enq:
                log_audit("GENERATE_SHARE_LINK", f"Generated public share link for enquiry {enq.get('enquiryId')}")
                
            return jsonify({
                "shareToken": token,
                "shareUrl": f"http://localhost:5173/share/{token}"
            }), 200
        return jsonify({"msg": "Enquiry not found"}), 404
    except Exception as e:
        return jsonify({"msg": f"Error generating share token: {str(e)}"}), 500


@enquiries_bp.route('/public/share/<token>', methods=['GET'])
def get_public_share(token):
    """Fetch public status page details for a shared enquiry token."""
    try:
        enq = db.Enquiries.find_one({"shareToken": token})
        if not enq:
            return jsonify({"msg": "Invalid share link"}), 404
            
        # Check token expiry (90 days)
        created_at = enq.get("shareTokenCreatedAt")
        if created_at:
            if isinstance(created_at, str):
                try:
                    created_at = datetime.datetime.fromisoformat(created_at)
                except:
                    pass
            now = datetime.datetime.utcnow()
            age = now - created_at
            if age.days >= 90:
                return jsonify({"msg": "This share link has expired. Links are valid for 90 days."}), 403
                
        # Find associated active bid
        bid = db.Bids.find_one({"enquiryId": enq.get("enquiryId")})
        bid_data = None
        docs = []
        
        if bid:
            # Fetch uploaded documents for the bid
            documents = list(db.Documents.find({"bidId": bid.get("bidId")}))
            for doc in documents:
                docs.append({
                    "_id": str(doc["_id"]),
                    "filename": doc["filename"],
                    "uploadDate": doc.get("uploadDate").isoformat() if isinstance(doc.get("uploadDate"), datetime.datetime) else doc.get("uploadDate")
                })
                
            bid_data = {
                "bidId": bid.get("bidId"),
                "status": bid.get("status"),
                "submissionDate": bid.get("submissionDate"),
                "remarks": bid.get("remarks", ""),
                "history": bid.get("history", [])
            }
            # Convert dates to ISO format
            for h in bid_data["history"]:
                if isinstance(h.get("date"), datetime.datetime):
                    h["date"] = h["date"].isoformat()
                    
        public_data = {
            "enquiry": {
                "enquiryId": enq.get("enquiryId"),
                "customerName": enq.get("customerName"),
                "productServiceRequired": enq.get("productServiceRequired"),
                "date": enq.get("date").isoformat() if isinstance(enq.get("date"), datetime.datetime) else enq.get("date"),
                "status": enq.get("status")
            },
            "bid": bid_data,
            "documents": docs
        }
        
        return jsonify(public_data), 200
    except Exception as e:
        return jsonify({"msg": f"Error loading customer portal data: {str(e)}"}), 500


@enquiries_bp.route('/public/share/<token>/download/<doc_id>', methods=['GET'])
def download_public_share_file(token, doc_id):
    """Download a file associated with the public shared enquiry without logging in."""
    try:
        enq = db.Enquiries.find_one({"shareToken": token})
        if not enq:
            return jsonify({"msg": "Invalid share link"}), 404
            
        # Check token expiry (90 days)
        created_at = enq.get("shareTokenCreatedAt")
        if created_at:
            if isinstance(created_at, str):
                try:
                    created_at = datetime.datetime.fromisoformat(created_at)
                except:
                    pass
            now = datetime.datetime.utcnow()
            age = now - created_at
            if age.days >= 90:
                return jsonify({"msg": "This share link has expired. Links are valid for 90 days."}), 403
                
        bid = db.Bids.find_one({"enquiryId": enq.get("enquiryId")})
        if not bid:
            return jsonify({"msg": "Associated bid not found"}), 404
            
        doc = db.Documents.find_one({"_id": ObjectId(doc_id), "bidId": bid.get("bidId")})
        if not doc:
            return jsonify({"msg": "Document not found or unauthorized access"}), 404
            
        return send_from_directory(current_app.config['UPLOAD_FOLDER'], doc["path"], as_attachment=True, download_name=doc["filename"])
    except Exception as e:
        return jsonify({"msg": f"Error downloading document: {str(e)}"}), 500
