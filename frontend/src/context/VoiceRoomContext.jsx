import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from '../hooks/useToast';

const VoiceRoomContext = createContext(null);

const GLOBAL_ROOMS_TOPIC = 'study_global_voice_rooms_v2';
const SIGNAL_TOPIC_PREFIX = 'study_vroom_sig_v2_';

// ── Step 1: STUN + TURN Server Configuration ──────────────────────────────────
const RTC_CONFIG = {
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
  ],
  iceCandidatePoolSize: 10,
};

// ── Step 1: High-Fidelity Audio Constraints (Echo Cancellation + AGC + Opus) ─
const AUDIO_CONSTRAINTS = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
  video: false
};

const PRESET_ROOMS = [
  { id: 'preset-1', room_code: '849201', title: '🤖 Deep Learning & AI Study Group', host_name: 'Alex Chen', host_id: 'p-host-1', current_participants: 2, max_participants: 6, is_active: true, document_title: 'Artificial Intelligence Notes', is_demo: true, participants: [{ id: 'p1', user_id: 'p-host-1', user_name: 'Alex Chen', is_muted: false, is_active: true }, { id: 'p2', user_id: 'p-u2', user_name: 'Sarah M.', is_muted: true, is_active: true }] },
  { id: 'preset-2', room_code: '512930', title: '☁️ Systems & Cloud Architecture', host_name: 'David K.', host_id: 'p-host-2', current_participants: 3, max_participants: 6, is_active: true, document_title: 'Operating Systems Review', is_demo: true, participants: [{ id: 'p3', user_id: 'p-host-2', user_name: 'David K.', is_muted: false, is_active: true }, { id: 'p4', user_id: 'p-u4', user_name: 'Priya R.', is_muted: false, is_active: true }] },
  { id: 'preset-3', room_code: '730192', title: '⚡ Algorithm Mastery & Problem Solving', host_name: 'Emily Watson', host_id: 'p-host-3', current_participants: 1, max_participants: 6, is_active: true, document_title: 'Data Structures & Algorithms', is_demo: true, participants: [{ id: 'p5', user_id: 'p-host-3', user_name: 'Emily Watson', is_muted: false, is_active: true }] },
];

export function getStoredRooms() {
  try {
    const raw = localStorage.getItem('study_rooms_cache_v2');
    const cached = raw ? JSON.parse(raw) : [];
    if (Array.isArray(cached) && cached.length > 0) {
      return [...cached, ...PRESET_ROOMS];
    }
  } catch (e) {}
  return PRESET_ROOMS;
}

// ── Web Audio Chimes (Discord-Style Sound Effects) ─────────────────────────────
function playChime(type) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    if (type === 'join') {
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === 'leave') {
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.exponentialRampToValueAtTime(330, now + 0.15);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === 'knock') {
      osc.frequency.setValueAtTime(587.33, now);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.18);
    }
  } catch (e) {}
}

// ── FIX: publishSignal uses text/plain so ntfy.sh delivers the JSON as the message body ──
// ntfy.sh with Content-Type: application/json interprets the body as a notification
// meta-object (looking for "topic", "message" fields) and does NOT relay the payload.
// With Content-Type: text/plain the entire body becomes the message string, which
// the WebSocket listener then parses correctly via payload.message.
async function publishSignal(topic, eventData) {
  try {
    await fetch(`https://ntfy.sh/${topic}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',   // KEY FIX: was 'application/json'
      },
      body: JSON.stringify(eventData),
      mode: 'cors'
    });
  } catch (err) {
    console.warn('Signaling publish error:', err);
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
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // 'disconnected' | 'waiting_approval' | 'connected'
  const [joinRequests, setJoinRequests] = useState([]);
  const [autoAdmit, setAutoAdmit] = useState(false);

  // ── Step 2: Screen Sharing State ───────────────────────────────────────────
  const [currentScreenSharer, setCurrentScreenSharer] = useState(null); // { peerId: string, userName: string } | null
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [localScreenStream, setLocalScreenStream] = useState(null);
  const [remoteScreenStream, setRemoteScreenStream] = useState(null);

  const localStreamRef = useRef(null);
  const localScreenStreamRef = useRef(null);
  const screenSendersRef = useRef({});   // map: targetPeerId -> RTCRtpSender
  const peerConnectionsRef = useRef({}); // map: peerId -> RTCPeerConnection
  const remoteAudiosRef = useRef({});    // map: peerId -> HTMLAudioElement
  const audioCtxRef = useRef(null);
  const currentRoomRef = useRef(null);
  const isMutedRef = useRef(false);
  const isDeafenedRef = useRef(false);
  const autoAdmitRef = useRef(false);
  const currentScreenSharerRef = useRef(null);
  const wsRef = useRef(null);
  const myPeerIdRef = useRef(null);
  // ── FIX: ICE candidate buffer — holds candidates received before remote description is set ──
  const pendingIceCandidatesRef = useRef({}); // map: peerId -> RTCIceCandidate[]
  // Track whether we have set remote description for each peer
  const remoteDescSetRef = useRef({}); // map: peerId -> bool

  useEffect(() => { currentRoomRef.current = currentRoom; }, [currentRoom]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { isDeafenedRef.current = isDeafened; }, [isDeafened]);
  useEffect(() => { autoAdmitRef.current = autoAdmit; }, [autoAdmit]);
  useEffect(() => { currentScreenSharerRef.current = currentScreenSharer; }, [currentScreenSharer]);
  useEffect(() => { localScreenStreamRef.current = localScreenStream; }, [localScreenStream]);

  useEffect(() => {
    myPeerIdRef.current = user?.id || 'u_' + Math.random().toString(36).slice(2, 9);
    return () => { cleanup(); };
  }, [user]);

  // ── Step 1: Microphone Capture & Audio Track Handling ──────────────────────
  const startLocalAudio = async () => {
    if (localStreamRef.current) return localStreamRef.current;
    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS);
      } catch (err) {
        // Fallback for devices that don't support custom audio constraints
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      }
      localStreamRef.current = stream;
      startVAD(stream);

      // Add audio tracks to all existing peer connections
      Object.values(peerConnectionsRef.current).forEach(pc => {
        stream.getAudioTracks().forEach(track => {
          try { pc.addTrack(track, stream); } catch (e) {}
        });
      });

      return stream;
    } catch (err) {
      console.warn('Microphone permission notice:', err);
      addToast('Microphone access not granted. You can still listen, chat, and share your screen.', 'info');
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
        const myId = myPeerIdRef.current;
        if (myId) {
          const isSpeaking = avg > 14 && !isMutedRef.current;
          setActiveSpeakers(prev => {
            if (prev[myId] === isSpeaking) return prev;
            return { ...prev, [myId]: isSpeaking };
          });
        }
        requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {}
  };

  // ── Step 1: Attach Remote Audio to <audio> Element with Autoplay Unlock ─────
  const playRemoteAudio = (peerId, stream) => {
    try {
      let el = remoteAudiosRef.current[peerId];
      if (!el) {
        el = document.createElement('audio');
        el.id = `remote-audio-${peerId}`;
        el.autoplay = true;
        el.playsInline = true;
        el.style.display = 'none';
        document.body.appendChild(el);
        remoteAudiosRef.current[peerId] = el;
      }
      el.srcObject = stream;
      el.muted = isDeafenedRef.current;
      const playPromise = el.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.warn('Audio autoplay wait:', err);
        });
      }
    } catch (e) {}
  };

  const unlockAudioContext = () => {
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
    Object.values(remoteAudiosRef.current).forEach(audioEl => {
      if (audioEl && audioEl.paused) {
        audioEl.play().catch(() => {});
      }
    });
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

  // ── Step 2: Controlled Screen Sharing (Only One Active Sharer) ───────────────
  const startScreenShare = async () => {
    unlockAudioContext();

    // Check if another participant is already sharing
    const currentSharer = currentScreenSharerRef.current;
    if (currentSharer && currentSharer.peerId !== myPeerIdRef.current) {
      addToast(`Screen share already active by ${currentSharer.userName}. Only one member can share at a time.`, 'warning');
      return false;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: true
      });

      const videoTrack = screenStream.getVideoTracks()[0];
      if (!videoTrack) return false;

      setLocalScreenStream(screenStream);
      setIsScreenSharing(true);

      const sharerInfo = {
        peerId: myPeerIdRef.current,
        userName: user?.name || 'Study Partner'
      };
      setCurrentScreenSharer(sharerInfo);
      currentScreenSharerRef.current = sharerInfo;

      // Broadcast screen-share-started event
      sendSignal({
        event: 'screen-share-started',
        from_peer_id: myPeerIdRef.current,
        user_name: user?.name || 'Study Partner',
        room_code: currentRoomRef.current?.room_code
      });

      // Add video track to all active peer connections & trigger renegotiation
      Object.entries(peerConnectionsRef.current).forEach(([targetPeerId, pc]) => {
        try {
          const sender = pc.addTrack(videoTrack, screenStream);
          screenSendersRef.current[targetPeerId] = sender;
          renegotiatePeer(targetPeerId, pc);
        } catch (err) {
          console.warn('Error adding screen track to peer:', err);
        }
      });

      // Handle user clicking native browser "Stop sharing" bar
      videoTrack.onended = () => {
        stopScreenShare();
      };

      addToast('🖥️ Screen sharing started! All participants can now see your screen.', 'success');
      return true;
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        console.warn('Screen share error:', err);
        addToast('Could not start screen sharing.', 'error');
      }
      return false;
    }
  };

  const stopScreenShare = () => {
    const stream = localScreenStreamRef.current;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setLocalScreenStream(null);
    }
    setIsScreenSharing(false);
    setCurrentScreenSharer(null);
    currentScreenSharerRef.current = null;

    // Remove video track senders from all peer connections & renegotiate
    Object.entries(peerConnectionsRef.current).forEach(([targetPeerId, pc]) => {
      const sender = screenSendersRef.current[targetPeerId];
      if (sender) {
        try {
          pc.removeTrack(sender);
          renegotiatePeer(targetPeerId, pc);
        } catch (e) {}
      }
    });
    screenSendersRef.current = {};

    // Broadcast screen-share-stopped event
    sendSignal({
      event: 'screen-share-stopped',
      from_peer_id: myPeerIdRef.current,
      room_code: currentRoomRef.current?.room_code
    });

    addToast('Screen sharing stopped.', 'info');
  };

  // ── FIX: Apply buffered ICE candidates after remote description is set ───────
  const applyPendingIceCandidates = async (peerId, pc) => {
    const pending = pendingIceCandidatesRef.current[peerId] || [];
    if (pending.length === 0) return;
    console.log(`[WebRTC] Applying ${pending.length} buffered ICE candidates for ${peerId}`);
    for (const candidate of pending) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('Buffered ICE candidate add error:', err);
      }
    }
    pendingIceCandidatesRef.current[peerId] = [];
  };

  // ── Step 1 & 6: RTCPeerConnection Setup (Audio + Video Tracks) ──────────────
  const createPeerConnection = (targetPeerId, isInitiator = false) => {
    if (peerConnectionsRef.current[targetPeerId]) {
      return peerConnectionsRef.current[targetPeerId];
    }

    console.log(`[WebRTC] Creating peer connection with ${targetPeerId}, initiator=${isInitiator}`);
    const pc = new RTCPeerConnection(RTC_CONFIG);
    peerConnectionsRef.current[targetPeerId] = pc;
    remoteDescSetRef.current[targetPeerId] = false;
    pendingIceCandidatesRef.current[targetPeerId] = [];

    // Add local microphone audio track
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        try { pc.addTrack(track, localStreamRef.current); } catch (e) {}
      });
    }

    // Add active local screen share track if currently sharing
    if (localScreenStreamRef.current) {
      const videoTrack = localScreenStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        try {
          const sender = pc.addTrack(videoTrack, localScreenStreamRef.current);
          screenSendersRef.current[targetPeerId] = sender;
        } catch (e) {}
      }
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && currentRoomRef.current) {
        sendSignal({
          event: 'ice-candidate',
          candidate: event.candidate,
          from_peer_id: myPeerIdRef.current,
          to_peer_id: targetPeerId,
          room_code: currentRoomRef.current.room_code,
        });
      }
    };

    // Handle incoming remote media tracks (Audio vs Video)
    pc.ontrack = (event) => {
      const stream = event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track]);

      if (event.track.kind === 'audio') {
        console.log(`[WebRTC] Received remote audio track from ${targetPeerId}`);
        playRemoteAudio(targetPeerId, stream);
      } else if (event.track.kind === 'video') {
        // Remote peer is screen sharing
        console.log(`[WebRTC] Received remote video/screen track from ${targetPeerId}`);
        setRemoteScreenStream(stream);
        event.track.onended = () => {
          setRemoteScreenStream(null);
        };
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE state with ${targetPeerId}: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setConnectionStatus('connected');
      } else if (pc.iceConnectionState === 'failed') {
        console.warn(`[WebRTC] ICE failed for ${targetPeerId}, restarting`);
        try { pc.restartIce(); } catch (e) {}
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state with ${targetPeerId}: ${pc.connectionState}`);
    };

    if (isInitiator) {
      renegotiatePeer(targetPeerId, pc);
    }

    return pc;
  };

  const renegotiatePeer = (targetPeerId, pc) => {
    pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true }).then(offer => {
      return pc.setLocalDescription(offer).then(() => {
        if (currentRoomRef.current) {
          sendSignal({
            event: 'sdp-offer',
            sdp: offer,
            from_peer_id: myPeerIdRef.current,
            to_peer_id: targetPeerId,
            room_code: currentRoomRef.current.room_code,
          });
        }
      });
    }).catch(err => console.warn('Renegotiate offer notice:', err));
  };

  const sendSignal = (eventData) => {
    if (!currentRoomRef.current) return;
    const topic = SIGNAL_TOPIC_PREFIX + currentRoomRef.current.room_code;
    publishSignal(topic, eventData);
  };

  // ── Step 1 & 4: Signaling Message Handler ──────────────────────────────────
  const handleSignalMessage = async (msg) => {
    if (!msg || !msg.event) return;
    const myId = myPeerIdRef.current;
    const { event, from_peer_id, to_peer_id, sdp, candidate, user_name, room_info, message } = msg;

    if (from_peer_id === myId) return;

    // ── 1. Host receives Join Request ─────────────────────────────────────────
    if (event === 'request-join') {
      const isHost = currentRoomRef.current?.host_id === myId;
      if (!isHost) return;

      playChime('knock');

      if (autoAdmitRef.current) {
        approveJoinRequest(from_peer_id, user_name);
      } else {
        setJoinRequests(prev => {
          if (prev.some(r => r.peerId === from_peer_id)) return prev;
          return [...prev, { peerId: from_peer_id, userName: user_name || 'Study Partner', timestamp: Date.now() }];
        });
        addToast(`🔔 Join Request: ${user_name || 'A classmate'} wants to join your voice room!`, 'info');
      }
      return;
    }

    // ── 2. Joiner receives Host Approval ──────────────────────────────────────
    if (event === 'approve-join' && to_peer_id === myId) {
      unlockAudioContext();
      playChime('join');
      setConnectionStatus('connected');
      addToast('🎉 Request approved! Connected to the voice room.', 'success');

      if (room_info) {
        setCurrentRoom(room_info);
        currentRoomRef.current = room_info;
        setParticipants(room_info.participants || []);
        if (room_info.currentScreenSharer) {
          setCurrentScreenSharer(room_info.currentScreenSharer);
        }
      }

      const localStream = await startLocalAudio();

      // ── FIX: Send new-peer announcement so existing peers initiate connections ──
      sendSignal({
        event: 'new-peer',
        from_peer_id: myId,
        user_name: user?.name || 'Study Partner',
        room_code: currentRoomRef.current?.room_code,
      });

      // ── FIX: Joiner initiates connections to all existing peers in the room ──
      // room_info.participants contains the already-in-room participants (excluding joiner)
      const existingPeers = (room_info?.participants || []).filter(p => p.user_id !== myId);
      for (const peer of existingPeers) {
        if (peer.user_id && peer.user_id !== myId) {
          console.log(`[WebRTC] Joiner initiating connection to existing peer: ${peer.user_id}`);
          createPeerConnection(peer.user_id, true);
        }
      }
      return;
    }

    // ── 3. Joiner receives Host Denial ────────────────────────────────────────
    if (event === 'deny-join' && to_peer_id === myId) {
      setConnectionStatus('disconnected');
      cleanup();
      addToast('Your request to join the room was declined by the host.', 'warning');
      return;
    }

    // ── 4. New Peer announced in Room ─────────────────────────────────────────
    if (event === 'new-peer') {
      unlockAudioContext();
      playChime('join');
      setParticipants(prev => {
        if (prev.some(p => p.user_id === from_peer_id)) return prev;
        const updated = [...prev, {
          id: 'p-' + Date.now(),
          user_id: from_peer_id,
          user_name: user_name || 'Study Partner',
          is_muted: false,
          is_active: true
        }];
        setCurrentRoom(r => r ? { ...r, participants: updated, current_participants: updated.length } : r);
        return updated;
      });

      // ── FIX: Ensure local audio is ready before creating peer connection ─────
      if (!localStreamRef.current) {
        await startLocalAudio();
      }

      // Existing peers (host + already-joined) initiate WebRTC with the new peer
      createPeerConnection(from_peer_id, true);
      return;
    }

    // ── 5. WebRTC SDP Offer ───────────────────────────────────────────────────
    if (event === 'sdp-offer' && to_peer_id === myId && sdp) {
      console.log(`[WebRTC] Received SDP offer from ${from_peer_id}`);
      const pc = createPeerConnection(from_peer_id, false);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        remoteDescSetRef.current[from_peer_id] = true;
        // Apply any buffered ICE candidates now that remote description is set
        await applyPendingIceCandidates(from_peer_id, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal({
          event: 'sdp-answer',
          sdp: answer,
          from_peer_id: myId,
          to_peer_id: from_peer_id,
          room_code: currentRoomRef.current?.room_code,
        });
      } catch (err) {
        console.warn('Error handling SDP offer:', err);
      }
      return;
    }

    // ── 6. WebRTC SDP Answer ──────────────────────────────────────────────────
    if (event === 'sdp-answer' && to_peer_id === myId && sdp) {
      console.log(`[WebRTC] Received SDP answer from ${from_peer_id}`);
      const pc = peerConnectionsRef.current[from_peer_id];
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          remoteDescSetRef.current[from_peer_id] = true;
          // Apply any buffered ICE candidates
          await applyPendingIceCandidates(from_peer_id, pc);
        } catch (err) {
          console.warn('Error setting SDP answer:', err);
        }
      }
      return;
    }

    // ── 7. ICE Candidate ──────────────────────────────────────────────────────
    if (event === 'ice-candidate' && to_peer_id === myId && candidate) {
      const pc = peerConnectionsRef.current[from_peer_id];
      if (pc && remoteDescSetRef.current[from_peer_id]) {
        // Remote description already set — apply immediately
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.warn('ICE candidate add error:', err);
        }
      } else {
        // ── FIX: Buffer the candidate until remote description is ready ─────────
        console.log(`[WebRTC] Buffering ICE candidate for ${from_peer_id} (remote desc not set yet)`);
        if (!pendingIceCandidatesRef.current[from_peer_id]) {
          pendingIceCandidatesRef.current[from_peer_id] = [];
        }
        pendingIceCandidatesRef.current[from_peer_id].push(candidate);
      }
      return;
    }

    // ── 8. Screen Share Started by Peer ───────────────────────────────────────
    if (event === 'screen-share-started') {
      const sharer = { peerId: from_peer_id, userName: user_name || 'Study Partner' };
      setCurrentScreenSharer(sharer);
      currentScreenSharerRef.current = sharer;
      addToast(`🖥️ ${user_name || 'A participant'} started screen sharing.`, 'info');
      return;
    }

    // ── 9. Screen Share Stopped by Peer ───────────────────────────────────────
    if (event === 'screen-share-stopped') {
      if (currentScreenSharerRef.current?.peerId === from_peer_id) {
        setCurrentScreenSharer(null);
        currentScreenSharerRef.current = null;
        setRemoteScreenStream(null);
        addToast('Screen share ended.', 'info');
      }
      return;
    }

    // ── 10. Peer Left Room ────────────────────────────────────────────────────
    if (event === 'leave-room') {
      playChime('leave');
      setParticipants(prev => prev.filter(p => p.user_id !== from_peer_id));
      if (peerConnectionsRef.current[from_peer_id]) {
        try { peerConnectionsRef.current[from_peer_id].close(); } catch (e) {}
        delete peerConnectionsRef.current[from_peer_id];
      }
      if (remoteAudiosRef.current[from_peer_id]) {
        try { remoteAudiosRef.current[from_peer_id].remove(); } catch (e) {}
        delete remoteAudiosRef.current[from_peer_id];
      }
      delete pendingIceCandidatesRef.current[from_peer_id];
      delete remoteDescSetRef.current[from_peer_id];
      if (currentScreenSharerRef.current?.peerId === from_peer_id) {
        setCurrentScreenSharer(null);
        currentScreenSharerRef.current = null;
        setRemoteScreenStream(null);
      }
      return;
    }

    // ── 11. Chat Message ──────────────────────────────────────────────────────
    if (event === 'chat' && message) {
      setChatMessages(prev => prev.some(m => m.id === message.id) ? prev : [...prev, message]);
    }
  };

  // ── WebSocket Signaling Connection ──────────────────────────────────────────
  // FIX: ntfy.sh WebSocket delivers messages as:
  //   { "id":"...", "time":..., "event":"message", "topic":"...", "message": "<your text body>" }
  // where "message" is the plain-text body we POSTed. We JSON.parse it to get the signal.
  const connectSignalingWebSocket = (roomCode) => {
    if (wsRef.current) {
      try { wsRef.current.close(); } catch (e) {}
      wsRef.current = null;
    }

    const topic = SIGNAL_TOPIC_PREFIX + roomCode;
    const ws = new WebSocket(`wss://ntfy.sh/${topic}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log(`[Signaling] WebSocket connected for room ${roomCode}`);
    };

    ws.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        // ntfy.sh delivers: { event: "message", message: "<our JSON string>" }
        if (payload && payload.event === 'message' && payload.message) {
          const inner = JSON.parse(payload.message);
          handleSignalMessage(inner);
        } else if (payload && payload.message) {
          // Some ntfy.sh versions may have different structure
          try {
            const inner = JSON.parse(payload.message);
            handleSignalMessage(inner);
          } catch (_) {}
        }
      } catch (err) {
        // Ignore keepalive or malformed messages
      }
    };

    ws.onerror = (err) => {
      console.warn('[Signaling] WebSocket error, falling back to SSE');
      fallbackToSSE(roomCode);
    };

    ws.onclose = () => {
      // ── FIX: Only reconnect if we're still in THIS room (not after leaving) ──
      if (currentRoomRef.current?.room_code === roomCode) {
        console.log(`[Signaling] WebSocket closed for room ${roomCode}, reconnecting in 2s...`);
        setTimeout(() => {
          if (currentRoomRef.current?.room_code === roomCode) {
            connectSignalingWebSocket(roomCode);
          }
        }, 2000);
      }
    };
  };

  const fallbackToSSE = (roomCode) => {
    const topic = SIGNAL_TOPIC_PREFIX + roomCode;
    console.log(`[Signaling] Starting SSE fallback for room ${roomCode}`);
    const es = new EventSource(`https://ntfy.sh/${topic}/sse`);
    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload && payload.event === 'message' && payload.message) {
          handleSignalMessage(JSON.parse(payload.message));
        } else if (payload && payload.message) {
          try { handleSignalMessage(JSON.parse(payload.message)); } catch (_) {}
        }
      } catch (err) {}
    };
    es.onerror = () => {
      console.warn('[Signaling] SSE also failed');
      es.close();
    };
  };

  const cleanup = () => {
    stopScreenShare();
    stopAudio();
    if (wsRef.current) {
      try { wsRef.current.close(); } catch (e) {}
      wsRef.current = null;
    }
    Object.values(peerConnectionsRef.current).forEach(pc => {
      try { pc.close(); } catch (e) {}
    });
    peerConnectionsRef.current = {};
    pendingIceCandidatesRef.current = {};
    remoteDescSetRef.current = {};
    setConnectionStatus('disconnected');
    setCurrentRoom(null);
    setParticipants([]);
    setChatMessages([]);
    setJoinRequests([]);
    setActiveSpeakers({});
    setCurrentScreenSharer(null);
    setRemoteScreenStream(null);
  };

  // ── Host: Approve Join Request ─────────────────────────────────────────────
  const approveJoinRequest = (peerId, name) => {
    const req = joinRequests.find(r => r.peerId === peerId);
    const applicantName = name || req?.userName || 'Study Partner';

    setJoinRequests(prev => prev.filter(r => r.peerId !== peerId));

    const updatedParticipants = [
      ...participants,
      { id: 'p-' + Date.now(), user_id: peerId, user_name: applicantName, is_muted: false, is_active: true }
    ];
    setParticipants(updatedParticipants);

    const updatedRoom = {
      ...currentRoomRef.current,
      participants: updatedParticipants,
      current_participants: updatedParticipants.length,
      currentScreenSharer: currentScreenSharerRef.current
    };
    setCurrentRoom(updatedRoom);
    currentRoomRef.current = updatedRoom;

    // ── FIX: Include all existing participant IDs so joiner can connect to them ──
    sendSignal({
      event: 'approve-join',
      to_peer_id: peerId,
      room_info: updatedRoom,
      from_peer_id: myPeerIdRef.current,
    });

    addToast(`✅ Admitted ${applicantName} into the voice room!`, 'success');
  };

  const denyJoinRequest = (peerId) => {
    setJoinRequests(prev => prev.filter(r => r.peerId !== peerId));
    sendSignal({
      event: 'deny-join',
      to_peer_id: peerId,
      from_peer_id: myPeerIdRef.current,
    });
    addToast('Declined join request.', 'info');
  };

  // ── Create Voice Room (Host) ───────────────────────────────────────────────
  const createRoom = async (title, documentId, autoAccept = false) => {
    unlockAudioContext();
    await startLocalAudio();
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const myId = myPeerIdRef.current;
    const myName = user?.name || 'Host';

    setAutoAdmit(autoAccept);

    const newRoom = {
      id: 'room-' + code,
      room_code: code,
      title: title || 'Collaborative Study Voice Room',
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

    publishSignal(GLOBAL_ROOMS_TOPIC, {
      action: 'create',
      room: newRoom
    });

    try {
      const raw = localStorage.getItem('study_rooms_cache_v2');
      const cached = raw ? JSON.parse(raw) : [];
      const updated = [newRoom, ...cached.filter(r => r.room_code !== code)].slice(0, 10);
      localStorage.setItem('study_rooms_cache_v2', JSON.stringify(updated));
    } catch (e) {}

    connectSignalingWebSocket(code);

    setCurrentRoom(newRoom);
    currentRoomRef.current = newRoom;
    setParticipants(newRoom.participants);
    setConnectionStatus('connected');
    playChime('join');
    addToast(`🎙️ Voice room created! Share 6-digit code: ${code}`, 'success');

    return newRoom;
  };

  // ── Join Voice Room ────────────────────────────────────────────────────────
  const joinRoom = async (codeOrId) => {
    unlockAudioContext();
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

    const preset = PRESET_ROOMS.find(r => r.room_code === code);
    if (preset) {
      addToast(`"${preset.title}" is a demo preview room. Click "Create Voice Room" to start your own real voice room!`, 'info');
      return null;
    }

    cleanup();

    const myId = myPeerIdRef.current;
    const myName = user?.name || 'Study Partner';

    connectSignalingWebSocket(code);
    setConnectionStatus('waiting_approval');

    const waitRoom = {
      id: 'room-' + code,
      room_code: code,
      title: 'Study Room ' + code,
      host_name: 'Room Host',
      host_id: 'host',
      current_participants: 1,
      max_participants: 6,
      is_active: true,
      participants: [{ id: 'p-me', user_id: myId, user_name: myName, is_muted: false, is_active: true }]
    };
    setCurrentRoom(waitRoom);
    currentRoomRef.current = waitRoom;
    setParticipants(waitRoom.participants);

    setTimeout(() => {
      sendSignal({
        event: 'request-join',
        from_peer_id: myId,
        user_name: myName,
        room_code: code,
      });
    }, 500);

    addToast(`🔔 Request sent! Waiting for host to approve...`, 'info');
    return waitRoom;
  };

  const leaveRoom = () => {
    if (currentRoomRef.current) {
      const code = currentRoomRef.current.room_code;
      sendSignal({
        event: 'leave-room',
        from_peer_id: myPeerIdRef.current,
        room_code: code,
      });

      if (currentRoomRef.current.host_id === myPeerIdRef.current) {
        publishSignal(GLOBAL_ROOMS_TOPIC, {
          action: 'close',
          room_code: code,
        });
      }
    }
    playChime('leave');
    cleanup();
    addToast('Disconnected from voice room.', 'info');
  };

  const toggleMute = () => {
    unlockAudioContext();
    const next = !isMuted;
    setIsMuted(next);
    isMutedRef.current = next;
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !next; });
    }
  };

  const toggleDeafen = () => {
    unlockAudioContext();
    const next = !isDeafened;
    setIsDeafened(next);
    isDeafenedRef.current = next;
    Object.values(remoteAudiosRef.current).forEach(el => {
      if (el) el.muted = next;
    });
  };

  const sendChatMessage = (content) => {
    if (!currentRoomRef.current || !content?.trim()) return;
    const msg = {
      id: 'msg-' + Date.now(),
      sender_name: user?.name || 'You',
      content: content.trim(),
      created_at: new Date().toISOString()
    };
    setChatMessages(prev => [...prev, msg]);
    sendSignal({
      event: 'chat',
      message: msg,
      from_peer_id: myPeerIdRef.current,
      room_code: currentRoomRef.current.room_code,
    });
  };

  return (
    <VoiceRoomContext.Provider value={{
      currentRoom, participants, isMuted, isDeafened,
      activeSpeakers, chatMessages, connectionStatus,
      joinRequests, approveJoinRequest, denyJoinRequest,
      autoAdmit, setAutoAdmit,
      currentScreenSharer, isScreenSharing, localScreenStream, remoteScreenStream,
      startScreenShare, stopScreenShare, unlockAudioContext,
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
