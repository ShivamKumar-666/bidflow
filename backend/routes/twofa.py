from flask import Blueprint, request, jsonify
from extensions import limiter
from flask_jwt_extended import (
    create_access_token, create_refresh_token, jwt_required,
    get_jwt_identity, get_jwt,
    set_access_cookies, set_refresh_cookies
)
import pyotp
import qrcode
import qrcode.image.svg
import io
import base64
import secrets
import string
from datetime import datetime, timezone
import bcrypt
from database import db
from bson.objectid import ObjectId
from utils.auth_helpers import admin_required

twofa_bp = Blueprint('twofa', __name__)

BACKUP_CODE_LENGTH = 8
BACKUP_CODE_COUNT = 8

def _generate_backup_codes():
    """Generate 8 random backup codes and return (plaintext_list, hashed_list)."""
    alphabet = string.ascii_uppercase + string.digits
    codes = []
    hashed = []
    for _ in range(BACKUP_CODE_COUNT):
        code = ''.join(secrets.choice(alphabet) for _ in range(BACKUP_CODE_LENGTH))
        codes.append(code)
        hashed.append(bcrypt.hashpw(code.encode(), bcrypt.gensalt()).decode())
    return codes, hashed


def _check_backup_code(entered_code, hashed_codes):
    """Return index of matching backup code or -1 if none match."""
    for i, h in enumerate(hashed_codes):
        if bcrypt.checkpw(entered_code.encode(), h.encode()):
            return i
    return -1


@twofa_bp.route('/setup', methods=['GET'])
@jwt_required()
@admin_required
@limiter.limit("3 per minute")
def setup_2fa():
    """
    Generate a new TOTP secret and return a base64-encoded QR code PNG.
    The secret is stored temporarily (not yet 'enabled') until /enable is called.
    Only Admins may call this.
    """
    user_id = get_jwt_identity()
    user = db.Users.find_one({'_id': ObjectId(user_id)})
    if not user:
        return jsonify({'msg': 'User not found'}), 404

    # Generate a fresh TOTP secret
    secret = pyotp.random_base32()

    # Store it (pending) — not enabled yet
    db.Users.update_one(
        {'_id': ObjectId(user_id)},
        {'$set': {'totp_secret_pending': secret}}
    )

    # Build the OTP Auth URI
    totp = pyotp.TOTP(secret)
    otp_uri = totp.provisioning_uri(
        name=user.get('email', ''),
        issuer_name='BidFlow'
    )

    # Generate QR code as base64 PNG
    img = qrcode.make(otp_uri)
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    qr_b64 = base64.b64encode(buf.getvalue()).decode()

    return jsonify({
        'qr_code': f'data:image/png;base64,{qr_b64}',
    }), 200


@twofa_bp.route('/enable', methods=['POST'])
@jwt_required()
@admin_required
@limiter.limit("3 per minute")
def enable_2fa():
    """
    Verify the user's first TOTP code to confirm setup.
    On success: save the secret permanently, generate backup codes.
    """
    user_id = get_jwt_identity()
    data = request.get_json() or {}
    code = data.get('code', '').strip()

    user = db.Users.find_one({'_id': ObjectId(user_id)})
    if not user:
        return jsonify({'msg': 'User not found'}), 404

    secret = user.get('totp_secret_pending')
    if not secret:
        return jsonify({'msg': '2FA setup not initiated. Call /setup first.'}), 400

    totp = pyotp.TOTP(secret)
    if not totp.verify(code, valid_window=1):
        return jsonify({'msg': 'Invalid verification code. Please try again.'}), 400

    current_counter = totp.timecode(datetime.now(timezone.utc))

    # Generate backup codes
    plain_codes, hashed_codes = _generate_backup_codes()

    db.Users.update_one(
        {'_id': ObjectId(user_id)},
        {
            '$set': {
                'totp_secret': secret,
                'totp_enabled': True,
                'backup_codes': hashed_codes,
                'last_totp_counter': current_counter
            },
            '$unset': {'totp_secret_pending': ''}
        }
    )

    return jsonify({
        'msg': '2FA enabled successfully.',
        'backup_codes': plain_codes  # Shown once — user must save these
    }), 200


@twofa_bp.route('/verify', methods=['POST'])
@limiter.limit("5 per minute")
def verify_2fa():
    """
    Called during login after password is validated.
    Accepts a temp_token + 6-digit TOTP code (or backup code).
    Returns a full-access JWT on success.
    """
    from flask_jwt_extended import decode_token
    data = request.get_json() or {}
    temp_token = data.get('temp_token', '').strip()
    code = data.get('code', '').strip()

    if not temp_token or not code:
        return jsonify({'msg': 'temp_token and code are required'}), 400

    try:
        decoded = decode_token(temp_token)
    except Exception:
        return jsonify({'msg': 'Invalid or expired session. Please log in again.'}), 401

    # Ensure it's a 2FA temp token
    if decoded.get('sub_type') != '2fa_pending':
        return jsonify({'msg': 'Invalid token type'}), 401

    user_id = decoded['sub']
    user = db.Users.find_one({'_id': ObjectId(user_id)})
    if not user or not user.get('totp_enabled'):
        return jsonify({'msg': 'User not found or 2FA not enabled'}), 404

    # Try TOTP first
    totp = pyotp.TOTP(user['totp_secret'])
    current_counter = totp.timecode(datetime.now(timezone.utc))
    stored_counter = user.get('last_totp_counter', 0)

    if current_counter <= stored_counter:
        return jsonify({'msg': 'Code already used. Please wait for the next code.'}), 401

    if totp.verify(code, valid_window=1):
        db.Users.update_one(
            {'_id': ObjectId(user_id)},
            {'$set': {'last_totp_counter': current_counter}}
        )
        # Issue full access token + refresh token (SEC-01, SEC-06)
        full_token = create_access_token(
            identity=user_id,
            additional_claims={'role': user['role']}
        )
        refresh_token = create_refresh_token(
            identity=user_id,
            additional_claims={'role': user['role']}
        )
        resp = jsonify({
            'access_token': full_token,
            'user': {
                'name': user['name'],
                'email': user['email'],
                'role': user['role'],
                'totp_enabled': True
            }
        })
        set_access_cookies(resp, full_token)
        set_refresh_cookies(resp, refresh_token)
        return resp, 200

    # Try backup codes
    backup_codes = user.get('backup_codes', [])
    match_idx = _check_backup_code(code, backup_codes)
    if match_idx >= 0:
        # Remove used backup code
        backup_codes.pop(match_idx)
        db.Users.update_one(
            {'_id': ObjectId(user_id)},
            {'$set': {'backup_codes': backup_codes}}
        )
        full_token = create_access_token(
            identity=user_id,
            additional_claims={'role': user['role']}
        )
        refresh_token = create_refresh_token(
            identity=user_id,
            additional_claims={'role': user['role']}
        )
        remaining = len(backup_codes)
        resp = jsonify({
            'access_token': full_token,
            'user': {
                'name': user['name'],
                'email': user['email'],
                'role': user['role'],
                'totp_enabled': True
            },
            'backup_code_used': True,
            'backup_codes_remaining': remaining
        })
        set_access_cookies(resp, full_token)
        set_refresh_cookies(resp, refresh_token)
        return resp, 200

    return jsonify({'msg': 'Invalid code. Please try again.'}), 401


@twofa_bp.route('/disable', methods=['POST'])
@jwt_required()
@admin_required
@limiter.limit("5 per minute")
def disable_2fa():
    """Disable 2FA. Requires current password for security."""
    user_id = get_jwt_identity()
    data = request.get_json() or {}
    password = data.get('password', '')

    user = db.Users.find_one({'_id': ObjectId(user_id)})
    if not user:
        return jsonify({'msg': 'User not found'}), 404

    stored_pw = user.get('password')
    if not stored_pw:
        return jsonify({'msg': 'Password-based authentication not available for this account'}), 401

    if not bcrypt.checkpw(password.encode(), stored_pw.encode()):
        return jsonify({'msg': 'Incorrect password'}), 401

    db.Users.update_one(
        {'_id': ObjectId(user_id)},
        {
            '$set': {'totp_enabled': False},
            '$unset': {'totp_secret': '', 'backup_codes': '', 'totp_secret_pending': ''}
        }
    )

    return jsonify({'msg': '2FA has been disabled.'}), 200


@twofa_bp.route('/backup-codes', methods=['GET'])
@jwt_required()
@limiter.limit("10 per minute")
def get_backup_codes_count():
    """Returns how many backup codes remain (not the codes themselves)."""
    user_id = get_jwt_identity()
    user = db.Users.find_one({'_id': ObjectId(user_id)}, {'backup_codes': 1})
    if not user:
        return jsonify({'msg': 'User not found'}), 404

    count = len(user.get('backup_codes', []))
    return jsonify({'backup_codes_remaining': count}), 200


@twofa_bp.route('/regenerate-backup-codes', methods=['POST'])
@jwt_required()
@admin_required
@limiter.limit("3 per minute")
def regenerate_backup_codes():
    """Regenerate all backup codes. Requires TOTP code for security."""
    user_id = get_jwt_identity()
    data = request.get_json() or {}
    totp_code = data.get('code', '').strip()

    user = db.Users.find_one({'_id': ObjectId(user_id)})
    if not user or not user.get('totp_enabled'):
        return jsonify({'msg': '2FA is not enabled'}), 400

    totp = pyotp.TOTP(user['totp_secret'])
    current_counter = totp.timecode(datetime.now(timezone.utc))
    stored_counter = user.get('last_totp_counter', 0)

    if current_counter <= stored_counter:
        return jsonify({'msg': 'Code already used. Please wait for the next code.'}), 401

    if not totp.verify(totp_code, valid_window=1):
        return jsonify({'msg': 'Invalid TOTP code'}), 401

    db.Users.update_one(
        {'_id': ObjectId(user_id)},
        {'$set': {'last_totp_counter': current_counter}}
    )

    plain_codes, hashed_codes = _generate_backup_codes()
    db.Users.update_one(
        {'_id': ObjectId(user_id)},
        {'$set': {'backup_codes': hashed_codes}}
    )

    return jsonify({
        'msg': 'Backup codes regenerated.',
        'backup_codes': plain_codes
    }), 200
