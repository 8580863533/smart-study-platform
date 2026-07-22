import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import { useStudy } from '../context/StudyContext';
import { useToast } from '../hooks/useToast';
import axios from 'axios';

export default function UploadPage() {
  const [activeTab, setActiveTab] = useState('file'); // 'file' | 'paste'
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  const { loadDocuments, setActiveDocument } = useStudy();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      // Autofill title if empty
      if (!title) {
        const dotIndex = selectedFile.name.lastIndexOf('.');
        const nameWithoutExt = dotIndex !== -1 ? selectedFile.name.substring(0, dotIndex) : selectedFile.name;
        setTitle(nameWithoutExt);
      }
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const selectedFile = e.dataTransfer.files[0];
      const extension = selectedFile.name.split('.').pop().toLowerCase();
      if (extension !== 'pdf' && extension !== 'txt') {
        addToast("Only PDF and TXT files are supported.", "error");
        return;
      }
      setFile(selectedFile);
      if (!title) {
        const dotIndex = selectedFile.name.lastIndexOf('.');
        const nameWithoutExt = dotIndex !== -1 ? selectedFile.name.substring(0, dotIndex) : selectedFile.name;
        setTitle(nameWithoutExt);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (activeTab === 'file' && !file) {
      addToast("Please select a file to upload.", "error");
      return;
    }
    if (activeTab === 'paste' && (!title || !content)) {
      addToast("Please specify a title and content.", "error");
      return;
    }
    if (!title || !title.trim()) {
      addToast("Title cannot be empty.", "error");
      return;
    }

    setLoading(true);
    setUploadProgress(10);
    
    try {
      let res;
      if (activeTab === 'file') {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', title.trim());
        
        setUploadProgress(30);
        res = await axios.post('/api/documents/upload', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          },
          onUploadProgress: (progressEvent) => {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(30 + Math.floor(progress * 0.6));
          }
        });
      } else {
        setUploadProgress(50);
        res = await axios.post('/api/documents/upload', {
          title: title.trim(),
          content: content.trim(),
          file_type: 'paste'
        });
      }

      setUploadProgress(100);

      if (res.data.success) {
        addToast("Study notes uploaded successfully! +10 XP", "success");
        // res.data.data = { document: {...}, xp_earned: 10 }
        const uploadedDoc = res.data.data?.document || res.data.data;
        await loadDocuments();
        setActiveDocument(uploadedDoc);
        
        // Short delay to show success state before redirecting
        setTimeout(() => {
          navigate(`/dashboard`);
        }, 800);
      } else {
        addToast(res.data.message || "Failed to upload document", "error");
      }
    } catch (err) {
      console.error(err);
      addToast(err.response?.data?.message || "An error occurred while uploading. Ensure it's text-based.", "error");
    } finally {
      setLoading(false);
      setUploadProgress(0);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at top, #0d0d2b 0%, #050510 100%)', display: 'flex', flexDirection: 'column' }}>
      <Navbar />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />
        
        <main style={{ flex: 1, padding: '40px', maxWidth: '800px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
          <div style={{ marginBottom: '32px' }}>
            <h1 style={{ fontSize: '2.25rem', fontWeight: 800, marginBottom: '8px' }}>Add Study Notes</h1>
            <p style={{ color: 'rgba(240,240,255,0.6)' }}>Upload textbooks, notes, or lecture slides to start studying with AI.</p>
          </div>

          {/* Tabs */}
          <div style={{
            display: 'flex',
            gap: '8px',
            background: 'rgba(255,255,255,0.02)',
            padding: '4px',
            borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.05)',
            marginBottom: '24px'
          }}>
            <button
              onClick={() => { setActiveTab('file'); setFile(null); }}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '8px',
                background: activeTab === 'file' ? 'rgba(255,255,255,0.06)' : 'transparent',
                border: 'none',
                color: activeTab === 'file' ? '#fff' : 'rgba(240,240,255,0.5)',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.3s'
              }}
            >
              📤 File Upload (PDF / TXT)
            </button>
            <button
              onClick={() => { setActiveTab('paste'); setFile(null); }}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '8px',
                background: activeTab === 'paste' ? 'rgba(255,255,255,0.06)' : 'transparent',
                border: 'none',
                color: activeTab === 'paste' ? '#fff' : 'rgba(240,240,255,0.5)',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.3s'
              }}
            >
              📝 Paste Plain Text
            </button>
          </div>

          <form onSubmit={handleSubmit} className="glass-card" style={{ padding: '32px', borderRadius: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Document Title */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'rgba(240,240,255,0.8)' }}>Document Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Intro to Quantum Mechanics - Week 1"
                  required
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '12px',
                    padding: '12px 16px',
                    color: '#fff',
                    outline: 'none',
                    fontSize: '0.95rem'
                  }}
                />
              </div>

              {/* Drag and Drop Upload */}
              {activeTab === 'file' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'rgba(240,240,255,0.8)' }}>Select Document</label>
                  <div
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    style={{
                      border: '2px dashed rgba(255, 255, 255, 0.1)',
                      borderRadius: '16px',
                      padding: '48px 24px',
                      textAlign: 'center',
                      background: 'rgba(255, 255, 255, 0.01)',
                      cursor: 'pointer',
                      transition: 'all 0.3s'
                    }}
                    onClick={() => document.getElementById('fileInput').click()}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = '#6c63ff'}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'}
                  >
                    <input
                      type="file"
                      id="fileInput"
                      accept=".pdf,.txt"
                      onChange={handleFileChange}
                      style={{ display: 'none' }}
                    />
                    <div style={{ fontSize: '2.5rem', marginBottom: '16px' }}>📄</div>
                    {file ? (
                      <div>
                        <div style={{ fontWeight: 600, color: '#3ecfcf', fontSize: '1rem', marginBottom: '4px' }}>
                          {file.name}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'rgba(240,240,255,0.4)' }}>
                          {Math.round(file.size / 1024)} KB
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '8px' }}>
                          Drag & drop notes file here, or browse
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'rgba(240,240,255,0.4)' }}>
                          Supports PDF, TXT (Max 16MB)
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Paste Plain Text Area */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'rgba(240,240,255,0.8)' }}>Paste Notes Content</label>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Paste textbook definitions, lecture transcripts, or notes contents here..."
                    required
                    rows={12}
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '12px',
                      padding: '16px',
                      color: '#fff',
                      outline: 'none',
                      fontSize: '0.95rem',
                      fontFamily: 'inherit',
                      resize: 'vertical'
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'end', fontSize: '0.8rem', color: 'rgba(240,240,255,0.4)' }}>
                    Word Count: {content.split(/\s+/).filter(Boolean).length} words
                  </div>
                </div>
              )}

              {/* Progress bar */}
              {loading && uploadProgress > 0 && (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'rgba(240,240,255,0.6)' }}>
                    <span>Processing text...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${uploadProgress}%`, background: 'linear-gradient(90deg, #6c63ff, #3ecfcf)', transition: 'width 0.3s ease' }} />
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary"
                style={{
                  padding: '14px',
                  fontWeight: 600,
                  fontSize: '1rem',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center'
                }}
              >
                {loading ? "Processing Document..." : "Add to Library"}
              </button>

            </div>
          </form>
        </main>
      </div>
    </div>
  );
}
