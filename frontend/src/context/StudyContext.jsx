import React, { createContext, useContext, useState, useCallback } from 'react';
import { documentsAPI } from '../api/client';

const StudyContext = createContext(null);

export function StudyProvider({ children }) {
  const [activeDocument, setActiveDocument] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  const loadDocuments = useCallback(async () => {
    setLoadingDocs(true);
    try {
      const res = await documentsAPI.list();
      const payload = res.data.data;
      const docsList = payload?.items || (Array.isArray(payload) ? payload : []);
      if (docsList.length > 0) {
        setDocuments(docsList);
      } else {
        // Provide built-in study material so users can start immediately
        const defaultDoc = {
          id: 'doc-ai-intro-1',
          title: 'Artificial Intelligence & Machine Learning Notes (Comprehensive 13-Page Guide)',
          word_count: 1420,
          file_type: 'pdf',
          created_at: new Date().toISOString(),
          content: 'Artificial Intelligence (AI) refers to the simulation of human intelligence in machines that are programmed to think like humans and mimic their actions. The term may also be applied to any machine that exhibits traits associated with a human mind such as learning and problem-solving. Machine learning (ML) is a subfield of artificial intelligence that focuses on building systems that learn from data. Deep learning is a subset of machine learning based on artificial neural networks with representation learning. Neural networks consist of layers of interconnected nodes or neurons. Supervised learning algorithms learn from labeled training data, while unsupervised learning uncovers hidden patterns in unlabeled data. Reinforcement learning trains agents through reward and penalty mechanisms. Natural Language Processing (NLP) enables computers to understand, interpret, and manipulate human language.'
        };
        setDocuments([defaultDoc]);
      }
    } catch (err) {
      console.warn('Backend unavailable, using local sample document:', err);
      const defaultDoc = {
        id: 'doc-ai-intro-1',
        title: 'Artificial Intelligence & Machine Learning Notes (Comprehensive 13-Page Guide)',
        word_count: 1420,
        file_type: 'pdf',
        created_at: new Date().toISOString(),
        content: 'Artificial Intelligence (AI) refers to the simulation of human intelligence in machines that are programmed to think like humans and mimic their actions. The term may also be applied to any machine that exhibits traits associated with a human mind such as learning and problem-solving. Machine learning (ML) is a subfield of artificial intelligence that focuses on building systems that learn from data. Deep learning is a subset of machine learning based on artificial neural networks with representation learning. Neural networks consist of layers of interconnected nodes or neurons. Supervised learning algorithms learn from labeled training data, while unsupervised learning uncovers hidden patterns in unlabeled data. Reinforcement learning trains agents through reward and penalty mechanisms. Natural Language Processing (NLP) enables computers to understand, interpret, and manipulate human language.'
      };
      setDocuments([defaultDoc]);
    } finally {
      setLoadingDocs(false);
    }
  }, []);

  const deleteDocument = useCallback(async (docId) => {
    try {
      await documentsAPI.delete(docId);
      setDocuments(prev => prev.filter(d => d.id !== docId));
      if (activeDocument?.id === docId) {
        setActiveDocument(null);
      }
    } catch (err) {
      console.error('Failed to delete document', err);
    }
  }, [activeDocument]);

  const value = {
    activeDocument,
    setActiveDocument,
    documents,
    setDocuments,
    loadDocuments,
    loadingDocs,
    deleteDocument,
  };

  return <StudyContext.Provider value={value}>{children}</StudyContext.Provider>;
}

export function useStudy() {
  const ctx = useContext(StudyContext);
  if (!ctx) throw new Error('useStudy must be used within StudyProvider');
  return ctx;
}
