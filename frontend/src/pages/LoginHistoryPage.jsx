import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import { useToast } from '../hooks/useToast';
import axios from 'axios';

export default function LoginHistoryPage() {
  const { addToast } = useToast();
  
  const [stats, setStats] = useState(null);
  const [historyItems, setHistoryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filter, setFilter] = useState('all'); // 'all' | 'success' | 'failed'

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [page, filter]);

  const fetchStats = async () => {
    try {
      const res = await axios.get('/api/auth/stats');
      if (res.data.success) {
        setStats(res.data.data);
      }
    } catch (err) {
      console.error(err);
      addToast("Failed to load security statistics.", "error");
    }
  };

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/auth/login-history?page=${page}&per_page=10`);
      if (res.data.success) {
        let items = res.data.data.items;
        
        // Client-side filtering if API returns all
        if (filter === 'success') {
          items = items.filter(i => i.is_successful);
        } else if (filter === 'failed') {
          items = items.filter(i => !i.is_successful);
        }
        
        setHistoryItems(items);
        setTotalPages(res.data.data.pages || 1);
      }
    } catch (err) {
      console.error(err);
      addToast("Failed to load login history records.", "error");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (isoStr) => {
    if (!isoStr) return 'N/A';
    return new Date(isoStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getDeviceIcon = (deviceType) => {
    const d = deviceType?.toLowerCase();
    if (d === 'mobile') return '📱';
    if (d === 'tablet') return '📠';
    return '💻';
  };

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at top, #0d0d2b 0%, #050510 100%)', display: 'flex', flexDirection: 'column' }}>
      <Navbar />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />
        
        <main style={{ flex: 1, padding: '40px', maxWidth: '1200px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
          
          <div style={{ marginBottom: '32px' }}>
            <h1 style={{ fontSize: '2.25rem', fontWeight: 800, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              🛡️ Security & Login Audit Log
            </h1>
            <p style={{ color: 'rgba(240,240,255,0.5)' }}>
              Monitor active sessions and review details of all login attempts made to your student account.
            </p>
          </div>

          {/* Stats Summary Panel */}
          {stats && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '20px',
              marginBottom: '32px'
            }}>
              <div className="glass-card" style={{ padding: '20px 24px', borderRadius: '16px' }}>
                <div style={{ fontSize: '0.8rem', color: 'rgba(240,240,255,0.5)', marginBottom: '6px', fontWeight: 600 }}>TOTAL LOGIN ATTEMPTS</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#6c63ff' }}>{stats.total_logins}</div>
              </div>
              <div className="glass-card" style={{ padding: '20px 24px', borderRadius: '16px' }}>
                <div style={{ fontSize: '0.8rem', color: 'rgba(240,240,255,0.5)', marginBottom: '6px', fontWeight: 600 }}>SUCCESS RATE</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#00d4aa' }}>
                  {stats.total_logins > 0 ? `${Math.round((stats.successful_logins / stats.total_logins) * 100)}%` : '100%'}
                </div>
              </div>
              <div className="glass-card" style={{ padding: '20px 24px', borderRadius: '16px' }}>
                <div style={{ fontSize: '0.8rem', color: 'rgba(240,240,255,0.5)', marginBottom: '6px', fontWeight: 600 }}>UNIQUE IP ADDRESSES</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#3ecfcf' }}>{stats.unique_ips}</div>
              </div>
              <div className="glass-card" style={{ padding: '20px 24px', borderRadius: '16px' }}>
                <div style={{ fontSize: '0.8rem', color: 'rgba(240,240,255,0.5)', marginBottom: '6px', fontWeight: 600 }}>PRIMARY DEVICE</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#ffd60a' }}>
                  {stats.most_used_device ? stats.most_used_device.toUpperCase() : 'DESKTOP'}
                </div>
              </div>
            </div>
          )}

          {/* History List Section */}
          <div className="glass-card" style={{ padding: '32px', borderRadius: '24px' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '24px',
              flexWrap: 'wrap',
              gap: '16px'
            }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Login History</h3>
              
              {/* Filter controls */}
              <div style={{ display: 'flex', gap: '8px', background: 'rgba(255,255,255,0.02)', padding: '3px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                {['all', 'success', 'failed'].map((f) => (
                  <button
                    key={f}
                    onClick={() => { setFilter(f); setPage(1); }}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      border: 'none',
                      background: filter === f ? 'rgba(255,255,255,0.08)' : 'transparent',
                      color: filter === f ? '#fff' : 'rgba(240,240,255,0.5)',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textTransform: 'capitalize'
                    }}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* List Table */}
            {loading ? (
              <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '32px', height: '32px', border: '2px solid rgba(108,99,255,0.2)', borderTopColor: '#6c63ff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              </div>
            ) : historyItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(240,240,255,0.4)', fontSize: '0.95rem' }}>
                No login history records found matching this filter.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '700px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <th style={{ padding: '12px 16px', color: 'rgba(240,240,255,0.4)', fontSize: '0.8rem', fontWeight: 600 }}>DATE & TIME</th>
                      <th style={{ padding: '12px 16px', color: 'rgba(240,240,255,0.4)', fontSize: '0.8rem', fontWeight: 600 }}>IP ADDRESS</th>
                      <th style={{ padding: '12px 16px', color: 'rgba(240,240,255,0.4)', fontSize: '0.8rem', fontWeight: 600 }}>LOCATION</th>
                      <th style={{ padding: '12px 16px', color: 'rgba(240,240,255,0.4)', fontSize: '0.8rem', fontWeight: 600 }}>DEVICE / BROWSER</th>
                      <th style={{ padding: '12px 16px', color: 'rgba(240,240,255,0.4)', fontSize: '0.8rem', fontWeight: 600 }}>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyItems.map((item) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', fontSize: '0.9rem' }}>
                        <td style={{ padding: '16px', fontWeight: 500 }}>{formatDate(item.logged_in_at)}</td>
                        <td style={{ padding: '16px', color: 'rgba(240,240,255,0.7)', fontFamily: 'monospace' }}>{item.ip_address || '127.0.0.1'}</td>
                        <td style={{ padding: '16px', color: 'rgba(240,240,255,0.7)' }}>
                          {item.city && item.country ? `${item.city}, ${item.country}` : 'Local Network / Dev'}
                        </td>
                        <td style={{ padding: '16px' }}>
                          <span style={{ marginRight: '8px' }}>{getDeviceIcon(item.device_type)}</span>
                          <span style={{ fontWeight: 500 }}>{item.browser || 'Unknown Browser'}</span>
                          <span style={{ fontSize: '0.75rem', color: 'rgba(240,240,255,0.4)', block: 'block', marginLeft: '4px' }}>
                            ({item.os_name || 'Unknown OS'})
                          </span>
                        </td>
                        <td style={{ padding: '16px' }}>
                          <span style={{
                            background: item.is_successful ? 'rgba(0, 212, 170, 0.15)' : 'rgba(255, 77, 109, 0.15)',
                            color: item.is_successful ? '#00d4aa' : '#ff4d6d',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontWeight: 700,
                            fontSize: '0.75rem'
                          }}>
                            {item.is_successful ? 'Success' : `Failed: ${item.failure_reason || 'Unknown'}`}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '24px' }}>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn btn-secondary btn-sm"
                >
                  ◀ Prev
                </button>
                <span style={{ display: 'flex', alignItems: 'center', fontSize: '0.85rem', color: 'rgba(240,240,255,0.5)' }}>
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="btn btn-secondary btn-sm"
                >
                  Next ▶
                </button>
              </div>
            )}

          </div>

        </main>
      </div>
      
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
