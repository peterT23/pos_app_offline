import React, { useState } from 'react';
import {
  AppBar,
  Box,
  Button,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Toolbar,
  Typography,
} from '@mui/material';
import ColorLensOutlinedIcon from '@mui/icons-material/ColorLensOutlined';
import LanguageOutlinedIcon from '@mui/icons-material/LanguageOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { apiRequest } from '../utils/apiClient';

export default function AdminHeader() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [anchorEls, setAnchorEls] = useState({});
  const settingsItems = [
    {
      key: 'goods',
      label: 'Hàng hóa',
      desc: 'Thông tin, Nhập hàng, Nhà cung cấp',
      icon: <Inventory2OutlinedIcon fontSize="small" />,
      path: '/admin/products',
    },
    {
      key: 'orders',
      label: 'Đơn hàng',
      desc: 'Đặt hàng, Bán hàng, Trả hàng',
      icon: <ShoppingCartOutlinedIcon fontSize="small" />,
      path: '/admin/invoices',
    },
    {
      key: 'customers',
      label: 'Khách hàng',
      desc: 'Tích điểm, Khuyến mại',
      icon: <GroupOutlinedIcon fontSize="small" />,
      path: '/admin/settings?section=customers',
    },
    {
      key: 'cashbook',
      label: 'Sổ quỹ',
      desc: 'Tài khoản ngân hàng, Ví điện tử',
      icon: <AccountBalanceWalletOutlinedIcon fontSize="small" />,
      path: '/admin/reports',
    },
    {
      key: 'utility',
      label: 'Tiện ích',
      desc: 'Giao hàng, Thanh toán',
      icon: <LocalShippingOutlinedIcon fontSize="small" />,
      path: '/admin/invoices',
    },
    {
      key: 'stores',
      label: 'Cửa hàng',
      desc: 'Thông tin, Người dùng, Chi nhánh, Bảo mật',
      icon: <StorefrontOutlinedIcon fontSize="small" />,
      path: '/admin/stores',
    },
    {
      key: 'data-history',
      label: 'Dữ liệu và Lịch sử thao tác',
      desc: 'Khóa sổ, Lịch sử thao tác, Xóa dữ liệu',
      icon: <ShieldOutlinedIcon fontSize="small" />,
      path: '/admin/settings?section=data-history',
    },
  ];

  const openMenu = (key, event) => {
    setAnchorEls((prev) => ({ ...prev, [key]: event.currentTarget }));
  };

  const closeMenu = (key) => {
    setAnchorEls((prev) => ({ ...prev, [key]: null }));
  };

  return (
    <Box sx={{ bgcolor: '#fff' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 1,
          px: 2,
          py: 0.5,
          bgcolor: '#f5f7fb',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <IconButton size="small" onClick={(e) => openMenu('theme', e)}>
          <ColorLensOutlinedIcon fontSize="small" />
        </IconButton>
        <Menu
          anchorEl={anchorEls.theme}
          open={Boolean(anchorEls.theme)}
          onClose={() => closeMenu('theme')}
        >
          <MenuItem onClick={() => closeMenu('theme')}>Mặc định</MenuItem>
          <MenuItem onClick={() => closeMenu('theme')}>Tối</MenuItem>
          <MenuItem onClick={() => closeMenu('theme')}>Sáng</MenuItem>
        </Menu>

        <IconButton size="small" onClick={(e) => openMenu('language', e)}>
          <LanguageOutlinedIcon fontSize="small" />
        </IconButton>
        <Menu
          anchorEl={anchorEls.language}
          open={Boolean(anchorEls.language)}
          onClose={() => closeMenu('language')}
        >
          <MenuItem onClick={() => closeMenu('language')}>Tiếng Việt</MenuItem>
          <MenuItem onClick={() => closeMenu('language')}>English</MenuItem>
        </Menu>

        <IconButton size="small" onClick={(e) => openMenu('settings', e)}>
          <SettingsOutlinedIcon fontSize="small" />
        </IconButton>
        <Menu
          anchorEl={anchorEls.settings}
          open={Boolean(anchorEls.settings)}
          onClose={() => closeMenu('settings')}
          PaperProps={{ sx: { minWidth: 360, borderRadius: 2 } }}
          MenuListProps={{ sx: { py: 0.5 } }}
        >
          {settingsItems.map((item) => (
            <MenuItem
              key={item.key}
              onClick={() => {
                closeMenu('settings');
                navigate(item.path);
              }}
              sx={{ py: 1 }}
            >
              <ListItemIcon sx={{ minWidth: 32, color: 'text.secondary' }}>{item.icon}</ListItemIcon>
              <ListItemText
                primary={item.label}
                secondary={item.desc}
                primaryTypographyProps={{ fontSize: 15, fontWeight: 600 }}
                secondaryTypographyProps={{ fontSize: 13, color: 'text.secondary' }}
              />
            </MenuItem>
          ))}
          <Box sx={{ px: 1, pb: 0.5, pt: 0.5 }}>
            <Button
              fullWidth
              size="small"
              onClick={() => {
                closeMenu('settings');
                navigate('/admin/settings');
              }}
              sx={{
                textTransform: 'none',
                borderRadius: 1.5,
                bgcolor: '#f5f7fb',
                color: 'primary.main',
                '&:hover': { bgcolor: '#ecf2ff' },
              }}
            >
              Xem tất cả thiết lập
            </Button>
          </Box>
        </Menu>

        <IconButton size="small" onClick={(e) => openMenu('account', e)}>
          <AccountCircleOutlinedIcon fontSize="small" />
        </IconButton>
        <Menu
          anchorEl={anchorEls.account}
          open={Boolean(anchorEls.account)}
          onClose={() => closeMenu('account')}
        >
          <MenuItem
            onClick={() => {
              closeMenu('account');
              navigate('/admin/account');
            }}
          >
            Tài khoản
          </MenuItem>
          <MenuItem onClick={() => closeMenu('account')}>Đổi mật khẩu</MenuItem>
        </Menu>
      </Box>

      <AppBar position="static" sx={{ bgcolor: '#1976d2' }}>
        <Toolbar sx={{ gap: 1 }}>
        {/* <Typography variant="h6" sx={{ fontWeight: 700, mr: 2 }}>
          Quản lý
        </Typography> */}

        <Button color="inherit" onClick={() => navigate('/admin/dashboard')}>Tổng quan</Button>
        <Button color="inherit" onClick={(e) => openMenu('products', e)}>Hàng hóa</Button>
        <Menu
          anchorEl={anchorEls.products}
          open={Boolean(anchorEls.products)}
          onClose={() => closeMenu('products')}
          PaperProps={{ sx: { p: 2, borderRadius: 2 } }}
          MenuListProps={{ sx: { p: 0 } }}
        >
          <Box sx={{ display: 'flex', gap: 4 }}>
            <Box sx={{ minWidth: 200 }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                Hàng hóa
              </Typography>
              <MenuItem
                onClick={() => {
                  closeMenu('products');
                  navigate('/admin/products');
                }}
              >
                Danh sách hàng hóa
              </MenuItem>
            </Box>
            <Box sx={{ minWidth: 220 }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                Nhập hàng
              </Typography>
              <MenuItem
                onClick={() => {
                  closeMenu('products');
                  navigate('/admin/suppliers');
                }}
              >
                Nhà cung cấp
              </MenuItem>
              <MenuItem
                onClick={() => {
                  closeMenu('products');
                  navigate('/admin/purchase-orders');
                }}
              >
                Nhập hàng
              </MenuItem>
            </Box>
          </Box>
        </Menu>

        <Button color="inherit" onClick={(e) => openMenu('orders', e)}>Đơn hàng</Button>
        <Menu
          anchorEl={anchorEls.orders}
          open={Boolean(anchorEls.orders)}
          onClose={() => closeMenu('orders')}
          PaperProps={{ sx: { p: 2, borderRadius: 2 } }}
          MenuListProps={{ sx: { p: 0 } }}
        >
          <MenuItem
            onClick={() => {
              closeMenu('orders');
              navigate('/admin/invoices');
            }}
          >
            Hóa đơn
          </MenuItem>
          <MenuItem
            onClick={() => {
              closeMenu('orders');
              navigate('/admin/returns');
            }}
          >
            Trả hàng
          </MenuItem>
        </Menu>

        <Button color="inherit" onClick={(e) => openMenu('customers', e)}>Khách hàng</Button>
        <Menu
          anchorEl={anchorEls.customers}
          open={Boolean(anchorEls.customers)}
          onClose={() => closeMenu('customers')}
          PaperProps={{ sx: { p: 2, borderRadius: 2 } }}
          MenuListProps={{ sx: { p: 0 } }}
        >
          <MenuItem
            onClick={() => {
              closeMenu('customers');
              navigate('/admin/customers');
            }}
          >
            Danh sách khách hàng
          </MenuItem>
          <MenuItem onClick={() => closeMenu('customers')}>Nhóm khách hàng</MenuItem>
        </Menu>
        <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
          <Button
            variant="contained"
            color="inherit"
            onClick={async () => {
              try {
                await apiRequest('/api/auth/switch', {
                  method: 'POST',
                  body: JSON.stringify({ targetApp: 'pos-app' }),
                });
              } catch {
                // ignore, open POS anyway
              }
              navigate('/pos');
            }}
          >
            Bán hàng
          </Button>
          <Button
            variant="outlined"
            color="inherit"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            Đăng xuất
          </Button>
        </Box>
        </Toolbar>
      </AppBar>
    </Box>
  );
}
