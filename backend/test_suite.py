import os
# Override MongoDB and configuration settings to use test database BEFORE importing the app
os.environ['MONGO_URI'] = 'mongodb://localhost:27017/bidflow_test'
os.environ['SECRET_KEY'] = 'test-secret-key-123'
os.environ['JWT_SECRET_KEY'] = 'test-jwt-secret-key-123'
os.environ['FLASK_ENV'] = 'testing'

import unittest
import json
import datetime
import re
from bson import ObjectId
from app import create_app
from database import db
from unittest.mock import patch

# Regex for the new non-sequential ID formats
BID_ID_PATTERN = re.compile(r'^BID-[0-9a-f]{8}$')
ENQ_ID_PATTERN = re.compile(r'^ENQ-[0-9a-f]{8}$')


class BidFlowTestSuite(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        # Disable rate limiting during tests
        cls.app.config['RATELIMIT_ENABLED'] = False
        cls.client = cls.app.test_client()

    def setUp(self):
        # Clear collections before each test run
        db.Users.delete_many({})
        db.Enquiries.delete_many({})
        db.Bids.delete_many({})
        db.AuditLogs.delete_many({})
        db.Documents.delete_many({})
        db.RevokedTokens.delete_many({})

    def tearDown(self):
        # Clean up database after each test run
        db.Users.delete_many({})
        db.Enquiries.delete_many({})
        db.Bids.delete_many({})
        db.AuditLogs.delete_many({})
        db.Documents.delete_many({})
        db.RevokedTokens.delete_many({})

    def _register_user(self, name, email, password, role="Sales Executive"):
        payload = {
            "name": name,
            "email": email,
            "password": password,
            "role": role
        }
        return self.client.post('/api/auth/register', json=payload)

    def _login_user(self, email, password):
        payload = {"email": email, "password": password}
        return self.client.post('/api/auth/login', json=payload)

    def _get_auth_headers(self, email, password):
        res = self._login_user(email, password)
        token = res.get_json().get('access_token')
        return {"Authorization": f"Bearer {token}"}

    # ==========================================
    # 1. USER AUTHENTICATION & VALIDATION TESTS
    # ==========================================
    def test_auth_flows(self):
        # Valid registration
        res = self._register_user("Sales User", "sales@bidflow.com", "salespass123")
        self.assertEqual(res.status_code, 201)
        self.assertIn("User created successfully", res.get_json().get('msg'))

        # Duplicate registration
        res = self._register_user("Sales User Duplicate", "sales@bidflow.com", "salespass123")
        self.assertEqual(res.status_code, 400)
        self.assertIn("already exists", res.get_json().get('msg'))

        # Missing password
        res = self.client.post('/api/auth/register', json={"name": "No Password", "email": "nopass@bidflow.com"})
        self.assertEqual(res.status_code, 400)
        self.assertIn("Missing required fields", res.get_json().get('msg'))

        # Valid login
        res = self._login_user("sales@bidflow.com", "salespass123")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn("access_token", data)
        self.assertEqual(data["user"]["email"], "sales@bidflow.com")
        self.assertEqual(data["user"]["role"], "Sales Executive")

        # Bad password
        res = self._login_user("sales@bidflow.com", "wrongpass")
        self.assertEqual(res.status_code, 401)
        self.assertIn("Bad email or password", res.get_json().get('msg'))

        # /me retrieval
        headers = self._get_auth_headers("sales@bidflow.com", "salespass123")
        res = self.client.get('/api/auth/me', headers=headers)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json()["email"], "sales@bidflow.com")

    # ==========================================
    # 1b. JWT LOGOUT / TOKEN REVOCATION TESTS
    # ==========================================
    def test_jwt_logout_and_revocation(self):
        self._register_user("Logout User", "logout@bidflow.com", "logoutpass")
        headers = self._get_auth_headers("logout@bidflow.com", "logoutpass")

        # Token works before logout
        res = self.client.get('/api/auth/me', headers=headers)
        self.assertEqual(res.status_code, 200)

        # Logout — server revokes the token
        logout_res = self.client.post('/api/auth/logout', headers=headers)
        self.assertEqual(logout_res.status_code, 200)
        self.assertIn("Successfully logged out", logout_res.get_json().get('msg'))

        # Same token should now be rejected
        revoked_res = self.client.get('/api/auth/me', headers=headers)
        self.assertEqual(revoked_res.status_code, 401)

    # ==========================================
    # 2. ROLE-BASED DASHBOARDS & API RESTRICTIONS
    # ==========================================
    def test_role_based_authorizations(self):
        self._register_user("Exec User", "exec@bidflow.com", "exec123", "Sales Executive")
        self._register_user("Admin User", "admin@bidflow.com", "admin123", "Admin")

        exec_headers  = self._get_auth_headers("exec@bidflow.com", "exec123")
        admin_headers = self._get_auth_headers("admin@bidflow.com", "admin123")

        payload = {
            "customerName": "Test Client",
            "contactInformation": "client@example.com",
            "productServiceRequired": "Consulting Services",
            "priority": "Medium",
            "notes": "Testing delete"
        }
        create_res = self.client.post('/api/enquiries/', json=payload, headers=exec_headers)
        self.assertEqual(create_res.status_code, 201)
        enq_db_id = create_res.get_json().get('_id')

        # 1. Executive cannot delete → 403
        delete_fail_res = self.client.delete(f'/api/enquiries/{enq_db_id}', headers=exec_headers)
        self.assertEqual(delete_fail_res.status_code, 403)
        self.assertIn("Admin access required", delete_fail_res.get_json().get('msg'))

        # 2. Executive cannot read audit logs → 403
        audit_fail_res = self.client.get('/api/audit/', headers=exec_headers)
        self.assertEqual(audit_fail_res.status_code, 403)

        # 3. Admin deletes → 200
        delete_success_res = self.client.delete(f'/api/enquiries/{enq_db_id}', headers=admin_headers)
        self.assertEqual(delete_success_res.status_code, 200)

        # 4. Admin reads audit logs → 200 with logged actions
        audit_success_res = self.client.get('/api/audit/', headers=admin_headers)
        self.assertEqual(audit_success_res.status_code, 200)
        logs = audit_success_res.get_json()
        self.assertTrue(len(logs) > 0)
        actions = [log['action'] for log in logs]
        self.assertIn("CREATE_ENQUIRY", actions)
        self.assertIn("DELETE_ENQUIRY", actions)

    # ==========================================
    # 3. NON-SEQUENTIAL ID FORMAT TESTS
    # ==========================================
    def test_non_sequential_ids(self):
        """Verify bid and enquiry IDs are unpredictable token-based strings."""
        self._register_user("Exec User", "exec@bidflow.com", "exec123", "Sales Executive")
        headers = self._get_auth_headers("exec@bidflow.com", "exec123")

        # Create two enquiries — IDs must be non-sequential
        enq1 = self.client.post('/api/enquiries/', json={"customerName": "Alpha Corp"}, headers=headers)
        enq2 = self.client.post('/api/enquiries/', json={"customerName": "Beta Corp"}, headers=headers)
        self.assertEqual(enq1.status_code, 201)
        self.assertEqual(enq2.status_code, 201)

        id1 = enq1.get_json()['enquiryId']
        id2 = enq2.get_json()['enquiryId']

        # Both must match ENQ-<8 hex> pattern
        self.assertRegex(id1, ENQ_ID_PATTERN, f"Enquiry ID '{id1}' does not match ENQ-<8hex>")
        self.assertRegex(id2, ENQ_ID_PATTERN, f"Enquiry ID '{id2}' does not match ENQ-<8hex>")
        # They must differ (non-sequential)
        self.assertNotEqual(id1, id2)

        # Create a bid and verify its ID format
        bid_res = self.client.post('/api/bids/', json={
            "enquiryId": id1, "amount": 5000,
            "submissionDate": "2026-09-01", "industry": "Technology"
        }, headers=headers)
        self.assertEqual(bid_res.status_code, 201)
        bid_id = bid_res.get_json()['bidId']
        self.assertRegex(bid_id, BID_ID_PATTERN, f"Bid ID '{bid_id}' does not match BID-<8hex>")

    # ==========================================
    # 4. AI-BASED BID SUCCESS PREDICTION TESTS
    # ==========================================
    def test_ai_predictions(self):
        self._register_user("Exec User", "exec@bidflow.com", "exec123", "Sales Executive")
        headers = self._get_auth_headers("exec@bidflow.com", "exec123")

        enq_payload = {
            "customerName": "Predict Corp",
            "contactInformation": "predict@example.com",
            "productServiceRequired": "ML Platform Implementation",
            "priority": "High"
        }
        enq_res   = self.client.post('/api/enquiries/', json=enq_payload, headers=headers)
        enquiry_id = enq_res.get_json()["enquiryId"]

        # On-the-fly predict endpoint
        predict_payload = {
            "amount": 25000,
            "days_to_deadline": 15,
            "priority_encoded": 2,
            "is_repeat_customer": 1,
            "industry": "Technology"
        }
        predict_res = self.client.post('/api/bids/predict', json=predict_payload, headers=headers)
        if predict_res.status_code == 503:
            self.assertIn("ML model not loaded", predict_res.get_json().get('msg'))
        else:
            self.assertEqual(predict_res.status_code, 200)
            data = predict_res.get_json()
            self.assertIn("win_probability", data)
            self.assertIn("computed_win_rate_pct", data)
            prob = data["win_probability"]
            self.assertTrue(0 <= prob <= 100)

        # Bid creation with prediction
        bid_payload = {
            "enquiryId": enquiry_id,
            "amount": 50000,
            "submissionDate": (datetime.datetime.now() + datetime.timedelta(days=20)).strftime("%Y-%m-%d"),
            "assignedEmployee": "Exec User",
            "industry": "Healthcare",
            "remarks": "Large medical software sale"
        }
        bid_res  = self.client.post('/api/bids/', json=bid_payload, headers=headers)
        self.assertEqual(bid_res.status_code, 201)
        bid_data = bid_res.get_json()
        self.assertIn("aiPrediction", bid_data)
        self.assertIsInstance(bid_data["aiPrediction"], int)
        self.assertTrue(0 <= bid_data["aiPrediction"] <= 100)

    # ==========================================
    # 5. WIN RATE ISOLATION TESTS
    # ==========================================
    def test_win_rate_from_bid_history_not_profile(self):
        """
        Verify the ML pipeline uses real bid outcomes (not profile winRate).
        A user with winRate=100 but zero won bids should get neutral (0.5) computed win rate.
        """
        self._register_user("Inflated User", "inflated@bidflow.com", "pass123", "Sales Executive")
        headers = self._get_auth_headers("inflated@bidflow.com", "pass123")

        # Set profile winRate to 100 — the old loophole
        profile_res = self.client.put('/api/auth/profile',
                                      json={"winRate": 100}, headers=headers)
        self.assertEqual(profile_res.status_code, 200)
        self.assertEqual(profile_res.get_json()["winRate"], 100)

        # Verify on-the-fly predict uses COMPUTED win rate (cold-start = 0.5), not profile 100
        predict_res = self.client.post('/api/bids/predict', json={
            "amount": 10000, "days_to_deadline": 30, "assignedEmployee": "Inflated User"
        }, headers=headers)

        if predict_res.status_code != 503:   # model may not be loaded in test env
            self.assertEqual(predict_res.status_code, 200)
            data = predict_res.get_json()
            # computed_win_rate_pct must be 50.0 (cold-start prior, not profile 100)
            self.assertAlmostEqual(data["computed_win_rate_pct"], 50.0,
                                   msg="Win rate should be cold-start 50.0, not inflated from profile")

    # ==========================================
    # 6. REAL-TIME COMMENTS & SOCKETIO EMISSIONS
    # ==========================================
    @patch('routes.bids.socketio.emit')
    def test_comments_and_socketio_emissions(self, mock_emit):
        self._register_user("Exec User", "exec@bidflow.com", "exec123", "Sales Executive")
        headers = self._get_auth_headers("exec@bidflow.com", "exec123")

        enq_res    = self.client.post('/api/enquiries/',
                                      json={"customerName": "Client Comment",
                                            "productServiceRequired": "Chat Server"},
                                      headers=headers)
        enquiry_id = enq_res.get_json()["enquiryId"]

        bid_res    = self.client.post('/api/bids/', json={
            "enquiryId": enquiry_id, "amount": 8000,
            "submissionDate": "2026-07-01",
            "assignedEmployee": "Exec User", "industry": "Technology"
        }, headers=headers)
        bid_db_id  = bid_res.get_json()["_id"]

        comment_res = self.client.post(f'/api/bids/{bid_db_id}/comments',
                                       json={"text": "This is a real-time negotiation comment."},
                                       headers=headers)
        self.assertEqual(comment_res.status_code, 201)

        comment_data = comment_res.get_json()
        self.assertEqual(comment_data["text"], "This is a real-time negotiation comment.")
        self.assertEqual(comment_data["author"], "Exec User")

        mock_emit.assert_called_once()
        args, _ = mock_emit.call_args
        self.assertEqual(args[0], 'new_comment')
        self.assertEqual(args[1]['bid_id'], bid_db_id)
        self.assertEqual(args[1]['comment']['text'], "This is a real-time negotiation comment.")

        bid_in_db = db.Bids.find_one({"_id": ObjectId(bid_db_id)})
        self.assertEqual(len(bid_in_db["comments"]), 1)
        self.assertEqual(bid_in_db["comments"][0]["text"], "This is a real-time negotiation comment.")

    # ==========================================
    # 7. EXCEL/PDF EXPORT & KPI ANALYTICS
    # ==========================================
    def test_kpi_analytics_and_exports(self):
        self._register_user("Exec User", "exec@bidflow.com", "exec123", "Sales Executive")
        headers = self._get_auth_headers("exec@bidflow.com", "exec123")

        self.client.post('/api/enquiries/', json={"customerName": "Client 1"}, headers=headers)
        self.client.post('/api/enquiries/', json={"customerName": "Client 2"}, headers=headers)

        bid1_res = self.client.post('/api/bids/', json={
            "enquiryId": "ENQ-test01", "amount": 10000,
            "submissionDate": "2026-07-01", "industry": "Technology"
        }, headers=headers)
        bid1_id = bid1_res.get_json()["_id"]
        self.client.put(f'/api/bids/{bid1_id}/status',
                        json={"status": "Order Received", "note": "Deal won"}, headers=headers)

        bid2_res = self.client.post('/api/bids/', json={
            "enquiryId": "ENQ-test02", "amount": 20000,
            "submissionDate": "2026-07-01", "industry": "Technology"
        }, headers=headers)
        bid2_id = bid2_res.get_json()["_id"]
        self.client.put(f'/api/bids/{bid2_id}/status',
                        json={"status": "Rejected", "note": "Deal lost"}, headers=headers)

        self.client.post('/api/bids/', json={
            "enquiryId": "ENQ-test01", "amount": 30000,
            "submissionDate": "2026-07-01", "industry": "Technology"
        }, headers=headers)

        dash_res = self.client.get('/api/analytics/dashboard', headers=headers)
        self.assertEqual(dash_res.status_code, 200)
        metrics = dash_res.get_json()

        self.assertEqual(metrics["totalEnquiries"], 2)
        self.assertEqual(metrics["activeBids"], 1)
        self.assertEqual(metrics["wonBids"], 1)
        self.assertEqual(metrics["lostBids"], 1)
        self.assertEqual(metrics["revenueGenerated"], 10000)
        self.assertEqual(metrics["winRate"], 50.0)
        self.assertEqual(metrics["avgBidSize"], 20000.0)

        export_res = self.client.get('/api/analytics/export/excel', headers=headers)
        self.assertEqual(export_res.status_code, 200)
        self.assertEqual(export_res.mimetype, "text/csv")
        csv_data = export_res.get_data(as_text=True)
        self.assertIn("Bid ID", csv_data)
        self.assertIn("Amount", csv_data)
        self.assertIn("Status", csv_data)

    # ==========================================
    # 8. DOCUMENT UPLOAD TESTS
    # ==========================================
    def test_document_uploads(self):
        self._register_user("Exec User", "exec@bidflow.com", "exec123", "Sales Executive")
        headers = self._get_auth_headers("exec@bidflow.com", "exec123")

        enq_res    = self.client.post('/api/enquiries/',
                                      json={"customerName": "Doc Corp",
                                            "productServiceRequired": "Doc Management"},
                                      headers=headers)
        enquiry_id = enq_res.get_json()["enquiryId"]

        bid_res   = self.client.post('/api/bids/', json={
            "enquiryId": enquiry_id, "amount": 10000,
            "submissionDate": "2026-08-01", "assignedEmployee": "Exec User"
        }, headers=headers)
        bid_db_id = bid_res.get_json()["_id"]

        # Missing file
        upload_fail_1 = self.client.post('/api/documents/upload',
                                         data={"bidId": bid_db_id}, headers=headers)
        self.assertEqual(upload_fail_1.status_code, 400)
        self.assertIn("No file part", upload_fail_1.get_json()["msg"])

        import io
        # Empty filename
        upload_fail_2 = self.client.post('/api/documents/upload',
                                         data={"bidId": bid_db_id,
                                               "file": (io.BytesIO(b""), "")},
                                         headers=headers)
        self.assertEqual(upload_fail_2.status_code, 400)

        # Blocked extension
        upload_fail_3 = self.client.post('/api/documents/upload',
                                         data={"bidId": bid_db_id,
                                               "file": (io.BytesIO(b"binary"), "virus.exe")},
                                         headers=headers)
        self.assertEqual(upload_fail_3.status_code, 400)
        self.assertIn("File type not allowed", upload_fail_3.get_json()["msg"])

        # Valid PDF upload
        upload_success = self.client.post('/api/documents/upload',
                                          data={"bidId": bid_db_id,
                                                "file": (io.BytesIO(b"Sample PDF"), "proposal.pdf")},
                                          headers=headers)
        self.assertEqual(upload_success.status_code, 201)
        doc_data = upload_success.get_json()
        self.assertEqual(doc_data["filename"], "proposal.pdf")
        self.assertEqual(doc_data["bidId"], bid_db_id)

        # Verify in DB
        doc_in_db = db.Documents.find_one({"bidId": bid_db_id})
        self.assertIsNotNone(doc_in_db)
        self.assertEqual(doc_in_db["filename"], "proposal.pdf")

        # Cleanup uploaded file
        filepath = os.path.join(self.app.config['UPLOAD_FOLDER'], doc_data["path"])
        if os.path.exists(filepath):
            os.remove(filepath)

    # ==========================================
    # 9. USER PROFILE & PREDICTION INTEGRATION
    # ==========================================
    def test_user_profile_and_prediction_integration(self):
        self._register_user("Expert Estimator", "estimator@bidflow.com", "estimator123", "Sales Executive")
        headers = self._get_auth_headers("estimator@bidflow.com", "estimator123")

        profile_payload = {
            "name": "Expert Estimator",
            "industry": "Construction",
            "winRate": 90,
            "targetBidValue": 500000,
            "bio": "Expert estimator with 10 years experience."
        }
        update_res = self.client.put('/api/auth/profile', json=profile_payload, headers=headers)
        self.assertEqual(update_res.status_code, 200)
        profile_data = update_res.get_json()
        self.assertEqual(profile_data["name"], "Expert Estimator")
        self.assertEqual(profile_data["industry"], "Construction")
        self.assertEqual(profile_data["winRate"], 90)
        self.assertEqual(profile_data["targetBidValue"], 500000.0)

        # Validation: winRate > 100 must fail
        invalid_res = self.client.put('/api/auth/profile', json={"winRate": 150}, headers=headers)
        self.assertEqual(invalid_res.status_code, 400)

        enq_res    = self.client.post('/api/enquiries/',
                                      json={"customerName": "Big Developer",
                                            "productServiceRequired": "Skyscraper"},
                                      headers=headers)
        enquiry_id = enq_res.get_json()["enquiryId"]

        # Bid without industry — should inherit from user's industry profile
        bid_res = self.client.post('/api/bids/', json={
            "enquiryId": enquiry_id,
            "amount": 250000,
            "submissionDate": "2026-09-01",
            "assignedEmployee": "Expert Estimator",
            "remarks": "Major construction bid"
        }, headers=headers)
        self.assertEqual(bid_res.status_code, 201)
        bid_data = bid_res.get_json()

        # Industry must have fallen back to employee profile's Construction
        self.assertEqual(bid_data["industry"], "Construction")
        self.assertIn("aiPrediction", bid_data)

    # ==========================================
    # 10. ADMIN MODEL STATUS ENDPOINT
    # ==========================================
    def test_admin_model_status(self):
        self._register_user("Admin", "admin@bidflow.com", "admin123", "Admin")
        # Admin login: no 2FA set up, so gets full token directly
        admin_res = self._login_user("admin@bidflow.com", "admin123")
        token = admin_res.get_json().get('access_token')
        admin_headers = {"Authorization": f"Bearer {token}"}

        status_res = self.client.get('/api/admin/model-status', headers=admin_headers)
        self.assertEqual(status_res.status_code, 200)
        data = status_res.get_json()
        self.assertIn("model", data)
        self.assertIn("terminal_bids", data)
        self.assertIn("ready_to_retrain", data)
        self.assertIsInstance(data["ready_to_retrain"], bool)


if __name__ == '__main__':
    unittest.main()
