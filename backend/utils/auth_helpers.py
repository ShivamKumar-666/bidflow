import datetime
from functools import wraps
from flask import jsonify
from flask_jwt_extended import (
    get_jwt_identity, get_jwt, verify_jwt_in_request, jwt_required
)
from bson.objectid import ObjectId
from database import db


def now_utc():
    """Single source of truth for current UTC time (replaces deprecated utcnow())."""
    return datetime.datetime.now(datetime.timezone.utc)


def current_user_and_role():
    """
    Resolve the current user from the JWT and return (user_doc, role).
    Reads role from the DB (not the JWT) so role changes take effect immediately.
    """
    verify_jwt_in_request()
    user_id = get_jwt_identity()
    user    = None
    role    = None
    if user_id and ObjectId.is_valid(user_id):
        user = db.Users.find_one({"_id": ObjectId(user_id)}, {"role": 1})
        if user:
            role = user.get('role')
    if role is None:
        role = get_jwt().get('role')
    return user, role


def get_user_role():
    """Read the current user's role from the DB (not the JWT).
    Falls back to the JWT claim if the user document is not found."""
    user_id = get_jwt_identity()
    if user_id and ObjectId.is_valid(user_id):
        user = db.Users.find_one({"_id": ObjectId(user_id)}, {"role": 1})
        if user:
            return user.get('role')
    return get_jwt().get('role')


def admin_required(fn):
    """Decorator: returns 403 unless the user has role=Admin in the DB."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        user_id = get_jwt_identity()
        if not user_id or not ObjectId.is_valid(user_id):
            return jsonify({"msg": "Invalid token"}), 401
        user = db.Users.find_one({"_id": ObjectId(user_id)}, {"role": 1})
        if not user or user.get('role') != 'Admin':
            return jsonify({"msg": "Admin access required"}), 403
        return fn(*args, **kwargs)
    return wrapper


def bid_access_required(fn):
    """Decorator: checks that the caller is Admin, assigned employee, creator, or legacy.
    The bid must exist and the first URL parameter must be the bid's ObjectId string."""
    @wraps(fn)
    @jwt_required()
    def wrapper(id, *args, **kwargs):
        bid_oid = require_oid(id)
        if bid_oid is None:
            return jsonify({"msg": "Invalid id"}), 400
        bid = db.Bids.find_one({"_id": bid_oid})
        if not bid:
            return jsonify({"msg": "Bid not found"}), 404
        role = get_jwt().get('role')
        user_id = get_jwt_identity()
        user = db.Users.find_one({"_id": ObjectId(user_id)}, {"name": 1, "role": 1}) if ObjectId.is_valid(user_id) else None
        if user:
            role = user.get('role', role)
        is_admin = role == 'Admin'
        assigned = bid.get('assignedEmployee')
        is_owner = bool(user and (user.get('name') == assigned or str(user['_id']) == str(assigned)))
        is_creator = bid.get('createdBy') == user_id
        is_legacy = not bid.get('createdBy') and is_admin
        is_enquiry_owner = False
        if bid.get('enquiryId'):
            enquiry = db.Enquiries.find_one({"enquiryId": bid['enquiryId']}, {"createdBy": 1})
            if enquiry:
                is_enquiry_owner = str(enquiry.get('createdBy', '')) == str(user_id)
        if not is_admin and not is_owner and not is_creator and not is_legacy and not is_enquiry_owner:
            return jsonify({"msg": "Forbidden: only Admin, assigned employee, creator, or enquiry owner can access this bid"}), 403
        return fn(id, *args, **kwargs)
    return wrapper


def require_oid(value):
    """Return the value if it's a valid 24-char hex ObjectId, else None.
    Use this in route handlers to fail fast on bad IDs (returns 400) instead
    of crashing in a 500 from bson.errors.InvalidId.
    """
    if not value or not ObjectId.is_valid(str(value)):
        return None
    return ObjectId(str(value))
