from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from database import db
from bson.objectid import ObjectId
import datetime
import random
from utils import log_audit

bids_bp = Blueprint('bids', __name__)

def generate_bid_id():
    count = db.Bids.count_documents({})
    return f"BID{str(count + 1).zfill(3)}"

@bids_bp.route('/', methods=['GET'])
@jwt_required()
def get_bids():
    bids = list(db.Bids.find({}))
    for bid in bids:
        bid['_id'] = str(bid['_id'])
    return jsonify(bids), 200

@bids_bp.route('/', methods=['POST'])
@jwt_required()
def create_bid():
    data = request.get_json()
    amount = float(data.get("amount", 0))
    # AI prediction logic (mock heuristic)
    base_prob = 80 if amount < 10000 else 40
    prediction = min(99, max(5, base_prob + random.randint(-10, 15)))
    
    new_bid = {
        "bidId": generate_bid_id(),
        "enquiryId": data.get("enquiryId"),
        "status": "Quotation Prepared",
        "amount": data.get("amount"),
        "submissionDate": data.get("submissionDate"),
        "assignedEmployee": data.get("assignedEmployee"),
        "remarks": data.get("remarks", ""),
        "aiPrediction": prediction,
        "comments": [],
        "history": [{
            "status": "Quotation Prepared",
            "date": datetime.datetime.utcnow(),
            "note": "Bid created"
        }]
    }
    db.Bids.insert_one(new_bid)
    
    # Update enquiry status
    db.Enquiries.update_one(
        {"enquiryId": new_bid["enquiryId"]},
        {"$set": {"status": "Quotation Prepared"}}
    )
    
    log_audit("CREATE_BID", f"Created bid {new_bid['bidId']} for enquiry {new_bid['enquiryId']}")
    
    new_bid['_id'] = str(new_bid['_id'])
    return jsonify(new_bid), 201

@bids_bp.route('/<id>/status', methods=['PUT'])
@jwt_required()
def update_bid_status(id):
    data = request.get_json()
    new_status = data.get("status")
    note = data.get("note", "Status updated")
    
    bid = db.Bids.find_one({"_id": ObjectId(id)})
    if not bid:
        return jsonify({"msg": "Bid not found"}), 404
        
    history_entry = {
        "status": new_status,
        "date": datetime.datetime.utcnow(),
        "note": note
    }
    
    db.Bids.update_one(
        {"_id": ObjectId(id)},
        {
            "$set": {"status": new_status},
            "$push": {"history": history_entry}
        }
    )
    
    # Also update the enquiry status if it corresponds to the same flow
    db.Enquiries.update_one(
        {"enquiryId": bid["enquiryId"]},
        {"$set": {"status": new_status}}
    )
    
    log_audit("UPDATE_BID", f"Updated bid {bid['bidId']} status to {new_status}")
    
    return jsonify({"msg": "Bid status updated"}), 200

@bids_bp.route('/<id>/comments', methods=['POST'])
@jwt_required()
def add_comment(id):
    data = request.get_json()
    user_id = get_jwt_identity()
    user = db.Users.find_one({"_id": ObjectId(user_id)})
    
    comment = {
        "text": data.get("text"),
        "author": user.get("name", "Unknown"),
        "date": datetime.datetime.utcnow()
    }
    
    db.Bids.update_one(
        {"_id": ObjectId(id)},
        {"$push": {"comments": comment}}
    )
    
    bid = db.Bids.find_one({"_id": ObjectId(id)})
    if bid:
        log_audit("ADD_COMMENT", f"Added comment to bid {bid.get('bidId')}")
    
    return jsonify(comment), 201
