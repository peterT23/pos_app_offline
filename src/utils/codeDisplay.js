export function displayOrderCode(orderCode) {
  const code = String(orderCode || '').trim();
  return code || '—';
}

export function displayReturnCode(returnCode) {
  const code = String(returnCode || '').trim();
  return code || '—';
}

export function displayCustomerCode(customerCode) {
  const code = String(customerCode || '').trim();
  return code || '—';
}

export function displayProductCode(productCode, barcode) {
  const code = String(productCode || '').trim();
  if (code) return code;
  const bar = String(barcode || '').trim();
  return bar || '—';
}
