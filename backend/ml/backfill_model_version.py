"""
backend/ml/backfill_model_version.py
─────────────────────────────────────
One-time migration: registers the disk-trained model in MongoDB ModelVersions.

Run this if your dashboard shows "No model trained yet" even though
bid_model.pkl exists on disk.

Usage:
    cd backend/ml && python backfill_model_version.py
"""

import os
import sys
import datetime

# Add parent directory to path for config import
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from pymongo import MongoClient
from config import Config

ML_DIR = os.path.dirname(__file__)
MODEL_PATH = os.path.join(ML_DIR, "bid_model.pkl")


def main():
    if not os.path.exists(MODEL_PATH):
        print(f"Error: Model not found at {MODEL_PATH}")
        print("Run prepare_and_train.py first.")
        sys.exit(1)

    client = MongoClient(Config.MONGO_URI, serverSelectionTimeoutMS=3000)
    client.admin.command('ping')
    db = client.get_default_database()
    if db is None:
        db = client['bidflow']

    # Check if active model already exists
    if db.ModelVersions.find_one({"isActive": True}):
        print("Active model version already exists in MongoDB. Skipping.")
        client.close()
        return

    # Read model file modification time
    mtime = os.path.getmtime(MODEL_PATH)
    trained_at = datetime.datetime.fromtimestamp(mtime, tz=datetime.timezone.utc)

    # Deactivate any existing versions (shouldn't be any, but be safe)
    db.ModelVersions.update_many({}, {"$set": {"isActive": False}})

    # Insert model version document (only include fields we have values for)
    doc = {
        "version": 1,
        "isActive": True,
        "trainedAt": trained_at,
    }
    db.ModelVersions.insert_one(doc)

    print(f"Backfilled ModelVersions from disk model")
    print(f"  Model path: {MODEL_PATH}")
    print(f"  Trained at: {trained_at.isoformat()}")
    print(f"  Version: 1 (active)")
    print("\nDashboard should now show model status. Refresh the page.")

    client.close()


if __name__ == "__main__":
    main()
