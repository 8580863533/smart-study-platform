import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { useStudy } from '../context/StudyContext';
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
  CartesianGrid
} from 'recharts';

export default function Dashboard() {
  const { user } = useAuth();
  const { documents, loadDocuments } = useStudy();
  const { addToast } = useToast();
  
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [achievements, setAchievements] = useState([]);

  useEffect(() => {
    fetchDashboardData();
    loadDocuments();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const res = await axios.get('/api/progress/dashboard');
      if (res.data.success) {
        setStats(res.data.data);
      }
      
      const achRes = await axios.get('/api/progress/achievements');
      if (achRes.data.success) {
        const achData = achRes.data.data;
        setAchievements(Array.isArray(achData) ? achData : (achData?.achievements || []));
      }
    } catch (err) {
      console.error(err);
      addToast("Failed to load dashboard data.", "error");
    } finally {
      setLoading(false);
    }
  };

  const getGreeting = () => {
    const hrs = new Date().getHours();
    if (hrs < 12) return 'Good morning';
    if (hrs < 18) return 'Good afternoon';
    return 'Good evening';
  };

  if (loading || !stats) {
    return (
      <div style={{ minHeight: '100vh', background: '#050510', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', border: '3px solid rgba(108,99,255,0.2)', borderTopColor: '#6c63ff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <p style={{ color: 'rgba(240,240,255,0.6)' }}>Loading dashboard...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Format study time
  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}h ${remMins}m`;
  };

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at top, #0d0d2b 0%, #050510 100%)', display: 'flex', flexDirection: 'column' }}>
      <Navbar />
      <div style={{ display: 'flex', flex: 1, position: 'relative' }}>
        <Sidebar />
        
        <main style={{ flex: 1, padding: '40px', maxWidth: '1400px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
          {/* Greeting */}
          <div style={{ marginBottom: '32px' }}>
            <h1 style={{ fontSize: '2.25rem', fontWeight: 800, marginBottom: '8px' }}>
              {getGreeting()}, {user?.name}! 👋
            </h1>
            <p style={{ color: 'rgba(240,240,255,0.6)' }}>
              Let's make today a great day for learning. Your streak is <span style={{ color: '#ff6b9d', fontWeight: 'bold' }}>🔥 {stats.user.streak_days} days</span>.
            </p>
          </div>

          {/* Metrics Row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '20px',
            marginBottom: '32px'
          }}>
            <div className="glass-card" style={{ padding: '24px', borderRadius: '16px' }}>
              <div style={{ fontSize: '0.85rem', color: 'rgba(240,240,255,0.5)', marginBottom: '8px', fontWeight: 500 }}>STUDY TIME</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#3ecfcf' }}>{formatTime(stats.user.total_study_time)}</div>
              <div style={{ fontSize: '0.8rem', color: 'rgba(240,240,255,0.4)', marginTop: '4px' }}>All-time total</div>
            </div>
            
            <div className="glass-card" style={{ padding: '24px', borderRadius: '16px' }}>
              <div style={{ fontSize: '0.85rem', color: 'rgba(240,240,255,0.5)', marginBottom: '8px', fontWeight: 500 }}>LEVEL & XP</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#6c63ff' }}>Level {stats.user.level}</div>
              <div style={{ fontSize: '0.8rem', color: 'rgba(240,240,255,0.4)', marginTop: '4px' }}>{stats.user.xp} Total XP</div>
            </div>

            <div className="glass-card" style={{ padding: '24px', borderRadius: '16px' }}>
              <div style={{ fontSize: '0.85rem', color: 'rgba(240,240,255,0.5)', marginBottom: '8px', fontWeight: 500 }}>FLASHCARDS DUE</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: stats.flashcards.due_today > 0 ? '#ff6b9d' : '#00d4aa' }}>
                {stats.flashcards.due_today}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'rgba(240,240,255,0.4)', marginTop: '4px' }}>{stats.flashcards.total} total cards</div>
            </div>

            <div className="glass-card" style={{ padding: '24px', borderRadius: '16px' }}>
              <div style={{ fontSize: '0.85rem', color: 'rgba(240,240,255,0.5)', marginBottom: '8px', fontWeight: 500 }}>QUIZ AVERAGE</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ffd60a' }}>
                {stats.quiz.total_taken > 0 ? `${stats.quiz.avg_score}%` : 'N/A'}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'rgba(240,240,255,0.4)', marginTop: '4px' }}>{stats.quiz.total_taken} quiz(zes) taken</div>
            </div>
          </div>

          {/* Charts Section */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))',
            gap: '24px',
            marginBottom: '32px'
          }}>
            {/* Weekly Activity */}
            <div className="glass-card" style={{ padding: '24px', borderRadius: '20px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '20px' }}>Weekly Activity (XP Earned)</h3>
              <div style={{ width: '100%', height: '260px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.weekly_activity}>
                    <XAxis dataKey="date" stroke="rgba(240,240,255,0.3)" fontSize={11} tickLine={false} />
                    <YAxis stroke="rgba(240,240,255,0.3)" fontSize={11} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: '#0d0d2b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}
                      labelStyle={{ color: 'rgba(240,240,255,0.6)' }}
                    />
                    <Bar dataKey="xp" fill="url(#colorXP)" radius={[4, 4, 0, 0]} />
                    <defs>
                      <linearGradient id="colorXP" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6c63ff" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#3ecfcf" stopOpacity={0.2}/>
                      </linearGradient>
                    </defs>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Quiz Performance */}
            <div className="glass-card" style={{ padding: '24px', borderRadius: '20px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '20px' }}>Quiz Score Trend (%)</h3>
              <div style={{ width: '100%', height: '260px' }}>
                {stats.score_history.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stats.score_history}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="date" stroke="rgba(240,240,255,0.3)" fontSize={11} tickLine={false} />
                      <YAxis stroke="rgba(240,240,255,0.3)" fontSize={11} tickLine={false} domain={[0, 100]} />
                      <Tooltip
                        contentStyle={{ background: '#0d0d2b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}
                      />
                      <Line type="monotone" dataKey="percentage" stroke="#ff6b9d" strokeWidth={3} dot={{ r: 4, stroke: '#ff6b9d', strokeWidth: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(240,240,255,0.3)', fontSize: '0.9rem' }}>
                    Take your first quiz to see scores plotted here.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '24px', flexWrap: 'wrap' }}>
            {/* Recent Documents */}
            <div className="glass-card" style={{ padding: '24px', borderRadius: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Your Study Materials</h3>
                <Link to="/upload" className="btn btn-primary btn-sm" style={{ textDecoration: 'none' }}>+ Upload</Link>
              </div>

              {documents.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {documents.slice(0, 5).map((doc) => (
                    <div key={doc.id} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '16px',
                      borderRadius: '12px',
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.05)'
                    }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '4px' }}>{doc.title}</div>
                        <div style={{ fontSize: '0.8rem', color: 'rgba(240,240,255,0.4)' }}>
                          {doc.file_type.toUpperCase()} · {doc.word_count} words
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Link to={`/qa/${doc.id}`} className="btn btn-secondary btn-sm" style={{ padding: '6px 10px' }} title="Q&A">💬</Link>
                        <Link to={`/summarize/${doc.id}`} className="btn btn-secondary btn-sm" style={{ padding: '6px 10px' }} title="Summarize">📝</Link>
                        <Link to={`/flashcards/${doc.id}`} className="btn btn-secondary btn-sm" style={{ padding: '6px 10px' }} title="Flashcards">🃏</Link>
                        <Link to={`/quiz/${doc.id}`} className="btn btn-secondary btn-sm" style={{ padding: '6px 10px' }} title="Take Quiz">🎯</Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(240,240,255,0.4)' }}>
                  <p style={{ marginBottom: '16px' }}>No study notes uploaded yet.</p>
                  <Link to="/upload" className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}>Upload Notes Now</Link>
                </div>
              )}
            </div>

            {/* Achievements & Badges */}
            <div className="glass-card" style={{ padding: '24px', borderRadius: '20px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '20px' }}>Recent Badges</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                {achievements.map((ach) => (
                  <div key={ach.id} style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '12px',
                    borderRadius: '12px',
                    background: ach.unlocked ? 'rgba(108,99,255,0.06)' : 'rgba(255,255,255,0.01)',
                    border: '1px solid',
                    borderColor: ach.unlocked ? 'rgba(108,99,255,0.2)' : 'rgba(255,255,255,0.03)',
                    opacity: ach.unlocked ? 1 : 0.45,
                    textAlign: 'center',
                    transition: 'all 0.3s'
                  }}>
                    <div style={{ fontSize: '2rem', marginBottom: '8px' }}>
                      {ach.id === 'welcome' ? '🎒' : 
                       ach.id === 'first_upload' ? '📚' :
                       ach.id === 'quiz_master' ? '🏆' :
                       ach.id === 'streak_3' ? '⚡' :
                       ach.id === 'streak_7' ? '🔥' :
                       ach.id === 'flashcard_mastery' ? '🧠' : '🎓'}
                    </div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: ach.unlocked ? '#f0f0ff' : 'rgba(240,240,255,0.4)', marginBottom: '4px' }}>
                      {ach.title}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'rgba(240,240,255,0.4)', lineHeight: 1.2 }}>
                      {ach.unlocked ? 'Unlocked' : 'Locked'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
