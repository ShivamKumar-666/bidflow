import datetime

import bleach
from bson.objectid import ObjectId
from database import db
from extensions import socketio
from flask import Blueprint, current_app, jsonify, make_response, request
from flask_jwt_extended import get_jwt, get_jwt_identity, jwt_required
from services import BidService, NotificationService
from utils import log_audit
from utils.auth_helpers import now_utc, require_oid, bid_access_required

bids_bp = Blueprint('bids', __name__)


@bids_bp.route('/', methods=['GET'])
@jwt_required()
def get_bids():
    user_id = get_jwt_identity()
    role = get_jwt().get('role')
    filter_query = BidService.get_bid_filter(user_id, role)

    try:
        page = max(int(request.args.get('page', 1)), 1)
        size = min(max(int(request.args.get('size', 100)), 1), 200)
    except ValueError:
        return jsonify({"msg": "Invalid pagination parameters"}), 400

    cursor = db.Bids.find(filter_query).sort("submissionDate", -1).skip((page - 1) * size).limit(size)
    bids = list(cursor)
    for bid in bids:
        bid['_id'] = str(bid['_id'])
    return jsonify({
        "items": bids,
        "page": page,
        "size": size,
        "total": db.Bids.count_documents(filter_query),
    }), 200


@bids_bp.route('/', methods=['POST'])
@jwt_required()
def create_bid():
    data = request.get_json() or {}

    try:
        amount = float(data.get("amount", 0))
    except (TypeError, ValueError):
        return jsonify({"msg": "amount must be a number"}), 400
    if amount < 0:
        return jsonify({"msg": "amount must be non-negative"}), 400

    new_bid = BidService.create_bid(data, get_jwt_identity())

    log_audit("CREATE_BID", f"Created bid {new_bid['bidId']} for enquiry {new_bid['enquiryId']}")

    new_bid['_id'] = str(new_bid['_id'])
    return jsonify(new_bid), 201


@bids_bp.route('/<id>/status', methods=['PUT'])
@bid_access_required
def update_bid_status(id):
    data = request.get_json()
    new_status = data.get("status")
    note = data.get("note", "Status updated")

    bid_oid = require_oid(id)
    bid, error = BidService.update_status(bid_oid, new_status, note)
    if error:
        return jsonify({"msg": error}), 400

    log_audit("UPDATE_BID", f"Updated bid {bid['bidId']} status to {new_status}")

    assigned_name = bid.get("assignedEmployee")
    if assigned_name:
        target_user = BidService.get_user_by_name(assigned_name)
        if target_user:
            target_user_id = str(target_user["_id"])
            notif = NotificationService.create(
                user_id=target_user_id,
                title="Bid Status Updated",
                message=f"{bid.get('bidId', id)} moved to \u2018{new_status}\u2019",
                notif_type="status_change",
                ref_id=str(bid["_id"])
            )
            socketio.emit('notification', notif, room=f"user_{target_user_id}")

    return jsonify({"msg": "Bid status updated"}), 200


@bids_bp.route('/<id>/comments', methods=['POST'])
@jwt_required()
def add_comment(id):
    data = request.get_json() or {}
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"msg": "Comment text is required"}), 400
    if len(text) > 2000:
        return jsonify({"msg": "Comment exceeds maximum length of 2000 chars"}), 400
    text = bleach.clean(text, strip=True)

    user_id = get_jwt_identity()
    user = db.Users.find_one({"_id": ObjectId(user_id)})
    if not user:
        return jsonify({"msg": "User not found"}), 404

    bid_oid = require_oid(id)
    if bid_oid is None:
        return jsonify({"msg": "Invalid id"}), 400

    comment = {
        "_id": ObjectId(),
        "text": text,
        "author": user.get("name", "Unknown"),
        "date": now_utc()
    }

    db.Bids.update_one({"_id": bid_oid}, {"$push": {"comments": comment}})

    bid = db.Bids.find_one({"_id": bid_oid})
    if bid:
        log_audit("ADD_COMMENT", f"Added comment to bid {bid.get('bidId')}")

    socketio.emit('new_comment', {
        'bid_id': id,
        'comment': {
            '_id': str(comment['_id']),
            'text': comment['text'],
            'author': comment['author'],
            'date': comment['date'].isoformat()
        }
    })

    if bid:
        assigned_name = bid.get("assignedEmployee")
        commenter_name = user.get("name", "") if user else ""
        if assigned_name and assigned_name != commenter_name:
            target_user = BidService.get_user_by_name(assigned_name)
            if target_user:
                target_user_id = str(target_user["_id"])
                notif = NotificationService.create(
                    user_id=target_user_id,
                    title="New Comment on Your Bid",
                    message=f"{commenter_name} commented on {bid.get('bidId', id)}: \"{comment['text'][:60]}\"",
                    notif_type="new_comment",
                    ref_id=str(bid["_id"])
                )
                socketio.emit('notification', notif, room=f"user_{target_user_id}")

    return jsonify({
        "_id": str(comment["_id"]),
        "text": comment["text"],
        "author": comment["author"],
        "date": comment["date"].isoformat()
    }), 201


@bids_bp.route('/predict', methods=['POST'])
@jwt_required()
def predict_bid():
    data = request.get_json()
    clf, _ = BidService.get_model_and_encoder()
    if not clf:
        return jsonify({"msg": "ML model not loaded"}), 503

    try:
        current_user_id = get_jwt_identity()
        current_user = db.Users.find_one({"_id": ObjectId(current_user_id)})
        if not current_user:
            return jsonify({"msg": "User not found"}), 404
        current_name = current_user.get("name", "")

        override_name = data.get("assignedEmployee", current_name)

        req_industry = data.get("industry")
        if not req_industry or req_industry == "Other":
            if current_user and "industry" in current_user:
                industry = current_user["industry"]
            else:
                industry = "Other"
        else:
            industry = req_industry

        win_prob, computed_win_rate, explanations = BidService.predict_live(
            data, override_name, industry
        )

        return jsonify({
            "win_probability": round(win_prob, 1),
            "computed_win_rate_pct": round(computed_win_rate, 1),
            "shap_explanations": explanations
        }), 200
    except Exception:
        current_app.logger.exception("predict_bid failed")
        return jsonify({"msg": "Prediction failed"}), 400


@bids_bp.route('/calendar', methods=['GET'])
@jwt_required()
def get_calendar_bids():
    try:
        month_param = request.args.get('month')
        user_id = get_jwt_identity()
        role = get_jwt().get('role')

        bid_filter = BidService.get_calendar_filter(user_id, role)

        # Filter by month at DB level if provided
        if month_param:
            bid_filter["submissionDate"] = {"$regex": f"^{month_param}"}

        bids = list(db.Bids.find(bid_filter))

        # Only load enquiries referenced by the filtered bids
        enquiry_ids = {bid.get('enquiryId') for bid in bids if bid.get('enquiryId')}
        enq_filter = {"enquiryId": {"$in": list(enquiry_ids)}}
        if role != 'Admin':
            enq_filter["createdBy"] = user_id if user_id else {"$exists": False}
        enquiries = list(db.Enquiries.find(enq_filter))
        enq_map = {enq.get('enquiryId'): enq for enq in enquiries if enq.get('enquiryId')}

        events = []
        for bid in bids:
            sub_date = bid.get('submissionDate')
            if not sub_date:
                continue
            if isinstance(sub_date, str) and "T" in sub_date:
                sub_date = sub_date.split("T")[0]
            enq = enq_map.get(bid.get('enquiryId'), {})

            events.append({
                "bidId": bid.get("bidId"),
                "_id": str(bid.get("_id")),
                "enquiryId": bid.get("enquiryId"),
                "submissionDate": sub_date,
                "amount": bid.get("amount"),
                "status": bid.get("status"),
                "assignedEmployee": bid.get("assignedEmployee"),
                "remarks": bid.get("remarks", ""),
                "aiPrediction": bid.get("aiPrediction"),
                "customerName": enq.get("customerName", "Unknown Client"),
                "priority": enq.get("priority", "Medium"),
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
    if not BidService.is_pisa_available():
        return jsonify({"msg": "PDF generation library not installed"}), 503

    bid_oid = require_oid(id)

    try:
        bid = db.Bids.find_one({"_id": bid_oid})
        if not bid:
            return jsonify({"msg": "Bid not found"}), 404
        enquiry = db.Enquiries.find_one({"enquiryId": bid.get("enquiryId")}) or {}

        pdf_data = BidService.render_quotation_pdf(bid, enquiry)
        if pdf_data is None:
            return jsonify({"msg": "Failed to compile quotation PDF"}), 500

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
        if not bid:
            return jsonify({"msg": "Bid not found"}), 404
        bid_id_str = bid.get("bidId", id)

        db.Bids.delete_one({"_id": bid_oid})
        NotificationService.delete_by_ref(id)

        log_audit("DELETE_BID", f"Deleted bid {bid_id_str}")
        return jsonify({"msg": "Bid deleted successfully"}), 200
    except Exception:
        current_app.logger.exception("delete_bid failed")
        return jsonify({"msg": "Error deleting bid"}), 500


@bids_bp.route('/<id>/comments/<comment_id>', methods=['DELETE'])
@jwt_required()
def delete_comment(id, comment_id):
    bid_oid = require_oid(id)
    if bid_oid is None:
        return jsonify({"msg": "Invalid id"}), 400

    if not ObjectId.is_valid(comment_id):
        return jsonify({"msg": "Invalid comment id"}), 400

    try:
        user_id = get_jwt_identity()
        user = db.Users.find_one({"_id": ObjectId(user_id)})
        if not user:
            return jsonify({"msg": "User not found"}), 404

        bid = db.Bids.find_one({"_id": bid_oid})
        if not bid:
            return jsonify({"msg": "Bid not found"}), 404

        comments = bid.get("comments", [])
        comment_to_delete = None
        for c in comments:
            if str(c.get("_id")) == comment_id:
                comment_to_delete = c
                break

        if not comment_to_delete:
            return jsonify({"msg": "Comment not found"}), 404

        is_admin = user.get("role") == "Admin"
        if comment_to_delete.get("author") != user.get("name") and not is_admin:
            return jsonify({"msg": "Unauthorized to delete this comment"}), 403

        db.Bids.update_one(
            {"_id": bid_oid},
            {"$pull": {"comments": {"_id": ObjectId(comment_id)}}}
        )

        socketio.emit('delete_comment', {
            'bid_id': id,
            'comment_id': comment_id
        })

        log_audit("DELETE_COMMENT", f"Deleted comment from bid {bid.get('bidId', id)}")
        return jsonify({"msg": "Comment deleted"}), 200
    except Exception:
        current_app.logger.exception("delete_comment failed")
        return jsonify({"msg": "Error deleting comment"}), 500
