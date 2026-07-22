"""
routes/flashcards.py — Flashcard management with spaced-repetition review.

Blueprint: 'flashcards'  Prefix: /api/flashcards

Endpoints:
  POST  /generate/<doc_id> — Generate flashcards from a document via AI.
  GET   /                  — List user's flashcards (filter by doc optional).
  GET   /due               — Return cards due for review today.
  POST  /                  — Create a manual flashcard.
  PUT   /<card_id>         — Update a flashcard.
  DELETE /<card_id>        — Delete a flashcard.
  POST  /<card_id>/review  — Record a review result and update SR schedule.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from models import db, Document, Flashcard, StudySession, User

logger = logging.getLogger(__name__)
flashcards_bp = Blueprint("flashcards", __name__)

# Spaced-repetition intervals in days, keyed by resulting mastery level
SR_INTERVALS: dict = {0: 1, 1: 3, 2: 7, 3: 14, 4: 30, 5: 60}

# ── Helpers ────────────────────────────────────────────────────────────────────

def _ok(data=None, message: str = "Success", status: int = 200):
    return jsonify({"success": True, "message": message, "data": data}), status


def _err(message: str, status: int = 400, data=None):
    return jsonify({"success": False, "message": message, "data": data}), status


def _award_xp(user: User, points: int) -> None:
    user.xp_points = (user.xp_points or 0) + points
    user.level = user.compute_level()


def _next_review(mastery_level: int) -> datetime:
    """Calculate the next review datetime based on mastery level."""
    days = SR_INTERVALS.get(min(mastery_level, 5), 1)
    return datetime.utcnow() + timedelta(days=days)


# ══════════════════════════════════════════════════════════════════════════════
# Routes
# ══════════════════════════════════════════════════════════════════════════════

@flashcards_bp.route("/generate/<doc_id>", methods=["POST"])
@jwt_required()
def generate_flashcards(doc_id: str):
    """
    Generate AI flashcards from a document and persist them.

    Body (optional): {num_cards: int (default 10)}
    Returns: list of Flashcard dicts, xp_earned.
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
        num_cards = max(3, min(30, int(body.get("num_cards", 10))))
    except (TypeError, ValueError):
        num_cards = 10

    # Lazy import to avoid circular
    from services.ai_service import AIService
    ai = AIService()

    try:
        raw_cards = ai.generate_flashcards(doc.content, num_cards=num_cards)
    except Exception as exc:
        logger.exception("generate_flashcards AI error: %s", exc)
        return _err("Failed to generate flashcards. Please try again.", 500)

    if not raw_cards:
        return _err("Could not extract enough content to generate flashcards.", 422)

    xp_earned = 20

    try:
        saved_cards = []
        for raw in raw_cards:
            card = Flashcard(
                user_id=user_id,
                document_id=doc_id,
                front=raw.get("front", ""),
                back=raw.get("back", ""),
                hint=raw.get("hint") or None,
                mastery_level=0,
            )
            db.session.add(card)
            saved_cards.append(card)

        session = StudySession(
            user_id=user_id,
            document_id=doc_id,
            activity_type="flashcard",
            duration_seconds=0,
            xp_earned=xp_earned,
            started_at=datetime.utcnow(),
            ended_at=datetime.utcnow(),
        )
        db.session.add(session)
        _award_xp(user, xp_earned)
        user.last_active = datetime.utcnow()
        db.session.commit()

        return _ok(
            data={
                "flashcards": [c.to_dict() for c in saved_cards],
                "count": len(saved_cards),
                "xp_earned": xp_earned,
            },
            message=f"{len(saved_cards)} flashcards generated.",
            status=201,
        )
    except Exception as exc:
        db.session.rollback()
        logger.exception("generate_flashcards persist error: %s", exc)
        return _err("Failed to save generated flashcards.", 500)


@flashcards_bp.route("/", methods=["GET"])
@jwt_required()
def list_flashcards():
    """
    List user's flashcards, optionally filtered by document.

    Query params: doc_id (optional), page, per_page
    """
    user_id = get_jwt_identity()
    doc_id: Optional[str] = request.args.get("doc_id")

    try:
        page = max(1, int(request.args.get("page", 1)))
        per_page = min(200, max(1, int(request.args.get("per_page", 50))))
    except ValueError:
        page, per_page = 1, 50

    try:
        query = Flashcard.query.filter_by(user_id=user_id)
        if doc_id:
            query = query.filter_by(document_id=doc_id)
        pagination = (
            query.order_by(Flashcard.created_at.desc())
            .paginate(page=page, per_page=per_page, error_out=False)
        )
        return _ok(
            data={
                "items": [c.to_dict() for c in pagination.items],
                "page": pagination.page,
                "per_page": per_page,
                "total": pagination.total,
                "pages": pagination.pages,
            }
        )
    except Exception as exc:
        logger.exception("list_flashcards error: %s", exc)
        return _err("Failed to retrieve flashcards.", 500)


@flashcards_bp.route("/due", methods=["GET"])
@jwt_required()
def due_flashcards():
    """
    Return flashcards due for review: next_review <= now OR never reviewed.
    """
    user_id = get_jwt_identity()
    now = datetime.utcnow()
    try:
        cards = (
            Flashcard.query.filter(
                Flashcard.user_id == user_id,
                db.or_(
                    Flashcard.next_review == None,  # noqa: E711
                    Flashcard.next_review <= now,
                ),
            )
            .order_by(Flashcard.next_review.asc().nullsfirst())
            .limit(100)
            .all()
        )
        return _ok(
            data={"items": [c.to_dict() for c in cards], "count": len(cards)}
        )
    except Exception as exc:
        logger.exception("due_flashcards error: %s", exc)
        return _err("Failed to retrieve due flashcards.", 500)


@flashcards_bp.route("/", methods=["POST"])
@jwt_required()
def create_flashcard():
    """
    Manually create a flashcard.

    Body: {front, back, hint (optional), document_id (optional)}
    """
    user_id = get_jwt_identity()
    body = request.get_json(silent=True) or {}

    front = (body.get("front") or "").strip()
    back = (body.get("back") or "").strip()
    hint = (body.get("hint") or "").strip() or None
    doc_id = (body.get("document_id") or "").strip() or None

    if not front:
        return _err("front is required.", 400)
    if not back:
        return _err("back is required.", 400)

    # Validate document ownership if provided
    if doc_id:
        doc = Document.query.filter_by(id=doc_id, user_id=user_id).first()
        if not doc:
            return _err("Document not found.", 404)

    try:
        card = Flashcard(
            user_id=user_id,
            document_id=doc_id,
            front=front,
            back=back,
            hint=hint,
        )
        db.session.add(card)
        db.session.commit()
        return _ok(data={"flashcard": card.to_dict()}, message="Flashcard created.", status=201)
    except Exception as exc:
        db.session.rollback()
        logger.exception("create_flashcard error: %s", exc)
        return _err("Failed to create flashcard.", 500)


@flashcards_bp.route("/<card_id>", methods=["PUT"])
@jwt_required()
def update_flashcard(card_id: str):
    """
    Update a flashcard's front, back, or hint.

    Body: {front?, back?, hint?}
    """
    user_id = get_jwt_identity()
    card = Flashcard.query.filter_by(id=card_id, user_id=user_id).first()
    if not card:
        return _err("Flashcard not found.", 404)

    body = request.get_json(silent=True) or {}

    if "front" in body:
        front = (body["front"] or "").strip()
        if not front:
            return _err("front cannot be empty.", 400)
        card.front = front

    if "back" in body:
        back = (body["back"] or "").strip()
        if not back:
            return _err("back cannot be empty.", 400)
        card.back = back

    if "hint" in body:
        card.hint = (body["hint"] or "").strip() or None

    try:
        db.session.commit()
        return _ok(data={"flashcard": card.to_dict()}, message="Flashcard updated.")
    except Exception as exc:
        db.session.rollback()
        logger.exception("update_flashcard error: %s", exc)
        return _err("Failed to update flashcard.", 500)


@flashcards_bp.route("/<card_id>", methods=["DELETE"])
@jwt_required()
def delete_flashcard(card_id: str):
    """Delete a flashcard."""
    user_id = get_jwt_identity()
    card = Flashcard.query.filter_by(id=card_id, user_id=user_id).first()
    if not card:
        return _err("Flashcard not found.", 404)

    try:
        db.session.delete(card)
        db.session.commit()
        return _ok(message="Flashcard deleted.")
    except Exception as exc:
        db.session.rollback()
        logger.exception("delete_flashcard error: %s", exc)
        return _err("Failed to delete flashcard.", 500)


@flashcards_bp.route("/<card_id>/review", methods=["POST"])
@jwt_required()
def review_flashcard(card_id: str):
    """
    Record a flashcard review result and update the spaced-repetition schedule.

    Body: {correct: bool}

    Mastery progression:
      Correct  → mastery_level += 1 (max 5)
      Incorrect → mastery_level  = max(0, mastery_level - 1)

    Intervals by mastery level after update:
      0→1d, 1→3d, 2→7d, 3→14d, 4→30d, 5→60d

    Awards XP +2 for each correct review.
    """
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return _err("User not found.", 404)

    card = Flashcard.query.filter_by(id=card_id, user_id=user_id).first()
    if not card:
        return _err("Flashcard not found.", 404)

    body = request.get_json(silent=True) or {}
    correct = bool(body.get("correct", False))

    # Update mastery level
    if correct:
        card.mastery_level = min(5, card.mastery_level + 1)
        card.times_correct += 1
        xp_earned = 2
    else:
        card.mastery_level = max(0, card.mastery_level - 1)
        xp_earned = 0

    card.times_reviewed += 1
    card.last_reviewed = datetime.utcnow()
    card.next_review = _next_review(card.mastery_level)

    try:
        if xp_earned > 0:
            _award_xp(user, xp_earned)
        user.last_active = datetime.utcnow()
        db.session.commit()
        return _ok(
            data={
                "flashcard": card.to_dict(),
                "xp_earned": xp_earned,
                "correct": correct,
            },
            message="Review recorded.",
        )
    except Exception as exc:
        db.session.rollback()
        logger.exception("review_flashcard error: %s", exc)
        return _err("Failed to record review.", 500)
