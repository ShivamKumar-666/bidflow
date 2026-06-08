import datetime
from bson import ObjectId
from database import db
from unittest.mock import patch


class TestAuthRefresh:
    def test_refresh_token(self, client):
        client.post('/api/auth/register', json={
            'name': 'Refresh User', 'email': 'refresh@bidflow.com',
            'password': 'Refresh123!'
        })
        db.Users.update_one({'email': 'refresh@bidflow.com'}, {'$set': {'is_verified': True}})
        login_res = client.post('/api/auth/login', json={
            'email': 'refresh@bidflow.com', 'password': 'Refresh123!'
        })
        assert login_res.status_code == 200
        res = client.post('/api/auth/refresh')
        assert res.status_code == 200
        assert res.get_json()['msg'] == 'Token refreshed'

    def test_refresh_no_cookie(self, client):
        res = client.post('/api/auth/refresh')
        assert res.status_code == 401


class TestAuthGoogleClientId:
    def test_google_client_id(self, client):
        res = client.get('/api/auth/google-client-id')
        assert res.status_code == 200
        data = res.get_json()
        assert 'client_id' in data


class TestAuthProfile:
    def test_profile_update(self, client, auth_headers):
        headers = auth_headers('Profile User', 'profile@bidflow.com', 'Profile123!')
        res = client.put('/api/auth/profile', json={
            'name': 'Updated Name', 'winRate': 75, 'targetBidValue': 100000
        }, headers=headers)
        assert res.status_code == 200
        data = res.get_json()
        assert data['name'] == 'Updated Name'
        assert data['winRate'] == 75
        assert data['targetBidValue'] == 100000

    def test_profile_empty_name(self, client, auth_headers):
        headers = auth_headers('Profile User 2', 'profile2@bidflow.com', 'Profile123!')
        res = client.put('/api/auth/profile', json={'name': ''}, headers=headers)
        assert res.status_code == 400
        assert 'cannot be empty' in res.get_json()['msg']

    def test_profile_invalid_win_rate(self, client, auth_headers):
        headers = auth_headers('Profile User 3', 'profile3@bidflow.com', 'Profile123!')
        res = client.put('/api/auth/profile', json={'winRate': 150}, headers=headers)
        assert res.status_code == 400
        assert 'between 0 and 100' in res.get_json()['msg']

    def test_profile_negative_target(self, client, auth_headers):
        headers = auth_headers('Profile User 4', 'profile4@bidflow.com', 'Profile123!')
        res = client.put('/api/auth/profile', json={'targetBidValue': -5000}, headers=headers)
        assert res.status_code == 400
        assert 'non-negative' in res.get_json()['msg']

    def test_profile_no_fields(self, client, auth_headers):
        headers = auth_headers('Profile User 5', 'profile5@bidflow.com', 'Profile123!')
        res = client.put('/api/auth/profile', json={}, headers=headers)
        assert res.status_code == 400
        assert 'No update fields' in res.get_json()['msg']


class TestEnquiryUpdate:
    def test_update_enquiry(self, client, auth_headers):
        headers = auth_headers('Enq Update', 'enqupd@bidflow.com', 'EnqUpd123!')
        enq_res = client.post('/api/enquiries/', json={
            'customerName': 'Update Corp',
            'contactInformation': 'update@corp.com',
            'productServiceRequired': 'Consulting'
        }, headers=headers)
        enq_id = enq_res.get_json()['_id']
        res = client.put(f'/api/enquiries/{enq_id}', json={
            'customerName': 'Updated Corp', 'priority': 'High'
        }, headers=headers)
        assert res.status_code == 200
        assert res.get_json()['msg'] == 'Enquiry updated'

    def test_update_enquiry_not_found(self, client, auth_headers):
        headers = auth_headers('Enq NotFound', 'enqnf@bidflow.com', 'EnqNf123!')
        fake_id = str(ObjectId())
        res = client.put(f'/api/enquiries/{fake_id}', json={
            'customerName': 'Ghost Corp'
        }, headers=headers)
        assert res.status_code == 404

    def test_update_enquiry_no_valid_fields(self, client, auth_headers):
        headers = auth_headers('Enq NoFields', 'enqnof@bidflow.com', 'EnqNof12!')
        enq_res = client.post('/api/enquiries/', json={
            'customerName': 'NoUpdate Corp',
            'contactInformation': 'no@corp.com',
            'productServiceRequired': 'Testing'
        }, headers=headers)
        enq_id = enq_res.get_json()['_id']
        res = client.put(f'/api/enquiries/{enq_id}', json={
            'invalidField': 'should be ignored'
        }, headers=headers)
        assert res.status_code == 400
        assert 'No valid fields' in res.get_json()['msg']

    def test_enquiry_list_paginated(self, client, auth_headers):
        headers = auth_headers('Enq Paginate', 'enqpage@bidflow.com', 'EnqPage1!')
        for i in range(5):
            client.post('/api/enquiries/', json={
                'customerName': f'Page Corp {i}',
                'contactInformation': f'page{i}@corp.com',
                'productServiceRequired': f'Service {i}'
            }, headers=headers)
        res = client.get('/api/enquiries/?page=1&size=2', headers=headers)
        assert res.status_code == 200
        data = res.get_json()
        assert data['page'] == 1
        assert data['size'] == 2
        assert data['total'] == 5
        assert len(data['items']) == 2


class TestBidDelete:
    def test_delete_bid(self, client, auth_headers):
        headers = auth_headers('Bid Delete', 'biddel@bidflow.com', 'BidDel123!')
        enq_res = client.post('/api/enquiries/', json={
            'customerName': 'Delete Corp',
            'contactInformation': 'del@corp.com',
            'productServiceRequired': 'Removal'
        }, headers=headers)
        enq_id = enq_res.get_json()['enquiryId']
        bid_res = client.post('/api/bids/', json={
            'enquiryId': enq_id, 'amount': 5000,
            'submissionDate': '2026-08-01', 'assignedEmployee': 'Bid Delete'
        }, headers=headers)
        bid_id = bid_res.get_json()['_id']
        res = client.delete(f'/api/bids/{bid_id}', headers=headers)
        assert res.status_code == 200
        assert 'deleted' in res.get_json()['msg'].lower()
        assert db.Bids.find_one({'_id': ObjectId(bid_id)}) is None

    def test_delete_bid_not_found(self, client, auth_headers):
        headers = auth_headers('Bid Del NotFound', 'biddelnf@bidflow.com', 'BidDel1!')
        fake_id = str(ObjectId())
        res = client.delete(f'/api/bids/{fake_id}', headers=headers)
        assert res.status_code in (404, 500)


class TestBidCommentDelete:
    def test_delete_comment(self, client, auth_headers, mock_socketio):
        headers = auth_headers('Comment Del', 'comdel@bidflow.com', 'ComDel12!')
        enq_res = client.post('/api/enquiries/', json={
            'customerName': 'Comment Corp',
            'contactInformation': 'com@corp.com',
            'productServiceRequired': 'Chat'
        }, headers=headers)
        enq_id = enq_res.get_json()['enquiryId']
        bid_res = client.post('/api/bids/', json={
            'enquiryId': enq_id, 'amount': 3000,
            'submissionDate': '2026-08-01', 'assignedEmployee': 'Comment Del'
        }, headers=headers)
        bid_db_id = bid_res.get_json()['_id']
        comment_res = client.post(f'/api/bids/{bid_db_id}/comments', json={
            'text': 'Delete me'
        }, headers=headers)
        comment_id = comment_res.get_json()['_id']
        res = client.delete(f'/api/bids/{bid_db_id}/comments/{comment_id}', headers=headers)
        assert res.status_code == 200
        assert 'deleted' in res.get_json()['msg'].lower()

    def test_delete_comment_bid_not_found(self, client, auth_headers):
        headers = auth_headers('ComDel NoBid', 'comdelnb@bidflow.com', 'ComDel1!')
        fake_id = str(ObjectId())
        fake_comment_id = str(ObjectId())
        res = client.delete(f'/api/bids/{fake_id}/comments/{fake_comment_id}', headers=headers)
        assert res.status_code == 404

    def test_delete_comment_unauthorized(self, client, auth_headers, mock_socketio):
        headers1 = auth_headers('Author', 'author@bidflow.com', 'Author123!')
        headers2 = auth_headers('Other', 'other@bidflow.com', 'Other123!')
        enq_res = client.post('/api/enquiries/', json={
            'customerName': 'Unauth Corp',
            'contactInformation': 'un@corp.com',
            'productServiceRequired': 'Security'
        }, headers=headers1)
        enq_id = enq_res.get_json()['enquiryId']
        bid_res = client.post('/api/bids/', json={
            'enquiryId': enq_id, 'amount': 7000,
            'submissionDate': '2026-08-01', 'assignedEmployee': 'Author'
        }, headers=headers1)
        bid_db_id = bid_res.get_json()['_id']
        comment_res = client.post(f'/api/bids/{bid_db_id}/comments', json={
            'text': 'My comment'
        }, headers=headers1)
        comment_id = comment_res.get_json()['_id']
        res = client.delete(f'/api/bids/{bid_db_id}/comments/{comment_id}', headers=headers2)
        assert res.status_code in (200, 403)


class TestDocuments:
    def test_get_bid_documents_empty(self, client, auth_headers):
        headers = auth_headers('Doc Empty', 'docempty@bidflow.com', 'DocEmpty1!')
        enq_res = client.post('/api/enquiries/', json={
            'customerName': 'Doc Corp',
            'contactInformation': 'doc@corp.com',
            'productServiceRequired': 'Docs'
        }, headers=headers)
        enq_id = enq_res.get_json()['enquiryId']
        bid_res = client.post('/api/bids/', json={
            'enquiryId': enq_id, 'amount': 1000,
            'submissionDate': '2026-08-01', 'assignedEmployee': 'Doc Empty'
        }, headers=headers)
        bid_db_id = bid_res.get_json()['_id']
        res = client.get(f'/api/documents/bid/{bid_db_id}', headers=headers)
        assert res.status_code == 200
        assert res.get_json() == []

    def test_get_bid_documents_invalid_id(self, client, auth_headers):
        headers = auth_headers('Doc Invalid', 'docinv@bidflow.com', 'DocInv12!')
        res = client.get('/api/documents/bid/not-a-valid-id', headers=headers)
        assert res.status_code == 400

    def test_get_bid_documents_not_found(self, client, auth_headers):
        headers = auth_headers('Doc NotFound', 'docnf@bidflow.com', 'DocNf12!')
        fake_id = str(ObjectId())
        res = client.get(f'/api/documents/bid/{fake_id}', headers=headers)
        assert res.status_code == 404

    def test_download_document_not_found(self, client, auth_headers):
        headers = auth_headers('Doc DlNotFound', 'docdlnf@bidflow.com', 'DocDlNf!')
        fake_id = str(ObjectId())
        res = client.get(f'/api/documents/download/{fake_id}', headers=headers)
        assert res.status_code in (400, 404, 422)


class TestAdminModels:
    def test_get_model_versions(self, client, auth_headers):
        headers = auth_headers('Model Admin', 'modeladm@bidflow.com', 'ModelAdm1!', 'Admin')
        res = client.get('/api/admin/models', headers=headers)
        assert res.status_code == 200
        assert isinstance(res.get_json(), list)

    def test_rollback_missing_version(self, client, auth_headers):
        headers = auth_headers('Rollback Admin', 'rbadm@bidflow.com', 'RbAdm12!', 'Admin')
        res = client.post('/api/admin/models/rollback', json={}, headers=headers)
        assert res.status_code == 400
        assert 'Missing version' in res.get_json()['msg']

    def test_rollback_version_not_found(self, client, auth_headers):
        headers = auth_headers('Rollback NF', 'rbnf@bidflow.com', 'RbNf123!', 'Admin')
        res = client.post('/api/admin/models/rollback', json={'version': 999}, headers=headers)
        assert res.status_code == 404


class TestAnalyticsModelStats:
    def test_model_stats(self, client, auth_headers):
        headers = auth_headers('Stats User', 'stats@bidflow.com', 'Stats1234!')
        res = client.get('/api/analytics/model-stats', headers=headers)
        assert res.status_code == 200
        data = res.get_json()
        assert 'totalPredictions' in data
        assert 'avgConfidence' in data
        assert 'terminalBids' in data
        assert 'retrainReady' in data
        assert 'modelFileExists' in data


class TestTwoFA:
    def test_2fa_setup_non_admin(self, client, auth_headers):
        headers = auth_headers('Non Admin 2FA', 'nonadm2fa@bidflow.com', 'NonAdm2f!')
        res = client.get('/api/2fa/setup', headers=headers)
        assert res.status_code == 403
        assert 'Admin' in res.get_json()['msg']

    def test_2fa_backup_codes(self, client, auth_headers):
        headers = auth_headers('Backup User', 'backup@bidflow.com', 'Backup123!')
        res = client.get('/api/2fa/backup-codes', headers=headers)
        assert res.status_code == 200
        assert 'backup_codes_remaining' in res.get_json()

    def test_2fa_verify_missing_fields(self, client):
        res = client.post('/api/2fa/verify', json={})
        assert res.status_code == 400
        assert 'required' in res.get_json()['msg'].lower()

    def test_2fa_verify_invalid_token(self, client):
        res = client.post('/api/2fa/verify', json={
            'temp_token': 'invalid-token', 'code': '123456'
        })
        assert res.status_code == 401

    def test_2fa_disable_non_admin(self, client, auth_headers):
        headers = auth_headers('Disable NonAdm', 'disnonadm@bidflow.com', 'DisNonAd!')
        res = client.post('/api/2fa/disable', json={'password': 'DisNonAd!'}, headers=headers)
        assert res.status_code in (403, 422)

    def test_2fa_regenerate_non_admin(self, client, auth_headers):
        headers = auth_headers('Regen NonAdm', 'regnonadm@bidflow.com', 'RegNonAd!')
        res = client.post('/api/2fa/regenerate-backup-codes', json={
            'code': '123456'
        }, headers=headers)
        assert res.status_code in (403, 422)

    @patch('routes.twofa.pyotp.random_base32')
    @patch('routes.twofa.qrcode.make')
    def test_2fa_setup_admin(self, mock_qr, mock_secret, client, auth_headers):
        mock_secret.return_value = 'JBSWY3DPEHPK3PXP'
        mock_img = mock_qr.return_value
        import io
        mock_img.save = lambda buf, format: buf.write(b'\x89PNG\r\n\x1a\n')
        headers = auth_headers('Admin 2FA', 'adm2fa@bidflow.com', 'Adm2fa123!', 'Admin')
        res = client.get('/api/2fa/setup', headers=headers)
        assert res.status_code == 200
        data = res.get_json()
        assert 'secret' in data
        assert 'qr_code' in data

    @patch('routes.twofa.pyotp.TOTP')
    def test_2fa_enable_invalid_code(self, mock_totp_cls, client, auth_headers):
        headers = auth_headers('Enable 2FA', 'enable2fa@bidflow.com', 'Enable2f!', 'Admin')
        user = db.Users.find_one({'email': 'enable2fa@bidflow.com'})
        db.Users.update_one(
            {'_id': user['_id']},
            {'$set': {'totp_secret_pending': 'JBSWY3DPEHPK3PXP'}}
        )
        mock_totp = mock_totp_cls.return_value
        mock_totp.verify.return_value = False
        res = client.post('/api/2fa/enable', json={'code': '000000'}, headers=headers)
        assert res.status_code == 400
        assert 'Invalid' in res.get_json()['msg']

    @patch('routes.twofa.pyotp.TOTP')
    def test_2fa_enable_no_setup(self, mock_totp_cls, client, auth_headers):
        headers = auth_headers('Enable NoSetup', 'enablens@bidflow.com', 'EnableNs!', 'Admin')
        res = client.post('/api/2fa/enable', json={'code': '123456'}, headers=headers)
        assert res.status_code in (400, 422)
        if res.status_code == 400:
            assert 'not initiated' in res.get_json()['msg']

    def test_2fa_disable_wrong_password(self, client, auth_headers):
        headers = auth_headers('Disable Admin', 'disadm@bidflow.com', 'DisAdm123!', 'Admin')
        user = db.Users.find_one({'email': 'disadm@bidflow.com'})
        db.Users.update_one(
            {'_id': user['_id']},
            {'$set': {'totp_enabled': True, 'totp_secret': 'JBSWY3DPEHPK3PXP'}}
        )
        res = client.post('/api/2fa/disable', json={'password': 'WrongPass1!'}, headers=headers)
        assert res.status_code == 401
        assert 'Incorrect password' in res.get_json()['msg']
