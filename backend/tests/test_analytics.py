import datetime
import io
from bson import ObjectId
from database import db


class TestKPIAnalytics:
    def test_dashboard_metrics(self, client, auth_headers):
        headers = auth_headers()

        enq1 = client.post('/api/enquiries/', json={
            'customerName': 'Client 1',
            'contactInformation': 'c1@test.com',
            'productServiceRequired': 'Service 1'
        }, headers=headers)
        enq1_id = enq1.get_json()['enquiryId']

        enq2 = client.post('/api/enquiries/', json={
            'customerName': 'Client 2',
            'contactInformation': 'c2@test.com',
            'productServiceRequired': 'Service 2'
        }, headers=headers)
        enq2_id = enq2.get_json()['enquiryId']

        bid1_res = client.post('/api/bids/', json={
            'enquiryId': enq1_id, 'amount': 10000,
            'submissionDate': '2026-07-01', 'industry': 'Technology'
        }, headers=headers)
        bid1_id = bid1_res.get_json()['_id']
        client.put(f'/api/bids/{bid1_id}/status', json={
            'status': 'Order Received', 'note': 'Deal won'
        }, headers=headers)

        bid2_res = client.post('/api/bids/', json={
            'enquiryId': enq2_id, 'amount': 20000,
            'submissionDate': '2026-07-01', 'industry': 'Technology'
        }, headers=headers)
        bid2_id = bid2_res.get_json()['_id']
        client.put(f'/api/bids/{bid2_id}/status', json={
            'status': 'Rejected', 'note': 'Deal lost'
        }, headers=headers)

        client.post('/api/bids/', json={
            'enquiryId': enq1_id, 'amount': 30000,
            'submissionDate': '2026-07-01', 'industry': 'Technology'
        }, headers=headers)

        dash_res = client.get('/api/analytics/dashboard', headers=headers)
        assert dash_res.status_code == 200
        metrics = dash_res.get_json()

        assert metrics['totalEnquiries'] == 2
        assert 'wonBids' in metrics
        assert 'lostBids' in metrics
        assert 'revenueGenerated' in metrics
        assert 'winRate' in metrics

    def test_excel_export(self, client, auth_headers):
        headers = auth_headers()

        enq = client.post('/api/enquiries/', json={
            'customerName': 'Client 1',
            'contactInformation': 'c1@test.com',
            'productServiceRequired': 'Service 1'
        }, headers=headers)
        enq_id = enq.get_json()['enquiryId']

        bid_res = client.post('/api/bids/', json={
            'enquiryId': enq_id, 'amount': 10000,
            'submissionDate': '2026-07-01', 'industry': 'Technology'
        }, headers=headers)
        bid_id = bid_res.get_json()['_id']
        client.put(f'/api/bids/{bid_id}/status', json={
            'status': 'Order Received', 'note': 'Won'
        }, headers=headers)

        export_res = client.get('/api/analytics/export/csv', headers=headers)
        assert export_res.status_code == 200
        assert export_res.mimetype == 'text/csv'
        csv_data = export_res.get_data(as_text=True)
        assert 'Bid ID' in csv_data
        assert 'Amount' in csv_data
        assert 'Status' in csv_data


class TestCalendarView:
    def test_calendar_view(self, client, auth_headers):
        headers = auth_headers()

        enq_res = client.post('/api/enquiries/', json={
            'customerName': 'Calendar Client',
            'contactInformation': 'calendar@example.com',
            'productServiceRequired': 'Calendar Integration',
            'priority': 'High',
            'notes': 'Urgent feature setup'
        }, headers=headers)
        assert enq_res.status_code == 201
        enquiry_id = enq_res.get_json()['enquiryId']

        bid_res = client.post('/api/bids/', json={
            'enquiryId': enquiry_id, 'amount': 12000,
            'submissionDate': '2026-05-30',
            'assignedEmployee': 'Exec User', 'industry': 'Technology'
        }, headers=headers)
        assert bid_res.status_code == 201

        cal_res = client.get('/api/bids/calendar', headers=headers)
        assert cal_res.status_code == 200
        events = cal_res.get_json()
        assert len(events) >= 1

        matching = [e for e in events if e['enquiryId'] == enquiry_id]
        assert len(matching) == 1
        event = matching[0]
        assert event['submissionDate'] == '2026-05-30'
        assert event['customerName'] == 'Calendar Client'
        assert event['priority'] == 'High'

        filtered_res = client.get('/api/bids/calendar?month=2026-05', headers=headers)
        assert filtered_res.status_code == 200
        filtered_events = filtered_res.get_json()
        assert any(e['enquiryId'] == enquiry_id for e in filtered_events)

        non_matching_res = client.get('/api/bids/calendar?month=2026-06', headers=headers)
        assert non_matching_res.status_code == 200
        non_matching_events = non_matching_res.get_json()
        assert not any(e['enquiryId'] == enquiry_id for e in non_matching_events)


class TestGlobalSearch:
    def test_global_search(self, client, auth_headers):
        headers = auth_headers()

        enq_res = client.post('/api/enquiries/', json={
            'customerName': 'Acme Search Corp',
            'contactInformation': 'acme@example.com',
            'productServiceRequired': 'Global Search Feature',
            'priority': 'Medium',
            'notes': 'Acme details notes'
        }, headers=headers)
        assert enq_res.status_code == 201
        enquiry_id = enq_res.get_json()['enquiryId']

        bid_res = client.post('/api/bids/', json={
            'enquiryId': enquiry_id, 'amount': 95000,
            'submissionDate': '2026-10-15',
            'assignedEmployee': 'Exec User', 'remarks': 'Acme Search Bid'
        }, headers=headers)
        assert bid_res.status_code == 201
        bid_id = bid_res.get_json()['bidId']

        upload_res = client.post('/api/documents/upload', data={
            'bidId': bid_res.get_json()['_id'],
            'file': (io.BytesIO(b'Acme Docs'), 'acme_spec.pdf')
        }, headers=headers)
        assert upload_res.status_code == 201

        search_res = client.get('/api/search?q=acme', headers=headers)
        assert search_res.status_code == 200
        data = search_res.get_json()
        assert 'enquiries' in data
        assert 'bids' in data
        assert 'documents' in data

        assert any(e['customerName'] == 'Acme Search Corp' for e in data['enquiries'])
        assert any(b['bidId'] == bid_id for b in data['bids'])
        assert any(d['filename'] == 'acme_spec.pdf' for d in data['documents'])

        empty_res = client.get('/api/search?q=nonexistentxyz123', headers=headers)
        assert empty_res.status_code == 200
        empty_data = empty_res.get_json()
        assert len(empty_data['enquiries']) == 0
        assert len(empty_data['bids']) == 0
        assert len(empty_data['documents']) == 0


class TestSLATracking:
    def test_sla_check_and_report(self, client, auth_headers):
        headers = auth_headers('Admin User', 'admin@bidflow.com', 'Admin123!', 'Admin')

        enq_res = client.post('/api/enquiries/', json={
            'customerName': 'SLA Corp',
            'contactInformation': 'sla@example.com',
            'productServiceRequired': 'Consultancy SLA',
            'priority': 'Medium'
        }, headers=headers)
        enq_data = enq_res.get_json()

        bid_res = client.post('/api/bids/', json={
            'enquiryId': enq_data['enquiryId'], 'amount': 30000,
            'submissionDate': '2026-12-05',
            'assignedEmployee': 'Exec User'
        }, headers=headers)
        bid_data = bid_res.get_json()

        six_days_ago = datetime.datetime.now(datetime.UTC) - datetime.timedelta(days=6)
        db.Bids.update_one(
            {'_id': ObjectId(bid_data['_id'])},
            {'$set': {'history.0.date': six_days_ago}}
        )

        check_res = client.post('/api/admin/sla/check', headers=headers)
        assert check_res.status_code == 200
        check_data = check_res.get_json()
        assert check_data['breaches'] >= 1

        report_res = client.get('/api/admin/sla/report', headers=headers)
        assert report_res.status_code == 200
        report_data = report_res.get_json()

        stages = [item['stage'] for item in report_data['by_stage']]
        employees = [item['employee'] for item in report_data['by_employee']]
        assert 'Quotation Prepared' in stages
        assert 'Exec User' in employees

        breached_ids = [b['bidId'] for b in report_data['details']]
        assert bid_data['bidId'] in breached_ids


class TestAdminModelStatus:
    def test_model_status_endpoint(self, client, auth_headers):
        headers = auth_headers('Admin', 'admin@bidflow.com', 'Admin123!', 'Admin')

        status_res = client.get('/api/admin/model-status', headers=headers)
        assert status_res.status_code == 200
        data = status_res.get_json()
        assert 'model' in data
        assert 'terminal_bids' in data
        assert 'ready_to_retrain' in data
        assert isinstance(data['ready_to_retrain'], bool)
