import datetime

from database import db
from utils.auth_helpers import now_utc


class NotificationService:
    """Business logic for notification management."""

    @classmethod
    def create(cls, user_id: str, title: str, message: str,
               notif_type: str = "system", ref_id: str = None) -> dict:
        doc = {
            "userId": user_id,
            "title": title,
            "message": message,
            "type": notif_type,
            "refId": ref_id,
            "isRead": False,
            "createdAt": now_utc(),
        }
        db.Notifications.insert_one(doc)
        doc["_id"] = str(doc["_id"])
        doc["createdAt"] = doc["createdAt"].isoformat()
        return doc

    @classmethod
    def get_user_notifications(cls, user_id: str, limit: int = 50) -> list:
        docs = list(
            db.Notifications.find({"userId": user_id})
            .sort("createdAt", -1)
            .limit(limit)
        )
        return [cls._serialize(n) for n in docs]

    @classmethod
    def mark_read(cls, notif_id: str, user_id: str) -> bool:
        result = db.Notifications.update_one(
            {"_id": ObjectId(notif_id), "userId": user_id},
            {"$set": {"isRead": True}}
        )
        return result.matched_count > 0

    @classmethod
    def mark_all_read(cls, user_id: str) -> None:
        db.Notifications.update_many(
            {"userId": user_id, "isRead": False},
            {"$set": {"isRead": True}}
        )

    @classmethod
    def delete_by_ref(cls, ref_id: str) -> int:
        result = db.Notifications.delete_many({"refId": ref_id})
        return result.deleted_count

    @classmethod
    def _serialize(cls, n: dict) -> dict:
        n["_id"] = str(n["_id"])
        if isinstance(n.get("createdAt"), datetime.datetime):
            n["createdAt"] = n["createdAt"].isoformat()
        return n


from bson.objectid import ObjectId
