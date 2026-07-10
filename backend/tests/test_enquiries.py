import datetime
from database import db


class TestRoleBasedAccess:
    def test_admin_can_delete_and_view_audit(self, client, auth_headers):
        exec_headers = auth_headers('Exec User', 'exec@bidflow.com', 'Exec1234!', 'Sales Executive')
        admin_headers = auth_headers('Admin User', 'admin@bidflow.com', 'Admin123!', 'Admin')

        payload = {
            'customerName': 'Test Client',
            'contactInformation': 'client@example.com',
            'productServiceRequired': 'Consulting Services',
            'priority': 'Medium',
            'notes': 'Testing delete'
        }
        create_res = client.post('/api/v1/enquiries/', json=payload, headers=exec_headers)
        assert create_res.status_code == 201
        enq_db_id = create_res.get_json().get('_id')

        # Admin can delete
        delete_success = client.delete(f'/api/v1/enquiries/{enq_db_id}', headers=admin_headers)
        assert delete_success.status_code == 200

        # Admin can view audit logs
        audit_success = client.get('/api/v1/audit/', headers=admin_headers)
        assert audit_success.status_code == 200
        logs = audit_success.get_json()
        assert len(logs) > 0
        actions = [log['action'] for log in logs]
        assert 'CREATE_ENQUIRY' in actions
        assert 'DELETE_ENQUIRY' in actions


class TestPDFQuotation:
    def test_quotation_pdf_generation(self, client, auth_headers):
        headers = auth_headers()

        enq_res = client.post('/api/v1/enquiries/', json={
            'customerName': 'Quote Corp',
            'contactInformation': 'quote@example.com',
            'productServiceRequired': 'PDF Construction',
            'priority': 'Medium'
        }, headers=headers)
        assert enq_res.status_code == 201
        enq_data = enq_res.get_json()

        bid_res = client.post('/api/v1/bids/', json={
            'enquiryId': enq_data['enquiryId'], 'amount': 25000,
            'submissionDate': '2026-12-01', 'assignedEmployee': 'Exec User'
        }, headers=headers)
        assert bid_res.status_code == 201
        bid_data = bid_res.get_json()

        pdf_res = client.get(f'/api/v1/bids/{bid_data["_id"]}/quotation', headers=headers)
        assert pdf_res.status_code == 200
        assert pdf_res.headers.get('Content-Type') == 'application/pdf'
        assert len(pdf_res.data) > 0
        assert pdf_res.data.startswith(b'%PDF')


class TestCustomerPortalSharing:
    def test_share_link_and_public_access(self, client, auth_headers):
        headers = auth_headers()

        enq_res = client.post('/api/v1/enquiries/', json={
            'customerName': 'Shared Customer Corp',
            'contactInformation': 'shared@example.com',
            'productServiceRequired': 'Public Tracking App',
            'priority': 'High'
        }, headers=headers)
        assert enq_res.status_code == 201
        enq_data = enq_res.get_json()

        share_res = client.post(f'/api/v1/enquiries/{enq_data["_id"]}/share', headers=headers)
        assert share_res.status_code == 200
        share_data = share_res.get_json()
        assert 'shareToken' in share_data
        assert 'shareUrl' in share_data
        token = share_data['shareToken']

        public_res = client.get(f'/api/v1/enquiries/public/share/{token}')
        assert public_res.status_code == 200
        public_data = public_res.get_json()
        assert public_data['enquiry']['customerName'] == 'Shared Customer Corp'
        assert public_data['enquiry']['productServiceRequired'] == 'Public Tracking App'
        assert 'aiPrediction' not in public_data

        bid_payload = {
            'enquiryId': enq_data['enquiryId'], 'amount': 50000,
            'submissionDate': '2026-12-15', 'assignedEmployee': 'Exec User'
        }
        bid_res = client.post('/api/v1/bids/', json=bid_payload, headers=headers)
        assert bid_res.status_code == 201
        bid_data = bid_res.get_json()

        doc_id = db.Documents.insert_one({
            'bidId': bid_data['_id'],
            'filename': 'proposal.pdf',
            'path': 'mock_file.pdf',
            'uploadDate': datetime.datetime.now(datetime.UTC),
            'uploadedBy': 'test_user'
        }).inserted_id

        public_updated = client.get(f'/api/v1/enquiries/public/share/{token}')
        assert public_updated.status_code == 200
        assert len(public_updated.get_json()['documents']) == 1
        assert public_updated.get_json()['documents'][0]['filename'] == 'proposal.pdf'

        db.Documents.delete_one({'_id': doc_id})

        db.Enquiries.update_one(
            {'enquiryId': enq_data['enquiryId']},
            {'$set': {'shareTokenCreatedAt': datetime.datetime.now(datetime.UTC) - datetime.timedelta(days=91)}}
        )
        expired_res = client.get(f'/api/v1/enquiries/public/share/{token}')
        assert expired_res.status_code == 403
        assert 'expired' in expired_res.get_json()['msg'].lower()

    def test_public_upload_without_jwt(self, client, auth_headers):
        import io
        headers = auth_headers()
        
        enq_res = client.post('/api/v1/enquiries/', json={
            'customerName': 'Upload Customer Corp',
            'contactInformation': 'upload@example.com',
            'productServiceRequired': 'Uploads',
            'priority': 'Medium'
        }, headers=headers)
        enq_data = enq_res.get_json()

        share_res = client.post(f'/api/v1/enquiries/{enq_data["_id"]}/share', headers=headers)
        token = share_res.get_json()['shareToken']

        # Upload without JWT
        data = {
            'file': (io.BytesIO(b"test file content"), 'test.txt')
        }
        upload_res = client.post(
            f'/api/v1/enquiries/public/share/{token}/upload',
            data=data,
            content_type='multipart/form-data'
        )
        assert upload_res.status_code == 201
        
        # Verify it was added
        public_res = client.get(f'/api/v1/enquiries/public/share/{token}')
        assert public_res.status_code == 200
        docs = public_res.get_json().get('documents', [])
        assert len(docs) == 1
        assert docs[0]['filename'] == 'test.txt'
