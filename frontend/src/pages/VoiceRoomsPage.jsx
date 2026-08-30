import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import { useVoiceRoom } from '../context/VoiceRoomContext';
import { useStudy } from '../context/StudyContext';
import { voiceroomsAPI } from '../api/client';
import { useToast } from '../hooks/useToast';

export default function VoiceRoomsPage() {
  const { currentRoom, createRoom, joinRoom } = useVoiceRoom();
  const { documents, loadDocuments } = useStudy();
  const { addToast } = useToast();

  const [activeRooms, setActiveRooms] = useState([]);
  const [loading, setLoading] = useState(false);

  // Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [selectedDocId, setSelectedDocId] = useState('');

  // Join Code State
  const [joinCodeInput, setJoinCodeInput] = useState('');

  useEffect(() => {
    loadDocuments();
    fetchActiveRooms();
  }, []);

  const fetchActiveRooms = async () => {
    setLoading(true);
    try {
      const res = await voiceroomsAPI.active();
      if (res.data.success && res.data.data.rooms) {
        setActiveRooms(res.data.data.rooms);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      addToast("Please enter a room title.", "warning");
      return;
    }
    const room = await createRoom(newTitle, selectedDocId);
    if (room) {
      setShowCreateModal(false);
      setNewTitle('');
      setSelectedDocId('');
      fetchActiveRooms();
    }
  };

  const handleJoinByCode = async (e) => {
    e.preventDefault();
    if (!joinCodeInput.trim()) {
      addToast("Please enter a 6-digit room code.", "warning");
      return;
    }
    await joinRoom(joinCodeInput);
    setJoinCodeInput('');
    fetchActiveRooms();
  };

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at top, #0d0d2b 0%, #050510 100%)', display: 'flex', flexDirection: 'column' }}>
      <Navbar />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />

        <main style={{ flex: 1, padding: '40px', maxWidth: '1200px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '20px' }}>
            <div>
              <h1 style={{ fontSize: '2.25rem', fontWeight: 800, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span>🎙️ Collaborative Voice Rooms</span>
                <span style={{ fontSize: '0.8rem', background: 'rgba(62, 207, 207, 0.2)', color: '#3ecfcf', border: '1px solid rgba(62, 207, 207, 0.4)', padding: '4px 12px', borderRadius: '20px' }}>
                  👥 Max 6 Members
                </span>
              </h1>
              <p style={{ color: 'rgba(240,240,255,0.6)' }}>
                Solve notes together, discuss questions live, and collaborate with peers while navigating the app.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', borderRadius: '14px', fontWeight: 700 }}
              >
                <span>➕</span> Create Voice Room
              </button>
            </div>
          </div>

          {/* Quick Join via Code Bar */}
          <div className="glass-card" style={{ padding: '24px 32px', borderRadius: '20px', marginBottom: '32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '4px' }}>Have a 6-Digit Room Code?</h3>
              <p style={{ fontSize: '0.85rem', color: 'rgba(240,240,255,0.5)' }}>Enter the room code shared by your classmate to join instantly.</p>
            </div>

            <form onSubmit={handleJoinByCode} style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                placeholder="e.g. STUDY-8A2"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value)}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '12px',
                  padding: '10px 16px',
                  color: '#fff',
                  outline: 'none',
                  fontSize: '0.95rem',
                  letterSpacing: '1px',
                  textTransform: 'uppercase'
                }}
              />
              <button type="submit" className="btn btn-secondary" style={{ borderRadius: '12px', padding: '10px 20px', fontWeight: 600 }}>
                Join Room
              </button>
            </form>
          </div>

          {/* Active Voice Rooms Grid */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 700 }}>Live Study Rooms</h2>
            <button onClick={fetchActiveRooms} className="btn btn-secondary btn-sm" style={{ borderRadius: '10px' }}>
              🔄 Refresh Rooms
            </button>
          </div>

          {loading ? (
            <div style={{ color: 'rgba(240,240,255,0.5)', textAlign: 'center', padding: '40px' }}>Loading active voice rooms...</div>
          ) : activeRooms.length === 0 ? (
            <div className="glass-card" style={{ padding: '60px', textAlign: 'center', borderRadius: '24px' }}>
              <div style={{ fontSize: '3.5rem', marginBottom: '16px' }}>🎙️</div>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>No active voice rooms right now</h3>
              <p style={{ color: 'rgba(240,240,255,0.5)', marginBottom: '24px' }}>
                Be the first to start a live study room and invite your study partners!
              </p>
              <button onClick={() => setShowCreateModal(true)} className="btn btn-primary" style={{ padding: '12px 28px', borderRadius: '14px' }}>
                Create a Study Room
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
              {activeRooms.map((room) => {
                const isFull = room.current_participants >= room.max_participants;
                const isCurrent = currentRoom?.id === room.id;

                return (
                  <div
                    key={room.id}
                    className="glass-card"
                    style={{
                      padding: '28px',
                      borderRadius: '24px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      border: isCurrent ? '1px solid #3ecfcf' : '1px solid rgba(255,255,255,0.08)',
                      boxShadow: isCurrent ? '0 0 20px rgba(62,207,207,0.2)' : 'none',
                      gap: '20px'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                        <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff' }}>{room.title}</h3>
                        <span style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '4px 10px',
                          borderRadius: '12px',
                          background: isFull ? 'rgba(255, 77, 77, 0.15)' : 'rgba(108, 99, 255, 0.15)',
                          color: isFull ? '#ff4d4d' : '#6c63ff',
                          border: isFull ? '1px solid rgba(255, 77, 77, 0.3)' : '1px solid rgba(108, 99, 255, 0.3)'
                        }}>
                          👥 {room.current_participants}/{room.max_participants} {isFull ? 'FULL' : ''}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.85rem', color: 'rgba(240,240,255,0.5)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div>Host: <strong style={{ color: '#fff' }}>{room.host_name}</strong></div>
                        <div>Room Code: <strong style={{ color: '#3ecfcf', letterSpacing: '1px' }}>{room.room_code}</strong></div>
                        {room.document_title && (
                          <div style={{ marginTop: '4px', background: 'rgba(255,255,255,0.04)', padding: '4px 10px', borderRadius: '8px', display: 'inline-block', fontSize: '0.8rem', color: '#6c63ff' }}>
                            📄 {room.document_title}
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => joinRoom(room.id)}
                      disabled={isFull || isCurrent}
                      className="btn"
                      style={{
                        width: '100%',
                        padding: '12px',
                        borderRadius: '12px',
                        fontWeight: 700,
                        background: isCurrent ? 'rgba(62, 207, 207, 0.2)' : isFull ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #6c63ff 0%, #3ecfcf 100%)',
                        color: isCurrent ? '#3ecfcf' : isFull ? 'rgba(255,255,255,0.3)' : '#fff',
                        cursor: isFull || isCurrent ? 'not-allowed' : 'pointer',
                        border: 'none'
                      }}
                    >
                      {isCurrent ? 'Connected In Room' : isFull ? 'Room Full (Max 6)' : 'Join Voice Room'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Create Room Modal */}
          {showCreateModal && (
            <div style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(5, 5, 16, 0.8)',
              backdropFilter: 'blur(12px)',
              zIndex: 10000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px'
            }}>
              <div className="glass-card" style={{ width: '100%', maxWidth: '480px', padding: '36px', borderRadius: '28px', border: '1px solid rgba(108, 99, 255, 0.3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                  <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Start a Collaborative Voice Room</h2>
                  <button onClick={() => setShowCreateModal(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '1.2rem' }}>
                    ✕
                  </button>
                </div>

                <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'rgba(240,240,255,0.7)', marginBottom: '8px', fontWeight: 600 }}>
                      Room Study Topic / Title
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Calculus Chapter 4 Problem Solving"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: '12px',
                        padding: '12px 16px',
                        color: '#fff',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'rgba(240,240,255,0.7)', marginBottom: '8px', fontWeight: 600 }}>
                      Link to Study Notes (Optional)
                    </label>
                    <select
                      value={selectedDocId}
                      onChange={(e) => setSelectedDocId(e.target.value)}
                      style={{
                        width: '100%',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: '12px',
                        padding: '12px 16px',
                        color: '#fff',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    >
                      <option value="" style={{ background: '#0d0d2b' }}>No document linked</option>
                      {documents.map((d) => (
                        <option key={d.id} value={d.id} style={{ background: '#0d0d2b' }}>{d.title}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ background: 'rgba(62, 207, 207, 0.08)', padding: '14px 18px', borderRadius: '12px', border: '1px solid rgba(62, 207, 207, 0.2)', fontSize: '0.85rem', color: '#3ecfcf' }}>
                    👥 Room capacity is set to <strong>Max 6 Members</strong> for optimal audio quality & focused discussion.
                  </div>

                  <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                    <button type="button" onClick={() => setShowCreateModal(false)} className="btn btn-secondary" style={{ flex: 1, borderRadius: '12px' }}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" style={{ flex: 1, borderRadius: '12px', fontWeight: 700 }}>
                      Launch Room
                    </button>
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
