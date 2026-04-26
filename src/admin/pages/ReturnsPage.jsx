import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  FormControlLabel,
  Pagination,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  RadioGroup,
  Radio,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import Layout from '../components/Layout';
import { apiRequest } from '../utils/apiClient';
import { displayReturnCode } from '../../utils/codeDisplay';

function toYMD(d) {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatMoney(n) {
  return (Number(n) || 0).toLocaleString('vi-VN');
}

function formatDateTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function resolveItemProductCode(item, productCodeMap) {
  const direct = item?.productCode ? String(item.productCode).trim() : '';
  if (direct) return direct;
  const keys = [
    item?.productLocalId,
    item?.productId,
    item?._id,
  ]
    .filter(Boolean)
    .map((k) => String(k).trim());
  for (const key of keys) {
    const hit = productCodeMap.get(key);
    if (hit) return hit;
  }
  return '—';
}

export default function ReturnsPage() {
  const [returns, setReturns] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(30);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [timeMode, setTimeMode] = useState('year');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [typeReturnOnly, setTypeReturnOnly] = useState(true);
  const [typeExchange, setTypeExchange] = useState(true);
  const [statusCompleted, setStatusCompleted] = useState(true);
  const [statusCancelled, setStatusCancelled] = useState(true);
  const [creator, setCreator] = useState('');
  const [receiver, setReceiver] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailNote, setDetailNote] = useState('');
  const [productCodeMap, setProductCodeMap] = useState(() => new Map());
  const [saveLoading, setSaveLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  const statusList = useMemo(() => {
    const list = [];
    if (statusCompleted) list.push('completed');
    if (statusCancelled) list.push('cancelled');
    return list;
  }, [statusCompleted, statusCancelled]);

  const typeList = useMemo(() => {
    const list = [];
    if (typeReturnOnly) list.push('return');
    if (typeExchange) list.push('exchange');
    return list;
  }, [typeReturnOnly, typeExchange]);

  const effectiveRange = useMemo(() => {
    if (timeMode === 'custom') return { from: dateFrom, to: dateTo };
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    return { from: toYMD(start), to: toYMD(end) };
  }, [timeMode, dateFrom, dateTo]);

  const loadReturns = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      if (effectiveRange.from) params.set('dateFrom', effectiveRange.from);
      if (effectiveRange.to) params.set('dateTo', effectiveRange.to);
      if (statusList.length > 0) params.set('status', statusList.join(','));
      if (typeList.length > 0) params.set('type', typeList.join(','));
      if (creator.trim()) params.set('creator', creator.trim());
      if (receiver.trim()) params.set('receiver', receiver.trim());
      const res = await apiRequest(`/api/returns?${params.toString()}`);
      setReturns(Array.isArray(res?.returns) ? res.returns : []);
      setTotal(Number(res?.total) || 0);
    } catch (err) {
      setLoadError(err?.data?.message || err?.message || 'Không tải được danh sách đổi/trả');
      setReturns([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, limit, searchTerm, effectiveRange.from, effectiveRange.to, statusList, typeList, creator, receiver]);

  useEffect(() => {
    loadReturns();
  }, [loadReturns]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, effectiveRange.from, effectiveRange.to, statusList, typeList, creator, receiver]);

  const openDetail = useCallback(async (row) => {
    const id = row?._id || row?.returnCode;
    if (!id) return;
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      setDetailNote('');
      setActionError('');
      return;
    }
    setExpandedId(id);
    setDetail(null);
    setActionError('');
    try {
      if (productCodeMap.size === 0) {
        try {
          const lookup = await apiRequest('/api/products/lookup');
          const items = Array.isArray(lookup?.items) ? lookup.items : [];
          const map = new Map();
          items.forEach((p) => {
            const code = String(p.productCode || '').trim();
            if (!code) return;
            [p.localId, p._id, p.productCode].filter(Boolean).forEach((k) => map.set(String(k), code));
          });
          setProductCodeMap(map);
        } catch {
          // keep fallback display
        }
      }
      const res = await apiRequest(`/api/returns/${encodeURIComponent(row.returnCode || id)}`);
      setDetail(res);
      setDetailNote(res?.return?.note || '');
    } catch (err) {
      setDetail({ error: err?.message || 'Không tải được chi tiết' });
      setDetailNote('');
    }
  }, [expandedId, productCodeMap.size]);

  const detailSummary = useMemo(() => {
    const r = detail?.return || {};
    const returnItems = detail?.returnItems || [];
    const exchangeItems = detail?.exchangeItems || [];
    const totalReturnAmount = Number(r.totalReturnAmount) || returnItems.reduce((s, it) => s + (Number(it.subtotal) || 0), 0);
    const totalExchangeAmount = Number(r.totalExchangeAmount) || exchangeItems.reduce((s, it) => s + (Number(it.subtotal) || 0), 0);
    const refundToCustomer = Math.max(0, totalReturnAmount - totalExchangeAmount);
    const customerPayMore = Math.max(0, totalExchangeAmount - totalReturnAmount);
    return { totalReturnAmount, totalExchangeAmount, refundToCustomer, customerPayMore };
  }, [detail]);

  const handleSave = useCallback(async () => {
    const targetId = detail?.return?._id || detail?.return?.localId || detail?.return?.returnCode;
    if (!targetId) return;
    setSaveLoading(true);
    setActionError('');
    try {
      await apiRequest(`/api/returns/${encodeURIComponent(targetId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ note: detailNote }),
      });
      setDetail((prev) => (prev ? { ...prev, return: { ...prev.return, note: detailNote } } : prev));
      await loadReturns();
    } catch (err) {
      setActionError(err?.data?.message || err?.message || 'Lưu thất bại');
    } finally {
      setSaveLoading(false);
    }
  }, [detail, detailNote, loadReturns]);

  const handleCancel = useCallback(async () => {
    const targetId = detail?.return?._id || detail?.return?.localId || detail?.return?.returnCode;
    if (!targetId) return;
    setSaveLoading(true);
    setActionError('');
    try {
      await apiRequest(`/api/returns/${encodeURIComponent(targetId)}`, { method: 'DELETE' });
      setDetail((prev) => (prev ? { ...prev, return: { ...prev.return, status: 'cancelled' } } : prev));
      await loadReturns();
    } catch (err) {
      setActionError(err?.data?.message || err?.message || 'Hủy phiếu trả thất bại');
    } finally {
      setSaveLoading(false);
    }
  }, [detail, loadReturns]);

  const handleExportDetail = useCallback(() => {
    if (!detail?.return) return;
    const r = detail.return;
    const returnItems = detail.returnItems || [];
    const exchangeItems = detail.exchangeItems || [];
    const rows = [
      ['Mã phiếu trả', displayReturnCode(r.returnCode)],
      ['Mã hóa đơn gốc', r.orderCode || ''],
      ['Thời gian', formatDateTime(r.createdAt)],
      ['Khách hàng', r.customerName || r.customerPhone || 'Khách lẻ'],
      ['Sản phẩm trả'],
      ['Mã hàng', 'Tên hàng', 'SL', 'Đơn giá', 'Thành tiền'],
      ...returnItems.map((it) => [resolveItemProductCode(it, productCodeMap), it.productName || '', it.qty || 0, Number(it.price) || 0, Number(it.subtotal) || 0]),
      [],
      ['Sản phẩm mua lại'],
      ['Mã hàng', 'Tên hàng', 'SL', 'Đơn giá', 'Thành tiền'],
      ...exchangeItems.map((it) => [resolveItemProductCode(it, productCodeMap), it.productName || '', it.qty || 0, Number(it.price) || 0, Number(it.subtotal) || 0]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DoiTra');
    XLSX.writeFile(wb, `HoaDonDoiTra_${displayReturnCode(r.returnCode)}_${Date.now()}.xlsx`);
  }, [detail]);

  const handleExportList = useCallback(() => {
    const rows = [
      ['Mã phiếu trả', 'Thời gian', 'Mã KH', 'Khách hàng', 'Tổng tiền trả hàng', 'Tổng tiền mua hàng', 'Cần trả khách', 'Trạng thái'],
      ...returns.map((r) => [
        displayReturnCode(r.returnCode),
        formatDateTime(r.createdAt),
        r.customerCode || '',
        r.customerName || r.customerPhone || 'Khách lẻ',
        Number(r.totalReturnAmount) || 0,
        Number(r.totalExchangeAmount) || 0,
        Math.max(0, (Number(r.totalReturnAmount) || 0) - (Number(r.totalExchangeAmount) || 0)),
        r.status || '',
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DanhSachDoiTra');
    XLSX.writeFile(wb, `DanhSachDoiTra_${toYMD(new Date())}.xlsx`);
  }, [returns]);

  const handleCopy = useCallback(() => {
    handleExportDetail();
  }, [handleExportDetail]);

  const handlePrint = useCallback(() => {
    if (!detail?.return) return;
    const r = detail.return;
    const returnItems = detail.returnItems || [];
    const exchangeItems = detail.exchangeItems || [];
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Phiếu đổi trả ${r.returnCode || ''}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; background: #f3f4f6; color: #111827; }
            .toolbar { position: sticky; top: 0; z-index: 2; display: flex; gap: 8px; padding: 10px; background: #fff; border-bottom: 1px solid #e5e7eb; }
            .toolbar button { padding: 8px 12px; cursor: pointer; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; }
            .paper { width: 80mm; min-height: 100vh; margin: 12px auto; background: #fff; padding: 8px 6px; box-sizing: border-box; }
            .title { text-align: center; font-size: 14px; font-weight: 700; margin-bottom: 6px; }
            .meta { font-size: 11px; line-height: 1.45; margin-bottom: 6px; }
            .section { font-size: 11px; font-weight: 700; margin: 8px 0 4px; border-top: 1px dashed #999; padding-top: 4px; }
            table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
            th, td { border-bottom: 1px dashed #c7c7c7; padding: 3px 2px; text-align: left; vertical-align: top; }
            th.num, td.num { text-align: right; }
            .totals { margin-top: 6px; font-size: 11px; line-height: 1.5; }
            .cut-line { margin-top: 8px; padding-top: 4px; border-top: 1px dashed #333; text-align: center; font-size: 9px; }
            @media print {
              @page { size: 80mm auto; margin: 2mm; }
              body { background: #fff; }
              .toolbar { display: none !important; }
              .paper { margin: 0 auto; width: 76mm; min-height: auto; padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="toolbar">
            <button onclick="window.print()">In / Chọn máy in</button>
          </div>
          <div class="paper">
            <div class="title">HÓA ĐƠN ĐỔI TRẢ</div>
            <div class="meta">
              <div><strong>Mã phiếu:</strong> ${r.returnCode || ''}</div>
              <div><strong>Ngày:</strong> ${formatDateTime(r.createdAt)}</div>
              <div><strong>Khách:</strong> ${r.customerName || r.customerPhone || 'Khách lẻ'}</div>
            </div>
            <div class="section">Sản phẩm trả</div>
            <table>
              <tr><th>Mã</th><th>Tên hàng</th><th class="num">SL</th><th class="num">Tiền</th></tr>
              ${returnItems.map((it) => `<tr><td>${resolveItemProductCode(it, productCodeMap)}</td><td>${it.productName || ''}</td><td class="num">${it.qty ?? 0}</td><td class="num">${formatMoney(it.subtotal)}</td></tr>`).join('') || '<tr><td colspan="4">Không có</td></tr>'}
            </table>
            <div class="section">Sản phẩm mua lại</div>
            <table>
              <tr><th>Mã</th><th>Tên hàng</th><th class="num">SL</th><th class="num">Tiền</th></tr>
              ${exchangeItems.map((it) => `<tr><td>${resolveItemProductCode(it, productCodeMap)}</td><td>${it.productName || ''}</td><td class="num">${it.qty ?? 0}</td><td class="num">${formatMoney(it.subtotal)}</td></tr>`).join('') || '<tr><td colspan="4">Không có</td></tr>'}
            </table>
            <div class="totals">
              <div><strong>Tổng tiền trả hàng:</strong> ${formatMoney(detailSummary.totalReturnAmount)}</div>
              <div><strong>Tổng tiền mua hàng:</strong> ${formatMoney(detailSummary.totalExchangeAmount)}</div>
              <div><strong>Cần trả khách:</strong> ${formatMoney(detailSummary.refundToCustomer)}</div>
              <div><strong>Khách cần trả thêm:</strong> ${formatMoney(detailSummary.customerPayMore)}</div>
            </div>
            <div class="cut-line">--- KẾT THÚC HÓA ĐƠN ---</div>
          </div>
        </body>
      </html>
    `);
    win.document.close();
  }, [detail, detailSummary, productCodeMap]);

  return (
    <Layout maxWidth={false}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
        Trả hàng
      </Typography>

      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ p: 0 }}>
          <Box sx={{ display: 'flex', minHeight: 520 }}>
            <Paper
              variant="outlined"
              sx={{ width: 280, flexShrink: 0, borderRight: '1px solid', borderColor: 'divider', p: 2 }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>Loại hóa đơn</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', mb: 2 }}>
                <FormControlLabel control={<Checkbox size="small" checked={typeReturnOnly} onChange={(e) => setTypeReturnOnly(e.target.checked)} />} label="Trả hàng" />
                <FormControlLabel control={<Checkbox size="small" checked={typeExchange} onChange={(e) => setTypeExchange(e.target.checked)} />} label="Đổi hàng" />
              </Box>

              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>Trạng thái</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', mb: 2 }}>
                <FormControlLabel control={<Checkbox size="small" checked={statusCompleted} onChange={(e) => setStatusCompleted(e.target.checked)} />} label="Đã trả" />
                <FormControlLabel control={<Checkbox size="small" checked={statusCancelled} onChange={(e) => setStatusCancelled(e.target.checked)} />} label="Đã hủy" />
              </Box>

              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>Thời gian</Typography>
              <RadioGroup value={timeMode} onChange={(e) => setTimeMode(e.target.value)} sx={{ mb: 1 }}>
                <FormControlLabel value="year" control={<Radio size="small" />} label="Năm nay" />
                <FormControlLabel value="custom" control={<Radio size="small" />} label="Tùy chỉnh" />
              </RadioGroup>
              {timeMode === 'custom' && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
                  <TextField size="small" type="date" label="Từ ngày" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
                  <TextField size="small" type="date" label="Đến ngày" value={dateTo} onChange={(e) => setDateTo(e.target.value)} InputLabelProps={{ shrink: true }} />
                </Box>
              )}

              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>Người tạo</Typography>
              <TextField size="small" fullWidth value={creator} onChange={(e) => setCreator(e.target.value)} placeholder="Chọn người tạo" sx={{ mb: 2 }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>Người nhận trả</Typography>
              <TextField size="small" fullWidth value={receiver} onChange={(e) => setReceiver(e.target.value)} placeholder="Chọn người nhận trả" />
            </Paper>

            <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <Paper sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Box sx={{ flex: 1, minWidth: 240 }}>
                    <TextField
                      size="small"
                      fullWidth
                      placeholder="Theo mã phiếu trả"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1, color: 'action.active' }} /> }}
                    />
                  </Box>
                  <Button variant="outlined" startIcon={<FileDownloadOutlinedIcon />} sx={{ textTransform: 'none' }} onClick={handleExportList}>
                    Xuất file
                  </Button>
                </Box>
              </Paper>

              <Paper sx={{ p: 0, flex: 1 }}>
                {loadError && <Typography color="error" sx={{ p: 2 }}>{loadError}</Typography>}
                {loading ? (
                  <Typography color="text.secondary" sx={{ p: 2 }}>Đang tải...</Typography>
                ) : (
                  <TableContainer sx={{ maxHeight: '62vh' }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell padding="checkbox"><Checkbox size="small" disabled /></TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Mã trả hàng</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Thời gian</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Mã KH</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Khách hàng</TableCell>
                          <TableCell sx={{ fontWeight: 600 }} align="right">Tổng tiền trả hàng</TableCell>
                          <TableCell sx={{ fontWeight: 600 }} align="right">Tổng tiền mua hàng</TableCell>
                          <TableCell sx={{ fontWeight: 600 }} align="right">Cần trả khách</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Đã trả khách</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {returns.map((row) => {
                          const isExpanded = expandedId === row._id;
                          const refund = Math.max(0, (Number(row.totalReturnAmount) || 0) - (Number(row.totalExchangeAmount) || 0));
                          return (
                            <React.Fragment key={row._id}>
                              <TableRow hover sx={{ cursor: 'pointer', bgcolor: isExpanded ? 'action.selected' : undefined }} onClick={() => openDetail(row)}>
                                <TableCell padding="checkbox"><Checkbox size="small" /></TableCell>
                                <TableCell>{displayReturnCode(row.returnCode)}</TableCell>
                                <TableCell>{formatDateTime(row.createdAt)}</TableCell>
                                <TableCell>{row.customerCode || '—'}</TableCell>
                                <TableCell>{row.customerName || row.customerPhone || 'Khách lẻ'}</TableCell>
                                <TableCell align="right">{formatMoney(row.totalReturnAmount)}</TableCell>
                                <TableCell align="right">{formatMoney(row.totalExchangeAmount)}</TableCell>
                                <TableCell align="right">{formatMoney(refund)}</TableCell>
                                <TableCell>{row.status === 'cancelled' ? 'Đã hủy' : 'Đã trả'}</TableCell>
                              </TableRow>
                              {isExpanded && detail && (
                                <TableRow>
                                  <TableCell colSpan={9} sx={{ p: 0, bgcolor: 'grey.50' }}>
                                    <Box sx={{ p: 2 }}>
                                      {detail.error ? (
                                        <Typography color="error">{detail.error}</Typography>
                                      ) : (
                                        <>
                                          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 2, mb: 2 }}>
                                            <Box><Typography variant="caption" color="text.secondary">Người tạo</Typography><Typography variant="body2">{detail.return?.cashierName || '—'}</Typography></Box>
                                            <Box><Typography variant="caption" color="text.secondary">Người nhận trả</Typography><Typography variant="body2">{detail.return?.receiverName || detail.return?.receivedBy || '—'}</Typography></Box>
                                            <Box><Typography variant="caption" color="text.secondary">Mã hóa đơn gốc</Typography><Typography variant="body2">{detail.return?.orderCode || '—'}</Typography></Box>
                                            <Box><Typography variant="caption" color="text.secondary">Mã hóa đơn mua lại</Typography><Typography variant="body2">{detail.return?.exchangeOrderCode || '—'}</Typography></Box>
                                          </Box>

                                          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>Sản phẩm trả hàng</Typography>
                                          <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                                            <Table size="small">
                                              <TableHead>
                                                <TableRow>
                                                  <TableCell sx={{ fontWeight: 600 }}>Mã hàng</TableCell>
                                                  <TableCell sx={{ fontWeight: 600 }}>Tên hàng</TableCell>
                                                  <TableCell sx={{ fontWeight: 600 }} align="right">Số lượng</TableCell>
                                                  <TableCell sx={{ fontWeight: 600 }} align="right">Đơn giá</TableCell>
                                                  <TableCell sx={{ fontWeight: 600 }} align="right">Thành tiền</TableCell>
                                                </TableRow>
                                              </TableHead>
                                              <TableBody>
                                                {(detail.returnItems || []).length === 0 ? (
                                                  <TableRow><TableCell colSpan={5} align="center">Không có</TableCell></TableRow>
                                                ) : (
                                                  (detail.returnItems || []).map((it, idx) => (
                                                    <TableRow key={`${it.productCode || 'ret'}-${idx}`}>
                                                      <TableCell>{resolveItemProductCode(it, productCodeMap)}</TableCell>
                                                      <TableCell>{it.productName || '—'}</TableCell>
                                                      <TableCell align="right">{it.qty ?? 0}</TableCell>
                                                      <TableCell align="right">{formatMoney(it.price)}</TableCell>
                                                      <TableCell align="right">{formatMoney(it.subtotal)}</TableCell>
                                                    </TableRow>
                                                  ))
                                                )}
                                              </TableBody>
                                            </Table>
                                          </TableContainer>

                                          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>Sản phẩm khách mua lại</Typography>
                                          <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                                            <Table size="small">
                                              <TableHead>
                                                <TableRow>
                                                  <TableCell sx={{ fontWeight: 600 }}>Mã hàng</TableCell>
                                                  <TableCell sx={{ fontWeight: 600 }}>Tên hàng</TableCell>
                                                  <TableCell sx={{ fontWeight: 600 }} align="right">Số lượng</TableCell>
                                                  <TableCell sx={{ fontWeight: 600 }} align="right">Đơn giá</TableCell>
                                                  <TableCell sx={{ fontWeight: 600 }} align="right">Thành tiền</TableCell>
                                                </TableRow>
                                              </TableHead>
                                              <TableBody>
                                                {(detail.exchangeItems || []).length === 0 ? (
                                                  <TableRow><TableCell colSpan={5} align="center">Không có</TableCell></TableRow>
                                                ) : (
                                                  (detail.exchangeItems || []).map((it, idx) => (
                                                    <TableRow key={`${it.productCode || 'buy'}-${idx}`}>
                                                      <TableCell>{resolveItemProductCode(it, productCodeMap)}</TableCell>
                                                      <TableCell>{it.productName || '—'}</TableCell>
                                                      <TableCell align="right">{it.qty ?? 0}</TableCell>
                                                      <TableCell align="right">{formatMoney(it.price)}</TableCell>
                                                      <TableCell align="right">{formatMoney(it.subtotal)}</TableCell>
                                                    </TableRow>
                                                  ))
                                                )}
                                              </TableBody>
                                            </Table>
                                          </TableContainer>

                                          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                                            <TextField
                                              size="small"
                                              placeholder="Ghi chú..."
                                              value={detailNote}
                                              onChange={(e) => setDetailNote(e.target.value)}
                                              multiline
                                              rows={2}
                                              sx={{ flex: '1 1 240px' }}
                                            />
                                            <Box sx={{ minWidth: 260 }}>
                                              <Typography variant="body2" color="text.secondary">Tổng tiền trả hàng: {formatMoney(detailSummary.totalReturnAmount)}</Typography>
                                              <Typography variant="body2" color="text.secondary">Tổng tiền mua hàng: {formatMoney(detailSummary.totalExchangeAmount)}</Typography>
                                              <Typography variant="body2" color="text.secondary">Số tiền cần trả khách: {formatMoney(detailSummary.refundToCustomer)}</Typography>
                                              <Typography variant="body2" sx={{ fontWeight: 600 }}>Khách cần trả thêm: {formatMoney(detailSummary.customerPayMore)}</Typography>
                                            </Box>
                                          </Box>
                                          {actionError && <Typography color="error" sx={{ mt: 1 }}>{actionError}</Typography>}

                                          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                                            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                              <Button size="small" startIcon={<DeleteOutlinedIcon />} onClick={handleCancel} disabled={saveLoading || detail.return?.status === 'cancelled'} sx={{ textTransform: 'none' }}>Hủy</Button>
                                              <Button size="small" startIcon={<ContentCopyOutlinedIcon />} onClick={handleCopy} sx={{ textTransform: 'none' }}>Sao chép</Button>
                                              <Button size="small" startIcon={<FileDownloadOutlinedIcon />} onClick={handleExportDetail} sx={{ textTransform: 'none' }}>Xuất file</Button>
                                            </Box>
                                            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                              <Button size="small" startIcon={<SaveOutlinedIcon />} onClick={handleSave} disabled={saveLoading} sx={{ textTransform: 'none' }}>Lưu</Button>
                                              <Button size="small" startIcon={<PrintOutlinedIcon />} onClick={handlePrint} sx={{ textTransform: 'none' }}>In hóa đơn trả</Button>
                                            </Box>
                                          </Box>
                                        </>
                                      )}
                                    </Box>
                                  </TableCell>
                                </TableRow>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
                {!loading && returns.length === 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                    Chưa có hóa đơn đổi trả.
                  </Typography>
                )}
                {!loading && total > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2, py: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="caption" color="text.secondary">
                      {(page - 1) * limit + 1} - {Math.min(page * limit, total)} / {total} hóa đơn trả
                    </Typography>
                    <Pagination size="small" page={page} count={Math.max(1, Math.ceil(total / limit))} onChange={(_e, value) => setPage(value)} />
                  </Box>
                )}
              </Paper>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Layout>
  );
}
