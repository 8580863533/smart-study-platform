import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../hooks/useToast';

const navLinks = [
  { to: '/dashboard', label: 'Dashboard', icon: '🏠' },
  { to: '/upload', label: 'Upload', icon: '📤' },
  { to: '/qa', label: 'Q&A', icon: '💬' },
  { to: '/flashcards', label: 'Flashcards', icon: '🃏' },
  { to: '/quiz', label: 'Quiz', icon: '🎯' },
  { to: '/progress', label: 'Progress', icon: '📊' },
];

export default function Navbar() {
  const { user, logout, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out', 'See you next time!');
    navigate('/');
  };

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  const getInitials = (name) => name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';

  return (
    <nav style={styles.nav}>
      <div style={styles.navInner}>
        {/* Logo */}
        <Link to={isAuthenticated ? '/dashboard' : '/'} style={styles.logo}>
          <div style={styles.logoIcon}>
            <span style={{ fontSize: '1.25rem' }}>🧠</span>
          </div>
          <span style={styles.logoText}>AI Study Tutor</span>
        </Link>

        {/* Desktop Nav Links */}
        {isAuthenticated && (
          <div style={styles.navLinks}>
            {navLinks.map(link => (
              <Link
                key={link.to}
                to={link.to}
                style={{
                  ...styles.navLink,
                  ...(isActive(link.to) ? styles.navLinkActive : {}),
                }}
              >
                <span style={{ fontSize: '0.9rem' }}>{link.icon}</span>
                {link.label}
                {isActive(link.to) && <div style={styles.activeIndicator} />}
              </Link>
            ))}
          </div>
        )}

        {/* Right Side */}
        <div style={styles.rightSide}>
          {isAuthenticated && user ? (
            <>
              {/* XP Display */}
              <div style={styles.xpBadge}>
                <span style={{ fontSize: '0.9rem' }}>⚡</span>
                <span style={styles.xpText}>{(user.xp_points || 0).toLocaleString()} XP</span>
              </div>

              {/* Avatar Dropdown */}
              <div style={styles.avatarWrapper} ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(o => !o)}
                  style={styles.avatarBtn}
                  aria-label="User menu"
                >
                  <div style={styles.avatar}>{getInitials(user.name)}</div>
                  <span style={styles.chevron}>{dropdownOpen ? '▲' : '▼'}</span>
                </button>

                {dropdownOpen && (
                  <div style={styles.dropdown}>
                    <div style={styles.dropdownHeader}>
                      <div style={{ ...styles.avatar, width: 40, height: 40, fontSize: '1rem' }}>
                        {getInitials(user.name)}
                      </div>
                      <div>
                        <div style={styles.dropdownName}>{user.name}</div>
                        <div style={styles.dropdownEmail}>{user.email}</div>
                      </div>
                    </div>
                    <div style={styles.dropdownDivider} />
                    <button style={styles.dropdownItem} onClick={() => { navigate('/progress'); setDropdownOpen(false); }}>
                      <span>📊</span> Profile & Stats
                    </button>
                    <button style={styles.dropdownItem} onClick={() => { navigate('/login-history'); setDropdownOpen(false); }}>
                      <span>🔐</span> Login History
                    </button>
                    <div style={styles.dropdownDivider} />
                    <button style={{ ...styles.dropdownItem, ...styles.dropdownLogout }} onClick={handleLogout}>
                      <span>🚪</span> Sign Out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <Link to="/login" className="btn btn-secondary btn-sm">Login</Link>
              <Link to="/register" className="btn btn-primary btn-sm">Get Started</Link>
            </div>
          )}

          {/* Mobile Toggle */}
          {isAuthenticated && (
            <button
              style={styles.mobileToggle}
              onClick={() => setMobileOpen(o => !o)}
              aria-label="Toggle menu"
            >
              <div style={{ ...styles.hamburgerLine, transform: mobileOpen ? 'rotate(45deg) translate(5px,5px)' : 'none' }} />
              <div style={{ ...styles.hamburgerLine, opacity: mobileOpen ? 0 : 1 }} />
              <div style={{ ...styles.hamburgerLine, transform: mobileOpen ? 'rotate(-45deg) translate(5px,-5px)' : 'none' }} />
            </button>
          )}
        </div>
      </div>

      {/* Mobile Menu */}
      {isAuthenticated && mobileOpen && (
        <div style={styles.mobileMenu}>
          {navLinks.map(link => (
            <Link
              key={link.to}
              to={link.to}
              style={{
                ...styles.mobileLink,
                ...(isActive(link.to) ? styles.mobileLinkActive : {}),
              }}
            >
              <span>{link.icon}</span> {link.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}

const styles = {
  nav: {
    position: 'sticky',
    top: 0,
    zIndex: 200,
    background: 'rgba(5, 5, 16, 0.85)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  navInner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    maxWidth: 1280,
    margin: '0 auto',
    padding: '0 24px',
    height: 64,
    gap: 16,
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    textDecoration: 'none',
    flexShrink: 0,
  },
  logoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: 'linear-gradient(135deg, #6c63ff 0%, #3ecfcf 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 16px rgba(108,99,255,0.4)',
  },
  logoText: {
    fontSize: '1rem',
    fontWeight: 800,
    background: 'linear-gradient(135deg, #6c63ff 0%, #3ecfcf 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  },
  navLinks: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    justifyContent: 'center',
  },
  navLink: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 14px',
    borderRadius: 10,
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'rgba(240,240,255,0.55)',
    textDecoration: 'none',
    transition: 'all 0.2s ease',
    position: 'relative',
    whiteSpace: 'nowrap',
  },
  navLinkActive: {
    color: '#f0f0ff',
    background: 'rgba(108,99,255,0.12)',
    fontWeight: 600,
  },
  activeIndicator: {
    position: 'absolute',
    bottom: -1,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 20,
    height: 2,
    borderRadius: 2,
    background: 'linear-gradient(135deg, #6c63ff, #3ecfcf)',
  },
  rightSide: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexShrink: 0,
  },
  xpBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    background: 'rgba(255,215,0,0.1)',
    border: '1px solid rgba(255,215,0,0.2)',
    borderRadius: 9999,
    padding: '4px 12px',
  },
  xpText: {
    fontSize: '0.8rem',
    fontWeight: 700,
    color: '#ffd700',
  },
  avatarWrapper: { position: 'relative' },
  avatarBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    padding: '4px 10px 4px 4px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: 'linear-gradient(135deg, #6c63ff, #3ecfcf)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.8rem',
    fontWeight: 700,
    color: '#fff',
    flexShrink: 0,
  },
  chevron: { fontSize: '0.6rem', color: 'rgba(240,240,255,0.4)' },
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    right: 0,
    background: 'rgba(10,10,30,0.97)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 14,
    padding: 8,
    minWidth: 220,
    boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
    animation: 'scaleIn 0.2s cubic-bezier(0.34,1.56,0.64,1)',
    zIndex: 300,
  },
  dropdownHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '8px 8px 12px',
  },
  dropdownName: {
    fontSize: '0.875rem',
    fontWeight: 700,
    color: '#f0f0ff',
  },
  dropdownEmail: {
    fontSize: '0.75rem',
    color: 'rgba(240,240,255,0.45)',
  },
  dropdownDivider: {
    height: 1,
    background: 'rgba(255,255,255,0.06)',
    margin: '4px 0',
  },
  dropdownItem: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    borderRadius: 8,
    background: 'transparent',
    border: 'none',
    color: 'rgba(240,240,255,0.7)',
    fontSize: '0.875rem',
    cursor: 'pointer',
    transition: 'all 0.15s',
    textAlign: 'left',
  },
  dropdownLogout: {
    color: '#ff6b6b',
  },
  mobileToggle: {
    display: 'none',
    flexDirection: 'column',
    gap: 4,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 6,
  },
  hamburgerLine: {
    width: 22,
    height: 2,
    background: 'rgba(240,240,255,0.7)',
    borderRadius: 2,
    transition: 'all 0.3s',
  },
  mobileMenu: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '12px 16px 16px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    animation: 'fadeInDown 0.3s ease',
  },
  mobileLink: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 16px',
    borderRadius: 10,
    color: 'rgba(240,240,255,0.6)',
    textDecoration: 'none',
    fontSize: '0.9rem',
    fontWeight: 500,
    transition: 'all 0.2s',
  },
  mobileLinkActive: {
    background: 'rgba(108,99,255,0.15)',
    color: '#f0f0ff',
  },
};
