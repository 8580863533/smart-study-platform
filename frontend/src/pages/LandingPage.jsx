import React from 'react';
import { Link } from 'react-router-dom';

export default function LandingPage() {
  return (
    <div className="landing-container" style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at top, #0d0d2b 0%, #050510 100%)',
      color: '#f0f0ff',
      overflowX: 'hidden',
      position: 'relative'
    }}>
      {/* Background Orbs */}
      <div style={{
        position: 'absolute',
        top: '10%',
        left: '15%',
        width: '300px',
        height: '300px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(108,99,255,0.15) 0%, rgba(0,0,0,0) 70%)',
        filter: 'blur(40px)',
        pointerEvents: 'none',
        zIndex: 0
      }} />
      <div style={{
        position: 'absolute',
        bottom: '20%',
        right: '10%',
        width: '400px',
        height: '400px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(62,207,207,0.12) 0%, rgba(0,0,0,0) 70%)',
        filter: 'blur(50px)',
        pointerEvents: 'none',
        zIndex: 0
      }} />

      {/* Navigation */}
      <header className="glass-card" style={{
        margin: '20px auto',
        maxWidth: '1200px',
        padding: '16px 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderRadius: '24px',
        zIndex: 10,
        position: 'relative'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #6c63ff 0%, #3ecfcf 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            fontSize: '1.2rem',
            color: '#fff'
          }}>🎓</div>
          <span style={{ fontWeight: 800, fontSize: '1.25rem', letterSpacing: '-0.5px' }} className="gradient-text">
            AI Study Tutor
          </span>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <Link to="/login" className="btn-secondary" style={{ textDecoration: 'none', padding: '10px 20px', borderRadius: '12px' }}>
            Sign In
          </Link>
          <Link to="/register" className="btn-primary" style={{ textDecoration: 'none', padding: '10px 20px', borderRadius: '12px', background: 'linear-gradient(135deg, #6c63ff 0%, #3ecfcf 100%)' }}>
            Get Started
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section style={{
        maxWidth: '1200px',
        margin: '80px auto',
        padding: '0 24px',
        textAlign: 'center',
        position: 'relative',
        zIndex: 1
      }}>
        <span style={{
          background: 'rgba(108,99,255,0.1)',
          border: '1px solid rgba(108,99,255,0.2)',
          color: '#3ecfcf',
          padding: '8px 16px',
          borderRadius: '30px',
          fontSize: '0.875rem',
          fontWeight: 600,
          display: 'inline-block',
          marginBottom: '24px'
        }}>
          ✨ Transform Your Study Habits
        </span>
        
        <h1 style={{
          fontSize: 'clamp(2.5rem, 5vw, 4.5rem)',
          fontWeight: 900,
          lineHeight: 1.1,
          letterSpacing: '-1px',
          margin: '0 auto 24px auto',
          maxWidth: '900px'
        }}>
          Study Smarter, Not Harder <br />
          with your <span className="gradient-text" style={{ background: 'linear-gradient(135deg, #6c63ff 0%, #3ecfcf 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Personalized AI Tutor</span>
        </h1>

        <p style={{
          fontSize: 'clamp(1rem, 2vw, 1.25rem)',
          color: 'rgba(240,240,255,0.6)',
          maxWidth: '650px',
          margin: '0 auto 40px auto',
          lineHeight: 1.6
        }}>
          Upload notes or lecture PDFs to instantly summarize key topics, chat with your documents, auto-generate flashcards, and test yourself with custom timed quizzes.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <Link to="/register" className="btn-primary" style={{
            textDecoration: 'none',
            padding: '16px 32px',
            fontSize: '1.1rem',
            fontWeight: 600,
            borderRadius: '14px',
            background: 'linear-gradient(135deg, #6c63ff 0%, #3ecfcf 100%)',
            boxShadow: '0 8px 30px rgba(108, 99, 255, 0.3)',
            transition: 'all 0.3s ease'
          }}>
            Create Free Account
          </Link>
          <Link to="/login" className="btn-secondary" style={{
            textDecoration: 'none',
            padding: '16px 32px',
            fontSize: '1.1rem',
            fontWeight: 600,
            borderRadius: '14px'
          }}>
            Explore Demo
          </Link>
        </div>
      </section>

      {/* Floating Mockup Cards */}
      <section style={{
        maxWidth: '1000px',
        margin: '0 auto 120px auto',
        padding: '0 24px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '24px',
        zIndex: 1,
        position: 'relative'
      }}>
        <div className="glass-card" style={{ padding: '24px', borderRadius: '20px', transform: 'translateY(-10px)', transition: 'transform 0.3s ease' }}>
          <div style={{ fontSize: '2rem', marginBottom: '16px' }}>💬</div>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>Smart Q&A</h3>
          <p style={{ color: 'rgba(240,240,255,0.6)', fontSize: '0.95rem', lineHeight: 1.5 }}>
            Ask natural questions about complex concepts in your uploaded notes. Get contextual answers instantly with references.
          </p>
        </div>
        <div className="glass-card" style={{ padding: '24px', borderRadius: '20px', transform: 'translateY(10px)', transition: 'transform 0.3s ease' }}>
          <div style={{ fontSize: '2rem', marginBottom: '16px' }}>📝</div>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>AI Summarization</h3>
          <p style={{ color: 'rgba(240,240,255,0.6)', fontSize: '0.95rem', lineHeight: 1.5 }}>
            Condense entire PDF lectures or textbooks into key bullet points and key takeaways in one click. Save hours of reading.
          </p>
        </div>
        <div className="glass-card" style={{ padding: '24px', borderRadius: '20px', transform: 'translateY(-10px)', transition: 'transform 0.3s ease' }}>
          <div style={{ fontSize: '2rem', marginBottom: '16px' }}>🃏</div>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>Auto Flashcards</h3>
          <p style={{ color: 'rgba(240,240,255,0.6)', fontSize: '0.95rem', lineHeight: 1.5 }}>
            Let the AI convert notes into active-recall decks. Uses Spaced Repetition (SR) intervals to maximize memory retention.
          </p>
        </div>
      </section>

      {/* Feature Grid Section */}
      <section style={{
        background: 'rgba(255, 255, 255, 0.01)',
        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
        padding: '100px 24px',
        zIndex: 1,
        position: 'relative'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '60px' }}>
            <h2 style={{ fontSize: '2.5rem', fontWeight: 800 }}>Comprehensive Features for Smart Learners</h2>
            <p style={{ color: 'rgba(240,240,255,0.6)', marginTop: '12px' }}>Everything you need to master your syllabus in record time.</p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '30px'
          }}>
            {/* Feature 1 */}
            <div style={{ display: 'flex', gap: '20px' }}>
              <div style={{
                background: 'rgba(108,99,255,0.1)',
                color: '#6c63ff',
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontSize: '1.25rem'
              }}>🎙️</div>
              <div>
                <h4 style={{ fontSize: '1.15rem', marginBottom: '8px' }}>Voice Interaction</h4>
                <p style={{ color: 'rgba(240,240,255,0.6)', fontSize: '0.95rem', lineHeight: 1.5 }}>Hands-free study mode. Speak your questions and listen to summaries spoken back to you.</p>
              </div>
            </div>

            {/* Feature 2 */}
            <div style={{ display: 'flex', gap: '20px' }}>
              <div style={{
                background: 'rgba(62,207,207,0.1)',
                color: '#3ecfcf',
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontSize: '1.25rem'
              }}>🎯</div>
              <div>
                <h4 style={{ fontSize: '1.15rem', marginBottom: '8px' }}>Adaptive Quizzes</h4>
                <p style={{ color: 'rgba(240,240,255,0.6)', fontSize: '0.95rem', lineHeight: 1.5 }}>AI-generated multiple choice questions complete with timers and detailed explanation keys.</p>
              </div>
            </div>

            {/* Feature 3 */}
            <div style={{ display: 'flex', gap: '20px' }}>
              <div style={{
                background: 'rgba(255,107,157,0.1)',
                color: '#ff6b9d',
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontSize: '1.25rem'
              }}>📈</div>
              <div>
                <h4 style={{ fontSize: '1.15rem', marginBottom: '8px' }}>Analytics & Progress</h4>
                <p style={{ color: 'rgba(240,240,255,0.6)', fontSize: '0.95rem', lineHeight: 1.5 }}>Track study times, active streaks, quiz averages, and secure your profile with login history audits.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '40px 24px',
        textAlign: 'center',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        color: 'rgba(240,240,255,0.4)',
        fontSize: '0.9rem'
      }}>
        <p>&copy; {new Date().getFullYear()} AI Study Tutor. All rights reserved.</p>
      </footer>
    </div>
  );
}
