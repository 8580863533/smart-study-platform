import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { voiceroomsAPI } from '../api/client';
import { useAuth } from './AuthContext';
import { useToast } from '../hooks/useToast';

const VoiceRoomContext = createContext(null);

const DEFAULT_ACTIVE_ROOMS = [
  {
    id: 'room-ai-study-1',
    room_code: '849201',
    title: '?? Deep Learning & AI Study Group',
    host_name: 'Alex Chen',
    host_id: 'host-1',
    current_participants: 2,
    max_participants: 6,
    is_active: true,
    document_title: 'Artificial Intelligence Notes',
    participants: [
      { id: 'p1', user_id: 'host-1', user_name: 'Alex Chen', is_muted: false, is_deafened: false, is_active: true },
      { id: 'p2', user_id: 'user-2', user_name: 'Sarah M.', is_muted: true, is_deafened: false, is_active: true }
    ]
  },
  {
    id: 'room-os-study-2',
    room_code: '512930',
    title: '?? Systems & Cloud Architecture',
    host_name: 'David K.',
    host_id: 'host-2',
    current_participants: 3,
    max_participants: 6,
    is_active: true,
    document_title: 'Operating Systems Review',
    participants: [
      { id: 'p3', user_id: 'host-2', user_name: 'David K.', is_muted: false, is_deafened: false, is_active: true },
      { id: 'p4', user_id: 'user-4', user_name: 'Priya R.', is_muted: false, is_deafened: false, is_active: true },
      { id: 'p5', user_id: 'user-5', user_name: 'Marcus W.', is_muted: true, is_deafened: false, is_active: true }
    ]
  },
  {
    id: 'room-algos-3',
    room_code: '730192',
    title: '? Algorithm Mastery & Problem Solving',
    host_name: 'Emily Watson',
    host_id: 'host-3',
    current_participants: 1,
    max_participants: 6,
    is_active: true,
    document_title: 'Data Structures & Algorithms',
    participants: [
      { id: 'p6', user_id: 'host-3', user_name: 'Emily Watson', is_muted: false, is_deafened: false, is_active: true }
    ]
  }
];

export function getStoredRooms() {
  try {
    const raw = localStorage.getItem('active_voice_rooms');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {}
  return DEFAULT_ACTIVE_ROOMS;
}

export function saveStoredRooms(rooms) {
  try {
    localStorage.setItem('active_voice_rooms', JSON.stringify(rooms));
  } catch (e) {}
}

export function VoiceRoomProvider({ children }) {
  const { user } = useAuth();
  const { addToast } = useToast();

  const [currentRoom, setCurrentRoom] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [activeSpeakers, setActiveSpeakers] = useState({});
  const [chatMessages, setChatMessages] = useState([]);

  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const audioContextRef = useRef(null);
  const pollTimerRef = useRef(null);
  const remoteAudiosRef = useRef({});
  const broadcastRef = useRef(null);

  const ICE_SERVERS = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  };

  useEffect(() => {
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('study_voicerooms_signals');
        broadcastRef.current = bc;
        bc.onmessage = (event) => {
          handleIncomingSignal(event.data);
        };
      }
    } catch (e) {
      console.warn("BroadcastChannel not supported:", e);
    }
    return () => {
      stopLocalStream();
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (broadcastRef.current) broadcastRef.current.close();
    };
  }, []);

  const initiatePeerConnection = async (targetUserId, isInitiator = false) => {
    if (peerConnectionsRef.current[targetUserId]) return;

    try {
      const pc = new RTCPeerConnection(ICE_SERVERS);
      peerConnectionsRef.current[targetUserId] = pc;

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          pc.addTrack(track, localStreamRef.current);
        });
      }

      pc.onicecandidate = (event) => {
        if (event.candidate && currentRoom) {
          sendSignalMessage(targetUserId, { type: 'candidate', candidate: event.candidate });
        }
      };

      pc.ontrack = (event) => {
        const remoteStream = event.streams[0];
        playRemoteAudio(targetUserId, remoteStream);
      };

      if (isInitiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignalMessage(targetUserId, { type: 'offer', sdp: offer });
      }
    } catch (e) {
      console.warn("Peer connection setup error:", e);
    }
  };

  const playRemoteAudio = (targetUserId, stream) => {
    try {
      let audioEl = remoteAudiosRef.current[targetUserId];
      if (!audioEl) {
        audioEl = document.createElement('audio');
        audioEl.autoplay = true;
        audioEl.style.display = 'none';
        document.body.appendChild(audioEl);
        remoteAudiosRef.current[targetUserId] = audioEl;
      }
      audioEl.srcObject = stream;
      audioEl.play().catch(() => {});
    } catch (e) {}
  };

  const sendSignalMessage = (targetUserId, signal) => {
    if (broadcastRef.current) {
      broadcastRef.current.postMessage({
        room_id: currentRoom?.id,
        from_user: user?.id,
        target_user: targetUserId,
        signal
      });
    }
    if (currentRoom?.id) {
      voiceroomsAPI.sendSignal(currentRoom.id, targetUserId, signal).catch(() => {});
    }
  };

  const handleIncomingSignal = async (data) => {
    if (!data || !currentRoom) return;
    const { from_user, target_user, signal, type, message } = data;

    if (type === 'chat' && message) {
      setChatMessages(prev => {
        if (prev.some(m => m.id === message.id)) return prev;
        return [...prev, message];
      });
      return;
    }

    if (target_user && target_user !== user?.id) return;
    if (!signal || from_user === user?.id) return;

    let pc = peerConnectionsRef.current[from_user];
    if (!pc) {
      await initiatePeerConnection(from_user, false);
      pc = peerConnectionsRef.current[from_user];
    }
    if (!pc) return;

    try {
      if (signal.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignalMessage(from_user, { type: 'answer', sdp: answer });
      } else if (signal.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      } else if (signal.type === 'candidate' && signal.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    } catch (e) {}
  };

  const startLocalAudio = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;

      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          const audioCtx = new AudioContext();
          audioContextRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);

          const bufferLength = analyser.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);

          const checkSpeaking = () => {
            if (!localStreamRef.current) return;
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
              sum += dataArray[i];
            }
            const average = sum / bufferLength;
            const speaking = average > 15 && !isMuted;

            if (user?.id) {
              setActiveSpeakers((prev) => ({
                ...prev,
                [user.id]: speaking,
              }));
            }

            requestAnimationFrame(checkSpeaking);
          };

          checkSpeaking();
        }
      } catch (e) {}

      return stream;
    } catch (err) {
      console.warn("Microphone permission needed:", err);
      addToast("Joined voice room (microphone permission needed to speak).", "info");
      return null;
    }
  };

  const stopLocalStream = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    Object.values(peerConnectionsRef.current).forEach(pc => {
      try { pc.close(); } catch (e) {}
    });
    peerConnectionsRef.current = {};
    Object.values(remoteAudiosRef.current).forEach(el => {
      try { el.srcObject = null; el.remove(); } catch (e) {}
    });
    remoteAudiosRef.current = {};
  };

  const createRoom = async (title, documentId) => {
    await startLocalAudio();
    const generatedCode = String(Math.floor(100000 + Math.random() * 900000));
    const newRoom = {
      id: 'room-' + Date.now(),
      room_code: generatedCode,
      title: title || 'Study Voice Room',
      document_id: documentId,
      host_name: user?.name || 'You',
      host_id: user?.id || 'host',
      current_participants: 1,
      max_participants: 6,
      is_active: true,
      participants: [
        {
          id: 'part-' + Date.now(),
          user_id: user?.id || 'host',
          user_name: (user?.name || 'You') + ' (Host)',
          is_muted: false,
          is_deafened: false,
          is_active: true
        }
      ]
    };

    // Save to shared rooms list
    const rooms = getStoredRooms();
    rooms.unshift(newRoom);
    saveStoredRooms(rooms);

    setCurrentRoom(newRoom);
    setParticipants(newRoom.participants);
    setIsMuted(false);
    setIsDeafened(false);
    addToast(`Voice room created! Share 6-digit code: ${newRoom.room_code}`, "success");

    // Sync in background
    voiceroomsAPI.create(title, documentId).catch(() => {});
    return newRoom;
  };

  const joinRoom = async (roomCodeOrId) => {
    const raw = String(roomCodeOrId || '').trim();
    if (!raw) {
      addToast("Please enter a 6-digit room code.", "warning");
      return null;
    }

    const clean = raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const rooms = getStoredRooms();

    // Exact match lookup
    const foundRoom = rooms.find(r => 
      r.id.toUpperCase() === clean || 
      r.room_code.toUpperCase() === clean ||
      r.room_code.toUpperCase() === raw.toUpperCase()
    );

    if (!foundRoom) {
      addToast(`Room "${raw}" not found. Please enter a valid code from the Active Rooms list below.`, "error");
      return null;
    }

    if (foundRoom.participants && foundRoom.participants.length >= foundRoom.max_participants) {
      addToast("Voice room is full (Maximum 6 members).", "error");
      return null;
    }

    await startLocalAudio();

    // Add user to room participants if not present
    const myId = user?.id || 'guest-' + Date.now();
    const myName = user?.name || 'Study Partner';
    const isAlreadyMember = (foundRoom.participants || []).some(p => p.user_id === myId);

    const updatedParticipants = isAlreadyMember 
      ? foundRoom.participants 
      : [...(foundRoom.participants || []), {
          id: 'part-' + Date.now(),
          user_id: myId,
          user_name: myName,
          is_muted: false,
          is_deafened: false,
          is_active: true
        }];

    foundRoom.participants = updatedParticipants;
    foundRoom.current_participants = updatedParticipants.length;

    saveStoredRooms(rooms);

    setCurrentRoom(foundRoom);
    setParticipants(updatedParticipants);
    setIsMuted(false);
    setIsDeafened(false);

    // Initiate WebRTC peer audio with existing members
    updatedParticipants.forEach(p => {
      if (p.user_id !== myId) {
        initiatePeerConnection(p.user_id, true);
      }
    });

    addToast(`Connected to ${foundRoom.title}! (Code: ${foundRoom.room_code})`, "success");

    // Sync in background
    voiceroomsAPI.join(foundRoom.room_code).catch(() => {});
    return foundRoom;
  };

  const leaveRoom = async () => {
    if (!currentRoom) return;
    try {
      voiceroomsAPI.leave(currentRoom.id).catch(() => {});
    } finally {
      stopLocalStream();
      setCurrentRoom(null);
      setParticipants([]);
      setChatMessages([]);
      setActiveSpeakers({});
      addToast("Left voice study room.", "info");
    }
  };

  const toggleMute = () => {
    const nextState = !isMuted;
    setIsMuted(nextState);
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !nextState;
      });
    }
    if (currentRoom) {
      voiceroomsAPI.updateState(currentRoom.id, { is_muted: nextState }).catch(() => {});
    }
  };

  const toggleDeafen = () => {
    const nextState = !isDeafened;
    setIsDeafened(nextState);
    Object.values(remoteAudiosRef.current).forEach(audioEl => {
      if (audioEl) audioEl.muted = nextState;
    });
    if (currentRoom) {
      voiceroomsAPI.updateState(currentRoom.id, { is_deafened: nextState }).catch(() => {});
    }
  };

  const sendChatMessage = async (content) => {
    if (!currentRoom || !content.trim()) return;
    const msg = {
      id: 'msg-' + Date.now(),
      sender_name: user?.name || 'You',
      content: content.trim(),
      created_at: new Date().toISOString()
    };
    setChatMessages((prev) => [...prev, msg]);
    if (broadcastRef.current) {
      broadcastRef.current.postMessage({
        room_id: currentRoom.id,
        type: 'chat',
        message: msg
      });
    }
    try {
      voiceroomsAPI.sendChat(currentRoom.id, content).catch(() => {});
    } catch (err) {}
  };

  return (
    <VoiceRoomContext.Provider
      value={{
        currentRoom,
        participants,
        isMuted,
        isDeafened,
        activeSpeakers,
        chatMessages,
        createRoom,
        joinRoom,
        leaveRoom,
        toggleMute,
        toggleDeafen,
        sendChatMessage,
      }}
    >
      {children}
    </VoiceRoomContext.Provider>
  );
}

export function useVoiceRoom() {
  const context = useContext(VoiceRoomContext);
  if (!context) {
    throw new Error('useVoiceRoom must be used within a VoiceRoomProvider');
  }
  return context;
}
