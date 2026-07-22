import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import { useToast } from '../hooks/useToast';
import axios from 'axios';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  Legend
} from 'recharts';

export default function ProgressPage() {
  const { addToast } = useToast();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState(null);
  const [achievements, setAchievements] = useState([]);
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const dashboardRes = await axios.get('/api/progress/dashboard');
      if (dashboardRes.data.success) {
        setStats(dashboardRes.data.data);
      }

      const recsRes = await axios.get('/api/progress/recommendations');
      if (recsRes.data.success) {
        setRecommendations(recsRes.data.data);
      }

      const achRes = await axios.get('/api/progress/achievements');
      if (achRes.data.success) {
        setAchievements(achRes.data.data);
      }

      const sessionsRes = await axios.get('/api/progress/sessions?per_page=5');
      if (sessionsRes.data.success) {
        setSessions(sessionsRes.data.data.sessions);
      }
    } catch (err) {
      console.error(err);
      addToast("Failed to load progress analytics.", "error");
    } finally {
      setLoading(false);
    }
  };

  if (loading || !stats) {
    return (
      <div style={{ minHeight: '100vh', background: '#050510', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', border: '3px solid rgba(108,99,255,0.2)', borderTopColor: '#6c63ff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <p style={{ color: 'rgba(240,240,255,0.6)' }}>Compiling learning analytics...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Format date string to display
  const formatDate = (isoStr) => {
    return new Date(isoStr).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getActivityTypeLabel = (type) => {
    const labels = {
      qa: 'Asked AI Question',
      summarize: 'Summarized Notes',
      flashcard: 'Studied Flashcards',
      quiz: 'Took MCQ Quiz',
      upload: 'Uploaded Document'
    };
    return labels[type] || type;
  };

  const getActivityIcon = (type) => {
    const icons = {
      qa: '💬',
      summarize: '📝',
      flashcard: '🃏',
      quiz: '🎯',
      upload: '📤'
    };
    return icons[type] || '📚';
  };

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at top, #0d0d2b 0%, #050510 100%)', display: 'flex', flexDirection: 'column' }}>
      <Navbar />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />
        
        <main style={{ flex: 1, padding: '40px', maxWidth: '1200px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
          <div style={{ marginBottom: '32px' }}>
            <h1 style={{ fontSize: '2.25rem', fontWeight: 800, marginBottom: '8px' }}>Your Learning Journey</h1>
            <p style={{ color: 'rgba(240,240,255,0.5)' }}>Review comprehensive progress analytics, study metrics, and AI recommendations.</p>
          </div>

          {/* AI Recommendations Panel */}
          {recommendations && recommendations.recommendations && recommendations.recommendations.length > 0 && (
            <div className="glass-card" style={{
              padding: '28px 32px',
              borderRadius: '20px',
              marginBottom: '32px',
              borderLeft: '4px solid #3ecfcf',
              background: 'linear-gradient(90deg, rgba(62,207,207,0.05) 0%, rgba(255,255,255,0.01) 100%)'
            }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🧠 AI Study Recommendations
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {recommendations.recommendations.map((rec, i) => (
                  <div key={i} style={{ display: 'flex', gap: '12px', fontSize: '0.95rem', lineHeight: 1.5 }}>
                    <span style={{ color: '#3ecfcf' }}>✦</span>
                    <span style={{ color: 'rgba(240,240,255,0.85)' }}>{rec}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metrics Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '20px',
            marginBottom: '32px'
          }}>
            <div className="glass-card" style={{ padding: '24px', borderRadius: '16px' }}>
              <div style={{ fontSize: '0.85rem', color: 'rgba(240,240,255,0.5)', marginBottom: '8px', fontWeight: 600 }}>XP LEVEL</div>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: '#6c63ff' }}>Lvl {stats.user.level}</div>
              <div style={{ fontSize: '0.8rem', color: 'rgba(240,240,255,0.4)', marginTop: '4px' }}>{stats.user.xp} points accumulated</div>
            </div>

            <div className="glass-card" style={{ padding: '24px', borderRadius: '16px' }}>
              <div style={{ fontSize: '0.85rem', color: 'rgba(240,240,255,0.5)', marginBottom: '8px', fontWeight: 600 }}>ACTIVE STREAK</div>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: '#ff6b9d' }}>🔥 {stats.user.streak_days} days</div>
              <div style={{ fontSize: '0.8rem', color: 'rgba(240,240,255,0.4)', marginTop: '4px' }}>Keep reviewing daily</div>
            </div>

            <div className="glass-card" style={{ padding: '24px', borderRadius: '16px' }}>
              <div style={{ fontSize: '0.85rem', color: 'rgba(240,240,255,0.5)', marginBottom: '8px', fontWeight: 600 }}>FLASHCARDS DECK</div>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: '#00d4aa' }}>{stats.flashcards.mastered}/{stats.flashcards.total}</div>
              <div style={{ fontSize: '0.8rem', color: 'rgba(240,240,255,0.4)', marginTop: '4px' }}>Mastered (Level 4+)</div>
            </div>

            <div className="glass-card" style={{ padding: '24px', borderRadius: '16px' }}>
              <div style={{ fontSize: '0.85rem', color: 'rgba(240,240,255,0.5)', marginBottom: '8px', fontWeight: 600 }}>QUIZZES AVG</div>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: '#ffd60a' }}>
                {stats.quiz.total_taken > 0 ? `${stats.quiz.avg_score}%` : 'N/A'}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'rgba(240,240,255,0.4)', marginTop: '4px' }}>Out of {stats.quiz.total_taken} attempts</div>
            </div>
          </div>

          {/* Charts Row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))',
            gap: '24px',
            marginBottom: '32px'
          }}>
            {/* XP Growth Chart */}
            <div className="glass-card" style={{ padding: '24px', borderRadius: '20px' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '20px' }}>Study Consistency (Minutes Studied)</h3>
              <div style={{ width: '100%', height: '280px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.weekly_activity}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" stroke="rgba(240,240,255,0.3)" fontSize={11} tickLine={false} />
                    <YAxis stroke="rgba(240,240,255,0.3)" fontSize={11} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: '#0d0d2b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}
                      labelStyle={{ color: 'rgba(240,240,255,0.6)' }}
                    />
                    <Bar dataKey="time_minutes" name="Study Time (Mins)" fill="#3ecfcf" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top Topics Chart */}
            <div className="glass-card" style={{ padding: '24px', borderRadius: '20px' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '20px' }}>Top Notes Materials (Study Minutes)</h3>
              <div style={{ width: '100%', height: '280px' }}>
                {stats.top_topics.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.top_topics} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis type="number" stroke="rgba(240,240,255,0.3)" fontSize={11} />
                      <YAxis dataKey="title" type="category" stroke="rgba(240,240,255,0.3)" fontSize={11} width={120} tickLine={false} />
                      <Tooltip
                        contentStyle={{ background: '#0d0d2b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}
                      />
                      <Bar dataKey="total_duration_minutes" name="Study Duration (Mins)" fill="#6c63ff" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(240,240,255,0.3)', fontSize: '0.9rem' }}>
                    Study your documents to compile topic charts.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '24px', flexWrap: 'wrap' }}>
            {/* Achievements row */}
            <div className="glass-card" style={{ padding: '24px', borderRadius: '20px' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '20px' }}>Achievements</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {achievements.map((ach) => (
                  <div key={ach.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    opacity: ach.unlocked ? 1 : 0.4
                  }}>
                    <div style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '10px',
                      background: ach.unlocked ? 'rgba(108,99,255,0.1)' : 'rgba(255,255,255,0.02)',
                      border: '1px solid',
                      borderColor: ach.unlocked ? 'rgba(108,99,255,0.2)' : 'rgba(255,255,255,0.05)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.5rem',
                      flexShrink: 0
                    }}>
                      {ach.id === 'welcome' ? '🎒' : 
                       ach.id === 'first_upload' ? '📚' :
                       ach.id === 'quiz_master' ? '🏆' :
                       ach.id === 'streak_3' ? '⚡' :
                       ach.id === 'streak_7' ? '🔥' :
                       ach.id === 'flashcard_mastery' ? '🧠' : '🎓'}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: ach.unlocked ? '#fff' : 'rgba(240,240,255,0.5)' }}>
                        {ach.title}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'rgba(240,240,255,0.4)', marginTop: '2px', lineHeight: 1.3 }}>
                        {ach.description}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Study Timeline */}
            <div className="glass-card" style={{ padding: '24px', borderRadius: '20px' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '20px' }}>Recent Sessions</h3>
              {sessions.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {sessions.map((session) => (
                    <div key={session.id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '16px',
                      borderRadius: '12px',
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.05)'
                    }}>
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <div style={{ fontSize: '1.5rem' }}>{getActivityIcon(session.activity_type)}</div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '2px' }}>
                            {getActivityTypeLabel(session.activity_type)}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'rgba(240,240,255,0.4)' }}>
                            {formatDate(session.started_at)}
                          </div>
                        </div>
                      </div>
                      
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 'bold', color: '#ffd60a', fontSize: '0.95rem' }}>
                          +⚡ {session.xp_earned} XP
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'rgba(240,240,255,0.4)', marginTop: '2px' }}>
                          Duration: {Math.round(session.duration_seconds / 60)} min
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: 'rgba(240,240,255,0.3)', fontSize: '0.9rem', textAlign: 'center', padding: '40px' }}>
                  No recent study sessions recorded.
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
