import logging
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import func

from models import db, User, Document, Flashcard, QuizResult, StudySession
from services.ai_service import AIService

logger = logging.getLogger(__name__)
progress_bp = Blueprint("progress", __name__)
ai_service = AIService()

@progress_bp.route("/dashboard", methods=["GET"])
@progress_bp.route("/overview", methods=["GET"])
@progress_bp.route("/weekly", methods=["GET"])
@progress_bp.route("/score-history", methods=["GET"])
@progress_bp.route("/flashcard-stats", methods=["GET"])
@jwt_required()
def get_dashboard():
    """
    Fetch comprehensive dashboard statistics for the logged-in student.
    """
    current_user_id = get_jwt_identity()
    user = User.query.get(current_user_id)
    if not user:
        return jsonify({"success": False, "message": "User not found"}), 404

    now = datetime.utcnow()
    today_start = datetime(now.year, now.month, now.day)

    try:
        # 1. User stats
        user_data = {
            "name": user.name,
            "xp": user.xp_points,
            "level": user.level,
            "streak_days": user.streak_days,
            "total_study_time": user.total_study_time
        }

        # 2. Today's metrics
        today_sessions = StudySession.query.filter(
            StudySession.user_id == current_user_id,
            StudySession.started_at >= today_start
        ).all()
        
        today_xp = sum(s.xp_earned for s in today_sessions)
        today_time = sum(s.duration_seconds for s in today_sessions)
        
        today_data = {
            "sessions": len(today_sessions),
            "xp_earned": today_xp,
            "time_studied": today_time
        }

        # 3. Documents metrics
        total_docs = Document.query.filter_by(user_id=current_user_id).count()
        week_ago = now - timedelta(days=7)
        docs_this_week = Document.query.filter(
            Document.user_id == current_user_id,
            Document.created_at >= week_ago
        ).count()
        
        documents_data = {
            "total": total_docs,
            "uploaded_this_week": docs_this_week
        }

        # 4. Flashcards metrics
        total_cards = Flashcard.query.filter_by(user_id=current_user_id).count()
        mastered_cards = Flashcard.query.filter(
            Flashcard.user_id == current_user_id,
            Flashcard.mastery_level >= 4
        ).count()
        due_cards = Flashcard.query.filter(
            Flashcard.user_id == current_user_id,
            (Flashcard.next_review <= now) | (Flashcard.next_review.is_(None))
        ).count()
        
        flashcards_data = {
            "total": total_cards,
            "mastered": mastered_cards,
            "due_today": due_cards
        }

        # 5. Quiz metrics
        quiz_query = QuizResult.query.filter_by(user_id=current_user_id)
        total_quizzes = quiz_query.count()
        
        avg_score = 0.0
        best_score = 0
        if total_quizzes > 0:
            avg_score = db.session.query(func.avg(QuizResult.percentage)).filter_by(user_id=current_user_id).scalar()
            avg_score = round(float(avg_score), 2)
            best_score = db.session.query(func.max(QuizResult.score)).filter_by(user_id=current_user_id).scalar()
            
        quiz_data = {
            "total_taken": total_quizzes,
            "avg_score": avg_score,
            "best_score": best_score
        }

        # 6. Weekly activity (last 7 days, including today)
        weekly_activity = []
        for i in range(6, -1, -1):
            day = now - timedelta(days=i)
            day_start = datetime(day.year, day.month, day.day)
            day_end = day_start + timedelta(days=1)
            
            day_sessions = StudySession.query.filter(
                StudySession.user_id == current_user_id,
                StudySession.started_at >= day_start,
                StudySession.started_at < day_end
            ).all()
            
            day_xp = sum(s.xp_earned for s in day_sessions)
            day_time_mins = round(sum(s.duration_seconds for s in day_sessions) / 60, 2)
            
            weekly_activity.append({
                "date": day_start.strftime("%Y-%m-%d"),
                "xp": day_xp,
                "sessions": len(day_sessions),
                "time_minutes": day_time_mins
            })

        # 7. Score history (last 20 quiz results)
        score_history = []
        results = QuizResult.query.filter_by(user_id=current_user_id).order_by(QuizResult.created_at.desc()).limit(20).all()
        for r in reversed(results):
            doc_title = "General"
            if r.document_id:
                doc = Document.query.get(r.document_id)
                if doc:
                    doc_title = doc.title
            score_history.append({
                "date": r.created_at.strftime("%b %d"),
                "score": r.score,
                "total": r.total_questions,
                "percentage": r.percentage,
                "doc_title": doc_title
            })

        # 8. Top topics (documents sorted by study session count)
        top_topics = []
        topic_counts = db.session.query(
            StudySession.document_id,
            func.count(StudySession.id).label("session_count"),
            func.sum(StudySession.duration_seconds).label("total_duration")
        ).filter(
            StudySession.user_id == current_user_id,
            StudySession.document_id.isnot(None)
        ).group_by(StudySession.document_id).order_by(func.count(StudySession.id).desc()).limit(5).all()

        for doc_id, count, duration in topic_counts:
            doc = Document.query.get(doc_id)
            if doc:
                top_topics.append({
                    "title": doc.title,
                    "session_count": count,
                    "total_duration_minutes": round((duration or 0) / 60, 1)
                })

        return jsonify({
            "success": True,
            "data": {
                "user": user_data,
                "today": today_data,
                "documents": documents_data,
                "flashcards": flashcards_data,
                "quiz": quiz_data,
                "weekly_activity": weekly_activity,
                "score_history": score_history,
                "top_topics": top_topics
            }
        }), 200

    except Exception as e:
        logger.error("Error fetching dashboard statistics: %s", str(e), exc_info=True)
        return jsonify({"success": False, "message": "An error occurred while compiling your dashboard"}), 500


@progress_bp.route("/sessions", methods=["GET"])
@jwt_required()
def get_sessions():
    """
    Get paginated history of user study sessions.
    """
    current_user_id = get_jwt_identity()
    page = int(request.args.get("page", 1))
    per_page = int(request.args.get("per_page", 10))

    query = StudySession.query.filter_by(user_id=current_user_id).order_by(StudySession.started_at.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        "success": True,
        "data": {
            "sessions": [s.to_dict() for s in pagination.items],
            "total": pagination.total,
            "pages": pagination.pages,
            "page": page
        }
    }), 200


@progress_bp.route("/session", methods=["POST"])
@jwt_required()
def save_session():
    """
    Record a new Study Session, updates total study time, awards XP,
    and returns user statistics update.
    """
    current_user_id = get_jwt_identity()
    user = User.query.get(current_user_id)
    if not user:
        return jsonify({"success": False, "message": "User not found"}), 404

    data = request.get_json() or {}
    doc_id = data.get("document_id")
    activity_type = data.get("activity_type")
    duration = int(data.get("duration_seconds", 0))

    if not activity_type:
        return jsonify({"success": False, "message": "activity_type is required"}), 400

    # XP rules: qa=5, summarize=15, flashcard=2 per review, quiz is handled in quiz.py, upload=10
    xp_map = {
        "qa": 5,
        "summarize": 15,
        "flashcard": 5,
        "quiz": 0,  # Quiz XP is awarded on submission of answers
        "upload": 10
    }
    xp_earned = xp_map.get(activity_type, 2)

    try:
        # Create the StudySession
        session = StudySession(
            user_id=current_user_id,
            document_id=doc_id,
            activity_type=activity_type,
            duration_seconds=duration,
            xp_earned=xp_earned,
            started_at=datetime.utcnow() - timedelta(seconds=duration),
            ended_at=datetime.utcnow()
        )
        db.session.add(session)

        # Update User details
        user.total_study_time += duration
        user.xp_points += xp_earned
        user.level = user.compute_level()

        # Update streak
        now = datetime.utcnow()
        if user.last_active:
            delta = now.date() - user.last_active.date()
            if delta.days == 1:
                user.streak_days += 1
            elif delta.days > 1:
                user.streak_days = 1
        else:
            user.streak_days = 1
        user.last_active = now

        db.session.commit()

        return jsonify({
            "success": True,
            "data": {
                "session": session.to_dict(),
                "xp_earned": xp_earned,
                "total_xp": user.xp_points,
                "level": user.level,
                "streak_days": user.streak_days
            }
        }), 201

    except Exception as e:
        db.session.rollback()
        logger.error("Error saving study session: %s", str(e), exc_info=True)
        return jsonify({"success": False, "message": "An error occurred while saving the study session"}), 500


@progress_bp.route("/recommendations", methods=["GET"])
@jwt_required()
def get_recommendations():
    """
    Get personalized study recommendations based on student's stats.
    """
    current_user_id = get_jwt_identity()
    user = User.query.get(current_user_id)
    if not user:
        return jsonify({"success": False, "message": "User not found"}), 404

    try:
        # Compile stats to pass to AIService
        avg_score = db.session.query(func.avg(QuizResult.percentage)).filter_by(user_id=current_user_id).scalar() or 0.0
        avg_mastery = db.session.query(func.avg(Flashcard.mastery_level)).filter_by(user_id=current_user_id).scalar() or 0.0
        due_cards = Flashcard.query.filter(
            Flashcard.user_id == current_user_id,
            (Flashcard.next_review <= datetime.utcnow()) | (Flashcard.next_review.is_(None))
        ).count()
        total_sessions = StudySession.query.filter_by(user_id=current_user_id).count()

        stats = {
            "avg_quiz_score": float(avg_score),
            "streak_days": user.streak_days,
            "avg_mastery": float(avg_mastery),
            "due_cards": due_cards,
            "total_sessions": total_sessions,
            "xp_points": user.xp_points,
            "level": user.level
        }

        recommendations = ai_service.get_recommendations(stats)

        # Deduce focus areas
        focus_areas = []
        if avg_score < 70:
            focus_areas.append("Quiz Review")
        if due_cards > 5:
            focus_areas.append("Flashcards Spaced Repetition")
        if total_sessions < 5:
            focus_areas.append("Initial Setup & Upload")
        if not focus_areas:
            focus_areas = ["Advanced Concepts", "Mock Quizzes"]

        return jsonify({
            "success": True,
            "data": {
                "recommendations": recommendations,
                "focus_areas": focus_areas
            }
        }), 200

    except Exception as e:
        logger.error("Error generating recommendations: %s", str(e), exc_info=True)
        return jsonify({"success": False, "message": "An error occurred while compiling recommendations"}), 500


@progress_bp.route("/achievements", methods=["GET"])
@jwt_required()
def get_achievements():
    """
    Determine and return student achievements/badges based on study progress.
    """
    current_user_id = get_jwt_identity()
    user = User.query.get(current_user_id)
    if not user:
        return jsonify({"success": False, "message": "User not found"}), 404

    try:
        total_docs = Document.query.filter_by(user_id=current_user_id).count()
        total_quizzes = QuizResult.query.filter_by(user_id=current_user_id).count()
        max_quiz_score = db.session.query(func.max(QuizResult.percentage)).filter_by(user_id=current_user_id).scalar() or 0.0
        total_cards = Flashcard.query.filter_by(user_id=current_user_id).count()
        mastered_cards = Flashcard.query.filter(
            Flashcard.user_id == current_user_id,
            Flashcard.mastery_level >= 4
        ).count()
        study_hours = user.total_study_time / 3600.0

        achievements = [
            {
                "id": "welcome",
                "title": "Freshman",
                "description": "Registered your account and took your first step.",
                "unlocked": True,
                "unlocked_at": user.created_at.isoformat()
            },
            {
                "id": "first_upload",
                "title": "Librarian",
                "description": "Upload at least 1 study document.",
                "unlocked": total_docs >= 1,
                "unlocked_at": None
            },
            {
                "id": "quiz_master",
                "title": "Academic Ace",
                "description": "Achieve 100% on any quiz.",
                "unlocked": max_quiz_score >= 100.0,
                "unlocked_at": None
            },
            {
                "id": "streak_3",
                "title": "Consistent Mind",
                "description": "Reach a 3-day study streak.",
                "unlocked": user.streak_days >= 3,
                "unlocked_at": None
            },
            {
                "id": "streak_7",
                "title": "Weekly Warrior",
                "description": "Reach a 7-day study streak.",
                "unlocked": user.streak_days >= 7,
                "unlocked_at": None
            },
            {
                "id": "flashcard_mastery",
                "title": "Mnemonist",
                "description": "Master at least 5 flashcards (Mastery Level 4+).",
                "unlocked": mastered_cards >= 5,
                "unlocked_at": None
            },
            {
                "id": "study_10h",
                "title": "Scholar",
                "description": "Spend 10 or more hours studying in total.",
                "unlocked": study_hours >= 10.0,
                "unlocked_at": None
            }
        ]

        return jsonify({
            "success": True,
            "data": achievements
        }), 200

    except Exception as e:
        logger.error("Error compiling achievements: %s", str(e), exc_info=True)
        return jsonify({"success": False, "message": "An error occurred while compiling achievements"}), 500
