"""
wsgi.py — Gunicorn entry point for BidFlow.

Usage (Linux/macOS):
    gunicorn -c gunicorn.conf.py wsgi:app

Windows dev (Gunicorn is not supported on Windows natively):
    python app.py
"""
import eventlet
eventlet.monkey_patch()          # MUST be first — patches stdlib for async I/O

from app import create_app
from extensions import socketio  # noqa: F401 — needed so socketio is bound

app = create_app()
