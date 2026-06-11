from flask import Blueprint, current_app, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from database import db
from bson.objectid import ObjectId
from extensions import limiter

tags_bp = Blueprint('tags', __name__)


@tags_bp.route('/', methods=['GET'])
@jwt_required()
@limiter.limit("30 per minute")
def get_unique_tags():
    """Get unique tags scoped to the user's visible enquiries and bids."""
    try:
        user_id = get_jwt_identity()
        role = get_jwt().get('role')

        if role == 'Admin':
            enq_filter = {}
            bid_filter = {}
        else:
            enq_filter = {"createdBy": user_id} if user_id else {"_id": {"$exists": False}}
            bid_filter = {"$or": [
                {"createdBy": user_id},
                {"createdBy": {"$exists": False}}
            ]} if user_id else {"_id": {"$exists": False}}

        enq_tags = db.Enquiries.distinct("tags", enq_filter) or []
        bid_tags = db.Bids.distinct("tags", bid_filter) or []

        merged_tags = set(enq_tags + bid_tags)
        unique_tags = sorted([t for t in merged_tags if t and isinstance(t, str)])

        return jsonify(unique_tags), 200
    except Exception:
        current_app.logger.exception("get_unique_tags failed")
        return jsonify({"msg": "Unable to load tags"}), 500
