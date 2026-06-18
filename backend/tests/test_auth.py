import datetime
from database import db
from unittest.mock import patch


class TestAuthFlows:
    def test_valid_registration(self, client):
        res = client.post('/api/v1/auth/register', json={
            'name': 'Sales User', 'email': 'sales@bidflow.com',
            'password': 'Salespass123!', 'role': 'Sales Executive'
        })
        assert res.status_code == 201
        assert 'Account created' in res.get_json().get('msg')

    def test_duplicate_registration(self, client):
        client.post('/api/v1/auth/register', json={
            'name': 'Sales User', 'email': 'dup@bidflow.com',
            'password': 'Salespass123!', 'role': 'Sales Executive'
        })
        res = client.post('/api/v1/auth/register', json={
            'name': 'Sales User Dup', 'email': 'dup@bidflow.com',
            'password': 'Salespass123!', 'role': 'Sales Executive'
        })
        assert res.status_code == 400
        assert 'already exists' in res.get_json().get('msg')

    def test_missing_fields(self, client):
        res = client.post('/api/v1/auth/register', json={
            'name': 'No Password', 'email': 'nopass@bidflow.com'
        })
        assert res.status_code == 400
        assert 'Missing required fields' in res.get_json().get('msg')

    def test_valid_login(self, client, auth_headers):
        auth_headers('Sales User', 'sales@bidflow.com', 'Salespass123!')
        res = client.post('/api/v1/auth/login', json={
            'email': 'sales@bidflow.com', 'password': 'Salespass123!'
        })
        assert res.status_code == 200
        data = res.get_json()
        assert 'access_token' in data
        assert data['user']['email'] == 'sales@bidflow.com'
        assert data['user']['role'] == 'Sales Executive'

    def test_bad_password(self, client, auth_headers):
        auth_headers('Sales User', 'sales@bidflow.com', 'Salespass123!')
        res = client.post('/api/v1/auth/login', json={
            'email': 'sales@bidflow.com', 'password': 'wrongpass'
        })
        assert res.status_code == 401
        assert 'Bad email or password' in res.get_json().get('msg')

    def test_me_endpoint(self, client, auth_headers):
        headers = auth_headers('Sales User', 'sales@bidflow.com', 'Salespass123!')
        res = client.get('/api/v1/auth/me', headers=headers)
        assert res.status_code == 200
        assert res.get_json()['email'] == 'sales@bidflow.com'


class TestJWTLogout:
    def test_logout_endpoint(self, client, auth_headers):
        headers = auth_headers('Logout User', 'logout@bidflow.com', 'Logoutpass123!')

        res = client.get('/api/v1/auth/me', headers=headers)
        assert res.status_code == 200

        logout_res = client.post('/api/v1/auth/logout', headers=headers)
        assert logout_res.status_code == 200
        assert 'Successfully logged out' in logout_res.get_json().get('msg')


class TestEmailVerification:
    def test_email_verification_flow(self, client):
        register_payload = {
            'name': 'Verify Me', 'email': 'verify@bidflow.com',
            'password': 'VerifyPassword123!'
        }
        res = client.post('/api/v1/auth/register', json=register_payload)
        assert res.status_code == 201
        assert 'Please check your email' in res.get_json()['msg']

        user_in_db = db.Users.find_one({'email': 'verify@bidflow.com'})
        assert user_in_db is not None
        assert not user_in_db.get('is_verified', False)

        login_res = client.post('/api/v1/auth/login', json={
            'email': 'verify@bidflow.com', 'password': 'VerifyPassword123!'
        })
        assert login_res.status_code == 403
        assert login_res.get_json().get('error') == 'email_not_verified'

        from utils.email_tokens import generate_verification_token
        token = generate_verification_token('verify@bidflow.com')

        verify_res = client.get(f'/api/v1/auth/verify-email?token={token}')
        assert verify_res.status_code == 200
        assert 'verified successfully' in verify_res.get_json()['msg']

        user_after = db.Users.find_one({'email': 'verify@bidflow.com'})
        assert user_after.get('is_verified', False)

        login_success = client.post('/api/v1/auth/login', json={
            'email': 'verify@bidflow.com', 'password': 'VerifyPassword123!'
        })
        assert login_success.status_code == 200
        assert 'access_token' in login_success.get_json()

    def test_resend_verification(self, client, auth_headers):
        auth_headers('Verify User', 'verify2@bidflow.com', 'Verify123!')
        resend_res = client.post('/api/v1/auth/resend-verification', json={
            'email': 'verify2@bidflow.com'
        })
        assert resend_res.status_code == 200

        missing_res = client.post('/api/v1/auth/resend-verification', json={
            'email': 'nonexistent@bidflow.com'
        })
        assert missing_res.status_code == 200


class TestGoogleOAuth:
    @patch('utils.email_sender.send_already_verified_email')
    @patch('google.oauth2.id_token.verify_oauth2_token')
    def test_google_oauth_login(self, mock_verify, mock_send, client):
        mock_verify.return_value = {
            'email': 'google_user@bidflow.com',
            'name': 'Google User',
            'email_verified': True
        }

        from config import Config
        old_client_id = Config.GOOGLE_CLIENT_ID
        Config.GOOGLE_CLIENT_ID = 'mock-client-id'

        res = client.post('/api/v1/auth/google-login', json={'credential': 'mock-jwt-token'})
        assert res.status_code == 200
        data = res.get_json()
        assert 'access_token' in data
        assert data['user']['email'] == 'google_user@bidflow.com'

        user = db.Users.find_one({'email': 'google_user@bidflow.com'})
        assert user is not None
        assert user.get('is_verified')
        assert user.get('google_oauth')

        res2 = client.post('/api/v1/auth/google-login', json={'credential': 'mock-jwt-token'})
        assert res2.status_code == 200

        Config.GOOGLE_CLIENT_ID = old_client_id

    @patch('utils.email_sender.send_already_verified_email')
    @patch('google.oauth2.id_token.verify_oauth2_token')
    def test_already_verified_resend(self, mock_verify, mock_send, client):
        mock_verify.return_value = {
            'email': 'google_user2@bidflow.com',
            'name': 'Google User 2',
            'email_verified': True
        }

        from config import Config
        old_client_id = Config.GOOGLE_CLIENT_ID
        Config.GOOGLE_CLIENT_ID = 'mock-client-id'

        client.post('/api/v1/auth/google-login', json={'credential': 'mock-jwt-token'})
        Config.GOOGLE_CLIENT_ID = old_client_id

        resend_res = client.post('/api/v1/auth/resend-verification', json={
            'email': 'google_user2@bidflow.com'
        })
        assert resend_res.status_code == 200
        assert 'If that email exists' in resend_res.get_json().get('msg')
        mock_send.assert_called_once_with('google_user2@bidflow.com')
