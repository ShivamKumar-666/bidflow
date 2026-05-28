from flask import Blueprint, request, jsonify
from flask_jwt_extended import (
    create_access_token, jwt_required,
    get_jwt_identity, get_jwt
)
import bcrypt
from database import db
from extensions import limiter
from datetime import timedelta, timezone, datetime as dt

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/register', methods=['POST'])
@limiter.limit("5 per minute")
def register():
    data = request.get_json()
    name     = data.get('name')
    email    = data.get('email')
    password = data.get('password')
    role     = 'Sales Executive'  # Never accept role from client — prevents privilege escalation

    if not email or not password or not name:
        return jsonify({"msg": "Missing required fields"}), 400

    # Password strength validation
    if len(password) < 8:
        return jsonify({"msg": "Password must be at least 8 characters long"}), 400

    email = email.strip().lower()

    # Basic email format validation
    import re
    if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email):
        return jsonify({"msg": "Invalid email format"}), 400

    if db.Users.find_one({"email": email}):
        return jsonify({"msg": "Email already exists"}), 400

    hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())

    user = {
        "name": name,
        "email": email,
        "password": hashed_password.decode('utf-8'),
        "role": role
    }
    db.Users.insert_one(user)

    return jsonify({"msg": "User created successfully"}), 201


@auth_bp.route('/login', methods=['POST'])
@limiter.limit("10 per minute; 50 per hour")
def login():
    data     = request.get_json()
    email    = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({"msg": "Missing email or password"}), 400

    email = email.strip().lower()

    user = db.Users.find_one({"email": email})
    if not user or not bcrypt.checkpw(password.encode('utf-8'), user['password'].encode('utf-8')):
        return jsonify({"msg": "Bad email or password"}), 401

    access_token = create_access_token(
        identity=str(user['_id']),
        additional_claims={'role': user['role']}
    )

    # ── 2FA enforcement for Admin role ────────────────────────────────────────
    if user['role'] == 'Admin':
        if user.get('totp_enabled'):
            # Issue a short-lived temp token (5 min) for the 2FA step
            temp_token = create_access_token(
                identity=str(user['_id']),
                additional_claims={
                    'role': user['role'],
                    'sub_type': '2fa_pending'
                },
                expires_delta=timedelta(minutes=5)
            )
            return jsonify({
                'requires_2fa': True,
                'temp_token': temp_token
            }), 200
        else:
            # Admin hasn't set up 2FA yet — send full token but flag setup needed
            return jsonify(
                access_token=access_token,
                user={
                    'name': user['name'],
                    'email': user['email'],
                    'role': user['role'],
                    'totp_enabled': False
                },
                requires_2fa_setup=True
            ), 200

    return jsonify(
        access_token=access_token,
        user={'name': user['name'], 'email': user['email'], 'role': user['role']}
    ), 200


@auth_bp.route('/logout', methods=['POST'])
@jwt_required()
def logout():
    """Revoke the current access token by storing its JTI in MongoDB."""
    jwt_payload = get_jwt()
    jti = jwt_payload.get("jti")
    exp = jwt_payload.get("exp")   # UNIX timestamp

    if not jti:
        return jsonify({"msg": "Invalid token"}), 400

    # exp is stored as a datetime so the TTL index can auto-delete expired entries
    expiry_dt = dt.fromtimestamp(exp, tz=timezone.utc)

    db.RevokedTokens.update_one(
        {"jti": jti},
        {"$setOnInsert": {"jti": jti, "exp": expiry_dt}},
        upsert=True
    )
    return jsonify({"msg": "Successfully logged out."}), 200


@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def me():
    current_user_id = get_jwt_identity()
    from bson.objectid import ObjectId
    user = db.Users.find_one({"_id": ObjectId(current_user_id)}, {
            "name": 1, "email": 1, "role": 1, "industry": 1,
            "winRate": 1, "targetBidValue": 1, "bio": 1,
            "totp_enabled": 1
        })
    if user:
        user['_id'] = str(user['_id'])
        return jsonify(user), 200
    return jsonify({"msg": "User not found"}), 404


@auth_bp.route('/profile', methods=['PUT'])
@jwt_required()
def update_profile():
    current_user_id = get_jwt_identity()
    from bson.objectid import ObjectId

    data             = request.get_json()
    name             = data.get('name')
    industry         = data.get('industry')
    win_rate         = data.get('winRate')
    target_bid_value = data.get('targetBidValue')
    bio              = data.get('bio')

    update_data = {}

    if name is not None:
        if not name.strip():
            return jsonify({"msg": "Name cannot be empty"}), 400
        update_data["name"] = name.strip()

    if industry is not None:
        update_data["industry"] = industry

    if win_rate is not None:
        try:
            win_rate_val = int(win_rate)
            if not (0 <= win_rate_val <= 100):
                return jsonify({"msg": "Win rate must be between 0 and 100"}), 400
            # Stored as a personal goal/display metric only — NOT used by the ML pipeline.
            # The ML pipeline computes actual win rate from real bid outcomes in db.Bids.
            update_data["winRate"] = win_rate_val
        except ValueError:
            return jsonify({"msg": "Invalid win rate format"}), 400

    if target_bid_value is not None:
        try:
            target_val = float(target_bid_value)
            if target_val < 0:
                return jsonify({"msg": "Target bid value must be non-negative"}), 400
            update_data["targetBidValue"] = target_val
        except ValueError:
            return jsonify({"msg": "Invalid target bid value format"}), 400

    if bio is not None:
        update_data["bio"] = bio

    if not update_data:
        return jsonify({"msg": "No update fields provided"}), 400

    db.Users.update_one({"_id": ObjectId(current_user_id)}, {"$set": update_data})

    user = db.Users.find_one({"_id": ObjectId(current_user_id)}, {
            "name": 1, "email": 1, "role": 1, "industry": 1,
            "winRate": 1, "targetBidValue": 1, "bio": 1,
            "totp_enabled": 1
        })
    if user:
        user['_id'] = str(user['_id'])
        return jsonify(user), 200

    return jsonify({"msg": "User not found"}), 404
