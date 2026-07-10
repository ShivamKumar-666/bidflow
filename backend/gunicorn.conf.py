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
# gevent workers are co-routine based — one process handles many
# concurrent connections.  Keep worker count at 1 unless behind a load balancer.
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
