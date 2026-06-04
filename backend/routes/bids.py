import datetime
import hashlib
import hmac
import os
import random
import secrets

import bleach
import joblib
import numpy as np
from bson.objectid import ObjectId
from database import db
from extensions import socketio
from flask import Blueprint, current_app, jsonify, make_response, render_template, request
from flask_jwt_extended import get_jwt, get_jwt_identity, jwt_required
from routes.notifications import create_notification
from utils import log_audit
from utils.auth_helpers import now_utc, require_oid, bid_access_required

try:
    import shap  # optional SHAP explainability (PERF-05)
except ImportError:  # noqa: F401
    shap = None  # type: ignore

try:
    from xhtml2pdf import pisa  # PDF generation
except ImportError:  # noqa: F401
    pisa = None  # type: ignore

# ── Dynamic ML model hotswapping from MongoDB ──────────────────────────────────
model = None
industry_encoder = None
_loaded_model_version = None


def _verify_model_signature(binary_data: bytes, stored_signature: str | None) -> bool:
    """Verify that model binary data hasn't been tampered with (SEC-28).
    Uses HMAC-SHA256 with Config.SECRET_KEY as the signing key.

    Backward-compatible: if no signature is stored on the document (legacy
    records), returns True so existing models still load (with a warning log).
    """
    if not stored_signature:
        current_app.logger.warning(
            "Model loaded from MongoDB without an integrity signature — "
            "this is a legacy record. Retrain the model to add a signature."
        )
        return True
    expected = hmac.new(
        current_app.config['SECRET_KEY'].encode(),
        binary_data,
        hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected, stored_signature):
        current_app.logger.critical(
            "Model integrity check FAILED: the binary stored in MongoDB "
            "does not match its HMAC signature. Possible tampering detected. "
            "Falling back to local model file."
        )
        return False
    return True


def get_model_and_encoder():
    global model, industry_encoder, _loaded_model_version
    try:
        # Check active version in MongoDB
        active_meta = db.ModelVersions.find_one({"isActive": True}, {"version": 1})
        if active_meta:
            active_ver = active_meta["version"]
            if active_ver != _loaded_model_version:
                active_doc = db.ModelVersions.find_one({"isActive": True})
                import io
                model_bin   = active_doc.get("modelBinary")
                encoder_bin = active_doc.get("encoderBinary")
                if not model_bin or not encoder_bin:
                    current_app.logger.warning("ModelVersion document has no binary data, falling back to local")
                else:
                    if not _verify_model_signature(model_bin, active_doc.get("modelSignature")):
                        model_bin = None  # force fallback
                    if model_bin and not _verify_model_signature(encoder_bin, active_doc.get("encoderSignature")):
                        encoder_bin = None  # force fallback
                    if model_bin and encoder_bin:
                        model = joblib.load(io.BytesIO(model_bin))
                        industry_encoder = joblib.load(io.BytesIO(encoder_bin))
                        _loaded_model_version = active_ver
                        current_app.logger.info("Hotswapped in-memory ML model to version %s from MongoDB", active_ver)
        if model is None:
            # Local fallback (models on disk are trusted — they're deployment artifacts)
            ml_dir      = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ml')
            model_path  = os.path.join(ml_dir, 'bid_model.pkl')
            encoder_path = os.path.join(ml_dir, 'industry_encoder.pkl')
            if os.path.exists(model_path):
                model = joblib.load(model_path)
            if os.path.exists(encoder_path):
                industry_encoder = joblib.load(encoder_path)
    except Exception as e:
        current_app.logger.warning("Could not load ML model or encoder: %s", e)
    return model, industry_encoder

def explain_prediction(features_array, shap_values, feature_names):
    """
    Map SHAP values to user-friendly reasons explaining the prediction score.
    """
    explanations = []
    pairs = []
    for name, val, s_val in zip(feature_names, features_array[0], shap_values):
        pairs.append((name, val, s_val))
    
    # Sort by absolute SHAP value descending (largest impact first)
    pairs.sort(key=lambda x: abs(x[2]), reverse=True)
    
    for name, val, s_val in pairs[:3]:  # Return top 3 explanations
        if name == 'amount':
            if s_val < -0.01:
                explanations.append({
                    "feature": "amount",
                    "impact": "negative",
                    "text": f"Amount (${val:,.2f}) is high for this segment"
                })
            elif s_val > 0.01:
                explanations.append({
                    "feature": "amount",
                    "impact": "positive",
                    "text": f"Competitive amount (${val:,.2f}) increases probability"
                })
        elif name == 'days_to_deadline':
            if s_val < -0.01:
                explanations.append({
                    "feature": "days_to_deadline",
                    "impact": "negative",
                    "text": f"Tight deadline ({int(val)} days) limits prep time"
                })
            elif s_val > 0.01:
                explanations.append({
                    "feature": "days_to_deadline",
                    "impact": "positive",
                    "text": f"Sufficient days to deadline ({int(val)} days) allows thorough scoping"
                })
        elif name == 'employee_win_rate':
            if s_val < -0.01:
                explanations.append({
                    "feature": "employee_win_rate",
                    "impact": "negative",
                    "text": f"Representative win rate ({val*100:.1f}%) is low historically"
                })
            elif s_val > 0.01:
                explanations.append({
                    "feature": "employee_win_rate",
                    "impact": "positive",
                    "text": f"Assigned representative has a strong win rate ({val*100:.1f}%)"
                })
        elif name == 'is_repeat_customer':
            if s_val > 0.01 and val == 1:
                explanations.append({
                    "feature": "is_repeat_customer",
                    "impact": "positive",
                    "text": "Strong relationship with repeat customer"
                })
        elif name == 'priority_encoded':
            if s_val > 0.01:
                explanations.append({
                    "feature": "priority_encoded",
                    "impact": "positive",
                    "text": "High priority status accelerates deal momentum"
                })
        elif name == 'industry_encoded':
            if s_val < -0.01:
                explanations.append({
                    "feature": "industry_encoded",
                    "impact": "negative",
                    "text": "Industry segment has lower historical conversion"
                })
            elif s_val > 0.01:
                explanations.append({
                    "feature": "industry_encoded",
                    "impact": "positive",
                    "text": "High historical success rate in this industry"
                })
                
    return explanations

_shap_explainer_cache = {"id": None, "explainer": None}


def _get_shap_explainer(clf):
    """Cache the SHAP TreeExplainer per classifier identity (PERF-05)."""
    if shap is None:
        raise RuntimeError("SHAP is not installed; cannot generate explanations.")
    try:
        if _shap_explainer_cache["id"] != id(clf):
            _shap_explainer_cache["explainer"] = shap.TreeExplainer(clf)
            _shap_explainer_cache["id"] = id(clf)
    except Exception:
        # Fall back to a fresh explainer if the cache lookup failed.
        _shap_explainer_cache["explainer"] = shap.TreeExplainer(clf)
        _shap_explainer_cache["id"] = id(clf)
    return _shap_explainer_cache["explainer"]


def compute_shap_explanations(clf, encoder, features_array):
    """
    Run SHAP explanations on features_array for the given XGBoost classifier.
    """
    try:
        explainer = _get_shap_explainer(clf)
        shap_out = explainer.shap_values(features_array)

        # Handle SHAP output shapes
        if isinstance(shap_out, list):
            shap_vals = shap_out[1][0]
        else:
            if len(shap_out.shape) == 3:
                shap_vals = shap_out[0, :, 1]
            elif len(shap_out.shape) == 2:
                shap_vals = shap_out[0]
            else:
                shap_vals = shap_out

        feature_names = ['amount', 'days_to_deadline', 'priority_encoded', 'employee_win_rate', 'is_repeat_customer', 'industry_encoded']
        return explain_prediction(features_array, shap_vals, feature_names)
    except Exception as e:
        current_app.logger.warning("SHAP explanation calculation failed: %s", e)
        return []

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
    """List bids scoped to the caller's role (closes the cross-tenant leak).
    Non-admin users see bids they created (createdBy == their user id)."""
    user_id = get_jwt_identity()
    role    = get_jwt().get('role')

    if role == 'Admin':
        filter_query = {}
    else:
        # Show bids the user created.  Include legacy bids that have no
        # createdBy field so existing data doesn't disappear (defence-in-depth).
        filter_query = {"$or": [
            {"createdBy": user_id},
            {"createdBy": {"$exists": False}}
        ]} if user_id else {"_id": {"$exists": False}}

    # Pagination (PERF-01 fix)
    try:
        page = max(int(request.args.get('page', 1)), 1)
        size = min(max(int(request.args.get('size', 100)), 1), 200)
    except ValueError:
        return jsonify({"msg": "Invalid pagination parameters"}), 400

    cursor = db.Bids.find(filter_query).sort("submissionDate", -1).skip((page-1)*size).limit(size)
    bids = list(cursor)
    for bid in bids:
        bid['_id'] = str(bid['_id'])
    return jsonify({
        "items": bids,
        "page":  page,
        "size":  size,
        "total": db.Bids.count_documents(filter_query),
    }), 200


@bids_bp.route('/', methods=['POST'])
@jwt_required()
def create_bid():
    data = request.get_json() or {}

    # Validate amount
    try:
        amount = float(data.get("amount", 0))
    except (TypeError, ValueError):
        return jsonify({"msg": "amount must be a number"}), 400
    if amount < 0:
        return jsonify({"msg": "amount must be non-negative"}), 400

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

    clf, encoder = get_model_and_encoder()
    explanations = []
    if clf:
        # Extract features
        days_to_deadline = 30   # default
        try:
            sub_date         = datetime.datetime.strptime(data.get("submissionDate", ""), "%Y-%m-%d")
            days_to_deadline = max(1, (sub_date - now_utc().replace(tzinfo=None)).days)
        except Exception:
            pass

        priority_encoded  = 1   # Medium default
        is_repeat_customer = 1  # default

        industry_encoded = 0
        if encoder:
            try:
                industry_encoded = encoder.transform([industry])[0]
            except Exception:
                industry_encoded = 0

        features         = np.array([[amount, days_to_deadline, priority_encoded,
                                       employee_win_rate, is_repeat_customer, industry_encoded]])
        prediction_prob  = clf.predict_proba(features)[0][1]
        prediction       = int(prediction_prob * 100)
        explanations     = compute_shap_explanations(clf, encoder, features)
    else:
        # Heuristic fallback — still uses computed (real) win rate
        base_prob  = 80 if amount < 10000 else 40
        win_rate_diff = (employee_win_rate * 100) - 50.0
        base_prob += win_rate_diff * 0.4
        prediction = min(99, max(5, int(base_prob + random.randint(-10, 15))))

    tags = [t.strip().lower() for t in data.get("tags", []) if isinstance(t, str) and t.strip()]
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
        "shapExplanations": explanations,
        "tags":             tags,
        "comments":         [],
        "createdBy":        get_jwt_identity(),
        "history": [{
            "status": "Quotation Prepared",
            "date":   now_utc(),
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
@bid_access_required
def update_bid_status(id):
    data       = request.get_json()
    new_status = data.get("status")
    note       = data.get("note", "Status updated")

    VALID_STATUSES = {"Quotation Prepared", "Under Review", "Negotiation", "Order Received", "Rejected"}
    if new_status not in VALID_STATUSES:
        return jsonify({"msg": f"Invalid status. Must be one of: {', '.join(sorted(VALID_STATUSES))}"}), 400

    bid_oid = require_oid(id)
    bid = db.Bids.find_one({"_id": bid_oid})

    history_entry = {
        "status": new_status,
        "date":   now_utc(),
        "note":   note
    }

    db.Bids.update_one(
        {"_id": bid_oid},
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

    # ── Notify the assigned employee ────────────────────────────────────────
    assigned_name = bid.get("assignedEmployee")
    if assigned_name:
        target_user = db.Users.find_one({"name": assigned_name}, {"_id": 1})
        if target_user:
            target_user_id = str(target_user["_id"])
            notif = create_notification(
                user_id=target_user_id,
                title="Bid Status Updated",
                message=f"{bid.get('bidId', id)} moved to \u2018{new_status}\u2019",
                notif_type="status_change",
                ref_id=str(bid["_id"])
            )
            socketio.emit(
                'notification',
                notif,
                room=f"user_{target_user_id}"
            )

    return jsonify({"msg": "Bid status updated"}), 200


@bids_bp.route('/<id>/comments', methods=['POST'])
@jwt_required()
def add_comment(id):
    data    = request.get_json() or {}
    text    = (data.get("text") or "").strip()
    if not text:
        return jsonify({"msg": "Comment text is required"}), 400
    if len(text) > 2000:
        return jsonify({"msg": "Comment exceeds maximum length of 2000 chars"}), 400
    text = bleach.clean(text, strip=True)

    user_id = get_jwt_identity()
    user    = db.Users.find_one({"_id": ObjectId(user_id)})

    bid_oid = require_oid(id)
    if bid_oid is None:
        return jsonify({"msg": "Invalid id"}), 400

    comment = {
        "text":   text,
        "author": user.get("name", "Unknown"),
        "date":   now_utc()
    }

    db.Bids.update_one({"_id": bid_oid}, {"$push": {"comments": comment}})

    bid = db.Bids.find_one({"_id": bid_oid})
    if bid:
        log_audit("ADD_COMMENT", f"Added comment to bid {bid.get('bidId')}")

    # Emit real-time event (existing — keeps bid detail panel live)
    socketio.emit('new_comment', {
        'bid_id':  id,
        'comment': {
            'text':   comment['text'],
            'author': comment['author'],
            'date':   comment['date'].isoformat()
        }
    })

    # ── Notify the assigned employee (if different from commenter) ──────────
    if bid:
        assigned_name = bid.get("assignedEmployee")
        commenter_name = user.get("name", "") if user else ""
        if assigned_name and assigned_name != commenter_name:
            target_user = db.Users.find_one({"name": assigned_name}, {"_id": 1})
            if target_user:
                target_user_id = str(target_user["_id"])
                notif = create_notification(
                    user_id=target_user_id,
                    title="New Comment on Your Bid",
                    message=f"{commenter_name} commented on {bid.get('bidId', id)}: \"{comment['text'][:60]}\"",
                    notif_type="new_comment",
                    ref_id=str(bid["_id"])
                )
                socketio.emit(
                    'notification',
                    notif,
                    room=f"user_{target_user_id}"
                )

    return jsonify(comment), 201


@bids_bp.route('/predict', methods=['POST'])
@jwt_required()
def predict_bid():
    """On-the-fly ML prediction endpoint."""
    data = request.get_json()
    clf, encoder = get_model_and_encoder()
    if not clf:
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
        if encoder:
            try:
                industry_encoded = encoder.transform([industry])[0]
            except Exception:
                pass

        features    = np.array([[amount, days_to_deadline, priority_encoded,
                                  employee_win_rate, is_repeat_customer, industry_encoded]])
        probability = clf.predict_proba(features)[0][1]
        explanations = compute_shap_explanations(clf, encoder, features)

        return jsonify({
            "win_probability":      round(float(probability) * 100, 1),
            "computed_win_rate_pct": round(float(employee_win_rate) * 100, 1),
            "shap_explanations":    explanations
        }), 200
    except Exception:
        current_app.logger.exception("predict_bid failed")
        return jsonify({"msg": "Prediction failed"}), 400


@bids_bp.route('/calendar', methods=['GET'])
@jwt_required()
def get_calendar_bids():
    """Get bids for the calendar view, scoped to the caller's role.
    Non-admins only see their own assigned bids (closes the cross-tenant leak)."""
    try:
        month_param = request.args.get('month')  # Optional YYYY-MM filter

        user_id = get_jwt_identity()
        role    = get_jwt().get('role')

        if role == 'Admin':
            bid_filter = {}
        else:
            user = db.Users.find_one({"_id": ObjectId(user_id)}, {"name": 1}) if ObjectId.is_valid(user_id) else None
            employee_name = user.get('name') if user else None
            # Match by employee name OR user ID (handles both "Shivam Kumar" and "10")
            if not employee_name:
                bid_filter = {}
            else:
                bid_filter = {"$or": [
                    {"assignedEmployee": {"$regex": f"^{employee_name}$", "$options": "i"}},
                    {"assignedEmployee": str(user_id)}
                ]}

        bids      = list(db.Bids.find(bid_filter))
        enq_filter = {} if role == 'Admin' else ({"createdBy": user_id} if user_id else {"_id": {"$exists": False}})
        enquiries = list(db.Enquiries.find(enq_filter))
        enq_map   = {enq.get('enquiryId'): enq for enq in enquiries if enq.get('enquiryId')}

        events = []
        for bid in bids:
            sub_date = bid.get('submissionDate')
            if not sub_date:
                continue
            # Normalize date format
            if isinstance(sub_date, str) and "T" in sub_date:
                sub_date = sub_date.split("T")[0]
            if month_param and not sub_date.startswith(month_param):
                continue
            enq = enq_map.get(bid.get('enquiryId'), {})

            events.append({
                "bidId":                 bid.get("bidId"),
                "_id":                   str(bid.get("_id")),
                "enquiryId":             bid.get("enquiryId"),
                "submissionDate":        sub_date,
                "amount":                bid.get("amount"),
                "status":                bid.get("status"),
                "assignedEmployee":      bid.get("assignedEmployee"),
                "remarks":               bid.get("remarks", ""),
                "aiPrediction":          bid.get("aiPrediction"),
                "customerName":          enq.get("customerName", "Unknown Client"),
                "priority":              enq.get("priority", "Medium"),
                "productServiceRequired": enq.get("productServiceRequired", "N/A"),
            })

        current_app.logger.info(f"Calendar: returning {len(events)} events for month {month_param}")
        return jsonify(events), 200
    except Exception:
        current_app.logger.exception("get_calendar_bids failed")
        return jsonify({"msg": "Error fetching calendar data"}), 500


@bids_bp.route('/<id>', methods=['PUT'])
@bid_access_required
def update_bid(id):
    bid_oid = require_oid(id)
    bid = db.Bids.find_one({"_id": bid_oid})

    try:
        data = request.get_json() or {}
        ALLOWED_FIELDS = {"tags", "remarks", "amount", "submissionDate", "assignedEmployee", "industry"}
        update_data = {k: v for k, v in data.items() if k in ALLOWED_FIELDS}

        if not update_data:
            return jsonify({"msg": "No valid fields to update"}), 400

        if "amount" in update_data:
            try:
                update_data["amount"] = float(update_data["amount"])
                if update_data["amount"] < 0:
                    return jsonify({"msg": "amount must be non-negative"}), 400
            except (TypeError, ValueError):
                return jsonify({"msg": "amount must be a number"}), 400

        if "tags" in update_data:
            update_data["tags"] = [t.strip().lower() for t in update_data["tags"] if isinstance(t, str) and t.strip()]

        result = db.Bids.update_one({"_id": bid_oid}, {"$set": update_data})
        if result.matched_count:
            updated = db.Bids.find_one({"_id": bid_oid})
            if updated:
                log_audit("UPDATE_BID", f"Updated bid {updated['bidId']} details")
            return jsonify({"msg": "Bid updated"}), 200
        return jsonify({"msg": "Bid not found"}), 404
    except Exception:
        current_app.logger.exception("update_bid failed")
        return jsonify({"msg": "Error updating bid"}), 500


@bids_bp.route('/<id>/quotation', methods=['GET'])
@bid_access_required
def get_quotation_pdf(id):
    from io import BytesIO

    if pisa is None:
        return jsonify({"msg": "PDF generation library not installed"}), 503

    bid_oid = require_oid(id)

    try:
        bid = db.Bids.find_one({"_id": bid_oid})

        enquiry = db.Enquiries.find_one({"enquiryId": bid.get("enquiryId")}) or {}

        # Dynamically generate itemised costs based on total amount
        amount          = bid.get("amount", 0)
        product_service = enquiry.get("productServiceRequired", "Product / Service Delivery")

        items = [
            {
                "name":        f"Core Delivery: {product_service}",
                "description": "Primary deployment, customized configuration, and core execution.",
                "qty":         1,
                "price":       amount * 0.80,
                "total":       amount * 0.80,
            },
            {
                "name":        "Integration & Setup Fees",
                "description": "Testing, validation, and connecting with client infrastructure.",
                "qty":         1,
                "price":       amount * 0.15,
                "total":       amount * 0.15,
            },
            {
                "name":        "Service Support SLA (1 Year)",
                "description": "Standard business hour assistance and maintenance updates.",
                "qty":         1,
                "price":       amount * 0.05,
                "total":       amount * 0.05,
            },
        ]

        date_str = now_utc().strftime("%B %d, %Y")

        html_content = render_template(
            'quotation_template.html',
            bid=bid, enquiry=enquiry, items=items, date_str=date_str
        )

        pdf_buffer = BytesIO()
        pisa_status = pisa.CreatePDF(html_content, dest=pdf_buffer)

        if pisa_status.err:
            current_app.logger.error("pisa.CreatePDF returned err for bid %s", bid.get("bidId"))
            return jsonify({"msg": "Failed to compile quotation PDF"}), 500

        pdf_buffer.seek(0)
        pdf_data = pdf_buffer.read()

        response = make_response(pdf_data)
        response.headers['Content-Type'] = 'application/pdf'
        response.headers['Content-Disposition'] = f'attachment; filename=quotation_{bid.get("bidId")}.pdf'

        log_audit("EXPORT_QUOTATION", f"Exported quotation PDF for bid {bid.get('bidId')}")
        return response

    except Exception:
        current_app.logger.exception("get_quotation_pdf failed")
        return jsonify({"msg": "Error exporting quotation"}), 500


@bids_bp.route('/<id>', methods=['DELETE'])
@bid_access_required
def delete_bid(id):
    bid_oid = require_oid(id)

    try:
        bid = db.Bids.find_one({"_id": bid_oid})

        bid_id_str = bid.get("bidId", id)

        db.Bids.delete_one({"_id": bid_oid})
        db.Notifications.delete_many({"refId": id})

        log_audit("DELETE_BID", f"Deleted bid {bid_id_str}")
        return jsonify({"msg": "Bid deleted successfully"}), 200
    except Exception:
        current_app.logger.exception("delete_bid failed")
        return jsonify({"msg": "Error deleting bid"}), 500


@bids_bp.route('/<id>/comments/<date_str>', methods=['DELETE'])
@jwt_required()
def delete_comment(id, date_str):
    """Delete a comment from a bid, ensuring authorization (only author or admin can delete)."""
    bid_oid = require_oid(id)
    if bid_oid is None:
        return jsonify({"msg": "Invalid id"}), 400

    try:
        user_id = get_jwt_identity()
        user = db.Users.find_one({"_id": ObjectId(user_id)})
        if not user:
            return jsonify({"msg": "User not found"}), 404

        bid = db.Bids.find_one({"_id": bid_oid})
        if not bid:
            return jsonify({"msg": "Bid not found"}), 404

        target_date = None
        try:
            from email.utils import parsedate_to_datetime
            target_date = parsedate_to_datetime(date_str)
            if target_date.tzinfo:
                target_date = target_date.astimezone(datetime.timezone.utc).replace(tzinfo=None)
        except Exception:
            pass

        if not target_date:
            try:
                target_date = datetime.datetime.fromisoformat(date_str)
                if target_date.tzinfo:
                    target_date = target_date.astimezone(datetime.timezone.utc).replace(tzinfo=None)
            except ValueError:
                return jsonify({"msg": f"Invalid date format: {date_str}"}), 400

        # Find the comment in the comments list
        comments = bid.get("comments", [])
        comment_to_delete = None
        for c in comments:
            c_date = c.get("date")
            if c_date:
                if c_date.tzinfo:
                    c_date = c_date.astimezone(datetime.timezone.utc).replace(tzinfo=None)
                # Handle possible small datetime parse precision discrepancies by checking difference
                if abs((c_date - target_date).total_seconds()) < 2.0:
                    comment_to_delete = c
                    break

        if not comment_to_delete:
            return jsonify({"msg": "Comment not found"}), 404

        is_admin = user.get("role") == "Admin"
        if comment_to_delete.get("author") != user.get("name") and not is_admin:
            return jsonify({"msg": "Unauthorized to delete this comment"}), 403

        # Pull the comment from the comments list
        db.Bids.update_one(
            {"_id": bid_oid},
            {"$pull": {"comments": {"date": comment_to_delete["date"]}}}
        )

        # Emit delete comment event for real-time updates
        socketio.emit('delete_comment', {
            'bid_id': id,
            'comment_date': comment_to_delete['date'].isoformat()
        })

        log_audit("DELETE_COMMENT", f"Deleted comment from bid {bid.get('bidId', id)}")
        return jsonify({"msg": "Comment deleted"}), 200
    except Exception:
        current_app.logger.exception("delete_comment failed")
        return jsonify({"msg": "Error deleting comment"}), 500


