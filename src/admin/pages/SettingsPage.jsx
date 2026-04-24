import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Grid,
  MenuItem,
  Paper,
  Switch,
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

export default function AdminSettingsPage() {
  const location = useLocation();
  const [activeSection, setActiveSection] = useState('customers');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pointDialogOpen, setPointDialogOpen] = useState(false);
  const [pointDialogTab, setPointDialogTab] = useState('info');
  const [loyaltySettings, setLoyaltySettings] = useState(DEFAULT_LOYALTY_SETTINGS);

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
    }
  }, [location.search]);

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
        </Paper>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          {activeSection !== 'customers' ? (
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
    </Layout>
  );
}
