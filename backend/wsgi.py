"""
wsgi.py — Gunicorn entry point for BidFlow.

Usage (Linux/macOS):
    gunicorn -c gunicorn.conf.py wsgi:app

Windows dev (Gunicorn is not supported on Windows natively):
    python app.py
"""
import gevent
import gevent.monkey
gevent.monkey.patch_all()

from app import create_app
from extensions import socketio  # noqa: F401 — needed so socketio is bound

app = create_app()
