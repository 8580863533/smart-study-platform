import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import { useStudy } from '../context/StudyContext';
import { useToast } from '../hooks/useToast';
import axios from 'axios';

export default function SummarizePage() {
  const { docId } = useParams();
  const { documents, activeDocument, setActiveDocument, loadDocuments } = useStudy();
  const { addToast } = useToast();

  const [selectedDocId, setSelectedDocId] = useState('');
  const [loading, setLoading] = useState(false);
  const [summaryData, setSummaryData] = useState(null);

  useEffect(() => { loadDocuments(); }, []);

  useEffect(() => {
    if (docId) {
      setSelectedDocId(docId);
      loadSummary(docId);
    } else if (activeDocument) {
      setSelectedDocId(activeDocument.id);
      loadSummary(activeDocument.id);
    } else if (documents.length > 0) {
      setSelectedDocId(documents[0].id);
      setActiveDocument(documents[0]);
      loadSummary(documents[0].id);
    }
  }, [docId, activeDocument, documents]);

  const loadSummary = async (id, forceRegen = false) => {
    if (!id) return;
    setLoading(true);
    setSummaryData(null);
    try {
      const res = await axios.post(`/api/summarize/${id}`, { force: forceRegen });
      if (res.data.success) {
        setSummaryData(res.data.data);
        if (res.data.data.xp_earned) {
          addToast(`Document summarized! +${res.data.data.xp_earned} XP`, "success");
        }
      } else {
        addToast(res.data.message || "Failed to generate summary.", "error");
      }
    } catch (err) {
      console.error(err);
      addToast("Failed to fetch summary from server.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDocChange = (e) => {
    const id = e.target.value;
    setSelectedDocId(id);
    const doc = documents.find(d => d.id === id);
    if (doc) {
      setActiveDocument(doc);
    }
    setSummaryData(null);
    loadSummary(id);
  };

  const handleCopy = () => {
    if (!summaryData || !summaryData.summary_bullets) return;
    const bulletText = summaryData.summary_bullets.map(b => `• ${b}`).join('\n');
    navigator.clipboard.writeText(bulletText);
    addToast("Summary copied to clipboard!", "success");
  };

  const selectedDoc = documents.find(d => d.id === selectedDocId);

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at top, #0d0d2b 0%, #050510 100%)', display: 'flex', flexDirection: 'column' }}>
      <Navbar />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />
        
        <main style={{ flex: 1, padding: '40px', maxWidth: '1000px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
          
          {/* Header Panel */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '32px',
            flexWrap: 'wrap',
            gap: '16px'
          }}>
            <div>
              <h1 style={{ fontSize: '2.25rem', fontWeight: 800, marginBottom: '8px' }}>AI Key Points Summary</h1>
              <p style={{ color: 'rgba(240,240,255,0.5)' }}>Get a concise breakdown of your study notes into core points.</p>
            </div>

            {/* Document Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '0.9rem', color: 'rgba(240,240,255,0.6)' }}>Notes:</span>
              <select
                value={selectedDocId}
                onChange={handleDocChange}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#fff',
                  padding: '10px 20px',
                  borderRadius: '12px',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                {documents.map(d => (
                  <option key={d.id} value={d.id} style={{ background: '#0d0d2b' }}>{d.title}</option>
                ))}
                {documents.length === 0 && (
                  <option value="" style={{ background: '#0d0d2b' }}>No documents uploaded</option>
                )}
              </select>
            </div>
          </div>

          {documents.length === 0 ? (
            <div className="glass-card" style={{ padding: '60px', textAlign: 'center', borderRadius: '24px' }}>
              <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📚</div>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>No notes in your library</h3>
              <p style={{ color: 'rgba(240,240,255,0.5)', marginBottom: '24px' }}>
                You need to upload notes first before you can summarize them.
              </p>
              <Link to="/upload" className="btn btn-primary" style={{ textDecoration: 'none' }}>
                Upload Notes
              </Link>
            </div>
          ) : loading ? (
            /* Loading State Skeleton */
            <div className="glass-card" style={{ padding: '40px', borderRadius: '24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ width: '40%', height: '24px', background: 'rgba(255,255,255,0.04)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
                <div style={{ width: '90%', height: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
                <div style={{ width: '85%', height: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
                <div style={{ width: '95%', height: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
                <div style={{ width: '80%', height: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
              </div>
            </div>
          ) : summaryData ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              {/* Stats Bar */}
              <div className="glass-card" style={{
                padding: '20px 32px',
                borderRadius: '16px',
                display: 'flex',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px'
              }}>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'rgba(240,240,255,0.5)', fontWeight: 500 }}>COMPRESSION</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#3ecfcf' }}>
                    {summaryData.compression_ratio ? `${Math.round(summaryData.compression_ratio * 100)}% shorter` : 'N/A'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'rgba(240,240,255,0.5)', fontWeight: 500 }}>ORIGINAL SIZE</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'rgba(240,240,255,0.8)' }}>
                    {summaryData.original_word_count} words
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'rgba(240,240,255,0.5)', fontWeight: 500 }}>SUMMARY SIZE</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'rgba(240,240,255,0.8)' }}>
                    {summaryData.word_count} words
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'rgba(240,240,255,0.5)', fontWeight: 500 }}>READ TIME</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#6c63ff' }}>
                    ~{Math.max(1, Math.round(summaryData.word_count / 200))} min
                  </div>
                </div>
              </div>

              {/* Summary bullets card */}
              <div className="glass-card" style={{ padding: '40px', borderRadius: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Key Takeaways</h3>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={handleCopy} className="btn btn-secondary btn-sm">📋 Copy to Clipboard</button>
                    <button onClick={() => loadSummary(selectedDocId, true)} className="btn btn-secondary btn-sm">🔄 Regenerate</button>
                  </div>
                </div>

                <ul style={{ listStyleType: 'none', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {summaryData.summary_bullets.map((bullet, idx) => (
                    <li
                      key={idx}
                      className="summary-bullet"
                      style={{
                        display: 'flex',
                        gap: '16px',
                        fontSize: '1.05rem',
                        lineHeight: 1.6,
                        opacity: 0,
                        animation: `fadeInUp 0.5s ease forwards`,
                        animationDelay: `${idx * 0.15}s`
                      }}
                    >
                      <span style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #6c63ff 0%, #3ecfcf 100%)',
                        marginTop: '10px',
                        flexShrink: 0
                      }} />
                      <span>{bullet}</span>
                    </li>
                  ))}
                  {summaryData.summary_bullets.length === 0 && (
                    <li style={{ color: 'rgba(240,240,255,0.4)', textAlign: 'center', padding: '20px' }}>
                      No summary points could be extracted.
                    </li>
                  )}
                </ul>
              </div>

            </div>
          ) : (
            <div className="glass-card" style={{ padding: '60px', textAlign: 'center', borderRadius: '24px' }}>
              <p style={{ color: 'rgba(240,240,255,0.5)', marginBottom: '16px' }}>Select notes to generate key takeaways.</p>
            </div>
          )}

        </main>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 0.3; }
        }
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(15px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .summary-bullet {
          transition: transform 0.2s;
        }
        .summary-bullet:hover {
          transform: translateX(4px);
        }
      `}</style>
    </div>
  );
}
