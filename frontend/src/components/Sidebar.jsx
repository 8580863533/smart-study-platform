import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useStudy } from '../context/StudyContext';

const LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5500, 7500];

function getLevel(xp) {
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]) level = i + 1;
    else break;
  }
  return level;
}

function getLevelProgress(xp) {
  const level = getLevel(xp);
  const currentThreshold = LEVEL_THRESHOLDS[level - 1] || 0;
  const nextThreshold = LEVEL_THRESHOLDS[level] || LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  const progress = ((xp - currentThreshold) / (nextThreshold - currentThreshold)) * 100;
  return Math.min(Math.max(progress, 0), 100);
}

const LEVEL_TITLES = ['Novice', 'Learner', 'Student', 'Scholar', 'Expert', 'Master', 'Sage', 'Genius', 'Legend', 'Grandmaster', 'Omniscient'];

export default function Sidebar({ collapsed = false }) {
  const { user } = useAuth();
  const { documents, loadingDocs } = useStudy();
  const navigate = useNavigate();

  if (!user) return null;

  const xp = user.xp_points || 0;
  const level = getLevel(xp);
  const levelProgress = getLevelProgress(xp);
  const levelTitle = LEVEL_TITLES[level - 1] || 'Learner';
  const streak = user.study_streak || 0;
  const recentDocs = documents.slice(0, 5);

  const getInitials = (name) => name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';

  return (
    <aside style={{ ...styles.sidebar, ...(collapsed ? styles.sidebarCollapsed : {}) }}>
      {/* User Profile */}
      <div style={styles.profile}>
        <div style={styles.avatarLarge}>{getInitials(user.name)}</div>
        {!collapsed && (
          <div style={styles.profileInfo}>
            <div style={styles.profileName}>{user.name}</div>
            <div style={styles.levelBadge}>
              <span style={styles.levelDot} />
              Lvl {level} · {levelTitle}
            </div>
          </div>
        )}
      </div>

      {/* XP Bar */}
      {!collapsed && (
        <div style={styles.xpSection}>
          <div style={styles.xpHeader}>
            <span style={styles.xpLabel}>⚡ {xp.toLocaleString()} XP</span>
            <span style={styles.xpLabel}>{levelProgress.toFixed(0)}%</span>
          </div>
          <div className="progress-container">
            <div
              className="progress-bar"
              style={{ width: `${levelProgress}%`, transition: 'width 1s ease' }}
            />
          </div>
          <div style={styles.xpSub}>Level {level} → {level + 1}</div>
        </div>
      )}

      {/* Study Streak */}
      <div style={styles.streakCard}>
        <span style={styles.streakFire}>🔥</span>
        {!collapsed && (
          <div>
            <div style={styles.streakNumber}>{streak} day{streak !== 1 ? 's' : ''}</div>
            <div style={styles.streakLabel}>Study Streak</div>
          </div>
        )}
      </div>

      {/* Quick Nav */}
      {!collapsed && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Quick Links</div>
          {[
            { icon: '📤', label: 'Upload Document', path: '/upload' },
            { icon: '💬', label: 'Ask Questions', path: '/qa' },
            { icon: '📝', label: 'Summarize', path: '/summarize' },
            { icon: '🃏', label: 'Flashcards', path: '/flashcards' },
            { icon: '🎯', label: 'Take Quiz', path: '/quiz' },
          ].map(item => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              style={styles.quickLink}
            >
              <span>{item.icon}</span>
              <span style={styles.quickLinkLabel}>{item.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Recent Documents */}
      {!collapsed && recentDocs.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Recent Documents</div>
          {loadingDocs ? (
            <div style={{ padding: '8px 0' }}>
              {[1, 2, 3].map(i => (
                <div key={i} className="skeleton" style={{ height: 32, marginBottom: 6, borderRadius: 8 }} />
              ))}
            </div>
          ) : (
            recentDocs.map(doc => (
              <div
                key={doc.id || doc._id}
                style={styles.docItem}
                onClick={() => navigate(`/qa/${doc.id || doc._id}`)}
              >
                <span style={styles.docIcon}>📄</span>
                <span style={styles.docTitle}>{doc.title || 'Untitled'}</span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Mini Stats */}
      {!collapsed && (
        <div style={styles.miniStats}>
          <div style={styles.miniStat}>
            <div style={styles.miniStatVal}>{user.total_flashcards || 0}</div>
            <div style={styles.miniStatLabel}>Flashcards</div>
          </div>
          <div style={styles.miniStatDivider} />
          <div style={styles.miniStat}>
            <div style={styles.miniStatVal}>{user.quizzes_taken || 0}</div>
            <div style={styles.miniStatLabel}>Quizzes</div>
          </div>
          <div style={styles.miniStatDivider} />
          <div style={styles.miniStat}>
            <div style={styles.miniStatVal}>{documents.length}</div>
            <div style={styles.miniStatLabel}>Docs</div>
          </div>
        </div>
      )}
    </aside>
  );
}

const styles = {
  sidebar: {
    width: 240,
    minHeight: 'calc(100vh - 64px)',
    background: 'rgba(255,255,255,0.02)',
    backdropFilter: 'blur(10px)',
    borderRight: '1px solid rgba(255,255,255,0.06)',
    padding: '20px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    flexShrink: 0,
    overflowY: 'auto',
    transition: 'width 0.3s ease',
  },
  sidebarCollapsed: { width: 72, padding: '20px 8px' },
  profile: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '8px 4px',
  },
  avatarLarge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    background: 'linear-gradient(135deg, #6c63ff, #3ecfcf)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1rem',
    fontWeight: 800,
    color: '#fff',
    flexShrink: 0,
    boxShadow: '0 0 16px rgba(108,99,255,0.3)',
  },
  profileInfo: { flex: 1, minWidth: 0 },
  profileName: {
    fontSize: '0.9rem',
    fontWeight: 700,
    color: '#f0f0ff',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  levelBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: '0.75rem',
    color: 'rgba(240,240,255,0.5)',
    marginTop: 2,
  },
  levelDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#00d4aa',
    display: 'inline-block',
  },
  xpSection: { padding: '0 4px' },
  xpHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: 6 },
  xpLabel: { fontSize: '0.75rem', fontWeight: 600, color: '#ffd700' },
  xpSub: { fontSize: '0.7rem', color: 'rgba(240,240,255,0.3)', marginTop: 4 },
  streakCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: 'rgba(255,107,28,0.1)',
    border: '1px solid rgba(255,107,28,0.2)',
    borderRadius: 10,
    padding: '10px 12px',
  },
  streakFire: { fontSize: '1.25rem' },
  streakNumber: { fontSize: '1rem', fontWeight: 800, color: '#ff7c1c' },
  streakLabel: { fontSize: '0.7rem', color: 'rgba(240,240,255,0.45)' },
  section: { display: 'flex', flexDirection: 'column', gap: 2 },
  sectionTitle: {
    fontSize: '0.7rem',
    fontWeight: 700,
    color: 'rgba(240,240,255,0.3)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    padding: '0 6px',
    marginBottom: 4,
  },
  quickLink: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 10px',
    borderRadius: 8,
    background: 'transparent',
    border: 'none',
    color: 'rgba(240,240,255,0.6)',
    fontSize: '0.8rem',
    cursor: 'pointer',
    transition: 'all 0.2s',
    textAlign: 'left',
    width: '100%',
  },
  quickLinkLabel: { fontWeight: 500 },
  docItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  docIcon: { fontSize: '0.9rem', flexShrink: 0 },
  docTitle: {
    fontSize: '0.8rem',
    color: 'rgba(240,240,255,0.6)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  miniStats: {
    display: 'flex',
    alignItems: 'center',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 10,
    padding: '10px',
    marginTop: 'auto',
  },
  miniStat: { flex: 1, textAlign: 'center' },
  miniStatVal: { fontSize: '1rem', fontWeight: 800, color: '#f0f0ff' },
  miniStatLabel: { fontSize: '0.65rem', color: 'rgba(240,240,255,0.4)', marginTop: 2 },
  miniStatDivider: { width: 1, height: 28, background: 'rgba(255,255,255,0.07)' },
};
