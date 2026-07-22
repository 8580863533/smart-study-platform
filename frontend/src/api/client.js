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
  baseURL: '/api',
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
  uploadText: (title, content) => client.post('/documents/upload-text', { title, content }),
  delete: (docId) => client.delete(`/documents/${docId}`),
  stats: (docId) => client.get(`/documents/${docId}/stats`),
};

// --- Q&A API ---
export const qaAPI = {
  ask: (docId, question) => client.post('/qa/ask', { document_id: docId, question }),
  history: (docId) => client.get(`/qa/history/${docId}`),
};

// --- Summarize API ---
export const summarizeAPI = {
  summarize: (docId) => client.post('/summarize', { document_id: docId }),
  getSummary: (docId) => client.get(`/summarize/${docId}`),
};

// --- Flashcards API ---
export const flashcardsAPI = {
  generate: (docId) => client.post('/flashcards/generate', { document_id: docId }),
  list: (docId) => client.get(`/flashcards/${docId}`),
  rate: (cardId, rating) => client.put(`/flashcards/${cardId}/rate`, { rating }),
  markMastered: (cardId) => client.put(`/flashcards/${cardId}/mastered`),
};

// --- Quiz API ---
export const quizAPI = {
  generate: (docId, numQuestions = 5) =>
    client.post('/quiz/generate', { document_id: docId, num_questions: numQuestions }),
  submit: (quizId, answers) => client.post(`/quiz/${quizId}/submit`, { answers }),
  history: () => client.get('/quiz/history'),
};

// --- Progress API ---
export const progressAPI = {
  overview: () => client.get('/progress/overview'),
  weekly: () => client.get('/progress/weekly'),
  scoreHistory: () => client.get('/progress/score-history'),
  achievements: () => client.get('/progress/achievements'),
  recommendations: () => client.get('/progress/recommendations'),
  sessions: () => client.get('/progress/sessions'),
  flashcardStats: () => client.get('/progress/flashcard-stats'),
};

export default client;
