from flask import Blueprint, current_app, jsonify
from flask_jwt_extended import jwt_required
from database import db

tags_bp = Blueprint('tags', __name__)


@tags_bp.route('/', methods=['GET'])
@jwt_required()
def get_unique_tags():
    """Get all unique tags across all Enquiries and Bids for autocomplete suggestions."""
    try:
        enq_tags = db.Enquiries.distinct("tags") or []
        bid_tags = db.Bids.distinct("tags") or []

        # Merge, filter out None/empty values, and convert to unique sorted list
        merged_tags = set(enq_tags + bid_tags)
        unique_tags = sorted([t for t in merged_tags if t and isinstance(t, str)])

        return jsonify(unique_tags), 200
    except Exception:
        current_app.logger.exception("get_unique_tags failed")
        return jsonify({"msg": "Unable to load tags"}), 500
