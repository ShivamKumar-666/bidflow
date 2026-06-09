from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import (
    create_access_token, get_jwt_identity, get_jwt, jwt_required,
    set_access_cookies, set_refresh_cookies, unset_jwt_cookies
)
from database import db
from extensions import limiter
from datetime import timedelta
from services import AuthService
from utils.auth_helpers import now_utc
from utils.email_tokens import generate_verification_token, confirm_verification_token
from utils.email_sender import send_verification_email
from itsdangerous import SignatureExpired, BadSignature


auth_bp = Blueprint('auth', __name__)


def _issue_tokens(user, response):
    access_token, refresh_token = AuthService.create_tokens(user)
    set_access_cookies(response, access_token)
    set_refresh_cookies(response, refresh_token)
    return access_token


@auth_bp.route('/register', methods=['POST'])
@limiter.limit("5 per minute")
def register():
    data = request.get_json()
    name = data.get('name')
    email = data.get('email')
    password = data.get('password')

    if not email or not password or not name:
        return jsonify({"msg": "Missing required fields"}), 400

    pw_error = AuthService.validate_password(password)
    if pw_error:
        return jsonify({"msg": pw_error}), 400

    email_error = AuthService.validate_email(email)
    if email_error:
        return jsonify({"msg": email_error}), 400

    email = email.strip().lower()

    user, error = AuthService.register_user(name, email, password)
    if error:
        return jsonify({"msg": error}), 400

    try:
        token = generate_verification_token(email)
        send_verification_email(name, email, token)
    except Exception as e:
        current_app.logger.error(f"Failed to send verification email to {email}: {e}")

    return jsonify({
        "msg": "Account created. Please check your email to verify your account before logging in."
    }), 201


@auth_bp.route('/login', methods=['POST'])
@limiter.limit("10 per minute; 50 per hour")
def login():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({"msg": "Missing email or password"}), 400

    user, error = AuthService.authenticate(email, password)
    if error:
        return jsonify({"msg": error}), 401

    if not AuthService.is_user_verified(user):
        return jsonify({
            "msg": "Please verify your email address before logging in.",
            "error": "email_not_verified"
        }), 403

    access_token, _ = AuthService.create_tokens(user)

    if AuthService.requires_2fa(user):
        temp_token = AuthService.create_2fa_temp_token(user)
        return jsonify({
            'requires_2fa': True,
            'temp_token': temp_token
        }), 200

    if AuthService.requires_2fa_setup(user):
        resp = jsonify(
            access_token=access_token,
            user=AuthService.get_user_response(user),
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
    from datetime import timezone, datetime as dt
    jwt_payload = get_jwt()
    jti = jwt_payload.get("jti")
    exp = jwt_payload.get("exp")

    if not jti:
        return jsonify({"msg": "Invalid token"}), 400

    expiry_dt = dt.fromtimestamp(exp, tz=timezone.utc)

    db.RevokedTokens.update_one(
        {"jti": jti},
        {"$setOnInsert": {"jti": jti, "exp": expiry_dt}},
        upsert=True
    )
    resp = jsonify({"msg": "Successfully logged out."})
    unset_jwt_cookies(resp)
    return resp, 200


@auth_bp.route('/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    from bson.objectid import ObjectId
    user_id = get_jwt_identity()
    user = db.Users.find_one({"_id": ObjectId(user_id)})
    if not user:
        return jsonify({"msg": "User not found"}), 404

    new_access_token, _ = AuthService.create_tokens(user)
    resp = jsonify({"msg": "Token refreshed"})
    set_access_cookies(resp, new_access_token)
    return resp, 200


@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def me():
    from bson.objectid import ObjectId
    current_user_id = get_jwt_identity()
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
    data = request.get_json()

    user, error = AuthService.update_profile(current_user_id, data)
    if error:
        status = 400
        return jsonify({"msg": error}), status

    user['_id'] = str(user['_id'])
    return jsonify(user), 200


@auth_bp.route('/verify-email', methods=['GET'])
@limiter.limit("10 per minute")
def verify_email():
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

    user, error = AuthService.verify_email(email)
    if error == "User not found":
        return jsonify({"msg": error}), 404
    if error == "Email already verified":
        return jsonify({"msg": "Email already verified. You can log in."}), 200

    return jsonify({"msg": "Email verified successfully. You can now log in."}), 200


@auth_bp.route('/resend-verification', methods=['POST'])
@limiter.limit("3 per hour")
def resend_verification():
    data = request.get_json()
    email = data.get('email', '').strip().lower()

    if not email:
        return jsonify({"msg": "Email is required"}), 400

    user = db.Users.find_one({"email": email})

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
        idinfo = id_token.verify_oauth2_token(token, requests.Request(), client_id)

        email = idinfo.get('email')
        if not email:
            return jsonify({"msg": "Google account has no email address."}), 400
        email = email.strip().lower()
        name = idinfo.get('name')

        if not idinfo.get('email_verified'):
            return jsonify({"msg": "Google email is not verified."}), 400

        user = db.Users.find_one({"email": email})
        if not user:
            user = AuthService.register_google_user(email, name)
        else:
            # Existing user found — if registered locally, mark as verified via Google
            if not user.get("google_oauth"):
                db.Users.update_one(
                    {"email": email},
                    {"$set": {"is_verified": True, "google_oauth": True, "verified_at": now_utc()}}
                )
                user = db.Users.find_one({"email": email})

        access_token, _ = AuthService.create_tokens(user)

        if AuthService.requires_2fa(user):
            temp_token = AuthService.create_2fa_temp_token(user)
            return jsonify({
                'requires_2fa': True,
                'temp_token': temp_token
            }), 200

        if AuthService.requires_2fa_setup(user):
            resp = jsonify(
                access_token=access_token,
                user=AuthService.get_user_response(user),
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
        return jsonify({"msg": "Invalid or expired Google credential"}), 401
    except Exception as e:
        current_app.logger.error(f"Google login failed: {e}")
        return jsonify({"msg": "Google Authentication failed. Please try again."}), 500
