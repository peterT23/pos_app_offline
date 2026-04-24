/**
 * Xóa dữ liệu POS local (SQLite pos_*) và một phần localStorage khi đổi user / đăng xuất.
 */
const POS_BANK_ACCOUNTS_KEY = 'pos_bank_accounts';
const POS_ORDER_CODE_MIGRATED_KEY = 'pos_order_code_migrated_v1';
const STORE_KEY = 'pos_store_id';

export async function clearLocalAppData() {
  try {
    if (typeof window !== 'undefined' && window.posOffline?.posDb) {
      await window.posOffline.posDb({ op: 'clearAllData' });
    }
  } catch (e) {
    console.warn('clearLocalAppData SQLite:', e);
  }

  try {
    localStorage.removeItem(POS_BANK_ACCOUNTS_KEY);
    localStorage.removeItem(POS_ORDER_CODE_MIGRATED_KEY);
    localStorage.removeItem(STORE_KEY);
  } catch (err) {
    console.warn('clearLocalAppData localStorage:', err);
  }
}
