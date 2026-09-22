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

  const ensureDocumentContent = useCallback(async (docId) => {
    if (!docId) return '';
    const current = documents.find(d => d.id === docId);
    if (current?.content && current.content.trim().length > 10) {
      return current.content;
    }
    try {
      const res = await documentsAPI.get(docId);
      const fetched = res.data?.data?.document;
      if (fetched?.content) {
        setDocuments(prev => {
          const updated = prev.map(d => d.id === docId ? { ...d, content: fetched.content, num_pages: fetched.num_pages || d.num_pages } : d);
          localStorage.setItem('study_documents', JSON.stringify(updated));
          return updated;
        });
        return fetched.content;
      }
    } catch (e) {
      console.warn('Could not fetch remote doc content:', e);
    }
    return current?.content || '';
  }, [documents]);

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
        // Merge remote and local documents without losing content
        const mergedMap = new Map();
        localDocs.forEach(d => mergedMap.set(d.id, d));
        remoteList.forEach(d => {
          const existing = mergedMap.get(d.id) || localDocs.find(ld => ld.title === d.title);
          mergedMap.set(d.id, {
            ...existing,
            ...d,
            content: existing?.content || d.content || '',
            num_pages: existing?.num_pages || d.num_pages || 1,
          });
        });
        const mergedList = Array.from(mergedMap.values());
        setDocuments(mergedList);
        localStorage.setItem('study_documents', JSON.stringify(mergedList));

        // If active document has no content, fetch it
        const firstDoc = mergedList[0];
        if (firstDoc && (!firstDoc.content || firstDoc.content.length < 10)) {
          ensureDocumentContent(firstDoc.id);
        }
      }
    } catch (err) {
      console.warn('Backend list unavailable, keeping local documents:', err);
    } finally {
      setLoadingDocs(false);
    }
  }, [ensureDocumentContent]);

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
    ensureDocumentContent,
  };

  return <StudyContext.Provider value={value}>{children}</StudyContext.Provider>;
}

export function useStudy() {
  const ctx = useContext(StudyContext);
  if (!ctx) throw new Error('useStudy must be used within StudyProvider');
  return ctx;
}
