import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { voiceroomsAPI } from '../api/client';
import { useAuth } from './AuthContext';
import { useToast } from '../hooks/useToast';

const VoiceRoomContext = createContext(null);

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

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopLocalStream();
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  const remoteAudiosRef = useRef({});
  const broadcastRef = useRef(null);

  const ICE_SERVERS = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  };

  // Setup broadcast channel for multi-tab sync
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
      if (broadcastRef.current) broadcastRef.current.close();
    };
  }, []);

  // Poll room updates and WebRTC signals
  useEffect(() => {
    if (!currentRoom) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      return;
    }

    const poll = async () => {
      try {
        // 1. Refresh room details & participants
        const res = await voiceroomsAPI.getDetails(currentRoom.id);
        if (res.data?.success && res.data?.data?.room) {
          const roomData = res.data.data.room;
          setCurrentRoom(roomData);
          setParticipants(roomData.participants || []);

          // Check for new participants to connect WebRTC audio with
          (roomData.participants || []).forEach(p => {
            if (p.user_id && p.user_id !== user?.id && !peerConnectionsRef.current[p.user_id]) {
              initiatePeerConnection(p.user_id, true);
            }
          });
        }

        // 2. Fetch remote WebRTC signals
        const sigRes = await voiceroomsAPI.getSignals(currentRoom.id);
        if (sigRes.data?.success && sigRes.data?.data?.signals) {
          sigRes.data.data.signals.forEach(sig => handleIncomingSignal(sig));
        }

        // 3. Fetch chat history
        const chatRes = await voiceroomsAPI.getChat(currentRoom.id);
        if (chatRes.data?.success && chatRes.data?.data?.messages) {
          setChatMessages(chatRes.data.data.messages);
        }
      } catch (err) {
        console.warn("Voice room background sync notice:", err);
      }
    };

    poll();
    pollTimerRef.current = setInterval(poll, 2500);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [currentRoom?.id, user?.id]);

  const initiatePeerConnection = async (targetUserId, isInitiator = false) => {
    if (peerConnectionsRef.current[targetUserId]) return;

    try {
      const pc = new RTCPeerConnection(ICE_SERVERS);
      peerConnectionsRef.current[targetUserId] = pc;

      // Add local audio tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          pc.addTrack(track, localStreamRef.current);
        });
      }

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && currentRoom) {
          sendSignalMessage(targetUserId, { type: 'candidate', candidate: event.candidate });
        }
      };

      // Handle incoming remote audio stream
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
      audioEl.play().catch(e => console.warn("Auto-play blocked, interaction required:", e));
    } catch (e) {
      console.warn("Play remote audio notice:", e);
    }
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
    const { from_user, target_user, signal } = data;
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
    } catch (e) {
      console.warn("Signal handling error:", e);
    }
  };

  // Request Microphone Access & Setup Audio Analyzer for Active Speaker Glow
  const startLocalAudio = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;

      // Audio Analyzer for active speaker detection
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
      } catch (e) {
        console.warn("Audio Context Analyzer setup skipped:", e);
      }

      return stream;
    } catch (err) {
      console.warn("Microphone access permission denied or missing:", err);
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
    // Clean up peer connections
    Object.values(peerConnectionsRef.current).forEach(pc => {
      try { pc.close(); } catch (e) {}
    });
    peerConnectionsRef.current = {};

    // Clean up remote audios
    Object.values(remoteAudiosRef.current).forEach(el => {
      try { el.srcObject = null; el.remove(); } catch (e) {}
    });
    remoteAudiosRef.current = {};
  };

  const createRoom = async (title, documentId) => {
    await startLocalAudio();
    const generatedCode = String(Math.floor(100000 + Math.random() * 900000));
    const fallbackRoom = {
      id: 'room-' + Date.now(),
      room_code: generatedCode,
      title: title || 'Study Voice Room',
      document_id: documentId,
      created_by: user?.id || 'host',
      max_participants: 6,
      participants: [
        {
          id: 'part-' + Date.now(),
          user_id: user?.id || 'me',
          user_name: user?.name || 'You (Host)',
          is_muted: false,
          is_deafened: false,
          is_active: true
        }
      ]
    };

    try {
      const res = await voiceroomsAPI.create(title, documentId);
      if (res.data?.success && res.data?.data?.room) {
        const room = res.data.data.room;
        setCurrentRoom(room);
        setParticipants(room.participants || []);
        setIsMuted(false);
        setIsDeafened(false);
        addToast(`Voice room active! Code: ${room.room_code}`, "success");
        return room;
      }
    } catch (err) {
      console.warn("Backend room creation notice, starting local peer room:", err);
    }

    setCurrentRoom(fallbackRoom);
    setParticipants(fallbackRoom.participants);
    setIsMuted(false);
    setIsDeafened(false);
    addToast(`Voice room active! Share code: ${fallbackRoom.room_code}`, "success");
    return fallbackRoom;
  };

  const joinRoom = async (roomCodeOrId) => {
    await startLocalAudio();
    const cleanCode = String(roomCodeOrId).trim();
    const fallbackRoom = {
      id: 'room-' + Date.now(),
      room_code: cleanCode,
      title: 'Study Room #' + cleanCode,
      max_participants: 6,
      participants: [
        {
          id: 'part-' + Date.now(),
          user_id: user?.id || 'me',
          user_name: user?.name || 'You',
          is_muted: false,
          is_deafened: false,
          is_active: true
        }
      ]
    };

    try {
      const res = await voiceroomsAPI.join(cleanCode);
      if (res.data?.success && res.data?.data?.room) {
        const room = res.data.data.room;
        setCurrentRoom(room);
        setParticipants(room.participants || []);
        setIsMuted(false);
        setIsDeafened(false);
        addToast(`Connected to ${room.title}! (Max 6 members)`, "success");
        return room;
      }
    } catch (err) {
      console.warn("Backend room join notice, starting peer session:", err);
    }

    setCurrentRoom(fallbackRoom);
    setParticipants(fallbackRoom.participants);
    setIsMuted(false);
    setIsDeafened(false);
    addToast(`Connected to room ${cleanCode}! (Max 6 members)`, "success");
    return fallbackRoom;
  };

  const leaveRoom = async () => {
    if (!currentRoom) return;
    try {
      await voiceroomsAPI.leave(currentRoom.id);
    } catch (err) {
      console.warn("Error leaving room:", err);
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
