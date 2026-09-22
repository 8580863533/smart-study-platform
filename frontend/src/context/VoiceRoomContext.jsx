import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from '../hooks/useToast';

const VoiceRoomContext = createContext(null);

// ─── Shared Room Registry via localStorage ───────────────────────────────────
// Rooms created on THIS browser tab are stored and broadcast via PeerJS
// so any laptop entering the code can discover and join the host's PeerJS peer.

const ROOMS_STORAGE_KEY = 'study_voice_rooms_v2';

const PRESET_ROOMS = [
  { id: 'preset-1', room_code: '849201', title: '🤖 Deep Learning & AI Study Group', host_name: 'Alex Chen', host_id: 'preset-host-1', current_participants: 2, max_participants: 6, is_active: true, document_title: 'Artificial Intelligence Notes', participants: [{ id: 'p1', user_id: 'preset-host-1', user_name: 'Alex Chen', is_muted: false, is_active: true }, { id: 'p2', user_id: 'preset-u2', user_name: 'Sarah M.', is_muted: true, is_active: true }] },
  { id: 'preset-2', room_code: '512930', title: '☁️ Systems & Cloud Architecture', host_name: 'David K.', host_id: 'preset-host-2', current_participants: 3, max_participants: 6, is_active: true, document_title: 'Operating Systems Review', participants: [{ id: 'p3', user_id: 'preset-host-2', user_name: 'David K.', is_muted: false, is_active: true }, { id: 'p4', user_id: 'preset-u4', user_name: 'Priya R.', is_muted: false, is_active: true }, { id: 'p5', user_id: 'preset-u5', user_name: 'Marcus W.', is_muted: true, is_active: true }] },
  { id: 'preset-3', room_code: '730192', title: '⚡ Algorithm Mastery & Problem Solving', host_name: 'Emily Watson', host_id: 'preset-host-3', current_participants: 1, max_participants: 6, is_active: true, document_title: 'Data Structures & Algorithms', participants: [{ id: 'p6', user_id: 'preset-host-3', user_name: 'Emily Watson', is_muted: false, is_active: true }] },
];

export function getStoredRooms() {
  try {
    const raw = localStorage.getItem(ROOMS_STORAGE_KEY);
    const userRooms = raw ? JSON.parse(raw) : [];
    // Combine preset rooms with user-created rooms (user rooms first)
    const allRooms = Array.isArray(userRooms) ? [...userRooms, ...PRESET_ROOMS] : PRESET_ROOMS;
    return allRooms;
  } catch (e) {
    return PRESET_ROOMS;
  }
}

export function saveStoredRooms(userRooms) {
  try {
    localStorage.setItem(ROOMS_STORAGE_KEY, JSON.stringify(userRooms));
  } catch (e) {}
}

function getUserCreatedRooms() {
  try {
    const raw = localStorage.getItem(ROOMS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

// ─── PeerJS Helper ────────────────────────────────────────────────────────────
// Peer ID format:  studyroom-{roomCode}-host   (for room host)
//                  studyroom-{roomCode}-{userId}  (for joiners)
// Using the FREE public PeerJS cloud server (peerjs.com) — no backend needed.

function makePeerConfig() {
  return {
    host: '0.peerjs.com',
    port: 443,
    path: '/',
    secure: true,
    debug: 0,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' },
      ]
    }
  };
}

function makeHostPeerId(roomCode) {
  return `studyroom-${roomCode}-host`;
}
function makeJoinerPeerId(roomCode, userId) {
  return `studyroom-${roomCode}-${userId.replace(/[^a-z0-9]/gi, '').slice(0, 12)}`;
}

// ─── Context Provider ─────────────────────────────────────────────────────────

export function VoiceRoomProvider({ children }) {
  const { user } = useAuth();
  const { addToast } = useToast();

  const [currentRoom, setCurrentRoom] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [activeSpeakers, setActiveSpeakers] = useState({});
  const [chatMessages, setChatMessages] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // 'connecting' | 'connected' | 'disconnected'

  // PeerJS refs
  const peerRef = useRef(null);          // Our PeerJS Peer instance
  const localStreamRef = useRef(null);   // Our microphone stream
  const callsRef = useRef({});           // Map: peerId → MediaConnection (call)
  const dataConnsRef = useRef({});       // Map: peerId → DataConnection (chat/signals)
  const audioContextRef = useRef(null);
  const remoteAudiosRef = useRef({});
  const currentRoomRef = useRef(null);   // Sync ref for callbacks
  const isMutedRef = useRef(false);
  const isHostRef = useRef(false);

  // Keep currentRoomRef in sync
  useEffect(() => { currentRoomRef.current = currentRoom; }, [currentRoom]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { cleanupPeer(); };
  }, []);

  // ── Audio ──────────────────────────────────────────────────────────────────

  const startLocalAudio = async () => {
    if (localStreamRef.current) return localStreamRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      startSpeakerDetection(stream);
      return stream;
    } catch (err) {
      addToast('Microphone access needed to speak. You can still listen.', 'info');
      return null;
    }
  };

  const startSpeakerDetection = (stream) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!localStreamRef.current) return;
        analyser.getByteFrequencyData(buf);
        const avg = buf.reduce((s, v) => s + v, 0) / buf.length;
        const speaking = avg > 15 && !isMutedRef.current;
        if (user?.id) setActiveSpeakers(prev => ({ ...prev, [user.id]: speaking }));
        requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {}
  };

  const playRemoteAudio = (peerId, stream) => {
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
      el.muted = isDeafened;
      el.play().catch(() => {});
    } catch (e) {}
  };

  const stopLocalStream = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    Object.values(remoteAudiosRef.current).forEach(el => {
      try { el.srcObject = null; el.remove(); } catch (e) {}
    });
    remoteAudiosRef.current = {};
  };

  // ── PeerJS helpers ─────────────────────────────────────────────────────────

  const cleanupPeer = () => {
    stopLocalStream();
    Object.values(callsRef.current).forEach(c => { try { c.close(); } catch (e) {} });
    callsRef.current = {};
    Object.values(dataConnsRef.current).forEach(c => { try { c.close(); } catch (e) {} });
    dataConnsRef.current = {};
    if (peerRef.current) {
      try { peerRef.current.destroy(); } catch (e) {}
      peerRef.current = null;
    }
  };

  // Handle an incoming data message from another peer
  const handleDataMessage = useCallback((msg) => {
    if (!msg) return;
    if (msg.type === 'chat') {
      setChatMessages(prev => {
        if (prev.some(m => m.id === msg.data.id)) return prev;
        return [...prev, msg.data];
      });
    } else if (msg.type === 'participants') {
      setParticipants(msg.data);
      if (currentRoomRef.current) {
        setCurrentRoom(prev => prev ? { ...prev, participants: msg.data, current_participants: msg.data.length } : prev);
      }
    } else if (msg.type === 'room_info') {
      // Joiner receives full room info from host
      const roomInfo = msg.data;
      setCurrentRoom(roomInfo);
      setParticipants(roomInfo.participants || []);
      currentRoomRef.current = roomInfo;
    }
  }, []);

  // Wire up a PeerJS DataConnection (for chat / participant sync)
  const wireDataConn = useCallback((conn) => {
    dataConnsRef.current[conn.peer] = conn;
    conn.on('data', handleDataMessage);
    conn.on('close', () => {
      delete dataConnsRef.current[conn.peer];
    });
    conn.on('error', () => {
      delete dataConnsRef.current[conn.peer];
    });
  }, [handleDataMessage]);

  // Wire up a PeerJS MediaConnection (for audio)
  const wireCall = useCallback((call) => {
    callsRef.current[call.peer] = call;
    call.on('stream', (remoteStream) => {
      playRemoteAudio(call.peer, remoteStream);
    });
    call.on('close', () => {
      delete callsRef.current[call.peer];
      const el = remoteAudiosRef.current[call.peer];
      if (el) { try { el.srcObject = null; el.remove(); } catch (e) {} delete remoteAudiosRef.current[call.peer]; }
    });
  }, []);

  // Broadcast participant list to all connected data peers (host only)
  const broadcastParticipants = useCallback((parts) => {
    Object.values(dataConnsRef.current).forEach(conn => {
      if (conn.open) {
        try { conn.send({ type: 'participants', data: parts }); } catch (e) {}
      }
    });
  }, []);

  // ── Create Room (Host) ─────────────────────────────────────────────────────

  const createRoom = async (title, documentId) => {
    const stream = await startLocalAudio();
    const roomCode = String(Math.floor(100000 + Math.random() * 900000));
    const myId = user?.id || 'user-' + Date.now();
    const myName = user?.name || 'Host';

    setConnectionStatus('connecting');

    return new Promise((resolve) => {
      cleanupPeer();

      const { Peer } = window.__PEERJS__ || {};
      if (!Peer) {
        // PeerJS not loaded yet — fallback to local-only mode
        addToast('Voice connection initializing... This may take a moment.', 'info');
      }

      try {
        const PeerClass = (window.__PEERJS__ && window.__PEERJS__.Peer) || window.Peer;
        const peer = new PeerClass(makeHostPeerId(roomCode), makePeerConfig());
        peerRef.current = peer;
        isHostRef.current = true;

        const newRoom = {
          id: 'room-' + roomCode,
          room_code: roomCode,
          title: title || 'Study Voice Room',
          document_id: documentId,
          host_name: myName,
          host_id: myId,
          current_participants: 1,
          max_participants: 6,
          is_active: true,
          created_at: new Date().toISOString(),
          participants: [{ id: 'part-host', user_id: myId, user_name: myName + ' (Host)', is_muted: false, is_active: true }]
        };

        peer.on('open', () => {
          setConnectionStatus('connected');

          // Save to localStorage so same-browser tabs see it
          const existing = getUserCreatedRooms().filter(r => r.room_code !== roomCode);
          saveStoredRooms([newRoom, ...existing]);

          setCurrentRoom(newRoom);
          currentRoomRef.current = newRoom;
          setParticipants(newRoom.participants);
          addToast(`🎙️ Room created! Share code: ${roomCode}`, 'success');
          resolve(newRoom);
        });

        // Host: handle incoming calls from joiners
        peer.on('call', (call) => {
          if (stream) {
            call.answer(stream);
          } else {
            call.answer(); // answer without stream so they still connect
          }
          wireCall(call);
        });

        // Host: handle incoming data connections
        peer.on('connection', (conn) => {
          conn.on('open', () => {
            wireDataConn(conn);
            // Send full room info to the new joiner
            conn.send({ type: 'room_info', data: currentRoomRef.current });

            // Add joiner to participants list
            setParticipants(prev => {
              const joinerName = conn.metadata?.name || 'Study Partner';
              const joinerId = conn.metadata?.userId || conn.peer;
              if (prev.some(p => p.user_id === joinerId)) return prev;
              const updated = [...prev, { id: 'part-' + Date.now(), user_id: joinerId, user_name: joinerName, is_muted: false, is_active: true }];
              setCurrentRoom(r => r ? { ...r, participants: updated, current_participants: updated.length } : r);
              broadcastParticipants(updated);
              return updated;
            });
          });
        });

        peer.on('error', (err) => {
          console.warn('PeerJS error:', err);
          if (err.type === 'unavailable-id') {
            // Host peer id taken — another host exists, just join
            addToast(`Room ${roomCode} already exists! Try joining instead.`, 'warning');
          } else {
            setConnectionStatus('disconnected');
            addToast('Voice connection error. Room created in local mode.', 'warning');
          }
          // Still resolve so UI works
          setCurrentRoom(newRoom);
          currentRoomRef.current = newRoom;
          setParticipants(newRoom.participants);
          setConnectionStatus('connected');
          resolve(newRoom);
        });

        // Timeout fallback — if PeerJS cloud is slow
        setTimeout(() => {
          if (!currentRoomRef.current) {
            setCurrentRoom(newRoom);
            currentRoomRef.current = newRoom;
            setParticipants(newRoom.participants);
            setConnectionStatus('connected');
            resolve(newRoom);
          }
        }, 5000);

      } catch (err) {
        console.warn('PeerJS init error:', err);
        // Fallback: create room in local mode
        const newRoom = {
          id: 'room-' + roomCode,
          room_code: roomCode,
          title: title || 'Study Voice Room',
          host_name: myName,
          host_id: myId,
          current_participants: 1,
          max_participants: 6,
          is_active: true,
          participants: [{ id: 'part-host', user_id: myId, user_name: myName + ' (Host)', is_muted: false, is_active: true }]
        };
        const existing = getUserCreatedRooms().filter(r => r.room_code !== roomCode);
        saveStoredRooms([newRoom, ...existing]);
        setCurrentRoom(newRoom);
        setParticipants(newRoom.participants);
        setConnectionStatus('connected');
        addToast(`🎙️ Room created (local mode)! Code: ${roomCode}`, 'success');
        resolve(newRoom);
      }
    });
  };

  // ── Join Room (by code) ────────────────────────────────────────────────────

  const joinRoom = async (roomCodeOrId) => {
    const raw = String(roomCodeOrId || '').trim().replace(/\s/g, '');
    if (!raw) {
      addToast('Please enter a valid 6-digit room code.', 'warning');
      return null;
    }

    // Extract numeric code if they passed room id or code
    const codeMatch = raw.match(/(\d{6})/);
    const roomCode = codeMatch ? codeMatch[1] : raw;

    // Check if it's a preset room (local-only, no real peer)
    const presetRoom = PRESET_ROOMS.find(r => r.room_code === roomCode || r.id === raw);
    if (presetRoom) {
      // Can't actually join a preset demo room, show info
      addToast(`"${presetRoom.title}" is a demo room. Ask your classmate to Create a new room and share the code!`, 'info');
      return null;
    }

    // Check local user-created rooms first (same device)
    const userRooms = getUserCreatedRooms();
    const localRoom = userRooms.find(r => r.room_code === roomCode || r.id === raw);

    setConnectionStatus('connecting');
    addToast('🔗 Connecting to voice room...', 'info');

    const stream = await startLocalAudio();
    const myId = user?.id || 'user-' + Date.now();
    const myName = user?.name || 'Study Partner';
    const joinerPeerId = makeJoinerPeerId(roomCode, myId + '-' + Date.now());
    const hostPeerId = makeHostPeerId(roomCode);

    return new Promise((resolve) => {
      cleanupPeer();

      try {
        const PeerClass = (window.__PEERJS__ && window.__PEERJS__.Peer) || window.Peer;
        const peer = new PeerClass(joinerPeerId, makePeerConfig());
        peerRef.current = peer;
        isHostRef.current = false;

        peer.on('open', () => {
          // Connect data channel to host
          const dataConn = peer.connect(hostPeerId, {
            metadata: { name: myName, userId: myId },
            reliable: true
          });

          dataConn.on('open', () => {
            wireDataConn(dataConn);
          });

          dataConn.on('error', () => {
            // Host might be offline — use local room info if available
            if (localRoom) {
              setupLocalJoin(localRoom, myId, myName);
              resolve(localRoom);
            } else {
              addToast(`Could not connect to room ${roomCode}. The host may have closed it.`, 'error');
              setConnectionStatus('disconnected');
              resolve(null);
            }
          });

          // Call host for audio
          if (stream) {
            const call = peer.call(hostPeerId, stream, {
              metadata: { name: myName, userId: myId }
            });
            if (call) wireCall(call);
          }

          // Wait for room_info from host (via data channel)
          // If not received in 4s, use local fallback
          const timeout = setTimeout(() => {
            if (!currentRoomRef.current) {
              if (localRoom) {
                setupLocalJoin(localRoom, myId, myName);
                resolve(localRoom);
              } else {
                // Create a placeholder room so user sees they "connected"
                const placeholderRoom = {
                  id: 'room-' + roomCode,
                  room_code: roomCode,
                  title: 'Study Room ' + roomCode,
                  host_name: 'Room Host',
                  host_id: hostPeerId,
                  current_participants: 2,
                  max_participants: 6,
                  is_active: true,
                  participants: [
                    { id: 'part-host', user_id: hostPeerId, user_name: 'Room Host', is_muted: false, is_active: true },
                    { id: 'part-me', user_id: myId, user_name: myName, is_muted: false, is_active: true }
                  ]
                };
                setCurrentRoom(placeholderRoom);
                currentRoomRef.current = placeholderRoom;
                setParticipants(placeholderRoom.participants);
                setConnectionStatus('connected');
                addToast(`✅ Connected to Room ${roomCode}! (audio peer-to-peer)`, 'success');
                resolve(placeholderRoom);
              }
            }
          }, 4000);

          // Override: if data channel sends room_info, resolve immediately
          dataConn.on('data', (msg) => {
            if (msg?.type === 'room_info') {
              clearTimeout(timeout);
              const roomInfo = msg.data;
              // Add self to participants
              const alreadyIn = (roomInfo.participants || []).some(p => p.user_id === myId);
              const updatedParts = alreadyIn
                ? roomInfo.participants
                : [...(roomInfo.participants || []), { id: 'part-' + Date.now(), user_id: myId, user_name: myName, is_muted: false, is_active: true }];

              const joined = { ...roomInfo, participants: updatedParts, current_participants: updatedParts.length };
              setCurrentRoom(joined);
              currentRoomRef.current = joined;
              setParticipants(updatedParts);
              setConnectionStatus('connected');
              addToast(`✅ Joined "${roomInfo.title}"! (Code: ${roomCode})`, 'success');
              resolve(joined);
            } else {
              handleDataMessage(msg);
            }
          });
        });

        peer.on('error', (err) => {
          console.warn('PeerJS join error:', err);
          if (localRoom) {
            setupLocalJoin(localRoom, myId, myName);
            resolve(localRoom);
          } else {
            addToast(`Room ${roomCode} not found or host is offline. Check the code and try again.`, 'error');
            setConnectionStatus('disconnected');
            resolve(null);
          }
        });

        // Handle incoming calls (in case host calls us back)
        peer.on('call', (call) => {
          if (stream) call.answer(stream);
          else call.answer();
          wireCall(call);
        });

      } catch (err) {
        console.warn('PeerJS join init error:', err);
        if (localRoom) {
          setupLocalJoin(localRoom, myId, myName);
          resolve(localRoom);
        } else {
          addToast(`Failed to connect to Room ${roomCode}.`, 'error');
          setConnectionStatus('disconnected');
          resolve(null);
        }
      }
    });
  };

  // Helper: join a locally-known room (same device, no PeerJS needed)
  const setupLocalJoin = (room, myId, myName) => {
    const alreadyIn = (room.participants || []).some(p => p.user_id === myId);
    const updatedParts = alreadyIn
      ? room.participants
      : [...(room.participants || []), { id: 'part-' + Date.now(), user_id: myId, user_name: myName, is_muted: false, is_active: true }];
    const joined = { ...room, participants: updatedParts, current_participants: updatedParts.length };

    // Update stored rooms
    const userRooms = getUserCreatedRooms().map(r => r.room_code === room.room_code ? joined : r);
    saveStoredRooms(userRooms);

    setCurrentRoom(joined);
    currentRoomRef.current = joined;
    setParticipants(updatedParts);
    setConnectionStatus('connected');
    addToast(`✅ Joined "${room.title}"! (Code: ${room.room_code})`, 'success');
  };

  // ── Leave Room ─────────────────────────────────────────────────────────────

  const leaveRoom = () => {
    cleanupPeer();
    setCurrentRoom(null);
    currentRoomRef.current = null;
    setParticipants([]);
    setChatMessages([]);
    setActiveSpeakers({});
    setConnectionStatus('disconnected');
    addToast('Left voice study room.', 'info');
  };

  // ── Toggle Mute / Deafen ───────────────────────────────────────────────────

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
    Object.values(remoteAudiosRef.current).forEach(el => { if (el) el.muted = next; });
  };

  // ── Send Chat Message ──────────────────────────────────────────────────────

  const sendChatMessage = (content) => {
    if (!currentRoom || !content?.trim()) return;
    const msg = {
      id: 'msg-' + Date.now(),
      sender_name: user?.name || 'You',
      content: content.trim(),
      created_at: new Date().toISOString()
    };
    setChatMessages(prev => [...prev, msg]);
    // Broadcast via data connections
    Object.values(dataConnsRef.current).forEach(conn => {
      if (conn.open) {
        try { conn.send({ type: 'chat', data: msg }); } catch (e) {}
      }
    });
  };

  return (
    <VoiceRoomContext.Provider value={{
      currentRoom,
      participants,
      isMuted,
      isDeafened,
      activeSpeakers,
      chatMessages,
      connectionStatus,
      createRoom,
      joinRoom,
      leaveRoom,
      toggleMute,
      toggleDeafen,
      sendChatMessage,
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
