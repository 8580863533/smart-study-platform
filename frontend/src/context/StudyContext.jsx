import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { documentsAPI } from '../api/client';
import { getStoredDocuments, saveDocumentLocally, deleteStoredDocument } from '../utils/aiEngine';

const StudyContext = createContext(null);

export function StudyProvider({ children }) {
  const [activeDocument, setActiveDocument] = useState(null);
  const [documents, setDocuments] = useState(() => getStoredDocuments());
  const [loadingDocs, setLoadingDocs] = useState(false);

  // Initialize from local storage on mount
  useEffect(() => {
    const localDocs = getStoredDocuments();
    setDocuments(localDocs);
    if (localDocs.length > 0 && !activeDocument) {
      setActiveDocument(localDocs[0]);
    }
  }, []);

  const loadDocuments = useCallback(async () => {
    setLoadingDocs(true);
    // Read local stored documents first for zero lag
    const localDocs = getStoredDocuments();
    setDocuments(localDocs);

    try {
      const res = await documentsAPI.list();
      const payload = res.data?.data;
      const remoteList = payload?.items || (Array.isArray(payload) ? payload : []);
      if (remoteList.length > 0) {
        // Merge remote and local documents
        const mergedMap = new Map();
        localDocs.forEach(d => mergedMap.set(d.id, d));
        remoteList.forEach(d => mergedMap.set(d.id, d));
        const mergedList = Array.from(mergedMap.values());
        setDocuments(mergedList);
        localStorage.setItem('study_documents', JSON.stringify(mergedList));
      }
    } catch (err) {
      console.warn('Backend list unavailable, keeping local documents:', err);
    } finally {
      setLoadingDocs(false);
    }
  }, []);

  const addDocument = useCallback((doc) => {
    const updated = saveDocumentLocally(doc);
    setDocuments(updated);
    setActiveDocument(doc);
    return updated;
  }, []);

  const deleteDocument = useCallback(async (docId) => {
    deleteStoredDocument(docId);
    setDocuments(prev => prev.filter(d => d.id !== docId));
    if (activeDocument?.id === docId) {
      setActiveDocument(null);
    }
    try {
      await documentsAPI.delete(docId);
    } catch (err) {
      console.warn('Backend delete error:', err);
    }
  }, [activeDocument]);

  const value = {
    activeDocument,
    setActiveDocument,
    documents,
    setDocuments,
    addDocument,
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
