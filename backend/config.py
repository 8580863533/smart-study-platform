"""
config.py — Application configuration classes for AI Study Tutor.

Provides base Config plus DevelopmentConfig and ProductionConfig,
all read from environment variables via python-dotenv.
"""

import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()


class Config:
    """Base configuration shared by all environments."""

    # ── Core Flask ─────────────────────────────────────────────────────────────
    SECRET_KEY: str = os.environ.get("SECRET_KEY", "fallback-secret-change-me")
    FLASK_ENV: str = os.environ.get("FLASK_ENV", "development")

    # ── JWT ────────────────────────────────────────────────────────────────────
    JWT_SECRET_KEY: str = os.environ.get("JWT_SECRET_KEY", "fallback-jwt-secret-change-me")
    JWT_ACCESS_TOKEN_EXPIRES: timedelta = timedelta(hours=24)
    JWT_REFRESH_TOKEN_EXPIRES: timedelta = timedelta(days=30)
    JWT_TOKEN_LOCATION: list = ["headers"]
    JWT_HEADER_NAME: str = "Authorization"
    JWT_HEADER_TYPE: str = "Bearer"

    # ── Database ───────────────────────────────────────────────────────────────
    SQLALCHEMY_DATABASE_URI: str = os.environ.get(
        "DATABASE_URL", "sqlite:///studytutor.db"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS: bool = False
    SQLALCHEMY_ENGINE_OPTIONS: dict = {
        "pool_pre_ping": True,
        "pool_recycle": 300,
    }

    # ── File uploads ───────────────────────────────────────────────────────────
    MAX_CONTENT_LENGTH: int = int(
        os.environ.get("MAX_CONTENT_LENGTH", 16 * 1024 * 1024)
    )  # 16 MB
    UPLOAD_FOLDER: str = os.environ.get("UPLOAD_FOLDER", "uploads")
    ALLOWED_EXTENSIONS: set = {"txt", "pdf"}

    # ── AI / Hugging Face ──────────────────────────────────────────────────────
    HF_API_KEY: str = os.environ.get("HF_API_KEY", "")
    USE_LOCAL_MODELS: bool = os.environ.get("USE_LOCAL_MODELS", "false").lower() == "true"

    # ── CORS ───────────────────────────────────────────────────────────────────
    CORS_ORIGINS: list = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # ── Misc ───────────────────────────────────────────────────────────────────
    JSON_SORT_KEYS: bool = False
    PROPAGATE_EXCEPTIONS: bool = True


class DevelopmentConfig(Config):
    """Development-specific configuration: debugging enabled, verbose SQL."""

    DEBUG: bool = True
    SQLALCHEMY_ECHO: bool = False  # Set True to log every SQL query


class ProductionConfig(Config):
    """Production-specific configuration: no debug, strict settings."""

    DEBUG: bool = False
    TESTING: bool = False
    # In production override DATABASE_URL to a real RDBMS (Postgres, MySQL…)
    SQLALCHEMY_ENGINE_OPTIONS: dict = {
        "pool_pre_ping": True,
        "pool_recycle": 300,
        "pool_size": 10,
        "max_overflow": 20,
    }


class TestingConfig(Config):
    """Testing configuration."""

    TESTING: bool = True
    DEBUG: bool = True
    SQLALCHEMY_DATABASE_URI: str = "sqlite:///:memory:"
    JWT_ACCESS_TOKEN_EXPIRES: timedelta = timedelta(minutes=5)


# ── Config registry ────────────────────────────────────────────────────────────
config: dict = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
    "default": DevelopmentConfig,
}
