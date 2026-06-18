import re

BID_ID_PATTERN = re.compile(r'^BID-[0-9a-f]{8}$')
ENQ_ID_PATTERN = re.compile(r'^ENQ-[0-9a-f]{8}$')


class TestNonSequentialIds:
    def test_enquiry_ids_are_unpredictable(self, client, auth_headers):
        headers = auth_headers()

        enq1 = client.post('/api/v1/enquiries/', json={
            'customerName': 'Alpha Corp',
            'contactInformation': 'alpha@corp.com',
            'productServiceRequired': 'Widgets'
        }, headers=headers)
        enq2 = client.post('/api/v1/enquiries/', json={
            'customerName': 'Beta Corp',
            'contactInformation': 'beta@corp.com',
            'productServiceRequired': 'Gadgets'
        }, headers=headers)

        assert enq1.status_code == 201
        assert enq2.status_code == 201

        id1 = enq1.get_json()['enquiryId']
        id2 = enq2.get_json()['enquiryId']

        assert re.match(ENQ_ID_PATTERN, id1), f"Enquiry ID '{id1}' does not match ENQ-<8hex>"
        assert re.match(ENQ_ID_PATTERN, id2), f"Enquiry ID '{id2}' does not match ENQ-<8hex>"
        assert id1 != id2

    def test_bid_ids_are_unpredictable(self, client, auth_headers):
        headers = auth_headers()

        enq_res = client.post('/api/v1/enquiries/', json={
            'customerName': 'Bid ID Test',
            'contactInformation': 'bid@test.com',
            'productServiceRequired': 'Testing'
        }, headers=headers)
        enquiry_id = enq_res.get_json()['enquiryId']

        bid_res = client.post('/api/v1/bids/', json={
            'enquiryId': enquiry_id, 'amount': 5000,
            'submissionDate': '2026-09-01', 'industry': 'Technology'
        }, headers=headers)
        assert bid_res.status_code == 201

        bid_id = bid_res.get_json()['bidId']
        assert re.match(BID_ID_PATTERN, bid_id), f"Bid ID '{bid_id}' does not match BID-<8hex>"
