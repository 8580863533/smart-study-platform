import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from '../hooks/useToast';

const VoiceRoomContext = createContext(null);

const GLOBAL_ROOMS_TOPIC = 'study_global_voice_rooms_v1';
const SIGNAL_TOPIC_PREFIX = 'study_vroom_sig_';

// Free Google STUN + OpenRelay TURN servers for NAT traversal across any network
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ]
};

const PRESET_ROOMS = [
  { id: 'preset-1', room_code: '849201', title: '🤖 Deep Learning & AI Study Group', host_name: 'Alex Chen', host_id: 'p-host-1', current_participants: 2, max_participants: 6, is_active: true, document_title: 'Artificial Intelligence Notes', is_demo: true, participants: [{ id: 'p1', user_id: 'p-host-1', user_name: 'Alex Chen', is_muted: false, is_active: true }, { id: 'p2', user_id: 'p-u2', user_name: 'Sarah M.', is_muted: true, is_active: true }] },
  { id: 'preset-2', room_code: '512930', title: '☁️ Systems & Cloud Architecture', host_name: 'David K.', host_id: 'p-host-2', current_participants: 3, max_participants: 6, is_active: true, document_title: 'Operating Systems Review', is_demo: true, participants: [{ id: 'p3', user_id: 'p-host-2', user_name: 'David K.', is_muted: false, is_active: true }, { id: 'p4', user_id: 'p-u4', user_name: 'Priya R.', is_muted: false, is_active: true }] },
  { id: 'preset-3', room_code: '730192', title: '⚡ Algorithm Mastery & Problem Solving', host_name: 'Emily Watson', host_id: 'p-host-3', current_participants: 1, max_participants: 6, is_active: true, document_title: 'Data Structures & Algorithms', is_demo: true, participants: [{ id: 'p5', user_id: 'p-host-3', user_name: 'Emily Watson', is_muted: false, is_active: true }] },
];

export function getStoredRooms() {
  try {
    const raw = localStorage.getItem('study_rooms_cache');
    const cached = raw ? JSON.parse(raw) : [];
    if (Array.isArray(cached) && cached.length > 0) {
      return [...cached, ...PRESET_ROOMS];
    }
  } catch (e) {}
  return PRESET_ROOMS;
}

// ── Publish message via free cloud signaling ──────────────────────────────────
async function publishMsg(topic, data) {
  try {
    await fetch(`https://ntfy.sh/${topic}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      mode: 'cors'
    });
  } catch (err) {
    console.warn('Signaling publish notice:', err);
  }
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
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef({}); // map: peerUserId -> RTCPeerConnection
  const remoteAudiosRef = useRef({});    // map: peerUserId -> HTMLAudioElement
  const audioCtxRef = useRef(null);
  const currentRoomRef = useRef(null);
  const isMutedRef = useRef(false);
  const isDeafenedRef = useRef(false);
  const sseRef = useRef(null);
  const myIdRef = useRef(null);

  useEffect(() => { currentRoomRef.current = currentRoom; }, [currentRoom]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { isDeafenedRef.current = isDeafened; }, [isDeafened]);

  useEffect(() => {
    myIdRef.current = user?.id || 'usr-' + Math.random().toString(36).slice(2, 9);
    return () => { cleanup(); };
  }, [user]);

  // ── Microphone Audio ────────────────────────────────────────────────────────
  const startLocalAudio = async () => {
    if (localStreamRef.current) return localStreamRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      startSpeakerDetection(stream);
      return stream;
    } catch (err) {
      console.warn('Microphone permission notice:', err);
      addToast('Microphone access needed to speak. You can still listen and chat.', 'info');
      return null;
    }
  };

  const startSpeakerDetection = (stream) => {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!localStreamRef.current) return;
        analyser.getByteFrequencyData(buf);
        const avg = buf.reduce((s, v) => s + v, 0) / buf.length;
        const myId = myIdRef.current;
        if (myId) {
          setActiveSpeakers(prev => ({ ...prev, [myId]: avg > 15 && !isMutedRef.current }));
        }
        requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {}
  };

  const playRemoteAudio = (peerUserId, stream) => {
    try {
      let el = remoteAudiosRef.current[peerUserId];
      if (!el) {
        el = document.createElement('audio');
        el.autoplay = true;
        el.style.display = 'none';
        document.body.appendChild(el);
        remoteAudiosRef.current[peerUserId] = el;
      }
      el.srcObject = stream;
      el.muted = isDeafenedRef.current;
      el.play().catch(() => {});
    } catch (e) {}
  };

  const stopAudio = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch (e) {}
      audioCtxRef.current = null;
    }
    Object.values(remoteAudiosRef.current).forEach(el => {
      try { el.srcObject = null; el.remove(); } catch (e) {}
    });
    remoteAudiosRef.current = {};
  };

  // ── WebRTC Peer Connection Helper ──────────────────────────────────────────
  const getOrCreatePeerConnection = (targetUserId, isInitiator = false) => {
    if (peerConnectionsRef.current[targetUserId]) {
      return peerConnectionsRef.current[targetUserId];
    }

    const pc = new RTCPeerConnection(ICE_CONFIG);
    peerConnectionsRef.current[targetUserId] = pc;

    // Add local audio tracks if microphone is active
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && currentRoomRef.current) {
        publishMsg(SIGNAL_TOPIC_PREFIX + currentRoomRef.current.room_code, {
          type: 'candidate',
          candidate: event.candidate,
          from: myIdRef.current,
          to: targetUserId
        });
      }
    };

    pc.ontrack = (event) => {
      const remoteStream = event.streams[0];
      if (remoteStream) {
        playRemoteAudio(targetUserId, remoteStream);
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setConnectionStatus('connected');
      } else if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        // Retry connection with ICE restart if needed
        try { pc.restartIce(); } catch (e) {}
      }
    };

    if (isInitiator) {
      pc.createOffer().then(offer => {
        return pc.setLocalDescription(offer).then(() => {
          if (currentRoomRef.current) {
            publishMsg(SIGNAL_TOPIC_PREFIX + currentRoomRef.current.room_code, {
              type: 'offer',
              sdp: offer,
              from: myIdRef.current,
              to: targetUserId
            });
          }
        });
      }).catch(err => console.warn('Offer creation notice:', err));
    }

    return pc;
  };

  // ── Incoming Signals Handler ───────────────────────────────────────────────
  const handleIncomingSignal = async (data) => {
    if (!data) return;
    const myId = myIdRef.current;
    const { type, from, to, sdp, candidate, user: joinUser, room: incomingRoom, message } = data;

    // Ignore signals sent by self
    if (from === myId) return;

    // Chat message received
    if (type === 'chat' && message) {
      setChatMessages(prev => prev.some(m => m.id === message.id) ? prev : [...prev, message]);
      return;
    }

    // New participant joined the room
    if (type === 'user_joined' && joinUser) {
      setParticipants(prev => {
        if (prev.some(p => p.user_id === joinUser.id)) return prev;
        const updated = [...prev, {
          id: 'p-' + Date.now(),
          user_id: joinUser.id,
          user_name: joinUser.name,
          is_muted: false,
          is_active: true
        }];
        setCurrentRoom(r => r ? { ...r, participants: updated, current_participants: updated.length } : r);
        return updated;
      });

      // If we are the host (or existing member), reply with current room state and initiate WebRTC offer
      if (currentRoomRef.current?.host_id === myId) {
        publishMsg(SIGNAL_TOPIC_PREFIX + currentRoomRef.current.room_code, {
          type: 'room_state',
          room: currentRoomRef.current,
          to: joinUser.id,
          from: myId
        });
        // Create WebRTC offer to the joiner
        getOrCreatePeerConnection(joinUser.id, true);
      }
      return;
    }

    // Joiner received room_state from host
    if (type === 'room_state' && incomingRoom && to === myId) {
      setCurrentRoom(incomingRoom);
      setParticipants(incomingRoom.participants || []);
      setConnectionStatus('connected');
      return;
    }

    // WebRTC Offer received
    if (type === 'offer' && sdp && to === myId) {
      const pc = getOrCreatePeerConnection(from, false);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        publishMsg(SIGNAL_TOPIC_PREFIX + currentRoomRef.current?.room_code, {
          type: 'answer',
          sdp: answer,
          from: myId,
          to: from
        });
      } catch (err) {
        console.warn('Error handling WebRTC offer:', err);
      }
      return;
    }

    // WebRTC Answer received
    if (type === 'answer' && sdp && to === myId) {
      const pc = peerConnectionsRef.current[from];
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        } catch (err) {
          console.warn('Error setting remote description from answer:', err);
        }
      }
      return;
    }

    // ICE Candidate received
    if (type === 'candidate' && candidate && to === myId) {
      const pc = peerConnectionsRef.current[from];
      if (pc) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {}
      }
      return;
    }

    // User left room
    if (type === 'user_left' && from) {
      setParticipants(prev => prev.filter(p => p.user_id !== from));
      if (peerConnectionsRef.current[from]) {
        try { peerConnectionsRef.current[from].close(); } catch (e) {}
        delete peerConnectionsRef.current[from];
      }
      if (remoteAudiosRef.current[from]) {
        try { remoteAudiosRef.current[from].remove(); } catch (e) {}
        delete remoteAudiosRef.current[from];
      }
    }
  };

  // ── Subscribe to Room Signaling Channel (SSE) ──────────────────────────────
  const subscribeToRoom = (roomCode) => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }

    const topic = SIGNAL_TOPIC_PREFIX + roomCode;
    const es = new EventSource(`https://ntfy.sh/${topic}/sse`);
    sseRef.current = es;

    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload && payload.message) {
          const inner = JSON.parse(payload.message);
          handleIncomingSignal(inner);
        }
      } catch (e) {}
    };

    es.onerror = () => {
      console.warn('SSE signaling reconnection in progress...');
    };
  };

  const cleanup = () => {
    stopAudio();
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
    Object.values(peerConnectionsRef.current).forEach(pc => {
      try { pc.close(); } catch (e) {}
    });
    peerConnectionsRef.current = {};
    setConnectionStatus('disconnected');
    setCurrentRoom(null);
    setParticipants([]);
    setChatMessages([]);
    setActiveSpeakers({});
  };

  // ── Create Room (Host) ─────────────────────────────────────────────────────
  const createRoom = async (title, documentId) => {
    await startLocalAudio();
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const myId = myIdRef.current;
    const myName = user?.name || 'Host';

    const newRoom = {
      id: 'room-' + code,
      room_code: code,
      title: title || 'Study Voice Room',
      document_id: documentId,
      host_name: myName,
      host_id: myId,
      current_participants: 1,
      max_participants: 6,
      is_active: true,
      created_at: new Date().toISOString(),
      participants: [{
        id: 'p-' + Date.now(),
        user_id: myId,
        user_name: myName + ' (Host)',
        is_muted: false,
        is_active: true
      }]
    };

    cleanup();

    // 1. Publish room creation to global shared discovery so all laptops see it immediately
    publishMsg(GLOBAL_ROOMS_TOPIC, {
      action: 'create',
      room: newRoom
    });

    // 2. Cache in localStorage
    try {
      const raw = localStorage.getItem('study_rooms_cache');
      const cached = raw ? JSON.parse(raw) : [];
      const updated = [newRoom, ...cached.filter(r => r.room_code !== code)].slice(0, 10);
      localStorage.setItem('study_rooms_cache', JSON.stringify(updated));
    } catch (e) {}

    // 3. Connect to room's signaling channel
    subscribeToRoom(code);

    setCurrentRoom(newRoom);
    currentRoomRef.current = newRoom;
    setParticipants(newRoom.participants);
    setConnectionStatus('connected');
    addToast(`🎙️ Voice room created! Share 6-digit code: ${code}`, 'success');

    return newRoom;
  };

  // ── Join Room (Joiner from any laptop) ─────────────────────────────────────
  const joinRoom = async (codeOrId) => {
    const raw = String(codeOrId || '').trim();
    if (!raw) {
      addToast('Please enter a 6-digit room code.', 'warning');
      return null;
    }

    const match = raw.match(/\d{6}/);
    const code = match ? match[0] : raw.replace(/\D/g, '').slice(0, 6);

    if (!code || code.length !== 6) {
      addToast('Please enter a valid 6-digit room code.', 'warning');
      return null;
    }

    // Check if it's a demo room
    const preset = PRESET_ROOMS.find(r => r.room_code === code);
    if (preset) {
      addToast(`"${preset.title}" is a demo preview room. Click "Create Voice Room" to start your own real room!`, 'info');
      return null;
    }

    setConnectionStatus('connecting');
    addToast(`🔗 Connecting to room ${code}...`, 'info');

    await startLocalAudio();
    const myId = myIdRef.current;
    const myName = user?.name || 'Study Partner';

    cleanup();

    // 1. Subscribe to the room's signaling topic
    subscribeToRoom(code);

    // 2. Initial state while connecting to host
    const placeholder = {
      id: 'room-' + code,
      room_code: code,
      title: 'Study Room ' + code,
      host_name: 'Room Host',
      host_id: 'host',
      current_participants: 2,
      max_participants: 6,
      is_active: true,
      participants: [
        { id: 'p-me', user_id: myId, user_name: myName, is_muted: false, is_active: true }
      ]
    };
    setCurrentRoom(placeholder);
    currentRoomRef.current = placeholder;
    setParticipants(placeholder.participants);
    setConnectionStatus('connected');

    // 3. Announce our presence to the host and all peers in the room
    setTimeout(() => {
      publishMsg(SIGNAL_TOPIC_PREFIX + code, {
        type: 'user_joined',
        user: { id: myId, name: myName },
        from: myId
      });
    }, 400);

    addToast(`✅ Joined Study Room ${code}! Connected via live cloud audio.`, 'success');
    return placeholder;
  };

  // ── Leave Room ─────────────────────────────────────────────────────────────
  const leaveRoom = () => {
    if (currentRoomRef.current) {
      const code = currentRoomRef.current.room_code;
      // Tell other peers we left
      publishMsg(SIGNAL_TOPIC_PREFIX + code, {
        type: 'user_left',
        from: myIdRef.current
      });
      // If host, close room globally
      if (currentRoomRef.current.host_id === myIdRef.current) {
        publishMsg(GLOBAL_ROOMS_TOPIC, {
          action: 'close',
          room_code: code
        });
      }
    }
    cleanup();
    addToast('Left voice study room.', 'info');
  };

  // ── Mute / Deafen ──────────────────────────────────────────────────────────
  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    isMutedRef.current = next;
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !next; });
    }
  };

  const toggleDeafen = () => {
    const next = !isDeafened;
    setIsDeafened(next);
    isDeafenedRef.current = next;
    Object.values(remoteAudiosRef.current).forEach(el => {
      if (el) el.muted = next;
    });
  };

  // ── Send Chat Message ──────────────────────────────────────────────────────
  const sendChatMessage = (content) => {
    if (!currentRoomRef.current || !content?.trim()) return;
    const msg = {
      id: 'msg-' + Date.now(),
      sender_name: user?.name || 'You',
      content: content.trim(),
      created_at: new Date().toISOString()
    };
    setChatMessages(prev => [...prev, msg]);
    publishMsg(SIGNAL_TOPIC_PREFIX + currentRoomRef.current.room_code, {
      type: 'chat',
      message: msg,
      from: myIdRef.current
    });
  };

  return (
    <VoiceRoomContext.Provider value={{
      currentRoom, participants, isMuted, isDeafened,
      activeSpeakers, chatMessages, connectionStatus,
      createRoom, joinRoom, leaveRoom,
      toggleMute, toggleDeafen, sendChatMessage,
    }}>
      {children}
    </VoiceRoomContext.Provider>
  );
}

export function useVoiceRoom() {
  const ctx = useContext(VoiceRoomContext);
  if (!ctx) throw new Error('useVoiceRoom must be used within VoiceRoomProvider');
  return ctx;
}
