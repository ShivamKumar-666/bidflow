import datetime
from database import db
from flask_jwt_extended import get_jwt_identity
from bson.objectid import ObjectId

def log_audit(action, details, user_id=None):
    if not user_id:
        try:
            user_id = get_jwt_identity()
        except:
            pass
            
    user_name = "System"
    if user_id:
        user = db.Users.find_one({"_id": ObjectId(user_id)})
        if user:
            user_name = user.get('name', 'Unknown')
            
    log_entry = {
        "action": action,
        "details": details,
        "user": user_name,
        "timestamp": datetime.datetime.utcnow()
    }
    db.AuditLogs.insert_one(log_entry)
