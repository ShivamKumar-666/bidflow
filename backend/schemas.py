"""
MongoDB JSON Schema Validation for all collections.

Applied automatically on app startup via database.py using collMod command.
Uses moderate validation level to tolerate legacy data while enforcing
schema on new inserts and updates to existing fields.
"""

USERS_SCHEMA = {
    "bsonType": "object",
    "required": ["name", "email", "password", "role", "is_verified"],
    "properties": {
        "name": {
            "bsonType": "string",
            "description": "User's full name (required)"
        },
        "email": {
            "bsonType": "string",
            "description": "User's email address (required, unique)"
        },
        "password": {
            "bsonType": "string",
            "description": "Bcrypt-hashed password (required)"
        },
        "role": {
            "bsonType": "string",
            "enum": ["Admin", "Sales Executive", "Company", "Bidder"],
            "description": "User role (Admin, Sales Executive, Company, or Bidder)"
        },
        "is_verified": {
            "bsonType": "bool",
            "description": "Email verification status (required)"
        },
        "created_at": {
            "bsonType": "date",
            "description": "Account creation timestamp"
        },
        "google_oauth": {
            "bsonType": "bool",
            "description": "True if user registered via Google OAuth"
        },
        "verified_at": {
            "bsonType": "date",
            "description": "Email verification timestamp"
        },
        "industry": {
            "bsonType": "string",
            "description": "User's industry (from profile)"
        },
        "winRate": {
            "bsonType": "int",
            "minimum": 0,
            "maximum": 100,
            "description": "User's personal win rate goal (0-100)"
        },
        "targetBidValue": {
            "bsonType": "double",
            "minimum": 0,
            "description": "User's target bid value (non-negative)"
        },
        "bio": {
            "bsonType": "string",
            "description": "User's bio"
        },
        "totp_secret_pending": {
            "bsonType": "string",
            "description": "Temporary TOTP secret (before 2FA enabled)"
        },
        "totp_secret": {
            "bsonType": "string",
            "description": "Permanent TOTP secret (after 2FA enabled)"
        },
        "totp_enabled": {
            "bsonType": "bool",
            "description": "Whether 2FA is enabled"
        },
        "backup_codes": {
            "bsonType": "array",
            "items": {
                "bsonType": "string"
            },
            "description": "Array of bcrypt-hashed backup codes"
        }
    }
}

ENQUIRIES_SCHEMA = {
    "bsonType": "object",
    "required": ["enquiryId", "customerName", "contactInformation", 
                 "productServiceRequired", "date", "priority", "status", "createdBy"],
    "properties": {
        "enquiryId": {
            "bsonType": "string",
            "pattern": "^ENQ-[0-9a-f]{8}$",
            "description": "Non-sequential enquiry ID (ENQ-<8 hex chars>)"
        },
        "customerName": {
            "bsonType": "string",
            "maxLength": 200,
            "description": "Customer name (max 200 chars)"
        },
        "contactInformation": {
            "bsonType": "string",
            "maxLength": 500,
            "description": "Contact info (max 500 chars)"
        },
        "productServiceRequired": {
            "bsonType": "string",
            "maxLength": 500,
            "description": "Product/service description (max 500 chars)"
        },
        "date": {
            "bsonType": "date",
            "description": "Enquiry creation date"
        },
        "priority": {
            "bsonType": "string",
            "enum": ["Low", "Medium", "High", "Critical"],
            "description": "Priority level"
        },
        "notes": {
            "bsonType": "string",
            "maxLength": 5000,
            "description": "Additional notes (max 5000 chars)"
        },
        "tags": {
            "bsonType": "array",
            "items": {
                "bsonType": "string"
            },
            "description": "Array of lowercase tags"
        },
        "status": {
            "bsonType": "string",
            "enum": ["Under Review", "Shortlisted", "Negotiation", "Rejected", "Order Received", "Quotation Prepared"],
            "description": "Enquiry status"
        },
        "negotiable": {
            "bsonType": "bool",
            "description": "Whether this enquiry allows bid negotiation"
        },
        "createdBy": {
            "bsonType": "string",
            "description": "User ID of creator"
        },
        "shareToken": {
            "bsonType": "string",
            "description": "UUID for public sharing"
        },
        "shareTokenCreatedAt": {
            "bsonType": "date",
            "description": "Share token creation timestamp"
        },
        "visibility": {
            "bsonType": "string",
            "enum": ["internal", "public"],
            "description": "internal = only creator sees, public = listed on marketplace"
        },
        "listingDeadline": {
            "bsonType": "date",
            "description": "Deadline for marketplace bids (optional)"
        },
        "bidCount": {
            "bsonType": "int",
            "minimum": 0,
            "description": "Number of bids received (denormalized)"
        },
        "industry": {
            "bsonType": ["string", "null"],
            "description": "Primary industry sector for marketplace filtering"
        }
    }
}

BIDS_SCHEMA = {
    "bsonType": "object",
    "required": ["bidId", "enquiryId", "status", "amount", "createdBy"],
    "properties": {
        "bidId": {
            "bsonType": "string",
            "pattern": "^BID-[0-9a-f]{8}$",
            "description": "Non-sequential bid ID (BID-<8 hex chars>)"
        },
        "enquiryId": {
            "bsonType": "string",
            "description": "Reference to enquiry"
        },
        "status": {
            "bsonType": "string",
            "enum": [
                "Quotation Prepared",
                "Under Review",
                "Negotiation",
                "Order Received",
                "Rejected"
            ],
            "description": "Bid status"
        },
        "amount": {
            "bsonType": ["int", "double"],
            "minimum": 0,
            "description": "Bid amount (non-negative)"
        },
        "industry": {
            "bsonType": ["string", "null"],
            "description": "Industry sector"
        },
        "submissionDate": {
            "bsonType": ["string", "null"],
            "description": "Submission date (YYYY-MM-DD format)"
        },
        "assignedEmployee": {
            "bsonType": ["string", "null"],
            "description": "Assigned employee name"
        },
        "teamSize": {
            "bsonType": ["int", "null"],
            "minimum": 1,
            "description": "Number of people working on the project"
        },
        "remarks": {
            "bsonType": ["string", "null"],
            "description": "Additional remarks"
        },
        "aiPrediction": {
            "bsonType": "int",
            "minimum": 0,
            "maximum": 100,
            "description": "ML prediction (0-100)"
        },
        "shapExplanations": {
            "bsonType": "array",
            "items": {
                "bsonType": "object"
            },
            "description": "SHAP explanation objects"
        },
        "tags": {
            "bsonType": "array",
            "items": {
                "bsonType": "string"
            },
            "description": "Array of lowercase tags"
        },
        "comments": {
            "bsonType": "array",
            "items": {
                "bsonType": "object",
                "required": ["text", "author", "date"],
                "properties": {
                    "text": {"bsonType": "string"},
                    "author": {"bsonType": "string"},
                    "date": {"bsonType": "date"}
                }
            },
            "description": "Array of comment objects"
        },
        "createdBy": {
            "bsonType": "string",
            "description": "User ID of creator"
        },
        "history": {
            "bsonType": "array",
            "items": {
                "bsonType": "object",
                "required": ["status", "date"],
                "properties": {
                    "status": {"bsonType": "string"},
                    "date": {"bsonType": "date"},
                    "note": {"bsonType": "string"}
                }
            },
            "description": "Status change history"
        },
        "slaBreached": {
            "bsonType": "bool",
            "description": "Whether SLA was breached"
        },
        "slaBreachedAt": {
            "bsonType": "date",
            "description": "SLA breach timestamp"
        },
        "slaElapsedDays": {
            "bsonType": "int",
            "description": "Days elapsed when SLA breached"
        },
        "slaThresholdDays": {
            "bsonType": "int",
            "description": "SLA threshold in days"
        },
        "bidderType": {
            "bsonType": "string",
            "enum": ["internal", "external"],
            "description": "internal = org employee, external = marketplace bidder"
        }
    }
}

DOCUMENTS_SCHEMA = {
    "bsonType": "object",
    "required": ["filename", "path", "uploadDate", "uploadedBy"],
    "properties": {
        "bidId": {
            "bsonType": ["string", "null"],
            "description": "Reference to bid (string of ObjectId)"
        },
        "enquiryId": {
            "bsonType": ["string", "null"],
            "description": "Reference to enquiry (for portal/marketplace uploads)"
        },
        "filename": {
            "bsonType": "string",
            "description": "Original filename (sanitized)"
        },
        "path": {
            "bsonType": "string",
            "description": "Server-side unique filename"
        },
        "uploadDate": {
            "bsonType": "date",
            "description": "Upload timestamp"
        },
        "uploadedBy": {
            "bsonType": "string",
            "description": "User ID of uploader or 'portal' for public uploads"
        }
    }
}

NOTIFICATIONS_SCHEMA = {
    "bsonType": "object",
    "required": ["userId", "title", "message", "isRead", "createdAt"],
    "properties": {
        "userId": {
            "bsonType": "string",
            "description": "Target user ID"
        },
        "title": {
            "bsonType": "string",
            "description": "Notification title"
        },
        "message": {
            "bsonType": "string",
            "description": "Notification message"
        },
        "type": {
            "bsonType": "string",
            "enum": ["status_change", "new_comment", "system"],
            "description": "Notification type"
        },
        "refId": {
            "bsonType": "string",
            "description": "Reference ID (e.g., bid _id)"
        },
        "isRead": {
            "bsonType": "bool",
            "description": "Read status"
        },
        "createdAt": {
            "bsonType": "date",
            "description": "Creation timestamp"
        }
    }
}

REVOKED_TOKENS_SCHEMA = {
    "bsonType": "object",
    "required": ["jti", "exp"],
    "properties": {
        "jti": {
            "bsonType": "string",
            "description": "JWT token ID (unique)"
        },
        "exp": {
            "bsonType": "date",
            "description": "Token expiry (used by TTL index)"
        }
    }
}

AUDIT_LOGS_SCHEMA = {
    "bsonType": "object",
    "required": ["action", "details", "user", "timestamp"],
    "properties": {
        "action": {
            "bsonType": "string",
            "description": "Audit action (e.g., CREATE_BID, UPDATE_BID)"
        },
        "details": {
            "bsonType": "string",
            "description": "Human-readable description"
        },
        "user": {
            "bsonType": "string",
            "description": "User name or 'System'"
        },
        "userId": {
            "bsonType": ["string", "null"],
            "description": "User ID for per-user filtering"
        },
        "timestamp": {
            "bsonType": "date",
            "description": "Action timestamp"
        }
    }
}

MODEL_VERSIONS_SCHEMA = {
    "bsonType": "object",
    "required": ["version", "isActive"],
    "properties": {
        "version": {
            "bsonType": "int",
            "description": "Sequential version number"
        },
        "isActive": {
            "bsonType": "bool",
            "description": "Whether this is the active model version"
        },
        "accuracy": {
            "bsonType": "double",
            "minimum": 0,
            "maximum": 1,
            "description": "Model accuracy (0-1)"
        },
        "records": {
            "bsonType": "int",
            "description": "Number of training records"
        },
        "trainedAt": {
            "bsonType": "date",
            "description": "Training timestamp"
        },
        "modelBinary": {
            "bsonType": "binData",
            "description": "Serialized model binary"
        },
        "modelSignature": {
            "bsonType": "string",
            "description": "HMAC-SHA256 signature of modelBinary"
        },
        "encoderBinary": {
            "bsonType": "binData",
            "description": "Serialized encoder binary"
        },
        "encoderSignature": {
            "bsonType": "string",
            "description": "HMAC-SHA256 signature of encoderBinary"
        }
    }
}

ALL_SCHEMAS = {
    "Users": USERS_SCHEMA,
    "Enquiries": ENQUIRIES_SCHEMA,
    "Bids": BIDS_SCHEMA,
    "Documents": DOCUMENTS_SCHEMA,
    "Notifications": NOTIFICATIONS_SCHEMA,
    "RevokedTokens": REVOKED_TOKENS_SCHEMA,
    "AuditLogs": AUDIT_LOGS_SCHEMA,
    "ModelVersions": MODEL_VERSIONS_SCHEMA,
}
