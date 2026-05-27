from celery import Celery
from celery.schedules import crontab
import datetime

# Setup Celery with MongoDB as message broker and backend
celery = Celery(
    'bidflow_tasks',
    broker='mongodb://localhost:27017/bidflow_celery',
    backend='mongodb://localhost:27017/bidflow_celery'
)

# SLA Stage Configuration (Threshold in days)
# 'Under Review' must not exceed 3 days, etc.
SLA_CONFIG = {
    "Under Review": 3,
    "Quotation Prepared": 5,
    "Submitted": 7,
    "Negotiation": 10
}

@celery.task
def check_sla_breaches():
    """Checks all active bids and flags SLA breaches in MongoDB."""
    from database import db
    from bson.objectid import ObjectId
    
    # Terminal/complete statuses to exclude from SLA checking
    terminal_statuses = ["Order Received", "Completed", "Rejected", "Lost"]
    
    # Fetch all active bids
    active_bids = list(db.Bids.find({"status": {"$nin": terminal_statuses}}))
    breach_count = 0
    checked_count = len(active_bids)
    
    for bid in active_bids:
        current_status = bid.get("status")
        threshold_days = SLA_CONFIG.get(current_status)
        
        if not threshold_days:
            # If no SLA configuration for this stage, ensure flag is cleared
            db.Bids.update_one({"_id": bid["_id"]}, {"$set": {"slaBreached": False}})
            continue
            
        # Get transition date for current status stage from history
        history = bid.get("history", [])
        matching_entries = [h for h in history if h.get("status") == current_status]
        
        if not matching_entries:
            # Fallback if history transition is missing
            if history:
                transition_date = history[-1].get("date")
            else:
                transition_date = datetime.datetime.utcnow()
        else:
            transition_date = matching_entries[-1].get("date")
            
        # Standardize date parsing
        if isinstance(transition_date, str):
            try:
                transition_date = datetime.datetime.fromisoformat(transition_date)
            except:
                transition_date = datetime.datetime.utcnow()
        elif not isinstance(transition_date, datetime.datetime):
            transition_date = datetime.datetime.utcnow()
            
        # Calculate elapsed days in current stage
        time_elapsed = datetime.datetime.utcnow() - transition_date
        elapsed_days = time_elapsed.days
        
        is_breached = elapsed_days >= threshold_days
        
        if is_breached:
            db.Bids.update_one(
                {"_id": bid["_id"]},
                {"$set": {
                    "slaBreached": True,
                    "slaBreachedAt": datetime.datetime.utcnow(),
                    "slaElapsedDays": elapsed_days,
                    "slaThresholdDays": threshold_days
                }}
            )
            breach_count += 1
        else:
            db.Bids.update_one(
                {"_id": bid["_id"]},
                {"$set": {"slaBreached": False}}
            )
            
    return {
        "checked": checked_count,
        "breaches": breach_count,
        "timestamp": datetime.datetime.utcnow().isoformat()
    }

@celery.task
def monthly_model_retraining():
    """Monthly Celery task to retrain the XGBoost model from closed bids."""
    from database import db
    from ml.retrain import retrain_from_db
    
    try:
        results = retrain_from_db(db)
        return results
    except Exception as e:
        return {"status": "error", "msg": str(e)}

# Schedule Celery beat cron tasks
celery.conf.beat_schedule = {
    'hourly-sla-tracker': {
        'task': 'celery_app.check_sla_breaches',
        'schedule': 3600.0,
    },
    'monthly-ml-retraining': {
        'task': 'celery_app.monthly_model_retraining',
        'schedule': crontab(day_of_month='1', hour=0, minute=0),
    }
}
celery.conf.timezone = 'UTC'
