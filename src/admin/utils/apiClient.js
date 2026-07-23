import { apiRequest as coreApiRequest, getApiBaseUrl } from '../../utils/apiClient';
import { getStoredStoreId, getStoredToken } from './authStorage';
import { isOfflineElectron } from '../../constants/offlineSession';

const DEFAULT_STORE_ID = import.meta.env.VITE_DEFAULT_STORE_ID || 'default';

export const API_BASE_URL = getApiBaseUrl();

export async function apiRequest(path, options = {}, retry = true) {
  return coreApiRequest(path, options, retry);
}

export async function apiRequestFormData(path, options = {}) {
  if (isOfflineElectron()) {
    const err = new Error('Tính năng upload chưa hỗ trợ ở chế độ offline.');
    err.status = 503;
    throw err;
  }

  const token = getStoredToken();
  const storeId = getStoredStoreId() || DEFAULT_STORE_ID;
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (storeId) headers['X-Store-Id'] = storeId;
  headers['X-Client-App'] = 'pos-app';

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.message || 'Request failed';
    const err = new Error(message);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function downloadBlob(path) {
  if (isOfflineElectron()) {
    const err = new Error('Tải file chưa hỗ trợ ở chế độ offline.');
    err.status = 503;
    throw err;
  }

  const token = getStoredToken();
  const storeId = getStoredStoreId() || DEFAULT_STORE_ID;
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (storeId) headers['X-Store-Id'] = storeId;
  headers['X-Client-App'] = 'pos-app';

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const err = new Error(data.message || 'Tải file thất bại');
    err.status = response.status;
    throw err;
  }
  return response.blob();
}
