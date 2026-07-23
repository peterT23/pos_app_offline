import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { useAuth } from '../auth/AuthContext';
import { isOfflineElectron, OFFLINE_SESSION_TOKEN } from '../constants/offlineSession';
import { getApiBaseUrl } from '../utils/apiClient';

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const API_BASE_URL = getApiBaseUrl();

  const redirectPath = useMemo(() => {
    if (location.state && location.state.from) {
      return location.state.from;
    }
    return '/pos';
  }, [location.state]);

  useEffect(() => {
    if (isAuthenticated) {
      navigate(redirectPath, { replace: true });
    }
  }, [isAuthenticated, navigate, redirectPath]);

  const loginWithTarget = async (clientApp) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-App': clientApp,
      },
      credentials: 'include',
      body: JSON.stringify({ identifier, password }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data.message || 'Đăng nhập thất bại';
      throw new Error(message);
    }
    return data;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!identifier || !password) {
      setError('Vui lòng nhập đầy đủ thông tin');
      return;
    }

    try {
      setLoading(true);
      setError('');

      if (isOfflineElectron()) {
        const res = await window.posOffline.authLogin(identifier.trim(), password);
        if (!res?.ok) {
          throw new Error(res?.message || 'Đăng nhập thất bại');
        }
        await login(OFFLINE_SESSION_TOKEN, res.user, null);
        navigate(redirectPath.startsWith('/') ? redirectPath : `/${redirectPath}`, { replace: true });
        return;
      }

      const data = await loginWithTarget('pos-app');
      await login(data.token, data.user, null);
      const pathOnly = redirectPath.startsWith('http')
        ? redirectPath
        : `${window.location.origin}${window.location.pathname}${window.location.search}#${redirectPath.startsWith('/') ? redirectPath : `/${redirectPath}`}`;
      window.location.href = pathOnly;
    } catch (err) {
      const msg = err?.message || '';
      setError(
        msg === 'Failed to fetch' || (err?.name === 'TypeError' && msg.includes('fetch'))
          ? 'Không kết nối được server. Kiểm tra backend hoặc dùng bản Electron (SQLite).'
          : (msg || 'Đăng nhập thất bại'),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
      <Paper sx={{ width: 380, p: 4 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
          Đăng nhập POS
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {isOfflineElectron()
            ? 'Bản offline: đăng nhập bằng tài khoản trong SQLite. Chủ cửa hàng có thể đăng ký nhiều tài khoản Owner.'
            : 'Dành cho chủ cửa hàng và nhân viên thu ngân.'}
        </Typography>
        {!isOfflineElectron() && (
          <Box
            sx={{
              mb: 3,
              px: 2,
              py: 1.5,
              borderRadius: 2,
              bgcolor: 'info.50',
              border: '1px solid',
              borderColor: 'info.200',
            }}
          >
            <Typography variant="body2" color="info.main">
              Chủ cửa hàng cũng có thể đăng nhập POS tại đây. Nhân viên dùng tài khoản do chủ cửa hàng cấp.
            </Typography>
          </Box>
        )}

        <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            label="Email hoặc số điện thoại"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            autoComplete="username"
            fullWidth
          />
          <TextField
            label="Mật khẩu"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            fullWidth
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowPassword((prev) => !prev)}
                    edge="end"
                    aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          {error && (
            <Typography variant="body2" color="error">
              {error}
            </Typography>
          )}
          <Button type="submit" variant="contained" size="large" disabled={loading}>
            {loading ? <CircularProgress size={22} color="inherit" /> : 'Đăng nhập'}
          </Button>
          {isOfflineElectron() && (
            <Button variant="text" onClick={() => navigate('/register')}>
              Đăng ký tài khoản Owner
            </Button>
          )}
        </Box>
      </Paper>
    </Box>
  );
}
