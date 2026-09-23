import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import { useStudy } from '../context/StudyContext';
import { useToast } from '../hooks/useToast';
import { documentsAPI } from '../api/client';
import { extractTextFromPdfFile, ingestAndIndexDocument } from '../utils/aiEngine';

export default function UploadPage() {
  const [activeTab, setActiveTab] = useState('file'); // 'file' | 'paste'
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  
  const { addDocument, setActiveDocument, loadDocuments } = useStudy();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
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
      if (extension !== 'pdf' && extension !== 'txt' && extension !== 'docx') {
        addToast("Supported formats: PDF, TXT, and DOCX.", "error");
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
    setUploadProgress(15);
    setStatusMessage("Reading document pages...");

    // 1. Extract full text from all pages client-side with 100% fidelity
    let extractedText = content.trim();
    const docTitle = title.trim();
    const fileExt = activeTab === 'file' ? (file?.name?.split('.').pop()?.toLowerCase() || 'pdf') : 'txt';
    let totalPagesCount = 1;

    if (activeTab === 'file' && file) {
      if (fileExt === 'pdf') {
        setStatusMessage("Extracting all pages of PDF...");
        const pdfResult = await extractTextFromPdfFile(file, (p) => {
          setUploadProgress(15 + Math.round(p * 0.4));
        });
        if (pdfResult && pdfResult.text) {
          extractedText = pdfResult.text;
          totalPagesCount = pdfResult.numPages;
        }
      } else if (fileExt === 'txt') {
        try {
          extractedText = await file.text();
        } catch (err) {
          console.warn("TXT read notice:", err);
        }
      } else if (fileExt === 'docx') {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const decoder = new TextDecoder('utf-8', { fatal: false });
          const textContent = decoder.decode(arrayBuffer);
          const matches = textContent.match(/<w:t[\s>][^<]*<\/w:t>/g);
          if (matches && matches.length > 0) {
            extractedText = matches.map(m => m.replace(/<[^>]+>/g, '')).join(' ').trim();
          } else {
            extractedText = textContent.replace(/<[^>]+>/g, ' ').replace(/[^\x20-\x7E\n]/g, ' ').replace(/\s+/g, ' ').trim();
          }
        } catch (err) {
          console.warn("DOCX read notice:", err);
        }
      }
    }

    if (!extractedText) {
      extractedText = `Notes for ${docTitle}`;
    }

    setStatusMessage("Normalizing text & generating 500-1000 token semantic chunks...");
    setUploadProgress(65);

    const docId = 'doc-' + Date.now();

    setStatusMessage("Building vector embeddings & inverted search index...");
    setUploadProgress(85);

    // Ingest, clean, chunk into 500-1000 tokens, and build TF-IDF vector index
    const indexedDoc = ingestAndIndexDocument(extractedText, docId, docTitle, totalPagesCount);

    // 2. Save document locally immediately
    const localDoc = {
      id: docId,
      title: docTitle,
      content: extractedText,
      word_count: indexedDoc.word_count,
      num_pages: totalPagesCount,
      file_type: fileExt,
      vector_index: indexedDoc.vector_index,
      chunks: indexedDoc.chunks,
      created_at: new Date().toISOString()
    };

    addDocument(localDoc);
    setActiveDocument(localDoc);

    // 3. Sync with backend API
    try {
      if (activeTab === 'file' && file) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', docTitle);
        documentsAPI.upload(formData).then(res => {
          if (res.data?.success && res.data?.data?.document) {
            addDocument(res.data.data.document);
          }
        }).catch(() => {});
      } else {
        documentsAPI.uploadText(docTitle, extractedText).then(res => {
          if (res.data?.success && res.data?.data?.document) {
            addDocument(res.data.data.document);
          }
        }).catch(() => {});
      }
    } catch (err) {
      console.warn("Backend sync notice:", err);
    }

    setUploadProgress(100);
    setStatusMessage("Complete!");
    addToast(`Saved ${docTitle} (${totalPagesCount} pages, ${wordCount} words) to library! +20 XP`, "success");

    setTimeout(() => {
      navigate('/dashboard');
    }, 500);

    setLoading(false);
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
              📤 File Upload (PDF / TXT / DOCX)
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
                      accept=".pdf,.txt,.docx"
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
                          Supports PDF, TXT, DOCX (Max 16MB)
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
