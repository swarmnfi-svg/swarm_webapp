import axios from 'axios';

const PRODUCTION_API = 'https://api.swarm.co.in/api';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || (import.meta.env.PROD ? PRODUCTION_API : '/api'),
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  signup: (data) => api.post('/auth/signup', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  forgotPassword: (data) => api.post('/auth/forgot-password', data),
  changePassword: (data) => api.post('/auth/change-password', data),
  ssoConfig: () => api.get('/auth/sso/config'),
  ssoLoginUrl: (returnTo, native = false) => api.get('/auth/sso/login-url', {
    params: { returnTo, ...(native ? { native: true } : {}) },
  }),
  ssoSignupUrl: (returnTo, native = false) => api.get('/auth/sso/signup-url', {
    params: { returnTo, ...(native ? { native: true } : {}) },
  }),
  ssoCallback: (code, native = false) => api.post('/auth/sso/callback', {
    code,
    ...(native ? { native: true } : {}),
  }),
};

export const plantAPI = {
  getAll: () => api.get('/plants'),
  getById: (id) => api.get(`/plants/${id}`),
  create: (data) => api.post('/plants', data),
  update: (id, data) => api.put(`/plants/${id}`, data),
  delete: (id) => api.delete(`/plants/${id}`),
};

export const sensorAPI = {
  getAll: () => api.get('/sensor-nodes'),
  getByPlant: (plantId) => api.get(`/sensor-nodes/plant/${plantId}`),
  create: (data) => api.post('/sensor-nodes', data),
  update: (id, data) => api.put(`/sensor-nodes/${id}`, data),
  toggle: (id, enable) => api.patch(`/sensor-nodes/${id}/toggle`, { enable }),
  delete: (id) => api.delete(`/sensor-nodes/${id}`),
};

export const deviceAPI = {
  pair: (data) => api.post('/devices/pair', data),
  getSwarmUrl: () => api.get('/devices/swarm-url'),
  syncReadings: (data) => api.post('/devices/sync-readings', data),
  espInfo: (ip) => api.get('/devices/esp/info', { params: { ip } }),
  espStatus: (ip, password) => api.get('/devices/esp/status', { params: { ip, password } }),
  espConfigure: (ip, password, config) => api.post('/devices/esp/configure', config, { params: { ip, password } }),
};

export const dashboardAPI = {
  getDashboard: (plantId) => api.get(`/dashboard/${plantId}`),
  getAnalytics: (plantId, params) => api.get(`/analytics/${plantId}`, { params }),
};

export const alertAPI = {
  getAll: (params) => api.get('/alerts', { params }),
  acknowledge: (id) => api.patch(`/alerts/${id}/acknowledge`),
  resolve: (id) => api.patch(`/alerts/${id}/resolve`),
};

export const aiAPI = {
  getRecommendations: (plantId) => api.get(`/ai/recommendations/${plantId}`),
  acknowledge: (id) => api.patch(`/ai/recommendations/${id}/acknowledge`),
};

export const maintenanceAPI = {
  getByPlant: (plantId) => api.get(`/maintenance/${plantId}`),
};

export const reportAPI = {
  getAll: (plantId) => api.get('/reports', { params: { plantId } }),
  generate: (data) => api.post('/reports/generate', data),
};

export const userAPI = {
  getAll: () => api.get('/users'),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  disable: (id) => api.patch(`/users/${id}/disable`),
  enable: (id) => api.patch(`/users/${id}/enable`),
  delete: (id) => api.delete(`/users/${id}`),
};

export const settingsAPI = {
  getAll: () => api.get('/settings'),
  save: (data) => api.post('/settings', data),
};

export const notificationAPI = {
  getAll: () => api.get('/notifications'),
};

export const hmiAPI = {
  getDiagram: (plantId) => api.get(`/hmi/${plantId}/diagram`),
  getState: (plantId) => api.get(`/hmi/${plantId}/state`),
  sendCommand: (plantId, body) => api.post(`/hmi/${plantId}/commands`, body),
  sendMaster: (plantId, body) => api.post(`/hmi/${plantId}/master`, body),
};

export default api;
