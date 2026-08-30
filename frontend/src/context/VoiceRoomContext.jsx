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

  // Poll room updates and signals when in room
  useEffect(() => {
    if (!currentRoom) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      return;
    }

    const poll = async () => {
      try {
        // 1. Refresh room details & participants
        const res = await voiceroomsAPI.getDetails(currentRoom.id);
        if (res.data.success && res.data.data.room) {
          const roomData = res.data.data.room;
          setCurrentRoom(roomData);
          setParticipants(roomData.participants || []);
        }

        // 2. Fetch chat history
        const chatRes = await voiceroomsAPI.getChat(currentRoom.id);
        if (chatRes.data.success && chatRes.data.data.messages) {
          setChatMessages(chatRes.data.data.messages);
        }
      } catch (err) {
        console.error("Voice room sync error:", err);
      }
    };

    poll();
    pollTimerRef.current = setInterval(poll, 3000);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [currentRoom?.id]);

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
      addToast("Joined in listen-only mode (microphone permission denied).", "warning");
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
  };

  const createRoom = async (title, documentId) => {
    try {
      await startLocalAudio();
      const res = await voiceroomsAPI.create(title, documentId);
      if (res.data.success && res.data.data.room) {
        const room = res.data.data.room;
        setCurrentRoom(room);
        setParticipants(room.participants || []);
        setIsMuted(false);
        setIsDeafened(false);
        addToast(`Voice room created! Code: ${room.room_code}`, "success");
        return room;
      } else {
        addToast(res.data.message || "Failed to create voice room.", "error");
        return null;
      }
    } catch (err) {
      console.error(err);
      addToast("Error creating voice room.", "error");
      return null;
    }
  };

  const joinRoom = async (roomCodeOrId) => {
    try {
      await startLocalAudio();
      const res = await voiceroomsAPI.join(roomCodeOrId);
      if (res.data.success && res.data.data.room) {
        const room = res.data.data.room;
        setCurrentRoom(room);
        setParticipants(room.participants || []);
        setIsMuted(false);
        setIsDeafened(false);
        addToast(`Joined voice room ${room.title}! (Max 6 members)`, "success");
        return room;
      } else {
        addToast(res.data.message || "Could not join voice room.", "error");
        return null;
      }
    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.message || "Failed to join room. It may be full (Max 6).";
      addToast(errMsg, "error");
      return null;
    }
  };

  const leaveRoom = async () => {
    if (!currentRoom) return;
    try {
      await voiceroomsAPI.leave(currentRoom.id);
    } catch (err) {
      console.error("Error leaving room:", err);
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
    if (currentRoom) {
      voiceroomsAPI.updateState(currentRoom.id, { is_deafened: nextState }).catch(() => {});
    }
  };

  const sendChatMessage = async (content) => {
    if (!currentRoom || !content.trim()) return;
    try {
      const res = await voiceroomsAPI.sendChat(currentRoom.id, content);
      if (res.data.success && res.data.data.message) {
        setChatMessages((prev) => [...prev, res.data.data.message]);
      }
    } catch (err) {
      console.error("Failed to send room chat message:", err);
    }
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
