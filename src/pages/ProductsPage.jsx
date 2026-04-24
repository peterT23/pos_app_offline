import { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Container,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
} from '@mui/material';

function formatPrice(v) {
  if (v == null) return '—';
  return new Intl.NumberFormat('vi-VN').format(v) + ' đ';
}

/**
 * Danh sách hàng hóa lưu trong SQLite (Electron main).
 */
export default function ProductsPage() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!window.posOffline?.listSqliteProducts) {
          if (!cancelled) setErr('Chỉ có trong app Electron (SQLite).');
          return;
        }
        const data = await window.posOffline.listSqliteProducts();
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!cancelled) setErr(String(e?.message || e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>
        Hàng hóa (SQLite)
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Dữ liệu nằm trong file <code>pos_offline.db</code> trên máy — xem đường dẫn tại mục Cài đặt.
      </Typography>

      {err && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {err}
        </Alert>
      )}

      {rows === null && !err && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CircularProgress size={22} />
          <Typography variant="body2">Đang tải…</Typography>
        </Box>
      )}

      {rows && rows.length === 0 && (
        <Typography color="text.secondary">Chưa có sản phẩm trong SQLite.</Typography>
      )}

      {rows && rows.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Mã SKU</TableCell>
                <TableCell>Tên</TableCell>
                <TableCell>Barcode</TableCell>
                <TableCell align="right">Tồn</TableCell>
                <TableCell>ĐVT</TableCell>
                <TableCell align="right">Giá</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.sku || '—'}</TableCell>
                  <TableCell>{p.name}</TableCell>
                  <TableCell>{p.barcode || '—'}</TableCell>
                  <TableCell align="right">{p.stock ?? '—'}</TableCell>
                  <TableCell>{p.unit || '—'}</TableCell>
                  <TableCell align="right">{formatPrice(p.price)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Container>
  );
}
