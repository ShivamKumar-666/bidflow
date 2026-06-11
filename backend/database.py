"""Database client + index initialization."""

import logging
import os
import sys
from urllib.parse import urlparse

from pymongo import MongoClient, ASCENDING
from config import Config
from schemas import ALL_SCHEMAS

logger = logging.getLogger(__name__)


def _redact_uri(uri: str) -> str:
    """Strip the user:password component of a MongoDB URI for safe logging."""
    try:
        u = urlparse(uri)
        if u.username or u.password:
            host = u.hostname or ""
            port = f":{u.port}" if u.port else ""
            db_name = u.path.lstrip("/") or ""
            return f"mongodb://***:***@{host}{port}/{db_name}"
        return uri
    except Exception:
        return "<unparseable mongo uri>"


def _ensure_indexes(db):
    """Create all indexes and schema validation. Called once on first deploy."""
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

    # Unique index on user email
    db.Users.create_index(
        [("email", ASCENDING)],
        unique=True,
        background=True
    )

    # Index on user verification status
    db.Users.create_index(
        [("is_verified", ASCENDING)],
        background=True
    )

    # ── Bid indexes (PERF-NEW-02) ─────────────────────────────────────────
    db.Bids.create_index(
        [("bidId", ASCENDING)],
        unique=True,
        background=True
    )
    db.Bids.create_index(
        [("assignedEmployee", ASCENDING), ("status", ASCENDING)],
        background=True
    )
    db.Bids.create_index(
        [("createdBy", ASCENDING)],
        background=True
    )
    db.Bids.create_index(
        [("enquiryId", ASCENDING)],
        background=True
    )
    db.Bids.create_index(
        [("status", ASCENDING)],
        background=True
    )

    # ── Enquiry indexes (PERF-NEW-02) ─────────────────────────────────────
    db.Enquiries.create_index(
        [("enquiryId", ASCENDING)],
        unique=True,
        background=True
    )
    db.Enquiries.create_index(
        [("createdBy", ASCENDING)],
        background=True
    )
    db.Enquiries.create_index(
        [("shareToken", ASCENDING)],
        unique=True,
        sparse=True,
        background=True
    )

    # ── Document indexes (PERF-NEW-02) ────────────────────────────────────
    db.Documents.create_index(
        [("bidId", ASCENDING)],
        background=True
    )

    # ── Notification indexes (PERF-NEW-02) ────────────────────────────────
    db.Notifications.create_index(
        [("userId", ASCENDING), ("createdAt", -1)],
        background=True
    )
    db.Notifications.create_index(
        [("createdAt", 1)],
        expireAfterSeconds=7776000,
        background=True
    )

    # ── Audit log indexes ─────────────────────────────────────────────────
    db.AuditLogs.create_index(
        [("timestamp", -1)],
        background=True
    )
    db.AuditLogs.create_index(
        [("user", ASCENDING)],
        background=True
    )

    # ── Apply JSON Schema Validation ──────────────────────────────────────
    # Enforces document structure at the database level (defense-in-depth).
    # Uses moderate validation level to tolerate legacy data while enforcing
    # schema on new inserts and updates to existing fields.
    existing = db.list_collection_names()
    for collection_name, schema in ALL_SCHEMAS.items():
        try:
            if collection_name in existing:
                db.command(
                    "collMod",
                    collection_name,
                    validator={"$jsonSchema": schema},
                    validationLevel="moderate",
                    validationAction="error"
                )
                logger.info(f"Schema validation applied to {collection_name}")
            else:
                db.create_collection(
                    collection_name,
                    validator={"$jsonSchema": schema},
                    validationLevel="moderate",
                    validationAction="error"
                )
                logger.info(f"Collection '{collection_name}' created with schema validation")
        except Exception as e:
            logger.warning(f"Could not apply schema to {collection_name}: {e}")


def get_db():
    try:
        # Use a short timeout for the startup check to avoid blocking
        client = MongoClient(Config.MONGO_URI, serverSelectionTimeoutMS=2000)
        client.admin.command('ping')
        db = client.get_default_database()
        if db.name is None:
            db = client['bidflow']

        # ── Index creation (skip on serverless cold starts) ───────────────────
        # On Render/serverless, cold starts are frequent. Index creation is
        # expensive (12+ round-trips). Set SKIP_INDEX_CREATION=true to skip.
        # Run indexes once manually or on first deploy.
        if os.environ.get('SKIP_INDEX_CREATION', '').lower() != 'true':
            _ensure_indexes(db)

        return db

    except Exception as e:
        safe_uri = _redact_uri(Config.MONGO_URI)
        print("\n" + "!" * 80, file=sys.stderr)
        print(" WARNING: COULD NOT CONNECT TO MONGODB ON STARTUP!", file=sys.stderr)
        print(f" MONGO_URI: {safe_uri}", file=sys.stderr)
        print(f" Details: {e}", file=sys.stderr)
        print(" Please ensure your local MongoDB service is running.", file=sys.stderr)
        print(" - On Windows, open services.msc and start the 'MongoDB' service,", file=sys.stderr)
        print("   or run 'Start-Service MongoDB' in an Administrator PowerShell.", file=sys.stderr)
        print("!" * 80 + "\n", file=sys.stderr)
        logger.error("MongoDB connection failed: uri=%s err=%s", safe_uri, e)

        # Return a lazy client so the app still boots but raises on requests.
        client = MongoClient(Config.MONGO_URI)
        db = client.get_default_database()
        if db.name is None:
            db = client['bidflow']
        return db


db = get_db()
