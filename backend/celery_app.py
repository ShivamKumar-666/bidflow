"""
backend/celery_app.py
─────────────────────
Celery beat schedule for SLA breach detection + monthly ML retraining.
"""

import datetime
import logging
import os

from celery import Celery
from celery.schedules import crontab
from config import Config
from utils.auth_helpers import now_utc

celery = Celery(
    'bidflow_tasks',
    broker=os.environ.get('CELERY_BROKER', Config.REDIS_URL),
    backend=os.environ.get('CELERY_BACKEND', Config.REDIS_URL),
)

logger = logging.getLogger(__name__)

# SLA Stage Configuration (Threshold in days)
SLA_CONFIG = {
    "Under Review":       3,
    "Quotation Prepared": 5,
    "Negotiation":        10,
}


def now_utc_naive():
    """Naive UTC datetime for legacy Mongo BSON compatibility."""
    return now_utc().replace(tzinfo=None)


@celery.task(bind=True, max_retries=3)
def check_sla_breaches(self):
    """Checks all active bids and flags SLA breaches in MongoDB."""
    from database import db
    from bson.objectid import ObjectId

    try:
        terminal_statuses = ["Order Received", "Rejected"]

        active_bids = list(db.Bids.find({"status": {"$nin": terminal_statuses}}).limit(1000))
        breach_count  = 0
        checked_count = len(active_bids)
        now           = now_utc_naive()

        for bid in active_bids:
            current_status  = bid.get("status")
            threshold_days  = SLA_CONFIG.get(current_status)

            if not threshold_days:
                db.Bids.update_one({"_id": bid["_id"]}, {"$set": {"slaBreached": False}})
                continue

            history = bid.get("history", [])
            matching_entries = [h for h in history if h.get("status") == current_status]

            if not matching_entries:
                transition_date = history[-1].get("date") if history else now
            else:
                transition_date = matching_entries[-1].get("date")

            if isinstance(transition_date, str):
                try:
                    transition_date = datetime.datetime.fromisoformat(transition_date)
                except (TypeError, ValueError):
                    logger.warning("malformed transition_date, defaulting to now")
                    transition_date = now
            elif not isinstance(transition_date, datetime.datetime):
                transition_date = now

            if isinstance(transition_date, datetime.datetime) and transition_date.tzinfo is not None:
                transition_date = transition_date.astimezone(datetime.timezone.utc).replace(tzinfo=None)

            time_elapsed = now - transition_date
            elapsed_days = max(time_elapsed.days, 0)

            is_breached = elapsed_days >= threshold_days

            if is_breached:
                db.Bids.update_one(
                    {"_id": bid["_id"]},
                    {"$set": {
                        "slaBreached":       True,
                        "slaBreachedAt":     now,
                        "slaElapsedDays":    elapsed_days,
                        "slaThresholdDays":  threshold_days,
                    }}
                )
                breach_count += 1
            else:
                db.Bids.update_one(
                    {"_id": bid["_id"]},
                    {"$set": {"slaBreached": False}}
                )

        return {
            "checked":   checked_count,
            "breaches":  breach_count,
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }
    except Exception as exc:
        logger.exception("check_sla_breaches failed")
        raise self.retry(exc=exc, countdown=300)


@celery.task(bind=True, max_retries=1)
def monthly_model_retraining(self):
    """Monthly Celery task to retrain the XGBoost model from closed bids."""
    from database import db
    from ml.retrain import retrain_from_db

    try:
        results = retrain_from_db(db)
        return results
    except Exception as e:
        logger.exception("monthly_model_retraining failed")
        raise self.retry(exc=e, countdown=3600)


# Schedule Celery beat cron tasks
celery.conf.beat_schedule = {
    'hourly-sla-tracker': {
        'task':     'celery_app.check_sla_breaches',
        'schedule': 3600.0,
    },
    'monthly-ml-retraining': {
        'task':     'celery_app.monthly_model_retraining',
        'schedule': crontab(day_of_month='1', hour=0, minute=0),
    },
}
celery.conf.timezone = 'UTC'
