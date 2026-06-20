"""
backend/ml/retrain.py
─────────────────────
Live model retraining from real MongoDB bid outcomes.
Uses best params from GridSearchCV and 15 features.
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
MIN_ACCURACY = 0.50

ML_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(ML_DIR, "bid_model.pkl")
ENCODER_PATH = os.path.join(ML_DIR, "industry_encoder.pkl")


def retrain_from_db(db) -> dict:
    import xgboost as xgb
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import balanced_accuracy_score
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
            'sales_price', 'team_size',
        ]

    # Fetch terminal bids
    terminal_bids = list(db.Bids.find(
        {"status": {"$in": ["Order Received", "Rejected"]}},
        {"amount": 1, "submissionDate": 1, "assignedEmployee": 1,
         "industry": 1, "status": 1, "history": 1, "enquiryId": 1,
         "comments": 1, "teamSize": 1, "priority": 1}
    ))

    if len(terminal_bids) < MIN_TRAINING_RECORDS:
        return {
            "status": "insufficient_data",
            "records": len(terminal_bids),
            "min_required": MIN_TRAINING_RECORDS,
        }

    # ── STRATIFIED TRAIN/TEST SPLIT FIRST (prevents data leakage) ──────────
    labels_all = [1 if b["status"] == "Order Received" else 0 for b in terminal_bids]
    test_size = 0.2 if len(terminal_bids) >= 100 else 0.1
    indices = list(range(len(terminal_bids)))
    train_idx, test_idx = train_test_split(
        indices, test_size=test_size, random_state=42,
        stratify=labels_all if sum(labels_all) > 1 else None
    )
    train_bids = [terminal_bids[i] for i in train_idx]
    test_bids = [terminal_bids[i] for i in test_idx]

    # ── AGGREGATE STATS FROM TRAINING DATA ONLY ────────────────────────────
    # Agent win-rate map
    agent_wins = {}
    agent_total = {}
    for bid in train_bids:
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

    # Industry win-rate map
    industry_wins = {}
    industry_total = {}
    for bid in train_bids:
        ind = bid.get("industry", "Other") or "Other"
        industry_total[ind] = industry_total.get(ind, 0) + 1
        if bid["status"] == "Order Received":
            industry_wins[ind] = industry_wins.get(ind, 0) + 1

    def industry_win_rate(ind):
        total = industry_total.get(ind, 0)
        if total < 3:
            return 0.5
        return industry_wins.get(ind, 0) / total

    # Industry avg amount
    industry_amounts = {}
    for bid in train_bids:
        ind = bid.get("industry", "Other") or "Other"
        amount = float(bid.get("amount") or 0)
        if ind not in industry_amounts:
            industry_amounts[ind] = []
        industry_amounts[ind].append(amount)

    industry_avg = {ind: np.mean(amts) for ind, amts in industry_amounts.items()}
    global_avg_amount = np.mean([float(b.get("amount") or 0) for b in train_bids]) if train_bids else 0.0

    # Won amounts for target leak fix
    won_amounts = [float(b.get("amount") or 0) for b in train_bids if b["status"] == "Order Received"]
    np.random.seed(42)

    # Employee experience map
    emp_counts = {}
    for bid in train_bids:
        name = bid.get("assignedEmployee", "")
        if name:
            emp_counts[name] = emp_counts.get(name, 0) + 1

    # ── LABEL ENCODER FITTED ON TRAINING INDUSTRIES ONLY ───────────────────
    train_industries = [bid.get("industry", "Other") or "Other" for bid in train_bids]
    le = LabelEncoder()
    le.fit(train_industries)

    # ── FEATURE ENGINEERING FUNCTION ───────────────────────────────────────
    def build_features(bids):
        rows = []
        labels = []
        for bid in bids:
            amount = float(bid.get("amount") or 0)

            if bid["status"] == "Rejected" and amount == 0:
                if won_amounts:
                    amount = np.random.choice(won_amounts)

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

            if days_to_deadline < 7:
                deadline_urgency = 2
            elif days_to_deadline < 30:
                deadline_urgency = 1
            else:
                deadline_urgency = 0

            priority_map = {"Low": 0, "Medium": 1, "High": 2, "Critical": 3}
            priority_encoded = priority_map.get(bid.get("priority", "Medium"), 1)
            industry = bid.get("industry", "Other") or "Other"
            employee_win_rate = real_win_rate(bid.get("assignedEmployee", ""))
            employee_experience = emp_counts.get(bid.get("assignedEmployee", ""), 1)
            ind_wr = industry_win_rate(industry)
            ind_avg = industry_avg.get(industry, global_avg_amount)
            amount_vs_industry_avg = amount / ind_avg if ind_avg > 0 else 1.0
            amount_log = float(np.log1p(amount))
            amount_x_win_rate = amount_log * employee_win_rate

            product_series_encoded = 0
            regional_office_encoded = 0
            sales_price = 0.0

            team_size = bid.get("teamSize")
            if not team_size or team_size < 1:
                commenters = set()
                for comment in bid.get("comments", []):
                    author = comment.get("author", "")
                    if author:
                        commenters.add(author)
                assigned = bid.get("assignedEmployee", "")
                if assigned:
                    commenters.add(assigned)
                team_size = max(1, len(commenters))
            else:
                team_size = int(team_size)

            # Encode industry (unseen → len(le.classes_) as fallback)
            if industry in le.classes_:
                industry_encoded = int(le.transform([industry])[0])
            else:
                industry_encoded = len(le.classes_)

            rows.append([
                amount, amount_log, days_to_deadline, deadline_urgency,
                priority_encoded, employee_win_rate, employee_experience,
                ind_wr, amount_vs_industry_avg, amount_x_win_rate,
                industry_encoded,
                product_series_encoded, regional_office_encoded, sales_price,
                team_size,
            ])
            labels.append(1 if bid["status"] == "Order Received" else 0)
        return np.array(rows, dtype=float), np.array(labels)

    X_train, y_train = build_features(train_bids)
    X_test, y_test = build_features(test_bids)

    # Calculate scale_pos_weight
    counter = Counter(y_train)
    scale_pos_weight = counter[0] / counter[1] if counter[1] > 0 else 1.0

    # Train with best params
    clf = xgb.XGBClassifier(
        **best_params,
        scale_pos_weight=scale_pos_weight,
        eval_metric='logloss',
        random_state=42,
        n_jobs=-1,
    )
    clf.fit(X_train, y_train)
    y_pred = clf.predict(X_test)
    accuracy = round(float(balanced_accuracy_score(y_test, y_pred)), 4)

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
