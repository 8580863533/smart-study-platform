"""
models.py — SQLAlchemy ORM models for AI Study Tutor.

Models:
  User            — Registered users with XP / level / streak tracking.
  LoginHistory    — Per-session login audit log with geo + device info.
  Document        — Uploaded or pasted study material.
  Flashcard       — Spaced-repetition flashcards linked to documents.
  QuizResult      — Scored quiz attempts with per-question breakdown.
  StudySession    — Timed activity sessions for progress tracking.
  QAHistory       — Per-document question-answer records.
  ActiveQuiz      — Temporary in-flight quiz (expires after 30 min).
"""

import uuid
from datetime import datetime

import bcrypt
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


# ── Helpers ────────────────────────────────────────────────────────────────────

def _uuid() -> str:
    """Generate a new UUID4 string primary key."""
    return str(uuid.uuid4())


def _now() -> datetime:
    """Return current UTC datetime."""
    return datetime.utcnow()


# ══════════════════════════════════════════════════════════════════════════════
# User
# ══════════════════════════════════════════════════════════════════════════════

class User(db.Model):
    """Registered user with XP, level, and streak tracking."""

    __tablename__ = "users"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    avatar_url = db.Column(db.String(500), nullable=True)
    bio = db.Column(db.Text, nullable=True)

    # Gamification
    xp_points = db.Column(db.Integer, default=0, nullable=False)
    level = db.Column(db.Integer, default=1, nullable=False)
    streak_days = db.Column(db.Integer, default=0, nullable=False)
    last_active = db.Column(db.DateTime, nullable=True)

    # Study time (seconds)
    total_study_time = db.Column(db.Integer, default=0, nullable=False)

    created_at = db.Column(db.DateTime, default=_now, nullable=False)
    updated_at = db.Column(db.DateTime, default=_now, onupdate=_now, nullable=False)

    # ── Relationships ──────────────────────────────────────────────────────────
    login_history = db.relationship(
        "LoginHistory", backref="user", lazy="dynamic", cascade="all, delete-orphan"
    )
    documents = db.relationship(
        "Document", backref="user", lazy="dynamic", cascade="all, delete-orphan"
    )
    flashcards = db.relationship(
        "Flashcard", backref="user", lazy="dynamic", cascade="all, delete-orphan"
    )
    quiz_results = db.relationship(
        "QuizResult", backref="user", lazy="dynamic", cascade="all, delete-orphan"
    )
    study_sessions = db.relationship(
        "StudySession", backref="user", lazy="dynamic", cascade="all, delete-orphan"
    )
    qa_history = db.relationship(
        "QAHistory", backref="user", lazy="dynamic", cascade="all, delete-orphan"
    )
    active_quizzes = db.relationship(
        "ActiveQuiz", backref="user", lazy="dynamic", cascade="all, delete-orphan"
    )

    # ── Methods ────────────────────────────────────────────────────────────────

    def set_password(self, password: str) -> None:
        """Hash *password* using bcrypt and store the result."""
        self.password_hash = bcrypt.hashpw(
            password.encode("utf-8"), bcrypt.gensalt()
        ).decode("utf-8")

    def check_password(self, password: str) -> bool:
        """Return True if *password* matches the stored hash."""
        try:
            return bcrypt.checkpw(
                password.encode("utf-8"), self.password_hash.encode("utf-8")
            )
        except Exception:
            return False

    def compute_level(self) -> int:
        """Level = floor(xp / 100) + 1, capped at 100."""
        return min(100, (self.xp_points // 100) + 1)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "email": self.email,
            "name": self.name,
            "avatar_url": self.avatar_url,
            "bio": self.bio,
            "xp_points": self.xp_points,
            "level": self.level,
            "streak_days": self.streak_days,
            "last_active": self.last_active.isoformat() if self.last_active else None,
            "total_study_time": self.total_study_time,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }

    def __repr__(self) -> str:
        return f"<User {self.email}>"


# ══════════════════════════════════════════════════════════════════════════════
# LoginHistory
# ══════════════════════════════════════════════════════════════════════════════

class LoginHistory(db.Model):
    """Audit record for each login attempt (successful or failed)."""

    __tablename__ = "login_history"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    user_id = db.Column(
        db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Network / geo
    ip_address = db.Column(db.String(45), nullable=True)
    city = db.Column(db.String(120), nullable=True)
    country = db.Column(db.String(120), nullable=True)

    # Device / browser
    user_agent = db.Column(db.Text, nullable=True)
    browser = db.Column(db.String(80), nullable=True)
    os_name = db.Column(db.String(80), nullable=True)
    device_type = db.Column(
        db.String(20), nullable=True
    )  # 'desktop' | 'mobile' | 'tablet'

    # Outcome
    is_successful = db.Column(db.Boolean, default=True, nullable=False)
    failure_reason = db.Column(db.String(200), nullable=True)

    # Session timing
    session_duration = db.Column(db.Integer, nullable=True)  # seconds
    logged_in_at = db.Column(db.DateTime, default=_now, nullable=False)
    logged_out_at = db.Column(db.DateTime, nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "ip_address": self.ip_address,
            "city": self.city,
            "country": self.country,
            "user_agent": self.user_agent,
            "browser": self.browser,
            "os_name": self.os_name,
            "device_type": self.device_type,
            "is_successful": self.is_successful,
            "failure_reason": self.failure_reason,
            "session_duration": self.session_duration,
            "logged_in_at": self.logged_in_at.isoformat(),
            "logged_out_at": self.logged_out_at.isoformat() if self.logged_out_at else None,
        }

    def __repr__(self) -> str:
        return f"<LoginHistory user={self.user_id} at={self.logged_in_at}>"


# ══════════════════════════════════════════════════════════════════════════════
# Document
# ══════════════════════════════════════════════════════════════════════════════

class Document(db.Model):
    """Study material uploaded by a user (PDF, TXT, or pasted text)."""

    __tablename__ = "documents"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    user_id = db.Column(
        db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    title = db.Column(db.String(255), nullable=False)
    original_filename = db.Column(db.String(255), nullable=True)
    file_type = db.Column(db.String(10), nullable=False)  # 'txt' | 'pdf' | 'paste'

    content = db.Column(db.Text, nullable=False)
    word_count = db.Column(db.Integer, default=0)
    char_count = db.Column(db.Integer, default=0)

    # AI-generated artefacts (cached)
    summary = db.Column(db.Text, nullable=True)
    summary_bullets = db.Column(db.JSON, nullable=True)  # list[str]

    tags = db.Column(db.JSON, default=list)

    created_at = db.Column(db.DateTime, default=_now, nullable=False)
    updated_at = db.Column(db.DateTime, default=_now, onupdate=_now, nullable=False)

    # ── Relationships ──────────────────────────────────────────────────────────
    flashcards = db.relationship(
        "Flashcard", backref="document", lazy="dynamic", cascade="all, delete-orphan"
    )
    quiz_results = db.relationship(
        "QuizResult", backref="document", lazy="dynamic", cascade="all, delete-orphan"
    )
    study_sessions = db.relationship(
        "StudySession", backref="document", lazy="dynamic", cascade="all, delete-orphan"
    )
    qa_history = db.relationship(
        "QAHistory", backref="document", lazy="dynamic", cascade="all, delete-orphan"
    )
    active_quizzes = db.relationship(
        "ActiveQuiz", backref="document", lazy="dynamic", cascade="all, delete-orphan"
    )

    def to_dict(self, include_content: bool = True) -> dict:
        data = {
            "id": self.id,
            "user_id": self.user_id,
            "title": self.title,
            "original_filename": self.original_filename,
            "file_type": self.file_type,
            "word_count": self.word_count,
            "char_count": self.char_count,
            "has_summary": self.summary_bullets is not None,
            "summary_bullets": self.summary_bullets,
            "tags": self.tags or [],
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }
        if include_content:
            data["content"] = self.content
        return data

    def __repr__(self) -> str:
        return f"<Document {self.title!r}>"


# ══════════════════════════════════════════════════════════════════════════════
# Flashcard
# ══════════════════════════════════════════════════════════════════════════════

class Flashcard(db.Model):
    """Spaced-repetition flashcard."""

    __tablename__ = "flashcards"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    user_id = db.Column(
        db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    document_id = db.Column(
        db.String(36), db.ForeignKey("documents.id", ondelete="CASCADE"), nullable=True
    )

    front = db.Column(db.Text, nullable=False)
    back = db.Column(db.Text, nullable=False)
    hint = db.Column(db.String(500), nullable=True)

    # Spaced repetition
    mastery_level = db.Column(db.Integer, default=0, nullable=False)  # 0-5
    times_reviewed = db.Column(db.Integer, default=0, nullable=False)
    times_correct = db.Column(db.Integer, default=0, nullable=False)
    last_reviewed = db.Column(db.DateTime, nullable=True)
    next_review = db.Column(db.DateTime, nullable=True)

    created_at = db.Column(db.DateTime, default=_now, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "document_id": self.document_id,
            "front": self.front,
            "back": self.back,
            "hint": self.hint,
            "mastery_level": self.mastery_level,
            "times_reviewed": self.times_reviewed,
            "times_correct": self.times_correct,
            "last_reviewed": self.last_reviewed.isoformat() if self.last_reviewed else None,
            "next_review": self.next_review.isoformat() if self.next_review else None,
            "created_at": self.created_at.isoformat(),
        }

    def __repr__(self) -> str:
        return f"<Flashcard {self.id} mastery={self.mastery_level}>"


# ══════════════════════════════════════════════════════════════════════════════
# QuizResult
# ══════════════════════════════════════════════════════════════════════════════

class QuizResult(db.Model):
    """Scored quiz attempt."""

    __tablename__ = "quiz_results"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    user_id = db.Column(
        db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    document_id = db.Column(
        db.String(36), db.ForeignKey("documents.id", ondelete="CASCADE"), nullable=True
    )

    score = db.Column(db.Integer, nullable=False)
    total_questions = db.Column(db.Integer, nullable=False)
    percentage = db.Column(db.Float, nullable=False)
    time_taken_seconds = db.Column(db.Integer, default=0)

    # JSON: list of {question, options, correct_answer, user_answer, is_correct, explanation}
    questions_data = db.Column(db.JSON, nullable=False, default=list)

    created_at = db.Column(db.DateTime, default=_now, nullable=False)

    def to_dict(self, include_questions: bool = True) -> dict:
        data = {
            "id": self.id,
            "user_id": self.user_id,
            "document_id": self.document_id,
            "score": self.score,
            "total_questions": self.total_questions,
            "percentage": self.percentage,
            "time_taken_seconds": self.time_taken_seconds,
            "created_at": self.created_at.isoformat(),
        }
        if include_questions:
            data["questions_data"] = self.questions_data
        return data

    def __repr__(self) -> str:
        return f"<QuizResult {self.score}/{self.total_questions}>"


# ══════════════════════════════════════════════════════════════════════════════
# StudySession
# ══════════════════════════════════════════════════════════════════════════════

class StudySession(db.Model):
    """Timed study activity session."""

    __tablename__ = "study_sessions"

    ACTIVITY_TYPES = ("qa", "summarize", "flashcard", "quiz", "upload")

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    user_id = db.Column(
        db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    document_id = db.Column(
        db.String(36), db.ForeignKey("documents.id", ondelete="SET NULL"), nullable=True
    )

    activity_type = db.Column(db.String(20), nullable=False)
    duration_seconds = db.Column(db.Integer, default=0, nullable=False)
    xp_earned = db.Column(db.Integer, default=0, nullable=False)

    started_at = db.Column(db.DateTime, default=_now, nullable=False)
    ended_at = db.Column(db.DateTime, nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "document_id": self.document_id,
            "activity_type": self.activity_type,
            "duration_seconds": self.duration_seconds,
            "xp_earned": self.xp_earned,
            "started_at": self.started_at.isoformat(),
            "ended_at": self.ended_at.isoformat() if self.ended_at else None,
        }

    def __repr__(self) -> str:
        return f"<StudySession {self.activity_type} {self.duration_seconds}s>"


# ══════════════════════════════════════════════════════════════════════════════
# QAHistory
# ══════════════════════════════════════════════════════════════════════════════

class QAHistory(db.Model):
    """Record of a question asked against a document."""

    __tablename__ = "qa_history"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    user_id = db.Column(
        db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    document_id = db.Column(
        db.String(36), db.ForeignKey("documents.id", ondelete="SET NULL"), nullable=True
    )

    question = db.Column(db.Text, nullable=False)
    answer = db.Column(db.Text, nullable=False)
    confidence = db.Column(db.Float, default=0.0)
    source_passage = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, default=_now, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "document_id": self.document_id,
            "question": self.question,
            "answer": self.answer,
            "confidence": self.confidence,
            "source_passage": self.source_passage,
            "created_at": self.created_at.isoformat(),
        }

    def __repr__(self) -> str:
        return f"<QAHistory q={self.question[:30]!r}>"


# ══════════════════════════════════════════════════════════════════════════════
# ActiveQuiz
# ══════════════════════════════════════════════════════════════════════════════

class ActiveQuiz(db.Model):
    """In-flight quiz waiting to be submitted (expires after 30 minutes)."""

    __tablename__ = "active_quizzes"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    user_id = db.Column(
        db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    document_id = db.Column(
        db.String(36), db.ForeignKey("documents.id", ondelete="SET NULL"), nullable=True
    )

    # Full question list stored as JSON
    questions = db.Column(db.JSON, nullable=False, default=list)

    created_at = db.Column(db.DateTime, default=_now, nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)

    def is_expired(self) -> bool:
        return datetime.utcnow() > self.expires_at

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "document_id": self.document_id,
            "questions": self.questions,
            "created_at": self.created_at.isoformat(),
            "expires_at": self.expires_at.isoformat(),
        }

    def __repr__(self) -> str:
        return f"<ActiveQuiz {self.id} expires={self.expires_at}>"


# ══════════════════════════════════════════════════════════════════════════════
# VoiceRoom & VoiceRoomParticipant & VoiceRoomMessage
# ══════════════════════════════════════════════════════════════════════════════

class VoiceRoom(db.Model):
    """Collaborative Voice Room (max 6 participants)."""

    __tablename__ = "voice_rooms"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    room_code = db.Column(db.String(10), unique=True, nullable=False, index=True)
    title = db.Column(db.String(150), nullable=False)
    host_id = db.Column(
        db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    document_id = db.Column(
        db.String(36), db.ForeignKey("documents.id", ondelete="SET NULL"), nullable=True
    )
    max_participants = db.Column(db.Integer, default=6, nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=_now, nullable=False)
    updated_at = db.Column(db.DateTime, default=_now, onupdate=_now, nullable=False)

    participants = db.relationship("VoiceRoomParticipant", backref="room", cascade="all, delete-orphan")
    messages = db.relationship("VoiceRoomMessage", backref="room", cascade="all, delete-orphan")

    def to_dict(self, include_participants=True) -> dict:
        user_host = User.query.get(self.host_id)
        doc = Document.query.get(self.document_id) if self.document_id else None
        active_parts = [p for p in self.participants if p.is_active]
        return {
            "id": self.id,
            "room_code": self.room_code,
            "title": self.title,
            "host_id": self.host_id,
            "host_name": user_host.name if user_host else "Unknown",
            "document_id": self.document_id,
            "document_title": doc.title if doc else None,
            "max_participants": self.max_participants,
            "current_participants": len(active_parts),
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat(),
            "participants": [p.to_dict() for p in active_parts] if include_participants else []
        }

    def __repr__(self) -> str:
        return f"<VoiceRoom {self.room_code} title={self.title!r}>"


class VoiceRoomParticipant(db.Model):
    """Participant in a Voice Room."""

    __tablename__ = "voice_room_participants"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    room_id = db.Column(
        db.String(36), db.ForeignKey("voice_rooms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id = db.Column(
        db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    peer_id = db.Column(db.String(100), nullable=True)
    is_muted = db.Column(db.Boolean, default=False, nullable=False)
    is_deafened = db.Column(db.Boolean, default=False, nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    joined_at = db.Column(db.DateTime, default=_now, nullable=False)
    last_seen = db.Column(db.DateTime, default=_now, nullable=False)

    def to_dict(self) -> dict:
        user = User.query.get(self.user_id)
        return {
            "id": self.id,
            "room_id": self.room_id,
            "user_id": self.user_id,
            "user_name": user.name if user else "Student",
            "peer_id": self.peer_id,
            "is_muted": self.is_muted,
            "is_deafened": self.is_deafened,
            "is_active": self.is_active,
            "joined_at": self.joined_at.isoformat(),
            "last_seen": self.last_seen.isoformat()
        }


class VoiceRoomMessage(db.Model):
    """Text chat message within a Voice Room."""

    __tablename__ = "voice_room_messages"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    room_id = db.Column(
        db.String(36), db.ForeignKey("voice_rooms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id = db.Column(
        db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=_now, nullable=False)

    def to_dict(self) -> dict:
        user = User.query.get(self.user_id)
        return {
            "id": self.id,
            "room_id": self.room_id,
            "user_id": self.user_id,
            "user_name": user.name if user else "Student",
            "content": self.content,
            "created_at": self.created_at.isoformat(),
        }

