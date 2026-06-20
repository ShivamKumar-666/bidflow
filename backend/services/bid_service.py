import datetime
import hashlib
import hmac
import io
import os
import random
import re
import secrets

import bleach
import joblib
import numpy as np
from bson.objectid import ObjectId
from database import db
from flask import current_app, render_template
from utils.auth_helpers import now_utc

try:
    import shap
except ImportError:
    shap = None

try:
    from xhtml2pdf import pisa
except ImportError:
    pisa = None


class BidService:
    """Business logic for bid management, ML predictions, and SHAP explanations."""

    ALLOWED_CURRENCIES = ["USD", "EUR", "GBP", "INR", "JPY", "CAD", "AUD"]

    CURRENCY_SYMBOLS = {
        "USD": "$", "EUR": "€", "GBP": "£", "INR": "₹",
        "JPY": "¥", "CAD": "C$", "AUD": "A$",
    }

    _model = None
    _industry_encoder = None
    _series_encoder = None
    _region_encoder = None
    _loaded_model_version = None
    _shap_explainer_cache = {"id": None, "explainer": None}
    _experience_cache = {}  # {employee_name: (count, timestamp)}
    _user_cache = {}  # {employee_name: (user_doc, timestamp)} — fixes N+1 user lookups
    _EXPERIENCE_CACHE_TTL = 60  # seconds
    _USER_CACHE_TTL = 60  # seconds
    _CACHE_MAX_SIZE = 500

    FEATURE_NAMES = [
        'amount', 'amount_log', 'days_to_deadline', 'deadline_urgency',
        'priority_encoded', 'employee_win_rate', 'employee_experience',
        'industry_win_rate', 'amount_vs_industry_avg', 'amount_x_win_rate',
        'industry_encoded', 'product_series_encoded', 'regional_office_encoded',
        'sales_price', 'team_size',
    ]

    VALID_STATUSES = {"Quotation Prepared", "Under Review", "Negotiation", "Order Received", "Rejected"}

    @classmethod
    def _verify_model_signature(cls, binary_data: bytes, stored_signature: str | None) -> bool:
        if not stored_signature:
            current_app.logger.warning(
                "Model loaded from MongoDB without an integrity signature — "
                "this is a legacy record. Retrain the model to add a signature."
            )
            return False
        expected = hmac.new(
            current_app.config['SECRET_KEY'].encode(),
            binary_data,
            hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(expected, stored_signature):
            current_app.logger.critical(
                "Model integrity check FAILED: the binary stored in MongoDB "
                "does not match its HMAC signature. Possible tampering detected. "
                "Falling back to local model file."
            )
            return False
        return True

    @classmethod
    def get_model_and_encoder(cls):
        if cls._model is not None:
            active_meta = db.ModelVersions.find_one({"isActive": True}, {"version": 1})
            if active_meta and active_meta["version"] == cls._loaded_model_version:
                return cls._model, cls._industry_encoder

        try:
            active_meta = db.ModelVersions.find_one({"isActive": True}, {"version": 1})
            if active_meta:
                active_ver = active_meta["version"]
                if active_ver != cls._loaded_model_version:
                    active_doc = db.ModelVersions.find_one({"isActive": True})
                    model_bin = active_doc.get("modelBinary")
                    encoder_bin = active_doc.get("encoderBinary")
                    if model_bin and encoder_bin:
                        if cls._verify_model_signature(model_bin, active_doc.get("modelSignature")):
                            if cls._verify_model_signature(encoder_bin, active_doc.get("encoderSignature")):
                                cls._model = joblib.load(io.BytesIO(model_bin))
                                cls._industry_encoder = joblib.load(io.BytesIO(encoder_bin))
                                cls._loaded_model_version = active_ver
                                current_app.logger.info("Hotswapped in-memory ML model to version %s from MongoDB", active_ver)
                                return cls._model, cls._industry_encoder

            if cls._model is None:
                ml_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ml')
                model_path = os.path.join(ml_dir, 'bid_model.pkl')
                encoder_path = os.path.join(ml_dir, 'industry_encoder.pkl')
                model_sig_path = os.path.join(ml_dir, 'bid_model.sig')
                encoder_sig_path = os.path.join(ml_dir, 'industry_encoder.sig')
                series_encoder_path = os.path.join(ml_dir, 'series_encoder.pkl')
                region_encoder_path = os.path.join(ml_dir, 'region_encoder.pkl')

                if os.path.exists(model_path) and os.path.exists(encoder_path):
                    model_verified = False
                    encoder_verified = False

                    if os.path.exists(model_sig_path):
                        with open(model_path, 'rb') as f:
                            model_bin = f.read()
                        with open(model_sig_path, 'r') as f:
                            stored_sig = f.read().strip()
                        expected_sig = hmac.new(
                            current_app.config['SECRET_KEY'].encode(),
                            model_bin,
                            hashlib.sha256
                        ).hexdigest()
                        if hmac.compare_digest(expected_sig, stored_sig):
                            cls._model = joblib.load(io.BytesIO(model_bin))
                            model_verified = True
                        else:
                            current_app.logger.critical(
                                "Local model file signature mismatch — possible tampering"
                            )

                    if os.path.exists(encoder_sig_path):
                        with open(encoder_path, 'rb') as f:
                            encoder_bin = f.read()
                        with open(encoder_sig_path, 'r') as f:
                            stored_sig = f.read().strip()
                        expected_sig = hmac.new(
                            current_app.config['SECRET_KEY'].encode(),
                            encoder_bin,
                            hashlib.sha256
                        ).hexdigest()
                        if hmac.compare_digest(expected_sig, stored_sig):
                            cls._industry_encoder = joblib.load(io.BytesIO(encoder_bin))
                            encoder_verified = True
                        else:
                            current_app.logger.critical(
                                "Local encoder file signature mismatch — possible tampering"
                            )

                    if not model_verified or not encoder_verified:
                        current_app.logger.warning(
                            "Loading model without signature verification (no .sig files found)"
                        )
                        if cls._model is None:
                            cls._model = joblib.load(model_path)
                        if cls._industry_encoder is None:
                            cls._industry_encoder = joblib.load(encoder_path)

                    if os.path.exists(series_encoder_path) and cls._series_encoder is None:
                        cls._series_encoder = joblib.load(series_encoder_path)
                    if os.path.exists(region_encoder_path) and cls._region_encoder is None:
                        cls._region_encoder = joblib.load(region_encoder_path)
        except Exception as e:
            current_app.logger.warning("Could not load ML model or encoder: %s", e)
        return cls._model, cls._industry_encoder

    @classmethod
    def generate_bid_id(cls) -> str:
        # Always emit BID-<8 hex chars> to satisfy the BIDS_SCHEMA pattern.
        for _ in range(8):
            bid_id = f"BID-{secrets.token_hex(4)}"
            if not db.Bids.find_one({"bidId": bid_id}):
                return bid_id
        raise RuntimeError("Could not generate a unique bid ID after 8 attempts")

    @classmethod
    def get_computed_win_rate(cls, employee_name: str) -> float:
        if not employee_name:
            return 0.5

        terminal_bids = list(db.Bids.find(
            {
                "assignedEmployee": employee_name,
                "status": {"$in": ["Order Received", "Rejected"]}
            },
            {"status": 1}
        ))

        if len(terminal_bids) < 3:
            return 0.5

        won = sum(1 for b in terminal_bids if b["status"] == "Order Received")
        return round(won / len(terminal_bids), 4)

    @classmethod
    def get_industry_win_rate(cls, industry: str) -> float:
        if not industry or industry == "Other":
            return 0.5

        terminal_bids = list(db.Bids.find(
            {
                "industry": industry,
                "status": {"$in": ["Order Received", "Rejected"]}
            },
            {"status": 1}
        ))

        if len(terminal_bids) < 3:
            return 0.5

        won = sum(1 for b in terminal_bids if b["status"] == "Order Received")
        return round(won / len(terminal_bids), 4)

    @classmethod
    def get_employee_experience(cls, employee_name: str) -> int:
        """Get employee bid count with TTL cache."""
        import time
        if not employee_name:
            return 1

        now = time.time()
        cached = cls._experience_cache.get(employee_name)
        if cached and (now - cached[1]) < cls._EXPERIENCE_CACHE_TTL:
            return cached[0]

        count = db.Bids.count_documents({"assignedEmployee": employee_name})
        if len(cls._experience_cache) >= cls._CACHE_MAX_SIZE:
            oldest_key = min(cls._experience_cache, key=lambda k: cls._experience_cache[k][1])
            del cls._experience_cache[oldest_key]
        cls._experience_cache[employee_name] = (count, now)
        return count

    @classmethod
    def get_user_by_name(cls, employee_name: str):
        """Get user document by name with TTL cache (fixes N+1 queries)."""
        import time
        if not employee_name:
            return None
        now = time.time()
        cached = cls._user_cache.get(employee_name)
        if cached and (now - cached[1]) < cls._USER_CACHE_TTL:
            return cached[0]
        user = db.Users.find_one({"name": employee_name}, {"_id": 1, "name": 1})
        if user:
            if len(cls._user_cache) >= cls._CACHE_MAX_SIZE:
                oldest_key = min(cls._user_cache, key=lambda k: cls._user_cache[k][1])
                del cls._user_cache[oldest_key]
            cls._user_cache[employee_name] = (user, now)
        return user

    @classmethod
    def get_industry_avg_amount(cls, industry: str) -> float:
        if not industry or industry == "Other":
            return 0.0

        pipeline = [
            {"$match": {"industry": industry, "amount": {"$exists": True, "$ne": None}}},
            {"$group": {"_id": None, "avg": {"$avg": "$amount"}}}
        ]
        result = list(db.Bids.aggregate(pipeline))
        if result and result[0].get("avg"):
            return round(float(result[0]["avg"]), 2)
        return 0.0

    @classmethod
    def _compute_features(cls, data: dict, employee_name: str, industry: str, encoder) -> np.ndarray:
        amount = float(data.get("amount", 0))

        days_to_deadline = data.get("days_to_deadline")
        if days_to_deadline is None:
            days_to_deadline = 30
            try:
                sub_date = datetime.datetime.strptime(data.get("submissionDate", ""), "%Y-%m-%d")
                days_to_deadline = max(1, (sub_date - now_utc().replace(tzinfo=None)).days)
            except Exception:
                pass
        else:
            days_to_deadline = max(1, int(days_to_deadline))

        if days_to_deadline < 7:
            deadline_urgency = 2
        elif days_to_deadline < 30:
            deadline_urgency = 1
        else:
            deadline_urgency = 0

        priority_encoded = int(data.get("priority_encoded", 1))

        industry_encoded = 0
        if encoder:
            try:
                industry_encoded = encoder.transform([industry])[0]
            except Exception:
                current_app.logger.warning(
                    "Unknown industry '%s' not in encoder classes, defaulting to 0", industry
                )
                industry_encoded = 0

        employee_win_rate = cls.get_computed_win_rate(employee_name)
        amount_log = float(np.log1p(amount))
        employee_experience = cls.get_employee_experience(employee_name)
        industry_wr = cls.get_industry_win_rate(industry)
        industry_avg = cls.get_industry_avg_amount(industry)
        amount_vs_industry_avg = amount / industry_avg if industry_avg > 0 else 1.0
        amount_x_win_rate = amount_log * employee_win_rate

        product_series_encoded = 0
        if cls._series_encoder is not None:
            try:
                product_series = data.get("productSeries", "")
                if product_series:
                    product_series_encoded = cls._series_encoder.transform([product_series])[0]
            except Exception:
                pass

        regional_office_encoded = 0
        if cls._region_encoder is not None:
            try:
                region = data.get("regionalOffice", "")
                if region:
                    regional_office_encoded = cls._region_encoder.transform([region])[0]
            except Exception:
                pass

        sales_price = float(data.get("salesPrice", 0.0))

        team_size = int(data.get("teamSize", 1))
        if team_size < 1:
            team_size = 1

        return np.array([[
            amount, amount_log, days_to_deadline, deadline_urgency,
            priority_encoded, employee_win_rate, employee_experience,
            industry_wr, amount_vs_industry_avg, amount_x_win_rate,
            industry_encoded, product_series_encoded, regional_office_encoded,
            sales_price, team_size,
        ]])

    @classmethod
    def _get_shap_explainer(cls, clf):
        if shap is None:
            raise RuntimeError("SHAP is not installed; cannot generate explanations.")
        try:
            if cls._shap_explainer_cache["id"] != id(clf):
                cls._shap_explainer_cache["explainer"] = shap.TreeExplainer(clf)
                cls._shap_explainer_cache["id"] = id(clf)
        except Exception:
            cls._shap_explainer_cache["explainer"] = shap.TreeExplainer(clf)
            cls._shap_explainer_cache["id"] = id(clf)
        return cls._shap_explainer_cache["explainer"]

    # SHAP explanation templates: {feature: {positive: (text_template, value_format), negative: (text_template, value_format)}}
    # Templates use {val} for formatted value and {shap} for absolute SHAP percentage
    _SHAP_TEMPLATES = {
        "amount": {
            "positive": ("Competitive amount ({currency}{val:,.0f}) adds +{shap}% to probability", lambda v: round(v, 2)),
            "negative": ("Amount ({currency}{val:,.0f}) reduces probability by {shap}%", lambda v: round(v, 2)),
        },
        "amount_log": {
            "positive": ("Log-scaled amount ({val:.1f}) adds +{shap}% to probability", lambda v: round(v, 2)),
            "negative": ("Log-scaled amount ({val:.1f}) reduces probability by {shap}%", lambda v: round(v, 2)),
        },
        "days_to_deadline": {
            "positive": ("{val} days to deadline adds +{shap}% to probability", lambda v: int(v)),
            "negative": ("Tight deadline ({val} days) reduces probability by {shap}%", lambda v: round(v, 2)),
        },
        "deadline_urgency": {
            "positive": ("Urgent deadline adds +{shap}% to probability", lambda v: round(v, 2)),
            "negative": ("Deadline urgency reduces probability by {shap}%", lambda v: round(v, 2)),
        },
        "priority_encoded": {
            "positive": ("High priority adds +{shap}% to probability", lambda v: round(v, 2)),
            "negative": ("Low priority reduces probability by {shap}%", lambda v: round(v, 2)),
        },
        "employee_win_rate": {
            "positive": ("Win rate {val:.0f}% adds +{shap}% to probability", lambda v: round(v * 100, 1)),
            "negative": ("Win rate {val:.0f}% reduces probability by {shap}%", lambda v: round(v * 100, 1)),
        },
        "employee_experience": {
            "positive": ("Employee experience ({val} bids) adds +{shap}% to probability", lambda v: round(v, 1)),
            "negative": ("Employee experience reduces probability by {shap}%", lambda v: round(v, 1)),
        },
        "industry_win_rate": {
            "positive": ("Industry win rate {val:.0f}% adds +{shap}% to probability", lambda v: round(v * 100, 1)),
            "negative": ("Industry win rate {val:.0f}% reduces probability by {shap}%", lambda v: round(v * 100, 1)),
        },
        "amount_vs_industry_avg": {
            "positive": ("Amount vs industry avg ({val:.1f}x) adds +{shap}% to probability", lambda v: round(v, 2)),
            "negative": ("Amount vs industry avg ({val:.1f}x) reduces probability by {shap}%", lambda v: round(v, 2)),
        },
        "amount_x_win_rate": {
            "positive": ("Amount × win rate interaction adds +{shap}% to probability", lambda v: round(v, 2)),
            "negative": ("Amount × win rate interaction reduces probability by {shap}%", lambda v: round(v, 2)),
        },
        "industry_encoded": {
            "positive": ("Strong industry fit adds +{shap}% to probability", lambda v: round(v, 2)),
            "negative": ("Industry segment reduces probability by {shap}%", lambda v: round(v, 2)),
        },
        "product_series_encoded": {
            "positive": ("Product series adds +{shap}% to probability", lambda v: round(v, 2)),
            "negative": ("Product series reduces probability by {shap}%", lambda v: round(v, 2)),
        },
        "regional_office_encoded": {
            "positive": ("Regional office adds +{shap}% to probability", lambda v: round(v, 2)),
            "negative": ("Regional office reduces probability by {shap}%", lambda v: round(v, 2)),
        },
        "sales_price": {
            "positive": ("Sales price ({currency}{val:,.0f}) adds +{shap}% to probability", lambda v: round(v, 2)),
            "negative": ("Sales price ({currency}{val:,.0f}) reduces probability by {shap}%", lambda v: round(v, 2)),
        },
        "team_size": {
            "positive": ("Team of {val} people adds +{shap}% to probability", lambda v: int(v)),
            "negative": ("Team of {val} people reduces probability by {shap}%", lambda v: int(v)),
        },
    }

    @classmethod
    def _explain_prediction(cls, features_array, shap_values, feature_names, currency_symbol="$"):
        explanations = []
        pairs = []
        for name, val, s_val in zip(feature_names, features_array[0], shap_values):
            pairs.append((name, float(val), float(s_val)))

        pairs.sort(key=lambda x: abs(x[2]), reverse=True)

        for name, val, s_val in pairs:
            if abs(s_val) <= 0.001:
                continue
            templates = cls._SHAP_TEMPLATES.get(name)
            if not templates:
                continue
            direction = "positive" if s_val > 0 else "negative"
            text_template, value_format = templates[direction]
            formatted_val = value_format(val)
            shap_pct = round(s_val * 100, 1)
            explanations.append({
                "feature": name,
                "value": formatted_val,
                "shap_value": shap_pct,
                "impact": direction,
                "text": text_template.format(val=formatted_val, shap=abs(shap_pct), currency=currency_symbol),
            })

        return explanations

    @classmethod
    def compute_shap_explanations(cls, clf, features_array, currency_symbol="$"):
        try:
            explainer = cls._get_shap_explainer(clf)
            shap_out = explainer.shap_values(features_array)

            if isinstance(shap_out, list):
                shap_vals = shap_out[1][0]
            else:
                if len(shap_out.shape) == 3:
                    shap_vals = shap_out[0, :, 1]
                elif len(shap_out.shape) == 2:
                    shap_vals = shap_out[0]
                else:
                    shap_vals = shap_out

            return cls._explain_prediction(features_array, shap_vals, cls.FEATURE_NAMES, currency_symbol)
        except Exception as e:
            current_app.logger.warning("SHAP explanation calculation failed: %s", e)
            return []

    @classmethod
    def predict(cls, data: dict, employee_name: str, industry: str, currency_symbol="$"):
        clf, encoder = cls.get_model_and_encoder()
        if not clf:
            return None, []

        features = cls._compute_features(data, employee_name, industry, encoder)
        # Trim features to match model's expected input (handles model trained with fewer features)
        n_model_features = getattr(clf, 'n_features_in_', features.shape[1])
        if features.shape[1] > n_model_features:
            features = features[:, :n_model_features]
        prediction_prob = clf.predict_proba(features)[0][1]
        prediction = int(prediction_prob * 100)
        explanations = cls.compute_shap_explanations(clf, features, currency_symbol)
        return prediction, explanations

    @classmethod
    def predict_live(cls, data: dict, employee_name: str, industry: str, currency_symbol="$"):
        clf, encoder = cls.get_model_and_encoder()
        if not clf:
            return None, None, []

        features = cls._compute_features(data, employee_name, industry, encoder)
        # Trim features to match model's expected input (handles model trained with fewer features)
        n_model_features = getattr(clf, 'n_features_in_', features.shape[1])
        if features.shape[1] > n_model_features:
            features = features[:, :n_model_features]
        probability = clf.predict_proba(features)[0][1]
        explanations = cls.compute_shap_explanations(clf, features, currency_symbol)
        employee_win_rate = cls.get_computed_win_rate(employee_name)
        return float(probability) * 100, float(employee_win_rate) * 100, explanations

    @classmethod
    def get_bid_filter(cls, user_id: str, role: str) -> dict:
        if role == 'Admin':
            return {}
        if role == 'Company':
            my_enquiry_ids = [
                e["enquiryId"] for e in db.Enquiries.find(
                    {"createdBy": user_id}, {"enquiryId": 1}
                )
            ]
            return {"enquiryId": {"$in": my_enquiry_ids}}
        if role == 'Bidder':
            return {"createdBy": user_id}
        if not user_id:
            return {"_id": {"$exists": False}}
        return {"$or": [
            {"createdBy": user_id},
            {"createdBy": {"$exists": False}}
        ]}

    @classmethod
    def get_calendar_filter(cls, user_id: str, role: str) -> dict:
        if role == 'Admin':
            return {}
        if role == 'Company':
            enquiry_ids = [
                e["enquiryId"] for e in db.Enquiries.find(
                    {"createdBy": user_id}, {"enquiryId": 1}
                )
            ]
            return {"enquiryId": {"$in": enquiry_ids}}
        user = db.Users.find_one({"_id": ObjectId(user_id)}, {"name": 1}) if ObjectId.is_valid(user_id) else None
        employee_name = user.get('name') if user else None
        if not employee_name:
            return {"_id": {"$exists": False}}
        return {"$or": [
            {"assignedEmployee": {"$regex": f"^{re.escape(employee_name)}$", "$options": "i"}},
            {"assignedEmployee": str(user_id)},
            {"createdBy": user_id},
        ]}

    @classmethod
    def can_update_bid_status(cls, user_id: str, role: str, bid: dict) -> bool:
        if role == 'Admin':
            return True
        enquiry = db.Enquiries.find_one({"enquiryId": bid.get("enquiryId")})
        if not enquiry:
            return False
        if enquiry.get('visibility') == 'public':
            return enquiry.get('createdBy') == user_id
        if role == 'Company':
            return enquiry.get('createdBy') == user_id
        if role == 'Bidder':
            return False
        return bid.get('createdBy') == user_id

    @classmethod
    def create_bid(cls, data: dict, user_id: str) -> dict:
        amount = float(data.get("amount", 0))

        assigned_employee = data.get("assignedEmployee")
        assigned_user = None
        if assigned_employee:
            assigned_user = db.Users.find_one({"name": assigned_employee})

        industry = data.get("industry")
        if not industry or industry == "Other":
            if assigned_user and "industry" in assigned_user:
                industry = assigned_user["industry"]
            else:
                industry = "Other"

        employee_win_rate = cls.get_computed_win_rate(assigned_employee)
        clf, encoder = cls.get_model_and_encoder()
        currency = data.get("currency", "USD")
        if currency not in cls.ALLOWED_CURRENCIES:
            currency = "USD"
        currency_symbol = cls.CURRENCY_SYMBOLS.get(currency, "$")

        if clf:
            prediction, explanations = cls.predict(data, assigned_employee, industry, currency_symbol)
        else:
            base_prob = 80 if amount < 10000 else 40
            win_rate_diff = (employee_win_rate * 100) - 50.0
            base_prob += win_rate_diff * 0.4
            prediction = min(99, max(5, int(base_prob + random.randint(-10, 15))))
            explanations = []

        tags = [t.strip().lower() for t in data.get("tags", []) if isinstance(t, str) and t.strip()]

        enquiry = db.Enquiries.find_one({"enquiryId": data.get("enquiryId")})
        bidder_type = "external" if (enquiry and enquiry.get("visibility") == "public") else "internal"

        new_bid = {
            "bidId": cls.generate_bid_id(),
            "enquiryId": data.get("enquiryId"),
            "status": "Quotation Prepared",
            "amount": amount,
            "currency": data.get("currency", "USD") if data.get("currency") in cls.ALLOWED_CURRENCIES else "USD",
            "industry": industry,
            "submissionDate": data.get("submissionDate"),
            "assignedEmployee": data.get("assignedEmployee"),
            "teamSize": int(data.get("teamSize", 1)),
            "remarks": bleach.clean(data.get("remarks", ""), strip=True)[:2000],
            "aiPrediction": prediction,
            "shapExplanations": explanations,
            "tags": tags,
            "comments": [],
            "createdBy": user_id,
            "bidderType": bidder_type,
            "createdAt": now_utc(),
            "history": [{
                "status": "Quotation Prepared",
                "date": now_utc(),
                "note": "Bid created"
            }]
        }
        db.Bids.insert_one(new_bid)

        db.Enquiries.update_one(
            {"enquiryId": new_bid["enquiryId"], "status": "Under Review"},
            {"$set": {"status": "Quotation Prepared"}}
        )
        db.Enquiries.update_one(
            {"enquiryId": new_bid["enquiryId"]},
            {"$inc": {"bidCount": 1}}
        )

        return new_bid

    @classmethod
    def update_status(cls, bid_oid: ObjectId, new_status: str, note: str = "Status updated") -> tuple:
        if new_status not in cls.VALID_STATUSES:
            return None, f"Invalid status. Must be one of: {', '.join(sorted(cls.VALID_STATUSES))}"

        bid = db.Bids.find_one({"_id": bid_oid})
        if not bid:
            return None, "Bid not found"

        history_entry = {
            "status": new_status,
            "date": now_utc(),
            "note": note
        }

        db.Bids.update_one(
            {"_id": bid_oid},
            {
                "$set": {"status": new_status},
                "$push": {"history": history_entry}
            }
        )

        # Smart enquiry status update — don't let a losing bid overwrite a winning one
        enquiry_id = bid["enquiryId"]
        if new_status == "Order Received":
            # Won bid always sets enquiry to won
            db.Enquiries.update_one(
                {"enquiryId": enquiry_id},
                {"$set": {"status": "Order Received"}}
            )
        elif new_status == "Rejected":
            # Only set enquiry to rejected if no other bid is "Order Received"
            won_bids = db.Bids.count_documents({
                "enquiryId": enquiry_id,
                "_id": {"$ne": bid_oid},
                "status": "Order Received"
            })
            if won_bids == 0:
                db.Enquiries.update_one(
                    {"enquiryId": enquiry_id},
                    {"$set": {"status": "Rejected"}}
                )
        else:
            STATUS_PRIORITY = {
                "Order Received": 5,
                "Negotiation": 4,
                "Under Review": 3,
                "Quotation Prepared": 2,
                "Rejected": 1,
            }
            all_bids = list(db.Bids.find(
                {"enquiryId": enquiry_id},
                {"status": 1}
            ))
            best_priority = 0
            best_status = new_status
            for b in all_bids:
                p = STATUS_PRIORITY.get(b.get("status", ""), 0)
                if p > best_priority:
                    best_priority = p
                    best_status = b.get("status")
            db.Enquiries.update_one(
                {"enquiryId": enquiry_id},
                {"$set": {"status": best_status}}
            )

        return bid, None

    @classmethod
    def get_quotation_items(cls, bid: dict, enquiry: dict) -> list:
        amount = bid.get("amount", 0)
        product_service = enquiry.get("productServiceRequired", "Product / Service Delivery")

        return [
            {
                "name": f"Core Delivery: {product_service}",
                "description": "Primary deployment, customized configuration, and core execution.",
                "qty": 1,
                "price": amount * 0.80,
                "total": amount * 0.80,
            },
            {
                "name": "Integration & Setup Fees",
                "description": "Testing, validation, and connecting with client infrastructure.",
                "qty": 1,
                "price": amount * 0.15,
                "total": amount * 0.15,
            },
            {
                "name": "Service Support SLA (1 Year)",
                "description": "Standard business hour assistance and maintenance updates.",
                "qty": 1,
                "price": amount * 0.05,
                "total": amount * 0.05,
            },
        ]

    @classmethod
    def is_pisa_available(cls) -> bool:
        return pisa is not None

    @classmethod
    def render_quotation_pdf(cls, bid: dict, enquiry: dict) -> bytes | None:
        if not cls.is_pisa_available():
            return None

        items = cls.get_quotation_items(bid, enquiry)
        date_str = now_utc().strftime("%B %d, %Y")
        currency = bid.get("currency", "USD")
        if currency not in cls.ALLOWED_CURRENCIES:
            currency = "USD"
        currency_symbol = cls.CURRENCY_SYMBOLS.get(currency, "$")

        html_content = render_template(
            'quotation_template.html',
            bid=bid, enquiry=enquiry, items=items, date_str=date_str, currency_symbol=currency_symbol
        )

        pdf_buffer = io.BytesIO()
        pisa_status = pisa.CreatePDF(html_content, dest=pdf_buffer)

        if pisa_status.err:
            current_app.logger.error("pisa.CreatePDF returned err for bid %s", bid.get("bidId"))
            return None

        pdf_buffer.seek(0)
        return pdf_buffer.read()
