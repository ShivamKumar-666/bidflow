import datetime
import io
from bson import ObjectId
from database import db


class TestBidCreation:
    def test_create_bid(self, client, auth_headers):
        headers = auth_headers()
        enq_res = client.post('/api/enquiries/', json={
            'customerName': 'Test Client',
            'contactInformation': 'client@example.com',
            'productServiceRequired': 'Consulting',
            'priority': 'Medium'
        }, headers=headers)
        assert enq_res.status_code == 201
        enquiry_id = enq_res.get_json()['enquiryId']

        bid_res = client.post('/api/bids/', json={
            'enquiryId': enquiry_id, 'amount': 5000,
            'submissionDate': '2026-09-01', 'industry': 'Technology'
        }, headers=headers)
        assert bid_res.status_code == 201
        bid_data = bid_res.get_json()
        assert 'bidId' in bid_data
        assert 'aiPrediction' in bid_data
        assert isinstance(bid_data['aiPrediction'], int)
        assert 0 <= bid_data['aiPrediction'] <= 100

    def test_create_bid_with_assigned_employee(self, client, auth_headers):
        headers = auth_headers('Expert User', 'expert@bidflow.com', 'Expert123!')

        client.put('/api/auth/profile', json={
            'name': 'Expert User', 'industry': 'Construction',
            'winRate': 90, 'targetBidValue': 500000
        }, headers=headers)

        enq_res = client.post('/api/enquiries/', json={
            'customerName': 'Big Developer',
            'contactInformation': 'big@dev.com',
            'productServiceRequired': 'Skyscraper'
        }, headers=headers)
        assert enq_res.status_code == 201
        enquiry_id = enq_res.get_json()['enquiryId']

        bid_res = client.post('/api/bids/', json={
            'enquiryId': enquiry_id, 'amount': 250000,
            'submissionDate': '2026-09-01',
            'assignedEmployee': 'Expert User',
            'remarks': 'Major construction bid'
        }, headers=headers)
        assert bid_res.status_code == 201
        bid_data = bid_res.get_json()
        assert bid_data['industry'] == 'Construction'
        assert 'aiPrediction' in bid_data

    def test_create_bid_invalid_amount(self, client, auth_headers):
        headers = auth_headers()
        enq_res = client.post('/api/enquiries/', json={
            'customerName': 'Test',
            'contactInformation': 'test@test.com',
            'productServiceRequired': 'Testing'
        }, headers=headers)
        enquiry_id = enq_res.get_json()['enquiryId']

        bid_res = client.post('/api/bids/', json={
            'enquiryId': enquiry_id, 'amount': -100,
            'submissionDate': '2026-09-01'
        }, headers=headers)
        assert bid_res.status_code == 400


class TestAIPredictions:
    def test_predict_endpoint(self, client, auth_headers):
        headers = auth_headers()

        predict_res = client.post('/api/bids/predict', json={
            'amount': 25000, 'days_to_deadline': 15,
            'priority_encoded': 2, 'industry': 'Technology'
        }, headers=headers)

        if predict_res.status_code == 503:
            assert 'ML model not loaded' in predict_res.get_json().get('msg')
        else:
            assert predict_res.status_code == 200
            data = predict_res.get_json()
            assert 'win_probability' in data
            assert 'computed_win_rate_pct' in data
            prob = data['win_probability']
            assert 0 <= prob <= 100


class TestWinRateIsolation:
    def test_win_rate_from_history_not_profile(self, client, auth_headers):
        headers = auth_headers('Inflated User', 'inflated@bidflow.com', 'Pass1234!')

        profile_res = client.put('/api/auth/profile', json={
            'winRate': 100
        }, headers=headers)
        assert profile_res.status_code == 200
        assert profile_res.get_json()['winRate'] == 100

        predict_res = client.post('/api/bids/predict', json={
            'amount': 10000, 'days_to_deadline': 30,
            'assignedEmployee': 'Inflated User'
        }, headers=headers)

        if predict_res.status_code != 503:
            assert predict_res.status_code == 200
            data = predict_res.get_json()
            assert data['computed_win_rate_pct'] == 50.0


class TestBidStatus:
    def test_update_status(self, client, auth_headers):
        headers = auth_headers()
        enq_res = client.post('/api/enquiries/', json={
            'customerName': 'Status Test',
            'contactInformation': 'status@test.com',
            'productServiceRequired': 'Testing'
        }, headers=headers)
        enquiry_id = enq_res.get_json()['enquiryId']

        bid_res = client.post('/api/bids/', json={
            'enquiryId': enquiry_id, 'amount': 10000,
            'submissionDate': '2026-07-01', 'industry': 'Technology'
        }, headers=headers)
        bid_id = bid_res.get_json()['_id']

        status_res = client.put(f'/api/bids/{bid_id}/status', json={
            'status': 'Order Received', 'note': 'Deal won'
        }, headers=headers)
        assert status_res.status_code == 200

        invalid_res = client.put(f'/api/bids/{bid_id}/status', json={
            'status': 'InvalidStatus', 'note': 'Bad'
        }, headers=headers)
        assert invalid_res.status_code == 400


class TestCommentsAndSocketIO:
    def test_comments_and_socketio(self, client, auth_headers, mock_socketio):
        headers = auth_headers()

        enq_res = client.post('/api/enquiries/', json={
            'customerName': 'Client Comment',
            'contactInformation': 'comment@client.com',
            'productServiceRequired': 'Chat Server'
        }, headers=headers)
        enquiry_id = enq_res.get_json()['enquiryId']

        bid_res = client.post('/api/bids/', json={
            'enquiryId': enquiry_id, 'amount': 8000,
            'submissionDate': '2026-07-01',
            'assignedEmployee': 'Exec User', 'industry': 'Technology'
        }, headers=headers)
        bid_db_id = bid_res.get_json()['_id']

        comment_res = client.post(f'/api/bids/{bid_db_id}/comments', json={
            'text': 'This is a real-time negotiation comment.'
        }, headers=headers)
        assert comment_res.status_code == 201

        comment_data = comment_res.get_json()
        assert comment_data['text'] == 'This is a real-time negotiation comment.'
        assert comment_data['author'] == 'Exec User'

        mock_socketio.assert_called_once()
        args, _ = mock_socketio.call_args
        assert args[0] == 'new_comment'
        assert args[1]['bid_id'] == bid_db_id

        bid_in_db = db.Bids.find_one({'_id': ObjectId(bid_db_id)})
        assert len(bid_in_db['comments']) == 1


class TestCustomTags:
    def test_tags_on_enquiry_and_bid(self, client, auth_headers):
        headers = auth_headers()

        enq_res = client.post('/api/enquiries/', json={
            'customerName': 'Tagged Corp',
            'contactInformation': 'tagged@example.com',
            'productServiceRequired': 'Tag Consulting',
            'priority': 'Medium',
            'tags': ['repeat-client', 'construction']
        }, headers=headers)
        assert enq_res.status_code == 201
        enq_data = enq_res.get_json()
        assert enq_data['tags'] == ['repeat-client', 'construction']

        bid_res = client.post('/api/bids/', json={
            'enquiryId': enq_data['enquiryId'], 'amount': 15000,
            'submissionDate': '2026-11-20',
            'assignedEmployee': 'Exec User',
            'tags': ['construction', 'high-risk']
        }, headers=headers)
        assert bid_res.status_code == 201
        bid_data = bid_res.get_json()
        assert bid_data['tags'] == ['construction', 'high-risk']

        update_res = client.put(f'/api/bids/{bid_data["_id"]}', json={
            'tags': ['construction', 'high-risk', 'updated-tag']
        }, headers=headers)
        assert update_res.status_code == 200

        tags_res = client.get('/api/tags/', headers=headers)
        assert tags_res.status_code == 200
        unique_tags = tags_res.get_json()
        assert 'construction' in unique_tags
        assert 'high-risk' in unique_tags
        assert 'repeat-client' in unique_tags
        assert 'updated-tag' in unique_tags
