import { useCallback, useEffect, useRef, useState } from 'react';
import { 
  AppBar, 
  Toolbar, 
  TextField, 
  InputAdornment, 
  IconButton, 
  Box, 
  Chip,
  Typography,
  Button,
  MenuItem
} from '@mui/material';
import { 
  Search as SearchIcon, 
  QrCodeScanner as QrCodeIcon,
  Undo as UndoIcon,
  Print as PrintIcon,
  Menu as MenuIcon,
  Close as CloseIcon,
  Add as AddIcon,
  Sync as SyncIcon
} from '@mui/icons-material';
import ProductSearchDropdown from './ProductSearchDropdown';

/**
 * Header component với thanh tìm kiếm, tab hóa đơn, và các icon
 */
export default function Header({ 
  searchTerm, 
  onSearch, 
  searchPlaceholder,
  disableSearchDropdown = false,
  invoiceTabs = [],
  activeInvoiceIndex = 0,
  onInvoiceChange,
  onNewInvoice,
  onCloseInvoice,
  onAddToCart,
  onOpenReturnOrders,
  onOpenPrintSettings,
  onOpenDrawer,
  userName = '',
  stores = [],
  selectedStoreId = 'default',
  onStoreChange,
  onOpenStoreDialog,
  canManageStores = false,
  storeLoading = false
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [localSearchTerm, setLocalSearchTerm] = useState(searchTerm || '');
  const searchInputRef = useRef(null);
  const searchInputElementRef = useRef(null);
  const searchDebounceRef = useRef(null);

  const focusAndSelectSearch = useCallback(() => {
    const inputEl = searchInputElementRef.current;
    if (!inputEl) return;
    const apply = () => {
      try {
        inputEl.focus();
        inputEl.select();
      } catch {
        // ignore focus errors
      }
    };
    requestAnimationFrame(apply);
    setTimeout(apply, 20);
    setTimeout(apply, 60);
  }, []);

  const resetSearchAfterScannedAdd = useCallback(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    setLocalSearchTerm('');
    if (onSearch) onSearch('');
    setDropdownOpen(false);
    focusAndSelectSearch();
  }, [focusAndSelectSearch, onSearch]);

  const handleAddToCartFromSearch = useCallback((product) => {
    if (onAddToCart) onAddToCart(product);
    resetSearchAfterScannedAdd();
  }, [onAddToCart, resetSearchAfterScannedAdd]);

  useEffect(() => {
    setLocalSearchTerm(searchTerm || '');
  }, [searchTerm]);

  const handleSearchChange = (value) => {
    setLocalSearchTerm(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (onSearch) {
      searchDebounceRef.current = setTimeout(() => {
        onSearch(value);
      }, 120);
    }
    // Tự động mở dropdown khi có nội dung
    if (!disableSearchDropdown) {
      setDropdownOpen(value.trim().length > 0);
    }
  };

  useEffect(
    () => () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    },
    [],
  );

  const handleCloseDropdown = () => {
    setDropdownOpen(false);
  };

  return (
    <AppBar position="static" sx={{ bgcolor: 'white', color: 'text.primary', boxShadow: 1 }}>
      <Toolbar sx={{ gap: 1.5, px: 1.5, minWidth: 0 }}>
        {/* Thanh tìm kiếm bên trái */}
        <Box
          sx={{
            width: 320,
            minWidth: 280,
            maxWidth: 360,
            flexShrink: 0,
            position: 'relative',
          }}
        >
          <TextField
            ref={searchInputRef}
            inputRef={searchInputElementRef}
            fullWidth
            size="small"
            placeholder={searchPlaceholder || "Tìm hàng hóa (F3) hoặc quét barcode..."}
            value={localSearchTerm || ''}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => {
              if (!disableSearchDropdown && localSearchTerm && localSearchTerm.trim().length > 0) {
                setDropdownOpen(true);
              }
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton 
                    size="small" 
                    onClick={() => {
                      // TODO: Mở scanner barcode
                      alert('Tính năng quét barcode sẽ được thêm sau!');
                    }}
                    title="Quét barcode"
                  >
                    <QrCodeIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ),
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: '#f5f5f5',
                borderRadius: 1,
              },
            }}
          />
          {!disableSearchDropdown && (
            <ProductSearchDropdown
              searchTerm={localSearchTerm}
              open={dropdownOpen}
              anchorEl={searchInputRef.current}
              onClose={handleCloseDropdown}
              onAddToCart={handleAddToCartFromSearch}
              onAutoAdded={() => {
                resetSearchAfterScannedAdd();
              }}
            />
          )}
        </Box>

        {/* Tab hóa đơn ngay sau search bar */}
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
          <Box
            sx={{
              flex: '0 1 auto',
              maxWidth: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              overflowX: 'auto',
              overflowY: 'hidden',
              pr: 0.5,
              '&::-webkit-scrollbar': { height: 6 },
              '&::-webkit-scrollbar-thumb': { backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 4 },
            }}
          >
          {invoiceTabs.map((tab, index) => (
            <Chip
              key={index}
              label={tab.label}
              title={tab.label}
              onDelete={invoiceTabs.length > 1 ? () => onCloseInvoice && onCloseInvoice(index) : undefined}
              deleteIcon={<CloseIcon />}
              color={activeInvoiceIndex === tab.id ? 'primary' : 'default'}
              onClick={() => onInvoiceChange && onInvoiceChange(tab.id)}
              icon={activeInvoiceIndex === tab.id ? <SyncIcon /> : undefined}
              sx={{
                cursor: 'pointer',
                fontWeight: activeInvoiceIndex === tab.id ? 600 : 400,
                '& .MuiChip-icon': {
                  color: 'inherit',
                },
                maxWidth: 120,
                minWidth: 96,
                flexShrink: 0,
                '& .MuiChip-label': {
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                },
              }}
            />
          ))}
          </Box>
          <IconButton onClick={onNewInvoice} size="small" color="primary" sx={{ ml: 0.25, flexShrink: 0 }}>
            <AddIcon />
          </IconButton>
        </Box>

        {/* Các icon bên phải */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, ml: 'auto', flexShrink: 0 }}>
          <TextField
            select
            size="small"
            value={selectedStoreId}
            onChange={(e) => {
              const value = e.target.value;
              if (value === '__add__') {
                onOpenStoreDialog && onOpenStoreDialog();
                return;
              }
              onStoreChange && onStoreChange(value);
            }}
            disabled={storeLoading}
            SelectProps={{
              displayEmpty: true,
              renderValue: (value) => {
                if (!value) {
                  const headquarters = stores.find((item) => item.isHeadquarters) || stores[0];
                  return headquarters?.name || 'Chưa có cửa hàng';
                }
                const store = stores.find((item) => item.storeId === value);
                return store?.name || 'Chưa có cửa hàng';
              }
            }}
            sx={{ width: 180, minWidth: 160, maxWidth: 200 }}
          >
            <MenuItem value="" disabled>
              Chọn cửa hàng
            </MenuItem>
            {stores.map((store) => (
              <MenuItem key={store.storeId} value={store.storeId}>
                {store.name || store.storeId}
              </MenuItem>
            ))}
            {canManageStores && (
              <MenuItem value="__add__">
                + Thêm cửa hàng
              </MenuItem>
            )}
          </TextField>
          <IconButton size="small" onClick={onOpenReturnOrders}>
            <UndoIcon />
          </IconButton>
          <IconButton size="small" onClick={onOpenPrintSettings}>
            <PrintIcon />
          </IconButton>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, ml: 0.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {userName || 'Nhân viên'}
            </Typography>
            <IconButton size="small" onClick={onOpenDrawer}>
              <MenuIcon />
            </IconButton>
          </Box>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
