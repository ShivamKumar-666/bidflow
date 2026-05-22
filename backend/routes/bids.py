from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from database import db
from bson.objectid import ObjectId
import datetime
import random
import os
import secrets
import numpy as np
import joblib
from utils import log_audit
from extensions import socketio

# ── Load ML model and encoder ─────────────────────────────────────────────────
model = None
industry_encoder = None
try:
    ml_dir       = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ml')
    model_path   = os.path.join(ml_dir, 'bid_model.pkl')
    encoder_path = os.path.join(ml_dir, 'industry_encoder.pkl')
    if os.path.exists(model_path):
        model = joblib.load(model_path)
    if os.path.exists(encoder_path):
        industry_encoder = joblib.load(encoder_path)
except Exception as e:
    print(f"Warning: Could not load ML model or encoder: {e}")

bids_bp = Blueprint('bids', __name__)


def generate_bid_id():
    """
    Generate a collision-resistant, non-sequential bid ID.
    Format: BID-<8 hex chars>  e.g. BID-3a7f9c2b
    Uses secrets.token_hex so the ID cannot be guessed or enumerated.
    """
    for _ in range(3):   # retry up to 3× in the astronomically unlikely collision case
        token  = secrets.token_hex(4)   # 4 bytes → 8 hex chars → 2^32 combinations
        bid_id = f"BID-{token}"
        if not db.Bids.find_one({"bidId": bid_id}):
            return bid_id
    # Fallback to longer token if all 3 collide (practically impossible)
    return f"BID-{secrets.token_hex(6)}"


def get_computed_win_rate(employee_name: str) -> float:
    """
    Compute an employee's actual historical win rate from real bid outcomes
    in db.Bids — NOT from the user-controlled profile field.

    Terminal statuses:
      - 'Order Received' → won
      - 'Rejected'       → lost

    Returns:
      float in [0.0, 1.0] — 0.5 (neutral) when < 3 terminal bids (cold start).
    """
    if not employee_name:
        return 0.5

    terminal_bids = list(db.Bids.find(
        {
            "assignedEmployee": employee_name,
            "status": {"$in": ["Order Received", "Rejected"]}
        },
        {"status": 1}
    ))

    if len(terminal_bids) < 3:
        # Cold-start: not enough history — use neutral prior
        return 0.5

    won  = sum(1 for b in terminal_bids if b["status"] == "Order Received")
    return round(won / len(terminal_bids), 4)


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
    data   = request.get_json()
    amount = float(data.get("amount", 0))

    # Resolve assigned employee profile for industry fallback
    assigned_employee = data.get("assignedEmployee")
    assigned_user     = None
    if assigned_employee:
        assigned_user = db.Users.find_one({"name": assigned_employee})

    industry = data.get("industry")
    if not industry or industry == "Other":
        if assigned_user and "industry" in assigned_user:
            industry = assigned_user["industry"]
        else:
            industry = "Other"

    # ── Compute win rate from actual bid history (fix #6) ─────────────────────
    employee_win_rate = get_computed_win_rate(assigned_employee)

    if model:
        # Extract features
        days_to_deadline = 30   # default
        try:
            sub_date         = datetime.datetime.strptime(data.get("submissionDate", ""), "%Y-%m-%d")
            days_to_deadline = max(1, (sub_date - datetime.datetime.now()).days)
        except Exception:
            pass

        priority_encoded  = 1   # Medium default
        is_repeat_customer = 1  # default

        industry_encoded = 0
        if industry_encoder:
            try:
                industry_encoded = industry_encoder.transform([industry])[0]
            except Exception:
                industry_encoded = 0

        features         = np.array([[amount, days_to_deadline, priority_encoded,
                                       employee_win_rate, is_repeat_customer, industry_encoded]])
        prediction_prob  = model.predict_proba(features)[0][1]
        prediction       = int(prediction_prob * 100)
    else:
        # Heuristic fallback — still uses computed (real) win rate
        base_prob  = 80 if amount < 10000 else 40
        win_rate_diff = (employee_win_rate * 100) - 50.0
        base_prob += win_rate_diff * 0.4
        prediction = min(99, max(5, int(base_prob + random.randint(-10, 15))))

    new_bid = {
        "bidId":            generate_bid_id(),
        "enquiryId":        data.get("enquiryId"),
        "status":           "Quotation Prepared",
        "amount":           amount,
        "industry":         industry,
        "submissionDate":   data.get("submissionDate"),
        "assignedEmployee": data.get("assignedEmployee"),
        "remarks":          data.get("remarks", ""),
        "aiPrediction":     prediction,
        "comments":         [],
        "history": [{
            "status": "Quotation Prepared",
            "date":   datetime.datetime.utcnow(),
            "note":   "Bid created"
        }]
    }
    db.Bids.insert_one(new_bid)

    # Keep enquiry status in sync
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
    data       = request.get_json()
    new_status = data.get("status")
    note       = data.get("note", "Status updated")

    bid = db.Bids.find_one({"_id": ObjectId(id)})
    if not bid:
        return jsonify({"msg": "Bid not found"}), 404

    history_entry = {
        "status": new_status,
        "date":   datetime.datetime.utcnow(),
        "note":   note
    }

    db.Bids.update_one(
        {"_id": ObjectId(id)},
        {
            "$set":  {"status": new_status},
            "$push": {"history": history_entry}
        }
    )

    # Mirror status on the parent enquiry
    db.Enquiries.update_one(
        {"enquiryId": bid["enquiryId"]},
        {"$set": {"status": new_status}}
    )

    log_audit("UPDATE_BID", f"Updated bid {bid['bidId']} status to {new_status}")

    return jsonify({"msg": "Bid status updated"}), 200


@bids_bp.route('/<id>/comments', methods=['POST'])
@jwt_required()
def add_comment(id):
    data    = request.get_json()
    user_id = get_jwt_identity()
    user    = db.Users.find_one({"_id": ObjectId(user_id)})

    comment = {
        "text":   data.get("text"),
        "author": user.get("name", "Unknown"),
        "date":   datetime.datetime.utcnow()
    }

    db.Bids.update_one({"_id": ObjectId(id)}, {"$push": {"comments": comment}})

    bid = db.Bids.find_one({"_id": ObjectId(id)})
    if bid:
        log_audit("ADD_COMMENT", f"Added comment to bid {bid.get('bidId')}")

    # Emit real-time event
    socketio.emit('new_comment', {
        'bid_id':  id,
        'comment': {
            'text':   comment['text'],
            'author': comment['author'],
            'date':   comment['date'].isoformat()
        }
    })

    return jsonify(comment), 201


@bids_bp.route('/predict', methods=['POST'])
@jwt_required()
def predict_bid():
    """On-the-fly ML prediction endpoint."""
    data = request.get_json()
    if not model:
        return jsonify({"msg": "ML model not loaded"}), 503

    try:
        amount             = float(data.get("amount", 0))
        days_to_deadline   = float(data.get("days_to_deadline", 30))
        priority_encoded   = float(data.get("priority_encoded", 1))
        is_repeat_customer = float(data.get("is_repeat_customer", 1))

        # ── Win rate: compute from actual bid history (fix #6) ────────────────
        current_user_id = get_jwt_identity()
        current_user    = db.Users.find_one({"_id": ObjectId(current_user_id)})
        current_name    = current_user.get("name", "") if current_user else ""

        # Allow explicit override (e.g. predicting for another employee)
        override_name = data.get("assignedEmployee", current_name)
        employee_win_rate = get_computed_win_rate(override_name)

        # Industry: explicit > user profile > default
        req_industry = data.get("industry")
        if not req_industry or req_industry == "Other":
            if current_user and "industry" in current_user:
                industry = current_user["industry"]
            else:
                industry = "Other"
        else:
            industry = req_industry

        industry_encoded = 0
        if industry_encoder:
            try:
                industry_encoded = industry_encoder.transform([industry])[0]
            except Exception:
                pass

        features    = np.array([[amount, days_to_deadline, priority_encoded,
                                  employee_win_rate, is_repeat_customer, industry_encoded]])
        probability = model.predict_proba(features)[0][1]

        return jsonify({
            "win_probability":      round(probability * 100, 1),
            "computed_win_rate_pct": round(employee_win_rate * 100, 1)
        }), 200

    except Exception as e:
        return jsonify({"msg": f"Prediction error: {str(e)}"}), 400
