from flask import Flask, jsonify, request
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
from extensions import socketio, limiter, mail, get_allowed_origins
from database import db
import os
import logging


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # Fail-fast on missing/weak secrets in production (SEC-02)
    Config.validate_secrets()

    # ── Core extensions ───────────────────────────────────────────────────────
    # CORS origins: consolidated via get_allowed_origins() (SEC-NEW-11).
    # supports_credentials=True is required because the frontend now sends
    # withCredentials=true for httpOnly JWT cookies.
    allowed_origins = get_allowed_origins()
    CORS(app, origins=allowed_origins, supports_credentials=True)
    jwt = JWTManager(app)
    limiter.init_app(app)

    # Ensure upload folder exists
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    
    # Initialize SocketIO and Mail
    socketio.init_app(app)
    mail.init_app(app)

    # ── Socket.IO room management ─────────────────────────────────────────────
    @socketio.on('join')
    def on_join(data):
        """Client emits {room: 'user_<id>', token: '<jwt>'} after connecting.
        If no token is provided in data, falls back to the httpOnly cookie
        (set by REST login — SEC-01 fix)."""
        from flask_socketio import join_room
        from flask_jwt_extended import decode_token
        room = data.get('room')
        token = data.get('token')

        # Fallback: read JWT from the httpOnly cookie (SEC-01)
        if not token:
            from flask import request as flask_request
            token = flask_request.cookies.get('access_token_cookie')

        if not room or not token:
            return
        try:
            decoded = decode_token(token)
            user_id = decoded.get('sub')
            jti = decoded.get('jti')

            # Check if token is revoked (SEC-NEW-06 fix)
            if jti:
                revoked = db.RevokedTokens.find_one({"jti": jti})
                if revoked:
                    return

            # Verify user still exists
            from bson.objectid import ObjectId
            if not ObjectId.is_valid(user_id):
                return
            user = db.Users.find_one({"_id": ObjectId(user_id)}, {"_id": 1})
            if not user:
                return

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

    # ── Global error handlers (SEC-NEW-04) ────────────────────────────────────
    @app.errorhandler(400)
    def bad_request(e):
        return jsonify({"msg": "Bad request"}), 400

    @app.errorhandler(401)
    def unauthorized(e):
        return jsonify({"msg": "Authentication required"}), 401

    @app.errorhandler(403)
    def forbidden(e):
        return jsonify({"msg": "Access denied"}), 403

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"msg": "Resource not found"}), 404

    @app.errorhandler(500)
    def internal_error(e):
        app.logger.exception("Internal server error")
        return jsonify({"msg": "Internal server error"}), 500

    @app.errorhandler(Exception)
    def handle_exception(e):
        app.logger.exception("Unhandled exception: %s", e)
        return jsonify({"msg": "Internal server error"}), 500

    # ── Security headers (SEC-NEW-05) ─────────────────────────────────────────
    @app.after_request
    def add_security_headers(response):
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        if Config.FLASK_ENV == 'production':
            response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
        return response

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

    @app.route('/health')
    def health():
        try:
            db.client.admin.command('ping')
            return jsonify({"status": "healthy"}), 200
        except Exception:
            return jsonify({"status": "unhealthy"}), 503

    return app


if __name__ == '__main__':
    app = create_app()
    is_dev = app.config.get('FLASK_ENV') == 'development'
    socketio.run(
        app,
        host='127.0.0.1',
        debug=is_dev,
        port=5000,
        allow_unsafe_werkzeug=is_dev
    )
