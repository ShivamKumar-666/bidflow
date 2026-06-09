import os
os.environ['MONGO_URI'] = 'mongodb://localhost:27017/bidflow_test'
os.environ['SECRET_KEY'] = 'test-secret-key-123'
os.environ['JWT_SECRET_KEY'] = 'test-jwt-secret-key-123'
os.environ['FLASK_ENV'] = 'testing'

import pytest
import re
import io
import bcrypt
from bson import ObjectId
from app import create_app
from database import db
from unittest.mock import patch
from flask_jwt_extended import create_access_token
from utils.auth_helpers import now_utc

BID_ID_PATTERN = re.compile(r'^BID-[0-9a-f]{8}$')
ENQ_ID_PATTERN = re.compile(r'^ENQ-[0-9a-f]{8}$')

COLLECTIONS = ['Users', 'Enquiries', 'Bids', 'AuditLogs', 'Documents', 'RevokedTokens', 'Notifications', 'ModelVersions']

# Pre-compute bcrypt hash once at import time — avoids ~100ms per test call
# Uses low rounds (4) for test speed; production uses default (12)
_HASH_CACHE = {}


def _get_hashed_password(password: str) -> str:
    """Get or compute a low-round bcrypt hash for the given password."""
    if password not in _HASH_CACHE:
        _HASH_CACHE[password] = bcrypt.hashpw(
            password.encode('utf-8'), bcrypt.gensalt(rounds=4)
        ).decode('utf-8')
    return _HASH_CACHE[password]


@pytest.fixture(scope='session')
def app():
    application = create_app()
    application.config['RATELIMIT_ENABLED'] = False
    application.config['JWT_COOKIE_CSRF_PROTECT'] = False
    return application


@pytest.fixture(scope='function')
def client(app):
    with app.test_client() as c:
        yield c


@pytest.fixture(autouse=True)
def clean_db():
    """Drop all test collections before each test. Much faster than delete_many."""
    for col in COLLECTIONS:
        try:
            getattr(db, col).drop()
        except Exception:
            pass
    yield


@pytest.fixture
def auth_headers(client):
    """Create a user directly in MongoDB and return auth headers.
    Bypasses HTTP register/login endpoints to avoid bcrypt overhead per call."""
    def _auth(name='Exec User', email='exec@bidflow.com', password='exec1234!', role='Sales Executive'):
        email_lower = email.strip().lower()

        # Create user directly in MongoDB with low-round bcrypt hash
        db.Users.update_one(
            {'email': email_lower},
            {'$set': {
                'name': name,
                'email': email_lower,
                'password': _get_hashed_password(password),
                'role': role,
                'is_verified': True,
                'created_at': now_utc(),
            }},
            upsert=True
        )

        # Create JWT token directly within app context
        with client.application.app_context():
            token = create_access_token(
                identity=str(db.Users.find_one({'email': email_lower})['_id']),
                additional_claims={'role': role}
            )
        return {'Authorization': f'Bearer {token}'}
    return _auth


@pytest.fixture
def mock_socketio():
    with patch('routes.bids.socketio.emit') as mock_emit:
        yield mock_emit
