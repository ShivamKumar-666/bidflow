from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from database import db
from bson.objectid import ObjectId
import datetime
from utils import log_audit

enquiries_bp = Blueprint('enquiries', __name__)

def generate_enquiry_id():
    count = db.Enquiries.count_documents({})
    return f"ENQ{str(count + 1).zfill(3)}"

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
    new_enquiry = {
        "enquiryId": generate_enquiry_id(),
        "customerName": data.get("customerName"),
        "contactInformation": data.get("contactInformation"),
        "productServiceRequired": data.get("productServiceRequired"),
        "date": datetime.datetime.utcnow(),
        "priority": data.get("priority", "Medium"),
        "notes": data.get("notes", ""),
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
