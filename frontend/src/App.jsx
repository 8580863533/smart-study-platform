import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { VoiceRoomProvider } from './context/VoiceRoomContext';
import Toast from './components/Toast';
import VoiceRoomWidget from './components/VoiceRoomWidget';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import Dashboard from './pages/Dashboard';
import VoiceRoomsPage from './pages/VoiceRoomsPage';
import UploadPage from './pages/UploadPage';
import QAPage from './pages/QAPage';
import SummarizePage from './pages/SummarizePage';
import FlashcardsPage from './pages/FlashcardsPage';
import QuizPage from './pages/QuizPage';
import ProgressPage from './pages/ProgressPage';
import LoginHistoryPage from './pages/LoginHistoryPage';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'radial-gradient(ellipse at top, #0d0d2b 0%, #050510 100%)',
          color: '#fff',
          padding: '24px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🎓</div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '8px' }}>Study Workspace Recovered</h2>
          <p style={{ color: 'rgba(240,240,255,0.6)', maxWidth: '450px', marginBottom: '24px' }}>
            Your notes and progress are safe. Click below to continue studying.
          </p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => { this.setState({ hasError: false }); window.location.href = '#/dashboard'; window.location.reload(); }}
              style={{
                padding: '12px 24px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #6c63ff 0%, #3ecfcf 100%)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Go to Dashboard
            </button>
            <button
              onClick={() => { localStorage.clear(); window.location.reload(); }}
              style={{
                padding: '12px 24px',
                borderRadius: '12px',
                background: 'rgba(255,255,255,0.08)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.15)',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Reset Session
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', flexDirection: 'column', gap: '16px',
        background: '#050510'
      }}>
        <div style={{
          width: 48, height: 48,
          border: '3px solid rgba(108,99,255,0.2)',
          borderTopColor: '#6c63ff',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite'
        }} />
        <p style={{ color: 'rgba(240,240,255,0.7)', fontSize: '0.875rem' }}>Loading workspace...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : children;
}

export default function App() {
  return (
    <VoiceRoomProvider>
      <Toast />
      <VoiceRoomWidget />
      <Routes>
        {/* Public */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />

        {/* Protected */}
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/voicerooms" element={<ProtectedRoute><VoiceRoomsPage /></ProtectedRoute>} />
        <Route path="/upload" element={<ProtectedRoute><UploadPage /></ProtectedRoute>} />
        <Route path="/qa" element={<ProtectedRoute><QAPage /></ProtectedRoute>} />
        <Route path="/qa/:docId" element={<ProtectedRoute><QAPage /></ProtectedRoute>} />
        <Route path="/summarize" element={<ProtectedRoute><SummarizePage /></ProtectedRoute>} />
        <Route path="/summarize/:docId" element={<ProtectedRoute><SummarizePage /></ProtectedRoute>} />
        <Route path="/flashcards" element={<ProtectedRoute><FlashcardsPage /></ProtectedRoute>} />
        <Route path="/flashcards/:docId" element={<ProtectedRoute><FlashcardsPage /></ProtectedRoute>} />
        <Route path="/quiz" element={<ProtectedRoute><QuizPage /></ProtectedRoute>} />
        <Route path="/quiz/:docId" element={<ProtectedRoute><QuizPage /></ProtectedRoute>} />
        <Route path="/progress" element={<ProtectedRoute><ProgressPage /></ProtectedRoute>} />
        <Route path="/login-history" element={<ProtectedRoute><LoginHistoryPage /></ProtectedRoute>} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </VoiceRoomProvider>
  );
}
