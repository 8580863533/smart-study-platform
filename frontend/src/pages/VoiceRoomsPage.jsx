import React, { useState, useEffect, useRef, useCallback } from 'react';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import { useVoiceRoom, getStoredRooms } from '../context/VoiceRoomContext';
import { useStudy } from '../context/StudyContext';
import { useToast } from '../hooks/useToast';

const GLOBAL_ROOMS_TOPIC = 'study_global_voice_rooms_v2';

// ── Screen Share Theater Component ────────────────────────────────────────────
function ScreenShareTheater({ stream, isLocal, sharerName, onStop }) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        background: '#0a0b1a',
        borderRadius: '20px',
        overflow: 'hidden',
        border: '1.5px solid rgba(62, 207, 207, 0.4)',
        boxShadow: '0 0 35px rgba(62, 207, 207, 0.15)',
        marginBottom: '24px',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Top Overlay Bar */}
      <div style={{
        padding: '12px 20px',
        background: 'rgba(10, 11, 26, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{
            fontSize: '0.75rem',
            background: 'rgba(62, 207, 207, 0.2)',
            color: '#3ecfcf',
            border: '1px solid rgba(62, 207, 207, 0.4)',
            padding: '3px 10px',
            borderRadius: '12px',
            fontWeight: 800,
            letterSpacing: '0.5px'
          }}>
            🔴 LIVE STREAM
          </span>
          <span style={{ color: '#fff', fontSize: '0.92rem', fontWeight: 700 }}>
            {isLocal ? '🖥️ You are sharing your screen' : `🖥️ ${sharerName}'s Screen`}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {isLocal && (
            <button
              onClick={onStop}
              style={{
                background: 'rgba(255, 77, 77, 0.25)',
                color: '#ff4d4d',
                border: '1px solid rgba(255, 77, 77, 0.4)',
                padding: '6px 14px',
                borderRadius: '10px',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '0.8rem'
              }}
            >
              🛑 Stop Sharing
            </button>
          )}

          <button
            onClick={toggleFullscreen}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              color: '#fff',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              padding: '6px 14px',
              borderRadius: '10px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.8rem'
            }}
          >
            {isFullscreen ? '✕ Exit Fullscreen' : '⛶ Fullscreen'}
          </button>
        </div>
      </div>

      {/* Video Element (Local muted to prevent echo; remote unmuted) */}
      <div style={{ position: 'relative', width: '100%', minHeight: '380px', maxHeight: '560px', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          style={{
            width: '100%',
            height: '100%',
            maxHeight: '560px',
            objectFit: 'contain',
            display: 'block'
          }}
        />
      </div>
    </div>
  );
}

export default function VoiceRoomsPage() {
  const {
    currentRoom,
    participants,
    isMuted,
    isDeafened,
    activeSpeakers,
    chatMessages,
    connectionStatus,
    joinRequests,
    approveJoinRequest,
    denyJoinRequest,
    autoAdmit,
    setAutoAdmit,
    currentScreenSharer,
    isScreenSharing,
    localScreenStream,
    remoteScreenStream,
    startScreenShare,
    stopScreenShare,
    createRoom,
    joinRoom,
    leaveRoom,
    toggleMute,
    toggleDeafen,
    sendChatMessage,
  } = useVoiceRoom();

  const { documents, loadDocuments } = useStudy();
  const { addToast } = useToast();

  const [activeRooms, setActiveRooms] = useState(getStoredRooms);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [selectedDocId, setSelectedDocId] = useState('');
  const [autoAdmitCheckbox, setAutoAdmitCheckbox] = useState(true);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => { loadDocuments(); }, []);

  // ── Fetch Global Active Rooms from cloud across all devices ────────────────
  const fetchGlobalRooms = useCallback(async () => {
    try {
      const res = await fetch(`https://ntfy.sh/${GLOBAL_ROOMS_TOPIC}/json?poll=1`);
      const text = await res.text();
      const lines = text.trim().split('\n').filter(Boolean);
      const roomsMap = new Map();

      // Read locally stored and preset rooms
      const local = getStoredRooms();
      local.forEach(r => roomsMap.set(r.room_code, r));

      for (const line of lines) {
        try {
          const item = JSON.parse(line);
          if (item && item.message) {
            const data = JSON.parse(item.message);
            if (data.action === 'create' && data.room) {
              roomsMap.set(data.room.room_code, { ...data.room, is_live: true });
            } else if (data.action === 'close' && data.room_code) {
              roomsMap.delete(data.room_code);
            }
          }
        } catch (e) {}
      }
      setActiveRooms(Array.from(roomsMap.values()));
    } catch (err) {
      console.warn("Could not fetch remote rooms:", err);
      setActiveRooms(getStoredRooms());
    }
  }, []);

  useEffect(() => {
    fetchGlobalRooms();

    let es;
    try {
      es = new EventSource(`https://ntfy.sh/${GLOBAL_ROOMS_TOPIC}/sse`);
      es.onmessage = (event) => {
        try {
          const item = JSON.parse(event.data);
          if (item && item.message) {
            const data = JSON.parse(item.message);
            if (data.action === 'create' && data.room) {
              setActiveRooms(prev => {
                const map = new Map(prev.map(r => [r.room_code, r]));
                map.set(data.room.room_code, { ...data.room, is_live: true });
                return Array.from(map.values());
              });
            } else if (data.action === 'close' && data.room_code) {
              setActiveRooms(prev => prev.filter(r => r.room_code !== data.room_code));
            }
          }
        } catch (e) {}
      };
    } catch (e) {}

    return () => { if (es) es.close(); };
  }, [fetchGlobalRooms]);

  useEffect(() => {
    fetchGlobalRooms();
  }, [currentRoom, fetchGlobalRooms]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) { addToast('Please enter a room title.', 'warning'); return; }
    const room = await createRoom(newTitle, selectedDocId, autoAdmitCheckbox);
    if (room) {
      setShowCreateModal(false);
      setNewTitle('');
      setSelectedDocId('');
      fetchGlobalRooms();
    }
  };

  const handleJoinByCode = async (e) => {
    e.preventDefault();
    if (!joinCodeInput.trim()) { addToast('Please enter the 6-digit room code.', 'warning'); return; }
    await joinRoom(joinCodeInput.trim());
    setJoinCodeInput('');
  };

  const handleCopyCode = (code) => {
    try {
      navigator.clipboard.writeText(code);
      setCopiedCode(true);
      addToast(`Copied room code: ${code}`, 'success');
      setTimeout(() => setCopiedCode(false), 2000);
    } catch (e) {}
  };

  const handleSendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sendChatMessage(chatInput.trim());
    setChatInput('');
  };

  // Up to 6 slots representation for Discord-style grid
  const MAX_SLOTS = 6;
  const slots = Array.from({ length: MAX_SLOTS }, (_, i) => participants[i] || null);

  // Check if someone is sharing screen
  const isSomeoneSharing = Boolean(currentScreenSharer);
  const activeScreenStream = isScreenSharing ? localScreenStream : remoteScreenStream;

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at top, #0f1026 0%, #060714 100%)', display: 'flex', flexDirection: 'column' }}>
      <Navbar />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />

        <main style={{ flex: 1, padding: '28px 36px', maxWidth: '1300px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

          {/* ── Waiting for Host Approval Screen (Joiner view) ── */}
          {connectionStatus === 'waiting_approval' && (
            <div style={{
              background: 'rgba(15, 16, 38, 0.95)',
              border: '1px solid rgba(62, 207, 207, 0.4)',
              borderRadius: '24px',
              padding: '48px 32px',
              textAlign: 'center',
              maxWidth: '520px',
              margin: '60px auto',
              boxShadow: '0 0 50px rgba(62, 207, 207, 0.15)',
            }}>
              <div style={{ fontSize: '3.5rem', marginBottom: '16px', animation: 'bounce 1.5s infinite' }}>🔔</div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '8px', color: '#fff' }}>
                Join Request Sent to Host!
              </h2>
              <p style={{ color: 'rgba(240, 240, 255, 0.65)', fontSize: '0.95rem', marginBottom: '24px', lineHeight: 1.6 }}>
                You have knocked on Room <strong>{currentRoom?.room_code}</strong>. The host received a notification to admit you into the room.
              </p>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#3ecfcf', fontSize: '0.9rem', marginBottom: '32px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#3ecfcf', animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite' }} />
                <span>Waiting for host approval...</span>
              </div>

              <button
                onClick={leaveRoom}
                className="btn btn-secondary"
                style={{ padding: '10px 28px', borderRadius: '12px', fontWeight: 600 }}
              >
                Cancel Request
              </button>
            </div>
          )}

          {/* ── Active Connected Room (Discord-Style UI) ──────── */}
          {currentRoom && connectionStatus === 'connected' && (
            <div>
              {/* Host Notification Banner: Pending Join Requests */}
              {joinRequests.length > 0 && (
                <div style={{
                  background: 'linear-gradient(135deg, rgba(108, 99, 255, 0.25) 0%, rgba(62, 207, 207, 0.25) 100%)',
                  border: '1px solid #3ecfcf',
                  borderRadius: '18px',
                  padding: '16px 24px',
                  marginBottom: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                  boxShadow: '0 0 25px rgba(62, 207, 207, 0.2)',
                  animation: 'pulse 2s infinite'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '1.5rem' }}>🔔</span>
                    <div>
                      <div style={{ fontWeight: 800, color: '#fff', fontSize: '0.95rem' }}>
                        {joinRequests[0].userName} wants to join your voice room!
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'rgba(240, 240, 255, 0.6)' }}>
                        Capacity: {participants.length}/6 members
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => approveJoinRequest(joinRequests[0].peerId, joinRequests[0].userName)}
                      className="btn btn-primary"
                      style={{ padding: '8px 18px', borderRadius: '10px', fontWeight: 700, fontSize: '0.85rem' }}
                    >
                      ✅ Admit / Accept
                    </button>
                    <button
                      onClick={() => denyJoinRequest(joinRequests[0].peerId)}
                      className="btn btn-secondary"
                      style={{ padding: '8px 16px', borderRadius: '10px', fontWeight: 600, fontSize: '0.85rem' }}
                    >
                      ❌ Decline
                    </button>
                  </div>
                </div>
              )}

              {/* Discord-Style Channel Header Bar */}
              <div className="glass-card" style={{
                padding: '24px 30px',
                borderRadius: '20px',
                marginBottom: '24px',
                border: '1px solid rgba(62, 207, 207, 0.3)',
                background: 'rgba(18, 19, 45, 0.75)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '16px'
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '1.6rem' }}>🔊</span>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: '#fff' }}>{currentRoom.title}</h1>
                    <span style={{
                      fontSize: '0.75rem',
                      background: 'rgba(62, 207, 207, 0.15)',
                      color: '#3ecfcf',
                      border: '1px solid rgba(62, 207, 207, 0.35)',
                      padding: '3px 10px',
                      borderRadius: '16px',
                      fontWeight: 700
                    }}>
                      OPUS STEREO
                    </span>
                    {isSomeoneSharing && (
                      <span style={{
                        fontSize: '0.75rem',
                        background: 'rgba(108, 99, 255, 0.25)',
                        color: '#a78bfa',
                        border: '1px solid rgba(108, 99, 255, 0.5)',
                        padding: '3px 10px',
                        borderRadius: '16px',
                        fontWeight: 700
                      }}>
                        🖥️ {currentScreenSharer?.userName} Sharing Screen
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ color: '#3ecfcf', fontSize: '0.85rem', fontWeight: 600 }}>
                      🟢 Live Voice Room
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>
                      Room Code: <strong style={{ color: '#fff', letterSpacing: '2px', fontSize: '1rem' }}>{currentRoom.room_code}</strong>
                    </span>
                    <button
                      onClick={() => handleCopyCode(currentRoom.room_code)}
                      style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#3ecfcf', padding: '3px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}
                    >
                      {copiedCode ? '✓ Copied!' : '📋 Copy Code'}
                    </button>
                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>
                      👥 {participants.length}/6 Members
                    </span>
                  </div>
                </div>

                {/* Discord Bar Controls (Audio + Screen Share + Leave) */}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* Microphone Mute */}
                  <button
                    onClick={toggleMute}
                    style={{
                      padding: '10px 18px',
                      borderRadius: '12px',
                      fontWeight: 700,
                      fontSize: '0.88rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: isMuted ? 'rgba(255, 77, 77, 0.2)' : 'rgba(62, 207, 207, 0.15)',
                      color: isMuted ? '#ff4d4d' : '#3ecfcf',
                      border: isMuted ? '1px solid rgba(255, 77, 77, 0.4)' : '1px solid rgba(62, 207, 207, 0.35)'
                    }}
                  >
                    <span>{isMuted ? '🔇' : '🎙️'}</span>
                    <span>{isMuted ? 'Unmute' : 'Mute'}</span>
                  </button>

                  {/* Deafen Audio */}
                  <button
                    onClick={toggleDeafen}
                    style={{
                      padding: '10px 18px',
                      borderRadius: '12px',
                      fontWeight: 700,
                      fontSize: '0.88rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: isDeafened ? 'rgba(255, 165, 0, 0.2)' : 'rgba(108, 99, 255, 0.15)',
                      color: isDeafened ? '#ffa500' : '#6c63ff',
                      border: isDeafened ? '1px solid rgba(255, 165, 0, 0.4)' : '1px solid rgba(108, 99, 255, 0.35)'
                    }}
                  >
                    <span>{isDeafened ? '🔕' : '🎧'}</span>
                    <span>{isDeafened ? 'Undeafen' : 'Deafen'}</span>
                  </button>

                  {/* Step 2: Controlled Screen Share Button */}
                  {isScreenSharing ? (
                    <button
                      onClick={stopScreenShare}
                      style={{
                        padding: '10px 18px',
                        borderRadius: '12px',
                        fontWeight: 700,
                        fontSize: '0.88rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: 'rgba(255, 77, 77, 0.25)',
                        color: '#ff4d4d',
                        border: '1px solid rgba(255, 77, 77, 0.5)',
                        boxShadow: '0 0 15px rgba(255, 77, 77, 0.3)'
                      }}
                    >
                      <span>🛑</span>
                      <span>Stop Sharing</span>
                    </button>
                  ) : isSomeoneSharing ? (
                    <button
                      disabled
                      title={`Screen share active by ${currentScreenSharer?.userName}. Only one member can share at a time.`}
                      style={{
                        padding: '10px 18px',
                        borderRadius: '12px',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        cursor: 'not-allowed',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        color: 'rgba(240, 240, 255, 0.4)',
                        border: '1px solid rgba(255, 255, 255, 0.1)'
                      }}
                    >
                      <span>🖥️</span>
                      <span>Screen Active</span>
                    </button>
                  ) : (
                    <button
                      onClick={startScreenShare}
                      style={{
                        padding: '10px 18px',
                        borderRadius: '12px',
                        fontWeight: 700,
                        fontSize: '0.88rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: 'linear-gradient(135deg, rgba(108, 99, 255, 0.25) 0%, rgba(62, 207, 207, 0.25) 100%)',
                        color: '#3ecfcf',
                        border: '1px solid rgba(62, 207, 207, 0.4)'
                      }}
                    >
                      <span>🖥️</span>
                      <span>Share Screen</span>
                    </button>
                  )}

                  {/* Disconnect Button */}
                  <button
                    onClick={leaveRoom}
                    style={{
                      padding: '10px 20px',
                      borderRadius: '12px',
                      fontWeight: 700,
                      fontSize: '0.88rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: 'rgba(255, 77, 77, 0.15)',
                      color: '#ff4d4d',
                      border: '1px solid rgba(255, 77, 77, 0.3)'
                    }}
                  >
                    <span>📞</span>
                    <span>Disconnect</span>
                  </button>
                </div>
              </div>

              {/* ── Step 2: Screen Sharing Theater Viewport ───── */}
              {activeScreenStream && (
                <ScreenShareTheater
                  stream={activeScreenStream}
                  isLocal={isScreenSharing}
                  sharerName={currentScreenSharer?.userName || 'Study Partner'}
                  onStop={stopScreenShare}
                />
              )}

              {/* Main Content Area: 6-Member Grid + Live Chat */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '24px' }}>

                {/* ── Discord 6-Member Grid ──────────────────────── */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'rgba(240, 240, 255, 0.85)' }}>
                      👥 Voice Channel ({participants.length}/6)
                    </h2>
                    <label style={{ fontSize: '0.8rem', color: 'rgba(240, 240, 255, 0.6)', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={autoAdmit}
                        onChange={e => setAutoAdmit(e.target.checked)}
                      />
                      <span>Auto-admit new joiners</span>
                    </label>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                    {slots.map((p, idx) => {
                      if (p) {
                        const isSpeaking = activeSpeakers[p.user_id];
                        const isHost = currentRoom?.host_id === p.user_id || p.user_name?.includes('(Host)');
                        const isThisUserScreenSharing = currentScreenSharer?.peerId === p.user_id;

                        return (
                          <div
                            key={p.id || p.user_id}
                            style={{
                              background: 'rgba(25, 27, 60, 0.65)',
                              border: isThisUserScreenSharing
                                ? '2.5px solid #a78bfa'
                                : isSpeaking
                                ? '2.5px solid #23a55a'
                                : '1px solid rgba(255, 255, 255, 0.1)',
                              borderRadius: '20px',
                              padding: '28px 16px',
                              textAlign: 'center',
                              position: 'relative',
                              boxShadow: isThisUserScreenSharing
                                ? '0 0 25px rgba(167, 139, 250, 0.4)'
                                : isSpeaking
                                ? '0 0 25px rgba(35, 165, 90, 0.45)'
                                : 'none',
                              transition: 'all 0.15s ease',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              minHeight: '170px'
                            }}
                          >
                            {/* Host Crown */}
                            {isHost && (
                              <span style={{ position: 'absolute', top: '10px', left: '12px', fontSize: '0.85rem' }} title="Room Host">
                                👑
                              </span>
                            )}

                            {/* Status Icons */}
                            <div style={{ position: 'absolute', top: '10px', right: '12px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                              {isThisUserScreenSharing && (
                                <span style={{
                                  fontSize: '0.65rem',
                                  background: 'rgba(167, 139, 250, 0.3)',
                                  color: '#c4b5fd',
                                  padding: '2px 6px',
                                  borderRadius: '6px',
                                  fontWeight: 800
                                }}>
                                  SCREEN
                                </span>
                              )}
                              <span style={{ fontSize: '0.8rem' }}>
                                {p.is_muted ? '🔇' : isSpeaking ? '🔊' : '🎧'}
                              </span>
                            </div>

                            {/* Avatar with Discord-style Green Halo */}
                            <div style={{
                              width: '64px',
                              height: '64px',
                              borderRadius: '50%',
                              background: isThisUserScreenSharing
                                ? 'linear-gradient(135deg, #a78bfa 0%, #6c63ff 100%)'
                                : isSpeaking
                                ? '#23a55a'
                                : 'linear-gradient(135deg, #6c63ff 0%, #3ecfcf 100%)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '1.6rem',
                              fontWeight: 800,
                              color: '#fff',
                              marginBottom: '12px',
                              boxShadow: isSpeaking ? '0 0 0 4px rgba(35, 165, 90, 0.35)' : 'none',
                              transition: 'all 0.15s ease'
                            }}>
                              {p.user_name ? p.user_name.charAt(0).toUpperCase() : 'U'}
                            </div>

                            <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#fff', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {p.user_name}
                            </div>

                            <div style={{ fontSize: '0.72rem', color: isThisUserScreenSharing ? '#a78bfa' : isSpeaking ? '#23a55a' : 'rgba(240, 240, 255, 0.45)', marginTop: '4px', fontWeight: 600 }}>
                              {isThisUserScreenSharing ? '🖥️ Sharing Screen' : p.is_muted ? 'Muted' : isSpeaking ? 'Speaking...' : 'Connected'}
                            </div>
                          </div>
                        );
                      }

                      // Empty Slot (up to 6)
                      return (
                        <div
                          key={`empty-slot-${idx}`}
                          style={{
                            background: 'rgba(255, 255, 255, 0.02)',
                            border: '1.5px dashed rgba(255, 255, 255, 0.12)',
                            borderRadius: '20px',
                            padding: '24px 16px',
                            textAlign: 'center',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minHeight: '170px'
                          }}
                        >
                          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(255, 255, 255, 0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255, 255, 255, 0.25)', fontSize: '1.2rem', marginBottom: '8px' }}>
                            +
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'rgba(240, 240, 255, 0.4)', fontWeight: 600 }}>
                            Empty Slot {idx + 1}/6
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'rgba(240, 240, 255, 0.25)', marginTop: '4px' }}>
                            Share code <strong>{currentRoom.room_code}</strong>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ── Discord Live In-Room Chat ──────────────────── */}
                <div className="glass-card" style={{
                  borderRadius: '20px',
                  padding: '20px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  background: 'rgba(18, 19, 45, 0.75)',
                  display: 'flex',
                  flexDirection: 'column',
                  maxHeight: activeScreenStream ? '520px' : '440px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', paddingBottom: '10px' }}>
                    <span>💬</span>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: '#fff' }}>Room Text Channel</h3>
                  </div>

                  <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px', paddingRight: '4px' }}>
                    {chatMessages.length === 0 ? (
                      <div style={{ color: 'rgba(255, 255, 255, 0.35)', textAlign: 'center', marginTop: '40px', fontSize: '0.85rem' }}>
                        Welcome to #{currentRoom.title}! Send a message to chat while you talk. 👋
                      </div>
                    ) : chatMessages.map((msg) => (
                      <div key={msg.id} style={{ background: 'rgba(255, 255, 255, 0.04)', borderRadius: '12px', padding: '10px 14px' }}>
                        <div style={{ fontSize: '0.75rem', color: '#3ecfcf', fontWeight: 700, marginBottom: '2px', display: 'flex', justifyContent: 'space-between' }}>
                          <span>{msg.sender_name}</span>
                          <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.88rem', color: 'rgba(240, 240, 255, 0.9)', lineHeight: 1.4 }}>{msg.content}</div>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>

                  <form onSubmit={handleSendChat} style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      placeholder="Message in study room..."
                      style={{
                        flex: 1,
                        background: 'rgba(255, 255, 255, 0.06)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '10px',
                        padding: '10px 14px',
                        color: '#fff',
                        outline: 'none',
                        fontSize: '0.85rem'
                      }}
                    />
                    <button type="submit" className="btn btn-primary" style={{ padding: '10px 16px', borderRadius: '10px', fontWeight: 700 }}>
                      Send
                    </button>
                  </form>
                </div>

              </div>
            </div>
          )}

          {/* ── Browse / Join Room Landing View ───────────────── */}
          {(!currentRoom || connectionStatus === 'disconnected') && (
            <div>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    🎙️ Collaborative Voice Rooms
                    <span style={{ fontSize: '0.75rem', background: 'rgba(62,207,207,0.15)', color: '#3ecfcf', border: '1px solid rgba(62,207,207,0.3)', padding: '4px 12px', borderRadius: '20px' }}>
                      Max 6 Members + Screen Share
                    </span>
                  </h1>
                  <p style={{ color: 'rgba(240,240,255,0.55)', fontSize: '0.95rem' }}>
                    Discord-style peer voice rooms with controlled screen sharing. Connect with study partners from any laptop, tablet, or phone.
                  </p>
                </div>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="btn btn-primary"
                  style={{ padding: '12px 24px', borderRadius: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  ➕ Create Voice Room
                </button>
              </div>

              {/* Join by Code Card */}
              <div className="glass-card" style={{ padding: '24px 28px', borderRadius: '20px', marginBottom: '28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', border: '1px solid rgba(108,99,255,0.25)' }}>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '4px' }}>🔑 Enter a 6-Digit Room Code</h3>
                  <p style={{ fontSize: '0.85rem', color: 'rgba(240,240,255,0.5)', margin: 0 }}>
                    Enter the code shared by your classmate to join their room instantly.
                  </p>
                </div>
                <form onSubmit={handleJoinByCode} style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="text"
                    maxLength={8}
                    placeholder="e.g. 619284"
                    value={joinCodeInput}
                    onChange={e => setJoinCodeInput(e.target.value.replace(/[^0-9]/g, ''))}
                    style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '12px', padding: '11px 18px', color: '#fff', outline: 'none', fontSize: '1.1rem', letterSpacing: '3px', width: '140px', textAlign: 'center', fontWeight: 700 }}
                  />
                  <button type="submit" className="btn btn-primary" style={{ borderRadius: '12px', padding: '11px 22px', fontWeight: 700 }}>
                    Join Room
                  </button>
                </form>
              </div>

              {/* Rooms Grid */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>📡 Live Study Rooms</h2>
                <button onClick={fetchGlobalRooms} className="btn btn-secondary" style={{ borderRadius: '10px', padding: '8px 16px', fontSize: '0.85rem' }}>
                  🔄 Refresh Rooms
                </button>
              </div>

              {activeRooms.length === 0 ? (
                <div className="glass-card" style={{ padding: '60px', textAlign: 'center', borderRadius: '24px' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🎙️</div>
                  <h3 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>No active rooms</h3>
                  <p style={{ color: 'rgba(240,240,255,0.5)', marginBottom: '24px' }}>Be the first to start a study room!</p>
                  <button onClick={() => setShowCreateModal(true)} className="btn btn-primary" style={{ padding: '12px 28px', borderRadius: '14px' }}>
                    Create a Study Room
                  </button>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                  {activeRooms.map((room) => {
                    const isFull = (room.current_participants || 0) >= (room.max_participants || 6);
                    const isDemo = Boolean(room.is_demo);

                    return (
                      <div key={room.id || room.room_code} className="glass-card" style={{ padding: '24px', borderRadius: '20px', display: 'flex', flexDirection: 'column', gap: '16px', border: isDemo ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(62,207,207,0.3)', position: 'relative' }}>
                        {isDemo ? (
                          <span style={{ position: 'absolute', top: '14px', right: '14px', fontSize: '0.65rem', background: 'rgba(108,99,255,0.2)', color: '#6c63ff', border: '1px solid rgba(108,99,255,0.35)', borderRadius: '8px', padding: '3px 8px', fontWeight: 600 }}>
                            DEMO
                          </span>
                        ) : (
                          <span style={{ position: 'absolute', top: '14px', right: '14px', fontSize: '0.7rem', background: 'rgba(62,207,207,0.2)', color: '#3ecfcf', border: '1px solid rgba(62,207,207,0.4)', borderRadius: '8px', padding: '3px 8px', fontWeight: 700 }}>
                            🟢 LIVE NOW
                          </span>
                        )}
                        <div>
                          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '10px', paddingRight: '70px' }}>{room.title}</h3>
                          <div style={{ fontSize: '0.82rem', color: 'rgba(240,240,255,0.5)', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            <span>Host: <strong style={{ color: '#fff' }}>{room.host_name}</strong></span>
                            <span>Code: <strong style={{ color: '#3ecfcf', letterSpacing: '2px', fontSize: '1rem' }}>{room.room_code}</strong></span>
                            <span style={{ color: isFull ? '#ff4d4d' : 'rgba(240,240,255,0.5)' }}>
                              👥 {room.current_participants || 1}/{room.max_participants || 6} {isFull ? '— FULL' : ''}
                            </span>
                            {room.document_title && (
                              <span style={{ color: '#6c63ff', marginTop: '2px' }}>📄 {room.document_title}</span>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => joinRoom(room.room_code)}
                          disabled={isFull}
                          className="btn"
                          style={{
                            width: '100%',
                            padding: '11px',
                            borderRadius: '12px',
                            fontWeight: 700,
                            background: isFull ? 'rgba(255,255,255,0.04)' : 'linear-gradient(135deg,#6c63ff,#3ecfcf)',
                            color: isFull ? 'rgba(255,255,255,0.25)' : '#fff',
                            cursor: isFull ? 'not-allowed' : 'pointer',
                            border: 'none',
                            fontSize: '0.9rem'
                          }}
                        >
                          {isFull ? 'Room Full' : '🎙️ Join Room'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* How it works */}
              <div className="glass-card" style={{ marginTop: '32px', padding: '24px 28px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '14px', color: 'rgba(240,240,255,0.8)' }}>🛈 How Voice & Screen Share Work</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: '16px' }}>
                  {[
                    { icon: '➕', title: '1. Create a room', desc: 'Click Create Voice Room, enter your topic, and get your 6-digit code.' },
                    { icon: '📤', title: '2. Share with classmates', desc: 'Send the 6-digit code to up to 5 classmates to join from any device.' },
                    { icon: '🎙️', title: '3. Discord audio with VAD', desc: 'Crystal-clear Opus voice chat with green halos showing who is speaking.' },
                    { icon: '🖥️', title: '4. Controlled Screen Sharing', desc: 'One member can share their screen or slides at a time with full theater view.' },
                  ].map(s => (
                    <div key={s.title} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '14px 16px' }}>
                      <div style={{ fontSize: '1.4rem', marginBottom: '6px' }}>{s.icon}</div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '4px' }}>{s.title}</div>
                      <div style={{ fontSize: '0.8rem', color: 'rgba(240,240,255,0.45)' }}>{s.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Create Room Modal ─────────────────────────────── */}
          {showCreateModal && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,5,16,0.85)', backdropFilter: 'blur(12px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
              <div className="glass-card" style={{ width: '100%', maxWidth: '460px', padding: '36px', borderRadius: '28px', border: '1px solid rgba(108,99,255,0.3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                  <h2 style={{ fontSize: '1.35rem', fontWeight: 800 }}>🎙️ Start a Voice Room</h2>
                  <button onClick={() => setShowCreateModal(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '1.3rem' }}>✕</button>
                </div>

                <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'rgba(240,240,255,0.7)', marginBottom: '8px', fontWeight: 600 }}>Room Topic / Title</label>
                    <input
                      type="text"
                      placeholder="e.g. Calculus Chapter 4 — Practice Problems"
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      required
                      autoFocus
                      style={{ width: '100%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none', boxSizing: 'border-box', fontSize: '0.95rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'rgba(240,240,255,0.7)', marginBottom: '8px', fontWeight: 600 }}>Link Study Notes (Optional)</label>
                    <select
                      value={selectedDocId}
                      onChange={e => setSelectedDocId(e.target.value)}
                      style={{ width: '100%', background: '#0d0d2b', border: '1px solid rgba(255,255,255,0.14)', borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none', boxSizing: 'border-box' }}
                    >
                      <option value="">No document linked</option>
                      {documents.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
                    </select>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.04)', padding: '12px 16px', borderRadius: '12px' }}>
                    <input
                      type="checkbox"
                      id="autoAdmitCheck"
                      checked={autoAdmitCheckbox}
                      onChange={e => setAutoAdmitCheckbox(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    <label htmlFor="autoAdmitCheck" style={{ fontSize: '0.85rem', color: 'rgba(240,240,255,0.85)', cursor: 'pointer' }}>
                      <strong>Auto-admit classmates</strong> (automatically admit users who enter the room code)
                    </label>
                  </div>

                  <div style={{ background: 'rgba(62,207,207,0.08)', padding: '12px 16px', borderRadius: '12px', border: '1px solid rgba(62,207,207,0.2)', fontSize: '0.82rem', color: '#3ecfcf' }}>
                    👥 Max 6 members. Supports peer learning with live audio, speaking detection, controlled screen sharing, and chat.
                  </div>

                  <div style={{ display: 'flex', gap: '12px', marginTop: '6px' }}>
                    <button type="button" onClick={() => setShowCreateModal(false)} className="btn btn-secondary" style={{ flex: 1, borderRadius: '12px' }}>Cancel</button>
                    <button type="submit" className="btn btn-primary" style={{ flex: 1, borderRadius: '12px', fontWeight: 700 }}>🚀 Launch Room</button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </main>
      </div>

      <style>{`
        @keyframes ping {
          75%, 100% {
            transform: scale(2);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
