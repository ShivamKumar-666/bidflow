import re
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import (
    create_access_token, create_refresh_token, jwt_required,
    get_jwt_identity, get_jwt,
    set_access_cookies, set_refresh_cookies, unset_jwt_cookies
)
import bcrypt
from database import db
from extensions import limiter
from datetime import timedelta, timezone, datetime as dt
from utils.email_tokens import generate_verification_token, confirm_verification_token
from utils.email_sender import send_verification_email
from utils.auth_helpers import now_utc
from itsdangerous import SignatureExpired, BadSignature


auth_bp = Blueprint('auth', __name__)


def _issue_tokens(user, response):
    """Create access + refresh tokens and set both httpOnly cookies (SEC-01, SEC-06).
    Returns the access_token (the refresh token is only in the cookie)."""
    access_token = create_access_token(
        identity=str(user['_id']),
        additional_claims={'role': user['role']}
    )
    refresh_token = create_refresh_token(
        identity=str(user['_id']),
        additional_claims={'role': user['role']}
    )
    set_access_cookies(response, access_token)
    set_refresh_cookies(response, refresh_token)
    return access_token


@auth_bp.route('/register', methods=['POST'])
@limiter.limit("5 per minute")
def register():
    data     = request.get_json()
    name     = data.get('name')
    email    = data.get('email')
    password = data.get('password')
    role     = 'Sales Executive'  # Never accept role from client — prevents privilege escalation

    if not email or not password or not name:
        return jsonify({"msg": "Missing required fields"}), 400

    if len(password) < 8:
        return jsonify({"msg": "Password must be at least 8 characters long"}), 400

    if not re.search(r'[A-Z]', password):
        return jsonify({"msg": "Password must contain at least one uppercase letter"}), 400
    if not re.search(r'[0-9]', password):
        return jsonify({"msg": "Password must contain at least one number"}), 400
    if not re.search(r'[^a-zA-Z0-9]', password):
        return jsonify({"msg": "Password must contain at least one special character (!@#$% etc.)"}), 400

    email = email.strip().lower()

    if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email):
        return jsonify({"msg": "Invalid email format"}), 400

    if db.Users.find_one({"email": email}):
        return jsonify({"msg": "Email already exists"}), 400

    hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())

    user = {
        "name":          name,
        "email":         email,
        "password":      hashed_password.decode('utf-8'),
        "role":          role,
        "is_verified":   False,    # ← account inactive until email confirmed
        "created_at":    now_utc()
    }
    db.Users.insert_one(user)

    # Generate signed token and send verification email
    try:
        token = generate_verification_token(email)
        send_verification_email(name, email, token)
    except Exception as e:
        # Don't block registration if email fails — log it and continue
        current_app.logger.error(f"Failed to send verification email to {email}: {e}")

    return jsonify({
        "msg": "Account created. Please check your email to verify your account before logging in."
    }), 201


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

    # ── Block unverified users from logging in ─────────────────────────────────
    if not user.get('is_verified', False):
        return jsonify({
            "msg": "Please verify your email address before logging in.",
            "error": "email_not_verified"
        }), 403


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
            resp = jsonify(
                access_token=access_token,
                user={
                    'name': user['name'],
                    'email': user['email'],
                    'role': user['role'],
                    'totp_enabled': False
                },
                requires_2fa_setup=True
            )
            _issue_tokens(user, resp)
            return resp, 200

    resp = jsonify(
        access_token=access_token,
        user={'name': user['name'], 'email': user['email'], 'role': user['role']}
    )
    _issue_tokens(user, resp)
    return resp, 200


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
    resp = jsonify({"msg": "Successfully logged out."})
    unset_jwt_cookies(resp)                             # SEC-01: clear both access + refresh cookies
    return resp, 200


@auth_bp.route('/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    """Issue a fresh access token using a valid refresh token (SEC-06).
    The refresh token is sent automatically in a separate httpOnly cookie."""
    from bson.objectid import ObjectId
    user_id = get_jwt_identity()
    user    = db.Users.find_one({"_id": ObjectId(user_id)})
    if not user:
        return jsonify({"msg": "User not found"}), 404

    new_access_token = create_access_token(
        identity=str(user['_id']),
        additional_claims={'role': user['role']}
    )
    resp = jsonify({"msg": "Token refreshed"})
    set_access_cookies(resp, new_access_token)
    return resp, 200


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


@auth_bp.route('/verify-email', methods=['GET'])
@limiter.limit("10 per minute")
def verify_email():
    """
    Called when the user clicks the verification link.
    The React frontend hits this endpoint with the token from the URL query param.
    """
    token = request.args.get('token')
    if not token:
        return jsonify({"msg": "Missing verification token"}), 400

    try:
        email = confirm_verification_token(token)
    except SignatureExpired:
        return jsonify({
            "msg": "Verification link has expired. Please request a new one.",
            "error": "token_expired"
        }), 400
    except BadSignature:
        return jsonify({
            "msg": "Invalid or tampered verification link.",
            "error": "token_invalid"
        }), 400

    user = db.Users.find_one({"email": email})
    if not user:
        return jsonify({"msg": "User not found"}), 404

    if user.get('is_verified'):
        return jsonify({"msg": "Email already verified. You can log in."}), 200

    db.Users.update_one(
        {"email": email},
        {"$set": {"is_verified": True, "verified_at": now_utc()}}
    )

    return jsonify({"msg": "Email verified successfully. You can now log in."}), 200


@auth_bp.route('/resend-verification', methods=['POST'])
@limiter.limit("3 per hour")      # strict — prevents email bombing
def resend_verification():
    """Allow users to request a new verification email."""
    data  = request.get_json()
    email = data.get('email', '').strip().lower()

    if not email:
        return jsonify({"msg": "Email is required"}), 400

    user = db.Users.find_one({"email": email})

    # Always return 200 — never reveal whether an email exists (prevents enumeration)
    if not user:
        return jsonify({"msg": "If that email exists and is unverified, a new link has been sent."}), 200

    if user.get('is_verified'):
        try:
            from utils.email_sender import send_already_verified_email
            send_already_verified_email(email)
        except Exception as e:
            current_app.logger.error(f"Failed to send already-verified email to {email}: {e}")
        return jsonify({"msg": "If that email exists and is unverified, a new link has been sent."}), 200

    try:
        token = generate_verification_token(email)
        send_verification_email(user['name'], email, token)
    except Exception as e:
        current_app.logger.error(f"Failed to resend verification to {email}: {e}")
    return jsonify({"msg": "If that email exists and is unverified, a new link has been sent."}), 200


@auth_bp.route('/google-client-id', methods=['GET'])
def get_google_client_id():
    from config import Config
    return jsonify({"client_id": Config.GOOGLE_CLIENT_ID}), 200


@auth_bp.route('/google-login', methods=['POST'])
@limiter.limit("15 per minute")
def google_login():
    """
    Authenticate a user via Google OAuth 2.0.
    Verifies the Google ID Token (credential JWT) and logs in or auto-registers the user.
    """
    data = request.get_json()
    token = data.get('credential')
    if not token:
        return jsonify({"msg": "Missing Google credential"}), 400

    from google.oauth2 import id_token
    from google.auth.transport import requests
    from config import Config

    client_id = Config.GOOGLE_CLIENT_ID
    if not client_id:
        return jsonify({"msg": "Google Authentication is not configured on the server."}), 500

    try:
        # Verify the Google ID Token JWT
        idinfo = id_token.verify_oauth2_token(token, requests.Request(), client_id)

        email = idinfo.get('email').strip().lower()
        name = idinfo.get('name')

        if not idinfo.get('email_verified'):
            return jsonify({"msg": "Google email is not verified."}), 400

        # Find user or auto-register if new
        user = db.Users.find_one({"email": email})
        if not user:
            # Generate a strong secure random password since they log in via Google
            import secrets
            random_pw = secrets.token_urlsafe(16)
            hashed_password = bcrypt.hashpw(random_pw.encode('utf-8'), bcrypt.gensalt())
            
            user = {
                "name":          name,
                "email":         email,
                "password":      hashed_password.decode('utf-8'),
                "role":          'Sales Executive',
                "is_verified":   True,   # Already verified by Google
                "google_oauth":  True,   # Google-authenticated flag
                "created_at":    now_utc()
            }
            db.Users.insert_one(user)
            user = db.Users.find_one({"email": email})

        # Generate standard JWT access token for current app session
        access_token = create_access_token(
            identity=str(user['_id']),
            additional_claims={'role': user['role']}
        )

        # Handle 2FA for Admin accounts if configured
        if user['role'] == 'Admin':
            if user.get('totp_enabled'):
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
                resp = jsonify(
                    access_token=access_token,
                    user={
                        'name': user['name'],
                        'email': user['email'],
                        'role': user['role'],
                        'totp_enabled': False
                    },
                    requires_2fa_setup=True
                )
                _issue_tokens(user, resp)
                return resp, 200

        resp = jsonify(
            access_token=access_token,
            user={'name': user['name'], 'email': user['email'], 'role': user['role']}
        )
        _issue_tokens(user, resp)
        return resp, 200

    except ValueError:
        # Invalid signature or expired token
        return jsonify({"msg": "Invalid or expired Google credential"}), 401
    except Exception as e:
        current_app.logger.error(f"Google login failed: {e}")
        return jsonify({"msg": "Google Authentication failed. Please try again."}), 500



