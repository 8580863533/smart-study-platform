import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import { useStudy } from '../context/StudyContext';
import { useToast } from '../hooks/useToast';
import { flashcardsAPI } from '../api/client';
import { generateFlashcardsFromText } from '../utils/aiEngine';

export default function FlashcardsPage() {
  const { docId } = useParams();
  const { documents, activeDocument, setActiveDocument, loadDocuments } = useStudy();
  const { addToast } = useToast();

  const [selectedDocId, setSelectedDocId] = useState('');
  const [loading, setLoading] = useState(false);
  const [cards, setCards] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewsDone, setReviewsDone] = useState(0);
  const [completed, setCompleted] = useState(false);
  const hasLoadedRef = useRef(false);
  const isReviewingRef = useRef(false); // guard against double-click

  useEffect(() => { loadDocuments(); }, []);

  // Load cards once when docId or documents list first becomes available
  useEffect(() => {
    if (hasLoadedRef.current) return; // don't reload on tab switch
    if (docId) {
      hasLoadedRef.current = true;
      setSelectedDocId(docId);
      loadCards(docId);
    } else if (activeDocument) {
      hasLoadedRef.current = true;
      setSelectedDocId(activeDocument.id);
      loadCards(activeDocument.id);
    } else if (documents.length > 0) {
      hasLoadedRef.current = true;
      const firstDoc = documents[0];
      setSelectedDocId(firstDoc.id);
      setActiveDocument(firstDoc);
      loadCards(firstDoc.id);
    }
  }, [docId, documents]); // ← removed activeDocument to prevent re-trigger on tab switch

  const loadCards = async (id) => {
    if (!id) return;
    setLoading(true);
    setCards([]);
    setCurrentIndex(0);
    setFlipped(false);
    setCompleted(false);
    
    try {
      const res = await flashcardsAPI.list(id);
      if (res.data?.success) {
        const items = res.data.data?.items || res.data.data;
        const list = Array.isArray(items) ? items : [];
        if (list.length > 0) {
          setCards(list);
          setLoading(false);
          return;
        }
      }
    } catch (err) {
      console.warn("Backend flashcards notice, generating from local document content:", err);
    }

    // Fallback: Generate flashcards from document content across all pages
    const doc = documents.find(d => d.id === id);
    const localCards = generateFlashcardsFromText(doc?.content || "", 8);
    setCards(localCards);
    setLoading(false);
  };

  const handleDocChange = (e) => {
    const id = e.target.value;
    setSelectedDocId(id);
    const doc = documents.find(d => d.id === id);
    if (doc) {
      setActiveDocument(doc);
    }
    loadCards(id);
  };

  const handleGenerate = async () => {
    if (!selectedDocId) return;
    setLoading(true);
    setCards([]);
    setCurrentIndex(0);
    setFlipped(false);
    setCompleted(false);
    setReviewsDone(0);

    try {
      const res = await flashcardsAPI.generate(selectedDocId);
      if (res.data?.success) {
        const payload = res.data.data;
        const list = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.flashcards)
          ? payload.flashcards
          : Array.isArray(payload?.items)
          ? payload.items
          : [];
        if (list.length > 0) {
          setCards(list);
          addToast(`Generated ${list.length} AI Flashcards! +20 XP`, 'success');
          setLoading(false);
          return;
        }
      }
    } catch (err) {
      console.warn("Backend flashcard generation notice, generating from local document:", err);
    }

    const doc = documents.find(d => d.id === selectedDocId);
    const localCards = generateFlashcardsFromText(doc?.content || "", 10);
    setCards(localCards);
    addToast(`Generated ${localCards.length} AI Flashcards! +20 XP`, 'success');
    setLoading(false);
  };

  const handleReview = (correct) => {
    if (cards.length === 0) return;
    // Prevent rapid double-clicks from skipping two cards
    if (isReviewingRef.current) return;
    isReviewingRef.current = true;

    const card = cards[currentIndex];

    // ── Move to next card IMMEDIATELY (optimistic) ──────────────────────────
    setReviewsDone(prev => prev + 1);
    setFlipped(false);

    if (currentIndex < cards.length - 1) {
      // Small delay lets the flip-back animation play before the new card appears
      setTimeout(() => {
        setCurrentIndex(prev => prev + 1);
        isReviewingRef.current = false;
      }, 350);
    } else {
      setTimeout(() => {
        setCompleted(true);
        isReviewingRef.current = false;
      }, 350);
    }

    // ── Fire-and-forget API call in the background ──────────────────────────
    addToast(correct ? 'Great job! +2 XP' : 'Keep practicing!', correct ? 'success' : 'info');
    axios
      .post(`/api/flashcards/${card.id}/review`, { correct })
      .catch(err => console.error('Review save failed (non-blocking):', err));
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setFlipped(false);
    setCompleted(false);
    setReviewsDone(0);
  };

  const currentCard = cards[currentIndex];

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at top, #0d0d2b 0%, #050510 100%)', display: 'flex', flexDirection: 'column' }}>
      <Navbar />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />
        
        <main style={{ flex: 1, padding: '40px', maxWidth: '800px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
          
          {/* Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '32px',
            flexWrap: 'wrap',
            gap: '16px'
          }}>
            <div>
              <h1 style={{ fontSize: '2.25rem', fontWeight: 800, marginBottom: '8px' }}>Active Recall Cards</h1>
              <p style={{ color: 'rgba(240,240,255,0.5)' }}>Use 3D flashcards and spaced repetition to commit notes to memory.</p>
            </div>

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
                Please upload a study document to generate flashcard study decks.
              </p>
              <Link to="/upload" className="btn btn-primary" style={{ textDecoration: 'none' }}>
                Upload Notes
              </Link>
            </div>
          ) : loading ? (
            <div style={{ height: '350px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
              <div style={{ width: '48px', height: '48px', border: '3px solid rgba(108,99,255,0.2)', borderTopColor: '#6c63ff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <p style={{ color: 'rgba(240,240,255,0.6)' }}>Loading card deck...</p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : cards.length === 0 ? (
            <div className="glass-card" style={{ padding: '60px', textAlign: 'center', borderRadius: '24px' }}>
              <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🃏</div>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>No flashcards generated yet</h3>
              <p style={{ color: 'rgba(240,240,255,0.5)', marginBottom: '24px' }}>
                Create your first deck using AI based on your active notes.
              </p>
              <button onClick={handleGenerate} className="btn btn-primary">
                ✨ Generate AI Flashcards
              </button>
            </div>
          ) : completed ? (
            /* Celebration Deck Completion Screen */
            <div className="glass-card" style={{ padding: '60px', textAlign: 'center', borderRadius: '24px', animation: 'scaleUp 0.4s ease' }}>
              <div style={{ fontSize: '4rem', marginBottom: '16px' }}>🎉</div>
              <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '12px' }}>Deck Completed!</h2>
              <p style={{ color: 'rgba(240,240,255,0.6)', maxWidth: '400px', margin: '0 auto 32px auto', lineHeight: 1.6 }}>
                Awesome job! You've reviewed all {cards.length} flashcards in this deck. Regular practice builds durable memories.
              </p>
              <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
                <button onClick={handleRestart} className="btn btn-primary">Study Again</button>
                <Link to="/dashboard" className="btn btn-secondary" style={{ textDecoration: 'none' }}>Back to Dashboard</Link>
              </div>
            </div>
          ) : (
            /* Study Flashcard Panel */
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '30px' }}>
              
              {/* Progress bar */}
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'rgba(240,240,255,0.6)' }}>
                  <span>Reviewing Card {currentIndex + 1} of {cards.length}</span>
                  <span>{Math.round(((currentIndex) / cards.length) * 100)}% Complete</span>
                </div>
                <div style={{ height: '6px', background: 'rgba(255,255,255,0.04)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${((currentIndex) / cards.length) * 100}%`, background: 'linear-gradient(90deg, #ff6b9d, #c044ff)', transition: 'width 0.3s ease' }} />
                </div>
              </div>

              {/* 3D Flip Card Container */}
              <div
                className="flashcard-container"
                onClick={() => setFlipped(!flipped)}
                style={{
                  perspective: '1000px',
                  width: '100%',
                  height: '350px',
                  cursor: 'pointer'
                }}
              >
                <div
                  key={currentIndex}
                  className="flashcard-inner"
                  style={{
                    position: 'relative',
                    width: '100%',
                    height: '100%',
                    transformStyle: 'preserve-3d',
                    transition: 'transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                    transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
                  }}
                >
                  {/* Card Front */}
                  <div
                    className="flashcard-front glass-card"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      backfaceVisibility: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '40px',
                      borderRadius: '24px',
                      textAlign: 'center'
                    }}
                  >
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(240,240,255,0.4)', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '16px' }}>FRONT</span>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 800, lineHeight: 1.4 }} className="gradient-text">
                      {currentCard.front}
                    </h2>
                    <span style={{ fontSize: '0.8rem', color: 'rgba(240,240,255,0.3)', marginTop: '24px' }}>Click to flip card</span>
                  </div>

                  {/* Card Back */}
                  <div
                    className="flashcard-back glass-card"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      backfaceVisibility: 'hidden',
                      transform: 'rotateY(180deg)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '40px',
                      borderRadius: '24px',
                      textAlign: 'center'
                    }}
                  >
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(240,240,255,0.4)', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '16px' }}>BACK</span>
                    <p style={{ fontSize: '1.2rem', lineHeight: 1.6, color: '#fff', margin: 0 }}>
                      {currentCard.back}
                    </p>
                    
                    {currentCard.hint && (
                      <div style={{
                        marginTop: '20px',
                        fontSize: '0.85rem',
                        color: 'rgba(240,240,255,0.4)',
                        fontStyle: 'italic',
                        background: 'rgba(0,0,0,0.1)',
                        padding: '6px 12px',
                        borderRadius: '6px'
                      }}>
                        💡 Hint: {currentCard.hint}
                      </div>
                    )}
                    <span style={{ fontSize: '0.8rem', color: 'rgba(240,240,255,0.3)', marginTop: '24px' }}>Click to flip back</span>
                  </div>

                </div>
              </div>

              {/* Review / Control Panel */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', width: '100%' }}>
                <p style={{ fontSize: '0.9rem', color: 'rgba(240,240,255,0.5)', textAlign: 'center' }}>
                  Did you answer this card correctly?
                </p>
                <div style={{ display: 'flex', gap: '16px', width: '100%', maxWidth: '360px' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleReview(false); }}
                    className="btn btn-danger"
                    style={{ flex: 1, padding: '12px 0', borderRadius: '12px' }}
                  >
                    ❌ No, Incorrect
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleReview(true); }}
                    className="btn"
                    style={{ flex: 1, padding: '12px 0', borderRadius: '12px', background: 'linear-gradient(135deg, #00d4aa 0%, #00b4d8 100%)', color: '#fff' }}
                  >
                    ✅ Yes, Correct
                  </button>
                </div>
              </div>

            </div>
          )}

        </main>
      </div>

      <style>{`
        @keyframes scaleUp {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
