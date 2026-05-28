from flask import Flask, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from config import Config
from routes.auth import auth_bp
from routes.enquiries import enquiries_bp
from routes.bids import bids_bp
from routes.documents import documents_bp
from routes.analytics import analytics_bp
from routes.audit import audit_bp
from routes.twofa import twofa_bp
from routes.admin import admin_bp
from routes.search import search_bp
from routes.tags import tags_bp
from routes.notifications import notifications_bp
from extensions import socketio, limiter
from database import db
import datetime
import os


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # ── Core extensions ───────────────────────────────────────────────────────
    CORS(app, origins=["http://localhost:5173", "http://127.0.0.1:5173"])  # Restrict CORS origins
    jwt = JWTManager(app)
    limiter.init_app(app)

    # Ensure upload folder exists
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    
    # Initialize SocketIO
    socketio.init_app(app)

    # ── Socket.IO room management ─────────────────────────────────────────────
    @socketio.on('join')
    def on_join(data):
        """Client emits {room: 'user_<id>', token: '<jwt>'} after connecting."""
        from flask_socketio import join_room
        from flask_jwt_extended import decode_token
        room = data.get('room')
        token = data.get('token')
        if not room or not token:
            return
        try:
            decoded = decode_token(token)
            user_id = decoded.get('sub')
            # Only allow joining your own user room
            if room == f"user_{user_id}":
                join_room(room)
        except Exception:
            pass  # Invalid token — silently reject

    # ── JWT Blocklist (revocation) ────────────────────────────────────────────
    @jwt.token_in_blocklist_loader
    def check_if_token_revoked(jwt_header, jwt_payload):
        jti = jwt_payload.get("jti")
        if not jti:
            return False
        token = db.RevokedTokens.find_one({"jti": jti})
        return token is not None

    @jwt.revoked_token_loader
    def revoked_token_callback(jwt_header, jwt_payload):
        return jsonify({"msg": "Token has been revoked. Please log in again."}), 401

    # ── Rate-limit error handler ──────────────────────────────────────────────
    @app.errorhandler(429)
    def ratelimit_handler(e):
        return jsonify({
            "msg": "Too many requests. Please slow down and try again.",
            "retry_after": str(e.description)
        }), 429

    # ── Blueprints ────────────────────────────────────────────────────────────
    app.register_blueprint(auth_bp,          url_prefix='/api/auth')
    app.register_blueprint(enquiries_bp,     url_prefix='/api/enquiries')
    app.register_blueprint(bids_bp,          url_prefix='/api/bids')
    app.register_blueprint(documents_bp,     url_prefix='/api/documents')
    app.register_blueprint(analytics_bp,     url_prefix='/api/analytics')
    app.register_blueprint(audit_bp,         url_prefix='/api/audit')
    app.register_blueprint(twofa_bp,         url_prefix='/api/2fa')
    app.register_blueprint(admin_bp,         url_prefix='/api/admin')
    app.register_blueprint(search_bp,        url_prefix='/api/search')
    app.register_blueprint(tags_bp,          url_prefix='/api/tags')
    app.register_blueprint(notifications_bp, url_prefix='/api/notifications')

    @app.route('/')
    def index():
        return {"message": "BidFlow API is running"}

    return app


if __name__ == '__main__':
    app = create_app()
    is_dev = app.config.get('FLASK_ENV') == 'development'
    socketio.run(
        app,
        host='0.0.0.0',
        debug=is_dev,
        port=5000,
        allow_unsafe_werkzeug=is_dev
    )
