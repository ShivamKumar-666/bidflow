import logging
import os

from dotenv import load_dotenv

# Load .env BEFORE Config reads os.environ at import time
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

from flask import Flask, jsonify, request, send_from_directory, current_app
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
from routes.marketplace import marketplace_bp
from extensions import socketio, limiter, mail, get_allowed_origins
from database import db

# ── Sentry error tracking (optional, requires SENTRY_DSN env var) ─────────────
if os.environ.get('SENTRY_DSN'):
    try:
        import sentry_sdk
        from sentry_sdk.integrations.flask import FlaskIntegration
        from sentry_sdk.integrations.celery import CeleryIntegration
        sentry_sdk.init(
            dsn=os.environ['SENTRY_DSN'],
            integrations=[FlaskIntegration(), CeleryIntegration()],
            traces_sample_rate=0.1,
            environment=os.environ.get('FLASK_ENV', 'development'),
        )
    except ImportError:
        pass


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
            current_app.logger.debug("SocketIO join rejected", exc_info=True)

    # ── 2FA temp token guard (C-01) ──────────────────────────────────────────
    @app.before_request
    def reject_2fa_pending_tokens():
        from flask_jwt_extended import verify_jwt_in_request, get_jwt
        try:
            verify_jwt_in_request(optional=True)
            claims = get_jwt()
            if claims and claims.get('sub_type') == '2fa_pending':
                if not request.path.startswith('/api/v1/2fa/verify'):
                    return jsonify({"msg": "2FA verification required"}), 403
        except Exception:
            pass

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
        response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://*.googleapis.com https://*.gstatic.com"
        response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
        if Config.FLASK_ENV == 'production':
            response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
        return response

    # ── Blueprints ────────────────────────────────────────────────────────────
    app.register_blueprint(auth_bp,          url_prefix='/api/v1/auth')
    app.register_blueprint(enquiries_bp,     url_prefix='/api/v1/enquiries')
    app.register_blueprint(bids_bp,          url_prefix='/api/v1/bids')
    app.register_blueprint(documents_bp,     url_prefix='/api/v1/documents')
    app.register_blueprint(analytics_bp,     url_prefix='/api/v1/analytics')
    app.register_blueprint(audit_bp,         url_prefix='/api/v1/audit')
    app.register_blueprint(twofa_bp,         url_prefix='/api/v1/2fa')
    app.register_blueprint(admin_bp,         url_prefix='/api/v1/admin')
    app.register_blueprint(search_bp,        url_prefix='/api/v1/search')
    app.register_blueprint(tags_bp,          url_prefix='/api/v1/tags')
    app.register_blueprint(notifications_bp, url_prefix='/api/v1/notifications')
    app.register_blueprint(marketplace_bp,     url_prefix='/api/v1/marketplace')

    # ── Swagger UI ────────────────────────────────────────────────────────────
    @app.route('/api/v1/docs/openapi.yaml')
    def openapi_spec():
        docs_dir = os.path.join(os.path.dirname(__file__), 'docs')
        return send_from_directory(docs_dir, 'openapi.yaml')

    from flask_swagger_ui import get_swaggerui_blueprint
    swaggerui_blueprint = get_swaggerui_blueprint(
        '/api/v1/docs',
        '/api/v1/docs/openapi.yaml',
        config={'app_name': 'BidFlow API v1'}
    )
    app.register_blueprint(swaggerui_blueprint, url_prefix='/api/v1/docs')

    @app.route('/')
    def index():
        return {"message": "BidFlow API is running"}

    @app.route('/health')
    def health():
        checks = {}
        try:
            db.client.admin.command('ping')
            checks["mongodb"] = "ok"
        except Exception:
            checks["mongodb"] = "fail"

        try:
            import redis
            r = redis.from_url(Config.REDIS_URL, socket_timeout=2)
            r.ping()
            checks["redis"] = "ok"
        except Exception:
            checks["redis"] = "fail"

        status = "healthy" if all(v == "ok" for v in checks.values()) else "degraded"
        code = 200 if status == "healthy" else 503
        return jsonify({"status": status, "checks": checks}), code

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
