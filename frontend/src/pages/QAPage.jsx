import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import VoiceButton from '../components/VoiceButton';
import { useStudy } from '../context/StudyContext';
import { useToast } from '../hooks/useToast';
import { qaAPI } from '../api/client';
import { answerQuestionFromText, splitIntoSemanticChunks, buildVectorIndex, normalizeDocumentText } from '../utils/aiEngine';

export default function QAPage() {
  const { docId } = useParams();
  const { documents, activeDocument, setActiveDocument, loadDocuments, ensureDocumentContent } = useStudy();
  const { addToast } = useToast();
  
  const [selectedDocId, setSelectedDocId] = useState('');
  const [question, setQuestion] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => { loadDocuments(); }, []);

  useEffect(() => {
    if (docId) {
      setSelectedDocId(docId);
      loadHistory(docId);
      ensureDocumentContent(docId);
    } else if (activeDocument) {
      setSelectedDocId(activeDocument.id);
      loadHistory(activeDocument.id);
      ensureDocumentContent(activeDocument.id);
    } else if (documents.length > 0) {
      setSelectedDocId(documents[0].id);
      setActiveDocument(documents[0]);
      loadHistory(documents[0].id);
      ensureDocumentContent(documents[0].id);
    }
  }, [docId, activeDocument, documents]);


  useEffect(() => {
    scrollChat();
  }, [chatHistory, loading]);

  const scrollChat = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadHistory = async (id) => {
    if (!id) return;
    setLoadingHistory(true);
    try {
      const localHistory = localStorage.getItem(`qa_history_${id}`);
      if (localHistory) {
        setChatHistory(JSON.parse(localHistory));
      }
      const res = await qaAPI.history(id);
      if (res.data?.success && res.data?.data) {
        const history = res.data.data.map(q => [
          { sender: 'user', text: q.question, timestamp: q.created_at },
          { sender: 'ai', text: q.answer, confidence: q.confidence, source: q.source_passage, timestamp: q.created_at }
        ]).flat();
        if (history.length > 0) {
          setChatHistory(history);
          localStorage.setItem(`qa_history_${id}`, JSON.stringify(history));
        }
      }
    } catch (err) {
      console.warn("Q&A history sync notice:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleDocChange = (e) => {
    const id = e.target.value;
    setSelectedDocId(id);
    const doc = documents.find(d => d.id === id);
    if (doc) {
      setActiveDocument(doc);
      ensureDocumentContent(id);
    }
    setChatHistory([]);
    loadHistory(id);
  };

  const handleAsk = async (e) => {
    e.preventDefault();
    if (!question || !question.trim()) return;
    if (!selectedDocId) {
      addToast("Please select a document first.", "error");
      return;
    }

    const currentQuestion = question.trim();
    setQuestion('');
    setLoading(true);

    // Add user message immediately
    const userMsg = { sender: 'user', text: currentQuestion, timestamp: new Date().toISOString() };
    setChatHistory(prev => {
      const updated = [...prev, userMsg];
      localStorage.setItem(`qa_history_${selectedDocId}`, JSON.stringify(updated));
      return updated;
    });

    try {
      // ── Get document content (fetch if opened on another laptop) ────────
      let doc = documents.find(d => d.id === selectedDocId) || activeDocument;
      let docContent = doc?.content || '';

      if (!docContent || docContent.trim().length < 10) {
        docContent = await ensureDocumentContent(selectedDocId);
        // Re-fetch doc with updated content
        doc = documents.find(d => d.id === selectedDocId) || doc;
      }

      if (!docContent || docContent.trim().length < 10) {
        const anyWithContent = documents.find(d => d.content && d.content.trim().length > 20);
        if (anyWithContent) {
          docContent = anyWithContent.content;
          doc = anyWithContent;
        }
      }

      // ── FIX: Use cached vector_index from doc; rebuild if missing ────────
      // The backend re-fetch strips vector_index (it only lives in localStorage).
      // If vector_index is null, build it fresh from doc.content so answers use
      // the real document instead of the old fallback.
      let vectorIndex = doc?.vector_index || null;
      if ((!vectorIndex || !vectorIndex.chunks || vectorIndex.chunks.length === 0) && docContent && docContent.trim().length > 20) {
        const normalized = normalizeDocumentText(docContent);
        const chunks = splitIntoSemanticChunks(normalized, selectedDocId);
        vectorIndex = buildVectorIndex(chunks, selectedDocId);
      }

      const result = answerQuestionFromText(currentQuestion, docContent, vectorIndex);
      const aiMsg = {
        sender: 'ai',
        text: result.answer,
        confidence: result.confidence,
        source: result.source_passage,
        page_number: result.page_number,
        section_name: result.section_name,
        relevance_score: result.relevance_score,
        timestamp: new Date().toISOString()
      };
      setChatHistory(prev => {
        const updated = [...prev, aiMsg];
        localStorage.setItem(`qa_history_${selectedDocId}`, JSON.stringify(updated));
        return updated;
      });

      if (result.confidence > 0) {
        addToast('Answered from notes! +5 XP', 'success');
      }

      // Sync to backend in background
      qaAPI.ask(selectedDocId, currentQuestion).catch(() => {});
    } catch (err) {
      console.error('Q&A processing error:', err);
      const errMsg = { sender: 'ai', text: 'An error occurred while processing your question. Please try again.', confidence: 0, timestamp: new Date().toISOString() };
      setChatHistory(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };


  const handleVoiceTranscript = (text) => {
    setQuestion(text);
  };

  const selectedDoc = documents.find(d => d.id === selectedDocId);

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at top, #0d0d2b 0%, #050510 100%)', display: 'flex', flexDirection: 'column' }}>
      <Navbar />
      <div style={{ display: 'flex', flex: 1, height: 'calc(100vh - 72px)', overflow: 'hidden' }}>
        <Sidebar />
        
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', boxSizing: 'border-box', height: '100%' }}>
          
          {/* Top Panel */}
          <div style={{
            padding: '20px 40px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
            background: 'rgba(5, 5, 16, 0.4)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '16px'
          }}>
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '4px' }}>Smart Q&A</h1>
              <p style={{ color: 'rgba(240,240,255,0.5)', fontSize: '0.85rem' }}>Ask your AI tutor questions directly about your study notes.</p>
            </div>
            
            {/* Document Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '0.9rem', color: 'rgba(240,240,255,0.6)' }}>Active Notes:</span>
              <select
                value={selectedDocId}
                onChange={handleDocChange}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#fff',
                  padding: '8px 16px',
                  borderRadius: '10px',
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

          {/* Chat area */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '40px',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px'
          }}>
            {documents.length === 0 ? (
              <div style={{ margin: 'auto', textAlign: 'center', maxWidth: '400px' }}>
                <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📚</div>
                <h3 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>Your library is empty</h3>
                <p style={{ color: 'rgba(240,240,255,0.5)', marginBottom: '24px', fontSize: '0.95rem' }}>
                  You need to upload notes first before you can ask questions.
                </p>
                <Link to="/upload" className="btn btn-primary" style={{ textDecoration: 'none' }}>
                  Upload Notes
                </Link>
              </div>
            ) : chatHistory.length === 0 && !loading && !loadingHistory ? (
              <div style={{ margin: 'auto', textAlign: 'center', maxWidth: '450px', color: 'rgba(240,240,255,0.4)' }}>
                <div style={{ fontSize: '3rem', marginBottom: '16px' }}>💬</div>
                <h3 style={{ fontSize: '1.25rem', marginBottom: '8px', color: '#fff' }}>Start asking questions</h3>
                <p style={{ fontSize: '0.95rem', lineHeight: 1.5 }}>
                  Ask things like "Summarize the second section", "What are the core concepts here?", or "Give me a quick definition of..."
                </p>
              </div>
            ) : loadingHistory ? (
              <div style={{ margin: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '32px', height: '32px', border: '2px solid rgba(108,99,255,0.2)', borderTopColor: '#6c63ff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                <span style={{ fontSize: '0.85rem', color: 'rgba(240,240,255,0.5)' }}>Loading conversation...</span>
              </div>
            ) : (
              <>
                {chatHistory.map((msg, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                      width: '100%'
                    }}
                  >
                    <div style={{
                      maxWidth: '75%',
                      padding: '16px 20px',
                      borderRadius: '16px',
                      background: msg.sender === 'user' 
                        ? 'linear-gradient(135deg, #6c63ff 0%, #3ecfcf 100%)' 
                        : 'rgba(255, 255, 255, 0.03)',
                      border: msg.sender === 'user' 
                        ? 'none' 
                        : '1px solid rgba(255, 255, 255, 0.08)',
                      color: '#fff',
                      boxShadow: msg.sender === 'user' ? '0 4px 15px rgba(108, 99, 255, 0.15)' : 'none',
                      lineHeight: 1.5,
                      fontSize: '0.95rem'
                    }}>
                      {msg.text}

                      {/* Confidence Badge & Source for AI response */}
                      {msg.sender === 'ai' && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginTop: '12px',
                          paddingTop: '10px',
                          borderTop: '1px solid rgba(255,255,255,0.05)',
                          fontSize: '0.75rem',
                          color: 'rgba(240,240,255,0.45)'
                        }}>
                          <span style={{
                            background: msg.confidence > 0.7 ? 'rgba(0, 212, 170, 0.15)' : 'rgba(255, 214, 10, 0.15)',
                            color: msg.confidence > 0.7 ? '#00d4aa' : '#ffd60a',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontWeight: 700
                          }}>
                            {Math.round(msg.confidence * 100)}% Confidence
                          </span>
                          {msg.page_number && (
                            <span style={{
                              background: 'rgba(62, 207, 207, 0.15)',
                              color: '#3ecfcf',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontWeight: 600
                            }}>
                              📄 Page {msg.page_number}
                            </span>
                          )}
                          {msg.section_name && msg.section_name !== 'N/A' && (
                            <span style={{
                              background: 'rgba(108, 99, 255, 0.15)',
                              color: '#6c63ff',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              maxWidth: '180px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}>
                              🔖 {msg.section_name}
                            </span>
                          )}
                          {msg.source && (
                            <details style={{ flex: 1 }}>
                              <summary style={{ cursor: 'pointer', outline: 'none', userSelect: 'none' }}>View Source Passage</summary>
                              <div style={{
                                marginTop: '8px',
                                background: 'rgba(0,0,0,0.2)',
                                borderLeft: '3px solid #6c63ff',
                                padding: '8px 12px',
                                borderRadius: '4px',
                                color: 'rgba(240,240,255,0.6)',
                                fontStyle: 'italic',
                                fontSize: '0.8rem',
                                maxHeight: '120px',
                                overflowY: 'auto'
                              }}>
                                "{msg.source}"
                              </div>
                            </details>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Thinking indicator while AI processes */}
                {loading && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%' }}>
                    <div style={{
                      padding: '16px 20px',
                      borderRadius: '16px',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      color: 'rgba(240,240,255,0.6)',
                      fontSize: '0.9rem'
                    }}>
                      <div style={{ width: '18px', height: '18px', border: '2px solid rgba(108,99,255,0.2)', borderTopColor: '#6c63ff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                      Searching your document...
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </>
            )}
          </div>

          {/* Input Panel */}
          {documents.length > 0 && (
            <div style={{
              padding: '24px 40px',
              borderTop: '1px solid rgba(255, 255, 255, 0.05)',
              background: 'rgba(5, 5, 16, 0.6)',
              backdropFilter: 'blur(8px)'
            }}>
              <form onSubmit={handleAsk} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask a question about your study notes..."
                  disabled={loading}
                  style={{
                    flex: 1,
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '16px',
                    padding: '14px 20px',
                    color: '#fff',
                    outline: 'none',
                    fontSize: '0.95rem'
                  }}
                />
                
                {/* Voice button */}
                <VoiceButton onTranscript={handleVoiceTranscript} />

                <button
                  type="submit"
                  disabled={!question.trim()}
                  className="btn btn-primary"
                  style={{
                    padding: '14px 24px',
                    borderRadius: '16px'
                  }}
                >
                  Send ➔
                </button>
              </form>
            </div>
          )}

        </main>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .dot {
          font-size: 1.5rem;
          line-height: 1;
        }
      `}</style>
    </div>
  );
}
