"""
routes/qa.py — Question-and-answer endpoints against study documents.

Blueprint: 'qa'  Prefix: /api/qa

Endpoints:
  POST  /ask              — Ask a question against a document.
  GET   /history/<doc_id> — Retrieve past Q&A for a document.
"""

import logging
from datetime import datetime

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from models import db, Document, QAHistory, StudySession, User
from services.ai_service import AIService

logger = logging.getLogger(__name__)
qa_bp = Blueprint("qa", __name__)
_ai = AIService()

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

@qa_bp.route("/ask", methods=["POST"])
@jwt_required()
def ask_question():
    """
    Ask a question against a document's content using the AI service.

    Body: {document_id: str, question: str}
    Returns: {answer, confidence, source_passage, xp_earned}
    """
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return _err("User not found.", 404)

    body = request.get_json(silent=True) or {}
    doc_id = (body.get("document_id") or "").strip()
    question = (body.get("question") or "").strip()

    if not doc_id:
        return _err("document_id is required.", 400)
    if not question:
        return _err("question is required.", 400)
    if len(question) < 3:
        return _err("Question is too short.", 400)

    doc = Document.query.filter_by(id=doc_id, user_id=user_id).first()
    if not doc:
        return _err("Document not found.", 404)

    try:
        result = _ai.answer_question(question, doc.content)
    except Exception as exc:
        logger.exception("AI answer_question failed: %s", exc)
        return _err("Failed to process question. Please try again.", 500)

    xp_earned = 5

    try:
        # Persist Q&A record
        qa_entry = QAHistory(
            user_id=user_id,
            document_id=doc_id,
            question=question,
            answer=result.get("answer", ""),
            confidence=result.get("confidence", 0.0),
            source_passage=result.get("source_passage", ""),
        )
        db.session.add(qa_entry)

        # Study session
        session = StudySession(
            user_id=user_id,
            document_id=doc_id,
            activity_type="qa",
            duration_seconds=0,
            xp_earned=xp_earned,
            started_at=datetime.utcnow(),
            ended_at=datetime.utcnow(),
        )
        db.session.add(session)

        # Award XP
        _award_xp(user, xp_earned)
        user.last_active = datetime.utcnow()
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        logger.exception("ask_question persist error: %s", exc)
        # Return the answer even if persistence fails
        return _ok(
            data={
                "answer": result.get("answer", ""),
                "confidence": result.get("confidence", 0.0),
                "source_passage": result.get("source_passage", ""),
                "xp_earned": 0,
            },
            message="Answer generated (session not saved).",
        )

    return _ok(
        data={
            "answer": result.get("answer", ""),
            "confidence": result.get("confidence", 0.0),
            "source_passage": result.get("source_passage", ""),
            "xp_earned": xp_earned,
            "qa_id": qa_entry.id,
        },
        message="Question answered.",
    )


@qa_bp.route("/history/<doc_id>", methods=["GET"])
@jwt_required()
def qa_history(doc_id: str):
    """
    Return past Q&A entries for *doc_id* belonging to the authenticated user.

    Query params: page (default 1), per_page (default 20)
    """
    user_id = get_jwt_identity()

    doc = Document.query.filter_by(id=doc_id, user_id=user_id).first()
    if not doc:
        return _err("Document not found.", 404)

    try:
        page = max(1, int(request.args.get("page", 1)))
        per_page = min(100, max(1, int(request.args.get("per_page", 20))))
    except ValueError:
        page, per_page = 1, 20

    try:
        pagination = (
            QAHistory.query.filter_by(user_id=user_id, document_id=doc_id)
            .order_by(QAHistory.created_at.desc())
            .paginate(page=page, per_page=per_page, error_out=False)
        )
        return _ok(
            data={
                "items": [h.to_dict() for h in pagination.items],
                "page": pagination.page,
                "per_page": per_page,
                "total": pagination.total,
                "pages": pagination.pages,
                "document_title": doc.title,
            }
        )
    except Exception as exc:
        logger.exception("qa_history error: %s", exc)
        return _err("Failed to retrieve Q&A history.", 500)
