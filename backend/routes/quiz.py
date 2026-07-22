import logging
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from models import db, User, Document, ActiveQuiz, QuizResult
from services.ai_service import AIService

logger = logging.getLogger(__name__)
quiz_bp = Blueprint("quiz", __name__)
ai_service = AIService()

@quiz_bp.route("/generate/<doc_id>", methods=["POST"])
@jwt_required()
def generate_quiz(doc_id):
    """
    Generate multiple-choice quiz questions from a document.
    Saves the generated quiz in ActiveQuiz for future submission validation.
    """
    current_user_id = get_jwt_identity()
    user = User.query.get(current_user_id)
    if not user:
        return jsonify({"success": False, "message": "User not found"}), 404

    doc = Document.query.filter_by(id=doc_id, user_id=current_user_id).first()
    if not doc:
        return jsonify({"success": False, "message": "Document not found"}), 404

    # Extract number of questions from request (default: 5)
    data = request.get_json() or {}
    num_questions = int(data.get("num_questions", 5))
    if num_questions < 1:
        num_questions = 5

    try:
        # Generate the quiz questions using AIService
        questions = ai_service.generate_quiz(doc.content, num_questions=num_questions)
        if not questions:
            return jsonify({"success": False, "message": "Could not generate quiz. Text may be too short."}), 400

        # Save to ActiveQuiz (temporary in-flight state, expires in 30 mins)
        expires_at = datetime.utcnow() + timedelta(minutes=30)
        active_quiz = ActiveQuiz(
            user_id=current_user_id,
            document_id=doc_id,
            questions=questions,
            expires_at=expires_at
        )
        db.session.add(active_quiz)
        db.session.commit()

        # Format questions for the frontend (do not send the correct_answer for security)
        frontend_questions = []
        for idx, q in enumerate(questions):
            frontend_questions.append({
                "index": idx,
                "question": q["question"],
                "options": q["options"]
            })

        return jsonify({
            "success": True,
            "data": {
                "quiz_id": active_quiz.id,
                "document_id": doc_id,
                "questions": frontend_questions,
                "expires_at": expires_at.isoformat()
            }
        }), 201

    except Exception as e:
        db.session.rollback()
        logger.error("Error generating quiz: %s", str(e), exc_info=True)
        return jsonify({"success": False, "message": "An error occurred while generating the quiz"}), 500


@quiz_bp.route("/submit", methods=["POST"])
@jwt_required()
def submit_quiz():
    """
    Submit answers to a quiz, score it, award XP, update streak,
    and save QuizResult in the database.
    """
    current_user_id = get_jwt_identity()
    user = User.query.get(current_user_id)
    if not user:
        return jsonify({"success": False, "message": "User not found"}), 404

    data = request.get_json() or {}
    quiz_id = data.get("quiz_id")
    user_answers = data.get("answers", {})  # Dict mapping string question index to chosen option string
    time_taken = int(data.get("time_taken_seconds", 0))

    if not quiz_id:
        return jsonify({"success": False, "message": "quiz_id is required"}), 400

    active_quiz = ActiveQuiz.query.filter_by(id=quiz_id, user_id=current_user_id).first()
    if not active_quiz:
        return jsonify({"success": False, "message": "Quiz session not found or unauthorized"}), 404

    if active_quiz.is_expired():
        db.session.delete(active_quiz)
        db.session.commit()
        return jsonify({"success": False, "message": "Quiz session has expired (30 minute limit)"}), 400

    try:
        questions = active_quiz.questions
        total_questions = len(questions)
        correct_count = 0
        breakdown = []

        # Compare answers and build the breakdown list
        for i, q in enumerate(questions):
            correct_answer = q.get("correct_answer")
            user_choice = user_answers.get(str(i)) or user_answers.get(i)
            
            # Clean choices to handle whitespaces
            is_correct = False
            if user_choice and correct_answer:
                is_correct = (user_choice.strip().lower() == correct_answer.strip().lower())
                
            if is_correct:
                correct_count += 1
                
            breakdown.append({
                "question": q["question"],
                "options": q["options"],
                "correct_answer": correct_answer,
                "user_answer": user_choice,
                "is_correct": is_correct,
                "explanation": q.get("explanation", "")
            })

        percentage = round((correct_count / total_questions) * 100, 2) if total_questions > 0 else 0.0
        
        # XP calculation: score * 5 XP
        xp_earned = correct_count * 5

        # Award XP and update levels
        user.xp_points += xp_earned
        user.level = user.compute_level()

        # Update study streak
        now = datetime.utcnow()
        if user.last_active:
            delta = now.date() - user.last_active.date()
            if delta.days == 1:
                user.streak_days += 1
            elif delta.days > 1:
                user.streak_days = 1  # Reset to 1 if streak broken
        else:
            user.streak_days = 1
        user.last_active = now

        # Create QuizResult
        result = QuizResult(
            user_id=current_user_id,
            document_id=active_quiz.document_id,
            score=correct_count,
            total_questions=total_questions,
            percentage=percentage,
            time_taken_seconds=time_taken,
            questions_data=breakdown
        )
        db.session.add(result)

        # Delete active quiz
        db.session.delete(active_quiz)
        db.session.commit()

        return jsonify({
            "success": True,
            "data": {
                "result_id": result.id,
                "score": correct_count,
                "total": total_questions,
                "percentage": percentage,
                "time_taken_seconds": time_taken,
                "xp_earned": xp_earned,
                "total_xp": user.xp_points,
                "level": user.level,
                "streak_days": user.streak_days,
                "breakdown": breakdown
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.error("Error submitting quiz: %s", str(e), exc_info=True)
        return jsonify({"success": False, "message": "An error occurred while submitting the quiz"}), 500


@quiz_bp.route("/results", methods=["GET"])
@jwt_required()
def get_results():
    """
    Get all quiz results for the user.
    Optionally filter by document_id.
    """
    current_user_id = get_jwt_identity()
    doc_id = request.args.get("doc_id")

    query = QuizResult.query.filter_by(user_id=current_user_id)
    if doc_id:
        query = query.filter_by(document_id=doc_id)

    results = query.order_by(QuizResult.created_at.desc()).all()
    
    # Do not include full questions_data in the list for performance reasons
    return jsonify({
        "success": True,
        "data": [r.to_dict(include_questions=False) for r in results]
    }), 200


@quiz_bp.route("/results/<result_id>", methods=["GET"])
@jwt_required()
def get_result_details(result_id):
    """
    Get detailed breakdown of a specific quiz result.
    """
    current_user_id = get_jwt_identity()
    result = QuizResult.query.filter_by(id=result_id, user_id=current_user_id).first()
    if not result:
        return jsonify({"success": False, "message": "Result not found"}), 404

    return jsonify({
        "success": True,
        "data": result.to_dict(include_questions=True)
    }), 200
