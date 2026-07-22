"""
routes/auth.py — Authentication & user-management endpoints.

Blueprint: 'auth'  Prefix: /api/auth

Endpoints:
  POST   /register        — Register a new user.
  POST   /login           — Authenticate and return JWT tokens.
  POST   /logout          — Invalidate session, record logout time.
  POST   /refresh         — Exchange refresh token for a new access token.
  GET    /me              — Return authenticated user profile.
  PUT    /profile         — Update name / bio / avatar_url.
  PUT    /change-password — Change password (requires current password).
  GET    /login-history   — Paginated login audit log.
  GET    /stats           — Login statistics summary.
"""

import re
import logging
from datetime import datetime

import requests as http_requests
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    jwt_required,
    get_jwt_identity,
    get_jwt,
)

from models import db, User, LoginHistory

logger = logging.getLogger(__name__)

auth_bp = Blueprint("auth", __name__)

# ── Constants ──────────────────────────────────────────────────────────────────
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MIN_PASSWORD_LEN = 6

# ══════════════════════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════════════════════

def _ok(data=None, message: str = "Success", status: int = 200):
    """Standard success response."""
    return jsonify({"success": True, "message": message, "data": data}), status


def _err(message: str, status: int = 400, data=None):
    """Standard error response."""
    return jsonify({"success": False, "message": message, "data": data}), status


def parse_user_agent(ua_string: str) -> dict:
    """
    Parse a User-Agent string into browser, os_name, and device_type.

    Returns a dict with keys: browser, os_name, device_type.
    Uses simple keyword heuristics — no external library required.
    """
    ua = ua_string or ""
    ua_lower = ua.lower()

    # ── Browser detection ──────────────────────────────────────────────────────
    if "edg/" in ua_lower or "edge/" in ua_lower:
        browser = "Edge"
    elif "opr/" in ua_lower or "opera" in ua_lower:
        browser = "Opera"
    elif "chrome/" in ua_lower and "chromium" not in ua_lower:
        browser = "Chrome"
    elif "firefox/" in ua_lower:
        browser = "Firefox"
    elif "safari/" in ua_lower and "chrome" not in ua_lower:
        browser = "Safari"
    elif "msie" in ua_lower or "trident/" in ua_lower:
        browser = "Internet Explorer"
    elif "curl" in ua_lower:
        browser = "curl"
    elif "python" in ua_lower:
        browser = "Python"
    else:
        browser = "Unknown"

    # ── OS detection ───────────────────────────────────────────────────────────
    if "windows" in ua_lower:
        os_name = "Windows"
    elif "android" in ua_lower:
        os_name = "Android"
    elif "iphone" in ua_lower or "ipad" in ua_lower:
        os_name = "iOS"
    elif "mac os" in ua_lower or "macos" in ua_lower:
        os_name = "macOS"
    elif "linux" in ua_lower:
        os_name = "Linux"
    elif "cros" in ua_lower:
        os_name = "ChromeOS"
    else:
        os_name = "Unknown"

    # ── Device type ────────────────────────────────────────────────────────────
    if "mobile" in ua_lower or "android" in ua_lower and "mobile" in ua_lower:
        device_type = "mobile"
    elif "ipad" in ua_lower or "tablet" in ua_lower:
        device_type = "tablet"
    else:
        device_type = "desktop"

    return {"browser": browser, "os_name": os_name, "device_type": device_type}


def _get_geo(ip: str) -> dict:
    """
    Fetch city/country for *ip* using the free ip-api.com service.
    Returns {"city": ..., "country": ...} or {"city": None, "country": None} on failure.
    """
    if not ip or ip in ("127.0.0.1", "::1", "localhost"):
        return {"city": "Localhost", "country": "Local"}
    try:
        resp = http_requests.get(
            f"http://ip-api.com/json/{ip}?fields=status,city,country",
            timeout=3,
        )
        data = resp.json()
        if data.get("status") == "success":
            return {"city": data.get("city"), "country": data.get("country")}
    except Exception:
        pass
    return {"city": None, "country": None}


def _record_login(
    user_id: str,
    ip: str,
    ua_string: str,
    success: bool,
    reason: str = None,
) -> LoginHistory:
    """Create and persist a LoginHistory record."""
    parsed = parse_user_agent(ua_string)
    geo = _get_geo(ip)

    entry = LoginHistory(
        user_id=user_id,
        ip_address=ip,
        user_agent=ua_string,
        browser=parsed["browser"],
        os_name=parsed["os_name"],
        device_type=parsed["device_type"],
        city=geo["city"],
        country=geo["country"],
        is_successful=success,
        failure_reason=reason,
    )
    db.session.add(entry)
    db.session.commit()
    return entry


# ══════════════════════════════════════════════════════════════════════════════
# Routes
# ══════════════════════════════════════════════════════════════════════════════

@auth_bp.route("/register", methods=["POST"])
def register():
    """
    Register a new user account.

    Body: {email, name, password}
    Returns: {access_token, refresh_token, user}
    """
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()
    name = (body.get("name") or "").strip()
    password = body.get("password") or ""

    # ── Validation ─────────────────────────────────────────────────────────────
    if not email or not name or not password:
        return _err("email, name and password are required.", 400)
    if not EMAIL_RE.match(email):
        return _err("Invalid email address.", 400)
    if len(password) < MIN_PASSWORD_LEN:
        return _err(f"Password must be at least {MIN_PASSWORD_LEN} characters.", 400)
    if len(name) < 2:
        return _err("Name must be at least 2 characters.", 400)

    # ── Uniqueness check ───────────────────────────────────────────────────────
    if User.query.filter_by(email=email).first():
        return _err("An account with that email already exists.", 409)

    try:
        user = User(email=email, name=name, xp_points=10)  # bonus XP for registering
        user.set_password(password)
        user.last_active = datetime.utcnow()
        db.session.add(user)
        db.session.commit()

        access_token = create_access_token(identity=user.id)
        refresh_token = create_refresh_token(identity=user.id)

        return _ok(
            data={
                "access_token": access_token,
                "refresh_token": refresh_token,
                "user": user.to_dict(),
            },
            message="Account created successfully.",
            status=201,
        )
    except Exception as exc:
        db.session.rollback()
        logger.exception("register error: %s", exc)
        return _err("Registration failed. Please try again.", 500)


@auth_bp.route("/login", methods=["POST"])
def login():
    """
    Authenticate a user and return JWT tokens.

    Body: {email, password}
    Returns: {access_token, refresh_token, user}
    """
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "").split(",")[0].strip()
    ua_string = request.headers.get("User-Agent", "")

    if not email or not password:
        return _err("email and password are required.", 400)

    user = User.query.filter_by(email=email).first()

    if not user or not user.check_password(password):
        if user:
            _record_login(user.id, ip, ua_string, success=False, reason="Invalid password")
        return _err("Invalid email or password.", 401)

    try:
        # Update last active + streak
        now = datetime.utcnow()
        if user.last_active:
            delta = (now.date() - user.last_active.date()).days
            if delta == 1:
                user.streak_days += 1
            elif delta > 1:
                user.streak_days = 1
        else:
            user.streak_days = 1
        user.last_active = now

        db.session.commit()

        access_token = create_access_token(identity=user.id)
        refresh_token = create_refresh_token(identity=user.id)

        _record_login(user.id, ip, ua_string, success=True)

        return _ok(
            data={
                "access_token": access_token,
                "refresh_token": refresh_token,
                "user": user.to_dict(),
            },
            message="Login successful.",
        )
    except Exception as exc:
        db.session.rollback()
        logger.exception("login error: %s", exc)
        return _err("Login failed. Please try again.", 500)


@auth_bp.route("/logout", methods=["POST"])
@jwt_required()
def logout():
    """
    Record logout time on the most recent successful login history entry.

    Returns: {message}
    """
    user_id = get_jwt_identity()
    try:
        entry = (
            LoginHistory.query.filter_by(user_id=user_id, is_successful=True, logged_out_at=None)
            .order_by(LoginHistory.logged_in_at.desc())
            .first()
        )
        if entry:
            now = datetime.utcnow()
            entry.logged_out_at = now
            delta = now - entry.logged_in_at
            entry.session_duration = int(delta.total_seconds())
            db.session.commit()
    except Exception as exc:
        logger.warning("logout record error: %s", exc)

    return _ok(message="Logged out successfully.")


@auth_bp.route("/refresh", methods=["POST"])
@jwt_required(refresh=True)
def refresh():
    """Exchange a valid refresh token for a new access token."""
    user_id = get_jwt_identity()
    new_token = create_access_token(identity=user_id)
    return _ok(data={"access_token": new_token}, message="Token refreshed.")


@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    """Return the authenticated user's profile."""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return _err("User not found.", 404)
    return _ok(data={"user": user.to_dict()})


@auth_bp.route("/profile", methods=["PUT"])
@jwt_required()
def update_profile():
    """
    Update name, bio, avatar_url.

    Body: {name?, bio?, avatar_url?}
    """
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return _err("User not found.", 404)

    body = request.get_json(silent=True) or {}

    if "name" in body:
        name = (body["name"] or "").strip()
        if len(name) < 2:
            return _err("Name must be at least 2 characters.", 400)
        user.name = name

    if "bio" in body:
        user.bio = (body["bio"] or "").strip() or None

    if "avatar_url" in body:
        user.avatar_url = (body["avatar_url"] or "").strip() or None

    try:
        user.updated_at = datetime.utcnow()
        db.session.commit()
        return _ok(data={"user": user.to_dict()}, message="Profile updated.")
    except Exception as exc:
        db.session.rollback()
        logger.exception("update_profile error: %s", exc)
        return _err("Failed to update profile.", 500)


@auth_bp.route("/change-password", methods=["PUT"])
@jwt_required()
def change_password():
    """
    Change the current user's password.

    Body: {current_password, new_password}
    """
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return _err("User not found.", 404)

    body = request.get_json(silent=True) or {}
    current_pw = body.get("current_password") or ""
    new_pw = body.get("new_password") or ""

    if not current_pw or not new_pw:
        return _err("current_password and new_password are required.", 400)
    if not user.check_password(current_pw):
        return _err("Current password is incorrect.", 401)
    if len(new_pw) < MIN_PASSWORD_LEN:
        return _err(f"New password must be at least {MIN_PASSWORD_LEN} characters.", 400)

    try:
        user.set_password(new_pw)
        user.updated_at = datetime.utcnow()
        db.session.commit()
        return _ok(message="Password changed successfully.")
    except Exception as exc:
        db.session.rollback()
        logger.exception("change_password error: %s", exc)
        return _err("Failed to change password.", 500)


@auth_bp.route("/login-history", methods=["GET"])
@jwt_required()
def login_history():
    """
    Return paginated login history for the authenticated user.

    Query params: page (default 1), per_page (default 20, max 100)
    """
    user_id = get_jwt_identity()

    try:
        page = max(1, int(request.args.get("page", 1)))
        per_page = min(100, max(1, int(request.args.get("per_page", 20))))
    except ValueError:
        page, per_page = 1, 20

    try:
        pagination = (
            LoginHistory.query.filter_by(user_id=user_id)
            .order_by(LoginHistory.logged_in_at.desc())
            .paginate(page=page, per_page=per_page, error_out=False)
        )
        return _ok(
            data={
                "items": [h.to_dict() for h in pagination.items],
                "page": pagination.page,
                "per_page": per_page,
                "total": pagination.total,
                "pages": pagination.pages,
            }
        )
    except Exception as exc:
        logger.exception("login_history error: %s", exc)
        return _err("Failed to retrieve login history.", 500)


@auth_bp.route("/stats", methods=["GET"])
@jwt_required()
def login_stats():
    """
    Return login statistics for the authenticated user:
      total_logins, successful_logins, failed_logins, unique_ips,
      last_login, most_used_browser, most_used_device.
    """
    user_id = get_jwt_identity()
    try:
        entries = LoginHistory.query.filter_by(user_id=user_id).all()

        total = len(entries)
        successful = sum(1 for e in entries if e.is_successful)
        failed = total - successful
        unique_ips = len({e.ip_address for e in entries if e.ip_address})

        last_login = None
        successful_entries = [e for e in entries if e.is_successful]
        if successful_entries:
            last_entry = max(successful_entries, key=lambda e: e.logged_in_at)
            last_login = last_entry.logged_in_at.isoformat()

        from collections import Counter

        browser_counts = Counter(e.browser for e in entries if e.browser)
        device_counts = Counter(e.device_type for e in entries if e.device_type)

        most_used_browser = browser_counts.most_common(1)[0][0] if browser_counts else None
        most_used_device = device_counts.most_common(1)[0][0] if device_counts else None

        return _ok(
            data={
                "total_logins": total,
                "successful_logins": successful,
                "failed_logins": failed,
                "unique_ips": unique_ips,
                "last_login": last_login,
                "most_used_browser": most_used_browser,
                "most_used_device": most_used_device,
            }
        )
    except Exception as exc:
        logger.exception("login_stats error: %s", exc)
        return _err("Failed to retrieve login stats.", 500)
