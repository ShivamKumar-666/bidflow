import io
import os
from bson import ObjectId
from database import db


class TestDocumentUploads:
    def test_upload_missing_file(self, client, auth_headers):
        headers = auth_headers()

        enq_res = client.post('/api/enquiries/', json={
            'customerName': 'Doc Corp',
            'contactInformation': 'doc@corp.com',
            'productServiceRequired': 'Doc Management'
        }, headers=headers)
        enquiry_id = enq_res.get_json()['enquiryId']

        bid_res = client.post('/api/bids/', json={
            'enquiryId': enquiry_id, 'amount': 10000,
            'submissionDate': '2026-08-01', 'assignedEmployee': 'Exec User'
        }, headers=headers)
        bid_db_id = bid_res.get_json()['_id']

        upload_fail = client.post('/api/documents/upload', data={
            'bidId': bid_db_id
        }, headers=headers)
        assert upload_fail.status_code == 400
        assert 'No file part' in upload_fail.get_json()['msg']

    def test_upload_empty_filename(self, client, auth_headers):
        headers = auth_headers()

        enq_res = client.post('/api/enquiries/', json={
            'customerName': 'Doc Corp',
            'contactInformation': 'doc@corp.com',
            'productServiceRequired': 'Doc Management'
        }, headers=headers)
        bid_res = client.post('/api/bids/', json={
            'enquiryId': enq_res.get_json()['enquiryId'], 'amount': 10000,
            'submissionDate': '2026-08-01'
        }, headers=headers)
        bid_db_id = bid_res.get_json()['_id']

        upload_fail = client.post('/api/documents/upload', data={
            'bidId': bid_db_id,
            'file': (io.BytesIO(b''), '')
        }, headers=headers)
        assert upload_fail.status_code == 400

    def test_upload_blocked_extension(self, client, auth_headers):
        headers = auth_headers()

        enq_res = client.post('/api/enquiries/', json={
            'customerName': 'Doc Corp',
            'contactInformation': 'doc@corp.com',
            'productServiceRequired': 'Doc Management'
        }, headers=headers)
        bid_res = client.post('/api/bids/', json={
            'enquiryId': enq_res.get_json()['enquiryId'], 'amount': 10000,
            'submissionDate': '2026-08-01', 'assignedEmployee': 'Exec User'
        }, headers=headers)
        bid_db_id = bid_res.get_json()['_id']

        upload_fail = client.post('/api/documents/upload', data={
            'bidId': bid_db_id,
            'file': (io.BytesIO(b'binary'), 'virus.exe')
        }, headers=headers)
        assert upload_fail.status_code in [400, 403]
        msg = upload_fail.get_json().get('msg', '')
        assert 'File type not allowed' in msg or 'not allowed' in msg.lower()

    def test_upload_valid_pdf(self, client, auth_headers, app):
        headers = auth_headers()

        enq_res = client.post('/api/enquiries/', json={
            'customerName': 'Doc Corp',
            'contactInformation': 'doc@corp.com',
            'productServiceRequired': 'Doc Management'
        }, headers=headers)
        enquiry_id = enq_res.get_json()['enquiryId']

        bid_res = client.post('/api/bids/', json={
            'enquiryId': enquiry_id, 'amount': 10000,
            'submissionDate': '2026-08-01', 'assignedEmployee': 'Exec User'
        }, headers=headers)
        bid_db_id = bid_res.get_json()['_id']

        upload_success = client.post('/api/documents/upload', data={
            'bidId': bid_db_id,
            'file': (io.BytesIO(b'Sample PDF'), 'proposal.pdf')
        }, headers=headers)
        assert upload_success.status_code == 201
        doc_data = upload_success.get_json()
        assert doc_data['filename'] == 'proposal.pdf'
        assert doc_data['bidId'] == bid_db_id

        doc_in_db = db.Documents.find_one({'bidId': bid_db_id})
        assert doc_in_db is not None
        assert doc_in_db['filename'] == 'proposal.pdf'

        filepath = os.path.join(app.config['UPLOAD_FOLDER'], doc_data['path'])
        if os.path.exists(filepath):
            os.remove(filepath)
