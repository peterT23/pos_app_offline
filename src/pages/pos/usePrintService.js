import { useCallback } from 'react';

export function usePrintService({
  cartItems,
  customerLocalId,
  customerPhone,
  customerName,
  customerPoints,
  orderNote,
  paymentMethod,
  totalAmount,
  printCopies,
  storeInfo,
  cashierName,
  calculateItemFinalPrice,
  showSnackbar,
  db,
}) {
  const handlePrintInvoice = useCallback(async (copiesOverride) => {
    if (!cartItems || cartItems.length === 0) {
      showSnackbar('Chưa có sản phẩm để in hóa đơn', 'warning');
      return;
    }

    let customer = null;
    try {
      await db.open().catch(() => {});
      if (customerLocalId) {
        customer = await db.customers.get(customerLocalId);
      } else if (customerPhone) {
        customer = await db.customers.where('phone').equals(customerPhone).first();
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Lỗi tải thông tin khách hàng để in:', error);
    }

    const customerNameValue = customerName || customer?.name || '';
    const customerNicknameValue = customer?.nickname || '';
    const customerPhoneValue = customerPhone || customer?.phone || '';
    const customerAddressValue = customer?.address?.trim() || '';
    const customerPointsValue =
      customer?.points !== undefined && customer?.points !== null
        ? customer.points
        : customerPoints;

    const paymentMethodLabel =
      paymentMethod === 'cash'
        ? 'Tiền mặt'
        : paymentMethod === 'bank'
          ? 'Chuyển khoản'
          : paymentMethod || '';

    const createdAtLabel = new Date().toLocaleString('vi-VN', { hour12: false });

    const itemsHtml = cartItems
      .map((item) => {
        const basePrice = Number(item.product?.price) || 0;
        const finalPrice = Number(calculateItemFinalPrice(item)) || 0;
        const hasDiscount = finalPrice < basePrice;
        const lineTotal = finalPrice * (Number(item.qty) || 0);
        return `
          <tr>
            <td class="item-name">${item.product?.name || ''}</td>
            <td class="item-qty">${item.qty}</td>
            <td class="item-price">
              <div class="price-final">${finalPrice.toLocaleString('vi-VN')}</div>
              ${hasDiscount ? `<div class="price-original">${basePrice.toLocaleString('vi-VN')}</div>` : ''}
            </td>
            <td class="item-total">${lineTotal.toLocaleString('vi-VN')}</td>
          </tr>
        `;
      })
      .join('');

    const customerInfoRows = [];
    if (customerNameValue) customerInfoRows.push(`Họ tên: ${customerNameValue}`);
    if (customerNicknameValue) customerInfoRows.push(`Biệt danh: ${customerNicknameValue}`);
    if (customerPhoneValue) customerInfoRows.push(`SĐT: ${customerPhoneValue}`);
    if (customerPointsValue !== undefined && customerPointsValue !== null && customerNameValue) {
      customerInfoRows.push(`Điểm tích luỹ: ${Number(customerPointsValue) || 0}`);
    }
    if (customerAddressValue) customerInfoRows.push(`Địa chỉ: ${customerAddressValue}`);
    const noteText = String(orderNote || '').trim();

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Hóa đơn bán hàng</title>
          <style>
            @page { size: 80mm auto; margin: 2mm; }
            body { font-family: Arial, sans-serif; color: #111; margin: 0; padding: 0; font-size: 11px; }
            .receipt { width: 76mm; margin: 0 auto; }
            .header { text-align: center; margin-bottom: 6px; }
            .store-name { font-size: 13px; font-weight: 700; }
            .store-line { font-size: 10px; margin-top: 1px; }
            .section { margin-top: 6px; font-size: 10.5px; }
            .section-title { font-weight: 600; margin-bottom: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 10.5px; }
            th, td { padding: 3px 2px; border-bottom: 1px dashed #ccc; vertical-align: top; }
            th { text-align: left; font-weight: 600; }
            .item-qty, .item-price, .item-total { text-align: right; }
            .price-final { font-weight: 600; }
            .price-original { color: #666; text-decoration: line-through; font-size: 9px; }
            .summary { margin-top: 8px; font-size: 10.5px; }
            .summary-row { display: flex; justify-content: space-between; margin-top: 4px; }
            .summary-total { font-weight: 700; font-size: 11px; }
            .divider { border-top: 1px dashed #ccc; margin: 8px 0; }
            .cut-line { margin-top: 8px; padding-top: 4px; border-top: 1px dashed #333; text-align: center; font-size: 9px; }
          </style>
        </head>
        <body>
          <div class="receipt">
            <div class="header">
              <div class="store-name">${storeInfo.name}</div>
              ${storeInfo.phone ? `<div class="store-line">SĐT: ${storeInfo.phone}</div>` : ''}
              ${storeInfo.address ? `<div class="store-line">Địa chỉ: ${storeInfo.address}</div>` : ''}
              ${storeInfo.website ? `<div class="store-line">Website: ${storeInfo.website}</div>` : ''}
            </div>

            <div class="section">
              <div>Thời gian: ${createdAtLabel}</div>
              <div>Nhân viên: ${cashierName}</div>
            </div>

            ${customerInfoRows.length > 0 ? `
              <div class="section">
                <div class="section-title">Thông tin khách hàng</div>
                ${customerInfoRows.map((row) => `<div>${row}</div>`).join('')}
              </div>
            ` : ''}

            <table>
              <thead>
                <tr>
                  <th>Sản phẩm</th>
                  <th class="item-qty">SL</th>
                  <th class="item-price">Giá</th>
                  <th class="item-total">Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>

            <div class="summary">
              <div class="divider"></div>
              <div class="summary-row summary-total">
                <span>Tổng tiền thanh toán</span>
                <span>${totalAmount.toLocaleString('vi-VN')}</span>
              </div>
              <div class="summary-row">
                <span>Phương thức thanh toán</span>
                <span>${paymentMethodLabel || '-'}</span>
              </div>
            </div>
            ${noteText ? `
              <div class="section">
                <div class="section-title">Ghi chú đơn hàng</div>
                <div>${noteText}</div>
              </div>
            ` : ''}
            <div class="cut-line">--- KẾT THÚC HÓA ĐƠN ---</div>
          </div>
        </body>
      </html>
    `;

    const totalCopies = Math.max(1, Number(copiesOverride || printCopies) || 1);
    const previewWindow = window.open('', '_blank', 'width=460,height=780');
    if (!previewWindow) {
      showSnackbar('Không thể mở cửa sổ in hóa đơn', 'error');
      return;
    }
    const escapedReceiptHtml = html
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;');
    const previewHtml = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Xem trước in hóa đơn</title>
          <style>
            body { margin: 0; background: #f3f4f6; font-family: Arial, sans-serif; }
            .toolbar {
              position: sticky;
              top: 0;
              z-index: 10;
              background: #fff;
              border-bottom: 1px solid #e5e7eb;
              padding: 10px 12px;
              display: flex;
              gap: 8px;
              justify-content: flex-end;
            }
            .btn {
              border: 1px solid #d1d5db;
              border-radius: 8px;
              background: #fff;
              color: #111827;
              padding: 7px 14px;
              font-size: 13px;
              cursor: pointer;
            }
            .btn-primary {
              border-color: #2563eb;
              background: #2563eb;
              color: #fff;
            }
            .paper { margin: 12px auto 16px; width: fit-content; background: #fff; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08); }
            .preview-frame { width: 90mm; height: 78vh; border: 0; background: #fff; }
            @media print {
              .toolbar { display: none !important; }
              body { background: #fff; }
              .paper { margin: 0; box-shadow: none; }
              .preview-frame { width: 100%; height: auto; }
            }
          </style>
        </head>
        <body>
          <div class="toolbar">
            <button class="btn" id="cancelBtn">Cancel</button>
            <button class="btn btn-primary" id="printBtn">Print</button>
          </div>
          <div class="paper"><iframe id="receiptFrame" class="preview-frame" srcdoc="${escapedReceiptHtml}"></iframe></div>
          <script>
            (function () {
              let remaining = ${totalCopies};
              const frame = document.getElementById('receiptFrame');
              function closePreview() {
                window.close();
              }
              function runPrint() {
                if (remaining <= 0) {
                  closePreview();
                  return;
                }
                remaining -= 1;
                if (frame && frame.contentWindow) {
                  frame.contentWindow.focus();
                  frame.contentWindow.print();
                } else {
                  window.focus();
                  window.print();
                }
              }
              document.getElementById('cancelBtn').addEventListener('click', closePreview);
              document.getElementById('printBtn').addEventListener('click', runPrint);
              const printTarget = (frame && frame.contentWindow) ? frame.contentWindow : window;
              printTarget.onafterprint = function () {
                if (remaining > 0) {
                  setTimeout(runPrint, 120);
                }
              };
            })();
          </script>
        </body>
      </html>
    `;
    previewWindow.document.open();
    previewWindow.document.write(previewHtml);
    previewWindow.document.close();
    setTimeout(() => {
      try {
        const frame = previewWindow.document.getElementById('receiptFrame');
        if (frame && frame.contentWindow) {
          frame.contentWindow.focus();
          frame.contentWindow.print();
        } else {
          previewWindow.focus();
          previewWindow.print();
        }
      } catch {
        // ignore; user can press Print manually
      }
    }, 180);
  }, [
    calculateItemFinalPrice,
    cartItems,
    cashierName,
    customerLocalId,
    customerName,
    customerPhone,
    customerPoints,
    orderNote,
    db,
    paymentMethod,
    printCopies,
    showSnackbar,
    storeInfo.address,
    storeInfo.name,
    storeInfo.phone,
    storeInfo.website,
    totalAmount,
  ]);

  return { handlePrintInvoice };
}
