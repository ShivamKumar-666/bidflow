"""
backend/ml/retrain.py
─────────────────────
Live model retraining from real MongoDB bid outcomes.

Called by POST /api/admin/retrain (admin_bp) or directly on the CLI.

Strategy
────────
1. Query db.Bids for terminal bids:
     - 'Order Received' → won = 1
     - 'Rejected'       → won = 0
2. Require MIN_TRAINING_RECORDS to avoid underfitting.
3. Feature-engineer the same six features used at prediction time:
     amount, days_to_deadline, priority_encoded, employee_win_rate,
     is_repeat_customer, industry_encoded
4. Train LogisticRegression and evaluate accuracy.
5. Atomically hot-swap .pkl files (write temp → os.replace) so a
   running server never loads a partially-written model.
6. Return a summary dict for the API response / audit log.
"""

import os
import datetime
import numpy as np
import joblib

MIN_TRAINING_RECORDS = 50   # refuse to train on tiny datasets

ML_DIR       = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH   = os.path.join(ML_DIR, "bid_model.pkl")
ENCODER_PATH = os.path.join(ML_DIR, "industry_encoder.pkl")


def retrain_from_db(db) -> dict:
    """
    Retrain the bid success model from live MongoDB data.

    Parameters
    ----------
    db : pymongo database handle

    Returns
    -------
    dict with keys: status, records, accuracy, timestamp
                    (or status='insufficient_data', min_required)
    """
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import train_test_split
    from sklearn.preprocessing import LabelEncoder

    # ── 1. Fetch terminal bids ────────────────────────────────────────────────
    terminal_bids = list(db.Bids.find(
        {"status": {"$in": ["Order Received", "Rejected"]}},
        {"amount": 1, "submissionDate": 1, "assignedEmployee": 1,
         "industry": 1, "status": 1, "history": 1}
    ))

    if len(terminal_bids) < MIN_TRAINING_RECORDS:
        return {
            "status":       "insufficient_data",
            "records":      len(terminal_bids),
            "min_required": MIN_TRAINING_RECORDS,
            "timestamp":    datetime.datetime.utcnow().isoformat()
        }

    # ── 2. Build agent win-rate map from the same dataset ─────────────────────
    from collections import defaultdict
    agent_wins  = defaultdict(int)
    agent_total = defaultdict(int)

    for bid in terminal_bids:
        name = bid.get("assignedEmployee", "")
        if name:
            agent_total[name] += 1
            if bid["status"] == "Order Received":
                agent_wins[name] += 1

    def real_win_rate(name):
        total = agent_total.get(name, 0)
        if total < 3:
            return 0.5
        return agent_wins[name] / total

    # ── 3. Feature engineering ────────────────────────────────────────────────
    rows = []
    labels = []

    for bid in terminal_bids:
        amount = float(bid.get("amount") or 0)

        # Days to deadline — derived from history[0].date vs submissionDate
        days_to_deadline = 30
        try:
            created = bid.get("history", [{}])[0].get("date")
            sub_str = bid.get("submissionDate", "")
            if created and sub_str:
                sub_dt           = datetime.datetime.strptime(sub_str, "%Y-%m-%d")
                days_to_deadline = max(1, (sub_dt - created).days)
        except Exception:
            pass

        priority_encoded   = 1   # Medium default (not stored on older bids)
        industry           = bid.get("industry", "Other") or "Other"
        employee_win_rate  = real_win_rate(bid.get("assignedEmployee", ""))
        is_repeat_customer = 1   # default

        rows.append([amount, days_to_deadline, priority_encoded,
                     employee_win_rate, is_repeat_customer, industry])
        labels.append(1 if bid["status"] == "Order Received" else 0)

    # ── 4. Encode industry ─────────────────────────────────────────────────────
    industries = [r[5] for r in rows]
    le         = LabelEncoder()
    le.fit(industries)
    X = np.array([[r[0], r[1], r[2], r[3], r[4], le.transform([r[5]])[0]]
                  for r in rows], dtype=float)
    y = np.array(labels)

    # ── 5. Train ───────────────────────────────────────────────────────────────
    test_size = 0.2 if len(y) >= 100 else 0.1   # smaller test split for small datasets
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=42, stratify=y if y.sum() > 1 else None
    )

    clf = LogisticRegression(max_iter=2000, class_weight="balanced")
    clf.fit(X_train, y_train)
    accuracy = round(float(clf.score(X_test, y_test)), 4)

    # ── 6. Atomic hot-swap ─────────────────────────────────────────────────────
    tmp_model   = MODEL_PATH   + ".tmp"
    tmp_encoder = ENCODER_PATH + ".tmp"

    joblib.dump(clf, tmp_model)
    joblib.dump(le,  tmp_encoder)

    os.replace(tmp_model,   MODEL_PATH)
    os.replace(tmp_encoder, ENCODER_PATH)

    # ── 7. Return summary ──────────────────────────────────────────────────────
    return {
        "status":    "success",
        "records":   len(terminal_bids),
        "accuracy":  accuracy,
        "timestamp": datetime.datetime.utcnow().isoformat()
    }
