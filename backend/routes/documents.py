"""
routes/documents.py — Document upload, retrieval, and management endpoints.

Blueprint: 'documents'  Prefix: /api/documents

Endpoints:
  POST  /upload      — Upload a PDF/TXT file or paste plain text.
  GET   /            — List user's documents (lightweight).
  GET   /<doc_id>    — Retrieve full document.
  DELETE /<doc_id>   — Delete document and all related data.
  GET   /search      — Full-text search across user's documents.
"""

import os
import logging
import uuid
from datetime import datetime

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename

from models import db, Document, Flashcard, QuizResult, StudySession, QAHistory, ActiveQuiz, User
from services.pdf_service import PdfService
from services.ai_service import AIService

logger = logging.getLogger(__name__)
documents_bp = Blueprint("documents", __name__)

_pdf_svc = PdfService()

ALLOWED_EXTENSIONS = {"pdf", "txt"}

# ── Helpers ────────────────────────────────────────────────────────────────────

def _ok(data=None, message: str = "Success", status: int = 200):
    return jsonify({"success": True, "message": message, "data": data}), status


def _err(message: str, status: int = 400, data=None):
    return jsonify({"success": False, "message": message, "data": data}), status


def _allowed_file(filename: str) -> bool:
    return (
        "." in filename
        and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS
    )


def _upload_folder() -> str:
    folder = current_app.config.get("UPLOAD_FOLDER", "uploads")
    os.makedirs(folder, exist_ok=True)
    return folder


def _award_xp(user: User, points: int) -> None:
    """Add *points* XP to *user* and recompute level."""
    user.xp_points = (user.xp_points or 0) + points
    user.level = user.compute_level()


# ══════════════════════════════════════════════════════════════════════════════
# Routes
# ══════════════════════════════════════════════════════════════════════════════

@documents_bp.route("/upload", methods=["POST"])
@jwt_required()
def upload_document():
    """
    Upload a study document via multipart/form-data (PDF or TXT)
    or as JSON {title, content} for pasted text.

    Returns the saved Document dict.
    """
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return _err("User not found.", 404)

    # ── Mode 1: file upload ────────────────────────────────────────────────────
    if request.files.get("file"):
        file = request.files["file"]
        if file.filename == "":
            return _err("No file selected.", 400)
        if not _allowed_file(file.filename):
            return _err("Only PDF and TXT files are allowed.", 400)

        original_filename = secure_filename(file.filename)
        ext = original_filename.rsplit(".", 1)[1].lower()
        unique_name = f"{uuid.uuid4().hex}_{original_filename}"
        save_path = os.path.join(_upload_folder(), unique_name)

        try:
            file.save(save_path)
        except Exception as exc:
            logger.error("File save failed: %s", exc)
            return _err("Failed to save uploaded file.", 500)

        try:
            extracted = _pdf_svc.extract_from_file(save_path, ext)
        except Exception as exc:
            logger.error("Text extraction failed: %s", exc)
            return _err(f"Failed to extract text from file: {exc}", 422)

        title = (request.form.get("title") or "").strip() or original_filename
        file_type = ext
        content = extracted["content"]
        word_count = extracted["word_count"]
        char_count = extracted["char_count"]
        original_file = original_filename

    # ── Mode 2: JSON paste ─────────────────────────────────────────────────────
    elif request.is_json:
        body = request.get_json(silent=True) or {}
        title = (body.get("title") or "").strip()
        content = (body.get("content") or "").strip()

        if not title:
            return _err("title is required for pasted content.", 400)
        if not content:
            return _err("content is required for pasted content.", 400)

        content = _pdf_svc.clean_text(content)
        file_type = "paste"
        word_count = _pdf_svc.count_words(content)
        char_count = len(content)
        original_file = None

    else:
        return _err(
            "Send a multipart/form-data request with a 'file' field, "
            "or a JSON body with 'title' and 'content'.",
            400,
        )

    # ── Persist ────────────────────────────────────────────────────────────────
    try:
        doc = Document(
            user_id=user_id,
            title=title,
            original_filename=original_file,
            file_type=file_type,
            content=content,
            word_count=word_count,
            char_count=char_count,
            tags=[],
        )
        db.session.add(doc)

        # XP + study session for upload
        _award_xp(user, 10)
        session = StudySession(
            user_id=user_id,
            document_id=None,  # will update after commit
            activity_type="upload",
            duration_seconds=0,
            xp_earned=10,
            started_at=datetime.utcnow(),
            ended_at=datetime.utcnow(),
        )
        db.session.add(session)
        db.session.commit()

        # Backfill session document_id now that doc.id exists
        session.document_id = doc.id
        db.session.commit()

        return _ok(
            data={"document": doc.to_dict(), "xp_earned": 10},
            message="Document uploaded successfully.",
            status=201,
        )
    except Exception as exc:
        db.session.rollback()
        logger.exception("upload_document persist error: %s", exc)
        return _err("Failed to save document.", 500)


@documents_bp.route("/", methods=["GET"])
@jwt_required()
def list_documents():
    """
    Return a lightweight list of the user's documents.

    Query params: page (default 1), per_page (default 20)
    """
    user_id = get_jwt_identity()

    try:
        page = max(1, int(request.args.get("page", 1)))
        per_page = min(100, max(1, int(request.args.get("per_page", 20))))
    except ValueError:
        page, per_page = 1, 20

    try:
        pagination = (
            Document.query.filter_by(user_id=user_id)
            .order_by(Document.created_at.desc())
            .paginate(page=page, per_page=per_page, error_out=False)
        )
        items = [
            {
                "id": doc.id,
                "title": doc.title,
                "file_type": doc.file_type,
                "word_count": doc.word_count,
                "char_count": doc.char_count,
                "has_summary": doc.summary_bullets is not None,
                "tags": doc.tags or [],
                "created_at": doc.created_at.isoformat(),
                "updated_at": doc.updated_at.isoformat(),
            }
            for doc in pagination.items
        ]
        return _ok(
            data={
                "items": items,
                "page": pagination.page,
                "per_page": per_page,
                "total": pagination.total,
                "pages": pagination.pages,
            }
        )
    except Exception as exc:
        logger.exception("list_documents error: %s", exc)
        return _err("Failed to retrieve documents.", 500)


@documents_bp.route("/<doc_id>", methods=["GET"])
@jwt_required()
def get_document(doc_id: str):
    """Return full document including content."""
    user_id = get_jwt_identity()
    doc = Document.query.filter_by(id=doc_id, user_id=user_id).first()
    if not doc:
        return _err("Document not found.", 404)
    return _ok(data={"document": doc.to_dict(include_content=True)})


@documents_bp.route("/<doc_id>", methods=["DELETE"])
@jwt_required()
def delete_document(doc_id: str):
    """
    Delete a document and cascade-delete its flashcards, quiz results,
    QA history, active quizzes, and study sessions.
    """
    user_id = get_jwt_identity()
    doc = Document.query.filter_by(id=doc_id, user_id=user_id).first()
    if not doc:
        return _err("Document not found.", 404)

    try:
        db.session.delete(doc)
        db.session.commit()
        return _ok(message="Document deleted successfully.")
    except Exception as exc:
        db.session.rollback()
        logger.exception("delete_document error: %s", exc)
        return _err("Failed to delete document.", 500)


@documents_bp.route("/search", methods=["GET"])
@jwt_required()
def search_documents():
    """
    Full-text search across user's documents.

    Query param: q — search query string
    Returns matching documents (lightweight, no content).
    """
    user_id = get_jwt_identity()
    query_str = (request.args.get("q") or "").strip()

    if not query_str:
        return _err("Query parameter 'q' is required.", 400)

    try:
        # SQLite LIKE search across title and content
        pattern = f"%{query_str}%"
        docs = (
            Document.query.filter(
                Document.user_id == user_id,
                db.or_(
                    Document.title.ilike(pattern),
                    Document.content.ilike(pattern),
                ),
            )
            .order_by(Document.created_at.desc())
            .limit(50)
            .all()
        )
        items = [
            {
                "id": doc.id,
                "title": doc.title,
                "file_type": doc.file_type,
                "word_count": doc.word_count,
                "has_summary": doc.summary_bullets is not None,
                "created_at": doc.created_at.isoformat(),
                # Include a short snippet around the match
                "snippet": _get_snippet(doc.content, query_str),
            }
            for doc in docs
        ]
        return _ok(
            data={"items": items, "total": len(items), "query": query_str}
        )
    except Exception as exc:
        logger.exception("search_documents error: %s", exc)
        return _err("Search failed.", 500)


def _get_snippet(content: str, query: str, window: int = 150) -> str:
    """Return a short snippet of *content* around the first occurrence of *query*."""
    try:
        idx = content.lower().find(query.lower())
        if idx == -1:
            return content[:window]
        start = max(0, idx - window // 2)
        end = min(len(content), idx + window // 2)
        snippet = content[start:end]
        if start > 0:
            snippet = "…" + snippet
        if end < len(content):
            snippet = snippet + "…"
        return snippet
    except Exception:
        return content[:window]
