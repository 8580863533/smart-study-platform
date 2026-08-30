import axios from 'axios';

// --- Global Axios Defaults and Interceptors ---
axios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// --- Axios Instance ---
const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// --- Request Interceptor: attach JWT ---
client.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// --- Response Interceptor: handle 401 ---
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// --- Auth API ---
export const authAPI = {
  login: (email, password) => client.post('/auth/login', { email, password }),
  register: (name, email, password) => client.post('/auth/register', { name, email, password }),
  logout: () => client.post('/auth/logout'),
  me: () => client.get('/auth/me'),
  updateProfile: (data) => client.put('/auth/profile', data),
  changePassword: (oldPassword, newPassword) =>
    client.put('/auth/change-password', { old_password: oldPassword, new_password: newPassword }),
  loginHistory: (page = 1, limit = 20, filter = 'all') =>
    client.get('/auth/login-history', { params: { page, limit, filter } }),
};

// --- Documents API ---
export const documentsAPI = {
  list: () => client.get('/documents/'),
  get: (docId) => client.get(`/documents/${docId}`),
  upload: (formData, onUploadProgress) =>
    client.post('/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
    }),
  uploadText: (title, content) => client.post('/documents/upload', { title, content }),
  delete: (docId) => client.delete(`/documents/${docId}`),
  stats: (docId) => client.get(`/documents/${docId}`),
};

// --- Q&A API ---
export const qaAPI = {
  ask: (docId, question) => client.post('/qa/ask', { document_id: docId, question }),
  history: (docId) => client.get(`/qa/history/${docId}`),
};

// --- Summarize API ---
export const summarizeAPI = {
  summarize: (docId, options = {}) => client.post(`/summarize/${docId}`, options),
  getSummary: (docId) => client.post(`/summarize/${docId}`),
  summarizeText: (text) => client.post('/summarize/text', { text }),
};

// --- Flashcards API ---
export const flashcardsAPI = {
  generate: (docId, options = {}) => client.post(`/flashcards/generate/${docId}`, options),
  list: (docId) => client.get(docId ? `/flashcards/?doc_id=${docId}` : '/flashcards/'),
  due: () => client.get('/flashcards/due'),
  create: (data) => client.post('/flashcards/', data),
  review: (cardId, correct) => client.post(`/flashcards/${cardId}/review`, { correct }),
  delete: (cardId) => client.delete(`/flashcards/${cardId}`),
};

// --- Quiz API ---
export const quizAPI = {
  generate: (docId, numQuestions = 5) =>
    client.post(`/quiz/generate/${docId}`, { num_questions: numQuestions }),
  submit: (quizId, answers, timeTakenSeconds = 0) =>
    client.post('/quiz/submit', { quiz_id: quizId, answers, time_taken_seconds: timeTakenSeconds }),
  history: (docId) => client.get(docId ? `/quiz/results?doc_id=${docId}` : '/quiz/results'),
  getResultDetails: (resultId) => client.get(`/quiz/results/${resultId}`),
};

// --- Progress API ---
export const progressAPI = {
  overview: () => client.get('/progress/dashboard'),
  weekly: () => client.get('/progress/dashboard'),
  scoreHistory: () => client.get('/progress/dashboard'),
  achievements: () => client.get('/progress/achievements'),
  recommendations: () => client.get('/progress/recommendations'),
  sessions: (page = 1, perPage = 10) => client.get(`/progress/sessions?page=${page}&per_page=${perPage}`),
  saveSession: (data) => client.post('/progress/session', data),
  flashcardStats: () => client.get('/progress/dashboard'),
};

// --- Voice Rooms API ---
export const voiceroomsAPI = {
  create: (title, documentId, peerId) => client.post('/voicerooms/create', { title, document_id: documentId, peer_id: peerId }),
  join: (roomIdentifier, peerId) => client.post('/voicerooms/join', { room_code: roomIdentifier, room_id: roomIdentifier, peer_id: peerId }),
  active: () => client.get('/voicerooms/active'),
  getDetails: (roomId) => client.get(`/voicerooms/${roomId}`),
  leave: (roomId) => client.post(`/voicerooms/${roomId}/leave`),
  updateState: (roomId, state) => client.post(`/voicerooms/${roomId}/state`, state),
  sendSignal: (roomId, targetUserId, signal) => client.post(`/voicerooms/${roomId}/signal`, { target_user_id: targetUserId, signal }),
  getSignals: (roomId) => client.get(`/voicerooms/${roomId}/signals`),
  sendChat: (roomId, content) => client.post(`/voicerooms/${roomId}/chat`, { content }),
  getChat: (roomId) => client.get(`/voicerooms/${roomId}/chat`),
};

export default client;
