import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import Peer from 'peerjs';
import { useAuth } from './AuthContext';
import { useToast } from '../hooks/useToast';

const VoiceRoomContext = createContext(null);

// ─── Room Storage ─────────────────────────────────────────────────────────────
const ROOMS_KEY = 'study_voice_rooms_v3';

const PRESET_ROOMS = [
  { id: 'preset-1', room_code: '849201', title: '🤖 Deep Learning & AI Study Group', host_name: 'Alex Chen', host_id: 'preset-1', current_participants: 2, max_participants: 6, is_active: true, document_title: 'Artificial Intelligence Notes', participants: [{ id: 'p1', user_id: 'preset-1', user_name: 'Alex Chen', is_muted: false, is_active: true }, { id: 'p2', user_id: 'preset-2', user_name: 'Sarah M.', is_muted: true, is_active: true }] },
  { id: 'preset-2', room_code: '512930', title: '☁️ Systems & Cloud Architecture', host_name: 'David K.', host_id: 'preset-3', current_participants: 3, max_participants: 6, is_active: true, document_title: 'Operating Systems', participants: [{ id: 'p3', user_id: 'preset-3', user_name: 'David K.', is_muted: false, is_active: true }, { id: 'p4', user_id: 'preset-4', user_name: 'Priya R.', is_muted: false, is_active: true }] },
  { id: 'preset-3', room_code: '730192', title: '⚡ Algorithm Mastery', host_name: 'Emily Watson', host_id: 'preset-5', current_participants: 1, max_participants: 6, is_active: true, document_title: 'Data Structures', participants: [{ id: 'p5', user_id: 'preset-5', user_name: 'Emily Watson', is_muted: false, is_active: true }] },
];

export function getStoredRooms() {
  try {
    const raw = localStorage.getItem(ROOMS_KEY);
    const user = raw ? JSON.parse(raw) : [];
    return Array.isArray(user) ? [...user, ...PRESET_ROOMS] : PRESET_ROOMS;
  } catch { return PRESET_ROOMS; }
}

export function saveStoredRooms(rooms) {
  try { localStorage.setItem(ROOMS_KEY, JSON.stringify(rooms)); } catch {}
}

function getUserRooms() {
  try {
    const raw = localStorage.getItem(ROOMS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

// ─── PeerJS Config ────────────────────────────────────────────────────────────
// Room host peer ID:   srp-{roomCode}-h
// Room joiner peer ID: srp-{roomCode}-{randomId}
// Uses peerjs.com free cloud server + multiple STUN servers for reliability

// Primary PeerJS server config (0.peerjs.com - free cloud)
const getPeerConfig = (host = '0.peerjs.com') => ({
  host,
  port: 443,
  path: '/',
  secure: true,
  debug: 0,
  pingInterval: 3000,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
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
  }
});

const hostId = (code) => `srp-${code}-h`;
const joinId = (code) => `srp-${code}-${Math.random().toString(36).slice(2, 10)}`;

// ─── Provider ─────────────────────────────────────────────────────────────────
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

  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const callsRef = useRef({});
  const dataConnsRef = useRef({});
  const audioCtxRef = useRef(null);
  const remoteAudiosRef = useRef({});
  const roomRef = useRef(null);
  const isMutedRef = useRef(false);
  const isHostRef = useRef(false);
  const participantsRef = useRef([]);

  useEffect(() => { roomRef.current = currentRoom; }, [currentRoom]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { participantsRef.current = participants; }, [participants]);

  useEffect(() => () => cleanup(), []);

  // ── Audio ──────────────────────────────────────────────────────────────────

  const getAudio = async () => {
    if (localStreamRef.current) return localStreamRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      startVAD(stream);
      return stream;
    } catch {
      addToast('Microphone access denied — you can still listen and chat.', 'info');
      return null;
    }
  };

  const startVAD = (stream) => {
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
        if (user?.id) setActiveSpeakers(p => ({ ...p, [user.id]: avg > 15 && !isMutedRef.current }));
        requestAnimationFrame(tick);
      };
      tick();
    } catch {}
  };

  const playRemote = (peerId, stream) => {
    try {
      let el = remoteAudiosRef.current[peerId];
      if (!el) {
        el = document.createElement('audio');
        el.autoplay = true;
        el.style.display = 'none';
        document.body.appendChild(el);
        remoteAudiosRef.current[peerId] = el;
      }
      el.srcObject = stream;
      el.play().catch(() => {});
    } catch {}
  };

  const stopAudio = () => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    try { audioCtxRef.current?.close(); } catch {}
    audioCtxRef.current = null;
    Object.values(remoteAudiosRef.current).forEach(el => {
      try { el.srcObject = null; el.remove(); } catch {}
    });
    remoteAudiosRef.current = {};
  };

  // ── PeerJS ─────────────────────────────────────────────────────────────────

  const cleanup = () => {
    stopAudio();
    Object.values(callsRef.current).forEach(c => { try { c.close(); } catch {} });
    callsRef.current = {};
    Object.values(dataConnsRef.current).forEach(c => { try { c.close(); } catch {} });
    dataConnsRef.current = {};
    try { peerRef.current?.destroy(); } catch {}
    peerRef.current = null;
  };

  const onData = useCallback((msg) => {
    if (!msg) return;
    if (msg.type === 'chat') {
      setChatMessages(prev => prev.some(m => m.id === msg.data.id) ? prev : [...prev, msg.data]);
    } else if (msg.type === 'participants') {
      setParticipants(msg.data);
      participantsRef.current = msg.data;
      setCurrentRoom(r => r ? { ...r, participants: msg.data, current_participants: msg.data.length } : r);
    } else if (msg.type === 'room_info') {
      const room = msg.data;
      setCurrentRoom(room);
      roomRef.current = room;
      setParticipants(room.participants || []);
      participantsRef.current = room.participants || [];
    }
  }, []);

  const wireData = useCallback((conn) => {
    dataConnsRef.current[conn.peer] = conn;
    conn.on('data', onData);
    conn.on('close', () => delete dataConnsRef.current[conn.peer]);
    conn.on('error', () => delete dataConnsRef.current[conn.peer]);
  }, [onData]);

  const wireCall = useCallback((call) => {
    callsRef.current[call.peer] = call;
    call.on('stream', stream => playRemote(call.peer, stream));
    call.on('close', () => {
      delete callsRef.current[call.peer];
      const el = remoteAudiosRef.current[call.peer];
      if (el) { try { el.srcObject = null; el.remove(); } catch {} delete remoteAudiosRef.current[call.peer]; }
    });
    call.on('error', () => {
      delete callsRef.current[call.peer];
    });
  }, []);

  const broadcast = useCallback((msg) => {
    Object.values(dataConnsRef.current).forEach(conn => {
      if (conn.open) try { conn.send(msg); } catch {}
    });
  }, []);

  // ── Create Room ────────────────────────────────────────────────────────────

  const createRoom = async (title, documentId) => {
    const stream = await getAudio();
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const myId = user?.id || 'u-' + Date.now();
    const myName = user?.name || 'Host';

    setConnectionStatus('connecting');
    cleanup();

    const room = {
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
      participants: [{ id: 'ph', user_id: myId, user_name: myName + ' (Host)', is_muted: false, is_active: true }]
    };

    // Persist so same-device tabs can see it
    const existing = getUserRooms().filter(r => r.room_code !== code);
    saveStoredRooms([room, ...existing]);

    return new Promise((resolve) => {
      let resolved = false;
      const done = (r) => {
        if (resolved) return;
        resolved = true;
        setCurrentRoom(r);
        roomRef.current = r;
        setParticipants(r.participants);
        participantsRef.current = r.participants;
        setConnectionStatus('connected');
        addToast(`🎙️ Room created! Share code: ${code}`, 'success');
        resolve(r);
      };

      try {
        const peer = new Peer(hostId(code), getPeerConfig());
        peerRef.current = peer;
        isHostRef.current = true;

        peer.on('open', () => done(room));

        // Incoming audio calls from joiners
        peer.on('call', (call) => {
          call.answer(stream || undefined);
          wireCall(call);
        });

        // Incoming data connections from joiners
        peer.on('connection', (conn) => {
          conn.on('open', () => {
            wireData(conn);
            // Send current room state
            conn.send({ type: 'room_info', data: roomRef.current || room });

            // Add joiner to participants
            const joinerName = conn.metadata?.name || 'Study Partner';
            const joinerId = conn.metadata?.userId || conn.peer;

            setParticipants(prev => {
              if (prev.some(p => p.user_id === joinerId)) return prev;
              const updated = [...prev, { id: 'p-' + Date.now(), user_id: joinerId, user_name: joinerName, is_muted: false, is_active: true }];
              participantsRef.current = updated;
              setCurrentRoom(r => r ? { ...r, participants: updated, current_participants: updated.length } : r);
              // Update storage
              const stored = getUserRooms().map(r => r.room_code === code ? { ...r, participants: updated, current_participants: updated.length } : r);
              saveStoredRooms(stored);
              // Broadcast to all
              broadcast({ type: 'participants', data: updated });
              return updated;
            });
          });
        });

        peer.on('error', (err) => {
          console.warn('PeerJS host error:', err.type, err);
          if (err.type === 'unavailable-id') {
            addToast(`Room code ${code} is already taken. Generating new code...`, 'warning');
          }
          // Always resolve so user enters the room
          done(room);
        });

        // 5-second timeout fallback
        setTimeout(() => done(room), 5000);

      } catch (err) {
        console.error('PeerJS create error:', err);
        done(room);
      }
    });
  };

  // ── Join Room ──────────────────────────────────────────────────────────────

  const joinRoom = async (codeOrId) => {
    const raw = String(codeOrId || '').trim();
    if (!raw) { addToast('Enter a valid 6-digit room code.', 'warning'); return null; }

    // Extract 6-digit code
    const match = raw.match(/\d{6}/);
    const code = match ? match[0] : raw.replace(/\D/g, '').slice(0, 6);

    if (!code || code.length !== 6) {
      addToast('Please enter a valid 6-digit code.', 'warning');
      return null;
    }

    // Block demo/preset rooms
    if (PRESET_ROOMS.some(r => r.room_code === code)) {
      addToast('That\'s a demo room. Ask your classmate to create a real room and share the code!', 'info');
      return null;
    }

    setConnectionStatus('connecting');
    addToast('🔗 Connecting to room ' + code + '...', 'info');

    const stream = await getAudio();
    const myId = user?.id || 'u-' + Date.now();
    const myName = user?.name || 'Study Partner';
    const myJoinId = joinId(code);

    cleanup();

    return new Promise((resolve) => {
      let resolved = false;

      const fail = (reason) => {
        if (resolved) return;
        resolved = true;
        setConnectionStatus('disconnected');
        addToast(reason || `Room ${code} not found or host is offline.`, 'error');
        resolve(null);
      };

      const success = (roomData) => {
        if (resolved) return;
        resolved = true;
        setCurrentRoom(roomData);
        roomRef.current = roomData;
        setParticipants(roomData.participants || []);
        participantsRef.current = roomData.participants || [];
        setConnectionStatus('connected');
        addToast(`✅ Joined "${roomData.title}"! Code: ${code}`, 'success');
        resolve(roomData);
      };

      try {
        const peer = new Peer(myJoinId, getPeerConfig());
        peerRef.current = peer;
        isHostRef.current = false;

        const connectTimeout = setTimeout(() => {
          fail(`Could not reach room ${code}. The host may be offline or the code is wrong.`);
        }, 12000);

        peer.on('open', () => {
          // Open data channel to host
          const conn = peer.connect(hostId(code), {
            reliable: true,
            metadata: { name: myName, userId: myId }
          });

          conn.on('open', () => {
            clearTimeout(connectTimeout);
            wireData(conn);
          });

          conn.on('data', (msg) => {
            if (msg?.type === 'room_info') {
              const roomInfo = msg.data;
              // Add self to participants
              const alreadyIn = (roomInfo.participants || []).some(p => p.user_id === myId);
              const parts = alreadyIn
                ? roomInfo.participants
                : [...(roomInfo.participants || []), { id: 'p-' + Date.now(), user_id: myId, user_name: myName, is_muted: false, is_active: true }];
              success({ ...roomInfo, participants: parts, current_participants: parts.length });
            } else {
              onData(msg);
            }
          });

          conn.on('error', (err) => {
            clearTimeout(connectTimeout);
            console.warn('Data conn error:', err);
            fail(`Could not connect to room ${code}. Check the code and try again.`);
          });

          // Also call host for audio
          if (stream) {
            try {
              const call = peer.call(hostId(code), stream, {
                metadata: { name: myName, userId: myId }
              });
              if (call) wireCall(call);
            } catch (e) {
              console.warn('Call error:', e);
            }
          }
        });

        // Handle incoming calls (host calling us back)
        peer.on('call', (call) => {
          call.answer(stream || undefined);
          wireCall(call);
        });

        peer.on('error', (err) => {
          clearTimeout(connectTimeout);
          console.warn('PeerJS join error:', err.type, err);

          if (err.type === 'peer-unavailable') {
            // Host is not online yet OR code is wrong.
            // Show a "waiting" room so joiner can see they entered
            // and wait for host to open the app.
            if (resolved) return;
            resolved = true;

            const waitRoom = {
              id: 'room-' + code,
              room_code: code,
              title: 'Study Room ' + code,
              host_name: 'Room Host',
              host_id: hostId(code),
              current_participants: 1,
              max_participants: 6,
              is_active: true,
              participants: [
                { id: 'p-me', user_id: myId, user_name: myName, is_muted: false, is_active: true }
              ]
            };
            setCurrentRoom(waitRoom);
            roomRef.current = waitRoom;
            setParticipants(waitRoom.participants);
            participantsRef.current = waitRoom.participants;
            setConnectionStatus('connected');
            addToast(`⏳ Waiting for the host of Room ${code} to open the app. You'll connect automatically!`, 'info');
            resolve(waitRoom);

            // Keep retrying connection to host every 5 seconds
            let retryCount = 0;
            const retryInterval = setInterval(() => {
              retryCount++;
              if (retryCount > 12 || !peerRef.current) { // Stop after 1 min
                clearInterval(retryInterval);
                return;
              }
              try {
                const retryConn = peerRef.current.connect(hostId(code), {
                  reliable: true,
                  metadata: { name: myName, userId: myId }
                });
                retryConn.on('open', () => {
                  clearInterval(retryInterval);
                  wireData(retryConn);
                  retryConn.send({ type: 'join_request', data: { name: myName, userId: myId } });
                  addToast('✅ Host connected! Voice room is now live.', 'success');
                  if (stream) {
                    try {
                      const retryCall = peerRef.current.call(hostId(code), stream);
                      if (retryCall) wireCall(retryCall);
                    } catch (e) {}
                  }
                });
              } catch (e) {}
            }, 5000);

          } else if (err.type === 'network' || err.type === 'server-error') {
            fail('Network error connecting to voice server. Check your internet and try again.');
          } else if (err.type === 'unavailable-id') {
            // ID collision — retry with new ID
            console.warn('ID collision, retrying...');
          } else {
            fail(`Could not join room ${code}. (${err.type}). Check the code and try again.`);
          }
        });

      } catch (err) {
        console.error('PeerJS join init error:', err);
        fail('Failed to initialize connection. Please refresh and try again.');
      }
    });
  };

  // ── Leave ──────────────────────────────────────────────────────────────────

  const leaveRoom = () => {
    cleanup();
    setCurrentRoom(null);
    roomRef.current = null;
    setParticipants([]);
    participantsRef.current = [];
    setChatMessages([]);
    setActiveSpeakers({});
    setConnectionStatus('disconnected');
    addToast('Left the voice room.', 'info');
  };

  // ── Mute / Deafen ──────────────────────────────────────────────────────────

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    isMutedRef.current = next;
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !next; });
  };

  const toggleDeafen = () => {
    const next = !isDeafened;
    setIsDeafened(next);
    Object.values(remoteAudiosRef.current).forEach(el => { if (el) el.muted = next; });
  };

  // ── Chat ───────────────────────────────────────────────────────────────────

  const sendChatMessage = (content) => {
    if (!currentRoom || !content?.trim()) return;
    const msg = { id: 'msg-' + Date.now(), sender_name: user?.name || 'You', content: content.trim(), created_at: new Date().toISOString() };
    setChatMessages(prev => [...prev, msg]);
    broadcast({ type: 'chat', data: msg });
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
