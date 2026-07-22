"""
routes/summarize.py — AI summarisation endpoints.

Blueprint: 'summarize'  Prefix: /api/summarize

Endpoints:
  POST  /<doc_id> — Summarise a saved document (caches result).
  POST  /text     — Summarise arbitrary pasted text (no DB save).
"""

import logging
from datetime import datetime

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from models import db, Document, StudySession, User
from services.ai_service import AIService
from services.pdf_service import PdfService

logger = logging.getLogger(__name__)
summarize_bp = Blueprint("summarize", __name__)
_ai = AIService()
_pdf = PdfService()

# ── Helpers ────────────────────────────────────────────────────────────────────

def _ok(data=None, message: str = "Success", status: int = 200):
    return jsonify({"success": True, "message": message, "data": data}), status


def _err(message: str, status: int = 400, data=None):
    return jsonify({"success": False, "message": message, "data": data}), status


def _award_xp(user: User, points: int) -> None:
    user.xp_points = (user.xp_points or 0) + points
    user.level = user.compute_level()


# ══════════════════════════════════════════════════════════════════════════════
# Routes
# ══════════════════════════════════════════════════════════════════════════════

@summarize_bp.route("/<doc_id>", methods=["POST"])
@jwt_required()
def summarize_document(doc_id: str):
    """
    Summarise a saved document.

    If the document already has cached summary_bullets, return them immediately.
    Otherwise call AIService.summarize, store the result, and award XP.

    Query / body params:
      num_bullets (int, default 8) — number of bullet points to generate.
      force       (bool, default false) — re-generate even if cached.

    Returns: {summary_bullets, word_count, original_word_count, compression_ratio}
    """
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return _err("User not found.", 404)

    doc = Document.query.filter_by(id=doc_id, user_id=user_id).first()
    if not doc:
        return _err("Document not found.", 404)

    body = request.get_json(silent=True) or {}
    try:
        num_bullets = max(3, min(20, int(body.get("num_bullets", 8))))
    except (TypeError, ValueError):
        num_bullets = 8
    force_regen = str(body.get("force", "false")).lower() == "true"

    # Return cached summary unless force re-generation is requested
    if doc.summary_bullets and not force_regen:
        summary_text = " ".join(doc.summary_bullets)
        return _ok(
            data={
                "summary_bullets": doc.summary_bullets,
                "word_count": _pdf.count_words(summary_text),
                "original_word_count": doc.word_count,
                "compression_ratio": round(
                    _pdf.count_words(summary_text) / max(doc.word_count, 1), 4
                ),
                "cached": True,
            },
            message="Returning cached summary.",
        )

    # Generate summary
    if not doc.content or not doc.content.strip():
        return _err("Document has no content to summarise.", 422)

    try:
        bullets = _ai.summarize(doc.content, num_bullets=num_bullets)
    except Exception as exc:
        logger.exception("summarize AI error: %s", exc)
        return _err("Summarisation failed. Please try again.", 500)

    summary_text = " ".join(bullets)
    summary_word_count = _pdf.count_words(summary_text)
    compression_ratio = round(summary_word_count / max(doc.word_count, 1), 4)

    xp_earned = 15

    try:
        doc.summary_bullets = bullets
        doc.summary = summary_text
        doc.updated_at = datetime.utcnow()

        session = StudySession(
            user_id=user_id,
            document_id=doc_id,
            activity_type="summarize",
            duration_seconds=0,
            xp_earned=xp_earned,
            started_at=datetime.utcnow(),
            ended_at=datetime.utcnow(),
        )
        db.session.add(session)

        _award_xp(user, xp_earned)
        user.last_active = datetime.utcnow()
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        logger.exception("summarize persist error: %s", exc)
        # Return result even if DB update fails
        return _ok(
            data={
                "summary_bullets": bullets,
                "word_count": summary_word_count,
                "original_word_count": doc.word_count,
                "compression_ratio": compression_ratio,
                "xp_earned": 0,
                "cached": False,
            },
            message="Summary generated (not cached due to error).",
        )

    return _ok(
        data={
            "summary_bullets": bullets,
            "word_count": summary_word_count,
            "original_word_count": doc.word_count,
            "compression_ratio": compression_ratio,
            "xp_earned": xp_earned,
            "cached": False,
        },
        message="Document summarised successfully.",
    )


@summarize_bp.route("/text", methods=["POST"])
@jwt_required()
def summarize_text():
    """
    Summarise arbitrary text provided in the request body — no DB save.

    Body: {text: str, num_bullets: int (optional, default 8)}
    Returns: {summary_bullets, word_count, original_word_count, compression_ratio}
    """
    user_id = get_jwt_identity()
    body = request.get_json(silent=True) or {}
    text = (body.get("text") or "").strip()

    if not text:
        return _err("text is required.", 400)
    if len(text) < 50:
        return _err("Text is too short to summarise (minimum 50 characters).", 400)

    try:
        num_bullets = max(3, min(20, int(body.get("num_bullets", 8))))
    except (TypeError, ValueError):
        num_bullets = 8

    try:
        bullets = _ai.summarize(text, num_bullets=num_bullets)
    except Exception as exc:
        logger.exception("summarize_text AI error: %s", exc)
        return _err("Summarisation failed. Please try again.", 500)

    summary_text = " ".join(bullets)
    original_word_count = _pdf.count_words(text)
    summary_word_count = _pdf.count_words(summary_text)

    return _ok(
        data={
            "summary_bullets": bullets,
            "word_count": summary_word_count,
            "original_word_count": original_word_count,
            "compression_ratio": round(summary_word_count / max(original_word_count, 1), 4),
        },
        message="Text summarised successfully.",
    )
