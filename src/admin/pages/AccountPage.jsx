import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Tab,
  Tabs,
  TextField,
  Typography,
  Grid,
  Divider,
} from '@mui/material';
import Layout from '../components/Layout';
import { apiRequest } from '../utils/apiClient';
import { useAuth } from '../auth/AuthContext';

function Field({ label, value }) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={{ minHeight: 22 }}>{value || '—'}</Typography>
      <Divider sx={{ mt: 0.8 }} />
    </Box>
  );
}

export default function AccountPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState(0);
  const [profile, setProfile] = useState(null);
  const [history, setHistory] = useState([]);
  const [openEdit, setOpenEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    address: '',
    website: '',
  });

  const loadProfile = useCallback(async () => {
    const res = await apiRequest('/api/store-profile');
    const p = res?.profile || null;
    setProfile(p);
    setHistory(Array.isArray(res?.history) ? res.history : []);
    setForm({
      name: String(p?.name || ''),
      phone: String(p?.phone || ''),
      address: String(p?.address || ''),
      website: String(p?.website || ''),
    });
  }, []);

  useEffect(() => {
    loadProfile().catch(() => {});
  }, [loadProfile]);

  const canSave = useMemo(
    () => String(form.name || '').trim().length > 0 || String(form.phone || '').trim().length > 0 || String(form.address || '').trim().length > 0 || String(form.website || '').trim().length > 0,
    [form],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await apiRequest('/api/store-profile', {
        method: 'PATCH',
        body: JSON.stringify({
          storeId: profile?.storeId,
          name: form.name,
          phone: form.phone,
          address: form.address,
          website: form.website,
          updatedBy: user?.name || user?.username || 'owner',
        }),
      });
      setProfile(res?.profile || profile);
      setOpenEdit(false);
      await loadProfile();
    } finally {
      setSaving(false);
    }
  }, [form, loadProfile, profile, user?.name, user?.username]);

  return (
    <Layout maxWidth={false}>
      <Paper sx={{ p: 2.5, borderRadius: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
          <Tab label="Thông tin chung" />
          <Tab label="Lịch sử cập nhật" />
        </Tabs>

        {tab === 0 ? (
          <>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>Thông tin gian hàng</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Field label="Tên gian hàng" value={profile?.name} />
                <Field label="Điện thoại" value={profile?.phone} />
              </Grid>
              <Grid item xs={12} md={6}>
                <Field label="Địa chỉ" value={profile?.address} />
                <Field label="Website" value={profile?.website} />
              </Grid>
            </Grid>
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
              <Button
                variant="contained"
                onClick={() => setOpenEdit(true)}
                sx={{ textTransform: 'none' }}
              >
                Cập nhật
              </Button>
            </Box>
          </>
        ) : (
          <Box>
            {history.length === 0 ? (
              <Typography variant="body2" color="text.secondary">Chưa có lịch sử cập nhật.</Typography>
            ) : (
              history.map((h) => (
                <Paper key={h._id} variant="outlined" sx={{ p: 1.5, mb: 1.2 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {new Date(h.updatedAt).toLocaleString('vi-VN', { hour12: false })}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Người cập nhật: {h.updatedBy || 'owner'}
                  </Typography>
                </Paper>
              ))
            )}
          </Box>
        )}
      </Paper>

      <Dialog open={openEdit} onClose={() => !saving && setOpenEdit(false)} fullWidth maxWidth="sm">
        <DialogTitle>Cập nhật thông tin gian hàng</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 1.2, pt: '10px !important' }}>
          <TextField
            label="Tên cửa hàng"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            fullWidth
            size="small"
          />
          <TextField
            label="Số điện thoại"
            value={form.phone}
            onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
            fullWidth
            size="small"
          />
          <TextField
            label="Địa chỉ"
            value={form.address}
            onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
            fullWidth
            size="small"
          />
          <TextField
            label="Website"
            placeholder="https://..."
            value={form.website}
            onChange={(e) => setForm((prev) => ({ ...prev, website: e.target.value }))}
            fullWidth
            size="small"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenEdit(false)} disabled={saving} sx={{ textTransform: 'none' }}>Hủy</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving || !canSave} sx={{ textTransform: 'none' }}>
            {saving ? 'Đang lưu...' : 'Lưu'}
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
}
