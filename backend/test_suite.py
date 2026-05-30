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
        # Auto-capitalize if password does not have an uppercase letter to satisfy complexity rules
        if not any(c.isupper() for c in password):
            password = password.capitalize()
        payload = {
            "name": name,
            "email": email,
            "password": password,
            "role": role
        }
        res = self.client.post('/api/auth/register', json=payload)
        if res.status_code == 201:
            db.Users.update_one({"email": email.strip().lower()}, {"$set": {"is_verified": True}})
            if role != "Sales Executive":
                db.Users.update_one({"email": email.strip().lower()}, {"$set": {"role": role}})
        return res

    def _login_user(self, email, password):
        if not any(c.isupper() for c in password):
            password = password.capitalize()
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
        res = self._register_user("Sales User", "sales@bidflow.com", "salespass123!")
        self.assertEqual(res.status_code, 201)
        self.assertIn("Account created", res.get_json().get('msg'))


        # Duplicate registration
        res = self._register_user("Sales User Duplicate", "sales@bidflow.com", "salespass123!")
        self.assertEqual(res.status_code, 400)
        self.assertIn("already exists", res.get_json().get('msg'))

        # Missing password
        res = self.client.post('/api/auth/register', json={"name": "No Password", "email": "nopass@bidflow.com"})
        self.assertEqual(res.status_code, 400)
        self.assertIn("Missing required fields", res.get_json().get('msg'))

        # Valid login
        res = self._login_user("sales@bidflow.com", "salespass123!")
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
        headers = self._get_auth_headers("sales@bidflow.com", "salespass123!")
        res = self.client.get('/api/auth/me', headers=headers)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json()["email"], "sales@bidflow.com")

    # ==========================================
    # 1b. JWT LOGOUT / TOKEN REVOCATION TESTS
    # ==========================================
    def test_jwt_logout_and_revocation(self):
        self._register_user("Logout User", "logout@bidflow.com", "logoutpass123!")
        headers = self._get_auth_headers("logout@bidflow.com", "logoutpass123!")

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
        self._register_user("Exec User", "exec@bidflow.com", "exec1234!", "Sales Executive")
        self._register_user("Admin User", "admin@bidflow.com", "admin123!", "Admin")

        exec_headers  = self._get_auth_headers("exec@bidflow.com", "exec1234!")
        admin_headers = self._get_auth_headers("admin@bidflow.com", "admin123!")

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
        self._register_user("Exec User", "exec@bidflow.com", "exec1234!", "Sales Executive")
        headers = self._get_auth_headers("exec@bidflow.com", "exec1234!")

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
        self._register_user("Exec User", "exec@bidflow.com", "exec1234!", "Sales Executive")
        headers = self._get_auth_headers("exec@bidflow.com", "exec1234!")

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
        self._register_user("Inflated User", "inflated@bidflow.com", "pass1234!", "Sales Executive")
        headers = self._get_auth_headers("inflated@bidflow.com", "pass1234!")

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
        self._register_user("Exec User", "exec@bidflow.com", "exec1234!", "Sales Executive")
        headers = self._get_auth_headers("exec@bidflow.com", "exec1234!")

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
        self._register_user("Exec User", "exec@bidflow.com", "exec1234!", "Sales Executive")
        headers = self._get_auth_headers("exec@bidflow.com", "exec1234!")

        self.client.post('/api/enquiries/', json={"customerName": "Client 1"}, headers=headers)
        self.client.post('/api/enquiries/', json={"customerName": "Client 2"}, headers=headers)

        bid1_res = self.client.post('/api/bids/', json={
            "enquiryId": "ENQ-test01", "amount": 10000,
            "submissionDate": "2026-07-01", "industry": "Technology",
            "assignedEmployee": "Exec User"
        }, headers=headers)
        bid1_id = bid1_res.get_json()["_id"]
        self.client.put(f'/api/bids/{bid1_id}/status',
                        json={"status": "Order Received", "note": "Deal won"}, headers=headers)

        bid2_res = self.client.post('/api/bids/', json={
            "enquiryId": "ENQ-test02", "amount": 20000,
            "submissionDate": "2026-07-01", "industry": "Technology",
            "assignedEmployee": "Exec User"
        }, headers=headers)
        bid2_id = bid2_res.get_json()["_id"]
        self.client.put(f'/api/bids/{bid2_id}/status',
                        json={"status": "Rejected", "note": "Deal lost"}, headers=headers)

        self.client.post('/api/bids/', json={
            "enquiryId": "ENQ-test01", "amount": 30000,
            "submissionDate": "2026-07-01", "industry": "Technology",
            "assignedEmployee": "Exec User"
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
        self._register_user("Exec User", "exec@bidflow.com", "exec1234!", "Sales Executive")
        headers = self._get_auth_headers("exec@bidflow.com", "exec1234!")

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
        self._register_user("Expert Estimator", "estimator@bidflow.com", "estimator123!", "Sales Executive")
        headers = self._get_auth_headers("estimator@bidflow.com", "estimator123!")

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
        self._register_user("Admin", "admin@bidflow.com", "admin123!", "Admin")
        # Admin login: no 2FA set up, so gets full token directly
        admin_res = self._login_user("admin@bidflow.com", "admin123!")
        token = admin_res.get_json().get('access_token')
        admin_headers = {"Authorization": f"Bearer {token}"}

        status_res = self.client.get('/api/admin/model-status', headers=admin_headers)
        self.assertEqual(status_res.status_code, 200)
        data = status_res.get_json()
        self.assertIn("model", data)
        self.assertIn("terminal_bids", data)
        self.assertIn("ready_to_retrain", data)
        self.assertIsInstance(data["ready_to_retrain"], bool)

    # ==========================================
    # 11. CALENDAR VIEW TESTS
    # ==========================================
    def test_calendar_view(self):
        self._register_user("Exec User", "exec@bidflow.com", "exec1234!", "Sales Executive")
        headers = self._get_auth_headers("exec@bidflow.com", "exec1234!")

        # 1. Create Enquiry with High Priority
        enq_payload = {
            "customerName": "Calendar Client",
            "contactInformation": "calendar@example.com",
            "productServiceRequired": "Calendar Integration",
            "priority": "High",
            "notes": "Urgent feature setup"
        }
        enq_res = self.client.post('/api/enquiries/', json=enq_payload, headers=headers)
        self.assertEqual(enq_res.status_code, 201)
        enquiry_id = enq_res.get_json()["enquiryId"]

        # 2. Create Bid with a specific submissionDate (e.g. 2026-05-30)
        bid_payload = {
            "enquiryId": enquiry_id,
            "amount": 12000,
            "submissionDate": "2026-05-30",
            "assignedEmployee": "Exec User",
            "industry": "Technology",
            "remarks": "Cal Bid"
        }
        bid_res = self.client.post('/api/bids/', json=bid_payload, headers=headers)
        self.assertEqual(bid_res.status_code, 201)

        # 3. Request calendar view
        cal_res = self.client.get('/api/bids/calendar', headers=headers)
        self.assertEqual(cal_res.status_code, 200)
        events = cal_res.get_json()
        self.assertTrue(len(events) >= 1)

        # Verify that priority and parent enquiry details are resolved
        matching_event = [e for e in events if e["enquiryId"] == enquiry_id]
        self.assertEqual(len(matching_event), 1)
        event = matching_event[0]
        self.assertEqual(event["submissionDate"], "2026-05-30")
        self.assertEqual(event["customerName"], "Calendar Client")
        self.assertEqual(event["priority"], "High")
        self.assertEqual(event["productServiceRequired"], "Calendar Integration")

        # 4. Test filtering by month YYYY-MM
        filtered_res = self.client.get('/api/bids/calendar?month=2026-05', headers=headers)
        self.assertEqual(filtered_res.status_code, 200)
        filtered_events = filtered_res.get_json()
        self.assertTrue(len(filtered_events) >= 1)
        self.assertTrue(any(e["enquiryId"] == enquiry_id for e in filtered_events))

        # Test non-matching month filter
        non_matching_res = self.client.get('/api/bids/calendar?month=2026-06', headers=headers)
        self.assertEqual(non_matching_res.status_code, 200)
        non_matching_events = non_matching_res.get_json()
        self.assertFalse(any(e["enquiryId"] == enquiry_id for e in non_matching_events))

    # ==========================================
    # 12. GLOBAL SEARCH TESTS
    # ==========================================
    def test_global_search(self):
        self._register_user("Exec User", "exec@bidflow.com", "exec1234!", "Sales Executive")
        headers = self._get_auth_headers("exec@bidflow.com", "exec1234!")

        # 1. Create Enquiry
        enq_payload = {
            "customerName": "Acme Search Corp",
            "contactInformation": "acme@example.com",
            "productServiceRequired": "Global Search Feature",
            "priority": "Medium",
            "notes": "Acme details notes"
        }
        enq_res = self.client.post('/api/enquiries/', json=enq_payload, headers=headers)
        self.assertEqual(enq_res.status_code, 201)
        enquiry_id = enq_res.get_json()["enquiryId"]

        # 2. Create Bid
        bid_payload = {
            "enquiryId": enquiry_id,
            "amount": 95000,
            "submissionDate": "2026-10-15",
            "assignedEmployee": "Exec User",
            "remarks": "Acme Search Bid"
        }
        bid_res = self.client.post('/api/bids/', json=bid_payload, headers=headers)
        self.assertEqual(bid_res.status_code, 201)
        bid_id = bid_res.get_json()["bidId"]

        # 3. Create Document
        import io
        upload_res = self.client.post('/api/documents/upload',
                                      data={"bidId": bid_res.get_json()["_id"],
                                            "file": (io.BytesIO(b"Acme Docs"), "acme_spec.pdf")},
                                      headers=headers)
        self.assertEqual(upload_res.status_code, 201)

        # 4. Search for "Acme"
        search_res = self.client.get('/api/search?q=acme', headers=headers)
        self.assertEqual(search_res.status_code, 200)
        data = search_res.get_json()
        self.assertIn("enquiries", data)
        self.assertIn("bids", data)
        self.assertIn("documents", data)

        # Check matched enquiry
        self.assertTrue(any(e["customerName"] == "Acme Search Corp" for e in data["enquiries"]))
        # Check matched bid
        self.assertTrue(any(b["bidId"] == bid_id for b in data["bids"]))
        # Check matched document
        self.assertTrue(any(d["filename"] == "acme_spec.pdf" for d in data["documents"]))

        # 5. Search for non-existent keyword
        empty_search_res = self.client.get('/api/search?q=nonexistentxyz123', headers=headers)
        self.assertEqual(empty_search_res.status_code, 200)
        empty_data = empty_search_res.get_json()
        self.assertEqual(len(empty_data["enquiries"]), 0)
        self.assertEqual(len(empty_data["bids"]), 0)
        self.assertEqual(len(empty_data["documents"]), 0)

    # ==========================================
    # 13. CUSTOM TAGS & FILTERS TESTS
    # ==========================================
    def test_custom_tags_and_filters(self):
        self._register_user("Exec User", "exec@bidflow.com", "exec1234!", "Sales Executive")
        headers = self._get_auth_headers("exec@bidflow.com", "exec1234!")

        # 1. Create Enquiry with Tags
        enq_payload = {
            "customerName": "Tagged Corp",
            "contactInformation": "tagged@example.com",
            "productServiceRequired": "Tag Consulting",
            "priority": "Medium",
            "tags": ["repeat-client", "construction"]
        }
        enq_res = self.client.post('/api/enquiries/', json=enq_payload, headers=headers)
        self.assertEqual(enq_res.status_code, 201)
        enq_data = enq_res.get_json()
        self.assertIn("tags", enq_data)
        self.assertEqual(enq_data["tags"], ["repeat-client", "construction"])

        # 2. Create Bid with Tags
        bid_payload = {
            "enquiryId": enq_data["enquiryId"],
            "amount": 15000,
            "submissionDate": "2026-11-20",
            "assignedEmployee": "Exec User",
            "tags": ["construction", "high-risk"]
        }
        bid_res = self.client.post('/api/bids/', json=bid_payload, headers=headers)
        self.assertEqual(bid_res.status_code, 201)
        bid_data = bid_res.get_json()
        self.assertIn("tags", bid_data)
        self.assertEqual(bid_data["tags"], ["construction", "high-risk"])

        # 3. Test generic PUT Route for Bids (update tags)
        update_bid_res = self.client.put(f'/api/bids/{bid_data["_id"]}', json={
            "tags": ["construction", "high-risk", "updated-tag"]
        }, headers=headers)
        self.assertEqual(update_bid_res.status_code, 200)

        # Retrieve bid to confirm tags updated
        get_bids_res = self.client.get('/api/bids/', headers=headers)
        self.assertEqual(get_bids_res.status_code, 200)
        matching_bid = [b for b in get_bids_res.get_json() if b["_id"] == bid_data["_id"]][0]
        self.assertEqual(matching_bid["tags"], ["construction", "high-risk", "updated-tag"])

        # 4. Fetch unique tags endpoint
        tags_res = self.client.get('/api/tags/', headers=headers)
        self.assertEqual(tags_res.status_code, 200)
        unique_tags = tags_res.get_json()
        # Should contain sorted: "construction", "high-risk", "repeat-client", "updated-tag"
        self.assertIn("construction", unique_tags)
        self.assertIn("high-risk", unique_tags)
        self.assertIn("repeat-client", unique_tags)
        self.assertIn("updated-tag", unique_tags)

    # ==========================================
    # 14. PDF QUOTATION GENERATOR TESTS
    # ==========================================
    def test_quotation_pdf_generation(self):
        self._register_user("Exec User", "exec@bidflow.com", "exec1234!", "Sales Executive")
        headers = self._get_auth_headers("exec@bidflow.com", "exec1234!")

        # 1. Create Enquiry
        enq_payload = {
            "customerName": "Quote Corp",
            "contactInformation": "quote@example.com",
            "productServiceRequired": "PDF Construction",
            "priority": "Medium"
        }
        enq_res = self.client.post('/api/enquiries/', json=enq_payload, headers=headers)
        self.assertEqual(enq_res.status_code, 201)
        enq_data = enq_res.get_json()

        # 2. Create Bid
        bid_payload = {
            "enquiryId": enq_data["enquiryId"],
            "amount": 25000,
            "submissionDate": "2026-12-01",
            "assignedEmployee": "Exec User"
        }
        bid_res = self.client.post('/api/bids/', json=bid_payload, headers=headers)
        self.assertEqual(bid_res.status_code, 201)
        bid_data = bid_res.get_json()

        # 3. Export PDF
        pdf_res = self.client.get(f'/api/bids/{bid_data["_id"]}/quotation', headers=headers)
        self.assertEqual(pdf_res.status_code, 200)
        self.assertEqual(pdf_res.headers.get('Content-Type'), 'application/pdf')
        self.assertTrue(len(pdf_res.data) > 0)
        self.assertTrue(pdf_res.data.startswith(b'%PDF'))

    # ==========================================
    # 15. CUSTOMER PORTAL SHARING TESTS
    # ==========================================
    def test_customer_portal_sharing(self):
        self._register_user("Exec User", "exec@bidflow.com", "exec1234!", "Sales Executive")
        headers = self._get_auth_headers("exec@bidflow.com", "exec1234!")

        # 1. Create Enquiry
        enq_payload = {
            "customerName": "Shared Customer Corp",
            "contactInformation": "shared@example.com",
            "productServiceRequired": "Public Tracking App",
            "priority": "High"
        }
        enq_res = self.client.post('/api/enquiries/', json=enq_payload, headers=headers)
        self.assertEqual(enq_res.status_code, 201)
        enq_data = enq_res.get_json()

        # 2. Generate Share Link
        share_res = self.client.post(f'/api/enquiries/{enq_data["_id"]}/share', headers=headers)
        self.assertEqual(share_res.status_code, 200)
        share_data = share_res.get_json()
        self.assertIn("shareToken", share_data)
        self.assertIn("shareUrl", share_data)
        token = share_data["shareToken"]

        # 3. Access Public Share Route
        public_res = self.client.get(f'/api/enquiries/public/share/{token}')
        self.assertEqual(public_res.status_code, 200)
        public_data = public_res.get_json()
        self.assertEqual(public_data["enquiry"]["customerName"], "Shared Customer Corp")
        self.assertEqual(public_data["enquiry"]["productServiceRequired"], "Public Tracking App")
        self.assertNotIn("aiPrediction", public_data) # Excludes AI predictive info for privacy

        # 4. Mock Document creation in DB to verify document download checks
        # Create a bid first
        bid_payload = {
            "enquiryId": enq_data["enquiryId"],
            "amount": 50000,
            "submissionDate": "2026-12-15",
            "assignedEmployee": "Exec User"
        }
        bid_res = self.client.post('/api/bids/', json=bid_payload, headers=headers)
        self.assertEqual(bid_res.status_code, 201)
        bid_data = bid_res.get_json()

        # Insert doc directly to MongoDB to test public access
        doc_id = db.Documents.insert_one({
            "bidId": bid_data["bidId"],
            "filename": "proposal.pdf",
            "path": "mock_file.pdf",
            "uploadDate": datetime.datetime.utcnow()
        }).inserted_id

        # Verify public details fetch returns document reference
        public_res_updated = self.client.get(f'/api/enquiries/public/share/{token}')
        self.assertEqual(public_res_updated.status_code, 200)
        self.assertEqual(len(public_res_updated.get_json()["documents"]), 1)
        self.assertEqual(public_res_updated.get_json()["documents"][0]["filename"], "proposal.pdf")

        # Clean up db record
        db.Documents.delete_one({"_id": doc_id})

        # 5. Verify Expiry (token generated 91 days ago)
        db.Enquiries.update_one(
            {"enquiryId": enq_data["enquiryId"]},
            {"$set": {"shareTokenCreatedAt": datetime.datetime.utcnow() - datetime.timedelta(days=91)}}
        )
        expired_res = self.client.get(f'/api/enquiries/public/share/{token}')
        self.assertEqual(expired_res.status_code, 403)
        self.assertIn("expired", expired_res.get_json()["msg"].lower())

    # ==========================================
    # 16. SLA & DEADLINE TRACKING TESTS
    # ==========================================
    def test_sla_tracking_and_reporting(self):
        self._register_user("Admin User", "admin@bidflow.com", "admin123!", "Admin")
        headers = self._get_auth_headers("admin@bidflow.com", "admin123!")

        # 1. Create Enquiry & Bid
        enq_payload = {
            "customerName": "SLA Corp",
            "contactInformation": "sla@example.com",
            "productServiceRequired": "Consultancy SLA",
            "priority": "Medium"
        }
        enq_res = self.client.post('/api/enquiries/', json=enq_payload, headers=headers)
        enq_data = enq_res.get_json()

        bid_payload = {
            "enquiryId": enq_data["enquiryId"],
            "amount": 30000,
            "submissionDate": "2026-12-05",
            "assignedEmployee": "Exec User"
        }
        bid_res = self.client.post('/api/bids/', json=bid_payload, headers=headers)
        bid_data = bid_res.get_json()
        
        # Set history status transition date to 6 days ago (SLA threshold is 5 days)
        six_days_ago = datetime.datetime.utcnow() - datetime.timedelta(days=6)
        db.Bids.update_one(
            {"_id": ObjectId(bid_data["_id"])},
            {"$set": {"history.0.date": six_days_ago}}
        )

        # 2. Trigger SLA Check on-demand
        check_res = self.client.post('/api/admin/sla/check', headers=headers)
        self.assertEqual(check_res.status_code, 200)
        check_data = check_res.get_json()
        self.assertTrue(check_data["breaches"] >= 1)

        # 3. Retrieve SLA Report
        report_res = self.client.get('/api/admin/sla/report', headers=headers)
        self.assertEqual(report_res.status_code, 200)
        report_data = report_res.get_json()
        
        # Verify report aggregates
        stages = [item["stage"] for item in report_data["by_stage"]]
        employees = [item["employee"] for item in report_data["by_employee"]]
        self.assertIn("Quotation Prepared", stages)
        self.assertIn("Exec User", employees)
        
        # Verify details list contains our bid ID
        breached_bid_ids = [b["bidId"] for b in report_data["details"]]
        self.assertIn(bid_data["bidId"], breached_bid_ids)

    # ==========================================
    # 17. EMAIL VERIFICATION FLOW TESTS
    # ==========================================
    def test_email_verification_flow(self):
        # 1. Register a user (directly via API, not _register_user so is_verified is False)
        register_payload = {
            "name": "Verify Me",
            "email": "verify@bidflow.com",
            "password": "VerifyPassword123!"
        }
        res = self.client.post('/api/auth/register', json=register_payload)
        self.assertEqual(res.status_code, 201)
        self.assertIn("Please check your email to verify your account", res.get_json()["msg"])

        # 2. Verify account is not active
        user_in_db = db.Users.find_one({"email": "verify@bidflow.com"})
        self.assertIsNotNone(user_in_db)
        self.assertFalse(user_in_db.get("is_verified", False))

        # 3. Attempt login — must fail with 403
        login_res = self._login_user("verify@bidflow.com", "VerifyPassword123!")
        self.assertEqual(login_res.status_code, 403)
        self.assertEqual(login_res.get_json().get("error"), "email_not_verified")

        # 4. Generate verification token and verify it via verification endpoint
        from utils.email_tokens import generate_verification_token
        token = generate_verification_token("verify@bidflow.com")
        
        # Call verification route with token
        verify_res = self.client.get(f'/api/auth/verify-email?token={token}')
        self.assertEqual(verify_res.status_code, 200)
        self.assertIn("verified successfully", verify_res.get_json()["msg"])

        # 5. Verify user document is_verified state updated to True
        user_in_db_after = db.Users.find_one({"email": "verify@bidflow.com"})
        self.assertTrue(user_in_db_after.get("is_verified", False))

        # 6. Attempt login again — must succeed with 200
        login_success = self._login_user("verify@bidflow.com", "VerifyPassword123!")
        self.assertEqual(login_success.status_code, 200)
        self.assertIn("access_token", login_success.get_json())

        # 7. Test resend verification for unverified/missing emails
        # Unverified but verified now -> should return 200 (prevent enumeration)
        resend_res1 = self.client.post('/api/auth/resend-verification', json={"email": "verify@bidflow.com"})
        self.assertEqual(resend_res1.status_code, 200)

        # Missing email -> should return 200 (prevent enumeration)
        resend_res2 = self.client.post('/api/auth/resend-verification', json={"email": "nonexistent@bidflow.com"})
        self.assertEqual(resend_res2.status_code, 200)

    # ==========================================
    # 18. GOOGLE OAUTH & ALREADY VERIFIED RESEND TESTS
    # ==========================================
    @patch('utils.email_sender.send_already_verified_email')
    @patch('google.oauth2.id_token.verify_oauth2_token')
    def test_google_oauth_and_already_verified_resend(self, mock_verify, mock_send_already_verified):
        # --- Part A: Google Login/Registration ---
        # Mock Google token verification output
        mock_verify.return_value = {
            "email": "google_user@bidflow.com",
            "name": "Google User",
            "email_verified": True
        }

        # 1. First time login - auto-registers user
        from config import Config
        old_client_id = Config.GOOGLE_CLIENT_ID
        Config.GOOGLE_CLIENT_ID = "mock-client-id"

        payload = {"credential": "mock-jwt-token"}
        res = self.client.post('/api/auth/google-login', json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn("access_token", data)
        self.assertEqual(data["user"]["email"], "google_user@bidflow.com")
        self.assertEqual(data["user"]["role"], "Sales Executive")

        # Verify user is created in database and is_verified is True
        user = db.Users.find_one({"email": "google_user@bidflow.com"})
        self.assertIsNotNone(user)
        self.assertTrue(user.get("is_verified"))
        self.assertTrue(user.get("google_oauth"))

        # 2. Second time login - authenticates existing user
        res2 = self.client.post('/api/auth/google-login', json=payload)
        self.assertEqual(res2.status_code, 200)
        self.assertIn("access_token", res2.get_json())

        # Reset Client ID config
        Config.GOOGLE_CLIENT_ID = old_client_id

        # --- Part B: Already Verified Email Resend Warning ---
        # User "google_user@bidflow.com" is already verified. Let's request resend verification.
        resend_payload = {"email": "google_user@bidflow.com"}
        resend_res = self.client.post('/api/auth/resend-verification', json=resend_payload)
        self.assertEqual(resend_res.status_code, 200)
        self.assertIn("If that email exists and is unverified", resend_res.get_json().get("msg"))

        # Assert that mock_send_already_verified was called with the email
        mock_send_already_verified.assert_called_once_with("google_user@bidflow.com")


if __name__ == '__main__':
    unittest.main()



