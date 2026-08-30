import React, { useState } from 'react';
import { useVoiceRoom } from '../context/VoiceRoomContext';
import { useToast } from '../hooks/useToast';

export default function VoiceRoomWidget() {
  const {
    currentRoom,
    participants,
    isMuted,
    isDeafened,
    activeSpeakers,
    chatMessages,
    toggleMute,
    toggleDeafen,
    leaveRoom,
    sendChatMessage
  } = useVoiceRoom();
  const { addToast } = useToast();

  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [minimized, setMinimized] = useState(false);

  if (!currentRoom) return null;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(currentRoom.room_code);
    addToast(`Room code ${currentRoom.room_code} copied to clipboard!`, "success");
  };

  const handleSendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sendChatMessage(chatInput);
    setChatInput('');
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      gap: '12px',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Expanded Chat Drawer */}
      {showChat && !minimized && (
        <div style={{
          width: '320px',
          height: '360px',
          background: 'rgba(13, 13, 43, 0.95)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(108, 99, 255, 0.3)',
          borderRadius: '20px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '14px 18px',
            background: 'rgba(255,255,255,0.03)',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>💬 Room Chat</span>
            <button
              onClick={() => setShowChat(false)}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>

          <div style={{
            flex: 1,
            padding: '14px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            {chatMessages.map((msg, i) => (
              <div key={msg.id || i} style={{
                background: 'rgba(255,255,255,0.04)',
                padding: '8px 12px',
                borderRadius: '10px',
                fontSize: '0.85rem'
              }}>
                <div style={{ fontSize: '0.75rem', color: '#3ecfcf', fontWeight: 600, marginBottom: '2px' }}>
                  {msg.user_name}
                </div>
                <div style={{ color: '#fff', wordBreak: 'break-word' }}>{msg.content}</div>
              </div>
            ))}
            {chatMessages.length === 0 && (
              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', marginTop: '40px', fontSize: '0.85rem' }}>
                No messages yet. Ask a question or share notes!
              </div>
            )}
          </div>

          <form onSubmit={handleSendChat} style={{ padding: '10px', display: 'flex', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <input
              type="text"
              placeholder="Type message..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '10px',
                padding: '8px 12px',
                color: '#fff',
                outline: 'none',
                fontSize: '0.85rem'
              }}
            />
            <button
              type="submit"
              style={{
                background: '#6c63ff',
                border: 'none',
                color: '#fff',
                padding: '8px 14px',
                borderRadius: '10px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.85rem'
              }}
            >
              Send
            </button>
          </form>
        </div>
      )}

      {/* Main Floating Voice Control Bar */}
      <div style={{
        background: 'rgba(13, 13, 43, 0.92)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(108, 99, 255, 0.4)',
        borderRadius: '24px',
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6)',
        color: '#fff'
      }}>
        {/* Active Members Avatars & Glow Rings */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '-8px' }}>
          {participants.map((p) => {
            const isSpeaking = activeSpeakers[p.user_id];
            return (
              <div
                key={p.id}
                title={`${p.user_name} ${p.is_muted ? '(Muted)' : ''}`}
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #6c63ff 0%, #3ecfcf 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  border: isSpeaking ? '2px solid #3ecfcf' : '2px solid #0d0d2b',
                  boxShadow: isSpeaking ? '0 0 12px #3ecfcf' : 'none',
                  transition: 'all 0.2s ease',
                  position: 'relative'
                }}
              >
                {p.user_name ? p.user_name[0].toUpperCase() : 'S'}
                {p.is_muted && (
                  <span style={{
                    position: 'absolute',
                    bottom: '-2px',
                    right: '-2px',
                    fontSize: '0.65rem',
                    background: '#ff4d4d',
                    borderRadius: '50%',
                    width: '14px',
                    height: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    🔇
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Room Information */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#3ecfcf' }}>🎙️</span>
            <span>{currentRoom.title}</span>
            <span style={{ fontSize: '0.75rem', background: 'rgba(108, 99, 255, 0.2)', color: '#6c63ff', padding: '2px 8px', borderRadius: '10px' }}>
              👥 {participants.length}/6
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'rgba(240, 240, 255, 0.5)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
            <span>Code: <strong>{currentRoom.room_code}</strong></span>
            <button
              onClick={handleCopyCode}
              style={{ background: 'none', border: 'none', color: '#3ecfcf', cursor: 'pointer', fontSize: '0.75rem', padding: 0 }}
            >
              📋 Copy
            </button>
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '8px' }}>
          <button
            onClick={toggleMute}
            title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              border: 'none',
              background: isMuted ? 'rgba(255, 77, 77, 0.2)' : 'rgba(255, 255, 255, 0.1)',
              color: isMuted ? '#ff4d4d' : '#fff',
              cursor: 'pointer',
              fontSize: '1.1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s'
            }}
          >
            {isMuted ? '🎙️❌' : '🎙️'}
          </button>

          <button
            onClick={toggleDeafen}
            title={isDeafened ? "Undeafen Audio" : "Deafen Audio"}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              border: 'none',
              background: isDeafened ? 'rgba(255, 77, 77, 0.2)' : 'rgba(255, 255, 255, 0.1)',
              color: isDeafened ? '#ff4d4d' : '#fff',
              cursor: 'pointer',
              fontSize: '1.1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s'
            }}
          >
            {isDeafened ? '🎧❌' : '🎧'}
          </button>

          <button
            onClick={() => setShowChat(!showChat)}
            title="Toggle Room Chat"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              border: 'none',
              background: showChat ? 'rgba(108, 99, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '1.1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s'
            }}
          >
            💬
          </button>

          <button
            onClick={leaveRoom}
            title="Leave Voice Room"
            style={{
              padding: '8px 16px',
              borderRadius: '20px',
              border: 'none',
              background: 'linear-gradient(135deg, #ff4d4d 0%, #f72585 100%)',
              color: '#fff',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '0.85rem',
              boxShadow: '0 4px 15px rgba(255, 77, 77, 0.3)'
            }}
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}
