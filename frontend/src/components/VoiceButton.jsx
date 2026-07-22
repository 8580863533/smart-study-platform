import React, { useState, useEffect } from 'react';
import { useToast } from '../hooks/useToast';

export default function VoiceButton({ onTranscript, placeholder = "Speak now..." }) {
  const [isListening, setIsListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const { addToast } = useToast();
  let recognition = null;

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
    }
  }, []);

  const toggleListening = () => {
    if (!supported) {
      addToast("Voice recognition is not supported in this browser. Try Chrome or Edge.", "error");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        addToast("Listening... Speak clearly.", "info");
      };

      recognition.onresult = (event) => {
        const transcriptText = event.results[0][0].transcript;
        if (onTranscript) {
          onTranscript(transcriptText);
        }
        addToast("Speech captured!", "success");
        setIsListening(false);
      };

      recognition.onerror = (event) => {
        console.error("Speech recognition error", event);
        if (event.error === 'not-allowed') {
          addToast("Microphone access denied.", "error");
        } else {
          addToast(`Voice error: ${event.error}`, "error");
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (e) {
      console.error(e);
      addToast("Failed to initialize voice recognition", "error");
      setIsListening(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggleListening}
      className={`voice-btn ${isListening ? 'listening' : ''}`}
      title={isListening ? "Stop listening" : "Speak question"}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '46px',
        height: '46px',
        borderRadius: '50%',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        background: isListening 
          ? 'linear-gradient(135deg, #ff6b9d 0%, #c044ff 100%)' 
          : 'rgba(255, 255, 255, 0.05)',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        boxShadow: isListening ? '0 0 15px rgba(255, 107, 157, 0.5)' : 'none',
        position: 'relative'
      }}
    >
      {isListening && (
        <span className="pulse-ring" style={{
          position: 'absolute',
          top: '-4px',
          left: '-4px',
          right: '-4px',
          bottom: '-4px',
          borderRadius: '50%',
          border: '2px solid #ff6b9d',
          animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite',
          opacity: 0.8
        }} />
      )}
      
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        style={{
          width: '20px',
          height: '20px',
          color: isListening ? '#ffffff' : 'rgba(240, 240, 255, 0.8)'
        }}
      >
        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
        <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
      </svg>

      <style>{`
        @keyframes ping {
          75%, 100% {
            transform: scale(1.3);
            opacity: 0;
          }
        }
      `}</style>
    </button>
  );
}
