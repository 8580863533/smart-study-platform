import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import { useStudy } from '../context/StudyContext';
import { useToast } from '../hooks/useToast';
import { quizAPI } from '../api/client';
import { generateQuizFromText } from '../utils/aiEngine';

const SECONDS_PER_QUESTION = 30;

export default function QuizPage() {
  const { docId } = useParams();
  const { documents, activeDocument, setActiveDocument, loadDocuments } = useStudy();
  const { addToast } = useToast();

  const [selectedDocId, setSelectedDocId] = useState('');
  const [numQuestions, setNumQuestions] = useState(5);
  const [quizState, setQuizState] = useState('setup');
  
  const [quizData, setQuizData] = useState(null);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState({});
  const [selectedOption, setSelectedOption] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(SECONDS_PER_QUESTION);
  const [totalTimeTaken, setTotalTimeTaken] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const timerRef = useRef(null);

  const [resultsData, setResultsData] = useState(null);

  useEffect(() => { loadDocuments(); }, []);

  useEffect(() => {
    if (docId) {
      setSelectedDocId(docId);
    } else if (activeDocument) {
      setSelectedDocId(activeDocument.id);
    } else if (documents.length > 0) {
      setSelectedDocId(documents[0].id);
      setActiveDocument(documents[0]);
    }
  }, [docId, activeDocument, documents]);

  // Handle Question Timer
  useEffect(() => {
    if (timerActive && timeRemaining > 0) {
      timerRef.current = setTimeout(() => {
        setTimeRemaining(prev => prev - 1);
        setTotalTimeTaken(prev => prev + 1);
      }, 1000);
    } else if (timerActive && timeRemaining === 0) {
      // Time expired for this question
      handleOptionSelect("Time Expired");
    }

    return () => clearTimeout(timerRef.current);
  }, [timeRemaining, timerActive]);

  const handleDocChange = (e) => {
    const id = e.target.value;
    setSelectedDocId(id);
    const doc = documents.find(d => d.id === id);
    if (doc) {
      setActiveDocument(doc);
    }
  };

  const handleStartQuiz = async () => {
    if (!selectedDocId) {
      addToast("Please select a document first.", "error");
      return;
    }

    setQuizState('loading');
    try {
      const res = await quizAPI.generate(selectedDocId, numQuestions);
      if (res.data?.success && res.data?.data) {
        setQuizData(res.data.data);
        setCurrentQIndex(0);
        setUserAnswers({});
        setSelectedOption(null);
        setTimeRemaining(SECONDS_PER_QUESTION);
        setTotalTimeTaken(0);
        setQuizState('quiz');
        setTimerActive(true);
        return;
      }
    } catch (err) {
      console.warn("Backend quiz notice, using local document AI engine:", err);
    }

    // Fallback: Generate quiz directly from the uploaded document text
    const doc = documents.find(d => d.id === selectedDocId);
    const fallbackQuiz = generateQuizFromText(doc?.content || "", numQuestions);
    setQuizData(fallbackQuiz);
    setCurrentQIndex(0);
    setUserAnswers({});
    setSelectedOption(null);
    setTimeRemaining(SECONDS_PER_QUESTION);
    setTotalTimeTaken(0);
    setQuizState('quiz');
    setTimerActive(true);
  };

  const handleOptionSelect = (option) => {
    if (selectedOption !== null) return; // Prevent changing answer after selection
    setTimerActive(false);
    setSelectedOption(option);
    
    // Save user answer
    setUserAnswers(prev => ({
      ...prev,
      [currentQIndex]: option
    }));
  };

  const handleNextQuestion = () => {
    if (currentQIndex < quizData.questions.length - 1) {
      setSelectedOption(null);
      setCurrentQIndex(prev => prev + 1);
      setTimeRemaining(SECONDS_PER_QUESTION);
      setTimerActive(true);
    } else {
      submitQuiz();
    }
  };

  const submitQuiz = async () => {
    setQuizState('loading');
    setTimerActive(false);
    try {
      const res = await axios.post('/api/quiz/submit', {
        quiz_id: quizData.quiz_id,
        answers: userAnswers,
        time_taken_seconds: totalTimeTaken
      });

      if (res.data.success) {
        setResultsData(res.data.data);
        setQuizState('results');
        addToast(`Quiz submitted! +${res.data.data.xp_earned} XP`, "success");
      } else {
        addToast(res.data.message || "Failed to score quiz.", "error");
        setQuizState('setup');
      }
    } catch (err) {
      console.error(err);
      addToast("Error submitting quiz results.", "error");
      setQuizState('setup');
    }
  };

  const handleRestart = () => {
    setQuizData(null);
    setResultsData(null);
    setQuizState('setup');
  };

  // Helper values for timer circle SVG
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (timeRemaining / SECONDS_PER_QUESTION) * circumference;

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at top, #0d0d2b 0%, #050510 100%)', display: 'flex', flexDirection: 'column' }}>
      <Navbar />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />
        
        <main style={{ flex: 1, padding: '40px', maxWidth: '850px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
          
          {/* SETUP SCREEN */}
          {quizState === 'setup' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              <div>
                <h1 style={{ fontSize: '2.25rem', fontWeight: 800, marginBottom: '8px' }}>AI Adaptive Quiz</h1>
                <p style={{ color: 'rgba(240,240,255,0.5)' }}>Generate interactive timed quizzes to evaluate your note mastery.</p>
              </div>

              {documents.length === 0 ? (
                <div className="glass-card" style={{ padding: '60px', textAlign: 'center', borderRadius: '24px' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📚</div>
                  <h3 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>No notes in library</h3>
                  <p style={{ color: 'rgba(240,240,255,0.5)', marginBottom: '24px' }}>
                    Upload documents before generating quizzes.
                  </p>
                  <Link to="/upload" className="btn btn-primary" style={{ textDecoration: 'none' }}>Upload Notes</Link>
                </div>
              ) : (
                <div className="glass-card" style={{ padding: '40px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'rgba(240,240,255,0.8)' }}>Select Notes Material</label>
                    <select
                      value={selectedDocId}
                      onChange={handleDocChange}
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: '#fff',
                        padding: '12px 16px',
                        borderRadius: '12px',
                        outline: 'none',
                        fontSize: '0.95rem',
                        cursor: 'pointer'
                      }}
                    >
                      {documents.map(d => (
                        <option key={d.id} value={d.id} style={{ background: '#0d0d2b' }}>{d.title}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', fontWeight: 600, color: 'rgba(240,240,255,0.8)' }}>
                      <span>Number of Questions</span>
                      <span style={{ color: '#3ecfcf' }}>{numQuestions} questions</span>
                    </div>
                    <input
                      type="range"
                      min={3}
                      max={10}
                      value={numQuestions}
                      onChange={(e) => setNumQuestions(parseInt(e.target.value))}
                      style={{
                        width: '100%',
                        accentColor: '#3ecfcf',
                        background: 'rgba(255,255,255,0.1)',
                        height: '6px',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    />
                  </div>

                  <button onClick={handleStartQuiz} className="btn btn-primary" style={{ padding: '14px', borderRadius: '12px', marginTop: '10px' }}>
                    🚀 Generate Quiz & Start
                  </button>
                </div>
              )}
            </div>
          )}

          {/* LOADING SCREEN */}
          {quizState === 'loading' && (
            <div style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
              <div style={{ width: '48px', height: '48px', border: '3px solid rgba(108,99,255,0.2)', borderTopColor: '#6c63ff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <p style={{ color: 'rgba(240,240,255,0.6)' }}>AI is preparing your custom quiz...</p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* ACTIVE QUIZ SCREEN */}
          {quizState === 'quiz' && quizData && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              {/* Quiz Header (Progress & Timer) */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <div style={{ fontSize: '0.85rem', color: 'rgba(240,240,255,0.5)', marginBottom: '8px' }}>
                    QUESTION {currentQIndex + 1} OF {quizData.questions.length}
                  </div>
                  <div style={{ height: '6px', background: 'rgba(255,255,255,0.04)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${((currentQIndex + 1) / quizData.questions.length) * 100}%`, background: 'linear-gradient(90deg, #6c63ff, #3ecfcf)', transition: 'width 0.3s ease' }} />
                  </div>
                </div>

                {/* SVG Countdown Timer */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <svg width="70" height="70" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx="35" cy="35" r={radius} fill="transparent" stroke="rgba(255,255,255,0.05)" strokeWidth="4" />
                    <circle
                      cx="35"
                      cy="35"
                      r={radius}
                      fill="transparent"
                      stroke={timeRemaining > 8 ? '#3ecfcf' : '#ff4d6d'}
                      strokeWidth="4"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
                    />
                  </svg>
                  <div style={{ position: 'absolute', transform: 'translate(25px, 0px)', fontWeight: 'bold', fontSize: '1.1rem', color: timeRemaining > 8 ? '#f0f0ff' : '#ff4d6d' }}>
                    {timeRemaining}s
                  </div>
                </div>
              </div>

              {/* Question Box */}
              <div className="glass-card" style={{ padding: '32px', borderRadius: '24px' }}>
                <h2 style={{ fontSize: '1.35rem', fontWeight: 700, lineHeight: 1.5 }}>
                  {quizData.questions[currentQIndex].question}
                </h2>
              </div>

              {/* Options list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {quizData.questions[currentQIndex].options.map((option, idx) => {
                  const isSelected = selectedOption === option;
                  const isAnswered = selectedOption !== null;
                  
                  return (
                    <button
                      key={idx}
                      onClick={() => handleOptionSelect(option)}
                      disabled={isAnswered}
                      style={{
                        textAlign: 'left',
                        padding: '16px 24px',
                        borderRadius: '16px',
                        border: '1px solid',
                        borderColor: isSelected 
                          ? '#6c63ff' 
                          : 'rgba(255, 255, 255, 0.08)',
                        background: isSelected 
                          ? 'rgba(108, 99, 255, 0.1)' 
                          : 'rgba(255, 255, 255, 0.02)',
                        color: '#fff',
                        fontSize: '0.95rem',
                        cursor: isAnswered ? 'default' : 'pointer',
                        transition: 'all 0.3s',
                        boxShadow: isSelected ? '0 0 15px rgba(108, 99, 255, 0.2)' : 'none'
                      }}
                    >
                      <span style={{ fontWeight: 'bold', marginRight: '12px', color: '#3ecfcf' }}>
                        {String.fromCharCode(65 + idx)}.
                      </span>
                      {option}
                    </button>
                  );
                })}
              </div>

              {/* Control Buttons */}
              {selectedOption !== null && (
                <div style={{ display: 'flex', justifyContent: 'end', marginTop: '10px' }}>
                  <button onClick={handleNextQuestion} className="btn btn-primary" style={{ padding: '12px 28px', borderRadius: '12px' }}>
                    {currentQIndex === quizData.questions.length - 1 ? "Submit Quiz ➔" : "Next Question ➔"}
                  </button>
                </div>
              )}

            </div>
          )}

          {/* RESULTS SCREEN */}
          {quizState === 'results' && resultsData && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              
              {/* Score breakdown header */}
              <div className="glass-card" style={{ padding: '40px', borderRadius: '24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'rgba(240,240,255,0.4)', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '16px' }}>Quiz Results</span>
                
                {/* SVG circular score display */}
                <div style={{ position: 'relative', width: '130px', height: '130px', marginBottom: '24px' }}>
                  <svg width="130" height="130" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx="65" cy="65" r="50" fill="transparent" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                    <circle
                      cx="65"
                      cy="65"
                      r="50"
                      fill="transparent"
                      stroke="url(#scoreGrad)"
                      strokeWidth="8"
                      strokeDasharray={2 * Math.PI * 50}
                      strokeDashoffset={2 * Math.PI * 50 - (resultsData.percentage / 100) * 2 * Math.PI * 50}
                      strokeLinecap="round"
                    />
                    <defs>
                      <linearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#6c63ff" />
                        <stop offset="100%" stopColor="#3ecfcf" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '1.75rem', fontWeight: 900, color: '#fff' }}>{resultsData.score}/{resultsData.total}</span>
                    <span style={{ fontSize: '0.75rem', color: 'rgba(240,240,255,0.5)' }}>{resultsData.percentage}%</span>
                  </div>
                </div>

                <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '8px' }}>
                  {resultsData.percentage >= 80 ? "Excellent Job! 🌟" : resultsData.percentage >= 50 ? "Good Attempt! 👍" : "Keep Learning! 📚"}
                </h2>
                
                <p style={{ color: 'rgba(240,240,255,0.6)', fontSize: '0.95rem', marginBottom: '20px' }}>
                  You earned <span style={{ color: '#ffd60a', fontWeight: 'bold' }}>⚡ {resultsData.xp_earned} XP</span> and finished in {Math.round(resultsData.time_taken_seconds)} seconds.
                </p>

                <div style={{ display: 'flex', gap: '16px' }}>
                  <button onClick={handleRestart} className="btn btn-primary btn-sm">Try Another Quiz</button>
                  <Link to="/dashboard" className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}>Dashboard</Link>
                </div>
              </div>

              {/* Questions Breakdown Accordion */}
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '16px' }}>Correction Key</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {resultsData.breakdown.map((q, idx) => (
                    <details key={idx} className="glass-card" style={{ padding: '20px', borderRadius: '16px' }}>
                      <summary style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', outline: 'none', userSelect: 'none' }}>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', paddingRight: '12px' }}>
                          <span style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            background: q.is_correct ? 'rgba(0, 212, 170, 0.15)' : 'rgba(255, 77, 109, 0.15)',
                            color: q.is_correct ? '#00d4aa' : '#ff4d6d',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 'bold',
                            fontSize: '0.8rem',
                            flexShrink: 0
                          }}>
                            {q.is_correct ? "✓" : "✗"}
                          </span>
                          <span style={{ fontWeight: 600, fontSize: '0.95rem', textAlign: 'left' }}>
                            Q{idx + 1}: {q.question.length > 70 ? q.question.substring(0, 70) + "..." : q.question}
                          </span>
                        </div>
                      </summary>

                      <div style={{ marginTop: '16px', paddingLeft: '36px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ fontSize: '0.95rem', fontWeight: 'bold' }}>{q.question}</div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.9rem' }}>
                          <div>
                            <span style={{ color: 'rgba(240,240,255,0.5)' }}>Your Answer: </span>
                            <span style={{ color: q.is_correct ? '#00d4aa' : '#ff4d6d', fontWeight: 600 }}>{q.user_answer || "Unanswered"}</span>
                          </div>
                          {!q.is_correct && (
                            <div>
                              <span style={{ color: 'rgba(240,240,255,0.5)' }}>Correct Answer: </span>
                              <span style={{ color: '#00d4aa', fontWeight: 600 }}>{q.correct_answer}</span>
                            </div>
                          )}
                        </div>

                        {q.explanation && (
                          <div style={{
                            background: 'rgba(0,0,0,0.15)',
                            padding: '12px 16px',
                            borderRadius: '8px',
                            borderLeft: '3px solid #3ecfcf',
                            fontSize: '0.85rem',
                            color: 'rgba(240,240,255,0.7)',
                            lineHeight: 1.5
                          }}>
                            <strong>AI Explanation:</strong> {q.explanation}
                          </div>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              </div>

            </div>
          )}

        </main>
      </div>
    </div>
  );
}
