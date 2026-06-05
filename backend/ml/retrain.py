"""
backend/ml/retrain.py
─────────────────────
Live model retraining from real MongoDB bid outcomes.
Uses best params from GridSearchCV and 14 features.
"""

import os
import json
import datetime
import logging
import hmac
import hashlib
import numpy as np
import joblib
from config import Config

logger = logging.getLogger(__name__)


def _sign_binary(data: bytes) -> str:
    return hmac.new(
        Config.SECRET_KEY.encode(),
        data,
        hashlib.sha256
    ).hexdigest()


MIN_TRAINING_RECORDS = 50
MIN_ACCURACY = 0.55

ML_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(ML_DIR, "bid_model.pkl")
ENCODER_PATH = os.path.join(ML_DIR, "industry_encoder.pkl")


def retrain_from_db(db) -> dict:
    import xgboost as xgb
    from sklearn.model_selection import train_test_split
    from sklearn.preprocessing import LabelEncoder
    from collections import Counter

    # Load best params
    best_params_path = os.path.join(ML_DIR, 'best_params.json')
    if os.path.exists(best_params_path):
        with open(best_params_path, 'r') as f:
            best_params = json.load(f)
    else:
        best_params = {
            'n_estimators': 200,
            'max_depth': 6,
            'learning_rate': 0.05,
            'min_child_weight': 3,
            'subsample': 0.8,
            'colsample_bytree': 0.8,
        }

    # Load feature list
    feature_list_path = os.path.join(ML_DIR, 'feature_list.json')
    if os.path.exists(feature_list_path):
        with open(feature_list_path, 'r') as f:
            FEATURES = json.load(f)
    else:
        FEATURES = [
            'amount', 'amount_log', 'days_to_deadline', 'deadline_urgency',
            'priority_encoded', 'employee_win_rate', 'employee_experience',
            'industry_win_rate', 'amount_vs_industry_avg', 'amount_x_win_rate',
            'industry_encoded', 'product_series_encoded', 'regional_office_encoded',
            'sales_price',
        ]

    # Fetch terminal bids
    terminal_bids = list(db.Bids.find(
        {"status": {"$in": ["Order Received", "Rejected"]}},
        {"amount": 1, "submissionDate": 1, "assignedEmployee": 1,
         "industry": 1, "status": 1, "history": 1, "enquiryId": 1}
    ))

    if len(terminal_bids) < MIN_TRAINING_RECORDS:
        return {
            "status": "insufficient_data",
            "records": len(terminal_bids),
            "min_required": MIN_TRAINING_RECORDS,
        }

    # Build agent win-rate map
    agent_wins = {}
    agent_total = {}
    for bid in terminal_bids:
        name = bid.get("assignedEmployee", "")
        if name:
            agent_total[name] = agent_total.get(name, 0) + 1
            if bid["status"] == "Order Received":
                agent_wins[name] = agent_wins.get(name, 0) + 1

    def real_win_rate(name):
        total = agent_total.get(name, 0)
        if total < 3:
            return 0.5
        return agent_wins.get(name, 0) / total

    # Build industry win-rate map
    industry_wins = {}
    industry_total = {}
    for bid in terminal_bids:
        ind = bid.get("industry", "Other") or "Other"
        industry_total[ind] = industry_total.get(ind, 0) + 1
        if bid["status"] == "Order Received":
            industry_wins[ind] = industry_wins.get(ind, 0) + 1

    def industry_win_rate(ind):
        total = industry_total.get(ind, 0)
        if total < 3:
            return 0.5
        return industry_wins.get(ind, 0) / total

    # Build industry avg amount
    industry_amounts = {}
    for bid in terminal_bids:
        ind = bid.get("industry", "Other") or "Other"
        amount = float(bid.get("amount") or 0)
        if ind not in industry_amounts:
            industry_amounts[ind] = []
        industry_amounts[ind].append(amount)

    industry_avg = {ind: np.mean(amts) for ind, amts in industry_amounts.items()}
    global_avg_amount = np.mean([float(b.get("amount") or 0) for b in terminal_bids])

    # Fix target leak: sample amounts for Lost deals
    won_amounts = [float(b.get("amount") or 0) for b in terminal_bids if b["status"] == "Order Received"]
    np.random.seed(42)

    # Build employee experience map
    emp_counts = {}
    for bid in terminal_bids:
        name = bid.get("assignedEmployee", "")
        if name:
            emp_counts[name] = emp_counts.get(name, 0) + 1

    # Feature engineering
    rows = []
    labels = []

    for bid in terminal_bids:
        amount = float(bid.get("amount") or 0)

        # Fix target leak for Lost deals
        if bid["status"] == "Rejected" and amount == 0:
            if won_amounts:
                amount = np.random.choice(won_amounts)

        # Days to deadline
        days_to_deadline = 30
        try:
            created = bid.get("history", [{}])[0].get("date")
            sub_str = bid.get("submissionDate", "")
            if created and sub_str:
                sub_dt = datetime.datetime.strptime(sub_str, "%Y-%m-%d")
                if isinstance(created, datetime.datetime) and created.tzinfo is not None:
                    created = created.astimezone(datetime.timezone.utc).replace(tzinfo=None)
                days_to_deadline = max(1, (sub_dt - created).days)
        except Exception:
            pass

        # Deadline urgency
        if days_to_deadline < 7:
            deadline_urgency = 2
        elif days_to_deadline < 30:
            deadline_urgency = 1
        else:
            deadline_urgency = 0

        priority_encoded = 1
        industry = bid.get("industry", "Other") or "Other"
        employee_win_rate = real_win_rate(bid.get("assignedEmployee", ""))
        employee_experience = emp_counts.get(bid.get("assignedEmployee", ""), 1)
        ind_wr = industry_win_rate(industry)
        ind_avg = industry_avg.get(industry, global_avg_amount)
        amount_vs_industry_avg = amount / ind_avg if ind_avg > 0 else 1.0
        amount_log = float(np.log1p(amount))
        amount_x_win_rate = amount_log * employee_win_rate

        # For product_series and regional_office, use defaults since we don't have this data in bids
        product_series_encoded = 0
        regional_office_encoded = 0
        sales_price = 0.0

        rows.append([
            amount, amount_log, days_to_deadline, deadline_urgency,
            priority_encoded, employee_win_rate, employee_experience,
            ind_wr, amount_vs_industry_avg, amount_x_win_rate,
            0,  # industry_encoded placeholder
            product_series_encoded, regional_office_encoded, sales_price,
            industry,  # for encoding
        ])
        labels.append(1 if bid["status"] == "Order Received" else 0)

    # Encode industry
    industries = [r[14] for r in rows]
    le = LabelEncoder()
    le.fit(industries)

    # Build feature matrix
    X = np.array([r[:14] for r in rows], dtype=float)
    # Update industry_encoded column
    for i, r in enumerate(rows):
        X[i, 10] = le.transform([r[14]])[0]

    y = np.array(labels)

    # Train/test split
    test_size = 0.2 if len(y) >= 100 else 0.1
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=42, stratify=y if y.sum() > 1 else None
    )

    # Calculate scale_pos_weight
    counter = Counter(y_train)
    scale_pos_weight = counter[0] / counter[1]

    # Train with best params
    clf = xgb.XGBClassifier(
        **best_params,
        scale_pos_weight=scale_pos_weight,
        eval_metric='logloss',
        random_state=42,
        n_jobs=-1,
    )
    clf.fit(X_train, y_train)
    accuracy = round(float(clf.score(X_test, y_test)), 4)

    if accuracy < MIN_ACCURACY:
        logger.warning("Model accuracy %.4f below threshold %.2f, not saving", accuracy, MIN_ACCURACY)
        return {
            "status": "low_accuracy",
            "accuracy": accuracy,
            "min_required": MIN_ACCURACY,
            "records": len(terminal_bids),
        }

    # Atomic hot-swap
    tmp_model = MODEL_PATH + ".tmp"
    tmp_encoder = ENCODER_PATH + ".tmp"

    joblib.dump(clf, tmp_model)
    joblib.dump(le, tmp_encoder)

    os.replace(tmp_model, MODEL_PATH)
    os.replace(tmp_encoder, ENCODER_PATH)

    # Save version in MongoDB
    try:
        import io

        model_buf = io.BytesIO()
        joblib.dump(clf, model_buf)
        model_bin = model_buf.getvalue()

        encoder_buf = io.BytesIO()
        joblib.dump(le, encoder_buf)
        encoder_bin = encoder_buf.getvalue()

        latest = db.ModelVersions.find_one(sort=[("version", -1)])
        next_ver = (latest["version"] + 1) if latest else 1

        db.ModelVersions.update_many({}, {"$set": {"isActive": False}})
        db.ModelVersions.insert_one({
            "version": next_ver,
            "isActive": True,
            "accuracy": accuracy,
            "records": len(terminal_bids),
            "trainedAt": datetime.datetime.now(datetime.timezone.utc),
            "modelBinary": model_bin,
            "modelSignature": _sign_binary(model_bin),
            "encoderBinary": encoder_bin,
            "encoderSignature": _sign_binary(encoder_bin),
        })
    except Exception as e:
        logger.exception("Error saving model version to MongoDB: %s", e)

    return {
        "status": "success",
        "records": len(terminal_bids),
        "accuracy": accuracy,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
