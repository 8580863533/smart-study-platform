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
      // backend returns paginated: res.data.data = {items: [...], page, total}
      const payload = res.data.data;
      const docsList = payload?.items || (Array.isArray(payload) ? payload : []);
      setDocuments(docsList);
    } catch (err) {
      console.error('Failed to load documents', err);
      setDocuments([]);
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
