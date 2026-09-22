import React, { useState, useEffect, useRef } from 'react';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import { useVoiceRoom, getStoredRooms } from '../context/VoiceRoomContext';
import { useStudy } from '../context/StudyContext';
import { useToast } from '../hooks/useToast';

export default function VoiceRoomsPage() {
  const {
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
  } = useVoiceRoom();

  const { documents, loadDocuments } = useStudy();
  const { addToast } = useToast();

  const [activeRooms, setActiveRooms] = useState(getStoredRooms);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [selectedDocId, setSelectedDocId] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef(null);

  useEffect(() => { loadDocuments(); }, []);

  // Refresh rooms list whenever user joins/leaves
  useEffect(() => {
    setActiveRooms(getStoredRooms());
  }, [currentRoom]);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleRefresh = () => setActiveRooms(getStoredRooms());

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) { addToast('Please enter a room title.', 'warning'); return; }
    const room = await createRoom(newTitle, selectedDocId);
    if (room) {
      setShowCreateModal(false);
      setNewTitle('');
      setSelectedDocId('');
      setActiveRooms(getStoredRooms());
    }
  };

  const handleJoinByCode = async (e) => {
    e.preventDefault();
    if (!joinCodeInput.trim()) { addToast('Please enter the 6-digit room code.', 'warning'); return; }
    await joinRoom(joinCodeInput.trim());
    setJoinCodeInput('');
    setTimeout(() => setActiveRooms(getStoredRooms()), 300);
  };

  const handleSendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sendChatMessage(chatInput.trim());
    setChatInput('');
  };

  const statusColors = { connected: '#3ecfcf', connecting: '#f0c040', disconnected: '#ff4d4d' };
  const statusLabel = { connected: '🟢 Connected', connecting: '🟡 Connecting…', disconnected: '🔴 Disconnected' };

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at top, #0d0d2b 0%, #050510 100%)', display: 'flex', flexDirection: 'column' }}>
      <Navbar />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />

        <main style={{ flex: 1, padding: '32px', maxWidth: '1200px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

          {/* ── In-Room Panel ─────────────────────────────────── */}
          {currentRoom ? (
            <div>
              {/* Room Header */}
              <div className="glass-card" style={{ padding: '28px 32px', borderRadius: '24px', marginBottom: '24px', border: '1px solid rgba(62,207,207,0.35)', boxShadow: '0 0 30px rgba(62,207,207,0.12)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                      <span style={{ fontSize: '1.8rem' }}>🎙️</span>
                      <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>{currentRoom.title}</h1>
                    </div>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ color: statusColors[connectionStatus] || '#3ecfcf', fontWeight: 700, fontSize: '0.9rem' }}>
                        {statusLabel[connectionStatus] || '🟢 Connected'}
                      </span>
                      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>
                        Code: <strong style={{ color: '#3ecfcf', letterSpacing: '2px' }}>{currentRoom.room_code}</strong>
                      </span>
                      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>
                        👥 {participants.length}/{currentRoom.max_participants}
                      </span>
                    </div>
                    <div style={{ marginTop: '10px', padding: '8px 16px', background: 'rgba(62,207,207,0.1)', borderRadius: '10px', border: '1px solid rgba(62,207,207,0.2)', display: 'inline-block', fontSize: '0.8rem', color: '#3ecfcf' }}>
                      📋 Share code <strong>{currentRoom.room_code}</strong> with your classmates so they can join!
                    </div>
                  </div>

                  {/* Controls */}
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      onClick={toggleMute}
                      className="btn"
                      style={{ padding: '10px 20px', borderRadius: '12px', fontWeight: 700, fontSize: '0.9rem', background: isMuted ? 'rgba(255,77,77,0.2)' : 'rgba(62,207,207,0.15)', color: isMuted ? '#ff4d4d' : '#3ecfcf', border: isMuted ? '1px solid rgba(255,77,77,0.4)' : '1px solid rgba(62,207,207,0.35)' }}
                    >
                      {isMuted ? '🔇 Unmute' : '🎤 Mute'}
                    </button>
                    <button
                      onClick={toggleDeafen}
                      className="btn"
                      style={{ padding: '10px 20px', borderRadius: '12px', fontWeight: 700, fontSize: '0.9rem', background: isDeafened ? 'rgba(255,165,0,0.2)' : 'rgba(108,99,255,0.15)', color: isDeafened ? '#ffa500' : '#6c63ff', border: isDeafened ? '1px solid rgba(255,165,0,0.4)' : '1px solid rgba(108,99,255,0.35)' }}
                    >
                      {isDeafened ? '🔕 Undeafen' : '🔊 Deafen'}
                    </button>
                    <button
                      onClick={leaveRoom}
                      className="btn"
                      style={{ padding: '10px 20px', borderRadius: '12px', fontWeight: 700, fontSize: '0.9rem', background: 'rgba(255,77,77,0.15)', color: '#ff4d4d', border: '1px solid rgba(255,77,77,0.3)' }}
                    >
                      🚪 Leave Room
                    </button>
                  </div>
                </div>
              </div>

              {/* Participants + Chat */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '24px' }}>

                {/* Participants Grid */}
                <div>
                  <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px', color: 'rgba(240,240,255,0.9)' }}>
                    👥 Participants ({participants.length})
                  </h2>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '16px' }}>
                    {participants.map((p) => {
                      const isSpeaking = activeSpeakers[p.user_id];
                      return (
                        <div key={p.id || p.user_id} style={{
                          background: 'rgba(255,255,255,0.05)',
                          border: isSpeaking ? '2px solid #3ecfcf' : '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '16px',
                          padding: '20px 14px',
                          textAlign: 'center',
                          boxShadow: isSpeaking ? '0 0 20px rgba(62,207,207,0.3)' : 'none',
                          transition: 'all 0.2s ease'
                        }}>
                          <div style={{
                            width: '52px', height: '52px',
                            borderRadius: '50%',
                            background: isSpeaking ? 'linear-gradient(135deg,#3ecfcf,#6c63ff)' : 'rgba(108,99,255,0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 10px',
                            fontSize: '1.3rem',
                            transition: 'all 0.2s ease'
                          }}>
                            {p.is_muted ? '🔇' : isSpeaking ? '🎤' : '🎧'}
                          </div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.user_name}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>
                            {p.is_muted ? 'Muted' : isSpeaking ? 'Speaking' : 'Listening'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Chat */}
                <div className="glass-card" style={{ borderRadius: '20px', padding: '20px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', maxHeight: '420px' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '14px' }}>💬 Room Chat</h3>
                  <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px', paddingRight: '4px' }}>
                    {chatMessages.length === 0 ? (
                      <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: '30px', fontSize: '0.85rem' }}>
                        No messages yet. Say hello! 👋
                      </div>
                    ) : chatMessages.map((msg) => (
                      <div key={msg.id} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '8px 12px' }}>
                        <div style={{ fontSize: '0.75rem', color: '#3ecfcf', fontWeight: 600, marginBottom: '3px' }}>{msg.sender_name}</div>
                        <div style={{ fontSize: '0.85rem', color: 'rgba(240,240,255,0.85)' }}>{msg.content}</div>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                  <form onSubmit={handleSendChat} style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      placeholder="Type a message…"
                      style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '10px 14px', color: '#fff', outline: 'none', fontSize: '0.85rem' }}
                    />
                    <button type="submit" className="btn btn-primary" style={{ padding: '10px 14px', borderRadius: '10px', fontWeight: 700 }}>
                      Send
                    </button>
                  </form>
                </div>
              </div>
            </div>
          ) : (
            /* ── Browse / Join Room View ───────────────────────── */
            <div>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    🎙️ Collaborative Voice Rooms
                    <span style={{ fontSize: '0.75rem', background: 'rgba(62,207,207,0.15)', color: '#3ecfcf', border: '1px solid rgba(62,207,207,0.3)', padding: '4px 12px', borderRadius: '20px' }}>
                      Max 6 Members
                    </span>
                  </h1>
                  <p style={{ color: 'rgba(240,240,255,0.55)', fontSize: '0.95rem' }}>
                    Study live with classmates using real-time voice. Create a room and share the 6-digit code.
                  </p>
                </div>
                <button onClick={() => setShowCreateModal(true)} className="btn btn-primary" style={{ padding: '12px 24px', borderRadius: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  ➕ Create Voice Room
                </button>
              </div>

              {/* Join by Code */}
              <div className="glass-card" style={{ padding: '24px 28px', borderRadius: '20px', marginBottom: '28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', border: '1px solid rgba(108,99,255,0.2)' }}>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '4px' }}>🔑 Have a Room Code?</h3>
                  <p style={{ fontSize: '0.85rem', color: 'rgba(240,240,255,0.5)', margin: 0 }}>Enter the 6-digit code your classmate shared to join their room on any device.</p>
                </div>
                <form onSubmit={handleJoinByCode} style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="text"
                    maxLength={8}
                    placeholder="e.g. 849201"
                    value={joinCodeInput}
                    onChange={e => setJoinCodeInput(e.target.value.replace(/[^0-9]/g, ''))}
                    style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '12px', padding: '11px 18px', color: '#fff', outline: 'none', fontSize: '1.1rem', letterSpacing: '3px', width: '130px', textAlign: 'center', fontWeight: 700 }}
                  />
                  <button type="submit" className="btn btn-primary" style={{ borderRadius: '12px', padding: '11px 22px', fontWeight: 700 }}>
                    Join Room
                  </button>
                </form>
              </div>

              {/* Rooms Grid */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>📡 Live Study Rooms</h2>
                <button onClick={handleRefresh} className="btn btn-secondary" style={{ borderRadius: '10px', padding: '8px 16px', fontSize: '0.85rem' }}>
                  🔄 Refresh
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
                    const isPreset = room.id?.startsWith('preset-');

                    return (
                      <div key={room.id} className="glass-card" style={{ padding: '24px', borderRadius: '20px', display: 'flex', flexDirection: 'column', gap: '16px', border: '1px solid rgba(255,255,255,0.08)', position: 'relative' }}>
                        {isPreset && (
                          <span style={{ position: 'absolute', top: '14px', right: '14px', fontSize: '0.65rem', background: 'rgba(108,99,255,0.2)', color: '#6c63ff', border: '1px solid rgba(108,99,255,0.35)', borderRadius: '8px', padding: '3px 8px', fontWeight: 600 }}>
                            DEMO
                          </span>
                        )}
                        <div>
                          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '10px', paddingRight: isPreset ? '56px' : '0' }}>{room.title}</h3>
                          <div style={{ fontSize: '0.82rem', color: 'rgba(240,240,255,0.5)', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            <span>Host: <strong style={{ color: '#fff' }}>{room.host_name}</strong></span>
                            <span>Code: <strong style={{ color: '#3ecfcf', letterSpacing: '2px', fontSize: '0.95rem' }}>{room.room_code}</strong></span>
                            <span style={{ color: isFull ? '#ff4d4d' : 'rgba(240,240,255,0.5)' }}>
                              👥 {room.current_participants}/{room.max_participants} {isFull ? '— FULL' : ''}
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
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '14px', color: 'rgba(240,240,255,0.8)' }}>🛈 How Voice Rooms Work</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: '16px' }}>
                  {[
                    { icon: '➕', title: 'Create a room', desc: 'Click "Create Voice Room", give it a title, and get your 6-digit code.' },
                    { icon: '📤', title: 'Share the code', desc: 'Send the 6-digit code to your classmates (WhatsApp, text, etc.).' },
                    { icon: '🔑', title: 'Join from any device', desc: 'Your classmates enter the code on any laptop or phone and join instantly.' },
                    { icon: '🎤', title: 'Study together live', desc: 'Talk, chat, and study together. Works without any server — peer to peer!' },
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
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,5,16,0.82)', backdropFilter: 'blur(12px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
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

                  <div style={{ background: 'rgba(62,207,207,0.08)', padding: '12px 16px', borderRadius: '12px', border: '1px solid rgba(62,207,207,0.2)', fontSize: '0.82rem', color: '#3ecfcf' }}>
                    ✅ Your room will be joinable from <strong>any laptop or device</strong> using the 6-digit code. No sign-in needed for classmates to join.
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
    </div>
  );
}
