import datetime
import hashlib
import hmac
import io
import os
import random
import secrets

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

    _model = None
    _industry_encoder = None
    _loaded_model_version = None
    _shap_explainer_cache = {"id": None, "explainer": None}

    FEATURE_NAMES = [
        'amount', 'amount_log', 'days_to_deadline', 'deadline_urgency',
        'priority_encoded', 'employee_win_rate', 'employee_experience',
        'industry_win_rate', 'amount_vs_industry_avg', 'amount_x_win_rate',
        'industry_encoded', 'product_series_encoded', 'regional_office_encoded',
        'sales_price',
    ]

    VALID_STATUSES = {"Quotation Prepared", "Under Review", "Negotiation", "Order Received", "Rejected"}

    @classmethod
    def _verify_model_signature(cls, binary_data: bytes, stored_signature: str | None) -> bool:
        if not stored_signature:
            current_app.logger.warning(
                "Model loaded from MongoDB without an integrity signature — "
                "this is a legacy record. Retrain the model to add a signature."
            )
            return True
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
                if os.path.exists(model_path):
                    cls._model = joblib.load(model_path)
                if os.path.exists(encoder_path):
                    cls._industry_encoder = joblib.load(encoder_path)
        except Exception as e:
            current_app.logger.warning("Could not load ML model or encoder: %s", e)
        return cls._model, cls._industry_encoder

    @classmethod
    def generate_bid_id(cls) -> str:
        for _ in range(3):
            token = secrets.token_hex(4)
            bid_id = f"BID-{token}"
            if not db.Bids.find_one({"bidId": bid_id}):
                return bid_id
        return f"BID-{secrets.token_hex(6)}"

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
    def get_industry_avg_amount(cls, industry: str) -> float:
        if not industry or industry == "Other":
            return 0.0

        bids = list(db.Bids.find(
            {"industry": industry},
            {"amount": 1}
        ))

        if not bids:
            return 0.0

        amounts = [float(b.get("amount") or 0) for b in bids if b.get("amount")]
        return round(np.mean(amounts), 2) if amounts else 0.0

    @classmethod
    def _compute_features(cls, data: dict, employee_name: str, industry: str, encoder) -> np.ndarray:
        amount = float(data.get("amount", 0))
        days_to_deadline = 30
        try:
            sub_date = datetime.datetime.strptime(data.get("submissionDate", ""), "%Y-%m-%d")
            days_to_deadline = max(1, (sub_date - now_utc().replace(tzinfo=None)).days)
        except Exception:
            pass

        if days_to_deadline < 7:
            deadline_urgency = 2
        elif days_to_deadline < 30:
            deadline_urgency = 1
        else:
            deadline_urgency = 0

        priority_encoded = 1

        industry_encoded = 0
        if encoder:
            try:
                industry_encoded = encoder.transform([industry])[0]
            except Exception:
                industry_encoded = 0

        employee_win_rate = cls.get_computed_win_rate(employee_name)
        amount_log = float(np.log1p(amount))
        employee_experience = db.Bids.count_documents({"assignedEmployee": employee_name}) if employee_name else 1
        industry_wr = cls.get_industry_win_rate(industry)
        industry_avg = cls.get_industry_avg_amount(industry)
        amount_vs_industry_avg = amount / industry_avg if industry_avg > 0 else 1.0
        amount_x_win_rate = amount_log * employee_win_rate

        product_series_encoded = 0
        regional_office_encoded = 0
        sales_price = 0.0

        return np.array([[
            amount, amount_log, days_to_deadline, deadline_urgency,
            priority_encoded, employee_win_rate, employee_experience,
            industry_wr, amount_vs_industry_avg, amount_x_win_rate,
            industry_encoded, product_series_encoded, regional_office_encoded,
            sales_price,
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

    @classmethod
    def _explain_prediction(cls, features_array, shap_values, feature_names):
        explanations = []
        pairs = []
        for name, val, s_val in zip(feature_names, features_array[0], shap_values):
            pairs.append((name, float(val), float(s_val)))

        pairs.sort(key=lambda x: abs(x[2]), reverse=True)

        for name, val, s_val in pairs:
            if name == 'amount':
                if s_val < -0.001:
                    explanations.append({
                        "feature": "amount", "value": round(val, 2),
                        "shap_value": round(s_val * 100, 1), "impact": "negative",
                        "text": f"Amount (${val:,.0f}) reduces probability by {abs(round(s_val * 100, 1))}%"
                    })
                elif s_val > 0.001:
                    explanations.append({
                        "feature": "amount", "value": round(val, 2),
                        "shap_value": round(s_val * 100, 1), "impact": "positive",
                        "text": f"Competitive amount (${val:,.0f}) adds +{round(s_val * 100, 1)}% to probability"
                    })
            elif name == 'amount_log':
                if s_val < -0.001:
                    explanations.append({
                        "feature": "amount_log", "value": round(val, 2),
                        "shap_value": round(s_val * 100, 1), "impact": "negative",
                        "text": f"Log-scaled amount ({val:.1f}) reduces probability by {abs(round(s_val * 100, 1))}%"
                    })
                elif s_val > 0.001:
                    explanations.append({
                        "feature": "amount_log", "value": round(val, 2),
                        "shap_value": round(s_val * 100, 1), "impact": "positive",
                        "text": f"Log-scaled amount ({val:.1f}) adds +{round(s_val * 100, 1)}% to probability"
                    })
            elif name == 'days_to_deadline':
                if s_val < -0.001:
                    explanations.append({
                        "feature": "days_to_deadline", "value": round(val, 2),
                        "shap_value": round(s_val * 100, 1), "impact": "negative",
                        "text": f"Tight deadline ({int(val)} days) reduces probability by {abs(round(s_val * 100, 1))}%"
                    })
                elif s_val > 0.001:
                    explanations.append({
                        "feature": "days_to_deadline", "value": round(val, 2),
                        "shap_value": round(s_val * 100, 1), "impact": "positive",
                        "text": f"{int(val)} days to deadline adds +{round(s_val * 100, 1)}% to probability"
                    })
            elif name == 'deadline_urgency':
                if s_val > 0.001:
                    explanations.append({
                        "feature": "deadline_urgency", "value": round(val, 2),
                        "shap_value": round(s_val * 100, 1), "impact": "positive",
                        "text": f"Urgent deadline adds +{round(s_val * 100, 1)}% to probability"
                    })
                elif s_val < -0.001:
                    explanations.append({
                        "feature": "deadline_urgency", "value": round(val, 2),
                        "shap_value": round(s_val * 100, 1), "impact": "negative",
                        "text": f"Deadline urgency reduces probability by {abs(round(s_val * 100, 1))}%"
                    })
            elif name == 'priority_encoded':
                if s_val > 0.001:
                    explanations.append({
                        "feature": "priority_encoded", "value": round(val, 2),
                        "shap_value": round(s_val * 100, 1), "impact": "positive",
                        "text": f"High priority adds +{round(s_val * 100, 1)}% to probability"
                    })
                elif s_val < -0.001:
                    explanations.append({
                        "feature": "priority_encoded", "value": round(val, 2),
                        "shap_value": round(s_val * 100, 1), "impact": "negative",
                        "text": f"Low priority reduces probability by {abs(round(s_val * 100, 1))}%"
                    })
            elif name == 'employee_win_rate':
                if s_val < -0.001:
                    explanations.append({
                        "feature": "employee_win_rate", "value": round(val * 100, 1),
                        "shap_value": round(s_val * 100, 1), "impact": "negative",
                        "text": f"Win rate {val * 100:.0f}% reduces probability by {abs(round(s_val * 100, 1))}%"
                    })
                elif s_val > 0.001:
                    explanations.append({
                        "feature": "employee_win_rate", "value": round(val * 100, 1),
                        "shap_value": round(s_val * 100, 1), "impact": "positive",
                        "text": f"Win rate {val * 100:.0f}% adds +{round(s_val * 100, 1)}% to probability"
                    })
            elif name == 'employee_experience':
                if s_val > 0.001:
                    explanations.append({
                        "feature": "employee_experience", "value": round(val, 1),
                        "shap_value": round(s_val * 100, 1), "impact": "positive",
                        "text": f"Employee experience ({int(val)} bids) adds +{round(s_val * 100, 1)}% to probability"
                    })
                elif s_val < -0.001:
                    explanations.append({
                        "feature": "employee_experience", "value": round(val, 1),
                        "shap_value": round(s_val * 100, 1), "impact": "negative",
                        "text": f"Employee experience reduces probability by {abs(round(s_val * 100, 1))}%"
                    })
            elif name == 'industry_win_rate':
                if s_val > 0.001:
                    explanations.append({
                        "feature": "industry_win_rate", "value": round(val * 100, 1),
                        "shap_value": round(s_val * 100, 1), "impact": "positive",
                        "text": f"Industry win rate {val * 100:.0f}% adds +{round(s_val * 100, 1)}% to probability"
                    })
                elif s_val < -0.001:
                    explanations.append({
                        "feature": "industry_win_rate", "value": round(val * 100, 1),
                        "shap_value": round(s_val * 100, 1), "impact": "negative",
                        "text": f"Industry win rate {val * 100:.0f}% reduces probability by {abs(round(s_val * 100, 1))}%"
                    })
            elif name == 'amount_vs_industry_avg':
                if s_val > 0.001:
                    explanations.append({
                        "feature": "amount_vs_industry_avg", "value": round(val, 2),
                        "shap_value": round(s_val * 100, 1), "impact": "positive",
                        "text": f"Amount vs industry avg ({val:.1f}x) adds +{round(s_val * 100, 1)}% to probability"
                    })
                elif s_val < -0.001:
                    explanations.append({
                        "feature": "amount_vs_industry_avg", "value": round(val, 2),
                        "shap_value": round(s_val * 100, 1), "impact": "negative",
                        "text": f"Amount vs industry avg ({val:.1f}x) reduces probability by {abs(round(s_val * 100, 1))}%"
                    })
            elif name == 'amount_x_win_rate':
                if s_val > 0.001:
                    explanations.append({
                        "feature": "amount_x_win_rate", "value": round(val, 2),
                        "shap_value": round(s_val * 100, 1), "impact": "positive",
                        "text": f"Amount × win rate interaction adds +{round(s_val * 100, 1)}% to probability"
                    })
                elif s_val < -0.001:
                    explanations.append({
                        "feature": "amount_x_win_rate", "value": round(val, 2),
                        "shap_value": round(s_val * 100, 1), "impact": "negative",
                        "text": f"Amount × win rate interaction reduces probability by {abs(round(s_val * 100, 1))}%"
                    })
            elif name == 'industry_encoded':
                if s_val < -0.001:
                    explanations.append({
                        "feature": "industry_encoded", "value": round(val, 2),
                        "shap_value": round(s_val * 100, 1), "impact": "negative",
                        "text": f"Industry segment reduces probability by {abs(round(s_val * 100, 1))}%"
                    })
                elif s_val > 0.001:
                    explanations.append({
                        "feature": "industry_encoded", "value": round(val, 2),
                        "shap_value": round(s_val * 100, 1), "impact": "positive",
                        "text": f"Strong industry fit adds +{round(s_val * 100, 1)}% to probability"
                    })
            elif name == 'product_series_encoded':
                if s_val > 0.001:
                    explanations.append({
                        "feature": "product_series_encoded", "value": round(val, 2),
                        "shap_value": round(s_val * 100, 1), "impact": "positive",
                        "text": f"Product series adds +{round(s_val * 100, 1)}% to probability"
                    })
                elif s_val < -0.001:
                    explanations.append({
                        "feature": "product_series_encoded", "value": round(val, 2),
                        "shap_value": round(s_val * 100, 1), "impact": "negative",
                        "text": f"Product series reduces probability by {abs(round(s_val * 100, 1))}%"
                    })
            elif name == 'regional_office_encoded':
                if s_val > 0.001:
                    explanations.append({
                        "feature": "regional_office_encoded", "value": round(val, 2),
                        "shap_value": round(s_val * 100, 1), "impact": "positive",
                        "text": f"Regional office adds +{round(s_val * 100, 1)}% to probability"
                    })
                elif s_val < -0.001:
                    explanations.append({
                        "feature": "regional_office_encoded", "value": round(val, 2),
                        "shap_value": round(s_val * 100, 1), "impact": "negative",
                        "text": f"Regional office reduces probability by {abs(round(s_val * 100, 1))}%"
                    })
            elif name == 'sales_price':
                if s_val > 0.001:
                    explanations.append({
                        "feature": "sales_price", "value": round(val, 2),
                        "shap_value": round(s_val * 100, 1), "impact": "positive",
                        "text": f"Sales price (${val:,.0f}) adds +{round(s_val * 100, 1)}% to probability"
                    })
                elif s_val < -0.001:
                    explanations.append({
                        "feature": "sales_price", "value": round(val, 2),
                        "shap_value": round(s_val * 100, 1), "impact": "negative",
                        "text": f"Sales price (${val:,.0f}) reduces probability by {abs(round(s_val * 100, 1))}%"
                    })

        return explanations

    @classmethod
    def compute_shap_explanations(cls, clf, encoder, features_array):
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

            return cls._explain_prediction(features_array, shap_vals, cls.FEATURE_NAMES)
        except Exception as e:
            current_app.logger.warning("SHAP explanation calculation failed: %s", e)
            return []

    @classmethod
    def predict(cls, data: dict, employee_name: str, industry: str):
        clf, encoder = cls.get_model_and_encoder()
        if not clf:
            return None, []

        features = cls._compute_features(data, employee_name, industry, encoder)
        prediction_prob = clf.predict_proba(features)[0][1]
        prediction = int(prediction_prob * 100)
        explanations = cls.compute_shap_explanations(clf, encoder, features)
        return prediction, explanations

    @classmethod
    def predict_live(cls, data: dict, employee_name: str, industry: str):
        clf, encoder = cls.get_model_and_encoder()
        if not clf:
            return None, None, []

        features = cls._compute_features(data, employee_name, industry, encoder)
        probability = clf.predict_proba(features)[0][1]
        explanations = cls.compute_shap_explanations(clf, encoder, features)
        employee_win_rate = cls.get_computed_win_rate(employee_name)
        return float(probability) * 100, float(employee_win_rate) * 100, explanations

    @classmethod
    def get_bid_filter(cls, user_id: str, role: str) -> dict:
        if role == 'Admin':
            return {}
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
        user = db.Users.find_one({"_id": ObjectId(user_id)}, {"name": 1}) if ObjectId.is_valid(user_id) else None
        employee_name = user.get('name') if user else None
        if not employee_name:
            return {}
        return {"$or": [
            {"assignedEmployee": {"$regex": f"^{employee_name}$", "$options": "i"}},
            {"assignedEmployee": str(user_id)}
        ]}

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

        if clf:
            prediction, explanations = cls.predict(data, assigned_employee, industry)
        else:
            base_prob = 80 if amount < 10000 else 40
            win_rate_diff = (employee_win_rate * 100) - 50.0
            base_prob += win_rate_diff * 0.4
            prediction = min(99, max(5, int(base_prob + random.randint(-10, 15))))
            explanations = []

        tags = [t.strip().lower() for t in data.get("tags", []) if isinstance(t, str) and t.strip()]
        new_bid = {
            "bidId": cls.generate_bid_id(),
            "enquiryId": data.get("enquiryId"),
            "status": "Quotation Prepared",
            "amount": amount,
            "industry": industry,
            "submissionDate": data.get("submissionDate"),
            "assignedEmployee": data.get("assignedEmployee"),
            "remarks": data.get("remarks", ""),
            "aiPrediction": prediction,
            "shapExplanations": explanations,
            "tags": tags,
            "comments": [],
            "createdBy": user_id,
            "history": [{
                "status": "Quotation Prepared",
                "date": now_utc(),
                "note": "Bid created"
            }]
        }
        db.Bids.insert_one(new_bid)

        db.Enquiries.update_one(
            {"enquiryId": new_bid["enquiryId"]},
            {"$set": {"status": "Quotation Prepared"}}
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

        db.Enquiries.update_one(
            {"enquiryId": bid["enquiryId"]},
            {"$set": {"status": new_status}}
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

        html_content = render_template(
            'quotation_template.html',
            bid=bid, enquiry=enquiry, items=items, date_str=date_str
        )

        pdf_buffer = io.BytesIO()
        pisa_status = pisa.CreatePDF(html_content, dest=pdf_buffer)

        if pisa_status.err:
            current_app.logger.error("pisa.CreatePDF returned err for bid %s", bid.get("bidId"))
            return None

        pdf_buffer.seek(0)
        return pdf_buffer.read()
