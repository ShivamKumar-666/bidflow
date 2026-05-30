# run once: python migrate_verify.py
import os
import sys

# Ensure backend directory is in the path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import db

def run_migration():
    result = db.Users.update_many(
        {"is_verified": {"$exists": False}},
        {"$set": {"is_verified": True}}
    )
    print(f"Successfully migrated {result.modified_count} existing users (set is_verified to True).")

if __name__ == "__main__":
    run_migration()
