/**
 * Chuẩn hiển thị số toàn app:
 * - Ngăn cách hàng nghìn: dấu phẩy → 100,000
 * - Thập phân: dấu chấm → 100,000.54
 */

/** Chỉ giữ chữ số (bỏ mọi dấu phân cách) — dùng khi nhập số nguyên (VND) */
export function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '');
}

/**
 * Parse chuỗi tiền/số về number.
 * Hỗ trợ: "100,000" | "100,000.54" | cũ "100.000" (ngăn nghìn kiểu VN).
 */
export function parseMoneyInput(value) {
  let s = String(value ?? '').trim();
  if (!s) return 0;
  s = s.replace(/[^\d.,-]/g, '');
  if (!s || s === '-' || s === '.' || s === ',') return 0;

  const negative = s.startsWith('-');
  if (negative) s = s.slice(1);

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    // 100,000.54 → bỏ dấu phẩy (nghìn), giữ chấm (thập phân)
    s = s.replace(/,/g, '');
  } else if (hasComma && !hasDot) {
    // 100,000 → nghìn
    s = s.replace(/,/g, '');
  } else if (hasDot && !hasComma) {
    // 100.000 (cũ VN, nhóm 3) hoặc 100.54 (thập phân)
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, '');
    }
  }

  const n = parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  return negative ? -n : n;
}

/**
 * Hiển thị số: 100000 → "100,000", 100000.54 → "100,000.54"
 */
export function formatMoney(value, { maxDecimals = 2, minDecimals = 0, allowEmpty = false } = {}) {
  if (value === '' || value === null || value === undefined) {
    return allowEmpty ? '' : '0';
  }
  if (typeof value === 'string' && value.trim() === '') {
    return allowEmpty ? '' : '0';
  }
  const n = typeof value === 'number' ? value : parseMoneyInput(value);
  if (!Number.isFinite(n)) return allowEmpty ? '' : '0';

  return n.toLocaleString('en-US', {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
  });
}

/** Alias rõ nghĩa cho số lượng / điểm / tồn kho */
export function formatNumber(value, opts) {
  return formatMoney(value, opts);
}

/** Ô nhập tiền (thường số nguyên VND): 100000 → "100,000" */
export function formatMoneyInput(value, { allowEmpty = false } = {}) {
  if (value === '' || value === null || value === undefined) {
    return allowEmpty ? '' : '0';
  }
  if (typeof value === 'string' && value.trim() === '') {
    return allowEmpty ? '' : '0';
  }
  const n = typeof value === 'number' ? value : parseMoneyInput(value);
  if (!Number.isFinite(n)) return allowEmpty ? '' : '0';
  return Math.round(n).toLocaleString('en-US');
}

/**
 * Khi user gõ vào ô tiền nguyên: lấy digits, trả về { digits, display, number }.
 */
export function normalizeMoneyTyping(raw) {
  const digits = digitsOnly(raw);
  if (!digits) {
    return { digits: '', display: '', number: 0 };
  }
  const number = parseInt(digits, 10) || 0;
  return {
    digits,
    display: number.toLocaleString('en-US'),
    number,
  };
}
