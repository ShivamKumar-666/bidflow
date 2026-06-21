import datetime
import re

import bleach
from bson.objectid import ObjectId
from database import db
from extensions import socketio, limiter
from flask import Blueprint, current_app, jsonify, make_response, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from services import BidService, DocumentService, NotificationService
from utils import log_audit
from utils.auth_helpers import now_utc, require_oid, bid_access_required, get_user_role

bids_bp = Blueprint('bids', __name__)


@bids_bp.route('/', methods=['GET'])
@jwt_required()
def get_bids():
    user_id = get_jwt_identity()
    role = get_user_role()
    filter_query = BidService.get_bid_filter(user_id, role)

    try:
        page = max(int(request.args.get('page', 1)), 1)
        size = min(max(int(request.args.get('size', 100)), 1), 200)
    except ValueError:
        return jsonify({"msg": "Invalid pagination parameters"}), 400

    cursor = db.Bids.find(filter_query).sort("submissionDate", -1).skip((page - 1) * size).limit(size)
    bids = list(cursor)

    # Enrich bids with enquiry negotiable field
    enquiry_ids = {bid.get('enquiryId') for bid in bids if bid.get('enquiryId')}
    enq_map = {}
    if enquiry_ids:
        for enq in db.Enquiries.find({"enquiryId": {"$in": list(enquiry_ids)}}, {"enquiryId": 1, "negotiable": 1}):
            enq_map[enq.get("enquiryId")] = enq.get("negotiable", True)

    for bid in bids:
        bid['_id'] = str(bid['_id'])
        bid['negotiable'] = enq_map.get(bid.get('enquiryId'), True)
        for comment in bid.get('comments', []):
            comment['_id'] = str(comment['_id'])

    return jsonify({
        "items": bids,
        "page": page,
        "size": size,
        "total": db.Bids.count_documents(filter_query),
    }), 200


@bids_bp.route('/', methods=['POST'])
@jwt_required()
@limiter.limit("20 per minute")
def create_bid():
    data = request.get_json() or {}

    try:
        amount = float(data.get("amount", 0))
    except (TypeError, ValueError):
        return jsonify({"msg": "amount must be a number"}), 400
    if amount < 0:
        return jsonify({"msg": "amount must be non-negative"}), 400

    try:
        team_size = int(data.get("teamSize", 1))
        if team_size < 1:
            team_size = 1
    except (TypeError, ValueError):
        return jsonify({"msg": "teamSize must be a valid integer"}), 400
    data["teamSize"] = team_size

    new_bid = BidService.create_bid(data, get_jwt_identity())

    log_audit("CREATE_BID", f"Created bid {new_bid['bidId']} for enquiry {new_bid['enquiryId']}")

    # Notify enquiry creator
    enquiry = db.Enquiries.find_one({"enquiryId": new_bid.get("enquiryId")})
    if enquiry and enquiry.get("createdBy"):
        enquiry_creator_id = str(enquiry.get("createdBy"))
        bid_creator_id = str(get_jwt_identity())
        if enquiry_creator_id != bid_creator_id:
            notif = NotificationService.create(
                user_id=enquiry_creator_id,
                title="New Bid Received",
                message=f"New bid {new_bid['bidId']} received for enquiry {new_bid['enquiryId']}",
                notif_type="status_change",
                ref_id=str(new_bid["_id"])
            )
            socketio.emit('notification', notif, room=f"user_{enquiry_creator_id}")  # type: ignore[call-arg]

    new_bid['_id'] = str(new_bid['_id'])
    return jsonify(new_bid), 201


@bids_bp.route('/<id>/status', methods=['PUT'])
@bid_access_required
@limiter.limit("30 per minute")
def update_bid_status(id):
    data = request.get_json() or {}
    new_status = data.get("status")
    note = data.get("note", "Status updated")

    bid_oid = require_oid(id)
    bid = db.Bids.find_one({"_id": bid_oid})
    if not bid:
        return jsonify({"msg": "Bid not found"}), 404

    user_id = get_jwt_identity()
    role = get_user_role()
    if not BidService.can_update_bid_status(user_id, role, bid):
        return jsonify({"msg": "Only the enquiry owner can update bid status"}), 403

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
            socketio.emit('notification', notif, room=f"user_{target_user_id}")  # type: ignore[call-arg]

    bid_creator_id = bid.get("createdBy")
    if bid_creator_id and bid_creator_id != user_id:
        if new_status == "Order Received":
            notif_msg = f"Congratulations! Your bid {bid.get('bidId')} has been accepted!"
        elif new_status == "Rejected":
            notif_msg = f"Your bid {bid.get('bidId')} was not selected."
            shap_explanations = bid.get("shapExplanations", [])
            if shap_explanations:
                negative_factors = [
                    ex for ex in shap_explanations
                    if ex.get("impact") == "negative"
                ][:3]
                if negative_factors:
                    feedback_lines = [f"• {ex.get('text', '')}" for ex in negative_factors]
                    notif_msg += "\n\nKey factors:\n" + "\n".join(feedback_lines)
                else:
                    notif_msg += "\n\nThe winning bid had a stronger overall profile."
        else:
            notif_msg = f"Your bid {bid.get('bidId')} status updated to '{new_status}'"
        notif = NotificationService.create(
            user_id=bid_creator_id,
            title="Bid Status Updated",
            message=notif_msg,
            notif_type="status_change",
            ref_id=str(bid["_id"])
        )
        socketio.emit('notification', notif, room=f"user_{bid_creator_id}")  # type: ignore[call-arg]

    return jsonify({"msg": "Bid status updated"}), 200


@bids_bp.route('/<id>/comments', methods=['POST'])
@bid_access_required
@limiter.limit("30 per minute")
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
        "userId": user_id,
        "date": now_utc()
    }

    db.Bids.update_one({"_id": bid_oid}, {"$push": {"comments": comment}})

    try:
        bid = db.Bids.find_one({"_id": bid_oid})
        if bid:
            log_audit("ADD_COMMENT", f"Added comment to bid {bid.get('bidId')}")

        relevant_user_ids = set()
        if bid:
            if bid.get("createdBy"):
                relevant_user_ids.add(str(bid["createdBy"]))
            assigned_name = bid.get("assignedEmployee")
            if assigned_name:
                assigned_user = BidService.get_user_by_name(assigned_name)
                if assigned_user:
                    relevant_user_ids.add(str(assigned_user["_id"]))
            if bid.get("enquiryId"):
                enq = db.Enquiries.find_one({"enquiryId": bid["enquiryId"]})
                if enq and enq.get("createdBy"):
                    relevant_user_ids.add(str(enq["createdBy"]))

        comment_data = {
            'bid_id': id,
            'comment': {
                '_id': str(comment['_id']),
                'text': comment['text'],
                'author': comment['author'],
                'userId': comment['userId'],
                'date': comment['date'].isoformat()
            }
        }
        for uid in relevant_user_ids:
            socketio.emit('new_comment', comment_data, room=f"user_{uid}")  # type: ignore[call-arg]

        if bid:
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
                    socketio.emit('notification', notif, room=f"user_{target_user_id}")  # type: ignore[call-arg]
    except Exception as e:
        current_app.logger.error(f"Post-comment side effects failed for bid {id}: {e}")

    return jsonify({
        "_id": str(comment["_id"]),
        "text": comment["text"],
        "author": comment["author"],
        "userId": comment["userId"],
        "date": comment["date"].isoformat()
    }), 201


@bids_bp.route('/predict', methods=['POST'])
@jwt_required()
@limiter.limit("30 per minute")
def predict_bid():
    data = request.get_json() or {}
    clf, _ = BidService.get_model_and_encoder()
    if not clf:
        return jsonify({"msg": "ML model not loaded"}), 503

    try:
        current_user_id = get_jwt_identity()
        current_user = db.Users.find_one({"_id": ObjectId(current_user_id)})
        if not current_user:
            return jsonify({"msg": "User not found"}), 404
        current_name = current_user.get("name", "")
        role = get_user_role()

        override_name = data.get("assignedEmployee", current_name)
        if role != 'Admin' and override_name != current_name:
            override_name = current_name

        req_industry = data.get("industry")
        if not req_industry or req_industry == "Other":
            if current_user and "industry" in current_user:
                industry = current_user["industry"]
            else:
                industry = "Other"
        else:
            industry = req_industry

        currency = data.get("currency", "USD")
        if currency not in BidService.ALLOWED_CURRENCIES:
            currency = "USD"
        currency_symbol = BidService.CURRENCY_SYMBOLS.get(currency, "$")

        win_prob, computed_win_rate, explanations = BidService.predict_live(
            data, override_name, industry, currency_symbol
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
@limiter.limit("30 per minute")
def get_calendar_bids():
    try:
        month_param = request.args.get('month')
        user_id = get_jwt_identity()
        role = get_user_role()

        bid_filter = BidService.get_calendar_filter(user_id, role)

        # Filter by month at DB level if provided
        if month_param:
            bid_filter["submissionDate"] = {"$regex": f"^{re.escape(month_param)}"}

        bids = list(db.Bids.find(bid_filter).limit(500))

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
                "eventType": "bid"
            })

        # Add enquiry creation events for Company role
        if role == 'Company' and user_id:
            enq_date_filter = {}
            if month_param:
                try:
                    year, month = map(int, month_param.split('-'))
                    start_of_month = datetime.datetime(year, month, 1)
                    if month == 12:
                        start_of_next_month = datetime.datetime(year + 1, 1, 1)
                    else:
                        start_of_next_month = datetime.datetime(year, month + 1, 1)
                    enq_date_filter["date"] = {"$gte": start_of_month, "$lt": start_of_next_month}
                except (ValueError, AttributeError):
                    pass
            enq_date_filter["createdBy"] = user_id
            user_enquiries = list(db.Enquiries.find(enq_date_filter).limit(500))
            for enq in user_enquiries:
                enq_date = enq.get('date')
                if not enq_date:
                    continue
                if isinstance(enq_date, datetime.datetime):
                    enq_date = enq_date.strftime('%Y-%m-%d')
                elif isinstance(enq_date, str) and "T" in enq_date:
                    enq_date = enq_date.split("T")[0]
                events.append({
                    "enquiryId": enq.get("enquiryId"),
                    "_id": str(enq.get("_id")),
                    "submissionDate": enq_date,
                    "customerName": enq.get("customerName", "Unknown Client"),
                    "productServiceRequired": enq.get("productServiceRequired", "N/A"),
                    "priority": enq.get("priority", "Medium"),
                    "status": enq.get("status", "Under Review"),
                    "eventType": "enquiry"
                })

        current_app.logger.info(f"Calendar: returning {len(events)} events for month {month_param}")
        return jsonify(events), 200
    except Exception:
        current_app.logger.exception("get_calendar_bids failed")
        return jsonify({"msg": "Error fetching calendar data"}), 500


@bids_bp.route('/<id>', methods=['PUT'])
@bid_access_required
@limiter.limit("60 per minute")
def update_bid(id):
    bid_oid = require_oid(id)

    try:
        data = request.get_json() or {}
        ALLOWED_FIELDS = {"tags", "remarks", "amount", "currency", "submissionDate", "assignedEmployee", "industry"}
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

        if "currency" in update_data:
            if update_data["currency"] not in BidService.ALLOWED_CURRENCIES:
                return jsonify({"msg": f"Invalid currency. Must be one of: {', '.join(BidService.ALLOWED_CURRENCIES)}"}), 400

        if "tags" in update_data:
            update_data["tags"] = [t.strip().lower() for t in update_data["tags"] if isinstance(t, str) and t.strip()]

        if "remarks" in update_data:
            update_data["remarks"] = bleach.clean(update_data["remarks"], strip=True)[:2000]

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
@limiter.limit("10 per minute")
def delete_bid(id):
    bid_oid = require_oid(id)

    try:
        bid = db.Bids.find_one({"_id": bid_oid})
        if not bid:
            return jsonify({"msg": "Bid not found"}), 404
        bid_id_str = bid.get("bidId", id)

        # Bidder-specific: only allow delete if status is Rejected or bid is > 30 days old
        role = get_user_role()
        user_id = get_jwt_identity()
        if role == 'Bidder' and bid.get('createdBy') == user_id:
            is_rejected = bid.get('status') == 'Rejected'
            created = bid.get('createdAt')
            is_old = False
            if created:
                if isinstance(created, datetime.datetime):
                    age_days = (now_utc() - created).days
                elif isinstance(created, str):
                    age_days = (now_utc() - datetime.datetime.fromisoformat(created.replace('Z', '+00:00'))).days
                else:
                    age_days = 0
                is_old = age_days >= 30
            if not is_rejected and not is_old:
                return jsonify({"msg": "Bidders can only delete rejected or old bids (30+ days)"}), 403

        # Use transaction for atomic deletion (if replica set available)
        client = db.client
        try:
            with client.start_session() as session:
                with session.start_transaction():
                    db.Bids.delete_one({"_id": bid_oid}, session=session)
                    DocumentService.delete_bid_documents(str(bid_oid))
                    NotificationService.delete_by_ref(id)

                    # Decrement enquiry bidCount
                    if bid.get('enquiryId'):
                        db.Enquiries.update_one(
                            {"enquiryId": bid['enquiryId']},
                            {"$inc": {"bidCount": -1}},
                            session=session
                        )
        except Exception as txn_err:
            # Fallback for standalone MongoDB (no replica set)
            if "Transaction" in str(txn_err) or "replica" in str(txn_err).lower():
                current_app.logger.warning("Transactions not supported, using non-atomic delete")
                db.Bids.delete_one({"_id": bid_oid})
                DocumentService.delete_bid_documents(str(bid_oid))
                NotificationService.delete_by_ref(id)
                if bid.get('enquiryId'):
                    db.Enquiries.update_one(
                        {"enquiryId": bid['enquiryId']},
                        {"$inc": {"bidCount": -1}}
                    )
            else:
                raise

        log_audit("DELETE_BID", f"Deleted bid {bid_id_str}")
        return jsonify({"msg": "Bid deleted successfully"}), 200
    except Exception:
        current_app.logger.exception("delete_bid failed")
        return jsonify({"msg": "Error deleting bid"}), 500


@bids_bp.route('/<id>/comments/<comment_id>', methods=['DELETE'])
@bid_access_required
@limiter.limit("20 per minute")
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
        comment_user_id = comment_to_delete.get("userId")
        if comment_user_id:
            is_owner = str(comment_user_id) == str(user_id)
        else:
            is_owner = comment_to_delete.get("author") == user.get("name")
        if not is_owner and not is_admin:
            return jsonify({"msg": "Unauthorized to delete this comment"}), 403

        db.Bids.update_one(
            {"_id": bid_oid},
            {"$pull": {"comments": {"_id": ObjectId(comment_id)}}}
        )

        relevant_user_ids = set()
        if bid.get("createdBy"):
            relevant_user_ids.add(str(bid["createdBy"]))
        assigned_name = bid.get("assignedEmployee")
        if assigned_name:
            assigned_user = BidService.get_user_by_name(assigned_name)
            if assigned_user:
                relevant_user_ids.add(str(assigned_user["_id"]))
        if bid.get("enquiryId"):
            enq = db.Enquiries.find_one({"enquiryId": bid["enquiryId"]})
            if enq and enq.get("createdBy"):
                relevant_user_ids.add(str(enq["createdBy"]))

        delete_data = {
            'bid_id': id,
            'comment_id': comment_id
        }
        for uid in relevant_user_ids:
            socketio.emit('delete_comment', delete_data, room=f"user_{uid}")  # type: ignore[call-arg]

        log_audit("DELETE_COMMENT", f"Deleted comment from bid {bid.get('bidId', id)}")
        return jsonify({"msg": "Comment deleted"}), 200
    except Exception:
        current_app.logger.exception("delete_comment failed")
        return jsonify({"msg": "Error deleting comment"}), 500
