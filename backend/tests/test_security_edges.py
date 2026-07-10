import pytest

def test_bad_object_id_returns_400(client, auth_headers):
    headers = auth_headers()
    # ObjectId must be 24-hex. 'invalid-id-str' is 14 chars, not 24-hex.
    res = client.delete(f'/api/v1/enquiries/invalid-id-str', headers=headers)
    assert res.status_code == 400
    assert 'invalid' in res.get_json().get('msg', '').lower()

def test_non_numeric_pagination_returns_400(client, auth_headers):
    headers = auth_headers()
    res = client.get('/api/v1/marketplace/?page=abc&size=xyz', headers=headers)
    assert res.status_code == 400
    assert 'invalid pagination parameters' in res.get_json().get('msg', '').lower()

def test_unauthorized_user_cannot_access_another_users_bid(client, auth_headers):
    headers_a = auth_headers('User A', 'usera@bidflow.com', 'Pass123!', 'Bidder')
    headers_b = auth_headers('User B', 'userb@bidflow.com', 'Pass123!', 'Bidder')

    admin = auth_headers('Admin', 'adm@bidflow.com', 'Pass123!', 'Admin')
    enq_res = client.post('/api/v1/enquiries/', json={
        'customerName': 'Test Corp',
        'contactInformation': 'test@corp.com',
        'productServiceRequired': 'Services',
        'visibility': 'public'
    }, headers=admin)
    enq_id = enq_res.get_json()['enquiryId']

    bid_res = client.post(f'/api/v1/marketplace/{enq_id}/bid', json={
        'amount': 1000
    }, headers=headers_a)
    bid_id = bid_res.get_json()['bid']['_id']

    # User B tries to delete the bid
    res = client.delete(f'/api/v1/bids/{bid_id}', headers=headers_b)
    assert res.status_code in [403, 404]

def test_unexpected_json_types_do_not_crash(client, auth_headers):
    headers = auth_headers()
    res = client.post('/api/v1/enquiries/', json={
        'customerName': ['array', 'instead', 'of', 'string'],
        'contactInformation': {'dict': 'instead_of_string'},
        'productServiceRequired': 12345
    }, headers=headers)
    # Should get 400 (validation error), not 500
    assert res.status_code == 400

def test_oversized_strings_truncated_or_rejected(client, auth_headers):
    headers = auth_headers()
    res = client.post('/api/v1/enquiries/', json={
        'customerName': 'A' * 20000, # 20k chars
        'contactInformation': 'test@corp.com',
        'productServiceRequired': 'Services'
    }, headers=headers)
    # The API should either return 400 (validation) or safely handle it
    assert res.status_code in [201, 400]
