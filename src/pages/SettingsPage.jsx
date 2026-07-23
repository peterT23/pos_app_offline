import { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Container,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
  Snackbar,
  Alert,
} from '@mui/material';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import LaunchIcon from '@mui/icons-material/Launch';

export default function SettingsPage() {
  const [paths, setPaths] = useState(null);
  const [users, setUsers] = useState([]);
  const [copySnack, setCopySnack] = useState(false);
  const [openError, setOpenError] = useState('');

  useEffect(() => {
    (async () => {
      if (!window.posOffline?.getDbPath) return;
      const p = await window.posOffline.getDbPath();
      setPaths(p);
      const u = await window.posOffline.listSqliteUsers?.();
      setUsers(Array.isArray(u) ? u : []);
    })();
  }, []);

  const reveal = () => {
    window.posOffline?.revealDbFile?.();
  };

  const copyDbPath = async () => {
    const p = paths?.path;
    if (!p) return;
    try {
      await navigator.clipboard.writeText(p);
      setCopySnack(true);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = p;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopySnack(true);
      } catch {
        // ignore
      }
    }
  };

  const openDbBrowser = async () => {
    setOpenError('');
    if (!window.posOffline?.openInDbBrowser) {
      setOpenError('Phiên bản app hiện tại chưa hỗ trợ mở trực tiếp.');
      return;
    }
    const result = await window.posOffline.openInDbBrowser();
    if (!result?.ok) {
      setOpenError(result?.error || 'Không mở được DB Browser.');
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>
        Cài đặt
      </Typography>

      <Paper sx={{ p: 2, mt: 2 }}>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
          SQLite — xem và chỉnh sửa ngoài app
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          File cơ sở dữ liệu nằm trong thư mục dữ liệu của Electron (userData). Trên macOS thường là{' '}
          <code>~/Library/Application Support/pos_offline/pos_offline.db</code>. Trên Windows:{' '}
          <code>%APPDATA%\pos_offline\pos_offline.db</code>. Trên Linux:{' '}
          <code>~/.config/pos_offline/pos_offline.db</code>. Dùng{' '}
          <a href="https://sqlitebrowser.org/" target="_blank" rel="noreferrer">
            DB Browser for SQLite
          </a>{' '}
          hoặc lệnh <code>sqlite3</code> để mở file.
        </Typography>
        {paths?.path && (
          <Typography
            variant="body2"
            sx={{ fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all', mb: 1 }}
          >
            {paths.path}
          </Typography>
        )}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<FolderOpenIcon />}
            onClick={reveal}
            disabled={!window.posOffline?.revealDbFile}
          >
            Hiện file trong Finder / Explorer
          </Button>
          <Button
            variant="outlined"
            startIcon={<ContentCopyIcon />}
            onClick={copyDbPath}
            disabled={!paths?.path}
          >
            Sao chép đường dẫn
          </Button>
          <Button
            variant="contained"
            startIcon={<LaunchIcon />}
            onClick={openDbBrowser}
            disabled={!paths?.path}
          >
            Mở bằng DB Browser for SQLite
          </Button>
        </Box>
        {openError ? (
          <Typography variant="body2" color="error" sx={{ mt: 1 }}>
            {openError}
          </Typography>
        ) : null}
      </Paper>

      <Snackbar open={copySnack} autoHideDuration={2500} onClose={() => setCopySnack(false)}>
        <Alert severity="success" onClose={() => setCopySnack(false)} sx={{ width: '100%' }}>
          Đã sao chép đường dẫn file DB
        </Alert>
      </Snackbar>

      <Paper sx={{ p: 2, mt: 3 }}>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
          Tài khoản mẫu trong SQLite
        </Typography>
        <Typography variant="body2" paragraph>
          Mật khẩu được băm (scrypt) trong DB. Trên app Electron, đăng nhập màn hình Đăng nhập dùng đúng
          các tài khoản này (không cần pos-backend).
        </Typography>
        <Box component="ul" sx={{ pl: 2, m: 0 }}>
          <li>
            <strong>Email:</strong> owner@demo.local
          </li>
          <li>
            <strong>Mật khẩu:</strong> Demo@123456
          </li>
          <li>
            <strong>Vai trò:</strong> owner
          </li>
        </Box>
        <Divider sx={{ my: 2 }} />
        <Typography variant="subtitle2" gutterBottom>
          Bảng users (ẩn password_hash)
        </Typography>
        {users.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Chưa có user (chạy lại app sau khi cập nhật Electron).
          </Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Tên</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>SĐT</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>{u.id}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>{u.name}</TableCell>
                    <TableCell>{u.role}</TableCell>
                    <TableCell>{u.phone || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Container>
  );
}
