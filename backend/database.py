# pyrefly: ignore [missing-import]
from pymongo import MongoClient, ASCENDING
from config import Config
import sys


def get_db():
    try:
        # Use a short timeout for the startup check to avoid blocking
        client = MongoClient(Config.MONGO_URI, serverSelectionTimeoutMS=2000)
        client.admin.command('ping')
        db = client.get_default_database()
        if db.name is None:
            db = client['bidflow']

        # ── Ensure indexes ────────────────────────────────────────────────────
        # TTL index: MongoDB automatically deletes revoked tokens after they
        # expire (exp field stores the UNIX timestamp of the token's expiry).
        db.RevokedTokens.create_index(
            [("exp", ASCENDING)],
            expireAfterSeconds=0,
            background=True
        )
        # Unique index on jti for fast O(1) blocklist lookups
        db.RevokedTokens.create_index(
            [("jti", ASCENDING)],
            unique=True,
            background=True
        )

        return db

    except Exception as e:
        print("\n" + "!" * 80, file=sys.stderr)
        print(" WARNING: COULD NOT CONNECT TO MONGODB ON STARTUP!", file=sys.stderr)
        print(f" MONGO_URI: {Config.MONGO_URI}", file=sys.stderr)
        print(" Details:", e, file=sys.stderr)
        print(" Please ensure your local MongoDB service is running.", file=sys.stderr)
        print(" - On Windows, open services.msc and start the 'MongoDB' service,", file=sys.stderr)
        print("   or run 'Start-Service MongoDB' in an Administrator PowerShell.", file=sys.stderr)
        print("!" * 80 + "\n", file=sys.stderr)

        # Return a lazy client so the app still boots but raises on requests.
        client = MongoClient(Config.MONGO_URI)
        db = client.get_default_database()
        if db.name is None:
            db = client['bidflow']
        return db


db = get_db()
