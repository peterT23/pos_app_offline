import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Switch,
  Snackbar,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import { useLocation } from 'react-router-dom';
import Layout from '../components/Layout';
import { apiRequest } from '../utils/apiClient';

const DEFAULT_LOYALTY_SETTINGS = {
  enabled: true,
  earningMethod: 'order',
  earningAmount: 100000,
  earningPoints: 1,
  allowPointPayment: true,
  redeemPoints: 1,
  redeemAmount: 1000,
  minOrdersBeforeRedeem: 1,
  allowEarnOnDiscountedItem: true,
  allowEarnOnDiscountedOrder: false,
  allowEarnWhenPayingByPoints: false,
  allowEarnWhenPayingByVoucher: false,
  enablePromotion: false,
  enableVoucher: false,
  enableCoupon: false,
};

const MANAGE_SECTIONS = [
  { key: 'goods', label: 'Hàng hóa', icon: <Inventory2OutlinedIcon fontSize="small" /> },
  { key: 'purchase', label: 'Mua hàng', icon: <ShoppingCartOutlinedIcon fontSize="small" /> },
  { key: 'orders', label: 'Đơn hàng', icon: <ShoppingCartOutlinedIcon fontSize="small" /> },
  { key: 'customers', label: 'Khách hàng', icon: <GroupOutlinedIcon fontSize="small" /> },
  { key: 'cashbook', label: 'Sổ quỹ', icon: <AccountBalanceWalletOutlinedIcon fontSize="small" /> },
];

const UTIL_SECTIONS = [
  { key: 'shipping', label: 'Giao hàng', icon: <LocalShippingOutlinedIcon fontSize="small" /> },
  { key: 'payment', label: 'Thanh toán', icon: <AccountBalanceWalletOutlinedIcon fontSize="small" /> },
];

const STORE_SECTIONS = [{ key: 'store-info', label: 'Thông tin cửa hàng', icon: <StorefrontOutlinedIcon fontSize="small" /> }];
const DATA_SECTIONS = [
  { key: 'closing', label: 'Khóa sổ', icon: <LockOutlinedIcon fontSize="small" /> },
  { key: 'audit-log', label: 'Lịch sử thao tác', icon: <HistoryOutlinedIcon fontSize="small" /> },
  { key: 'data-history', label: 'Xóa dữ liệu gian hàng', icon: <DeleteOutlineOutlinedIcon fontSize="small" /> },
];

export default function AdminSettingsPage() {
  const location = useLocation();
  const [activeSection, setActiveSection] = useState('customers');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pointDialogOpen, setPointDialogOpen] = useState(false);
  const [pointDialogTab, setPointDialogTab] = useState('info');
  const [loyaltySettings, setLoyaltySettings] = useState(DEFAULT_LOYALTY_SETTINGS);
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false);
  const [cleanupDialogTab, setCleanupDialogTab] = useState('schedule');
  const [cleanupScopeDialogOpen, setCleanupScopeDialogOpen] = useState(false);
  const [cleanupConfirmDialogOpen, setCleanupConfirmDialogOpen] = useState(false);
  const [cleanupPeriodDialogOpen, setCleanupPeriodDialogOpen] = useState(false);
  const [cleanupMode, setCleanupMode] = useState('full');
  const [cleanupConfirmChecked, setCleanupConfirmChecked] = useState(false);
  const [cleanupRunning, setCleanupRunning] = useState(false);
  const [cleanupHistory, setCleanupHistory] = useState([]);
  const [cleanupSchedules, setCleanupSchedules] = useState([]);
  const [cleanupNotice, setCleanupNotice] = useState({ open: false, type: 'success', message: '' });
  const [deleteHistoryDialogOpen, setDeleteHistoryDialogOpen] = useState(false);
  const [deleteHistoryTarget, setDeleteHistoryTarget] = useState(null);
  const [cleanupForm, setCleanupForm] = useState({
    periodType: 'day',
    date: '',
    month: '',
    quarter: 1,
    year: new Date().getFullYear(),
    lunarYear: new Date().getFullYear(),
    runMode: 'now',
    runAt: '',
  });

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/api/settings/customer-loyalty');
      setLoyaltySettings({ ...DEFAULT_LOYALTY_SETTINGS, ...(res?.settings || {}) });
    } catch {
      setLoyaltySettings(DEFAULT_LOYALTY_SETTINGS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    const section = String(params.get('section') || params.get('SettingType') || '').toLowerCase();
    if (section === 'customers' || section === 'customer') {
      setActiveSection('customers');
    } else if (section.includes('data')) {
      setActiveSection('data-history');
    }
  }, [location.search]);

  const loadCleanupHistory = useCallback(async () => {
    try {
      const res = await apiRequest('/api/data-cleanup/history');
      setCleanupHistory(Array.isArray(res?.items) ? res.items : []);
    } catch {
      setCleanupHistory([]);
    }
  }, []);

  const loadCleanupSchedules = useCallback(async () => {
    try {
      const res = await apiRequest('/api/data-cleanup/schedules');
      setCleanupSchedules(Array.isArray(res?.items) ? res.items : []);
    } catch {
      setCleanupSchedules([]);
    }
  }, []);

  const saveSettings = useCallback(
    async (next) => {
      setSaving(true);
      try {
        const res = await apiRequest('/api/settings/customer-loyalty', {
          method: 'POST',
          body: JSON.stringify(next),
        });
        setLoyaltySettings({ ...DEFAULT_LOYALTY_SETTINGS, ...(res?.settings || next) });
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const earnSummary = useMemo(() => {
    const amount = Number(loyaltySettings.earningAmount) || 100000;
    const points = Number(loyaltySettings.earningPoints) || 1;
    return `Tích điểm theo hóa đơn: Mua ${amount.toLocaleString('vi-VN')} tích ${points} điểm`;
  }, [loyaltySettings.earningAmount, loyaltySettings.earningPoints]);

  const SidebarItem = ({ item, selected = false, onClick }) => (
    <Button
      fullWidth
      startIcon={item.icon}
      onClick={onClick}
      sx={{
        justifyContent: 'flex-start',
        textTransform: 'none',
        color: selected ? 'primary.main' : 'text.primary',
        bgcolor: selected ? '#eef4ff' : 'transparent',
        borderRadius: 1.5,
        px: 1.5,
        py: 1,
        mb: 0.5,
        '&:hover': { bgcolor: selected ? '#e4efff' : '#f5f7fb' },
      }}
    >
      {item.label}
    </Button>
  );

  return (
    <Layout maxWidth={false}>
      <Box sx={{ display: 'flex', gap: 2 }}>
        <Paper variant="outlined" sx={{ width: 250, p: 1.5, flexShrink: 0, height: 'fit-content' }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>
            Thiết lập
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
            Quản lý
          </Typography>
          <Box sx={{ mt: 0.5, mb: 1 }}>
            {MANAGE_SECTIONS.map((item) => (
              <SidebarItem
                key={item.key}
                item={item}
                selected={activeSection === item.key}
                onClick={() => setActiveSection(item.key)}
              />
            ))}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
            Tiện ích
          </Typography>
          <Box sx={{ mt: 0.5, mb: 1 }}>
            {UTIL_SECTIONS.map((item) => (
              <SidebarItem key={item.key} item={item} onClick={() => setActiveSection(item.key)} />
            ))}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
            Cửa hàng
          </Typography>
          <Box sx={{ mt: 0.5 }}>
            {STORE_SECTIONS.map((item) => (
              <SidebarItem key={item.key} item={item} onClick={() => setActiveSection(item.key)} />
            ))}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ px: 1, mt: 1, display: 'block' }}>
            Dữ liệu
          </Typography>
          <Box sx={{ mt: 0.5 }}>
            {DATA_SECTIONS.map((item) => (
              <SidebarItem
                key={item.key}
                item={item}
                selected={activeSection === item.key}
                onClick={() => setActiveSection(item.key)}
              />
            ))}
          </Box>
        </Paper>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          {activeSection === 'data-history' ? (
            <Paper variant="outlined" sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
                Xóa dữ liệu gian hàng
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Đặt lịch xóa dữ liệu cũ theo thời gian cho 2 chế độ: xóa toàn bộ hoặc xóa giao dịch và thu chi.
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}>
                <Box>
                  <Typography sx={{ fontWeight: 600 }}>Xóa dữ liệu gian hàng</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Đặt lịch xóa dữ liệu cũ và nhận thông báo khi hoàn tất xóa.
                  </Typography>
                </Box>
                <Button
                  variant="outlined"
                  onClick={async () => {
                    await loadCleanupHistory();
                    await loadCleanupSchedules();
                    setCleanupDialogTab('schedule');
                    setCleanupDialogOpen(true);
                  }}
                >
                  Xem chi tiết
                </Button>
              </Box>
            </Paper>
          ) : activeSection !== 'customers' ? (
            <Paper variant="outlined" sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
                Đang phát triển
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Mục này sẽ được mở rộng ở bước tiếp theo.
              </Typography>
            </Paper>
          ) : (
            <Box sx={{ display: 'grid', gap: 2 }}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                  Chăm sóc khách hàng
                </Typography>

                <Box sx={{ display: 'grid', gap: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography sx={{ fontWeight: 600 }}>Tích điểm</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {earnSummary}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Button
                        size="small"
                        sx={{ textTransform: 'none' }}
                        onClick={() => {
                          setPointDialogTab('info');
                          setPointDialogOpen(true);
                        }}
                      >
                        Xem chi tiết
                      </Button>
                      <Switch
                        checked={Boolean(loyaltySettings.enabled)}
                        onChange={(e) =>
                          setLoyaltySettings((prev) => ({
                            ...prev,
                            enabled: e.target.checked,
                          }))
                        }
                      />
                    </Box>
                  </Box>

                  <Divider />

                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography sx={{ fontWeight: 600 }}>Khuyến mại</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Cho phép quản lý và áp dụng khuyến mại theo hàng hóa hoặc giá trị đơn hàng.
                      </Typography>
                    </Box>
                    <Switch
                      checked={Boolean(loyaltySettings.enablePromotion)}
                      onChange={(e) =>
                        setLoyaltySettings((prev) => ({
                          ...prev,
                          enablePromotion: e.target.checked,
                        }))
                      }
                    />
                  </Box>

                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography sx={{ fontWeight: 600 }}>Voucher</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Cho phép quản lý, phát hành và áp dụng phiếu mua hàng.
                      </Typography>
                    </Box>
                    <Switch
                      checked={Boolean(loyaltySettings.enableVoucher)}
                      onChange={(e) =>
                        setLoyaltySettings((prev) => ({
                          ...prev,
                          enableVoucher: e.target.checked,
                        }))
                      }
                    />
                  </Box>

                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography sx={{ fontWeight: 600 }}>Coupon</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Cho phép quản lý, phát hành và áp dụng mã giảm giá.
                      </Typography>
                    </Box>
                    <Switch
                      checked={Boolean(loyaltySettings.enableCoupon)}
                      onChange={(e) =>
                        setLoyaltySettings((prev) => ({
                          ...prev,
                          enableCoupon: e.target.checked,
                        }))
                      }
                    />
                  </Box>
                </Box>
              </Paper>

              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  variant="contained"
                  onClick={() => saveSettings(loyaltySettings)}
                  disabled={saving || loading}
                  sx={{ textTransform: 'none' }}
                >
                  Lưu thiết lập
                </Button>
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      <Dialog open={pointDialogOpen} onClose={() => setPointDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Tích điểm</DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <Tabs
            value={pointDialogTab}
            onChange={(_e, value) => setPointDialogTab(value)}
            sx={{ px: 3, borderBottom: '1px solid', borderColor: 'divider' }}
          >
            <Tab value="info" label="Thông tin" sx={{ textTransform: 'none' }} />
            <Tab value="scope" label="Phạm vi áp dụng" sx={{ textTransform: 'none' }} />
          </Tabs>

          <Box sx={{ p: 3, display: 'grid', gap: 2 }}>
            {pointDialogTab === 'scope' ? (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Phạm vi áp dụng sẽ được mở rộng theo từng nhóm khách hàng và từng cửa hàng ở bước tiếp theo.
                </Typography>
              </Paper>
            ) : (
              <>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography sx={{ fontWeight: 700, mb: 1 }}>Phương pháp tích điểm</Typography>
                  <TextField
                    select
                    size="small"
                    fullWidth
                    value={loyaltySettings.earningMethod}
                    onChange={(e) =>
                      setLoyaltySettings((prev) => ({
                        ...prev,
                        earningMethod: e.target.value,
                      }))
                    }
                  >
                    <MenuItem value="order">Hóa đơn</MenuItem>
                    <MenuItem value="product">Hàng hóa</MenuItem>
                  </TextField>
                </Paper>

                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography sx={{ fontWeight: 700, mb: 1 }}>Tỷ lệ quy đổi điểm</Typography>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, md: 6 }}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Tổng tiền hàng (VND)"
                        type="number"
                        value={loyaltySettings.earningAmount}
                        onChange={(e) =>
                          setLoyaltySettings((prev) => ({
                            ...prev,
                            earningAmount: Math.max(1, Number(e.target.value) || 0),
                          }))
                        }
                      />
                    </Grid>
                    <Grid size={{ xs: 12, md: 6 }}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Điểm nhận được"
                        type="number"
                        value={loyaltySettings.earningPoints}
                        onChange={(e) =>
                          setLoyaltySettings((prev) => ({
                            ...prev,
                            earningPoints: Math.max(1, Number(e.target.value) || 0),
                          }))
                        }
                      />
                    </Grid>
                  </Grid>
                </Paper>

                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <Typography sx={{ fontWeight: 700 }}>Cho phép thanh toán bằng điểm</Typography>
                    <Switch
                      checked={Boolean(loyaltySettings.allowPointPayment)}
                      onChange={(e) =>
                        setLoyaltySettings((prev) => ({
                          ...prev,
                          allowPointPayment: e.target.checked,
                        }))
                      }
                    />
                  </Box>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, md: 4 }}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Điểm"
                        type="number"
                        value={loyaltySettings.redeemPoints}
                        disabled={!loyaltySettings.allowPointPayment}
                        onChange={(e) =>
                          setLoyaltySettings((prev) => ({
                            ...prev,
                            redeemPoints: Math.max(1, Number(e.target.value) || 0),
                          }))
                        }
                      />
                    </Grid>
                    <Grid size={{ xs: 12, md: 4 }}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Tiền thanh toán (VND)"
                        type="number"
                        value={loyaltySettings.redeemAmount}
                        disabled={!loyaltySettings.allowPointPayment}
                        onChange={(e) =>
                          setLoyaltySettings((prev) => ({
                            ...prev,
                            redeemAmount: Math.max(1, Number(e.target.value) || 0),
                          }))
                        }
                      />
                    </Grid>
                    <Grid size={{ xs: 12, md: 4 }}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Áp dụng sau (lần mua)"
                        type="number"
                        value={loyaltySettings.minOrdersBeforeRedeem}
                        disabled={!loyaltySettings.allowPointPayment}
                        onChange={(e) =>
                          setLoyaltySettings((prev) => ({
                            ...prev,
                            minOrdersBeforeRedeem: Math.max(0, Number(e.target.value) || 0),
                          }))
                        }
                      />
                    </Grid>
                  </Grid>
                </Paper>

                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography sx={{ fontWeight: 700, mb: 1 }}>Giới hạn tích điểm</Typography>
                  <Box sx={{ display: 'grid', gap: 0.5 }}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={Boolean(loyaltySettings.allowEarnOnDiscountedItem)}
                          onChange={(e) =>
                            setLoyaltySettings((prev) => ({
                              ...prev,
                              allowEarnOnDiscountedItem: e.target.checked,
                            }))
                          }
                        />
                      }
                      label="Tích điểm cho hàng giảm giá"
                    />
                    <FormControlLabel
                      control={
                        <Switch
                          checked={Boolean(loyaltySettings.allowEarnOnDiscountedOrder)}
                          onChange={(e) =>
                            setLoyaltySettings((prev) => ({
                              ...prev,
                              allowEarnOnDiscountedOrder: e.target.checked,
                            }))
                          }
                        />
                      }
                      label="Tích điểm cho hóa đơn có giảm giá"
                    />
                    <FormControlLabel
                      control={
                        <Switch
                          checked={Boolean(loyaltySettings.allowEarnWhenPayingByPoints)}
                          onChange={(e) =>
                            setLoyaltySettings((prev) => ({
                              ...prev,
                              allowEarnWhenPayingByPoints: e.target.checked,
                            }))
                          }
                        />
                      }
                      label="Tích điểm khi thanh toán bằng điểm"
                    />
                    <FormControlLabel
                      control={
                        <Switch
                          checked={Boolean(loyaltySettings.allowEarnWhenPayingByVoucher)}
                          onChange={(e) =>
                            setLoyaltySettings((prev) => ({
                              ...prev,
                              allowEarnWhenPayingByVoucher: e.target.checked,
                            }))
                          }
                        />
                      }
                      label="Tích điểm khi thanh toán bằng voucher"
                    />
                  </Box>
                </Paper>
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setPointDialogOpen(false)} sx={{ textTransform: 'none' }}>
            Bỏ qua
          </Button>
          <Button
            variant="contained"
            onClick={async () => {
              await saveSettings(loyaltySettings);
              setPointDialogOpen(false);
            }}
            disabled={saving}
            sx={{ textTransform: 'none' }}
          >
            Lưu
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={cleanupDialogOpen} onClose={() => setCleanupDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Xóa dữ liệu gian hàng</DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <Tabs value={cleanupDialogTab} onChange={(_e, value) => setCleanupDialogTab(value)} sx={{ px: 3, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Tab value="schedule" label="Lịch xóa" sx={{ textTransform: 'none' }} />
            <Tab value="history" label="Lịch sử xóa" sx={{ textTransform: 'none' }} />
          </Tabs>
          <Box sx={{ p: 3 }}>
            {cleanupDialogTab === 'history' ? (
              <Box sx={{ display: 'grid', gap: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    color="error"
                    size="small"
                    variant="outlined"
                    onClick={() => {
                      setDeleteHistoryTarget({ id: '__all__' });
                      setDeleteHistoryDialogOpen(true);
                    }}
                  >
                    Xóa toàn bộ lịch sử
                  </Button>
                </Box>
                {cleanupHistory.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">Chưa có lịch sử xóa.</Typography>
                ) : (
                  cleanupHistory.map((item) => (
                    <Paper key={item.id} variant="outlined" sx={{ p: 1.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
                        <Box>
                          <Typography sx={{ fontWeight: 600 }}>
                            {item.mode === 'full' ? 'Xóa toàn bộ dữ liệu' : 'Xóa giao dịch và thu chi'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(item.executedAt).toLocaleString('vi-VN')}
                          </Typography>
                        </Box>
                        <IconButton
                          size="small"
                          onClick={() => {
                            setDeleteHistoryTarget(item);
                            setDeleteHistoryDialogOpen(true);
                          }}
                          sx={{ mt: -0.5 }}
                        >
                          <CloseOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Box>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Đơn hàng: {item.summary?.removedOrders || 0} · Trả hàng: {item.summary?.removedReturns || 0} · Hàng hóa: {item.summary?.removedProducts || 0} · Khách hàng: {item.summary?.removedCustomers || 0}
                      </Typography>
                    </Paper>
                  ))
                )}
              </Box>
            ) : (
              <Box sx={{ display: 'grid', gap: 1.5 }}>
                <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
                  <Typography variant="h6" sx={{ mb: 0.5 }}>Lịch xóa tự động</Typography>
                  <Button
                    variant="text"
                    onClick={() => {
                      setCleanupMode('full');
                      setCleanupScopeDialogOpen(true);
                    }}
                    sx={{ textTransform: 'none' }}
                  >
                    Thêm lịch
                  </Button>
                </Paper>
                {cleanupSchedules.filter((s) => s.status === 'pending').length === 0 ? (
                  <Typography variant="body2" color="text.secondary">Chưa có lịch sắp tới.</Typography>
                ) : (
                  cleanupSchedules
                    .filter((s) => s.status === 'pending')
                    .map((s) => (
                      <Paper key={s.id} variant="outlined" sx={{ p: 1.5 }}>
                        <Typography sx={{ fontWeight: 600 }}>
                          {s.payload?.mode === 'full' ? 'Xóa toàn bộ dữ liệu' : 'Xóa giao dịch và thu chi'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Chạy lúc: {new Date(s.runAt).toLocaleString('vi-VN')}
                        </Typography>
                      </Paper>
                    ))
                )}
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCleanupDialogOpen(false)}>Đóng</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={cleanupScopeDialogOpen} onClose={() => setCleanupScopeDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Chọn phạm vi dữ liệu</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gap: 2, pt: 1 }}>
            <Paper
              variant="outlined"
              onClick={() => setCleanupMode('full')}
              sx={{ p: 2, cursor: 'pointer', borderColor: cleanupMode === 'full' ? 'primary.main' : 'divider' }}
            >
              <Typography sx={{ fontWeight: 700 }}>Xóa toàn bộ dữ liệu</Typography>
              <Typography variant="body2" color="text.secondary">
                Xóa giao dịch, thu chi, hàng hóa, đối tác và dữ liệu liên quan theo kỳ đã chọn (trừ người dùng, chi nhánh).
              </Typography>
            </Paper>
            <Paper
              variant="outlined"
              onClick={() => setCleanupMode('transaction')}
              sx={{ p: 2, cursor: 'pointer', borderColor: cleanupMode === 'transaction' ? 'primary.main' : 'divider' }}
            >
              <Typography sx={{ fontWeight: 700 }}>Xóa giao dịch và thu chi</Typography>
              <Typography variant="body2" color="text.secondary">
                Chỉ xóa dữ liệu giao dịch/thu chi theo kỳ đã chọn, giữ lại danh mục hàng hóa và đối tác.
              </Typography>
            </Paper>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCleanupScopeDialogOpen(false)}>Quay lại</Button>
          <Button
            variant="contained"
            onClick={() => {
              setCleanupScopeDialogOpen(false);
              setCleanupConfirmChecked(false);
              setCleanupConfirmDialogOpen(true);
            }}
          >
            Tiếp tục
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={cleanupConfirmDialogOpen} onClose={() => setCleanupConfirmDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          {cleanupMode === 'full' ? 'Thông tin quan trọng: Xóa toàn bộ dữ liệu' : 'Thông tin quan trọng: Xóa giao dịch và thu chi'}
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 1.5 }}>
            {cleanupMode === 'full'
              ? 'Bạn sắp xóa dữ liệu vận hành theo phạm vi thời gian đã chọn. Dữ liệu bị xóa sẽ không thể phục hồi.'
              : 'Bạn sắp xóa giao dịch và thu chi theo phạm vi thời gian đã chọn. Hàng hóa, khách hàng, nhà cung cấp vẫn được giữ lại.'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Hãy chắc chắn đã sao lưu nếu cần trước khi tiếp tục.
          </Typography>
          <FormControlLabel
            control={<Switch checked={cleanupConfirmChecked} onChange={(e) => setCleanupConfirmChecked(e.target.checked)} />}
            label="Tôi đã đọc và hiểu rõ tác động của việc xóa dữ liệu."
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCleanupConfirmDialogOpen(false)}>Quay lại</Button>
          <Button
            variant="contained"
            disabled={!cleanupConfirmChecked}
            onClick={() => {
              setCleanupConfirmDialogOpen(false);
              setCleanupPeriodDialogOpen(true);
            }}
          >
            Tiếp tục
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={cleanupPeriodDialogOpen} onClose={() => !cleanupRunning && setCleanupPeriodDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Chọn thời gian xóa dữ liệu</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gap: 2, pt: 1 }}>
            <TextField
              select
              size="small"
              label="Kiểu thời gian"
              value={cleanupForm.periodType}
              onChange={(e) => setCleanupForm((prev) => ({ ...prev, periodType: e.target.value }))}
            >
              <MenuItem value="day">Theo ngày</MenuItem>
              <MenuItem value="month">Theo tháng</MenuItem>
              <MenuItem value="quarter">Theo quý</MenuItem>
              <MenuItem value="year">Theo năm dương lịch</MenuItem>
              <MenuItem value="lunarYear">Theo năm âm lịch</MenuItem>
            </TextField>

            {cleanupForm.periodType === 'day' && (
              <TextField
                size="small"
                type="date"
                label="Ngày cần xóa"
                InputLabelProps={{ shrink: true }}
                value={cleanupForm.date}
                onChange={(e) => setCleanupForm((prev) => ({ ...prev, date: e.target.value }))}
              />
            )}
            {cleanupForm.periodType === 'month' && (
              <TextField
                size="small"
                type="month"
                label="Tháng cần xóa"
                InputLabelProps={{ shrink: true }}
                value={cleanupForm.month}
                onChange={(e) => setCleanupForm((prev) => ({ ...prev, month: e.target.value }))}
              />
            )}
            {cleanupForm.periodType === 'quarter' && (
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <TextField
                  select
                  size="small"
                  label="Quý"
                  value={cleanupForm.quarter}
                  onChange={(e) => setCleanupForm((prev) => ({ ...prev, quarter: Number(e.target.value) }))}
                >
                  <MenuItem value={1}>Quý 1</MenuItem>
                  <MenuItem value={2}>Quý 2</MenuItem>
                  <MenuItem value={3}>Quý 3</MenuItem>
                  <MenuItem value={4}>Quý 4</MenuItem>
                </TextField>
                <TextField
                  size="small"
                  type="number"
                  label="Năm"
                  value={cleanupForm.year}
                  onChange={(e) => setCleanupForm((prev) => ({ ...prev, year: Number(e.target.value) || new Date().getFullYear() }))}
                />
              </Box>
            )}
            {cleanupForm.periodType === 'year' && (
              <TextField
                size="small"
                type="number"
                label="Năm dương lịch"
                value={cleanupForm.year}
                onChange={(e) => setCleanupForm((prev) => ({ ...prev, year: Number(e.target.value) || new Date().getFullYear() }))}
              />
            )}
            {cleanupForm.periodType === 'lunarYear' && (
              <TextField
                size="small"
                type="number"
                label="Năm âm lịch"
                value={cleanupForm.lunarYear}
                onChange={(e) => setCleanupForm((prev) => ({ ...prev, lunarYear: Number(e.target.value) || new Date().getFullYear() }))}
              />
            )}
            <TextField
              select
              size="small"
              label="Hình thức chạy"
              value={cleanupForm.runMode}
              onChange={(e) => setCleanupForm((prev) => ({ ...prev, runMode: e.target.value }))}
            >
              <MenuItem value="now">Tiến hành ngay</MenuItem>
              <MenuItem value="schedule">Đặt lịch tự động</MenuItem>
            </TextField>
            {cleanupForm.runMode === 'schedule' && (
              <TextField
                size="small"
                type="datetime-local"
                label="Thời gian chạy"
                InputLabelProps={{ shrink: true }}
                value={cleanupForm.runAt}
                onChange={(e) => setCleanupForm((prev) => ({ ...prev, runAt: e.target.value }))}
              />
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCleanupPeriodDialogOpen(false)} disabled={cleanupRunning}>Quay lại</Button>
          <Button
            variant="contained"
            disabled={cleanupRunning}
            onClick={async () => {
              setCleanupRunning(true);
              try {
                if (cleanupForm.runMode === 'schedule') {
                  await apiRequest('/api/data-cleanup/schedules', {
                    method: 'POST',
                    body: JSON.stringify({
                      mode: cleanupMode,
                      runAt: cleanupForm.runAt,
                      ...cleanupForm,
                    }),
                  });
                  setCleanupNotice({
                    open: true,
                    type: 'success',
                    message: 'Đã tạo lịch xóa dữ liệu thành công.',
                  });
                } else {
                  const res = await apiRequest('/api/data-cleanup/execute', {
                    method: 'POST',
                    body: JSON.stringify({
                      mode: cleanupMode,
                      ...cleanupForm,
                    }),
                  });
                  const summary = res?.summary || {};
                  setCleanupNotice({
                    open: true,
                    type: 'success',
                    message: `Xóa thành công. Đơn hàng: ${summary.removedOrders || 0}, Trả hàng: ${summary.removedReturns || 0}, Hàng hóa: ${summary.removedProducts || 0}, Khách hàng: ${summary.removedCustomers || 0}.`,
                  });
                }
                await loadCleanupHistory();
                await loadCleanupSchedules();
                setCleanupDialogTab('history');
                setCleanupPeriodDialogOpen(false);
                setCleanupDialogOpen(true);
              } catch (err) {
                setCleanupNotice({
                  open: true,
                  type: 'error',
                  message: err?.message || 'Không thể thực hiện lịch xóa dữ liệu.',
                });
              } finally {
                setCleanupRunning(false);
              }
            }}
          >
            {cleanupRunning ? 'Đang tiến hành...' : cleanupForm.runMode === 'schedule' ? 'Lưu lịch' : 'Tiến hành'}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={deleteHistoryDialogOpen} onClose={() => setDeleteHistoryDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Xóa lịch sử xóa dữ liệu</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {deleteHistoryTarget?.id === '__all__'
              ? 'Bạn có chắc muốn xóa toàn bộ lịch sử xóa dữ liệu không?'
              : 'Bạn có chắc muốn xóa bản ghi lịch sử này không?'}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteHistoryDialogOpen(false)}>Hủy</Button>
          <Button
            color="error"
            variant="contained"
            onClick={async () => {
              if (!deleteHistoryTarget?.id) return;
              try {
                if (deleteHistoryTarget.id === '__all__') {
                  await apiRequest('/api/data-cleanup/history', { method: 'DELETE' });
                  setCleanupHistory([]);
                } else {
                  await apiRequest(`/api/data-cleanup/history/${encodeURIComponent(deleteHistoryTarget.id)}`, {
                    method: 'DELETE',
                  });
                  setCleanupHistory((prev) => prev.filter((item) => String(item.id) !== String(deleteHistoryTarget.id)));
                }
                await loadCleanupHistory();
                setCleanupNotice({
                  open: true,
                  type: 'success',
                  message: deleteHistoryTarget.id === '__all__'
                    ? 'Đã xóa toàn bộ lịch sử xóa dữ liệu.'
                    : 'Đã xóa lịch sử xóa dữ liệu.',
                });
              } catch (err) {
                setCleanupNotice({
                  open: true,
                  type: 'error',
                  message: err?.message || 'Không thể xóa lịch sử.',
                });
              } finally {
                setDeleteHistoryDialogOpen(false);
                setDeleteHistoryTarget(null);
              }
            }}
          >
            Xóa
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={cleanupNotice.open}
        autoHideDuration={4500}
        onClose={() => setCleanupNotice((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          severity={cleanupNotice.type}
          onClose={() => setCleanupNotice((prev) => ({ ...prev, open: false }))}
          variant="filled"
        >
          {cleanupNotice.message}
        </Alert>
      </Snackbar>
    </Layout>
  );
}
