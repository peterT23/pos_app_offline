/** Token lưu localStorage khi đăng nhập qua SQLite (không dùng JWT server). */
export const OFFLINE_SESSION_TOKEN = 'pos_offline_sqlite';

export function isOfflineElectron() {
  return typeof window !== 'undefined' && typeof window.posOffline?.offlineApi === 'function';
}

export function isOfflineSession() {
  if (!isOfflineElectron()) return false;
  try {
    return localStorage.getItem('pos_auth_token') === OFFLINE_SESSION_TOKEN;
  } catch {
    return false;
  }
}
