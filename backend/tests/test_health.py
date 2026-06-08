class TestRootEndpoints:
    def test_root_returns_running(self, client):
        res = client.get('/')
        assert res.status_code == 200
        assert res.get_json()['message'] == 'BidFlow API is running'

    def test_health_returns_healthy(self, client):
        res = client.get('/health')
        assert res.status_code == 200
        assert res.get_json()['status'] == 'healthy'
