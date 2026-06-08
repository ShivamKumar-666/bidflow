import re
import secrets

import bcrypt
from database import db
from datetime import timedelta
from flask import current_app
from flask_jwt_extended import create_access_token, create_refresh_token
from utils.auth_helpers import now_utc


class AuthService:
    """Business logic for authentication, user management, and token handling."""

    EMAIL_REGEX = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')

    @classmethod
    def validate_password(cls, password: str) -> str | None:
        if not password or len(password) < 8:
            return "Password must be at least 8 characters long"
        if not re.search(r'[A-Z]', password):
            return "Password must contain at least one uppercase letter"
        if not re.search(r'[0-9]', password):
            return "Password must contain at least one number"
        if not re.search(r'[^a-zA-Z0-9]', password):
            return "Password must contain at least one special character (!@#$% etc.)"
        return None

    @classmethod
    def validate_email(cls, email: str) -> str | None:
        if not email:
            return "Email is required"
        email = email.strip().lower()
        if not cls.EMAIL_REGEX.match(email):
            return "Invalid email format"
        return None

    @classmethod
    def hash_password(cls, password: str) -> str:
        return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    @classmethod
    def verify_password(cls, password: str, hashed: str) -> bool:
        return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

    @classmethod
    def register_user(cls, name: str, email: str, password: str) -> tuple:
        email = email.strip().lower()

        if db.Users.find_one({"email": email}):
            return None, "Email already exists"

        user = {
            "name": name,
            "email": email,
            "password": cls.hash_password(password),
            "role": 'Sales Executive',
            "is_verified": False,
            "created_at": now_utc()
        }
        db.Users.insert_one(user)
        return user, None

    @classmethod
    def authenticate(cls, email: str, password: str) -> tuple:
        email = email.strip().lower()
        user = db.Users.find_one({"email": email})
        if not user or not cls.verify_password(password, user['password']):
            return None, "Bad email or password"
        return user, None

    @classmethod
    def is_user_verified(cls, user: dict) -> bool:
        return user.get('is_verified', False)

    @classmethod
    def requires_2fa(cls, user: dict) -> bool:
        return user['role'] == 'Admin' and user.get('totp_enabled')

    @classmethod
    def requires_2fa_setup(cls, user: dict) -> bool:
        return user['role'] == 'Admin' and not user.get('totp_enabled')

    @classmethod
    def create_tokens(cls, user: dict) -> tuple:
        access_token = create_access_token(
            identity=str(user['_id']),
            additional_claims={'role': user['role']}
        )
        refresh_token = create_refresh_token(
            identity=str(user['_id']),
            additional_claims={'role': user['role']}
        )
        return access_token, refresh_token

    @classmethod
    def create_2fa_temp_token(cls, user: dict) -> str:
        return create_access_token(
            identity=str(user['_id']),
            additional_claims={
                'role': user['role'],
                'sub_type': '2fa_pending'
            },
            expires_delta=timedelta(minutes=5)
        )

    @classmethod
    def get_user_response(cls, user: dict) -> dict:
        return {
            'name': user['name'],
            'email': user['email'],
            'role': user['role'],
            'totp_enabled': user.get('totp_enabled', False)
        }

    @classmethod
    def verify_email(cls, email: str) -> tuple:
        user = db.Users.find_one({"email": email})
        if not user:
            return None, "User not found"
        if user.get('is_verified'):
            return user, "Email already verified"
        db.Users.update_one(
            {"email": email},
            {"$set": {"is_verified": True, "verified_at": now_utc()}}
        )
        return user, None

    @classmethod
    def update_profile(cls, user_id: str, data: dict) -> tuple:
        update_data = {}

        name = data.get('name')
        if name is not None:
            if not name.strip():
                return None, "Name cannot be empty"
            update_data["name"] = name.strip()

        industry = data.get('industry')
        if industry is not None:
            update_data["industry"] = industry

        win_rate = data.get('winRate')
        if win_rate is not None:
            try:
                win_rate_val = int(win_rate)
                if not (0 <= win_rate_val <= 100):
                    return None, "Win rate must be between 0 and 100"
                update_data["winRate"] = win_rate_val
            except ValueError:
                return None, "Invalid win rate format"

        target_bid_value = data.get('targetBidValue')
        if target_bid_value is not None:
            try:
                target_val = float(target_bid_value)
                if target_val < 0:
                    return None, "Target bid value must be non-negative"
                update_data["targetBidValue"] = target_val
            except ValueError:
                return None, "Invalid target bid value format"

        bio = data.get('bio')
        if bio is not None:
            update_data["bio"] = bio

        if not update_data:
            return None, "No update fields provided"

        from bson.objectid import ObjectId
        db.Users.update_one({"_id": ObjectId(user_id)}, {"$set": update_data})
        user = db.Users.find_one({"_id": ObjectId(user_id)}, {
            "name": 1, "email": 1, "role": 1, "industry": 1,
            "winRate": 1, "targetBidValue": 1, "bio": 1,
            "totp_enabled": 1
        })
        return user, None

    @classmethod
    def register_google_user(cls, email: str, name: str) -> dict:
        random_pw = secrets.token_urlsafe(16)
        hashed_password = cls.hash_password(random_pw)

        user = {
            "name": name,
            "email": email,
            "password": hashed_password,
            "role": 'Sales Executive',
            "is_verified": True,
            "google_oauth": True,
            "created_at": now_utc()
        }
        db.Users.insert_one(user)
        return db.Users.find_one({"email": email})
