import { getStoredStoreId, getStoredToken, getStoredUser, setStoredAuth, setStoredToken } from './authStorage';
import { isOfflineElectron, isOfflineSession, OFFLINE_SESSION_TOKEN } from '../constants/offlineSession';

/** Chỉ dùng khi không chạy trong Electron offline (vd. mở Vite bằng trình duyệt). */
export function getApiBaseUrl() {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim().replace(/\/$/, '');
  }
  if (typeof window !== 'undefined' && /^https?:$/i.test(window.location?.protocol || '')) {
    return '';
  }
  return 'http://localhost:5000';
}

const DEFAULT_STORE_ID = import.meta.env.VITE_DEFAULT_STORE_ID || 'default';
const CLIENT_APP = 'pos-app';

const FETCH_TIMEOUT_MS = 12000;

async function fetchWithTimeout(url, options = {}) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

async function offlineInvoke(method, path, body) {
  const raw = await window.posOffline.offlineApi(method, path, body ?? null);
  if (raw && raw.__error) {
    const err = new Error(raw.message || 'Request failed');
    err.status = raw.status || 500;
    err.data = raw.data;
    throw err;
  }
  if (raw && raw.__noop) {
    return {};
  }
  return raw;
}

export async function apiRequest(path, options = {}, retry = true) {
  if (isOfflineElectron()) {
    const method = (options.method || 'GET').toUpperCase();
    const body = options.body !== undefined && options.body !== null ? String(options.body) : undefined;
    return offlineInvoke(method, path, body);
  }

  const API_BASE_URL = getApiBaseUrl();
  const token = getStoredToken();
  const storeId = getStoredStoreId() || DEFAULT_STORE_ID;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (storeId) {
    headers['X-Store-Id'] = storeId;
  }
  headers['X-Client-App'] = CLIENT_APP;

  const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && retry && path !== '/api/auth/refresh') {
      try {
        const refreshRes = await fetchWithTimeout(`${API_BASE_URL}/api/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-Client-App': CLIENT_APP,
          },
        });
        const refreshData = await refreshRes.json().catch(() => ({}));
        if (refreshRes.ok && refreshData.token) {
          setStoredToken(refreshData.token);
          const user = refreshData.user || getStoredUser();
          setStoredAuth(refreshData.token, user);
          return apiRequest(path, options, false);
        }
      } catch {
        // ignore
      }
    }
    const message = data.message || 'Request failed';
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    if (data && data.errors) {
      error.errors = data.errors;
    }
    throw error;
  }

  return data;
}

export async function refreshSession() {
  if (isOfflineSession()) {
    const u = getStoredUser();
    return u ? { token: OFFLINE_SESSION_TOKEN, user: u } : null;
  }
  if (isOfflineElectron()) {
    return null;
  }

  const API_BASE_URL = getApiBaseUrl();
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Client-App': CLIENT_APP },
      credentials: 'include',
    });
    if (response.status === 204) {
      return null;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return null;
    }
    if (data.token) {
      setStoredToken(data.token);
      const user = data.user || getStoredUser();
      setStoredAuth(data.token, user);
    }
    return data;
  } catch {
    return null;
  }
}
