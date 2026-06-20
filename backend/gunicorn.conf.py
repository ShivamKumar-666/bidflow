"""
gunicorn.conf.py — Gunicorn configuration for BidFlow production deployment.

Apply with:
    gunicorn -c gunicorn.conf.py wsgi:app

Environment overrides (set before running):
    PORT             — bind port (default 5000)
    GUNICORN_WORKERS — number of worker processes (default: 1 for gevent)
"""
import os

# ── Binding ───────────────────────────────────────────────────────────────────
bind        = f"0.0.0.0:{os.environ.get('PORT', '5000')}"

# ── Workers ───────────────────────────────────────────────────────────────────
# Flask-SocketIO needs the gevent-websocket worker (not the plain "gevent"
# worker) for native WebSocket upgrades; otherwise clients silently fall back
# to slower HTTP long-polling. gevent-websocket is already a dependency.
# Keep worker count at 1 — SocketIO requires sticky sessions for >1 worker.
worker_class = "geventwebsocket.gunicorn.workers.GeventWebSocketWorker"
workers      = int(os.environ.get("GUNICORN_WORKERS", "1"))

# ── Timeouts ──────────────────────────────────────────────────────────────────
timeout      = 120    # seconds — long enough for ML retraining requests
keepalive    = 5

# ── Logging ───────────────────────────────────────────────────────────────────
accesslog    = "-"    # stdout
errorlog     = "-"    # stderr
loglevel     = os.environ.get("LOG_LEVEL", "info")

# ── Security ──────────────────────────────────────────────────────────────────
limit_request_line    = 4094
limit_request_fields  = 100
