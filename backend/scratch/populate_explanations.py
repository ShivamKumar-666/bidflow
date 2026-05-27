import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import datetime
import numpy as np
from database import db
from routes.bids import get_model_and_encoder, get_computed_win_rate, compute_shap_explanations

def migrate_bids():
    clf, encoder = get_model_and_encoder()
    if not clf:
        print("[ERROR] ML model not loaded. Make sure train.py has run successfully.")
        return

    bids = list(db.Bids.find({}))
    print(f"[INFO] Found {len(bids)} bids in MongoDB. Calculating predictions and explanations...")

    updated_count = 0
    for bid in bids:
        amount = float(bid.get("amount", 0))
        assigned_employee = bid.get("assignedEmployee")
        employee_win_rate = get_computed_win_rate(assigned_employee)
        industry = bid.get("industry", "Other") or "Other"

        # Days to deadline: use submissionDate relative to history[0].date or now
        days_to_deadline = 30
        try:
            created = bid.get("history", [{}])[0].get("date")
            sub_str = bid.get("submissionDate", "")
            if created and sub_str:
                sub_dt = datetime.datetime.strptime(sub_str, "%Y-%m-%d") if isinstance(sub_str, str) else sub_str
                days_to_deadline = max(1, (sub_dt - created).days)
            elif sub_str:
                sub_dt = datetime.datetime.strptime(sub_str, "%Y-%m-%d") if isinstance(sub_str, str) else sub_str
                days_to_deadline = max(1, (sub_dt - datetime.datetime.now()).days)
        except Exception as ex:
            print(f"  [WARN] Failed to parse days_to_deadline for {bid.get('bidId')}: {ex}")

        priority_encoded = 1   # Medium default
        is_repeat_customer = 1  # default

        industry_encoded = 0
        if encoder:
            try:
                industry_encoded = encoder.transform([industry])[0]
            except Exception:
                industry_encoded = 0

        features = np.array([[amount, days_to_deadline, priority_encoded,
                               employee_win_rate, is_repeat_customer, industry_encoded]])
        
        prediction_prob = clf.predict_proba(features)[0][1]
        prediction = int(prediction_prob * 100)
        explanations = compute_shap_explanations(clf, encoder, features)

        db.Bids.update_one(
            {"_id": bid["_id"]},
            {"$set": {
                "aiPrediction": prediction,
                "shapExplanations": explanations
            }}
        )
        updated_count += 1
        print(f"  [UPDATED] {bid.get('bidId')} -> Prediction: {prediction}%, Explanations: {len(explanations)}")

    print(f"[SUCCESS] Migration complete. Updated {updated_count} bids in MongoDB.")

if __name__ == "__main__":
    migrate_bids()
