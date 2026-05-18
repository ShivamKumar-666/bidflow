# pyrefly: ignore [missing-import]
from pymongo import MongoClient
from config import Config

def get_db():
    client = MongoClient(Config.MONGO_URI)
    db = client.get_default_database()
    if db.name is None:
        db = client['bidflow']
    return db

db = get_db()
