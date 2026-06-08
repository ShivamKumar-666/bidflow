import os
os.environ['MONGO_URI'] = 'mongodb://localhost:27017/bidflow_test'
os.environ['SECRET_KEY'] = 'test-secret-key-123'
os.environ['JWT_SECRET_KEY'] = 'test-jwt-secret-key-123'
os.environ['FLASK_ENV'] = 'testing'

import pytest
import re
import io
from bson import ObjectId
from app import create_app
from database import db
from unittest.mock import patch

BID_ID_PATTERN = re.compile(r'^BID-[0-9a-f]{8}$')
ENQ_ID_PATTERN = re.compile(r'^ENQ-[0-9a-f]{8}$')

COLLECTIONS = ['Users', 'Enquiries', 'Bids', 'AuditLogs', 'Documents', 'RevokedTokens', 'Notifications', 'ModelVersions']


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
    """Clear all test collections before and after each test."""
    for col in COLLECTIONS:
        getattr(db, col).delete_many({})
    yield
    for col in COLLECTIONS:
        getattr(db, col).delete_many({})


@pytest.fixture
def auth_headers(client):
    """Register a user and return auth headers."""
    def _auth(name='Exec User', email='exec@bidflow.com', password='exec1234!', role='Sales Executive'):
        if not any(c.isupper() for c in password):
            password = password.capitalize()
        client.post('/api/auth/register', json={
            'name': name, 'email': email, 'password': password, 'role': role
        })
        db.Users.update_one(
            {'email': email.strip().lower()},
            {'$set': {'is_verified': True}}
        )
        if role != 'Sales Executive':
            db.Users.update_one(
                {'email': email.strip().lower()},
                {'$set': {'role': role}}
            )
        res = client.post('/api/auth/login', json={'email': email, 'password': password})
        token = res.get_json().get('access_token')
        return {'Authorization': f'Bearer {token}'}
    return _auth


@pytest.fixture
def mock_socketio():
    with patch('routes.bids.socketio.emit') as mock_emit:
        yield mock_emit
