from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from config import Config
from routes.auth import auth_bp
from routes.enquiries import enquiries_bp
from routes.bids import bids_bp
from routes.documents import documents_bp
from routes.analytics import analytics_bp
from routes.audit import audit_bp
from extensions import socketio
import os

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # Initialize extensions
    CORS(app)
    jwt = JWTManager(app)

    # Ensure upload folder exists
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    
    # Initialize SocketIO
    socketio.init_app(app)

    # Register blueprints
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(enquiries_bp, url_prefix='/api/enquiries')
    app.register_blueprint(bids_bp, url_prefix='/api/bids')
    app.register_blueprint(documents_bp, url_prefix='/api/documents')
    app.register_blueprint(analytics_bp, url_prefix='/api/analytics')
    app.register_blueprint(audit_bp, url_prefix='/api/audit')

    @app.route('/')
    def index():
        return {"message": "BidFlow API is running"}

    return app

if __name__ == '__main__':
    app = create_app()
    socketio.run(app, debug=True, port=5000)
