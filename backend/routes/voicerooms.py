"""
routes/voicerooms.py — Real-time Collaborative Voice Study Rooms API.

Blueprint: 'voicerooms'  Prefix: /api/voicerooms

Endpoints:
  POST /create           — Create a new voice study room (capacity <= 6).
  POST /join             — Join a room by ID or 6-digit room code (enforces max 6 limit).
  GET  /active           — List active study rooms.
  GET  /<room_id>        — Get details of a voice room.
  POST /<room_id>/leave  — Leave a voice room.
  POST /<room_id>/state  — Update mic/deafen/peer_id state.
  POST /<room_id>/signal — Post WebRTC signaling message (offer/answer/candidate).
  GET  /<room_id>/signals— Retrieve unread WebRTC signals for current user.
  POST /<room_id>/chat   — Send a text chat message in room.
  GET  /<room_id>/chat   — Fetch text chat history.
"""

import random
import string
import logging
from datetime import datetime

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from models import db, User, Document, VoiceRoom, VoiceRoomParticipant, VoiceRoomMessage

logger = logging.getLogger(__name__)
voicerooms_bp = Blueprint("voicerooms", __name__)

# In-memory WebRTC Signal Queue for ultra-fast peer signaling exchange
# Structure: { room_id: [ { from_user, to_user, type, payload, timestamp } ] }
SIGNAL_QUEUES = {}


def _generate_room_code() -> str:
    """Generate a unique 6-character room code (e.g. STUDY-8A2 -> 8A2B9X)."""
    chars = string.ascii_uppercase + string.digits
    while True:
        code = "".join(random.choices(chars, k=6))
        if not VoiceRoom.query.filter_by(room_code=code, is_active=True).first():
            return f"STUDY-{code[:3]}"


def _ok(data=None, message: str = "Success", status: int = 200):
    return jsonify({"success": True, "message": message, "data": data}), status


def _err(message: str, status: int = 400, data=None):
    return jsonify({"success": False, "message": message, "data": data}), status


@voicerooms_bp.route("/create", methods=["POST"])
@jwt_required()
def create_room():
    """Create a new collaborative voice study room (max 6 members)."""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return _err("User not found.", 404)

    body = request.get_json(silent=True) or {}
    title = (body.get("title") or "").strip() or f"{user.name}'s Study Session"
    doc_id = (body.get("document_id") or "").strip() or None

    if doc_id:
        doc = Document.query.filter_by(id=doc_id, user_id=user_id).first()
        if not doc:
            doc_id = None

    room_code = _generate_room_code()

    try:
        room = VoiceRoom(
            room_code=room_code,
            title=title,
            host_id=user_id,
            document_id=doc_id,
            max_participants=6,
            is_active=True
        )
        db.session.add(room)
        db.session.commit()

        # Add host as first active participant
        participant = VoiceRoomParticipant(
            room_id=room.id,
            user_id=user_id,
            peer_id=body.get("peer_id"),
            is_active=True
        )
        db.session.add(participant)
        db.session.commit()

        return _ok(
            data={"room": room.to_dict()},
            message=f"Voice room '{title}' created successfully.",
            status=201
        )
    except Exception as exc:
        db.session.rollback()
        logger.exception("create_room error: %s", exc)
        return _err("Failed to create voice room.", 500)


@voicerooms_bp.route("/join", methods=["POST"])
@jwt_required()
def join_room():
    """Join an active voice room via room_id or room_code (enforces 6 member limit)."""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return _err("User not found.", 404)

    body = request.get_json(silent=True) or {}
    room_identifier = (body.get("room_id") or body.get("room_code") or "").strip().upper()

    if not room_identifier:
        return _err("room_id or room_code is required.", 400)

    room = VoiceRoom.query.filter(
        (VoiceRoom.id == room_identifier) | (VoiceRoom.room_code == room_identifier),
        VoiceRoom.is_active == True
    ).first()

    if not room:
        return _err("Voice room not found or inactive.", 404)

    # Check active participant count
    active_participants = VoiceRoomParticipant.query.filter_by(
        room_id=room.id, is_active=True
    ).all()

    # Check if user is already an active member in this room
    existing_p = next((p for p in active_participants if p.user_id == user_id), None)

    if not existing_p and len(active_participants) >= room.max_participants:
        return _err(
            f"Voice room is full! Maximum capacity is {room.max_participants} members.",
            400,
            data={"current_count": len(active_participants), "max_capacity": room.max_participants}
        )

    try:
        peer_id = body.get("peer_id")
        if existing_p:
            existing_p.is_active = True
            existing_p.peer_id = peer_id or existing_p.peer_id
            existing_p.last_seen = datetime.utcnow()
        else:
            new_p = VoiceRoomParticipant(
                room_id=room.id,
                user_id=user_id,
                peer_id=peer_id,
                is_active=True
            )
            db.session.add(new_p)

        db.session.commit()
        return _ok(data={"room": room.to_dict()}, message="Joined voice room successfully.")
    except Exception as exc:
        db.session.rollback()
        logger.exception("join_room error: %s", exc)
        return _err("Failed to join voice room.", 500)


@voicerooms_bp.route("/active", methods=["GET"])
@jwt_required()
def list_active_rooms():
    """List all active public voice study rooms."""
    try:
        rooms = VoiceRoom.query.filter_by(is_active=True).order_by(VoiceRoom.created_at.desc()).all()
        return _ok(data={"rooms": [r.to_dict() for r in rooms], "count": len(rooms)})
    except Exception as exc:
        logger.exception("list_active_rooms error: %s", exc)
        return _err("Failed to list active voice rooms.", 500)


@voicerooms_bp.route("/<room_id>", methods=["GET"])
@jwt_required()
def get_room_details(room_id: str):
    """Get details and participant list of a voice room."""
    room = VoiceRoom.query.get(room_id)
    if not room or not room.is_active:
        return _err("Voice room not found.", 404)
    return _ok(data={"room": room.to_dict(include_participants=True)})


@voicerooms_bp.route("/<room_id>/leave", methods=["POST"])
@jwt_required()
def leave_room(room_id: str):
    """Leave a voice room."""
    user_id = get_jwt_identity()
    p = VoiceRoomParticipant.query.filter_by(room_id=room_id, user_id=user_id, is_active=True).first()
    if p:
        try:
            p.is_active = False
            db.session.commit()

            # Deactivate room if empty
            remaining = VoiceRoomParticipant.query.filter_by(room_id=room_id, is_active=True).count()
            if remaining == 0:
                room = VoiceRoom.query.get(room_id)
                if room:
                    room.is_active = False
                    db.session.commit()

            return _ok(message="Left voice room successfully.")
        except Exception as exc:
            db.session.rollback()
            logger.exception("leave_room error: %s", exc)
            return _err("Failed to leave room.", 500)
    return _ok(message="Not active in room.")


@voicerooms_bp.route("/<room_id>/state", methods=["POST"])
@jwt_required()
def update_state(room_id: str):
    """Update participant mute, deafen, or peer_id state."""
    user_id = get_jwt_identity()
    p = VoiceRoomParticipant.query.filter_by(room_id=room_id, user_id=user_id, is_active=True).first()
    if not p:
        return _err("Participant not in active voice room.", 404)

    body = request.get_json(silent=True) or {}
    if "is_muted" in body:
        p.is_muted = bool(body["is_muted"])
    if "is_deafened" in body:
        p.is_deafened = bool(body["is_deafened"])
    if "peer_id" in body:
        p.peer_id = body["peer_id"]
    p.last_seen = datetime.utcnow()

    try:
        db.session.commit()
        return _ok(data={"participant": p.to_dict()})
    except Exception as exc:
        db.session.rollback()
        return _err("Failed to update state.", 500)


@voicerooms_bp.route("/<room_id>/signal", methods=["POST"])
@jwt_required()
def send_signal(room_id: str):
    """Send WebRTC offer, answer, or ICE candidate signal to peer in room."""
    user_id = get_jwt_identity()
    body = request.get_json(silent=True) or {}
    target_user_id = body.get("target_user_id")
    signal_data = body.get("signal")

    if not target_user_id or not signal_data:
        return _err("target_user_id and signal are required.", 400)

    if room_id not in SIGNAL_QUEUES:
        SIGNAL_QUEUES[room_id] = []

    SIGNAL_QUEUES[room_id].append({
        "from_user_id": user_id,
        "to_user_id": target_user_id,
        "signal": signal_data,
        "timestamp": datetime.utcnow().isoformat()
    })

    # Limit queue size per room
    if len(SIGNAL_QUEUES[room_id]) > 200:
        SIGNAL_QUEUES[room_id] = SIGNAL_QUEUES[room_id][-100:]

    return _ok(message="Signal sent.")


@voicerooms_bp.route("/<room_id>/signals", methods=["GET"])
@jwt_required()
def get_signals(room_id: str):
    """Retrieve pending WebRTC signals intended for the current user."""
    user_id = get_jwt_identity()
    queue = SIGNAL_QUEUES.get(room_id, [])

    # Filter signals for current user and drain them from queue
    my_signals = [s for s in queue if s["to_user_id"] == user_id]
    SIGNAL_QUEUES[room_id] = [s for s in queue if s["to_user_id"] != user_id]

    return _ok(data={"signals": my_signals})


@voicerooms_bp.route("/<room_id>/chat", methods=["POST"])
@jwt_required()
def send_chat(room_id: str):
    """Post text chat message inside the voice room."""
    user_id = get_jwt_identity()
    body = request.get_json(silent=True) or {}
    content = (body.get("content") or "").strip()

    if not content:
        return _err("Content is required.", 400)

    try:
        msg = VoiceRoomMessage(
            room_id=room_id,
            user_id=user_id,
            content=content
        )
        db.session.add(msg)
        db.session.commit()
        return _ok(data={"message": msg.to_dict()}, status=201)
    except Exception as exc:
        db.session.rollback()
        return _err("Failed to send chat message.", 500)


@voicerooms_bp.route("/<room_id>/chat", methods=["GET"])
@jwt_required()
def get_chat(room_id: str):
    """Get text chat history for the voice room."""
    messages = VoiceRoomMessage.query.filter_by(room_id=room_id).order_by(VoiceRoomMessage.created_at.asc()).limit(100).all()
    return _ok(data={"messages": [m.to_dict() for m in messages]})
