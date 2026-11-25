import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to attach JWT token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('praxis_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Automatically ensure candidate user is logged in
export async function ensureAuth() {
  const existingToken = localStorage.getItem('praxis_token');
  if (existingToken) {
    try {
      const res = await apiClient.get('/auth/me');
      if (res.data) return res.data;
    } catch (e) {
      localStorage.removeItem('praxis_token');
    }
  }

  // Auto-login or register candidate
  const email = 'alex.candidate@praxis.ai';
  const password = 'Password123!';

  try {
    const loginRes = await axios.post(`${API_BASE}/auth/login`, { email, password });
    localStorage.setItem('praxis_token', loginRes.data.accessToken);
    return loginRes.data.user;
  } catch (loginErr) {
    // If not found, register new
    try {
      const regRes = await axios.post(`${API_BASE}/auth/register`, {
        email,
        password,
        role: 'candidate',
        name: 'Alex',
      });
      localStorage.setItem('praxis_token', regRes.data.accessToken);
      return regRes.data.user;
    } catch (regErr) {
      console.warn('Fallback: guest token generation error', regErr);
      return null;
    }
  }
}

export const sessionsApi = {
  async create({ topic, difficulty, expectedDurationMin, role }) {
    await ensureAuth();
    const res = await apiClient.post('/sessions', {
      topic,
      difficulty,
      expectedDurationMin,
      role: role || 'Full-Stack Developer',
    });
    return res.data;
  },

  async start(id) {
    await ensureAuth();
    const res = await apiClient.post(`/sessions/${id}/start`);
    return res.data;
  },

  async getById(id) {
    await ensureAuth();
    const res = await apiClient.get(`/sessions/${id}`);
    return res.data;
  },

  async getTranscript(id) {
    await ensureAuth();
    const res = await apiClient.get(`/sessions/${id}/transcript`);
    return res.data;
  },

  async getReport(id) {
    await ensureAuth();
    const res = await apiClient.get(`/sessions/${id}/report`);
    return res.data;
  },

  async retryEval(id) {
    await ensureAuth();
    const res = await apiClient.post(`/sessions/${id}/retry`);
    return res.data;
  },

  async nextQuestion(id, { previousQuestion, candidateAnswer, topic, difficulty, questionNumber, history }) {
    await ensureAuth();
    const res = await apiClient.post(`/sessions/${id}/next-question`, {
      previousQuestion,
      candidateAnswer,
      topic,
      difficulty,
      questionNumber,
      history,
    });
    return res.data;
  },

  async list({ limit = 20, status } = {}) {
    await ensureAuth();
    const params = new URLSearchParams({ limit });
    if (status) params.set('status', status);
    const res = await apiClient.get(`/sessions?${params}`);
    return res.data;
  },

  async end(id, { lastQuestion, candidateAnswer, questionNumber } = {}) {
    await ensureAuth();
    const res = await apiClient.post(`/sessions/${id}/end`, {
      lastQuestion: lastQuestion || null,
      candidateAnswer: candidateAnswer || null,
      questionNumber: questionNumber || 1,
    });
    return res.data;
  },
};
