import datetime
from unittest.mock import patch
from bson import ObjectId
from database import db


class TestMarketplaceList:
    def test_list_public_enquiries(self, client, auth_headers):
        company = auth_headers('Co User', 'co@bidflow.com', 'CoPass12!', 'Company')
        bidder = auth_headers('Bid User', 'bid@bidflow.com', 'BidPass12!', 'Bidder')

        client.post('/api/v1/enquiries/', json={
            'customerName': 'Public Corp',
            'contactInformation': 'pub@corp.com',
            'productServiceRequired': 'Services',
            'visibility': 'public',
            'priority': 'High',
        }, headers=company)

        client.post('/api/v1/enquiries/', json={
            'customerName': 'Private Corp',
            'contactInformation': 'priv@corp.com',
            'productServiceRequired': 'Goods',
            'visibility': 'internal',
        }, headers=company)

        res = client.get('/api/v1/marketplace/', headers=bidder)
        assert res.status_code == 200
        data = res.get_json()
        assert data['total'] == 1
        assert data['items'][0]['customerName'] == 'Public Corp'

    def test_admin_sees_all(self, client, auth_headers):
        company = auth_headers('Co User', 'co2@bidflow.com', 'CoPass12!', 'Company')
        admin = auth_headers('Admin', 'adm@bidflow.com', 'AdmPass12!', 'Admin')

        client.post('/api/v1/enquiries/', json={
            'customerName': 'Public Corp',
            'contactInformation': 'pub@corp.com',
            'productServiceRequired': 'Services',
            'visibility': 'public',
        }, headers=company)

        client.post('/api/v1/enquiries/', json={
            'customerName': 'Private Corp',
            'contactInformation': 'priv@corp.com',
            'productServiceRequired': 'Goods',
            'visibility': 'internal',
        }, headers=company)

        res = client.get('/api/v1/marketplace/', headers=admin)
        assert res.status_code == 200
        data = res.get_json()
        assert data['total'] == 2

    def test_company_sees_all_public(self, client, auth_headers):
        co1 = auth_headers('Co One', 'co1@bidflow.com', 'CoPass12!', 'Company')
        co2 = auth_headers('Co Two', 'co2@bidflow.com', 'CoPass12!', 'Company')

        client.post('/api/v1/enquiries/', json={
            'customerName': 'Co1 Enquiry',
            'contactInformation': 'co1@corp.com',
            'productServiceRequired': 'Services',
            'visibility': 'public',
        }, headers=co1)

        client.post('/api/v1/enquiries/', json={
            'customerName': 'Co2 Enquiry',
            'contactInformation': 'co2@corp.com',
            'productServiceRequired': 'Goods',
            'visibility': 'public',
        }, headers=co2)

        # Company sees all public enquiries (not just own)
        res = client.get('/api/v1/marketplace/', headers=co1)
        assert res.status_code == 200
        data = res.get_json()
        assert data['total'] == 2

    def test_company_does_not_see_internal(self, client, auth_headers):
        co1 = auth_headers('Co One', 'co1@bidflow.com', 'CoPass12!', 'Company')
        co2 = auth_headers('Co Two', 'co2@bidflow.com', 'CoPass12!', 'Company')

        client.post('/api/v1/enquiries/', json={
            'customerName': 'Co1 Public',
            'contactInformation': 'co1@corp.com',
            'productServiceRequired': 'Services',
            'visibility': 'public',
        }, headers=co1)

        client.post('/api/v1/enquiries/', json={
            'customerName': 'Co2 Internal',
            'contactInformation': 'co2@corp.com',
            'productServiceRequired': 'Goods',
            'visibility': 'internal',
        }, headers=co2)

        res = client.get('/api/v1/marketplace/', headers=co1)
        assert res.status_code == 200
        data = res.get_json()
        assert data['total'] == 1
        assert data['items'][0]['customerName'] == 'Co1 Public'

    def test_search_filter(self, client, auth_headers):
        company = auth_headers('Co User', 'co3@bidflow.com', 'CoPass12!', 'Company')
        bidder = auth_headers('Bid User', 'bid3@bidflow.com', 'BidPass12!', 'Bidder')

        client.post('/api/v1/enquiries/', json={
            'customerName': 'Alpha Corp',
            'contactInformation': 'a@corp.com',
            'productServiceRequired': 'Consulting',
            'visibility': 'public',
        }, headers=company)

        client.post('/api/v1/enquiries/', json={
            'customerName': 'Beta Corp',
            'contactInformation': 'b@corp.com',
            'productServiceRequired': 'Software',
            'visibility': 'public',
        }, headers=company)

        res = client.get('/api/v1/marketplace/?search=Alpha', headers=bidder)
        assert res.status_code == 200
        data = res.get_json()
        assert data['total'] == 1
        assert data['items'][0]['customerName'] == 'Alpha Corp'

    def test_industry_filter(self, client, auth_headers):
        company = auth_headers('Co User', 'co4@bidflow.com', 'CoPass12!', 'Company')
        bidder = auth_headers('Bid User', 'bid4@bidflow.com', 'BidPass12!', 'Bidder')

        client.post('/api/v1/enquiries/', json={
            'customerName': 'Tech Corp',
            'contactInformation': 'tech@corp.com',
            'productServiceRequired': 'Software',
            'visibility': 'public',
            'industry': 'Technology',
        }, headers=company)

        client.post('/api/v1/enquiries/', json={
            'customerName': 'Health Corp',
            'contactInformation': 'health@corp.com',
            'productServiceRequired': 'Medical',
            'visibility': 'public',
            'industry': 'Healthcare',
        }, headers=company)

        res = client.get('/api/v1/marketplace/?industry=Technology', headers=bidder)
        assert res.status_code == 200
        data = res.get_json()
        assert data['total'] == 1
        assert data['items'][0]['customerName'] == 'Tech Corp'

    def test_pagination(self, client, auth_headers):
        company = auth_headers('Co User', 'co5@bidflow.com', 'CoPass12!', 'Company')
        bidder = auth_headers('Bid User', 'bid5@bidflow.com', 'BidPass12!', 'Bidder')

        for i in range(3):
            client.post('/api/v1/enquiries/', json={
                'customerName': f'Corp {i}',
                'contactInformation': f'c{i}@corp.com',
                'productServiceRequired': 'Services',
                'visibility': 'public',
            }, headers=company)

        res = client.get('/api/v1/marketplace/?page=1&size=2', headers=bidder)
        assert res.status_code == 200
        data = res.get_json()
        assert data['total'] == 3
        assert data['page'] == 1
        assert data['size'] == 2
        assert len(data['items']) == 2

    def test_unauthenticated_returns_401(self, client):
        res = client.get('/api/v1/marketplace/')
        assert res.status_code == 401


class TestMarketplaceDetail:
    def _create_public_enquiry(self, client, auth_headers, name='Co User', email='co@bidflow.com'):
        headers = auth_headers(name, email, 'CoPass12!', 'Company')
        res = client.post('/api/v1/enquiries/', json={
            'customerName': 'Detail Corp',
            'contactInformation': 'detail@corp.com',
            'productServiceRequired': 'Services',
            'visibility': 'public',
            'priority': 'High',
        }, headers=headers)
        return res.get_json()['enquiryId'], headers

    def test_get_public_enquiry(self, client, auth_headers):
        enquiry_id, _ = self._create_public_enquiry(client, auth_headers)
        bidder = auth_headers('Bid User', 'bid@bidflow.com', 'BidPass12!', 'Bidder')

        res = client.get(f'/api/v1/marketplace/{enquiry_id}', headers=bidder)
        assert res.status_code == 200
        data = res.get_json()
        assert data['enquiry']['enquiryId'] == enquiry_id
        assert data['enquiry']['customerName'] == 'Detail Corp'
        assert 'documents' in data
        assert 'myBids' in data
        assert 'allBids' in data

    def test_private_enquiry_returns_404_for_bidder(self, client, auth_headers):
        company = auth_headers('Co User', 'co@bidflow.com', 'CoPass12!', 'Company')
        bidder = auth_headers('Bid User', 'bid@bidflow.com', 'BidPass12!', 'Bidder')

        res = client.post('/api/v1/enquiries/', json={
            'customerName': 'Private Corp',
            'contactInformation': 'priv@corp.com',
            'productServiceRequired': 'Services',
            'visibility': 'internal',
        }, headers=company)
        enquiry_id = res.get_json()['enquiryId']

        res = client.get(f'/api/v1/marketplace/{enquiry_id}', headers=bidder)
        assert res.status_code == 404

    def test_admin_sees_private_enquiry(self, client, auth_headers):
        company = auth_headers('Co User', 'co@bidflow.com', 'CoPass12!', 'Company')
        admin = auth_headers('Admin', 'adm@bidflow.com', 'AdmPass12!', 'Admin')

        res = client.post('/api/v1/enquiries/', json={
            'customerName': 'Private Corp',
            'contactInformation': 'priv@corp.com',
            'productServiceRequired': 'Services',
            'visibility': 'internal',
        }, headers=company)
        enquiry_id = res.get_json()['enquiryId']

        res = client.get(f'/api/v1/marketplace/{enquiry_id}', headers=admin)
        assert res.status_code == 200

    def test_nonexistent_enquiry_returns_404(self, client, auth_headers):
        bidder = auth_headers('Bid User', 'bid@bidflow.com', 'BidPass12!', 'Bidder')
        res = client.get('/api/v1/marketplace/ENQ-nonexist', headers=bidder)
        assert res.status_code == 404

    def test_my_bids_for_bidder(self, client, auth_headers):
        enquiry_id, company_headers = self._create_public_enquiry(client, auth_headers)
        bidder = auth_headers('Bid User', 'bid@bidflow.com', 'BidPass12!', 'Bidder')

        with patch('routes.marketplace.socketio.emit'):
            client.post(f'/api/v1/marketplace/{enquiry_id}/bid', json={
                'amount': 5000,
            }, headers=bidder)

        res = client.get(f'/api/v1/marketplace/{enquiry_id}', headers=bidder)
        assert res.status_code == 200
        data = res.get_json()
        assert len(data['myBids']) == 1
        assert data['myBids'][0]['amount'] == 5000

    def test_all_bids_for_company_owner(self, client, auth_headers):
        enquiry_id, company_headers = self._create_public_enquiry(client, auth_headers)
        bidder = auth_headers('Bid User', 'bid@bidflow.com', 'BidPass12!', 'Bidder')

        with patch('routes.marketplace.socketio.emit'):
            client.post(f'/api/v1/marketplace/{enquiry_id}/bid', json={
                'amount': 5000,
            }, headers=bidder)

        res = client.get(f'/api/v1/marketplace/{enquiry_id}', headers=company_headers)
        assert res.status_code == 200
        data = res.get_json()
        assert len(data['allBids']) == 1
        assert data['allBids'][0]['amount'] == 5000

    def test_documents_included(self, client, auth_headers, app):
        enquiry_id, company_headers = self._create_public_enquiry(client, auth_headers)
        bidder = auth_headers('Bid User', 'bid@bidflow.com', 'BidPass12!', 'Bidder')

        with patch('routes.marketplace.socketio.emit'):
            bid_res = client.post(f'/api/v1/marketplace/{enquiry_id}/bid', json={
                'amount': 5000,
            }, headers=bidder)
        bid_db_id = bid_res.get_json()['bid']['_id']

        db.Documents.insert_one({
            'bidId': bid_db_id,
            'enquiryId': enquiry_id,
            'filename': 'test.pdf',
            'path': 'test.pdf',
            'uploadDate': datetime.datetime.now(datetime.timezone.utc),
            'uploadedBy': 'test',
        })

        res = client.get(f'/api/v1/marketplace/{enquiry_id}', headers=bidder)
        assert res.status_code == 200
        data = res.get_json()
        assert len(data['documents']) >= 1
        assert data['documents'][0]['filename'] == 'test.pdf'


class TestMarketplaceBidSubmission:
    def _create_public_enquiry(self, client, auth_headers, deadline='2026-12-31'):
        company = auth_headers('Co User', 'co@bidflow.com', 'CoPass12!', 'Company')
        res = client.post('/api/v1/enquiries/', json={
            'customerName': 'Bid Corp',
            'contactInformation': 'bid@corp.com',
            'productServiceRequired': 'Services',
            'visibility': 'public',
            'listingDeadline': deadline,
        }, headers=company)
        return res.get_json()['enquiryId']

    def test_submit_bid_success(self, client, auth_headers):
        enquiry_id = self._create_public_enquiry(client, auth_headers)
        bidder = auth_headers('Bid User', 'bid@bidflow.com', 'BidPass12!', 'Bidder')

        with patch('routes.marketplace.socketio.emit'):
            res = client.post(f'/api/v1/marketplace/{enquiry_id}/bid', json={
                'amount': 5000,
                'remarks': 'Test bid',
            }, headers=bidder)

        assert res.status_code == 201
        data = res.get_json()
        assert data['msg'] == 'Bid submitted successfully'
        assert 'bidId' in data['bid']
        assert data['bid']['amount'] == 5000

    def test_submit_bid_as_admin_forbidden(self, client, auth_headers):
        enquiry_id = self._create_public_enquiry(client, auth_headers)
        admin = auth_headers('Admin', 'adm@bidflow.com', 'AdmPass12!', 'Admin')

        res = client.post(f'/api/v1/marketplace/{enquiry_id}/bid', json={
            'amount': 5000,
        }, headers=admin)
        assert res.status_code == 403

    def test_submit_bid_nonexistent_enquiry(self, client, auth_headers):
        bidder = auth_headers('Bid User', 'bid@bidflow.com', 'BidPass12!', 'Bidder')
        res = client.post('/api/v1/marketplace/ENQ-nonexist/bid', json={
            'amount': 5000,
        }, headers=bidder)
        assert res.status_code == 404

    def test_submit_bid_private_enquiry(self, client, auth_headers):
        company = auth_headers('Co User', 'co@bidflow.com', 'CoPass12!', 'Company')
        bidder = auth_headers('Bid User', 'bid@bidflow.com', 'BidPass12!', 'Bidder')

        res = client.post('/api/v1/enquiries/', json={
            'customerName': 'Private Corp',
            'contactInformation': 'priv@corp.com',
            'productServiceRequired': 'Services',
            'visibility': 'internal',
        }, headers=company)
        enquiry_id = res.get_json()['enquiryId']

        res = client.post(f'/api/v1/marketplace/{enquiry_id}/bid', json={
            'amount': 5000,
        }, headers=bidder)
        assert res.status_code == 403

    def test_submit_bid_missing_amount(self, client, auth_headers):
        enquiry_id = self._create_public_enquiry(client, auth_headers)
        bidder = auth_headers('Bid User', 'bid@bidflow.com', 'BidPass12!', 'Bidder')

        res = client.post(f'/api/v1/marketplace/{enquiry_id}/bid', json={}, headers=bidder)
        assert res.status_code == 400

    def test_submit_bid_invalid_amount(self, client, auth_headers):
        enquiry_id = self._create_public_enquiry(client, auth_headers)
        bidder = auth_headers('Bid User', 'bid@bidflow.com', 'BidPass12!', 'Bidder')

        res = client.post(f'/api/v1/marketplace/{enquiry_id}/bid', json={
            'amount': 'not_a_number',
        }, headers=bidder)
        assert res.status_code == 400

    def test_submit_bid_negative_amount(self, client, auth_headers):
        enquiry_id = self._create_public_enquiry(client, auth_headers)
        bidder = auth_headers('Bid User', 'bid@bidflow.com', 'BidPass12!', 'Bidder')

        res = client.post(f'/api/v1/marketplace/{enquiry_id}/bid', json={
            'amount': -100,
        }, headers=bidder)
        assert res.status_code == 400

    def test_submit_bid_after_deadline(self, client, auth_headers):
        enquiry_id = self._create_public_enquiry(client, auth_headers, deadline='2020-01-01')
        bidder = auth_headers('Bid User', 'bid@bidflow.com', 'BidPass12!', 'Bidder')

        res = client.post(f'/api/v1/marketplace/{enquiry_id}/bid', json={
            'amount': 5000,
        }, headers=bidder)
        assert res.status_code == 400
        assert 'deadline' in res.get_json()['msg'].lower()

    def test_bid_increments_bid_count(self, client, auth_headers):
        enquiry_id = self._create_public_enquiry(client, auth_headers)
        bidder = auth_headers('Bid User', 'bid@bidflow.com', 'BidPass12!', 'Bidder')

        with patch('routes.marketplace.socketio.emit'):
            client.post(f'/api/v1/marketplace/{enquiry_id}/bid', json={
                'amount': 5000,
            }, headers=bidder)

        enq = db.Enquiries.find_one({"enquiryId": enquiry_id})
        assert enq.get('bidCount', 0) >= 1
