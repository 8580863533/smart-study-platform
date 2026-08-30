import os
import logging
from flask import Flask, jsonify
from flask_jwt_extended import JWTManager
from flask_cors import CORS

from config import config
from models import db

# Import blueprints
from routes.auth import auth_bp
from routes.documents import documents_bp
from routes.qa import qa_bp
from routes.summarize import summarize_bp
from routes.flashcards import flashcards_bp
from routes.quiz import quiz_bp
from routes.progress import progress_bp

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)

def create_app(config_name=None):
    """
    Flask application factory.
    """
    if config_name is None:
        config_name = os.environ.get("FLASK_ENV", "development")

    app = Flask(__name__)
    app.config.from_object(config[config_name])
    app.url_map.strict_slashes = False

    # Ensure Upload folder exists
    upload_folder = app.config.get("UPLOAD_FOLDER", "uploads")
    if not os.path.exists(upload_folder):
        os.makedirs(upload_folder)

    # Initialize extensions
    db.init_app(app)
    jwt = JWTManager(app)
    
    # CORS setup
    CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

    # Base & Health Routes
    @app.route("/")
    @app.route("/api")
    @app.route("/api/")
    def index():
        return jsonify({
            "success": True,
            "message": "Smart Study Platform API is online",
            "version": "1.0.0"
        }), 200

    # Register blueprints
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(documents_bp, url_prefix="/api/documents")
    app.register_blueprint(qa_bp, url_prefix="/api/qa")
    app.register_blueprint(summarize_bp, url_prefix="/api/summarize")
    app.register_blueprint(flashcards_bp, url_prefix="/api/flashcards")
    app.register_blueprint(quiz_bp, url_prefix="/api/quiz")
    app.register_blueprint(progress_bp, url_prefix="/api/progress")

    # JWT Error handlers
    @jwt.expired_token_loader
    def expired_token_callback(jwt_header, jwt_payload):
        return jsonify({
            "success": False,
            "message": "The token has expired",
            "error": "token_expired"
        }), 401

    @jwt.invalid_token_loader
    def invalid_token_callback(error):
        return jsonify({
            "success": False,
            "message": "Signature verification failed",
            "error": "invalid_token"
        }), 401

    @jwt.unauthorized_loader
    def missing_token_callback(error):
        return jsonify({
            "success": False,
            "message": "Request does not contain an access token",
            "error": "authorization_required"
        }), 401

    # Global Error Handlers
    @app.errorhandler(404)
    def not_found_error(error):
        return jsonify({
            "success": False,
            "message": "Resource not found"
        }), 404

    @app.errorhandler(500)
    def internal_error(error):
        db.session.rollback()
        logger.error("Internal Server Error: %s", str(error), exc_info=True)
        return jsonify({
            "success": False,
            "message": "An internal server error occurred"
        }), 500

    @app.errorhandler(413)
    def request_entity_too_large(error):
        return jsonify({
            "success": False,
            "message": "File exceeds maximum size limit (16MB)"
        }), 413

    # Database setup helper
    with app.app_context():
        try:
            db.create_all()
            logger.info("Database tables verified/created successfully.")
        except Exception as e:
            logger.error("Error creating database tables: %s", str(e), exc_info=True)

    return app
