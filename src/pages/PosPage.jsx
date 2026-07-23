import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Box, 
  Grid, 
  Alert, 
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Paper,
  Pagination,
  Checkbox,
  Chip,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  MenuItem,
  Avatar,
  Switch,
  Tooltip,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormControl,
  FormLabel,
  InputAdornment,
  IconButton,
  Tabs,
  Tab,
  Typography,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  CircularProgress,
  Link
} from '@mui/material';
import {
  Person as PersonIcon,
  PhotoCamera as PhotoCameraIcon,
  Close as CloseIcon,
  QrCodeScanner as QrCodeScannerIcon,
  Add as AddIcon,
  QrCode2 as QrCode2Icon,
  Sync as SyncIcon,
  BarChart as BarChartIcon,
  Undo as UndoIcon,
  FileUpload as FileUploadIcon,
  Tune as TuneIcon,
  Keyboard as KeyboardIcon,
  ExitToApp as ExitToAppIcon,
  Apps as AppsIcon
} from '@mui/icons-material';
import Header from '../components/Header';
import ProductList from '../components/ProductList';
import PaymentPanel from '../components/PaymentPanel';
import ProductSearchDropdown from '../components/ProductSearchDropdown';
import Footer from '../components/Footer';
import BottomFooter from '../components/BottomFooter';
import { useAuth } from '../auth/AuthContext';
import { apiRequest } from '../utils/apiClient';
import { getStoredStoreId, setStoredStoreId } from '../utils/authStorage';
import db, { 
  generateLocalId, 
  generateOrderCode, 
  generateReturnCode,
  migrateOrderCodes,
  checkPhoneExists,
  generateCustomerCode,
  checkCustomerCodeExists
} from '../db/posDB';
import { seedDatabase } from '../db/seedData';
import { BANK_OPTIONS, BANK_OPTION_MAP } from '../constants/bankOptions';
import { displayOrderCode, displayReturnCode, displayProductCode } from '../utils/codeDisplay';
import { isInvoiceDirty, useInvoiceDraft } from './pos/useInvoiceDraft';
import { usePrintService } from './pos/usePrintService';
import { formatMoneyInput, normalizeMoneyTyping } from '../utils/moneyFormat';

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

/**
 * Trang POS chính với layout mới theo hình ảnh
 */
export default function PosPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user } = useAuth();
  // State tìm kiếm
  const [searchTerm, setSearchTerm] = useState('');
  
  // State thông báo
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // Tên nhân viên thu ngân
  const cashierName = user?.name || 'Nhân viên';
  const cashierId = user?.id || user?._id || user?.sub || '';
  const effectiveCashierName = user?.name || cashierName;

  const [printSettingsOpen, setPrintSettingsOpen] = useState(false);
  const [autoPrintEnabled, setAutoPrintEnabled] = useState(true);
  const [printCopies, setPrintCopies] = useState(1);
  const [printTemplate] = useState('invoice');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('idle');
  const syncingRef = useRef(false);
  const lastSyncAttemptRef = useRef(0);
  const authFailedRef = useRef(false);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [stores, setStores] = useState([]);
  const [storeLoading, setStoreLoading] = useState(false);
  const [storeDialogOpen, setStoreDialogOpen] = useState(false);
  const [newStore, setNewStore] = useState({
    name: '',
    phone: '',
    address: '',
    storeId: '',
  });
  const [selectedStoreId, setSelectedStoreId] = useState(() => {
    const stored = getStoredStoreId();
    return stored && stored !== 'default' ? stored : '';
  });
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportType, setReportType] = useState('day');
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reportMonth, setReportMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [reportQuarter, setReportQuarter] = useState(() => Math.floor(new Date().getMonth() / 3) + 1);
  const [reportYear, setReportYear] = useState(() => new Date().getFullYear());
  const [reportLunarYear, setReportLunarYear] = useState(() => new Date().getFullYear());
  const [reportLoading, setReportLoading] = useState(false);
  const [reportData, setReportData] = useState({
    totalCost: 0,
    totalSales: 0,
    totalProfit: 0,
    orderCount: 0,
    buckets: []
  });
  const [loyaltySettings, setLoyaltySettings] = useState(DEFAULT_LOYALTY_SETTINGS);

  // State cho Dialog thêm khách hàng
  const [addCustomerDialogOpen, setAddCustomerDialogOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    customerCode: '',
    name: '',
    nickname: '',
    phone: '',
    address: '',
    area: '',
    ward: '',
    group: '',
    dateOfBirth: '',
    gender: 'male', // 'male' | 'female'
    email: '',
    facebook: '',
    note: '',
    avatar: null
  });
  const [customerErrors, setCustomerErrors] = useState({
    customerCode: '',
    phone: ''
  });
  const [addCustomerLoading, setAddCustomerLoading] = useState(false);
  const [editCustomerDialogOpen, setEditCustomerDialogOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState(null);
  const [editCustomerErrors, setEditCustomerErrors] = useState({
    customerCode: '',
    phone: ''
  });
  const [editCustomerLoading, setEditCustomerLoading] = useState(false);
  const [editCustomerTab, setEditCustomerTab] = useState(0);
  const [orderHistory, setOrderHistory] = useState([]);
  const [orderHistoryLoading, setOrderHistoryLoading] = useState(false);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returnOrdersLoading, setReturnOrdersLoading] = useState(false);
  const [returnOrders, setReturnOrders] = useState([]);
  const [returnRecordsLoading, setReturnRecordsLoading] = useState(false);
  const [returnRecords, setReturnRecords] = useState([]);
  const [quickReturnSelection, setQuickReturnSelection] = useState(() => new Set());
  const [quickReturnProcessing, setQuickReturnProcessing] = useState(false);
  const [returnDetailOpen, setReturnDetailOpen] = useState(false);
  const [returnDetailLoading, setReturnDetailLoading] = useState(false);
  const [returnDetail, setReturnDetail] = useState(null);

  // Chi tiết hóa đơn (hiển thị khi bấm vào mã HD trong lịch sử bán/trả)
  const [orderHistoryDetailOpen, setOrderHistoryDetailOpen] = useState(false);
  const [orderHistoryDetailLoading, setOrderHistoryDetailLoading] = useState(false);
  const [orderHistoryDetail, setOrderHistoryDetail] = useState(null);

  const [productMiniOpen, setProductMiniOpen] = useState(false);
  const [productMini, setProductMini] = useState(null);
  const [returnFilterOrderCode, setReturnFilterOrderCode] = useState('');
  const [returnFilterShippingCode, setReturnFilterShippingCode] = useState('');
  const [returnFilterCustomer, setReturnFilterCustomer] = useState('');
  const [returnFilterProductCode, setReturnFilterProductCode] = useState('');
  const [returnFilterProductName, setReturnFilterProductName] = useState('');
  const [returnFromDate, setReturnFromDate] = useState('');
  const [returnToDate, setReturnToDate] = useState('');
  const [returnPage, setReturnPage] = useState(1);
  const [returnRecordsPage, setReturnRecordsPage] = useState(1);
  const [returnDialogTab, setReturnDialogTab] = useState(0);
  const [exchangeSearchTerm, setExchangeSearchTerm] = useState('');
  const [exchangeSearchOpen, setExchangeSearchOpen] = useState(false);
  const [exchangeSearchAnchor, setExchangeSearchAnchor] = useState(null);
  const exchangeSearchRef = useRef(null);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState('');
  const [addBankDialogOpen, setAddBankDialogOpen] = useState(false);
  const [qrPreviewOpen, setQrPreviewOpen] = useState(false);
  const [newBankAccount, setNewBankAccount] = useState({
    bankName: '',
    bankCode: '',
    accountNumber: '',
    accountName: ''
  });
  const [bankVerifyDialogOpen, setBankVerifyDialogOpen] = useState(false);
  const [bankVerifyAmount, setBankVerifyAmount] = useState(0);

  // State chế độ bán hàng
  const [saleMode, setSaleMode] = useState('quick'); // 'quick' | 'normal' | 'delivery'

  // State quản lý các hóa đơn
  // Mỗi hóa đơn có: items, customerPhone, orderNote, paymentMethod, amountPaid, discount, discountType
  const [invoices, setInvoices] = useState({
    0: {
      items: [],
      returnMode: false,
      returnOrder: null,
      returnItems: [],
      exchangeItems: [],
      customerPhone: '',
      customerLocalId: '',
      customerName: '',
      customerDebt: 0,
      customerPoints: 0,
      customerSearchTerm: '',
      orderNote: '',
      paymentMethod: 'cash',
      bankTransferVerified: false,
      amountPaid: 0,
      discount: 0,
      pointPaymentEnabled: false,
      pointPaymentPoints: 0,
      discountType: 'vnd', // 'vnd' | 'percent'
    }
  });
  const [invoiceTabs, setInvoiceTabs] = useState([{ label: 'Hóa đơn 1', id: 0 }]);
  const invoiceIdCounterRef = useRef(1);
  const invoiceLabelCounterRef = useRef(2);
  const [activeInvoiceIndex, setActiveInvoiceIndex] = useState(0);
  const [closeInvoiceConfirmOpen, setCloseInvoiceConfirmOpen] = useState(false);
  const [pendingCloseTabIndex, setPendingCloseTabIndex] = useState(null);
  const editInitRef = useRef(false);
  const returnInitRef = useRef(null);

  // Lấy state của hóa đơn hiện tại
  const currentInvoice = invoices[activeInvoiceIndex] || {
    items: [],
    returnMode: false,
    returnOrder: null,
    returnItems: [],
    exchangeItems: [],
    customerPhone: '',
    customerLocalId: '',
    customerName: '',
    customerDebt: 0,
    customerPoints: 0,
    customerSearchTerm: '',
    orderNote: '',
    paymentMethod: 'cash',
    bankTransferVerified: false,
    amountPaid: 0,
    discount: 0,
    pointPaymentEnabled: false,
    pointPaymentPoints: 0,
    discountType: 'vnd',
  };

  const isReturnMode = currentInvoice.returnMode || false;
  const returnOrder = currentInvoice.returnOrder || null;
  const returnItems = currentInvoice.returnItems || [];
  const exchangeItems = currentInvoice.exchangeItems || [];
  const cartItems = isReturnMode ? exchangeItems : currentInvoice.items;
  const customerPhone = currentInvoice.customerPhone;
  const customerLocalId = currentInvoice.customerLocalId;
  const customerName = currentInvoice.customerName || '';
  const customerDebt = currentInvoice.customerDebt || 0;
  const customerPoints = currentInvoice.customerPoints || 0;
  const customerSearchTerm = currentInvoice.customerSearchTerm || '';
  const orderNote = currentInvoice.orderNote;
  const paymentMethod = currentInvoice.paymentMethod;
  const bankTransferVerified = !!currentInvoice.bankTransferVerified;
  const amountPaid = currentInvoice.amountPaid;
  const discount = currentInvoice.discount || 0;
  const pointPaymentEnabledByInvoice = Boolean(currentInvoice.pointPaymentEnabled);
  const pointPaymentPoints = Number(currentInvoice.pointPaymentPoints || 0);
  const discountType = currentInvoice.discountType || 'vnd';

  const {
    restoreDraftDialogOpen,
    pendingDraftData,
    closeRestoreDraftDialog,
    discardPendingDraft,
    applyPendingDraft,
  } = useInvoiceDraft({
    invoiceTabs,
    invoices,
    activeInvoiceIndex,
    setInvoiceTabs,
    setInvoices,
    setActiveInvoiceIndex,
    invoiceIdCounterRef,
    invoiceLabelCounterRef,
  });

  useEffect(() => {
    try {
      const stored = localStorage.getItem('pos_bank_accounts');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setBankAccounts(parsed);
          if (parsed.length > 0) {
            setSelectedBankAccountId(parsed[0].id);
          }
        }
      }
    } catch (error) {
      console.error('Lỗi đọc tài khoản ngân hàng:', error);
    }
  }, []);

  // Hiển thị thông báo
  const showSnackbar = (message, severity = 'success') => {
    setSnackbar({ open: true, message, severity });
  };

  const formatCustomerLabel = (customer) => {
    if (!customer) return '';
    const name = String(customer.name || '').trim();
    const nickname = String(customer.nickname || '').trim();
    if (name && nickname) return `${name} (${nickname})`;
    return name || nickname || '';
  };

  /** Giá bán thực tế trên dòng HĐ (sau giảm giá item). */
  const resolveSoldUnitPrice = (item) => {
    if (!item) return 0;
    const base = Number(item.basePrice);
    const discount = Number(item.discount) || 0;
    const discountType = item.discountType || 'vnd';
    const price = Number(item.price) || 0;

    if (Number.isFinite(base) && base > 0 && (discount > 0 || discountType === 'percent')) {
      if (discountType === 'percent') {
        return Math.max(0, Math.round(base * (1 - discount / 100)));
      }
      return Math.max(0, base - discount);
    }
    return price;
  };

  /**
   * Chuẩn hóa dòng giỏ / dòng trả về giá gốc + giảm + giá bán.
   * - Giỏ bán/đổi: product.price = giá catalog, discount trên item.
   * - Dòng còn lại sau trả: có basePrice/discount gốc; product.price = giá đã bán.
   */
  const normalizeCartLine = (item) => {
    const qty = Number(item?.qty) || 0;
    const product = item?.product || {};
    const storedUnit = Number(product.price) || 0;
    const discount = Number(item?.discount) || 0;
    const discountType = item?.discountType || 'vnd';
    const explicitBase = Number(item?.basePrice);
    const hasDiscount = discount > 0 || discountType === 'percent';

    let basePrice;
    let unitPrice;

    if (Number.isFinite(explicitBase) && explicitBase > 0) {
      basePrice = explicitBase;
      if (hasDiscount) {
        unitPrice =
          discountType === 'percent'
            ? Math.max(0, Math.round(basePrice * (1 - discount / 100)))
            : Math.max(0, basePrice - discount);
      } else {
        unitPrice = storedUnit || basePrice;
      }
    } else if (hasDiscount) {
      basePrice = storedUnit;
      unitPrice =
        discountType === 'percent'
          ? Math.max(0, Math.round(basePrice * (1 - discount / 100)))
          : Math.max(0, basePrice - discount);
    } else {
      basePrice = storedUnit;
      unitPrice = storedUnit;
    }

    return {
      product,
      qty,
      basePrice,
      discount: hasDiscount ? discount : 0,
      discountType,
      unitPrice,
      subtotal: unitPrice * qty,
    };
  };

  const toOrderItemDoc = (orderLocalId, line) => ({
    orderLocalId,
    productLocalId: line.product?.localId,
    productCode: line.product?.productCode || '',
    productName: line.product?.name || '',
    basePrice: Number(line.basePrice) || 0,
    discount: Number(line.discount) || 0,
    discountType: line.discountType || 'vnd',
    price: Number(line.unitPrice) || 0,
    qty: Number(line.qty) || 0,
    subtotal: Number(line.subtotal) || 0,
  });

  const formatItemDiscountLabel = (item) => {
    const discount = Number(item?.discount) || 0;
    if (discount <= 0 && item?.discountType !== 'percent') return '—';
    if ((item?.discountType || 'vnd') === 'percent') return `${discount}%`;
    return discount.toLocaleString('en-US');
  };

  const calcAgeFromDob = (dob) => {
    if (!dob) return '';
    const d = new Date(dob);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
    return age >= 0 ? String(age) : '';
  };

  const mapOrderItemToReturnLine = (item, product) => {
    const soldUnit = resolveSoldUnitPrice(item);
    const rawBase = Number(item.basePrice);
    const discount = Number(item.discount) || 0;
    const discountType = item.discountType || 'vnd';
    const hasDiscount = discount > 0 || discountType === 'percent';
    const basePrice = Number.isFinite(rawBase) && rawBase > 0
      ? rawBase
      : (hasDiscount ? (Number(item.price) || soldUnit) + (discountType === 'percent' ? 0 : discount) : soldUnit);
    // Có giảm giá: product.price = giá gốc để ProductList (base - discount) ra đúng giá bán.
    // Không giảm: product.price = giá đã bán.
    return {
      product: {
        localId: item.productLocalId,
        productCode: item.productCode || product?.productCode || '',
        name: item.productName,
        price: hasDiscount ? basePrice : soldUnit,
        barcode: product?.barcode || '',
        stock: product?.stock ?? 0,
      },
      basePrice: hasDiscount ? basePrice : soldUnit,
      discount: hasDiscount ? discount : 0,
      discountType,
      qty: 0,
      maxQty: Number(item.qty) || 0,
    };
  };

  /** Chuẩn hóa dòng hàng để hiển thị trong popup chi tiết HĐ */
  const normalizeHistoryLine = (it) => {
    const qty = Number(it?.qty) || 0;
    const soldUnit = resolveSoldUnitPrice(it);
    const basePrice = Number(it?.basePrice) > 0 ? Number(it.basePrice) : (Number(it?.price) || soldUnit);
    const subtotal = Number(it?.subtotal) || soldUnit * qty;
    return {
      ...it,
      productLocalId: it?.productLocalId || '',
      productCode: it?.productCode || '',
      productName: it?.productName || it?.name || '',
      qty,
      basePrice,
      discount: Number(it?.discount) || 0,
      discountType: it?.discountType || 'vnd',
      price: soldUnit,
      subtotal,
    };
  };

  /**
   * Dựng lại đơn gốc từ đơn hiện tại + lịch sử trả/đổi (đi ngược từ phiếu mới → cũ).
   * Dùng khi đơn cũ chưa có snapshot originalItems.
   */
  const reconstructOriginalItems = (currentItems, returnDetails) => {
    const keyOf = (it) => String(it.productLocalId || it.productCode || it.productName || '').trim();
    const map = new Map();

    const apply = (items, sign) => {
      (items || []).forEach((raw) => {
        const it = normalizeHistoryLine(raw);
        const key = keyOf(it);
        if (!key) return;
        const prev = map.get(key);
        if (prev) {
          const nextQty = (Number(prev.qty) || 0) + sign * (Number(it.qty) || 0);
          map.set(key, {
            ...prev,
            qty: nextQty,
            subtotal: (Number(prev.price) || 0) * nextQty,
          });
        } else {
          const qty = sign * (Number(it.qty) || 0);
          map.set(key, {
            ...it,
            qty,
            subtotal: (Number(it.price) || 0) * qty,
          });
        }
      });
    };

    apply(currentItems, 1);
    const sorted = [...(returnDetails || [])].sort(
      (a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0)
    );
    sorted.forEach((rd) => {
      // Đảo ngược 1 lần đổi trả: bỏ hàng đổi, trả lại hàng đã trả
      apply(rd.exchangeItems, -1);
      apply(rd.returnItems, 1);
    });

    return Array.from(map.values())
      .filter((it) => (Number(it.qty) || 0) > 0)
      .map((it) => ({
        ...it,
        qty: Number(it.qty) || 0,
        subtotal: (Number(it.price) || 0) * (Number(it.qty) || 0),
      }));
  };

  /**
   * Dựng trạng thái hiện tại từ đơn gốc + áp từng phiếu trả/đổi (cũ → mới).
   * Đáng tin hơn order_items khi DB từng bị lệch do replace sai localId.
   */
  const reconstructCurrentItems = (originalItems, returnDetails) => {
    const keyOf = (it) => String(it.productLocalId || it.productCode || it.productName || '').trim();
    const map = new Map();

    const apply = (items, sign) => {
      (items || []).forEach((raw) => {
        const it = normalizeHistoryLine(raw);
        const key = keyOf(it);
        if (!key) return;
        const prev = map.get(key);
        if (prev) {
          const nextQty = (Number(prev.qty) || 0) + sign * (Number(it.qty) || 0);
          // Khi thêm hàng đổi, ưu tiên giá/dòng mới hơn
          const base = sign > 0 ? { ...it } : { ...prev };
          map.set(key, {
            ...base,
            qty: nextQty,
            subtotal: (Number(base.price) || Number(prev.price) || 0) * nextQty,
          });
        } else {
          const qty = sign * (Number(it.qty) || 0);
          map.set(key, {
            ...it,
            qty,
            subtotal: (Number(it.price) || 0) * qty,
          });
        }
      });
    };

    apply(originalItems, 1);
    const sorted = [...(returnDetails || [])].sort(
      (a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0)
    );
    sorted.forEach((rd) => {
      apply(rd.returnItems, -1);
      apply(rd.exchangeItems, 1);
    });

    return Array.from(map.values())
      .filter((it) => (Number(it.qty) || 0) > 0)
      .map((it) => ({
        ...it,
        qty: Number(it.qty) || 0,
        subtotal: (Number(it.price) || 0) * (Number(it.qty) || 0),
      }));
  };

  const loadStores = useCallback(async () => {
    setStoreLoading(true);
    try {
      const response = await apiRequest('/api/stores/me');
      const list = Array.isArray(response?.stores) ? response.stores : [];
      setStores(list);
      if (list.length > 0) {
        const found = list.find((store) => store.storeId === selectedStoreId);
        if (!found) {
          const nextStoreId = list[0].storeId;
          setSelectedStoreId(nextStoreId);
          setStoredStoreId(nextStoreId);
        }
      } else {
        setSelectedStoreId('');
        setStoredStoreId('');
      }
    } catch (error) {
      console.warn('Load stores failed:', error);
    } finally {
      setStoreLoading(false);
    }
  }, [selectedStoreId]);

  const loadLoyaltySettings = useCallback(async () => {
    try {
      const response = await apiRequest('/api/settings/customer-loyalty');
      setLoyaltySettings({ ...DEFAULT_LOYALTY_SETTINGS, ...(response?.settings || {}) });
    } catch {
      setLoyaltySettings(DEFAULT_LOYALTY_SETTINGS);
    }
  }, []);

  const handleStoreChange = useCallback((storeId) => {
    setSelectedStoreId(storeId);
    setStoredStoreId(storeId);
  }, []);

  const storeInfo = useMemo(() => {
    const selectedStore = stores.find((s) => String(s.storeId || '') === String(selectedStoreId || '')) || stores[0] || null;
    return {
      name: selectedStore?.name || 'Cơ sở bán hàng',
      phone: selectedStore?.phone || '',
      address: selectedStore?.address || '',
      website: selectedStore?.website || '',
    };
  }, [selectedStoreId, stores]);

  const openEditOrderFromAdmin = useCallback(async (orderId) => {
    if (!orderId) return;
    try {
      const res = await apiRequest(`/api/orders/${orderId}`);
      const order = res?.order;
      const items = Array.isArray(res?.items) ? res.items : [];
      if (!order) return;

      // Switch store theo hóa đơn gốc để khớp chi nhánh
      if (order.storeId) {
        handleStoreChange(order.storeId);
      }

      // Tạo tab hóa đơn Update_HD...
      const nextId = invoiceIdCounterRef.current;
      const label = `Update_${order.orderCode || 'HD'}`;
      invoiceIdCounterRef.current += 1;
      const newTabs = [...invoiceTabs, { label, id: nextId }];
      setInvoiceTabs(newTabs);
      setActiveInvoiceIndex(nextId);

      // Map items backend -> cartItems của POS (khôi phục giảm giá item nếu có)
      await db.open();
      const mappedItems = await Promise.all(items.map(async (it) => {
        const productLocalId = String(it.productLocalId || '').trim();
        const product = productLocalId ? await db.products.get(productLocalId) : null;
        const soldUnit = resolveSoldUnitPrice(it);
        const discount = Number(it.discount) || 0;
        const discountType = it.discountType || 'vnd';
        const hasDiscount = discount > 0 || discountType === 'percent';
        const basePrice = Number(it.basePrice) > 0
          ? Number(it.basePrice)
          : (hasDiscount ? soldUnit : (Number(it.price) || 0));
        const fallbackProduct = {
          localId: productLocalId || generateLocalId(),
          productCode: it.productCode || '',
          name: it.productName || '',
          price: hasDiscount ? basePrice : soldUnit,
          allowPoints: true,
          stock: 0,
        };
        const resolved = product
          ? { ...product, price: hasDiscount ? basePrice : (Number(product.price) || soldUnit) }
          : fallbackProduct;
        // Nếu product catalog khác giá lúc bán, ưu tiên giá trên hóa đơn
        if (hasDiscount) {
          resolved.price = basePrice;
        } else if (Number(it.price) > 0) {
          resolved.price = Number(it.price);
        }
        return {
          product: resolved,
          qty: Number(it.qty) || 0,
          discount: hasDiscount ? discount : 0,
          discountType,
          basePrice: hasDiscount ? basePrice : Number(resolved.price) || 0,
        };
      }));

      setInvoices((prev) => ({
        ...prev,
        [nextId]: {
          items: mappedItems,
          returnMode: false,
          returnOrder: null,
          returnItems: [],
          exchangeItems: [],
          customerPhone: order.customerPhone || '',
          customerLocalId: order.customerLocalId || '',
          customerName: order.customerName || '',
          customerDebt: 0,
          customerPoints: 0,
          pointPaymentEnabled: Number(order.pointsUsed || 0) > 0,
          pointPaymentPoints: Number(order.pointsUsed) || 0,
          customerSearchTerm: '',
          orderNote: order.note || '',
          paymentMethod: order.paymentMethod || 'cash',
          amountPaid: Number(order.totalAmount) || 0,
          discount: Number(order.discount) || 0,
          discountType: order.discountType || 'vnd',
          editMeta: {
            orderMongoId: order._id,
            orderLocalId: order.localId,
            orderCode: order.orderCode,
            storeId: order.storeId,
          },
        },
      }));

      showSnackbar(`Đang chỉnh sửa hóa đơn ${order.orderCode || ''}`, 'info');
    } catch (e) {
      console.error(e);
      showSnackbar('Không mở được hóa đơn để chỉnh sửa', 'error');
    }
  }, [handleStoreChange, invoiceTabs]);

  useEffect(() => {
    if (editInitRef.current) return;
    const params = new URLSearchParams(location.search || '');
    const editOrderId = params.get('editOrderId');
    if (!editOrderId) return;
    editInitRef.current = true;
    openEditOrderFromAdmin(editOrderId);
  }, [location.search, openEditOrderFromAdmin]);

  const openReturnOrderFromAdmin = useCallback(async (orderId) => {
    if (!orderId) return;
    try {
      const res = await apiRequest(`/api/orders/${orderId}`);
      const order = res?.order;
      const items = Array.isArray(res?.items) ? res.items : [];
      if (!order) return;

      // Switch store theo hóa đơn gốc để khớp chi nhánh
      if (order.storeId) {
        handleStoreChange(order.storeId);
      }

      await db.open();
      const products = await db.products.toArray();
      const productById = new Map(products.map((p) => [p.localId, p]));

      const mappedReturnItems = items.map((it) =>
        mapOrderItemToReturnLine(it, productById.get(it.productLocalId))
      );

      updateCurrentInvoice({
        returnMode: true,
        returnOrder: {
          localId: order.localId,
          orderCode: order.orderCode || '',
          customerLabel: order.customerName || '',
          customerLocalId: order.customerLocalId || '',
          customerPhone: order.customerPhone || '',
        },
        returnItems: mappedReturnItems,
        exchangeItems: [],
        customerName: order.customerName || '',
        customerLocalId: order.customerLocalId || '',
        customerPhone: order.customerPhone || '',
      });

      showSnackbar(`Trả hàng / ${order.orderCode || ''}`, 'info');
    } catch (e) {
      console.error(e);
      showSnackbar('Không mở được hóa đơn để trả hàng', 'error');
    }
  }, [handleStoreChange]);

  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    const returnOrderId = params.get('returnOrderId');
    if (!returnOrderId) return;
    if (returnInitRef.current === returnOrderId) return;
    returnInitRef.current = returnOrderId;
    openReturnOrderFromAdmin(returnOrderId);
  }, [location.search, openReturnOrderFromAdmin]);

  const handleCreateStore = async () => {
    if (!newStore.name.trim()) {
      showSnackbar('Vui lòng nhập tên cửa hàng', 'error');
      return;
    }
    try {
      const payload = {
        name: newStore.name.trim(),
        phone: newStore.phone.trim(),
        address: newStore.address.trim(),
        storeId: newStore.storeId.trim() || undefined,
      };
      const response = await apiRequest('/api/stores', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const created = response?.store;
      const nextStoreId = created?.storeId || payload.storeId || '';
      if (nextStoreId) {
        setSelectedStoreId(nextStoreId);
        setStoredStoreId(nextStoreId);
      }
      setStoreDialogOpen(false);
      setNewStore({ name: '', phone: '', address: '', storeId: '' });
      showSnackbar('Tạo cửa hàng thành công', 'success');
      loadStores();
    } catch (error) {
      showSnackbar(error.message || 'Không thể tạo cửa hàng', 'error');
    }
  };

  const syncOrdersToServer = useCallback(async (orderLocalIds = null) => {
    await db.open();
    if (Array.isArray(orderLocalIds)) {
      const safeIds = orderLocalIds.filter(Boolean);
      if (safeIds.length === 0) {
        return { syncedOrders: 0, syncedItems: 0 };
      }
      const orders = await db.orders.where('localId').anyOf(safeIds).toArray();
      if (orders.length === 0) {
        return { syncedOrders: 0, syncedItems: 0 };
      }

      const orderIds = orders.map((order) => order.localId).filter(Boolean);
      const orderItems = orderIds.length > 0
        ? await db.order_items.where('orderLocalId').anyOf(orderIds).toArray()
        : [];
      const mappedItems = orderItems.map((item) => ({
        ...item,
        localId: `${item.orderLocalId}_${item.id}`,
      }));

      const response = await apiRequest('/api/sync/orders', {
        method: 'POST',
        body: JSON.stringify({ orders, orderItems: mappedItems }),
      });

      if (orderIds.length > 0) {
        await db.orders.where('localId').anyOf(orderIds).modify({ synced: true });
      }
      return response;
    }

    const orders = await db.orders.filter((order) => order.synced === false).toArray();
    if (orders.length === 0) {
      return { syncedOrders: 0, syncedItems: 0 };
    }

    const orderIds = orders.map((order) => order.localId).filter(Boolean);
    const orderItems = orderIds.length > 0
      ? await db.order_items.where('orderLocalId').anyOf(orderIds).toArray()
      : [];
    const mappedItems = orderItems.map((item) => ({
      ...item,
      localId: `${item.orderLocalId}_${item.id}`,
    }));

    const response = await apiRequest('/api/sync/orders', {
      method: 'POST',
      body: JSON.stringify({ orders, orderItems: mappedItems }),
    });

    if (orderIds.length > 0) {
      await db.orders.where('localId').anyOf(orderIds).modify({ synced: true });
    }
    return response;
  }, []);

  const syncMasterToServer = useCallback(async () => {
    await db.open();
    const products = await db.products.filter((product) => product.synced === false).toArray();
    const customers = await db.customers.filter((customer) => customer.synced === false).toArray();

    const safeProducts = products.filter((product) => product && typeof product.localId === 'string' && product.localId.trim());
    const safeCustomers = customers.filter((customer) => customer && typeof customer.localId === 'string' && customer.localId.trim());

    if (safeProducts.length === 0 && safeCustomers.length === 0) {
      return { syncedProducts: 0, syncedCustomers: 0 };
    }

    let response;
    try {
      response = await apiRequest('/api/sync/master', {
        method: 'POST',
        body: JSON.stringify({ products: safeProducts, customers: safeCustomers }),
      });
    } catch (error) {
      if (error?.errors) {
        console.warn('Sync master validation errors:', error.errors);
      }
      throw error;
    }

    if (safeProducts.length > 0) {
      const productIds = safeProducts.map((product) => product.localId);
      if (productIds.length > 0) {
        await db.products.where('localId').anyOf(productIds).modify({ synced: true });
      }
    }
    if (safeCustomers.length > 0) {
      const customerIds = safeCustomers.map((customer) => customer.localId);
      if (customerIds.length > 0) {
        await db.customers.where('localId').anyOf(customerIds).modify({ synced: true });
      }
    }

    return response;
  }, []);

  const syncReturnsToServer = useCallback(async () => {
    await db.open();
    const returns = await db.returns.filter((record) => record.synced === false).toArray();
    if (returns.length === 0) {
      return { syncedReturns: 0, syncedItems: 0 };
    }

    // Normalize để tránh gửi null gây 400 validation (backend yêu cầu string)
    const normalizedReturns = returns.map((r) => ({
      ...r,
      returnCode: r.returnCode || '',
      orderLocalId: r.orderLocalId || '',
      orderCode: r.orderCode || '',
      exchangeOrderLocalId: r.exchangeOrderLocalId || '',
      exchangeOrderCode: r.exchangeOrderCode || '',
      cashierId: r.cashierId || '',
      cashierName: r.cashierName || '',
      paymentMethod: r.paymentMethod || '',
      exchangeItems: Array.isArray(r.exchangeItems) ? r.exchangeItems : [],
    }));

    const returnIds = normalizedReturns.map((record) => record.localId);
    const returnItems = returnIds.length > 0
      ? await db.return_items.where('returnLocalId').anyOf(returnIds).toArray()
      : [];
    const mappedItems = returnItems.map((item) => ({
      ...item,
      localId: `${item.returnLocalId}_${item.id}`,
    }));

    const response = await apiRequest('/api/sync/returns', {
      method: 'POST',
      body: JSON.stringify({ returns: normalizedReturns, returnItems: mappedItems }),
    });

    if (returnIds.length > 0) {
      await db.returns.where('localId').anyOf(returnIds).modify({ synced: true });
    }
    return response;
  }, []);

  const pullMasterData = useCallback(async () => {
    const response = await apiRequest('/api/sync/bootstrap', { method: 'GET' });
    const { products = [], customers = [], settings = [] } = response || {};

    if (typeof window !== 'undefined' && window.posOffline?.posDb) {
      await window.posOffline.posDb({
        op: 'bootstrapReplace',
        products: products.map((product) => ({
          ...product,
          synced: true,
          deleted: Boolean(product.deleted),
        })),
        customers: customers.map((customer) => ({ ...customer, synced: true })),
        settings: settings.map((setting) => ({ key: setting.key, value: setting.value })),
      });
      return response;
    }

    await db.open();
    await db.transaction('rw', db.products, db.customers, db.settings, async () => {
      await db.products.clear();
      await db.customers.clear();
      await db.settings.clear();

      if (Array.isArray(products) && products.length > 0) {
        const normalizedProducts = products.map((product) => ({
          ...product,
          synced: true,
          deleted: Boolean(product.deleted),
        }));
        await db.products.bulkPut(normalizedProducts);
      }

      if (Array.isArray(customers) && customers.length > 0) {
        const normalizedCustomers = customers.map((customer) => ({
          ...customer,
          synced: true,
        }));
        await db.customers.bulkPut(normalizedCustomers);
      }

      if (Array.isArray(settings) && settings.length > 0) {
        const normalizedSettings = settings.map((setting) => ({
          key: setting.key,
          value: setting.value,
        }));
        await db.settings.bulkPut(normalizedSettings);
      }
    });

    return response;
  }, []);

  const syncAllData = useCallback(async () => {
    if (syncingRef.current || authFailedRef.current) return;
    const now = Date.now();
    if (now - lastSyncAttemptRef.current < 5000) return;
    lastSyncAttemptRef.current = now;
    syncingRef.current = true;
    setSyncing(true);
    setSyncStatus('syncing');
    try {
      await syncOrdersToServer();
      await syncReturnsToServer();
      await syncMasterToServer();
      await pullMasterData();
      setLastSyncAt(Date.now());
      setSyncStatus('success');
      showSnackbar('Đồng bộ dữ liệu thành công', 'success');
    } catch (error) {
      console.warn('Sync all failed:', error);
      setSyncStatus('error');
      if (error?.status === 401 || String(error?.message).toLowerCase().includes('invalid token')) {
        authFailedRef.current = true;
        showSnackbar('Phiên đăng nhập hết hạn, vui lòng đăng nhập lại', 'warning');
      } else {
        showSnackbar('Không thể đồng bộ dữ liệu', 'warning');
      }
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [syncOrdersToServer, syncReturnsToServer, syncMasterToServer, pullMasterData]);

  // Đồng bộ dữ liệu user từ server trước, sau đó mới seed nếu vẫn trống
  useEffect(() => {
    const initDatabase = async () => {
      try {
        try {
          await pullMasterData();
        } catch (error) {
          console.warn('Pull master data failed:', error);
        }
        await seedDatabase();
        if (!localStorage.getItem('pos_order_code_migrated_v1')) {
          await migrateOrderCodes();
          localStorage.setItem('pos_order_code_migrated_v1', 'true');
        }
      } catch (error) {
        console.error('Lỗi khởi tạo database:', error);
      }
    };
    initDatabase();
  }, [pullMasterData]);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  useEffect(() => {
    loadLoyaltySettings();
  }, [loadLoyaltySettings]);

  useEffect(() => {
    const handleOnline = () => {
      syncAllData();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [syncAllData]);

  useEffect(() => {
    const intervalMs = 5 * 60 * 1000;
    const tick = () => {
      if (!navigator.onLine || document.hidden) return;
      syncAllData();
    };
    tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [syncAllData]);

  const handleLogout = () => {
    setDrawerOpen(false);
    logout();
    navigate('/login', { replace: true });
  };

  // Xử lý tìm kiếm trong header
  const handleHeaderSearch = (term) => {
    setSearchTerm(term);
  };

  const openEditCustomer = async (localId) => {
    if (!localId) return;
    try {
      await db.open();
      const customer = await db.customers.get(localId);
      if (!customer) {
        showSnackbar('Không tìm thấy khách hàng', 'error');
        return;
      }
      setEditCustomer({
        localId: customer.localId,
        customerCode: customer.customerCode || '',
        name: customer.name || '',
        phone: customer.phone || '',
        address: customer.address || '',
        area: customer.area || '',
        ward: customer.ward || '',
        group: customer.group || '',
        dateOfBirth: customer.dateOfBirth || '',
        gender: customer.gender || 'male',
        email: customer.email || '',
        facebook: customer.facebook || '',
        note: customer.note || '',
        avatar: null
      });
      setEditCustomerErrors({ customerCode: '', phone: '' });
      setEditCustomerDialogOpen(true);
      setEditCustomerTab(0);
    } catch (error) {
      console.error('Lỗi tải khách hàng:', error);
      showSnackbar('Có lỗi khi tải khách hàng', 'error');
    }
  };

  const loadOrderHistory = async (customer) => {
    if (!customer?.localId) return;
    setOrderHistoryLoading(true);
    try {
      await db.open();
      let orders = [];
      try {
        orders = await db.orders
          .where('customerLocalId')
          .equals(customer.localId)
          .toArray();
      } catch (error) {
        console.warn('Không thể query theo customerLocalId:', error);
      }

      if (orders.length === 0 && customer.phone) {
        const allOrders = await db.orders.toArray();
        orders = allOrders.filter(order => order.customerPhone === customer.phone);
      }

      orders.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setOrderHistory(orders);
    } catch (error) {
      console.error('Lỗi load lịch sử bán/trả hàng:', error);
      setOrderHistory([]);
    } finally {
      setOrderHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (editCustomerDialogOpen && editCustomerTab === 1 && editCustomer?.localId) {
      loadOrderHistory(editCustomer);
    }
  }, [editCustomerDialogOpen, editCustomerTab, editCustomer]);

  const normalizePhoneDigits = (value) => String(value || '').replace(/\D/g, '');

  const parseLocalDateStart = (yyyyMmDd) => {
    if (!yyyyMmDd) return null;
    const [y, m, d] = String(yyyyMmDd).split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  };

  const parseLocalDateEnd = (yyyyMmDd) => {
    if (!yyyyMmDd) return null;
    const [y, m, d] = String(yyyyMmDd).split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
  };

  const loadReturnOrders = async () => {
    try {
      setReturnOrdersLoading(true);
      setReturnRecordsLoading(true);
      await db.open().catch(() => {});
      const [orders, customers, orderItems, products, returns] = await Promise.all([
        db.orders.toArray(),
        db.customers.toArray(),
        db.order_items.toArray(),
        db.products.toArray(),
        db.returns.toArray()
      ]);

      const customerById = new Map(customers.map((customer) => [customer.localId, customer]));
      const customerByPhone = new Map();
      customers.forEach((customer) => {
        const phone = String(customer.phone || '').trim();
        if (phone) customerByPhone.set(phone, customer);
        const digits = normalizePhoneDigits(phone);
        if (digits) customerByPhone.set(digits, customer);
      });
      const productById = new Map(products.map((product) => [product.localId, product]));

      const orderItemsByOrder = new Map();
      orderItems.forEach((item) => {
        if (!orderItemsByOrder.has(item.orderLocalId)) {
          orderItemsByOrder.set(item.orderLocalId, []);
        }
        orderItemsByOrder.get(item.orderLocalId).push(item);
      });

      const returnEnriched = returns
        .map((returnItem) => {
          const phone = String(returnItem.customerPhone || '').trim();
          const customer =
            (returnItem.customerLocalId && customerById.get(returnItem.customerLocalId)) ||
            (phone && (customerByPhone.get(phone) || customerByPhone.get(normalizePhoneDigits(phone))));
          return {
            ...returnItem,
            customerLabel: formatCustomerLabel(customer) || phone || 'Khách lẻ',
            customerName: formatCustomerLabel(customer) || returnItem.customerName || '',
            customerPhone: phone || customer?.phone || '',
          };
        })
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      // Có thể tồn tại bản ghi trùng mã hóa đơn do dữ liệu cũ/sync trước đây.
      // Giữ 1 bản ghi mới nhất cho mỗi orderCode; ưu tiên localId ≠ orderCode (UUID thật).
      const latestOrderByKey = new Map();
      orders.forEach((order) => {
        const key = String(order.orderCode || order.localId || '').trim();
        if (!key) return;
        const prev = latestOrderByKey.get(key);
        if (!prev) {
          latestOrderByKey.set(key, order);
          return;
        }
        const prevIsCodeId = String(prev.localId) === String(prev.orderCode);
        const curIsCodeId = String(order.localId) === String(order.orderCode);
        if (prevIsCodeId && !curIsCodeId) {
          latestOrderByKey.set(key, order);
          return;
        }
        if (!prevIsCodeId && curIsCodeId) return;
        const prevTs = Number(prev?.updatedAt || prev?.createdAt || 0);
        const curTs = Number(order.updatedAt || order.createdAt || 0);
        if (curTs >= prevTs) {
          latestOrderByKey.set(key, order);
        }
      });
      const dedupedOrders = Array.from(latestOrderByKey.values());

      const enriched = dedupedOrders
        .filter(order => order.status !== 'returned')
        .map((order) => {
          const phone = String(order.customerPhone || '').trim();
          const customer =
            (order.customerLocalId && customerById.get(order.customerLocalId)) ||
            (phone && (customerByPhone.get(phone) || customerByPhone.get(normalizePhoneDigits(phone))));

          const items = orderItemsByOrder.get(order.localId) || [];
          const productNames = items.map((item) => item.productName).filter(Boolean);
          const productCodes = items
            .map((item) => {
              const product = productById.get(item.productLocalId);
              return item.productCode || product?.productCode || product?.barcode || item.barcode || '';
            })
            .filter(Boolean);

          const returnRecordsForOrder = returnEnriched.filter(
            (r) => r.orderCode === order.orderCode || r.orderLocalId === order.localId
          );

          const itemsSoldTotal = items.reduce((sum, it) => {
            const sold = resolveSoldUnitPrice(it);
            const qty = Number(it.qty) || 0;
            return sum + (Number(it.subtotal) || sold * qty);
          }, 0);

          const customerName =
            formatCustomerLabel(customer) ||
            order.customerName ||
            order.customerLabel ||
            '';
          const customerPhone = phone || customer?.phone || '';

          return {
            ...order,
            // Ưu tiên tổng theo dòng hàng (đã gồm giảm giá item) nếu có
            totalAmount: items.length > 0 ? itemsSoldTotal : (Number(order.totalAmount) || 0),
            subtotalAmount: items.length > 0 ? itemsSoldTotal : (Number(order.subtotalAmount) || 0),
            customerName,
            customerPhone,
            customerLabel: customerName || customerPhone || 'Khách lẻ',
            shippingCode: order.shippingCode || order.deliveryCode || '',
            productNames,
            productCodes,
            returnRecords: returnRecordsForOrder,
          };
        })
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      setReturnOrders(enriched);
      setReturnRecords(returnEnriched);
    } catch (error) {
      console.error('Lỗi tải đơn hàng trả:', error);
      setReturnOrders([]);
      setReturnRecords([]);
    } finally {
      setReturnOrdersLoading(false);
      setReturnRecordsLoading(false);
    }
  };

  useEffect(() => {
    if (returnDialogOpen) {
      setQuickReturnSelection(new Set());
      loadReturnOrders();
    }
  }, [returnDialogOpen]);

  const filteredReturnOrders = useMemo(() => {
    const orderCodeQ = returnFilterOrderCode.trim().toLowerCase();
    const shippingQ = returnFilterShippingCode.trim().toLowerCase();
    const customerQ = returnFilterCustomer.trim().toLowerCase();
    const customerDigits = normalizePhoneDigits(returnFilterCustomer);
    const productCodeQ = returnFilterProductCode.trim().toLowerCase();
    const productNameQ = returnFilterProductName.trim().toLowerCase();
    const fromDateValue = parseLocalDateStart(returnFromDate);
    const toDateValue = parseLocalDateEnd(returnToDate);

    return returnOrders
      .filter((order) => {
        if (fromDateValue || toDateValue) {
          const createdAtValue = order.createdAt ? new Date(order.createdAt).getTime() : 0;
          if (fromDateValue && createdAtValue < fromDateValue) return false;
          if (toDateValue && createdAtValue > toDateValue) return false;
        }

        if (orderCodeQ) {
          const code = String(order.orderCode || '').toLowerCase();
          if (!code.includes(orderCodeQ)) return false;
        }
        if (shippingQ) {
          const ship = String(order.shippingCode || '').toLowerCase();
          if (!ship.includes(shippingQ)) return false;
        }
        if (customerQ) {
          const name = String(order.customerName || order.customerLabel || '').toLowerCase();
          const phone = String(order.customerPhone || '');
          const phoneDigits = normalizePhoneDigits(phone);
          const matchName = name.includes(customerQ);
          const matchPhone = customerDigits
            ? phoneDigits.includes(customerDigits)
            : phone.toLowerCase().includes(customerQ);
          if (!matchName && !matchPhone) return false;
        }
        if (productCodeQ) {
          const ok = (order.productCodes || []).some((code) =>
            String(code).toLowerCase().includes(productCodeQ)
          );
          if (!ok) return false;
        }
        if (productNameQ) {
          const ok = (order.productNames || []).some((name) =>
            String(name).toLowerCase().includes(productNameQ)
          );
          if (!ok) return false;
        }
        return true;
      })
      .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
  }, [
    returnOrders,
    returnFilterOrderCode,
    returnFilterShippingCode,
    returnFilterCustomer,
    returnFilterProductCode,
    returnFilterProductName,
    returnFromDate,
    returnToDate,
  ]);

  const filteredReturnRecords = useMemo(() => {
    const orderCodeQ = returnFilterOrderCode.trim().toLowerCase();
    const customerQ = returnFilterCustomer.trim().toLowerCase();
    const customerDigits = normalizePhoneDigits(returnFilterCustomer);
    const fromDateValue = parseLocalDateStart(returnFromDate);
    const toDateValue = parseLocalDateEnd(returnToDate);

    return returnRecords
      .filter((record) => {
        if (fromDateValue || toDateValue) {
          const createdAtValue = record.createdAt ? new Date(record.createdAt).getTime() : 0;
          if (fromDateValue && createdAtValue < fromDateValue) return false;
          if (toDateValue && createdAtValue > toDateValue) return false;
        }

        if (orderCodeQ) {
          const returnCode = String(record.returnCode || '').toLowerCase();
          const orderCode = String(record.orderCode || '').toLowerCase();
          const exchangeCode = String(record.exchangeOrderCode || '').toLowerCase();
          if (
            !returnCode.includes(orderCodeQ) &&
            !orderCode.includes(orderCodeQ) &&
            !exchangeCode.includes(orderCodeQ)
          ) {
            return false;
          }
        }
        if (customerQ) {
          const name = String(record.customerName || record.customerLabel || '').toLowerCase();
          const phone = String(record.customerPhone || '');
          const phoneDigits = normalizePhoneDigits(phone);
          const matchName = name.includes(customerQ);
          const matchPhone = customerDigits
            ? phoneDigits.includes(customerDigits)
            : phone.toLowerCase().includes(customerQ);
          if (!matchName && !matchPhone) return false;
        }
        return true;
      })
      .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
  }, [
    returnRecords,
    returnFilterOrderCode,
    returnFilterCustomer,
    returnFromDate,
    returnToDate,
  ]);

  const returnPageSize = 10;
  const returnTotalPages = Math.max(1, Math.ceil(filteredReturnOrders.length / returnPageSize));
  const returnPageSafe = Math.min(returnPage, returnTotalPages);
  const returnPageStart = (returnPageSafe - 1) * returnPageSize;
  const returnPageEnd = Math.min(returnPageStart + returnPageSize, filteredReturnOrders.length);
  const returnPageOrders = filteredReturnOrders.slice(returnPageStart, returnPageEnd);
  const returnRecordsPageSize = 10;
  const returnRecordsTotalPages = Math.max(1, Math.ceil(filteredReturnRecords.length / returnRecordsPageSize));
  const returnRecordsPageSafe = Math.min(returnRecordsPage, returnRecordsTotalPages);
  const returnRecordsPageStart = (returnRecordsPageSafe - 1) * returnRecordsPageSize;
  const returnRecordsPageEnd = Math.min(returnRecordsPageStart + returnRecordsPageSize, filteredReturnRecords.length);
  const returnRecordsPageItems = filteredReturnRecords.slice(returnRecordsPageStart, returnRecordsPageEnd);

  useEffect(() => {
    setReturnPage(1);
    setReturnRecordsPage(1);
  }, [
    returnFilterOrderCode,
    returnFilterShippingCode,
    returnFilterCustomer,
    returnFilterProductCode,
    returnFilterProductName,
    returnFromDate,
    returnToDate,
  ]);

  const handleSelectReturnOrder = async (order) => {
    if (!order) return;
    try {
      await db.open();
      const [orderItems, products] = await Promise.all([
        db.order_items.where('orderLocalId').equals(order.localId).toArray(),
        db.products.toArray()
      ]);
      const productById = new Map(products.map(product => [product.localId, product]));
      const mappedReturnItems = orderItems.map((item) =>
        mapOrderItemToReturnLine(item, productById.get(item.productLocalId))
      );

      updateCurrentInvoice({
        returnMode: true,
        returnOrder: {
          localId: order.localId,
          orderCode: order.orderCode,
          customerLabel: order.customerLabel || '',
          customerLocalId: order.customerLocalId || '',
          customerPhone: order.customerPhone || ''
        },
        returnItems: mappedReturnItems,
        exchangeItems: [],
        customerName: order.customerLabel || '',
        customerLocalId: order.customerLocalId || '',
        customerPhone: order.customerPhone || ''
      });

      setReturnDialogOpen(false);
    } catch (error) {
      console.error('Lỗi load đơn trả hàng:', error);
      showSnackbar('Không thể tải đơn trả hàng', 'error');
    }
  };

  const toggleQuickReturnSelect = useCallback((orderLocalId) => {
    if (!orderLocalId) return;
    setQuickReturnSelection((prev) => {
      const next = new Set(prev);
      if (next.has(orderLocalId)) next.delete(orderLocalId);
      else next.add(orderLocalId);
      return next;
    });
  }, []);

  const toggleQuickReturnSelectAllCurrentPage = useCallback(() => {
    const ids = returnPageOrders.map((o) => o.localId).filter(Boolean);
    if (ids.length === 0) return;
    setQuickReturnSelection((prev) => {
      const allSelected = ids.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }, [returnPageOrders]);

  const handleQuickReturn = useCallback(async () => {
    if (quickReturnSelection.size === 0) return;
    setQuickReturnProcessing(true);
    try {
      await db.open();
      const selectedIds = Array.from(quickReturnSelection);
      const [allOrders, allOrderItems, allProducts, allCustomers] = await Promise.all([
        db.orders.where('localId').anyOf(selectedIds).toArray(),
        db.order_items.where('orderLocalId').anyOf(selectedIds).toArray(),
        db.products.toArray(),
        db.customers.toArray(),
      ]);

      const orderById = new Map(allOrders.map((o) => [o.localId, o]));
      const productById = new Map(allProducts.map((p) => [p.localId, p]));
      const customerById = new Map(allCustomers.map((c) => [c.localId, c]));
      const customerByPhone = new Map(allCustomers.map((c) => [String(c.phone || '').trim(), c]));
      const orderItemsByOrder = new Map();
      allOrderItems.forEach((item) => {
        if (!orderItemsByOrder.has(item.orderLocalId)) orderItemsByOrder.set(item.orderLocalId, []);
        orderItemsByOrder.get(item.orderLocalId).push(item);
      });

      let processed = 0;
      for (const orderLocalId of selectedIds) {
        const order = orderById.get(orderLocalId);
        if (!order || String(order.status || '').toLowerCase() === 'returned') continue;
        const orderItems = orderItemsByOrder.get(orderLocalId) || [];
        if (orderItems.length === 0) continue;

        const returnLocalId = generateLocalId();
        // eslint-disable-next-line no-await-in-loop
        const returnCode = await generateReturnCode();
        const now = Date.now();
        const returnItemRecords = orderItems.map((item) => {
          const qty = Number(item.qty) || 0;
          const soldUnit = resolveSoldUnitPrice(item);
          const subtotal = Number(item.subtotal) || soldUnit * qty;
          return {
            returnLocalId,
            productLocalId: item.productLocalId,
            productName: item.productName,
            price: soldUnit,
            qty,
            subtotal,
          };
        });
        const totalReturnAmount = returnItemRecords.reduce((sum, item) => sum + (Number(item.subtotal) || 0), 0);
        const pointsToDeduct = Math.max(0, Number(order.pointsEarned) || 0);

        const returnRecord = {
          localId: returnLocalId,
          returnCode,
          orderLocalId: order.localId,
          orderCode: order.orderCode || '',
          exchangeOrderLocalId: '',
          exchangeOrderCode: '',
          cashierId,
          cashierName: effectiveCashierName,
          customerLocalId: order.customerLocalId || null,
          customerPhone: order.customerPhone || null,
          totalReturnAmount,
          totalExchangeAmount: 0,
          netAmount: -totalReturnAmount,
          paymentMethod: order.paymentMethod || 'cash',
          amountPaid: 0,
          createdAt: now,
          synced: false,
          exchangeItems: [],
          pointsDelta: pointsToDeduct > 0 ? -pointsToDeduct : 0,
          pointsAddedExchange: 0,
          pointsDeductedReturn: pointsToDeduct,
        };

        // eslint-disable-next-line no-await-in-loop
        await db.transaction('rw', db.returns, db.return_items, db.products, db.orders, db.order_items, db.customers, async () => {
          await db.returns.add(returnRecord);
          if (returnItemRecords.length > 0) {
            await db.return_items.bulkAdd(returnItemRecords);
          }

          for (const item of returnItemRecords) {
            const product = productById.get(item.productLocalId) || (await db.products.get(item.productLocalId));
            if (!product) continue;
            const nextStock = (Number(product.stock) || 0) + (Number(item.qty) || 0);
            await db.products.update(product.localId, {
              stock: nextStock,
              updatedAt: now,
              synced: false,
            });
            productById.set(product.localId, { ...product, stock: nextStock });
          }

          await db.order_items.where('orderLocalId').equals(order.localId).delete();
          await db.orders.update(order.localId, {
            status: 'returned',
            subtotalAmount: 0,
            totalAmount: 0,
            updatedAt: now,
            synced: false,
          });

          if (pointsToDeduct > 0) {
            const customer =
              (order.customerLocalId && customerById.get(order.customerLocalId)) ||
              (order.customerPhone && customerByPhone.get(String(order.customerPhone || '').trim()));
            if (customer) {
              const nextPoints = Math.max(0, (Number(customer.points) || 0) - pointsToDeduct);
              await db.customers.update(customer.localId, {
                points: nextPoints,
                updatedAt: now,
                synced: false,
              });
              const updatedCustomer = { ...customer, points: nextPoints };
              customerById.set(customer.localId, updatedCustomer);
              customerByPhone.set(String(customer.phone || '').trim(), updatedCustomer);
            }
          }
        });

        processed += 1;
      }

      if (processed > 0) {
        showSnackbar(`Đã trả nhanh ${processed} hóa đơn`, 'success');
        setQuickReturnSelection(new Set());
        await loadReturnOrders();
        syncReturnsToServer().catch((error) => console.warn('Sync returns failed:', error));
        syncOrdersToServer().catch((error) => console.warn('Sync orders failed:', error));
        syncMasterToServer().catch((error) => console.warn('Sync master failed:', error));
      } else {
        showSnackbar('Không có hóa đơn hợp lệ để trả nhanh', 'warning');
      }
    } catch (error) {
      console.error('Lỗi trả nhanh:', error);
      showSnackbar('Trả nhanh thất bại', 'error');
    } finally {
      setQuickReturnProcessing(false);
    }
  }, [cashierId, effectiveCashierName, loadReturnOrders, quickReturnSelection, syncMasterToServer, syncOrdersToServer, syncReturnsToServer]);

  const handleUpdateReturnQty = (productLocalId, newQty) => {
    updateCurrentInvoice({
      returnItems: returnItems.map(item => {
        if (item.product.localId === productLocalId) {
          const maxQty = typeof item.maxQty === 'number' ? item.maxQty : newQty;
          return { ...item, qty: Math.min(Math.max(newQty, 0), maxQty) };
        }
        return item;
      })
    });
  };

  const handleReturnCheckout = async () => {
    if (!returnOrder) {
      showSnackbar('Vui lòng chọn hóa đơn trả hàng', 'warning');
      return;
    }

    const itemsToReturn = returnItems.filter(item => (Number(item.qty) || 0) > 0);
    if (itemsToReturn.length === 0) {
      showSnackbar('Vui lòng chọn sản phẩm cần trả', 'warning');
      return;
    }
    if (paymentMethod === 'bank' && returnNeedToPay > 0 && !bankTransferVerified) {
      showSnackbar('Chưa xác nhận giao dịch chuyển khoản', 'warning');
      return;
    }

    try {
      const returnLocalId = generateLocalId();
      const returnCode = await generateReturnCode();
      const now = Date.now();
      const hasExchangeItems = cartItems.length > 0;

      // Khi có đổi hàng: cập nhật đơn gốc, không tạo đơn mới
      const remainingItems = returnItems
        .map((item) => ({
          product: item.product,
          qty: Math.max(0, (typeof item.maxQty === 'number' ? item.maxQty : 0) - (Number(item.qty) || 0)),
          basePrice: item.basePrice,
          discount: item.discount,
          discountType: item.discountType,
        }))
        .filter((x) => x.qty > 0);

      // Gộp theo productLocalId; giữ đúng giá bán / giảm giá của từng dòng
      const byProduct = new Map();
      for (const it of [...remainingItems, ...cartItems]) {
        const line = normalizeCartLine(it);
        const key = line.product?.localId ?? '';
        const existing = byProduct.get(key);
        if (existing) {
          // Cùng mã: cộng SL, giữ pricing của dòng đã có nếu cùng đơn giá; nếu khác thì ưu tiên dòng mới hơn (hàng đổi)
          if (Number(existing.unitPrice) === Number(line.unitPrice)
            && Number(existing.discount) === Number(line.discount)
            && existing.discountType === line.discountType) {
            existing.qty += line.qty;
            existing.subtotal = existing.unitPrice * existing.qty;
          } else {
            // Khác giá: cộng SL theo giá dòng sau (hàng đổi / dòng mới)
            const nextQty = existing.qty + line.qty;
            byProduct.set(key, {
              ...line,
              qty: nextQty,
              subtotal: line.unitPrice * nextQty,
            });
          }
        } else {
          byProduct.set(key, { ...line });
        }
      }
      const mergedLines = Array.from(byProduct.values()).filter((x) => x.qty > 0);
      const mergedSubtotal = mergedLines.reduce((sum, it) => sum + (Number(it.subtotal) || 0), 0);
      const mergedOrderDiscount = Number(orderDiscount) || 0;
      const mergedTotal = Math.max(0, mergedSubtotal - (mergedOrderDiscount || 0));

      /** Điểm trả/đổi tính theo tiền chênh lệch thực trả: netAmount > 0 cộng điểm, netAmount < 0 trừ điểm */
      const POINTS_PER_VND = 50000;
      const absNet = Math.abs(Number(netAmount) || 0);
      const netPoints = Math.floor(absNet / POINTS_PER_VND);
      const pointsDelta = netAmount >= 0 ? netPoints : -netPoints;
      const pointsAddedExchange = pointsDelta > 0 ? pointsDelta : 0;
      const pointsDeductedReturn = pointsDelta < 0 ? Math.abs(pointsDelta) : 0;

      const pricedExchangeLines = cartItems.map((item) => normalizeCartLine(item));
      const pricedReturnLines = itemsToReturn.map((item) => normalizeCartLine(item));

      const returnRecord = {
        localId: returnLocalId,
        returnCode,
        orderLocalId: returnOrder.localId,
        // Backend sync validator không nhận null cho các field string optional
        orderCode: returnOrder.orderCode || '',
        exchangeOrderLocalId: '',
        exchangeOrderCode: '',
        cashierId,
        cashierName: effectiveCashierName,
        customerLocalId: customerLocalId || returnOrder.customerLocalId || null,
        customerPhone: customerPhone || returnOrder.customerPhone || null,
        totalReturnAmount: returnTotalAmount,
        totalExchangeAmount: hasExchangeItems
          ? pricedExchangeLines.reduce((s, it) => s + (Number(it.subtotal) || 0), 0)
          : 0,
        netAmount,
        paymentMethod,
        amountPaid,
        createdAt: now,
        synced: false,
        exchangeItems: pricedExchangeLines.map((line) => ({
          productLocalId: line.product?.localId,
          productCode: line.product?.productCode || '',
          productName: line.product?.name || '',
          basePrice: line.basePrice,
          discount: line.discount,
          discountType: line.discountType,
          price: line.unitPrice,
          qty: line.qty,
          subtotal: line.subtotal,
        })),
        pointsDelta,
        pointsAddedExchange,
        pointsDeductedReturn,
      };

      const returnItemRecords = pricedReturnLines.map((line) => ({
        returnLocalId,
        productLocalId: line.product?.localId,
        productName: line.product?.name || '',
        productCode: line.product?.productCode || '',
        basePrice: line.basePrice,
        discount: line.discount,
        discountType: line.discountType,
        price: line.unitPrice,
        qty: line.qty,
        subtotal: line.subtotal,
      }));

      await db.transaction('rw', db.returns, db.return_items, db.products, db.orders, db.order_items, db.customers, async () => {
        await db.returns.add(returnRecord);
        if (returnItemRecords.length > 0) {
          await db.return_items.bulkAdd(returnItemRecords);
        }

        // Tính items còn lại sau khi trả (dùng cho cả đổi hàng & trả một phần)
        const remainingLinesForOrder = returnItems
          .map((item) => normalizeCartLine({
            product: item.product,
            qty: Math.max(0, (typeof item.maxQty === 'number' ? item.maxQty : 0) - (Number(item.qty) || 0)),
            basePrice: item.basePrice,
            discount: item.discount,
            discountType: item.discountType,
          }))
          .filter((x) => x.qty > 0);

        if (hasExchangeItems) {
          // Cập nhật đơn gốc: thay items bằng (hàng còn lại sau trả + hàng đổi)
          await db.order_items.where('orderLocalId').equals(returnOrder.localId).delete();
          const newOrderItems = mergedLines.map((line) => toOrderItemDoc(returnOrder.localId, line));
          if (newOrderItems.length > 0) {
            await db.order_items.bulkAdd(newOrderItems);
          }
          await db.orders.update(returnOrder.localId, {
            subtotalAmount: mergedSubtotal,
            totalAmount: mergedTotal,
            discount: mergedOrderDiscount,
            discountType: discountType || 'vnd',
            note: orderNote || '',
            status: 'completed',
            updatedAt: now,
            synced: false,
          });
        } else {
          // Trả hàng KHÔNG đổi: nếu trả hết -> returned; nếu trả 1 phần -> cập nhật lại HD gốc (giữ completed)
          const returnedAll = remainingLinesForOrder.length === 0;
          if (returnedAll) {
            await db.order_items.where('orderLocalId').equals(returnOrder.localId).delete();
            await db.orders.update(returnOrder.localId, {
              status: 'returned',
              subtotalAmount: 0,
              totalAmount: 0,
              updatedAt: now,
              synced: false,
            });
          } else {
            await db.order_items.where('orderLocalId').equals(returnOrder.localId).delete();
            const remainOrderItems = remainingLinesForOrder.map((line) =>
              toOrderItemDoc(returnOrder.localId, line)
            );
            if (remainOrderItems.length > 0) {
              await db.order_items.bulkAdd(remainOrderItems);
            }
            const remainSubtotal = remainOrderItems.reduce((s, it) => s + (Number(it.subtotal) || 0), 0);
            await db.orders.update(returnOrder.localId, {
              subtotalAmount: remainSubtotal,
              totalAmount: remainSubtotal,
              discount: 0,
              pointPaymentEnabled: false,
              pointPaymentPoints: 0,
              discountType: 'vnd',
              status: 'completed',
              updatedAt: now,
              synced: false,
            });
          }
        }

        for (const item of itemsToReturn) {
          const product = await db.products.get(item.product.localId);
          if (product) {
            await db.products.update(item.product.localId, {
              stock: product.stock + item.qty,
              updatedAt: now,
              synced: false,
            });
          }
        }

        for (const item of cartItems) {
          const product = await db.products.get(item.product.localId);
          if (product) {
            await db.products.update(item.product.localId, {
              stock: product.stock - item.qty,
              updatedAt: now,
              synced: false,
            });
          }
        }

        if (pointsDelta !== 0) {
          let cust = null;
          const cid = customerLocalId || returnOrder.customerLocalId;
          if (cid) cust = await db.customers.get(cid);
          if (!cust) {
            const ph = String(customerPhone || returnOrder.customerPhone || '').trim();
            if (ph) cust = await db.customers.where('phone').equals(ph).first();
          }
          if (cust) {
            const newPts = Math.max(0, (Number(cust.points) || 0) + pointsDelta);
            await db.customers.update(cust.localId, {
              points: newPts,
              updatedAt: now,
              synced: false,
            });
          }
        }
      });

      if (hasExchangeItems && returnOrder.orderCode) {
        try {
          await apiRequest(`/api/orders/${returnOrder.orderCode}/replace`, {
            method: 'POST',
            body: JSON.stringify({
              localId: returnOrder.localId,
              orderCode: returnOrder.orderCode || '',
              subtotalAmount: mergedSubtotal,
              totalAmount: mergedTotal,
              discount: mergedOrderDiscount,
              discountType: discountType || 'vnd',
              paymentMethod,
              customerLocalId: customerLocalId || returnOrder.customerLocalId || null,
              customerPhone: customerPhone || returnOrder.customerPhone || null,
              note: orderNote || '',
              items: mergedLines.map((line) => ({
                productLocalId: line.product?.localId,
                productCode: line.product?.productCode || '',
                productName: line.product?.name || '',
                basePrice: Number(line.basePrice) || 0,
                discount: Number(line.discount) || 0,
                discountType: line.discountType || 'vnd',
                price: Number(line.unitPrice) || 0,
                qty: Number(line.qty) || 0,
                subtotal: Number(line.subtotal) || 0,
              })),
            }),
          });
          await db.orders.update(returnOrder.localId, { synced: true });
        } catch (replaceErr) {
          console.warn('Replace order on server failed:', replaceErr);
          showSnackbar('Đã lưu trả hàng; cần đồng bộ đơn hàng lên server', 'warning');
        }
      }

      const ptsDetail =
        pointsAddedExchange > 0 || pointsDeductedReturn > 0
          ? ` (${[pointsAddedExchange > 0 ? `+${pointsAddedExchange} đổi` : '', pointsDeductedReturn > 0 ? `−${pointsDeductedReturn} trả` : ''].filter(Boolean).join(', ')})`
          : '';
      const ptsMsg =
        pointsDelta !== 0 ? ` — Điểm ${pointsDelta > 0 ? '+' : ''}${pointsDelta}${ptsDetail}` : '';
      showSnackbar(`Đã lưu đơn trả hàng ${returnCode}${ptsMsg}`, 'success');
      syncReturnsToServer().catch((error) => {
        console.warn('Sync returns failed:', error);
      });
      if (!hasExchangeItems) {
        syncOrdersToServer().catch((error) => {
          console.warn('Sync orders failed:', error);
        });
      }
      syncMasterToServer().catch((error) => {
        console.warn('Sync master failed:', error);
      });
      updateCurrentInvoice({
        returnMode: false,
        returnOrder: null,
        returnItems: [],
        exchangeItems: [],
        items: [],
        amountPaid: 0,
        paymentMethod: 'cash',
        customerPhone: '',
        customerLocalId: '',
        customerName: '',
        customerDebt: 0,
        customerPoints: 0,
        pointPaymentEnabled: false,
        pointPaymentPoints: 0,
        customerSearchTerm: '',
      });
      // Ép clear lần nữa để tránh UI dính tên khách sau khi trả hàng
      setTimeout(() => {
        updateCurrentInvoice({
          customerPhone: '',
          customerLocalId: '',
          customerName: '',
          customerDebt: 0,
          customerPoints: 0,
          pointPaymentEnabled: false,
          pointPaymentPoints: 0,
          customerSearchTerm: '',
        });
      }, 0);
    } catch (error) {
      console.error('Lỗi khi trả hàng:', error);
      showSnackbar('Có lỗi khi lưu đơn trả hàng', 'error');
    }
  };

  const handleOpenReturnDetail = async (record) => {
    if (!record) return;
    try {
      setReturnDetailLoading(true);
      await db.open();
      const returnItems = await db.return_items
        .where('returnLocalId')
        .equals(record.localId)
        .toArray();
      const exchangeItems = Array.isArray(record.exchangeItems) ? record.exchangeItems : [];

      setReturnDetail({
        ...record,
        returnItems,
        exchangeItems,
      });
      setReturnDetailOpen(true);
    } catch (error) {
      console.error('Lỗi tải chi tiết hóa đơn đổi trả:', error);
      showSnackbar('Không thể tải chi tiết hóa đơn đổi trả', 'error');
    } finally {
      setReturnDetailLoading(false);
    }
  };

  // Mở dialog trả hàng từ backend (dùng cho phần hiển thị "link" trong modal chi tiết HD)
  const openReturnDetailFromApi = async (returnIdOrCode) => {
    if (!returnIdOrCode) return;
    try {
      setReturnDetailLoading(true);
      const res = await apiRequest(`/api/returns/${encodeURIComponent(returnIdOrCode)}`);
      const ret = res?.return;
      if (!ret) return;
      setReturnDetail({
        ...ret,
        returnItems: Array.isArray(res?.returnItems) ? res.returnItems : [],
        exchangeItems: Array.isArray(res?.exchangeItems) ? res.exchangeItems : [],
      });
      setReturnDetailOpen(true);
    } catch (e) {
      console.error(e);
      showSnackbar('Không tải được chi tiết trả hàng', 'error');
    } finally {
      setReturnDetailLoading(false);
    }
  };

  // Mở dialog chi tiết hóa đơn bán hàng (từ lịch sử bán/trả hoặc popup chọn HĐ trả)
  const handleOpenOrderHistoryDetail = async (order) => {
    if (!order) return;
    const orderIdOrCode = order?.orderCode || order?.localId || '';
    if (!orderIdOrCode) return;
    try {
      setOrderHistoryDetailLoading(true);
      setOrderHistoryDetailOpen(true);

      const res = await apiRequest(`/api/orders/${encodeURIComponent(orderIdOrCode)}`);
      const ord = res?.order;
      if (!ord) return;

      const rawLineItems = Array.isArray(res?.invoiceLineItems)
        ? res.invoiceLineItems
        : (Array.isArray(res?.items) ? res.items : []);

      const dbCurrentItems = rawLineItems.map((it) => normalizeHistoryLine(it));

      await db.open();
      let customer = null;
      if (ord.customerLocalId) {
        customer = await db.customers.get(ord.customerLocalId);
      }
      if (!customer && ord.customerPhone) {
        customer = await db.customers.where('phone').equals(String(ord.customerPhone).trim()).first();
      }

      const dob = customer?.dateOfBirth || customer?.birthday || customer?.dob || '';
      const customerName =
        ord.customerName ||
        ord.customerLabel ||
        formatCustomerLabel(customer) ||
        '';

      const returnIds = Array.isArray(ord?.returnIds) ? ord.returnIds : [];
      const returnDetailResults = returnIds.length
        ? await Promise.allSettled(
          returnIds.map((rid) => apiRequest(`/api/returns/${encodeURIComponent(rid)}`)),
        )
        : [];
      const returnDetails = returnDetailResults
        .filter((r) => r.status === 'fulfilled' && r.value?.return)
        .map((r) => {
          const v = r.value;
          return {
            ...(v?.return || {}),
            returnItems: (Array.isArray(v?.returnItems) ? v.returnItems : []).map(normalizeHistoryLine),
            exchangeItems: (Array.isArray(v?.exchangeItems) ? v.exchangeItems : []).map(normalizeHistoryLine),
          };
        })
        .sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));

      const hasReturns = returnDetails.length > 0;
      const lastReturn = hasReturns ? returnDetails[returnDetails.length - 1] : null;
      const lastExchangeItems = lastReturn?.exchangeItems || [];

      // Đơn gốc: snapshot → hoặc dựng ngược từ lịch sử (ưu tiên điểm neo = hàng đổi lần cuối, không tin DB lệch)
      let originalItems = Array.isArray(ord.originalItems) && ord.originalItems.length > 0
        ? ord.originalItems.map(normalizeHistoryLine)
        : [];
      if (!originalItems.length && hasReturns) {
        const anchor =
          lastExchangeItems.length > 0 ? lastExchangeItems : dbCurrentItems;
        originalItems = reconstructOriginalItems(anchor, returnDetails);
      }
      if (!originalItems.length) {
        originalItems = dbCurrentItems;
      }

      const originalGoodsSubtotal = originalItems.reduce((sum, it) => sum + (Number(it.subtotal) || 0), 0);
      const originalTotalAmount =
        Number(ord.originalTotalAmount) > 0
          ? Number(ord.originalTotalAmount)
          : originalGoodsSubtotal;

      // Đơn hiện tại: khi có đổi trả, luôn replay lịch sử (tránh đọc nhầm order_items cũ do bug replace)
      let currentItems = hasReturns
        ? reconstructCurrentItems(originalItems, returnDetails)
        : dbCurrentItems;
      if (!currentItems.length && dbCurrentItems.length && !hasReturns) {
        currentItems = dbCurrentItems;
      }
      // Nếu replay ra rỗng nhưng lần trả cuối có mua lại → lấy hàng đổi lần cuối
      if (hasReturns && !currentItems.length && lastExchangeItems.length > 0) {
        currentItems = lastExchangeItems.map(normalizeHistoryLine);
      }

      const currentGoodsSubtotal = currentItems.reduce((sum, it) => sum + (Number(it.subtotal) || 0), 0);
      const currentTotalAmount = currentItems.length > 0
        ? currentGoodsSubtotal
        : (Number(ord.totalAmount) || 0);

      const showRepurchaseSection = hasReturns || (
        Number(originalTotalAmount) > 0
        && Number(currentTotalAmount) !== Number(originalTotalAmount)
      );

      setOrderHistoryDetail({
        ...ord,
        customerName: customerName || 'Khách lẻ',
        customerPhone: ord.customerPhone || customer?.phone || '',
        customerEmail: customer?.email || '',
        customerAddress: customer?.address || '',
        customerDateOfBirth: dob,
        customerAge: calcAgeFromDob(dob),
        customerCode: customer?.customerCode || ord.customerCode || '',
        customerLocalId: ord.customerLocalId || customer?.localId || '',
        invoiceLineItems: originalItems,
        invoiceGoodsSubtotal: originalGoodsSubtotal,
        originalItems,
        originalGoodsSubtotal,
        originalTotalAmount,
        currentItems,
        currentGoodsSubtotal,
        currentTotalAmount,
        showRepurchaseSection,
        returnDetails,
      });

      // Sửa lại order_items trong DB nếu đang lệch so với trạng thái đúng sau đổi trả
      const realOrderId = ord.localId;
      if (realOrderId && hasReturns && currentItems.length > 0) {
        const dbSig = dbCurrentItems.map((x) => `${x.productLocalId}:${x.qty}:${x.price}`).sort().join('|');
        const curSig = currentItems.map((x) => `${x.productLocalId}:${x.qty}:${x.price}`).sort().join('|');
        if (dbSig !== curSig) {
          (async () => {
            try {
              await db.order_items.where('orderLocalId').equals(realOrderId).delete();
              await db.order_items.bulkAdd(
                currentItems.map((it) => ({
                  orderLocalId: realOrderId,
                  productLocalId: it.productLocalId,
                  productCode: it.productCode || '',
                  productName: it.productName || '',
                  basePrice: Number(it.basePrice) || Number(it.price) || 0,
                  discount: Number(it.discount) || 0,
                  discountType: it.discountType || 'vnd',
                  price: Number(it.price) || 0,
                  qty: Number(it.qty) || 0,
                  subtotal: Number(it.subtotal) || 0,
                }))
              );
              await db.orders.update(realOrderId, {
                subtotalAmount: currentGoodsSubtotal,
                totalAmount: currentTotalAmount,
                updatedAt: Date.now(),
                synced: false,
                ...(Array.isArray(ord.originalItems) && ord.originalItems.length
                  ? {}
                  : {
                      originalItems: originalItems.map(({ orderLocalId: _x, ...rest }) => rest),
                      originalTotalAmount,
                      originalSubtotalAmount: originalGoodsSubtotal,
                    }),
              });
            } catch (repairErr) {
              console.warn('Repair order items after exchange history failed:', repairErr);
            }
          })();
        } else if (
          (!Array.isArray(ord.originalItems) || ord.originalItems.length === 0)
          && originalItems.length > 0
        ) {
          db.orders.update(realOrderId, {
            originalItems: originalItems.map(({ orderLocalId: _x, ...rest }) => rest),
            originalTotalAmount,
            originalSubtotalAmount: originalGoodsSubtotal,
          }).catch(() => {});
        }
      }
    } catch (e) {
      console.error(e);
      showSnackbar('Không tải được chi tiết hóa đơn', 'error');
    } finally {
      setOrderHistoryDetailLoading(false);
    }
  };

  const openProductMini = (it) => {
    if (!it) return;
    setProductMini(it);
    setProductMiniOpen(true);
  };


  // Cập nhật state của hóa đơn hiện tại
  const updateCurrentInvoice = (updates) => {
    setInvoices(prev => ({
      ...prev,
      [activeInvoiceIndex]: {
        ...prev[activeInvoiceIndex],
        ...updates
      }
    }));
  };

  const closeInvoiceByTabIndex = useCallback((tabIndex) => {
    if (invoiceTabs.length <= 1 || tabIndex < 0 || tabIndex >= invoiceTabs.length) return;
    const newTabs = invoiceTabs.filter((_, i) => i !== tabIndex);
    const closedInvoiceId = invoiceTabs[tabIndex].id;
    setInvoiceTabs(newTabs);
    setInvoices((prev) => {
      const newInvoices = { ...prev };
      delete newInvoices[closedInvoiceId];
      return newInvoices;
    });
    if (activeInvoiceIndex === closedInvoiceId) {
      const nextIndex = tabIndex >= newTabs.length ? newTabs.length - 1 : tabIndex;
      const nextActiveId = newTabs[nextIndex]?.id ?? newTabs[0]?.id ?? 0;
      setActiveInvoiceIndex(nextActiveId);
    }
  }, [activeInvoiceIndex, invoiceTabs]);

  const handleRequestCloseInvoice = useCallback((tabIndex) => {
    if (invoiceTabs.length <= 1) return;
    const tab = invoiceTabs[tabIndex];
    if (!tab) return;
    const invoiceId = tab.id;
    const invoice = invoices[invoiceId];
    if (!isInvoiceDirty(invoice)) {
      closeInvoiceByTabIndex(tabIndex);
      return;
    }
    setPendingCloseTabIndex(tabIndex);
    setCloseInvoiceConfirmOpen(true);
  }, [closeInvoiceByTabIndex, invoiceTabs, invoices]);

  /**
   * Hàm xử lý thêm sản phẩm vào giỏ hàng
   * @param {Object} product - Object sản phẩm cần thêm
   * 
   * Logic:
   * 1. Kiểm tra tồn kho
   * 2. Tìm sản phẩm trong giỏ hàng hiện tại
   * 3. Nếu đã có: Tăng số lượng
   * 4. Nếu chưa có: Thêm mới vào giỏ
   */
  const handleAddToCart = (product) => {
    const cartItemsKey = isReturnMode ? 'exchangeItems' : 'items';
    const existingIndex = cartItems.findIndex((item) => item.product.localId === product.localId);

    // Thu ngan quet lien tuc: mat hang vua quet luon duoc don len dau danh sach
    // de de kiem tra "quet da vao hoa don hay chua".
    if (existingIndex >= 0) {
      const existingItem = cartItems[existingIndex];
      const reordered = [
        { ...existingItem, qty: (Number(existingItem.qty) || 0) + 1 },
        ...cartItems.slice(0, existingIndex),
        ...cartItems.slice(existingIndex + 1),
      ];
      updateCurrentInvoice({ [cartItemsKey]: reordered });
      return;
    }

    const nextItems = [{ product, qty: 1 }, ...cartItems];
    updateCurrentInvoice({
      [cartItemsKey]: nextItems,
    });
    showSnackbar(`Đã thêm "${product.name}" vào hóa đơn`, 'success');

    // Không xóa search term để có thể thêm nhiều sản phẩm cùng lúc
  };

  /**
   * Hàm cập nhật số lượng sản phẩm trong hóa đơn
   * @param {string} productLocalId - ID của sản phẩm cần cập nhật
   * @param {number} newQty - Số lượng mới
   * 
   * Logic:
   * 1. Nếu số lượng <= 0: Xóa sản phẩm khỏi giỏ
   * 2. Nếu số lượng > tồn kho: Cảnh báo và giữ nguyên
   * 3. Nếu hợp lệ: Cập nhật số lượng
   */
  const handleUpdateQty = (productLocalId, newQty) => {
    // Nếu số lượng <= 0, xóa sản phẩm khỏi giỏ hàng
    if (newQty <= 0) {
      handleRemoveFromCart(productLocalId);
      return;
    }

    // Map qua mảng items để tìm và cập nhật sản phẩm
    // map(): Tạo mảng mới với cùng số phần tử, có thể thay đổi giá trị
    const updatedItems = cartItems.map(item => {
      // Nếu là sản phẩm cần cập nhật
      if (item.product.localId === productLocalId) {
        // Cập nhật số lượng: Spread operator để giữ nguyên các thuộc tính khác
        return { ...item, qty: newQty };
      }
      // Nếu không phải sản phẩm cần cập nhật, giữ nguyên
      return item;
    });

    // Cập nhật state với mảng items mới
    const cartItemsKey = isReturnMode ? 'exchangeItems' : 'items';
    updateCurrentInvoice({ [cartItemsKey]: updatedItems });
  };

  // Cập nhật đơn giá + giảm giá + giá bán cho dòng hàng (flow giống KiotViet)
  const handleUpdateItemPricing = (productLocalId, { price, discount, discountType }) => {
    const nextPrice = Math.max(0, Math.round(Number(price) || 0));
    const nextDiscount = Math.max(0, Number(discount) || 0);
    const nextType = discountType === 'percent' ? 'percent' : 'vnd';
    const updatedItems = cartItems.map((item) => {
      if (item.product.localId !== productLocalId) return item;
      return {
        ...item,
        product: { ...item.product, price: nextPrice },
        discount: nextDiscount,
        discountType: nextType,
      };
    });
    const cartItemsKey = isReturnMode ? 'exchangeItems' : 'items';
    updateCurrentInvoice({ [cartItemsKey]: updatedItems });
  };

  // Legacy: chỉ cập nhật discount
  const handleUpdateDiscount = (productLocalId, discount, discountType) => {
    const item = cartItems.find((i) => i.product.localId === productLocalId);
    handleUpdateItemPricing(productLocalId, {
      price: Number(item?.product?.price) || 0,
      discount,
      discountType,
    });
  };

  // Xóa sản phẩm khỏi hóa đơn hiện tại
  const handleRemoveFromCart = (productLocalId) => {
    const cartItemsKey = isReturnMode ? 'exchangeItems' : 'items';
    updateCurrentInvoice({
      [cartItemsKey]: cartItems.filter(item => item.product.localId !== productLocalId)
    });
  };

  // Tính tổng tiền hàng (sau giảm giá từng sản phẩm)
  const calculateItemFinalPrice = (item) => {
    const basePrice = item.product.price;
    const itemDiscount = item.discount || 0;
    const itemDiscountType = item.discountType || 'vnd';
    
    if (itemDiscountType === 'percent') {
      return basePrice * (1 - itemDiscount / 100);
    } else {
      return Math.max(0, basePrice - itemDiscount);
    }
  };

  // Tính tổng tiền hàng (sau giảm giá từng sản phẩm)
  const subtotalAmount = cartItems.reduce((sum, item) => {
    const finalPrice = calculateItemFinalPrice(item);
    return sum + (finalPrice * item.qty);
  }, 0);

  // Tính giảm giá chung
  const calculateOrderDiscount = () => {
    if (!discount || discount === 0) return 0;
    if (discountType === 'percent') {
      return subtotalAmount * (discount / 100);
    } else {
      return Math.min(discount, subtotalAmount); // Không được giảm quá tổng tiền
    }
  };

  const orderDiscount = calculateOrderDiscount();
  const totalAmount = Math.max(0, subtotalAmount - orderDiscount);
  const pointPaymentFeatureAvailable = loyaltySettings?.enabled !== false && loyaltySettings?.allowPointPayment !== false;
  const pointPaymentEnabled = pointPaymentFeatureAvailable && pointPaymentEnabledByInvoice;
  const redeemPoints = Math.max(1, Number(loyaltySettings?.redeemPoints) || 1);
  const redeemAmount = Math.max(1, Number(loyaltySettings?.redeemAmount) || 1000);
  const maxRedeemPointsByBalance = Math.floor((Number(customerPoints) || 0) / redeemPoints) * redeemPoints;
  const maxRedeemPointsByAmount = Math.floor(totalAmount / redeemAmount) * redeemPoints;
  const maxRedeemPoints = pointPaymentFeatureAvailable && (customerLocalId || customerPhone)
    ? Math.max(0, Math.min(maxRedeemPointsByBalance, maxRedeemPointsByAmount))
    : 0;
  const normalizedPointPaymentPoints =
    pointPaymentEnabled
      ? Math.min(Math.max(0, Math.floor(pointPaymentPoints / redeemPoints) * redeemPoints), maxRedeemPoints)
      : 0;
  const pointPaymentAmount = Math.floor(normalizedPointPaymentPoints / redeemPoints) * redeemAmount;
  const payableAfterPoints = Math.max(0, totalAmount - pointPaymentAmount);

  const returnTotalAmount = returnItems.reduce((sum, item) => {
    const line = normalizeCartLine({ ...item, qty: Number(item.qty) || 0 });
    return sum + (Number(line.subtotal) || 0);
  }, 0);
  const returnTotalQty = returnItems.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
  const exchangeTotalQty = cartItems.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
  const netAmount = totalAmount - returnTotalAmount;
  const returnNeedToPay = Math.abs(netAmount);
  const returnQuickAmounts = [
    returnNeedToPay,
    returnNeedToPay + 3000,
    returnNeedToPay + 8000,
    60000,
    100000,
    200000,
    500000
  ].filter(amount => amount > 0).slice(0, 7);
  const filteredReturnItems = isReturnMode && searchTerm.trim()
    ? returnItems.filter(item => {
        const term = searchTerm.trim().toLowerCase();
        const name = item.product?.name?.toLowerCase() || '';
        const barcode = item.product?.barcode?.toLowerCase() || '';
        return name.includes(term) || barcode.includes(term);
      })
    : returnItems;

  const { handlePrintInvoice } = usePrintService({
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
  });

  const buildReportRange = useCallback(() => {
    if (reportType === 'day') {
      const start = new Date(reportDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(reportDate);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    if (reportType === 'month') {
      const [year, month] = reportMonth.split('-').map(Number);
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0, 23, 59, 59, 999);
      return { start, end };
    }
    if (reportType === 'quarter') {
      const quarter = Number(reportQuarter);
      const startMonth = (quarter - 1) * 3;
      const start = new Date(reportYear, startMonth, 1);
      const end = new Date(reportYear, startMonth + 3, 0, 23, 59, 59, 999);
      return { start, end };
    }
    if (reportType === 'year') {
      const start = new Date(reportYear, 0, 1);
      const end = new Date(reportYear, 11, 31, 23, 59, 59, 999);
      return { start, end };
    }
    const start = new Date(reportLunarYear, 0, 1);
    const end = new Date(reportLunarYear, 11, 31, 23, 59, 59, 999);
    return { start, end };
  }, [reportType, reportDate, reportMonth, reportQuarter, reportYear, reportLunarYear]);

  const buildReportBuckets = useCallback((rangeStart) => {
    if (reportType === 'day') {
      return [
        {
          label: 'Ngày',
          start: new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate(), 0, 0, 0, 0),
          end: new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate(), 23, 59, 59, 999)
        }
      ];
    }
    if (reportType === 'month') {
      const daysInMonth = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + 1, 0).getDate();
      return Array.from({ length: daysInMonth }, (_, idx) => {
        const day = idx + 1;
        return {
          label: `${day}`,
          start: new Date(rangeStart.getFullYear(), rangeStart.getMonth(), day, 0, 0, 0, 0),
          end: new Date(rangeStart.getFullYear(), rangeStart.getMonth(), day, 23, 59, 59, 999)
        };
      });
    }
    if (reportType === 'quarter') {
      const quarterStartMonth = (Number(reportQuarter) - 1) * 3;
      return Array.from({ length: 3 }, (_, idx) => {
        const month = quarterStartMonth + idx;
        const start = new Date(reportYear, month, 1);
        const end = new Date(reportYear, month + 1, 0, 23, 59, 59, 999);
        return {
          label: `T${month + 1}`,
          start,
          end
        };
      });
    }
    return Array.from({ length: 12 }, (_, idx) => {
      const start = new Date(rangeStart.getFullYear(), idx, 1);
      const end = new Date(rangeStart.getFullYear(), idx + 1, 0, 23, 59, 59, 999);
      return {
        label: `T${idx + 1}`,
        start,
        end
      };
    });
  }, [reportType, reportQuarter, reportYear]);

  const loadSalesReport = useCallback(async () => {
    try {
      setReportLoading(true);
      await db.open().catch(() => {});
      const [orders, orderItems, products] = await Promise.all([
        db.orders.toArray(),
        db.order_items.toArray(),
        db.products.toArray()
      ]);
      const { start, end } = buildReportRange();
      const startTime = start.getTime();
      const endTime = end.getTime();
      const buckets = buildReportBuckets(start, end).map((bucket) => ({
        ...bucket,
        totalCost: 0,
        totalSales: 0,
        totalProfit: 0,
        orderCount: 0
      }));

      const productCostMap = new Map(
        products.map((product) => [product.localId, Number(product.costPrice) || 0])
      );
      const itemsByOrder = new Map();
      orderItems.forEach((item) => {
        if (!itemsByOrder.has(item.orderLocalId)) {
          itemsByOrder.set(item.orderLocalId, []);
        }
        itemsByOrder.get(item.orderLocalId).push(item);
      });

      let totalSales = 0;
      let totalCost = 0;
      let orderCount = 0;

      const quarterStartMonth = (Number(reportQuarter) - 1) * 3;
      orders.forEach((order) => {
        if (order?.status !== 'completed') return;
        const createdAt = Number(order.createdAt) || 0;
        if (createdAt < startTime || createdAt > endTime) return;
        orderCount += 1;
        totalSales += Number(order.totalAmount) || 0;

        const items = itemsByOrder.get(order.localId) || [];
        let orderCost = 0;
        items.forEach((item) => {
          const costPrice = productCostMap.get(item.productLocalId) || 0;
          orderCost += costPrice * (Number(item.qty) || 0);
        });
        totalCost += orderCost;

        const createdDate = new Date(createdAt);
        let bucketIndex = -1;
        if (reportType === 'day') {
          bucketIndex = 0;
        } else if (reportType === 'month') {
          const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
          const dayIndex = Math.min(createdDate.getDate(), daysInMonth) - 1;
          bucketIndex = dayIndex;
        } else if (reportType === 'quarter') {
          const monthIndex = createdDate.getMonth();
          bucketIndex = monthIndex - quarterStartMonth;
        } else {
          bucketIndex = createdDate.getMonth();
        }
        if (bucketIndex >= 0) {
          buckets[bucketIndex].totalSales += Number(order.totalAmount) || 0;
          buckets[bucketIndex].totalCost += orderCost;
          buckets[bucketIndex].totalProfit =
            buckets[bucketIndex].totalSales - buckets[bucketIndex].totalCost;
          buckets[bucketIndex].orderCount += 1;
        }
      });

      const totalProfit = totalSales - totalCost;
      setReportData({
        totalCost,
        totalSales,
        totalProfit,
        orderCount,
        buckets
      });
    } catch (error) {
      console.error('Lỗi tải báo cáo bán hàng:', error);
      showSnackbar('Không thể tải báo cáo bán hàng', 'error');
    } finally {
      setReportLoading(false);
    }
  }, [buildReportRange, buildReportBuckets, reportQuarter, reportType]);

  useEffect(() => {
    if (!reportDialogOpen) return;
    loadSalesReport();
  }, [reportDialogOpen, loadSalesReport]);

  const saveBankAccounts = (accounts) => {
    setBankAccounts(accounts);
    localStorage.setItem('pos_bank_accounts', JSON.stringify(accounts));
  };

  const selectedBankAccount =
    bankAccounts.find((account) => account.id === selectedBankAccountId) || null;

  const getBankQrUrl = (account, amount, note) => {
    if (!account?.bankCode || !account?.accountNumber) return '';
    const cleanAmount = Math.max(0, Math.round(amount || 0));
    const addInfo = encodeURIComponent(note || '');
    const accountName = encodeURIComponent(account.accountName || '');
    return `https://img.vietqr.io/image/${account.bankCode}-${account.accountNumber}-compact2.png?amount=${cleanAmount}&addInfo=${addInfo}&accountName=${accountName}`;
  };

  const speakTransferSuccess = useCallback((amount) => {
    try {
      if (typeof window === 'undefined' || !window.speechSynthesis) return;
      const moneyText = Number(amount || 0).toLocaleString('en-US');
      const utter = new SpeechSynthesisUtterance(
        `Đã nhận chuyển khoản thành công số tiền ${moneyText} đồng`,
      );
      utter.lang = 'vi-VN';
      utter.rate = 1;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('Không thể phát loa xác nhận chuyển khoản:', err);
    }
  }, []);

  const openBankVerifyDialog = useCallback((targetAmount) => {
    setBankVerifyAmount(Math.max(0, Math.round(Number(targetAmount) || 0)));
    setBankVerifyDialogOpen(true);
  }, []);

  const confirmBankTransferStatus = useCallback((success) => {
    setBankVerifyDialogOpen(false);
    updateCurrentInvoice({ bankTransferVerified: !!success });
    if (success) {
      showSnackbar('Đã xác nhận chuyển khoản thành công', 'success');
      speakTransferSuccess(bankVerifyAmount);
    } else {
      showSnackbar('Chưa xác nhận chuyển khoản', 'info');
    }
  }, [bankVerifyAmount, speakTransferSuccess]);

  const prevReturnNeedToPayRef = useRef(returnNeedToPay);
  useEffect(() => {
    if (!isReturnMode) {
      prevReturnNeedToPayRef.current = returnNeedToPay;
      return;
    }
    const prevNeedToPay = prevReturnNeedToPayRef.current;
    const shouldAutoUpdate =
      (amountPaid === 0 && returnNeedToPay > 0) ||
      (amountPaid === prevNeedToPay && returnNeedToPay !== prevNeedToPay) ||
      (returnNeedToPay === 0 && amountPaid === prevNeedToPay);

    if (shouldAutoUpdate) {
      updateCurrentInvoice({ amountPaid: returnNeedToPay });
    }
    prevReturnNeedToPayRef.current = returnNeedToPay;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReturnMode, returnNeedToPay, amountPaid]);

  const handleVerifyBankTransfer = () => {
    if (!selectedBankAccount) {
      showSnackbar('Vui lòng chọn tài khoản ngân hàng trước', 'warning');
      return;
    }
    if (amountPaid < payableAfterPoints) {
      showSnackbar('Số tiền thanh toán chưa đủ để xác nhận', 'warning');
      return;
    }
    openBankVerifyDialog(payableAfterPoints);
  };

  const handleVerifyBankTransferReturn = () => {
    if (!selectedBankAccount) {
      showSnackbar('Vui lòng chọn tài khoản ngân hàng trước', 'warning');
      return;
    }
    if (returnNeedToPay > 0 && amountPaid < returnNeedToPay) {
      showSnackbar('Số tiền thanh toán chưa đủ để xác nhận', 'warning');
      return;
    }
    const targetAmount = returnNeedToPay > 0 ? returnNeedToPay : Math.abs(returnNeedToPay);
    openBankVerifyDialog(targetAmount);
  };

  /**
   * Hàm xử lý thanh toán đơn hàng
   * 
   * Logic:
   * 1. Validate: Kiểm tra giỏ hàng không trống, số tiền trả đủ
   * 2. Tạo order object với thông tin đơn hàng
   * 3. Tạo order_items (chi tiết đơn hàng)
   * 4. Cập nhật tồn kho sản phẩm
   * 5. Tính điểm tích lũy và cập nhật khách hàng
   * 6. Lưu vào database
   * 7. Xóa hóa đơn sau khi thanh toán thành công
   */
  const handleCheckout = async () => {
    // Validation: Kiểm tra giỏ hàng không trống
    if (cartItems.length === 0) {
      showSnackbar('Hóa đơn trống!', 'warning');
      return;
    }

    // Validation: Kiểm tra số tiền trả có đủ không
    if (amountPaid < payableAfterPoints) {
      showSnackbar('Số tiền thanh toán không đủ!', 'error');
      return;
    }
    if (paymentMethod === 'bank' && !bankTransferVerified) {
      showSnackbar('Chưa xác nhận giao dịch chuyển khoản', 'warning');
      return;
    }

    try {
      const editMeta = currentInvoice?.editMeta;
      if (editMeta?.orderMongoId) {
        await apiRequest(`/api/orders/${editMeta.orderMongoId}/replace`, {
          method: 'POST',
          body: JSON.stringify({
            subtotalAmount,
            totalAmount: payableAfterPoints,
            discount: orderDiscount,
            discountType,
            pointsUsed: normalizedPointPaymentPoints,
            pointsRedeemAmount: pointPaymentAmount,
            paymentMethod,
            customerLocalId: customerLocalId || null,
            customerPhone: customerPhone || null,
            note: orderNote || '',
            items: cartItems.map((item) => {
              const line = normalizeCartLine(item);
              return {
                productLocalId: line.product.localId,
                productCode: line.product.productCode || '',
                productName: line.product.name,
                basePrice: line.basePrice,
                discount: line.discount,
                discountType: line.discountType,
                price: line.unitPrice,
                qty: line.qty,
                subtotal: line.subtotal,
              };
            }),
          }),
        });

        // Đóng tab Update sau khi cập nhật xong
        setInvoices((prev) => {
          const next = { ...prev };
          delete next[activeInvoiceIndex];
          return next;
        });
        const newTabs = invoiceTabs.filter((t) => t.id !== activeInvoiceIndex);
        setInvoiceTabs(newTabs);
        if (newTabs.length > 0) {
          setActiveInvoiceIndex(newTabs[newTabs.length - 1].id);
        } else {
          const newInvoiceId = 0;
          setInvoiceTabs([{ label: 'Hóa đơn 1', id: newInvoiceId }]);
          setInvoices({
            [newInvoiceId]: {
              items: [],
              returnMode: false,
              returnOrder: null,
              returnItems: [],
              exchangeItems: [],
              customerPhone: '',
              customerLocalId: '',
              customerName: '',
              customerDebt: 0,
              customerPoints: 0,
              customerSearchTerm: '',
              orderNote: '',
              paymentMethod: 'cash',
              bankTransferVerified: false,
              amountPaid: 0,
              discount: 0,
              pointPaymentEnabled: false,
              pointPaymentPoints: 0,
              discountType: 'vnd',
            },
          });
          invoiceIdCounterRef.current = 1;
          invoiceLabelCounterRef.current = 2;
          setActiveInvoiceIndex(newInvoiceId);
        }

        setSearchTerm('');
        showSnackbar(`Cập nhật hóa đơn thành công! Mã đơn: ${editMeta.orderCode || ''}`, 'success');
        return;
      }

      // Tạo ID cho đơn hàng (UUID)
      const orderLocalId = generateLocalId();
      
      // Tạo mã đơn hàng (VD: ORD-20241201-001)
      const orderCode = await generateOrderCode();
      
      // Lấy timestamp hiện tại (milliseconds từ 1970)
      const now = Date.now();

      // Tạo đơn hàng
                let effectiveCustomerLocalId = customerLocalId || null;

                if (!effectiveCustomerLocalId && customerPhone) {
                  const customerByPhone = await db.customers
                    .where('phone')
                    .equals(customerPhone)
                    .first();
                  if (customerByPhone) {
                    effectiveCustomerLocalId = customerByPhone.localId;
                  }
                }

      const order = {
        localId: orderLocalId,
        orderCode: orderCode,
        totalAmount: payableAfterPoints,
        subtotalAmount: subtotalAmount,
        discount: orderDiscount,
        discountType: discountType,
        paymentMethod: paymentMethod,
        cashierId,
        cashierName: effectiveCashierName,
                  customerLocalId: effectiveCustomerLocalId,
                  customerPhone: customerPhone || null,
                  customerName: customerName || '',
                  customerLabel: customerName || '',
        pointsUsed: normalizedPointPaymentPoints,
        pointsRedeemAmount: pointPaymentAmount,
        pointsEarned: 0,
        status: 'completed',
        createdAt: now,
        synced: false,
        note: orderNote,
      };

      // Tạo chi tiết đơn hàng — lưu cả giá gốc, giảm giá item và giá bán thực tế
      const orderItems = cartItems.map((item) =>
        toOrderItemDoc(orderLocalId, normalizeCartLine(item))
      );

      // Snapshot đơn gốc — không bị ghi đè khi đổi trả sau này
      order.originalItems = orderItems.map(({ orderLocalId: _oid, ...rest }) => rest);
      order.originalTotalAmount = payableAfterPoints;
      order.originalSubtotalAmount = subtotalAmount;

      // Cập nhật tồn kho cho từng sản phẩm đã bán
      // for...of: Loop qua từng item trong giỏ hàng
      for (const item of cartItems) {
        // Lấy thông tin sản phẩm từ database theo localId
        // .get(): Query theo primary key - nhanh nhất (O(1))
        const product = await db.products.get(item.product.localId);
        
        // Nếu tìm thấy sản phẩm
        if (product) {
          // Cập nhật tồn kho: stock mới = stock cũ - số lượng đã bán
          // .update(): Cập nhật record trong database
          await db.products.update(item.product.localId, {
            stock: product.stock - item.qty,  // Giảm tồn kho
            updatedAt: now,                    // Cập nhật thời gian sửa đổi
            synced: false,
          });
        }
      }

      // Tính điểm tích lũy theo thiết lập "Tích điểm" trong trang Thiết lập khách hàng.
      const loyaltyEnabled = loyaltySettings?.enabled !== false;
      const allowDiscountedOrder = loyaltySettings?.allowEarnOnDiscountedOrder !== false;
      const allowDiscountedItem = loyaltySettings?.allowEarnOnDiscountedItem !== false;
      const allowEarnWhenPayingByPoints = loyaltySettings?.allowEarnWhenPayingByPoints === true;
      const hasOrderDiscount = Number(orderDiscount) > 0;
      const usedPointsForPayment = normalizedPointPaymentPoints > 0;
      const canEarnInThisOrder =
        loyaltyEnabled &&
        (allowDiscountedOrder || !hasOrderDiscount) &&
        (allowEarnWhenPayingByPoints || !usedPointsForPayment);
      const pointsEarnedAmount = canEarnInThisOrder
        ? cartItems.reduce((sum, item) => {
            const finalPrice = calculateItemFinalPrice(item);
            const itemTotal = finalPrice * item.qty;
            const hasItemDiscount = Number(item.discount || 0) > 0;
            if (item.product.allowPoints === false) return sum;
            if (!allowDiscountedItem && hasItemDiscount) return sum;
            return sum + itemTotal;
          }, 0)
        : 0;
      const earningAmount = Math.max(1, Number(loyaltySettings?.earningAmount) || 100000);
      const earningPoints = Math.max(1, Number(loyaltySettings?.earningPoints) || 1);
      const pointsToAdd = canEarnInThisOrder ? Math.floor(pointsEarnedAmount / earningAmount) * earningPoints : 0;

      // Xử lý khách hàng: Cập nhật điểm tích lũy nếu có số điện thoại
      if (effectiveCustomerLocalId) {
        const existingCustomer = await db.customers.get(effectiveCustomerLocalId);

        if (existingCustomer) {
          const currentPoints = Number(existingCustomer.points) || 0;
          const nextPoints = Math.max(0, currentPoints - normalizedPointPaymentPoints + pointsToAdd);
          await db.customers.update(existingCustomer.localId, {
            points: nextPoints,
            updatedAt: now,
            synced: false,
          });
          order.pointsEarned = pointsToAdd;
        }
      } else if (customerPhone) {
        // Tìm khách hàng trong database theo số điện thoại
        // .where('phone'): Query theo index 'phone'
        // .equals(customerPhone): Tìm chính xác số điện thoại
        // .first(): Lấy record đầu tiên (nhanh hơn .toArray() vì chỉ cần 1)
        const existingCustomer = await db.customers
          .where('phone')
          .equals(customerPhone)
          .first();

        // Nếu tìm thấy khách hàng (đã có trong database)
        if (existingCustomer) {
          const currentPoints = Number(existingCustomer.points) || 0;
          const nextPoints = Math.max(0, currentPoints - normalizedPointPaymentPoints + pointsToAdd);
          // Cập nhật điểm tích lũy: điểm mới = điểm cũ + điểm mới tích được
          await db.customers.update(existingCustomer.localId, {
            points: nextPoints,
            updatedAt: now,
            synced: false,
          });
          // Lưu số điểm tích được vào đơn hàng
          order.customerLocalId = existingCustomer.localId;
          order.pointsEarned = pointsToAdd;
        } else {
          // Kiểm tra số điện thoại đã tồn tại chưa
          const phoneExists = await checkPhoneExists(customerPhone);
          if (phoneExists) {
            // Nếu đã tồn tại, cập nhật thay vì tạo mới
            const existingCustomer = await db.customers.where('phone').equals(customerPhone).first();
            if (existingCustomer) {
              const currentPoints = Number(existingCustomer.points) || 0;
              const nextPoints = Math.max(0, currentPoints - normalizedPointPaymentPoints + pointsToAdd);
              await db.customers.update(existingCustomer.localId, {
                points: nextPoints,
                updatedAt: now,
                synced: false,
              });
              order.pointsEarned = pointsToAdd;
            }
          } else {
            // Tạo localId mới và kiểm tra trùng
            let localId = generateLocalId();
            let attempts = 0;
            while (await db.customers.get(localId) && attempts < 10) {
              localId = generateLocalId();
              attempts++;
            }
            if (attempts >= 10) {
              console.error('Không thể tạo localId duy nhất sau 10 lần thử.');
              throw new Error('Không thể tạo khách hàng mới');
            }

            await db.customers.add({
              localId,
              name: customerName || `Khách hàng ${customerPhone}`,
              phone: customerPhone,
              points: pointsToAdd,
              debt: 0,  // Khách hàng mới không có nợ
              createdAt: now,
              synced: false,
            });
            order.customerLocalId = localId;
            order.pointsEarned = pointsToAdd;
          }
        }
      }

      // Lưu đơn hàng vào database
      // .add(): Thêm record mới vào bảng orders
      await db.orders.add(order);
      
      // Lưu chi tiết đơn hàng
      // .bulkAdd(): Thêm nhiều records cùng lúc (nhanh hơn add từng cái)
      await db.order_items.bulkAdd(orderItems);

      await handlePrintInvoice(printCopies);

      syncOrdersToServer([orderLocalId]).catch((error) => {
        console.warn('Sync orders failed:', error);
        showSnackbar('Chưa thể đồng bộ đơn hàng lên server', 'warning');
      });
      syncMasterToServer().catch((error) => {
        console.warn('Sync master failed:', error);
      });

      // Xóa hóa đơn đã thanh toán; reset khách cho hóa đơn còn lại / mới (theo tab.id — tránh lệch index)
      const paidInvoiceId = activeInvoiceIndex;
      const closingTabIndex = invoiceTabs.findIndex((t) => t.id === paidInvoiceId);
      const newTabs = invoiceTabs.filter((t) => t.id !== paidInvoiceId);

      const emptyInvoiceBase = {
        items: [],
        returnMode: false,
        returnOrder: null,
        returnItems: [],
        exchangeItems: [],
        customerPhone: '',
        customerLocalId: '',
        customerName: '',
        customerDebt: 0,
        customerPoints: 0,
        customerSearchTerm: '',
        orderNote: '',
        paymentMethod: 'cash',
        bankTransferVerified: false,
        amountPaid: 0,
        discount: 0,
        pointPaymentEnabled: false,
        pointPaymentPoints: 0,
        discountType: 'vnd',
      };

      const emptyCustomerState = {
        customerPhone: '',
        customerLocalId: '',
        customerName: '',
        customerDebt: 0,
        customerPoints: 0,
        pointPaymentEnabled: false,
        pointPaymentPoints: 0,
        customerSearchTerm: '',
      };

      let nextActiveId = 0;
      if (newTabs.length === 0) {
        nextActiveId = 0;
        setInvoices({ 0: { ...emptyInvoiceBase } });
        setInvoiceTabs([{ label: 'Hóa đơn 1', id: 0 }]);
        setActiveInvoiceIndex(0);
        invoiceIdCounterRef.current = 1;
        invoiceLabelCounterRef.current = 2;
      } else {
        const focusIdx =
          closingTabIndex >= 0
            ? Math.min(closingTabIndex, newTabs.length - 1)
            : newTabs.length - 1;
        nextActiveId = newTabs[focusIdx].id;

        setInvoices((prev) => {
          const next = { ...prev };
          delete next[paidInvoiceId];
          const existing = next[nextActiveId];
          next[nextActiveId] = existing
            ? { ...existing, ...emptyCustomerState }
            : { ...emptyInvoiceBase };
          return next;
        });
        setInvoiceTabs(newTabs);
        setActiveInvoiceIndex(nextActiveId);
      }

      setTimeout(() => {
        setInvoices((prev) => {
          const cur = prev[nextActiveId];
          if (!cur) return prev;
          return {
            ...prev,
            [nextActiveId]: { ...cur, ...emptyCustomerState },
          };
        });
      }, 0);
      
      setSearchTerm('');

      showSnackbar(`Thanh toán thành công! Mã đơn: ${orderCode}`, 'success');

    } catch (error) {
      console.error('Lỗi khi thanh toán:', error);
      showSnackbar('Có lỗi xảy ra khi thanh toán!', 'error');
    }
  };

  // Set amountPaid mặc định = totalAmount khi totalAmount thay đổi
  const prevTotalAmountRef = useRef(payableAfterPoints);
  useEffect(() => {
    if (isReturnMode) return;
    const prevTotalAmount = prevTotalAmountRef.current;
    const shouldAutoUpdate =
      (amountPaid === 0 && payableAfterPoints > 0) ||
      (amountPaid === prevTotalAmount && payableAfterPoints !== prevTotalAmount) ||
      (payableAfterPoints === 0 && amountPaid === prevTotalAmount);

    if (shouldAutoUpdate) {
      updateCurrentInvoice({ amountPaid: payableAfterPoints });
    }
    prevTotalAmountRef.current = payableAfterPoints;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payableAfterPoints, amountPaid, isReturnMode]); // Chỉ cập nhật khi tổng thanh toán thay đổi

  useEffect(() => {
    if (isReturnMode) return;
    if (!pointPaymentFeatureAvailable || (!customerLocalId && !customerPhone)) {
      if (pointPaymentEnabledByInvoice || pointPaymentPoints > 0) {
        updateCurrentInvoice({
          pointPaymentEnabled: false,
          pointPaymentPoints: 0,
        });
      }
      return;
    }
    if (normalizedPointPaymentPoints !== pointPaymentPoints) {
      updateCurrentInvoice({ pointPaymentPoints: normalizedPointPaymentPoints });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    normalizedPointPaymentPoints,
    pointPaymentPoints,
    isReturnMode,
    pointPaymentFeatureAvailable,
    customerLocalId,
    customerPhone,
    pointPaymentEnabledByInvoice,
  ]);

  const handlePointPaymentToggle = useCallback(
    (enabled) => {
      if (!enabled) {
        updateCurrentInvoice({ pointPaymentEnabled: false, pointPaymentPoints: 0 });
        return;
      }
      const defaultPoints = maxRedeemPoints > 0 ? maxRedeemPoints : 0;
      updateCurrentInvoice({
        pointPaymentEnabled: true,
        pointPaymentPoints: defaultPoints,
      });
    },
    [maxRedeemPoints],
  );

  const handlePointPaymentAmountChange = useCallback(
    (amount) => {
      const cleanAmount = Math.max(0, Number(amount) || 0);
      const points = Math.floor(cleanAmount / redeemAmount) * redeemPoints;
      updateCurrentInvoice({
        pointPaymentPoints: points,
      });
    },
    [redeemAmount, redeemPoints],
  );

  const safeSelectedStoreId = stores.some((store) => store.storeId === selectedStoreId)
    ? selectedStoreId
    : '';

  return (
    <Box sx={{ 
      width: '100vw',
      height: '100vh', 
      bgcolor: '#f5f5f5', 
      display: 'flex', 
      flexDirection: 'column',
      overflow: 'hidden',
      margin: 0,
      padding: 0
    }}>
      {/* Header - Cố định trên cùng */}
      <Box sx={{ flexShrink: 0 }}>
        <Header
          searchTerm={searchTerm}
          onSearch={handleHeaderSearch}
          searchPlaceholder={isReturnMode ? 'Tìm hàng trả (F3)' : 'Tìm hàng hóa (F3) hoặc quét barcode...'}
          disableSearchDropdown={isReturnMode}
          invoiceTabs={invoiceTabs}
          activeInvoiceIndex={activeInvoiceIndex}
          onInvoiceChange={setActiveInvoiceIndex}
          onOpenReturnOrders={() => setReturnDialogOpen(true)}
          onOpenPrintSettings={() => setPrintSettingsOpen(true)}
          onOpenDrawer={() => setDrawerOpen(true)}
          userName={cashierName}
          stores={stores}
          selectedStoreId={safeSelectedStoreId}
          onStoreChange={handleStoreChange}
          onOpenStoreDialog={() => setStoreDialogOpen(true)}
          canManageStores={user?.role === 'admin'}
          storeLoading={storeLoading}
          onNewInvoice={() => {
            const nextId = invoiceIdCounterRef.current;
            const nextLabel = invoiceLabelCounterRef.current;
            invoiceIdCounterRef.current += 1;
            invoiceLabelCounterRef.current += 1;
            const newTabs = [...invoiceTabs, { label: `Hóa đơn ${nextLabel}`, id: nextId }];
            setInvoiceTabs(newTabs);
            
            // Tạo hóa đơn mới với state rỗng
            setInvoices(prev => ({
              ...prev,
              [nextId]: {
                items: [],
                returnMode: false,
                returnOrder: null,
                returnItems: [],
                exchangeItems: [],
                customerPhone: '',
                customerLocalId: '',
                customerName: '',
                customerDebt: 0,
                customerPoints: 0,
                customerSearchTerm: '',
                orderNote: '',
                paymentMethod: 'cash',
                bankTransferVerified: false,
                amountPaid: 0,
                discount: 0,
                pointPaymentEnabled: false,
                pointPaymentPoints: 0,
                discountType: 'vnd',
              }
            }));
            
            setActiveInvoiceIndex(nextId);
          }}
          onCloseInvoice={handleRequestCloseInvoice}
          onAddToCart={handleAddToCart}
        />
      </Box>

      {/* Nội dung chính - Chia 2 cột */}
      <Box sx={{ 
        flexGrow: 1, 
        display: 'flex', 
        overflow: 'hidden',
        minHeight: 0,
        width: '100%',
        pb: 8 // Padding bottom để không bị che bởi BottomFooter
      }}>
        {/* Cột trái: Danh sách sản phẩm trong hóa đơn (70%) */}
        <Box sx={{ 
          width: '70%', 
          minWidth: 0,
          bgcolor: 'white', 
          display: 'flex', 
          flexDirection: 'column',
          borderRight: '1px solid',
          borderColor: 'divider',
          overflow: 'hidden'
        }}>
          {isReturnMode ? (
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, p: 2, overflow: 'hidden' }}>
              <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <Paper sx={{ p: 1.5, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                    Trả hàng
                  </Typography>
                  <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                    <ProductList
                      items={filteredReturnItems}
                      onUpdateQty={handleUpdateReturnQty}
                      onRemove={(productLocalId) => handleUpdateReturnQty(productLocalId, 0)}
                      minQty={0}
                      getMaxQty={(item) => item.maxQty}
                      showQtyHint
                      disableDiscount
                    />
                  </Box>
                </Paper>
              </Box>

              <Box sx={{ bgcolor: 'primary.main', borderRadius: 1, p: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TextField
                    inputRef={(el) => {
                      exchangeSearchRef.current = el;
                      if (el) {
                        setExchangeSearchAnchor(el);
                      }
                    }}
                    fullWidth
                    size="small"
                    placeholder="Tìm hàng đổi (F7)"
                    value={exchangeSearchTerm}
                    onChange={(e) => {
                      const value = e.target.value;
                      setExchangeSearchTerm(value);
                      setExchangeSearchOpen(value.trim().length > 0);
                    }}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <QrCodeScannerIcon fontSize="small" />
                        </InputAdornment>
                      ),
                    }}
                    sx={{
                      bgcolor: 'common.white',
                      borderRadius: 1,
                      '& .MuiOutlinedInput-root': {
                        bgcolor: 'common.white',
                      }
                    }}
                  />
                </Box>
                <ProductSearchDropdown
                  searchTerm={exchangeSearchTerm}
                  open={exchangeSearchOpen}
                  anchorEl={exchangeSearchAnchor}
                  onClose={() => setExchangeSearchOpen(false)}
                  onAddToCart={(product) => {
                    handleAddToCart(product);
                    setExchangeSearchTerm('');
                    setExchangeSearchOpen(false);
                  }}
                />
              </Box>

              <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <Paper sx={{ p: 1.5, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                    Mua hàng
                  </Typography>
                  <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                    <ProductList
                      items={cartItems}
                      onUpdateQty={handleUpdateQty}
                      onUpdateDiscount={handleUpdateDiscount}
                      onUpdatePricing={handleUpdateItemPricing}
                      onRemove={handleRemoveFromCart}
                    />
                  </Box>
                </Paper>
              </Box>
            </Box>
          ) : (
            <ProductList
              items={cartItems}
              onUpdateQty={handleUpdateQty}
              onUpdateDiscount={handleUpdateDiscount}
              onUpdatePricing={handleUpdateItemPricing}
              onRemove={handleRemoveFromCart}
            />
          )}
          {/* Footer - Ghi chú đơn hàng (chỉ ở cột trái) */}
          <Box sx={{ flexShrink: 0, borderTop: '1px solid', borderColor: 'divider' }}>
            <Footer note={orderNote} onNoteChange={(note) => updateCurrentInvoice({ orderNote: note })} />
          </Box>
        </Box>

        {/* Cột phải: Thông tin khách hàng và thanh toán (30%) */}
        <Box sx={{ 
          width: '30%', 
          minWidth: 0,
          bgcolor: '#f5f5f5', 
          overflow: 'auto',
          p: 2,
          display: 'flex',
          flexDirection: 'column'
        }}>
            {isReturnMode ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Paper sx={{ p: 1.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {cashierName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date().toLocaleString('vi-VN', { hour12: false })}
                    </Typography>
                  </Box>
                  <Box sx={{ mb: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>
                      {customerName || returnOrder?.customerLabel || 'Khách lẻ'}
                    </Typography>
                    {customerPhone && (
                      <Typography variant="caption" color="text.secondary">
                        {customerPhone}
                      </Typography>
                    )}
                  </Box>
                  <Typography variant="body2" sx={{ color: 'success.main', fontWeight: 600 }}>
                    Trả hàng{' '}
                    {returnOrder?.orderCode ? (
                      <>
                        /{' '}
                        <Link
                          component="button"
                          underline="hover"
                          onClick={() => handleOpenOrderHistoryDetail(returnOrder)}
                          sx={{ color: 'success.main', fontWeight: 700, verticalAlign: 'baseline' }}
                        >
                          {returnOrder.orderCode}
                        </Link>
                      </>
                    ) : null}{' '}
                    - {cashierName}
                  </Typography>
                  <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2">Tổng tiền hàng trả</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {returnTotalQty} / {returnTotalAmount.toLocaleString('en-US')}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2">Tổng tiền hàng mua</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {exchangeTotalQty} / {totalAmount.toLocaleString('en-US')}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {netAmount >= 0 ? 'Khách cần trả thêm' : 'Cần trả khách'}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 700, color: netAmount >= 0 ? 'primary.main' : 'error.main' }}
                      >
                        {Math.abs(netAmount).toLocaleString('en-US')}
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                      {netAmount > 0
                        ? 'Khách trả tiền'
                        : netAmount < 0
                          ? 'Đã trả khách'
                          : 'Không chênh lệch'}
                    </Typography>
                    <TextField
                      fullWidth
                      size="small"
                      value={formatMoneyInput(amountPaid || returnNeedToPay)}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const { number } = normalizeMoneyTyping(e.target.value);
                        updateCurrentInvoice({ amountPaid: number });
                      }}
                    />
                  </Box>
                  <Box sx={{ mt: 1 }}>
                    <Grid container spacing={0.5}>
                      {returnQuickAmounts.map((amount) => (
                        <Grid item xs={4} key={amount}>
                          <Chip
                            label={amount.toLocaleString('en-US')}
                            onClick={() => updateCurrentInvoice({ amountPaid: amount })}
                            color={amountPaid === amount ? 'primary' : 'default'}
                            sx={{ width: '100%', fontSize: '0.75rem' }}
                          />
                        </Grid>
                      ))}
                    </Grid>
                  </Box>
                  <Box sx={{ mt: 1 }}>
                    <FormControl component="fieldset" fullWidth>
                      <FormLabel component="legend" sx={{ mb: 0.5, fontSize: '0.875rem', fontWeight: 600 }}>
                        Phương thức thanh toán
                      </FormLabel>
                      <RadioGroup
                        value={paymentMethod}
                        onChange={(e) => updateCurrentInvoice({ paymentMethod: e.target.value, bankTransferVerified: false })}
                        row
                        sx={{ gap: 1 }}
                      >
                        <FormControlLabel value="cash" control={<Radio size="small" />} label="Tiền mặt" sx={{ m: 0 }} />
                        <FormControlLabel value="bank" control={<Radio size="small" />} label="Chuyển khoản" sx={{ m: 0 }} />
                      </RadioGroup>
                    </FormControl>
                  </Box>
                  {paymentMethod === 'bank' && (
                    <Box
                      sx={{
                        mt: 1.5,
                        p: 1.25,
                        borderRadius: 2,
                        bgcolor: 'action.hover',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1.5
                      }}
                    >
                      <TextField
                        select
                        size="small"
                        fullWidth
                        value={selectedBankAccountId}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === '__add__') {
                            setAddBankDialogOpen(true);
                            return;
                          }
                          setSelectedBankAccountId(value);
                        }}
                        SelectProps={{
                          displayEmpty: true,
                          renderValue: (value) => {
                            const account = bankAccounts.find((item) => item.id === value);
                            if (!account) {
                              return (
                                <Typography variant="body2" color="text.secondary">
                                  Chọn tài khoản ngân hàng
                                </Typography>
                              );
                            }
                            return (
                              <Box sx={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                  {account.bankName}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {`${account.accountNumber}${account.accountName ? ` • ${account.accountName}` : ''}`}
                                </Typography>
                              </Box>
                            );
                          }
                        }}
                      >
                        {bankAccounts.map((account) => (
                          <MenuItem key={account.id} value={account.id}>
                            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {account.bankName}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {`${account.accountNumber}${account.accountName ? ` • ${account.accountName}` : ''}`}
                              </Typography>
                            </Box>
                          </MenuItem>
                        ))}
                        <MenuItem value="__add__">
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            + Thêm tài khoản ngân hàng
                          </Typography>
                        </MenuItem>
                      </TextField>
                      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'stretch' }}>
                        <Box
                          sx={{
                            width: 96,
                            minWidth: 96,
                            height: 96,
                            bgcolor: 'common.white',
                            borderRadius: 1.5,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            overflow: 'hidden',
                            border: '1px solid',
                            borderColor: 'divider'
                          }}
                        >
                          {selectedBankAccount ? (
                            <img
                              src={getBankQrUrl(
                                selectedBankAccount,
                                returnNeedToPay,
                                customerName || customerPhone || ''
                              )}
                              alt="QR chuyển khoản"
                              style={{ width: '88px', height: '88px' }}
                            />
                          ) : (
                            <Typography variant="caption" color="text.secondary" align="center">
                              Chưa có tài khoản
                            </Typography>
                          )}
                        </Box>
                        <Box sx={{ flex: 1 }}>
                          <Box
                            sx={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                              gap: 2,
                              alignItems: 'center'
                            }}
                          >
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              <IconButton
                                size="small"
                                disabled={!selectedBankAccount}
                                onClick={() => setQrPreviewOpen(true)}
                                sx={{ bgcolor: 'common.white', border: '1px solid', borderColor: 'divider' }}
                              >
                                <QrCode2Icon fontSize="small" />
                              </IconButton>
                              <Typography variant="caption" color="text.secondary">
                                Hiện mã QR
                              </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              <IconButton
                                size="small"
                                disabled={!selectedBankAccount}
                                onClick={handleVerifyBankTransferReturn}
                                sx={{ bgcolor: 'common.white', border: '1px solid', borderColor: 'divider' }}
                              >
                                <SyncIcon fontSize="small" />
                              </IconButton>
                              <Typography variant="caption" color="text.secondary">
                                Kiểm tra
                              </Typography>
                            </Box>
                          </Box>
                          {paymentMethod === 'bank' && (
                            <Typography
                              variant="caption"
                              sx={{ mt: 1, display: 'block', color: bankTransferVerified ? 'success.main' : 'warning.main', fontWeight: 600 }}
                            >
                              {bankTransferVerified ? 'Đã xác nhận chuyển khoản thành công' : 'Chưa xác nhận chuyển khoản'}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    </Box>
                  )}
                </Paper>
                <Button
                  variant="contained"
                  size="large"
                  onClick={handleReturnCheckout}
                >
                  TRẢ HÀNG
                </Button>
              </Box>
            ) : (
              <PaymentPanel
                cashierName={cashierName}
                customerName={customerName}
                customerPhone={customerPhone}
                customerLocalId={customerLocalId}
                customerSearchTerm={customerSearchTerm}
                customerDebt={customerDebt}
                customerPoints={customerPoints}
                onCustomerSearchChange={(searchValue) => {
                  updateCurrentInvoice({ customerSearchTerm: searchValue });
                  if (customerName || customerPhone) {
                    updateCurrentInvoice({
                      customerPhone: '',
                      customerLocalId: '',
                      customerName: '',
                      customerDebt: 0,
                      customerPoints: 0,
                      pointPaymentEnabled: false,
                      pointPaymentPoints: 0
                    });
                  }
                }}
                onCustomerSelect={async (customer) => {
                  updateCurrentInvoice({ 
                    customerPhone: customer.phone || '', 
                    customerLocalId: customer.localId || '',
                    customerName: formatCustomerLabel(customer),
                    customerSearchTerm: '',
                    pointPaymentEnabled: false,
                    pointPaymentPoints: 0,
                  });
                  
                  // Load thông tin đầy đủ của khách hàng từ database
                  if (customer.localId) {
                    try {
                      await db.open();
                      const fullCustomer = await db.customers.get(customer.localId);
                      if (fullCustomer) {
                        // Cập nhật số nợ và điểm tích lũy
                        // debt có thể chưa có trong schema, nên dùng || 0 để tránh lỗi
                        updateCurrentInvoice({
                          customerDebt: fullCustomer.debt || 0,
                          customerPoints: fullCustomer.points || 0,
                          pointPaymentEnabled: false,
                          pointPaymentPoints: 0,
                        });
                      }
                    } catch (error) {
                      console.error('Lỗi load thông tin khách hàng:', error);
                      updateCurrentInvoice({
                        customerDebt: 0,
                        customerPoints: 0,
                        pointPaymentEnabled: false,
                        pointPaymentPoints: 0,
                      });
                    }
                  } else {
                    updateCurrentInvoice({
                      customerDebt: 0,
                      customerPoints: 0,
                      pointPaymentEnabled: false,
                      pointPaymentPoints: 0,
                    });
                  }
                }}
                onCustomerClear={() => {
                  updateCurrentInvoice({
                    customerPhone: '',
                    customerLocalId: '',
                    customerName: '',
                    customerSearchTerm: '',
                    customerDebt: 0,
                    customerPoints: 0,
                    pointPaymentEnabled: false,
                    pointPaymentPoints: 0,
                  });
                }}
                onCustomerEdit={() => openEditCustomer(customerLocalId)}
                onAddCustomer={() => setAddCustomerDialogOpen(true)}
                items={cartItems}
                paymentMethod={paymentMethod}
                onPaymentMethodChange={(method) => updateCurrentInvoice({ paymentMethod: method, bankTransferVerified: false })}
                bankTransferVerified={bankTransferVerified}
                onVerifyBankTransfer={handleVerifyBankTransfer}
                amountPaid={amountPaid}
                onAmountPaidChange={(amount) => updateCurrentInvoice({ amountPaid: amount })}
                discount={discount}
                discountType={discountType}
                loyaltyPointPaymentEnabled={pointPaymentFeatureAvailable}
                loyaltyRedeemPoints={redeemPoints}
                loyaltyRedeemAmount={redeemAmount}
                pointPaymentEnabled={pointPaymentEnabledByInvoice}
                pointPaymentPoints={normalizedPointPaymentPoints}
                pointPaymentAmount={pointPaymentAmount}
                maxPointPaymentPoints={maxRedeemPoints}
                payableAfterPoints={payableAfterPoints}
                onPointPaymentChange={(points) => updateCurrentInvoice({ pointPaymentPoints: points })}
                onPointPaymentAmountChange={handlePointPaymentAmountChange}
                onPointPaymentToggle={handlePointPaymentToggle}
                onDiscountChange={(discountValue, discountTypeValue) => {
                  updateCurrentInvoice({ discount: discountValue, discountType: discountTypeValue });
                }}
                onCheckout={handleCheckout}
              />
            )}
        </Box>
      </Box>

      {/* Bottom Footer */}
      <BottomFooter 
        saleMode={saleMode}
        onSaleModeChange={setSaleMode}
      />

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>

      {/* Dialog thêm khách hàng */}
      <Dialog 
        open={addCustomerDialogOpen} 
        onClose={() => {
          setAddCustomerDialogOpen(false);
          // Reset form khi đóng
          setNewCustomer({
            customerCode: '',
            name: '',
            phone: '',
            address: '',
            area: '',
            ward: '',
            group: '',
            dateOfBirth: '',
            gender: 'male',
            email: '',
            facebook: '',
            note: '',
            avatar: null
          });
          setCustomerErrors({ customerCode: '', phone: '' });
        }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Thêm khách hàng mới</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            {/* Hàng đầu: Avatar và cột trái */}
            <Box sx={{ display: 'flex', gap: 3 }}>
              {/* Avatar và button chọn ảnh */}
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                <Avatar
                  src={newCustomer.avatar ? URL.createObjectURL(newCustomer.avatar) : ''}
                  sx={{ width: 80, height: 80 }}
                >
                  <PersonIcon sx={{ fontSize: 40 }} />
                </Avatar>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<PhotoCameraIcon />}
                  component="label"
                  sx={{ textTransform: 'none' }}
                >
                  Chọn ảnh
                  <input
                    type="file"
                    hidden
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        setNewCustomer({ ...newCustomer, avatar: file });
                      }
                    }}
                  />
                </Button>
              </Box>

              {/* Cột trái: Mã, Tên, Điện thoại, Địa chỉ, Khu vực, Phường xã */}
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  label="Mã khách hàng"
                  placeholder="Mã mặc định"
                  value={newCustomer.customerCode}
                  onChange={async (e) => {
                    const value = e.target.value;
                    setNewCustomer({ ...newCustomer, customerCode: value });
                    
                    // Validate mã khách hàng
                    if (value.trim()) {
                      const exists = await checkCustomerCodeExists(value);
                      if (exists) {
                        setCustomerErrors(prev => ({ ...prev, customerCode: 'Mã khách hàng đã tồn tại' }));
                      } else {
                        setCustomerErrors(prev => ({ ...prev, customerCode: '' }));
                      }
                    } else {
                      setCustomerErrors(prev => ({ ...prev, customerCode: '' }));
                    }
                  }}
                  error={!!customerErrors.customerCode}
                  helperText={customerErrors.customerCode}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          size="small"
                          onClick={async () => {
                            const code = await generateCustomerCode();
                            setNewCustomer({ ...newCustomer, customerCode: code });
                            setCustomerErrors(prev => ({ ...prev, customerCode: '' }));
                          }}
                          title="Tự động tạo mã"
                        >
                          <Box sx={{ fontSize: '0.75rem', color: 'primary.main' }}>Auto</Box>
                        </IconButton>
                      </InputAdornment>
                    )
                  }}
                />

                <TextField
                  label="Tên khách hàng"
                  placeholder="Tên hoặc biệt danh"
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  error={!newCustomer.name.trim() && !newCustomer.nickname.trim()}
                  helperText={!newCustomer.name.trim() && !newCustomer.nickname.trim() ? 'Nhập tên hoặc biệt danh' : ''}
                />
                <TextField
                  label="Biệt danh"
                  value={newCustomer.nickname}
                  onChange={(e) => setNewCustomer({ ...newCustomer, nickname: e.target.value })}
                />

                <TextField
                  label="Điện thoại"
                  value={newCustomer.phone}
                  onChange={async (e) => {
                    const value = e.target.value;
                    setNewCustomer({ ...newCustomer, phone: value });
                    
                    // Validate số điện thoại
                    if (value.trim()) {
                      const exists = await checkPhoneExists(value);
                      if (exists) {
                        setCustomerErrors(prev => ({ ...prev, phone: 'Số điện thoại đã tồn tại' }));
                      } else {
                        setCustomerErrors(prev => ({ ...prev, phone: '' }));
                      }
                    } else {
                      setCustomerErrors(prev => ({ ...prev, phone: '' }));
                    }
                  }}
                  error={!!customerErrors.phone}
                  helperText={customerErrors.phone}
                />

                <TextField
                  label="Địa chỉ"
                  placeholder="Số nhà, tòa nhà, ngõ, đường"
                  value={newCustomer.address}
                  onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                />

                <TextField
                  label="Khu vực"
                  placeholder="Chọn Tỉnh/TP - Quận/Huyện"
                  value={newCustomer.area}
                  onChange={(e) => setNewCustomer({ ...newCustomer, area: e.target.value })}
                />

                <TextField
                  label="Phường xã"
                  placeholder="Chọn Phường/Xã"
                  value={newCustomer.ward}
                  onChange={(e) => setNewCustomer({ ...newCustomer, ward: e.target.value })}
                />
              </Box>

              {/* Cột phải: Nhóm, Ngày sinh, Giới tính, Email, Facebook, Ghi chú */}
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  label="Nhóm"
                  value={newCustomer.group}
                  onChange={(e) => setNewCustomer({ ...newCustomer, group: e.target.value })}
                />

                <Box>
                  <TextField
                    label="Ngày sinh"
                    type="date"
                    value={newCustomer.dateOfBirth}
                    onChange={(e) => setNewCustomer({ ...newCustomer, dateOfBirth: e.target.value })}
                    InputLabelProps={{
                      shrink: true,
                    }}
                    fullWidth
                  />
                  <FormControl component="fieldset" sx={{ mt: 1 }}>
                    <FormLabel component="legend">Giới tính</FormLabel>
                    <RadioGroup
                      row
                      value={newCustomer.gender}
                      onChange={(e) => setNewCustomer({ ...newCustomer, gender: e.target.value })}
                    >
                      <FormControlLabel value="male" control={<Radio />} label="Nam" />
                      <FormControlLabel value="female" control={<Radio />} label="Nữ" />
                    </RadioGroup>
                  </FormControl>
                </Box>

                <TextField
                  label="Email"
                  type="email"
                  value={newCustomer.email}
                  onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                />

                <TextField
                  label="Facebook"
                  value={newCustomer.facebook}
                  onChange={(e) => setNewCustomer({ ...newCustomer, facebook: e.target.value })}
                />

                <TextField
                  label="Ghi chú"
                  multiline
                  rows={3}
                  value={newCustomer.note}
                  onChange={(e) => setNewCustomer({ ...newCustomer, note: e.target.value })}
                />
              </Box>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setAddCustomerDialogOpen(false);
            setNewCustomer({
              customerCode: '',
              name: '',
              nickname: '',
              phone: '',
              address: '',
              area: '',
              ward: '',
              group: '',
              dateOfBirth: '',
              gender: 'male',
              email: '',
              facebook: '',
              note: '',
              avatar: null
            });
            setCustomerErrors({ customerCode: '', phone: '' });
          }}>
            Bỏ qua
          </Button>
          <Button
            variant="contained"
            onClick={async () => {
              // Validation
              if (!newCustomer.name.trim() && !newCustomer.nickname.trim()) {
                showSnackbar('Vui lòng nhập tên hoặc biệt danh', 'error');
                return;
              }

              if (customerErrors.customerCode || customerErrors.phone) {
                showSnackbar('Vui lòng sửa các lỗi trước khi lưu', 'error');
                return;
              }

              setAddCustomerLoading(true);
              try {
                // Tạo mã khách hàng nếu chưa có
                let customerCode = newCustomer.customerCode.trim();
                if (!customerCode) {
                  customerCode = await generateCustomerCode();
                }

                // Kiểm tra lại mã khách hàng và số điện thoại
                if (customerCode) {
                  const codeExists = await checkCustomerCodeExists(customerCode);
                  if (codeExists) {
                    showSnackbar('Mã khách hàng đã tồn tại', 'error');
                    setAddCustomerLoading(false);
                    return;
                  }
                }

                if (newCustomer.phone.trim()) {
                  const phoneExists = await checkPhoneExists(newCustomer.phone.trim());
                  if (phoneExists) {
                    showSnackbar('Số điện thoại đã tồn tại', 'error');
                    setAddCustomerLoading(false);
                    return;
                  }
                }

                // Tạo khách hàng mới
                const localId = generateLocalId();
                const now = Date.now();

                await db.customers.add({
                  localId,
                  customerCode: customerCode || null,
                  name: newCustomer.name.trim(),
                  nickname: newCustomer.nickname.trim(),
                  phone: newCustomer.phone.trim() || null,
                  address: newCustomer.address.trim() || null,
                  area: newCustomer.area.trim() || null,
                  ward: newCustomer.ward.trim() || null,
                  group: newCustomer.group.trim() || null,
                  dateOfBirth: newCustomer.dateOfBirth || null,
                  gender: newCustomer.gender,
                  email: newCustomer.email.trim() || null,
                  facebook: newCustomer.facebook.trim() || null,
                  note: newCustomer.note.trim() || null,
                  points: 0,
                  debt: 0,  // Khách hàng mới không có nợ
                  createdAt: now,
                  synced: false
                });

                // Đóng dialog và reset form
                setAddCustomerDialogOpen(false);
                setNewCustomer({
                  customerCode: '',
                  name: '',
                  nickname: '',
                  phone: '',
                  address: '',
                  area: '',
                  ward: '',
                  group: '',
                  dateOfBirth: '',
                  gender: 'male',
                  email: '',
                  facebook: '',
                  note: '',
                  avatar: null
                });
                setCustomerErrors({ customerCode: '', phone: '' });

                showSnackbar('Thêm khách hàng thành công!', 'success');

                // Tự động chọn khách hàng vừa thêm
                updateCurrentInvoice({ 
                  customerPhone: newCustomer.phone.trim(), 
                  customerLocalId: localId,
                  customerName: formatCustomerLabel(newCustomer),
                  customerSearchTerm: '',
                  customerDebt: 0,
                  customerPoints: 0,
                  pointPaymentEnabled: false,
                  pointPaymentPoints: 0,
                });
              } catch (error) {
                console.error('Lỗi thêm khách hàng:', error);
                showSnackbar('Có lỗi xảy ra khi thêm khách hàng!', 'error');
              } finally {
                setAddCustomerLoading(false);
              }
            }}
            disabled={addCustomerLoading || (!newCustomer.name.trim() && !newCustomer.nickname.trim())}
          >
            {addCustomerLoading ? 'Đang lưu...' : 'Lưu'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editCustomerDialogOpen} onClose={() => setEditCustomerDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Chỉnh sửa khách hàng</DialogTitle>
        <DialogContent>
          {editCustomer && (
            <>
              <Tabs
                value={editCustomerTab}
                onChange={(_, value) => setEditCustomerTab(Number(value))}
                sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
              >
                <Tab label="Thông tin" value={0} />
                <Tab label="Lịch sử bán/trả hàng" value={1} />
              </Tabs>

              {editCustomerTab === 0 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
                  <Box sx={{ display: 'flex', gap: 3 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                      <Avatar
                        src={editCustomer.avatar ? URL.createObjectURL(editCustomer.avatar) : ''}
                        sx={{ width: 80, height: 80 }}
                      >
                        <PersonIcon sx={{ fontSize: 40 }} />
                      </Avatar>
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<PhotoCameraIcon />}
                        component="label"
                        sx={{ textTransform: 'none' }}
                      >
                        Chọn ảnh
                        <input
                          type="file"
                          hidden
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files[0];
                            if (file) {
                              setEditCustomer({ ...editCustomer, avatar: file });
                            }
                          }}
                        />
                      </Button>
                    </Box>

                    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <TextField
                        label="Mã khách hàng"
                        placeholder="Mã mặc định"
                        value={editCustomer.customerCode}
                        onChange={async (e) => {
                          const value = e.target.value;
                          setEditCustomer({ ...editCustomer, customerCode: value });
                          if (value.trim()) {
                            const exists = await checkCustomerCodeExists(value, editCustomer.localId);
                            if (exists) {
                              setEditCustomerErrors(prev => ({ ...prev, customerCode: 'Mã khách hàng đã tồn tại' }));
                            } else {
                              setEditCustomerErrors(prev => ({ ...prev, customerCode: '' }));
                            }
                          } else {
                            setEditCustomerErrors(prev => ({ ...prev, customerCode: '' }));
                          }
                        }}
                        error={!!editCustomerErrors.customerCode}
                        helperText={editCustomerErrors.customerCode}
                        InputProps={{
                          endAdornment: (
                            <InputAdornment position="end">
                              <IconButton
                                size="small"
                                onClick={async () => {
                                  const code = await generateCustomerCode();
                                  setEditCustomer({ ...editCustomer, customerCode: code });
                                  setEditCustomerErrors(prev => ({ ...prev, customerCode: '' }));
                                }}
                                title="Tự động tạo mã"
                              >
                                <Box sx={{ fontSize: '0.75rem', color: 'primary.main' }}>Auto</Box>
                              </IconButton>
                            </InputAdornment>
                          )
                        }}
                      />

                      <TextField
                        label="Tên khách hàng"
                        placeholder="Tên hoặc biệt danh"
                        value={editCustomer.name}
                        onChange={(e) => setEditCustomer({ ...editCustomer, name: e.target.value })}
                        error={!editCustomer.name.trim() && !String(editCustomer.nickname || '').trim()}
                        helperText={!editCustomer.name.trim() && !String(editCustomer.nickname || '').trim() ? 'Nhập tên hoặc biệt danh' : ''}
                      />
                      <TextField
                        label="Biệt danh"
                        value={editCustomer.nickname || ''}
                        onChange={(e) => setEditCustomer({ ...editCustomer, nickname: e.target.value })}
                      />

                      <TextField
                        label="Điện thoại"
                        value={editCustomer.phone}
                        onChange={async (e) => {
                          const value = e.target.value;
                          setEditCustomer({ ...editCustomer, phone: value });
                          if (value.trim()) {
                            const exists = await checkPhoneExists(value, editCustomer.localId);
                            if (exists) {
                              setEditCustomerErrors(prev => ({ ...prev, phone: 'Số điện thoại đã tồn tại' }));
                            } else {
                              setEditCustomerErrors(prev => ({ ...prev, phone: '' }));
                            }
                          } else {
                            setEditCustomerErrors(prev => ({ ...prev, phone: '' }));
                          }
                        }}
                        error={!!editCustomerErrors.phone}
                        helperText={editCustomerErrors.phone}
                      />

                      <TextField
                        label="Địa chỉ"
                        placeholder="Số nhà, tòa nhà, ngõ, đường"
                        value={editCustomer.address}
                        onChange={(e) => setEditCustomer({ ...editCustomer, address: e.target.value })}
                      />

                      <TextField
                        label="Khu vực"
                        placeholder="Chọn Tỉnh/TP - Quận/Huyện"
                        value={editCustomer.area}
                        onChange={(e) => setEditCustomer({ ...editCustomer, area: e.target.value })}
                      />

                      <TextField
                        label="Phường xã"
                        placeholder="Chọn Phường/Xã"
                        value={editCustomer.ward}
                        onChange={(e) => setEditCustomer({ ...editCustomer, ward: e.target.value })}
                      />
                    </Box>

                    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <TextField
                        label="Nhóm"
                        value={editCustomer.group}
                        onChange={(e) => setEditCustomer({ ...editCustomer, group: e.target.value })}
                      />

                      <Box>
                        <TextField
                          label="Ngày sinh"
                          type="date"
                          value={editCustomer.dateOfBirth}
                          onChange={(e) => setEditCustomer({ ...editCustomer, dateOfBirth: e.target.value })}
                          InputLabelProps={{
                            shrink: true,
                          }}
                          fullWidth
                        />
                        <FormControl component="fieldset" sx={{ mt: 1 }}>
                          <FormLabel component="legend">Giới tính</FormLabel>
                          <RadioGroup
                            row
                            value={editCustomer.gender}
                            onChange={(e) => setEditCustomer({ ...editCustomer, gender: e.target.value })}
                          >
                            <FormControlLabel value="male" control={<Radio />} label="Nam" />
                            <FormControlLabel value="female" control={<Radio />} label="Nữ" />
                          </RadioGroup>
                        </FormControl>
                      </Box>

                      <TextField
                        label="Email"
                        type="email"
                        value={editCustomer.email}
                        onChange={(e) => setEditCustomer({ ...editCustomer, email: e.target.value })}
                      />

                      <TextField
                        label="Facebook"
                        value={editCustomer.facebook}
                        onChange={(e) => setEditCustomer({ ...editCustomer, facebook: e.target.value })}
                      />

                      <TextField
                        label="Ghi chú"
                        multiline
                        rows={3}
                        value={editCustomer.note}
                        onChange={(e) => setEditCustomer({ ...editCustomer, note: e.target.value })}
                      />
                    </Box>
                  </Box>
                </Box>
              )}

              {editCustomerTab === 1 && (
                <Box sx={{ pt: 1 }}>
                  {(() => {
                    const safeOrderHistory = Array.isArray(orderHistory)
                      ? orderHistory.filter(Boolean)
                      : [];
                    const totalSales = safeOrderHistory.reduce(
                      (sum, order) => sum + (Number(order?.totalAmount) || 0),
                      0
                    );

                    return (
                      <>
                        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                          <Typography variant="body2" color="text.secondary">
                            Số lần mua: {safeOrderHistory.length}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Tổng bán trừ trả hàng: {totalSales.toLocaleString('en-US')}
                          </Typography>
                        </Box>

                  {orderHistoryLoading ? (
                    <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
                      <CircularProgress size={24} />
                    </Box>
                  ) : safeOrderHistory.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      Chưa có lịch sử bán/trả hàng
                    </Typography>
                  ) : (
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Mã hóa đơn</TableCell>
                          <TableCell>Thời gian</TableCell>
                          <TableCell>Người bán</TableCell>
                          <TableCell align="right">Tổng cộng</TableCell>
                          <TableCell>Trạng thái</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {safeOrderHistory.map((order) => {
                          const createdAt = order?.createdAt ? new Date(order.createdAt) : null;
                          const createdAtLabel =
                            createdAt && !Number.isNaN(createdAt.getTime())
                              ? createdAt.toLocaleString('vi-VN', { hour12: false })
                              : '';

                          return (
                            <TableRow key={order?.localId || order?.orderCode}>
                              <TableCell>
                                <Link
                                  component="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenOrderHistoryDetail(order);
                                  }}
                                  sx={{ color: 'primary.main', fontWeight: 600, textAlign: 'left', cursor: 'pointer' }}
                                  underline="hover"
                                >
                                  {displayOrderCode(order?.orderCode)}
                                </Link>
                              </TableCell>
                              <TableCell>{createdAtLabel}</TableCell>
                              <TableCell>{cashierName}</TableCell>
                              <TableCell align="right">
                                {(Number(order?.totalAmount) || 0).toLocaleString('en-US')}
                              </TableCell>
                              <TableCell>{order?.status === 'completed' ? 'Hoàn thành' : (order?.status || '')}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                      </>
                    );
                  })()}
                </Box>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditCustomerDialogOpen(false)}>
            Bỏ qua
          </Button>
          <Button
            variant="contained"
            onClick={async () => {
              if (!editCustomer) return;
              if (!editCustomer.name.trim() && !String(editCustomer.nickname || '').trim()) {
                showSnackbar('Vui lòng nhập tên hoặc biệt danh', 'error');
                return;
              }
              if (editCustomerErrors.customerCode || editCustomerErrors.phone) {
                showSnackbar('Vui lòng sửa các lỗi trước khi lưu', 'error');
                return;
              }
              setEditCustomerLoading(true);
              try {
                const customerCode = editCustomer.customerCode.trim() || null;
                if (customerCode) {
                  const codeExists = await checkCustomerCodeExists(customerCode, editCustomer.localId);
                  if (codeExists) {
                    showSnackbar('Mã khách hàng đã tồn tại', 'error');
                    setEditCustomerLoading(false);
                    return;
                  }
                }
                if (editCustomer.phone.trim()) {
                  const phoneExists = await checkPhoneExists(editCustomer.phone.trim(), editCustomer.localId);
                  if (phoneExists) {
                    showSnackbar('Số điện thoại đã tồn tại', 'error');
                    setEditCustomerLoading(false);
                    return;
                  }
                }

                const now = Date.now();
                await db.customers.update(editCustomer.localId, {
                  customerCode,
                  name: editCustomer.name.trim(),
                  nickname: String(editCustomer.nickname || '').trim(),
                  phone: editCustomer.phone.trim() || null,
                  address: editCustomer.address.trim() || null,
                  area: editCustomer.area.trim() || null,
                  ward: editCustomer.ward.trim() || null,
                  group: editCustomer.group.trim() || null,
                  dateOfBirth: editCustomer.dateOfBirth || null,
                  gender: editCustomer.gender,
                  email: editCustomer.email.trim() || null,
                  facebook: editCustomer.facebook.trim() || null,
                  note: editCustomer.note.trim() || null,
                  updatedAt: now,
                  synced: false
                });

                if (customerLocalId === editCustomer.localId) {
                  updateCurrentInvoice({ 
                    customerPhone: editCustomer.phone.trim() || '',
                    customerName: formatCustomerLabel(editCustomer),
                    customerSearchTerm: ''
                  });
                }

                setEditCustomerDialogOpen(false);
                showSnackbar('Cập nhật khách hàng thành công!', 'success');
              } catch (error) {
                console.error('Lỗi cập nhật khách hàng:', error);
                showSnackbar('Có lỗi xảy ra khi cập nhật khách hàng!', 'error');
              } finally {
                setEditCustomerLoading(false);
              }
            }}
            disabled={
              editCustomerLoading ||
              !editCustomer ||
              (!editCustomer.name.trim() && !String(editCustomer.nickname || '').trim())
            }
          >
            {editCustomerLoading ? 'Đang lưu...' : 'Lưu'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={storeDialogOpen}
        onClose={() => setStoreDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Tạo cửa hàng</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Tên cửa hàng"
              value={newStore.name}
              onChange={(e) => setNewStore((prev) => ({ ...prev, name: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Số điện thoại"
              value={newStore.phone}
              onChange={(e) => setNewStore((prev) => ({ ...prev, phone: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Địa chỉ"
              value={newStore.address}
              onChange={(e) => setNewStore((prev) => ({ ...prev, address: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Mã cửa hàng (tuỳ chọn)"
              value={newStore.storeId}
              onChange={(e) => setNewStore((prev) => ({ ...prev, storeId: e.target.value }))}
              helperText="Ví dụ: trungtam, q1, q2..."
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStoreDialogOpen(false)}>Hủy</Button>
          <Button variant="contained" onClick={handleCreateStore}>
            Tạo cửa hàng
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={printSettingsOpen}
        onClose={() => setPrintSettingsOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Thiết lập in hóa đơn</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={autoPrintEnabled}
                  onChange={(e) => setAutoPrintEnabled(e.target.checked)}
                />
              }
              label="Tự động in hóa đơn"
            />
            <TextField
              label="Số bản in (Liên)"
              type="number"
              size="small"
              value={printCopies}
              onFocus={(e) => e.target.select()}
              onChange={(e) => {
                const value = Math.max(1, Number(e.target.value) || 1);
                setPrintCopies(value);
              }}
              inputProps={{ min: 1 }}
            />
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Chọn mẫu in
              </Typography>
              <Button variant="contained" sx={{ textTransform: 'none' }} disabled>
                {printTemplate === 'invoice' ? 'A. Mẫu in hóa đơn' : 'Mẫu in'}
              </Button>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPrintSettingsOpen(false)}>Bỏ qua</Button>
          <Button variant="contained" onClick={() => setPrintSettingsOpen(false)}>
            Xong
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={closeInvoiceConfirmOpen}
        onClose={() => {
          setCloseInvoiceConfirmOpen(false);
          setPendingCloseTabIndex(null);
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Xác nhận đóng hóa đơn</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Hóa đơn này đang có dữ liệu tính tiền. Bạn muốn hủy hóa đơn này?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setCloseInvoiceConfirmOpen(false);
              setPendingCloseTabIndex(null);
            }}
          >
            Bỏ qua
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              if (pendingCloseTabIndex != null) {
                closeInvoiceByTabIndex(pendingCloseTabIndex);
              }
              setCloseInvoiceConfirmOpen(false);
              setPendingCloseTabIndex(null);
            }}
          >
            Đồng ý hủy
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={restoreDraftDialogOpen}
        onClose={closeRestoreDraftDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Khôi phục hóa đơn đang làm dở</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Hệ thống phát hiện có hóa đơn nháp chưa hoàn thành. Bạn muốn tiếp tục các hóa đơn này?
          </Typography>
          {pendingDraftData?.savedAt ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Lưu gần nhất: {new Date(pendingDraftData.savedAt).toLocaleString('vi-VN', { hour12: false })}
            </Typography>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={discardPendingDraft}
          >
            Bỏ qua
          </Button>
          <Button
            variant="contained"
            onClick={applyPendingDraft}
          >
            Tiếp tục
          </Button>
        </DialogActions>
      </Dialog>

      <Drawer anchor="right" open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Box sx={{ width: 320, p: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
            Danh mục chức năng
          </Typography>
          <List>
            <ListItemButton
              onClick={() => {
                setDrawerOpen(false);
                setReportDialogOpen(true);
              }}
            >
              <ListItemIcon>
                <BarChartIcon />
              </ListItemIcon>
              <ListItemText primary="Xem báo cáo bán hàng" />
            </ListItemButton>
            <ListItemButton
              onClick={() => {
                setDrawerOpen(false);
                setReturnDialogOpen(true);
              }}
            >
              <ListItemIcon>
                <UndoIcon />
              </ListItemIcon>
              <ListItemText primary="Chọn hóa đơn trả hàng" />
            </ListItemButton>
            <ListItemButton
              onClick={() => {
                setDrawerOpen(false);
                showSnackbar('Chức năng import file sẽ được cập nhật sau', 'info');
              }}
            >
              <ListItemIcon>
                <FileUploadIcon />
              </ListItemIcon>
              <ListItemText primary="Import file" />
            </ListItemButton>
            <ListItemButton
              onClick={() => {
                setDrawerOpen(false);
                showSnackbar('Tùy chọn hiển thị sẽ được cập nhật sau', 'info');
              }}
            >
              <ListItemIcon>
                <TuneIcon />
              </ListItemIcon>
              <ListItemText primary="Tùy chọn hiển thị" />
            </ListItemButton>
            <ListItemButton
              onClick={() => {
                setDrawerOpen(false);
                syncAllData();
              }}
              disabled={syncing}
            >
              <ListItemIcon>
                {syncing ? <CircularProgress size={20} /> : <SyncIcon />}
              </ListItemIcon>
              <ListItemText
                primary={syncing ? 'Đang đồng bộ...' : 'Đồng bộ dữ liệu'}
                secondary={
                  syncStatus === 'error'
                    ? 'Đồng bộ lỗi, sẽ thử lại'
                    : lastSyncAt
                      ? `Lần cuối: ${new Date(lastSyncAt).toLocaleString('vi-VN', { hour12: false })}`
                      : 'Chưa đồng bộ'
                }
              />
            </ListItemButton>
            <ListItemButton
              onClick={() => {
                setDrawerOpen(false);
                showSnackbar('Bảng phím tắt sẽ được cập nhật sau', 'info');
              }}
            >
              <ListItemIcon>
                <KeyboardIcon />
              </ListItemIcon>
              <ListItemText primary="Phím tắt" />
            </ListItemButton>
            <Divider sx={{ my: 1 }} />
            <ListItemButton
              onClick={() => {
                setDrawerOpen(false);
                apiRequest('/api/auth/switch', {
                  method: 'POST',
                  body: JSON.stringify({ targetApp: 'pos-admin' }),
                })
                  .catch(() => null)
                  .finally(() => {
                    navigate('/admin/dashboard');
                  });
              }}
            >
              <ListItemIcon>
                <AppsIcon />
              </ListItemIcon>
              <ListItemText primary="Quản lý" />
            </ListItemButton>
            <ListItemButton
              onClick={() => {
                setDrawerOpen(false);
                setLogoutDialogOpen(true);
              }}
            >
              <ListItemIcon>
                <ExitToAppIcon />
              </ListItemIcon>
              <ListItemText primary="Đăng xuất" />
            </ListItemButton>
          </List>
        </Box>
      </Drawer>

      <Dialog
        open={logoutDialogOpen}
        onClose={() => setLogoutDialogOpen(false)}
      >
        <DialogTitle>Đăng xuất</DialogTitle>
        <DialogContent>
          <Typography>Bạn có chắc muốn đăng xuất không?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLogoutDialogOpen(false)}>Hủy</Button>
          <Button color="error" variant="contained" onClick={handleLogout}>
            Đăng xuất
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={reportDialogOpen}
        onClose={() => setReportDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Báo cáo bán hàng</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              select
              label="Xem theo"
              size="small"
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
            >
              <MenuItem value="day">Theo ngày</MenuItem>
              <MenuItem value="month">Theo tháng</MenuItem>
              <MenuItem value="quarter">Theo quý</MenuItem>
              <MenuItem value="year">Theo năm dương lịch</MenuItem>
              <MenuItem value="lunarYear">Theo năm âm lịch</MenuItem>
            </TextField>

            {reportType === 'day' && (
              <TextField
                label="Ngày"
                type="date"
                size="small"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            )}
            {reportType === 'month' && (
              <TextField
                label="Tháng"
                type="month"
                size="small"
                value={reportMonth}
                onChange={(e) => setReportMonth(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            )}
            {reportType === 'quarter' && (
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <TextField
                  select
                  label="Quý"
                  size="small"
                  value={reportQuarter}
                  onChange={(e) => setReportQuarter(Number(e.target.value))}
                  sx={{ minWidth: 120 }}
                >
                  <MenuItem value={1}>Quý 1</MenuItem>
                  <MenuItem value={2}>Quý 2</MenuItem>
                  <MenuItem value={3}>Quý 3</MenuItem>
                  <MenuItem value={4}>Quý 4</MenuItem>
                </TextField>
                <TextField
                  label="Năm"
                  type="number"
                  size="small"
                  value={reportYear}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setReportYear(Number(e.target.value) || new Date().getFullYear())}
                  inputProps={{ min: 2000, max: 2100 }}
                />
              </Box>
            )}
            {reportType === 'year' && (
              <TextField
                label="Năm"
                type="number"
                size="small"
                value={reportYear}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setReportYear(Number(e.target.value) || new Date().getFullYear())}
                inputProps={{ min: 2000, max: 2100 }}
              />
            )}
            {reportType === 'lunarYear' && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <TextField
                  label="Năm âm lịch"
                  type="number"
                  size="small"
                  value={reportLunarYear}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setReportLunarYear(Number(e.target.value) || new Date().getFullYear())}
                  inputProps={{ min: 2000, max: 2100 }}
                />
                <Typography variant="caption" color="text.secondary">
                  Năm âm lịch hiện tạm tính theo năm dương lịch để hiển thị báo cáo.
                </Typography>
              </Box>
            )}

            <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              {reportLoading ? (
                <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
                  <CircularProgress size={24} />
                </Box>
              ) : (
                <>
                  <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
                    <Chip
                      label={`Đơn hàng: ${reportData.orderCount}`}
                      variant="outlined"
                    />
                    <Chip
                      label={`Giá vốn: ${reportData.totalCost.toLocaleString('en-US')}`}
                      color="default"
                    />
                   
                    <Chip
                      label={`Lợi nhuận: ${reportData.totalProfit.toLocaleString('en-US')}`}
                      color={reportData.totalProfit >= 0 ? 'success' : 'error'}
                    />
                     <Chip
                      label={`Doanh thu: ${reportData.totalSales.toLocaleString('en-US')}`}
                      color="primary"
                    />
                  </Box>

                  {(() => {
                    const buckets = reportData.buckets || [];
                    const maxValue = Math.max(
                      ...buckets.map((bucket) => Math.max(bucket.totalSales, 0)),
                      1
                    );
                    const barHeight = (value) => (Math.max(value, 0) / maxValue) * 180;
                    return (
                      <Box sx={{ overflowX: 'auto', pb: 1 }}>
                        <Box
                          sx={{
                            display: 'flex',
                            gap: 1,
                            minWidth: buckets.length * 28,
                          }}
                        >
                          {buckets.map((bucket) => (
                            <Box key={bucket.label} sx={{ minWidth: 28 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', height: 220 }}>
                              <Tooltip
                                title={`${bucket.label} · Giá vốn: ${bucket.totalCost.toLocaleString('en-US')} · Lợi nhuận: ${bucket.totalProfit.toLocaleString('en-US')} · Doanh thu: ${bucket.totalSales.toLocaleString('en-US')}`}
                                arrow
                              >
                                <Box
                                  sx={{
                                    width: 18,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'flex-end',
                                    position: 'relative',
                                  }}
                                >
                                  <Box
                                    sx={{
                                      height: barHeight(bucket.totalProfit),
                                      bgcolor: bucket.totalProfit >= 0 ? 'success.main' : 'error.main',
                                      borderTopLeftRadius: 4,
                                      borderTopRightRadius: 4,
                                    }}
                                  />
                                  <Box
                                    sx={{
                                      height: barHeight(bucket.totalCost),
                                      bgcolor: 'grey.400',
                                      borderBottomLeftRadius: 4,
                                      borderBottomRightRadius: 4,
                                    }}
                                  />
                                  <Box
                                    sx={{
                                      position: 'absolute',
                                      left: 0,
                                      right: 0,
                                      height: 2,
                                      bottom: Math.max(barHeight(bucket.totalSales) - 1, 0),
                                      bgcolor: 'primary.main',
                                    }}
                                  />
                                </Box>
                              </Tooltip>
                            </Box>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center' }}>
                              {bucket.label}
                            </Typography>
                          </Box>
                          ))}
                        </Box>
                      </Box>
                    );
                  })()}
                </>
              )}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReportDialogOpen(false)}>Đóng</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog chọn hóa đơn trả hàng */}
      <Dialog
        open={returnDialogOpen}
        onClose={() => setReturnDialogOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          Chọn hóa đơn trả hàng
          <IconButton size="small" onClick={() => setReturnDialogOpen(false)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Tabs
            value={returnDialogTab}
            onChange={(_, value) => setReturnDialogTab(Number(value))}
            sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
          >
            <Tab label="Hóa đơn mua" value={0} />
            <Tab label="Hóa đơn đổi trả" value={1} />
          </Tabs>
          <Box sx={{ display: 'flex', gap: 2, minHeight: 420 }}>
            <Box sx={{ width: 280, display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 700 }}>
                  Tìm kiếm
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                  <TextField
                    size="small"
                    fullWidth
                    label="Theo mã hóa đơn"
                    placeholder="VD: HD12"
                    value={returnFilterOrderCode}
                    onChange={(e) => setReturnFilterOrderCode(e.target.value)}
                  />
                  <TextField
                    size="small"
                    fullWidth
                    label="Theo mã vận đơn bán"
                    placeholder="Mã vận đơn"
                    value={returnFilterShippingCode}
                    onChange={(e) => setReturnFilterShippingCode(e.target.value)}
                  />
                  <TextField
                    size="small"
                    fullWidth
                    label="Theo khách hàng hoặc ĐT"
                    placeholder="Tên hoặc số điện thoại"
                    value={returnFilterCustomer}
                    onChange={(e) => setReturnFilterCustomer(e.target.value)}
                  />
                  <TextField
                    size="small"
                    fullWidth
                    label="Theo mã hàng"
                    placeholder="Mã hàng / barcode"
                    value={returnFilterProductCode}
                    onChange={(e) => setReturnFilterProductCode(e.target.value)}
                  />
                  <TextField
                    size="small"
                    fullWidth
                    label="Theo tên hàng"
                    placeholder="Tên sản phẩm"
                    value={returnFilterProductName}
                    onChange={(e) => setReturnFilterProductName(e.target.value)}
                  />
                </Box>
              </Paper>

              <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
                  Thời gian
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Để trống để xem tất cả, đơn mới nhất trước.
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <TextField
                    type="date"
                    size="small"
                    label="Từ ngày"
                    value={returnFromDate}
                    onChange={(e) => setReturnFromDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                  <TextField
                    type="date"
                    size="small"
                    label="Đến ngày"
                    value={returnToDate}
                    onChange={(e) => setReturnToDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                </Box>
              </Paper>
            </Box>

            <Paper sx={{ flex: 1, p: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ flex: 1, overflow: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      {returnDialogTab === 0 ? (
                        <>
                          <TableCell padding="checkbox">
                            <Checkbox
                              size="small"
                              checked={
                                returnPageOrders.length > 0 &&
                                returnPageOrders.every((order) => quickReturnSelection.has(order.localId))
                              }
                              indeterminate={
                                returnPageOrders.some((order) => quickReturnSelection.has(order.localId)) &&
                                !returnPageOrders.every((order) => quickReturnSelection.has(order.localId))
                              }
                              onChange={toggleQuickReturnSelectAllCurrentPage}
                            />
                          </TableCell>
                          <TableCell>Mã hóa đơn</TableCell>
                          <TableCell>Thời gian</TableCell>
                          <TableCell>Nhân viên</TableCell>
                          <TableCell>Khách hàng</TableCell>
                          <TableCell>Mã trả hàng</TableCell>
                          <TableCell align="right">Tổng cộng</TableCell>
                          <TableCell align="right"> </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell>Mã trả hàng</TableCell>
                          <TableCell>Hóa đơn gốc</TableCell>
                          <TableCell>Hóa đơn mua</TableCell>
                          <TableCell>Thời gian</TableCell>
                          <TableCell>Khách hàng</TableCell>
                          <TableCell align="right">Tổng cộng</TableCell>
                        </>
                      )}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {returnDialogTab === 0 ? (
                      returnOrdersLoading ? (
                        <TableRow>
                          <TableCell colSpan={8}>
                            <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
                              <CircularProgress size={24} />
                            </Box>
                          </TableCell>
                        </TableRow>
                      ) : filteredReturnOrders.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8}>
                            <Typography variant="body2" color="text.secondary">
                              Không tìm thấy hóa đơn phù hợp
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ) : (
                        returnPageOrders.map((order) => {
                          const createdAt = order?.createdAt ? new Date(order.createdAt) : null;
                          const createdAtLabel =
                            createdAt && !Number.isNaN(createdAt.getTime())
                              ? createdAt.toLocaleString('vi-VN', { hour12: false })
                              : '';
                          const returnRecords = order.returnRecords || [];
                          return (
                            <TableRow key={order.localId || order.orderCode}>
                              <TableCell padding="checkbox">
                                <Checkbox
                                  size="small"
                                  checked={quickReturnSelection.has(order.localId)}
                                  onChange={() => toggleQuickReturnSelect(order.localId)}
                                />
                              </TableCell>
                              <TableCell sx={{ color: 'primary.main', fontWeight: 600 }}>
                                <Link
                                  component="button"
                                  underline="hover"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenOrderHistoryDetail(order);
                                  }}
                                  sx={{ color: 'primary.main', fontWeight: 700, textAlign: 'left', cursor: 'pointer' }}
                                >
                                  {order.orderCode || '—'}
                                </Link>
                              </TableCell>
                              <TableCell>{createdAtLabel}</TableCell>
                              <TableCell>{cashierName}</TableCell>
                              <TableCell>
                                {order.customerLabel}
                                {order.customerPhone ? (
                                  <Typography variant="caption" color="text.secondary" display="block">
                                    {order.customerPhone}
                                  </Typography>
                                ) : null}
                              </TableCell>
                              <TableCell>
                                {returnRecords.length === 0 ? (
                                  '—'
                                ) : (
                                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                                    {returnRecords.map((rec) => (
                                      <Link
                                        key={rec.localId}
                                        component="button"
                                        variant="body2"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleOpenReturnDetail(rec);
                                        }}
                                        sx={{ color: 'primary.main', textAlign: 'left', cursor: 'pointer' }}
                                      >
                                        {rec.returnCode || '—'}
                                      </Link>
                                    ))}
                                  </Box>
                                )}
                              </TableCell>
                              <TableCell align="right">
                                {(Number(order.totalAmount) || 0).toLocaleString('en-US')}
                              </TableCell>
                              <TableCell align="right">
                                <Button
                                  size="small"
                                  variant="outlined"
                                  onClick={() => handleSelectReturnOrder(order)}
                                >
                                  Chọn
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )
                    ) : (
                      returnRecordsLoading ? (
                        <TableRow>
                          <TableCell colSpan={6}>
                            <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
                              <CircularProgress size={24} />
                            </Box>
                          </TableCell>
                        </TableRow>
                      ) : filteredReturnRecords.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6}>
                            <Typography variant="body2" color="text.secondary">
                              Không tìm thấy hóa đơn đổi trả
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ) : (
                        returnRecordsPageItems.map((record) => {
                          const createdAt = record?.createdAt ? new Date(record.createdAt) : null;
                          const createdAtLabel =
                            createdAt && !Number.isNaN(createdAt.getTime())
                              ? createdAt.toLocaleString('vi-VN', { hour12: false })
                              : '';
                          return (
                            <TableRow
                              key={record.localId || record.returnCode}
                              hover
                              sx={{ cursor: 'pointer' }}
                              onClick={() => handleOpenReturnDetail(record)}
                            >
                              <TableCell sx={{ color: 'primary.main', fontWeight: 600 }}>
                                {displayReturnCode(record.returnCode)}
                              </TableCell>
                              <TableCell>{record.orderCode || ''}</TableCell>
                              <TableCell>{record.exchangeOrderCode || ''}</TableCell>
                              <TableCell>{createdAtLabel}</TableCell>
                              <TableCell>{record.customerLabel}</TableCell>
                              <TableCell align="right">
                                {(Number(record.totalExchangeAmount) || 0).toLocaleString('en-US')}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )
                    )}
                  </TableBody>
                </Table>
              </Box>
              <Box
                sx={{
                  p: 1.5,
                  borderTop: '1px solid',
                  borderColor: 'divider',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 2
                }}
              >
                {returnDialogTab === 0 ? (
                  <>
                    <Pagination
                      count={returnTotalPages}
                      page={returnPageSafe}
                      onChange={(_, page) => setReturnPage(page)}
                      size="small"
                      color="primary"
                    />
                    <Typography variant="caption" color="text.secondary">
                      {filteredReturnOrders.length === 0
                        ? 'Hiển thị 0 - 0 trên tổng số 0 hóa đơn'
                        : `Hiển thị ${returnPageStart + 1} - ${returnPageEnd} trên tổng số ${filteredReturnOrders.length} hóa đơn`}
                    </Typography>
                  </>
                ) : (
                  <>
                    <Pagination
                      count={returnRecordsTotalPages}
                      page={returnRecordsPageSafe}
                      onChange={(_, page) => setReturnRecordsPage(page)}
                      size="small"
                      color="primary"
                    />
                    <Typography variant="caption" color="text.secondary">
                      {filteredReturnRecords.length === 0
                        ? 'Hiển thị 0 - 0 trên tổng số 0 hóa đơn'
                        : `Hiển thị ${returnRecordsPageStart + 1} - ${returnRecordsPageEnd} trên tổng số ${filteredReturnRecords.length} hóa đơn`}
                    </Typography>
                  </>
                )}
              </Box>
            </Paper>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReturnDialogOpen(false)}>Đóng</Button>
          <Button
            variant="contained"
            disabled={returnDialogTab !== 0 || quickReturnSelection.size === 0 || quickReturnProcessing}
            onClick={handleQuickReturn}
          >
            {quickReturnProcessing ? 'Đang trả nhanh...' : 'Trả nhanh'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={addBankDialogOpen}
        onClose={() => { setAddBankDialogOpen(false); }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Thêm tài khoản ngân hàng</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 1 }}>
            <TextField
              select
              label="Ngân hàng"
              size="small"
              value={newBankAccount.bankCode}
              onChange={(e) => {
                const bankCode = e.target.value;
                const bank = BANK_OPTION_MAP[bankCode];
                setNewBankAccount({
                  ...newBankAccount,
                  bankCode,
                  bankName: bank?.name || '',
                });
              }}
            >
              <MenuItem value="" disabled>
                Chọn ngân hàng
              </MenuItem>
              {BANK_OPTIONS.map((bank) => (
                <MenuItem key={bank.code} value={bank.code}>
                  {bank.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Số tài khoản"
              size="small"
              value={newBankAccount.accountNumber}
              onChange={(e) => {
                const accountNumber = e.target.value.replace(/\D/g, '');
                setNewBankAccount({
                  ...newBankAccount,
                  accountNumber,
                });
              }}
            />
            <TextField
              label="Chủ tài khoản"
              size="small"
              value={newBankAccount.accountName}
              onChange={(e) => setNewBankAccount({ ...newBankAccount, accountName: e.target.value })}
              helperText="Nguoi quan ly tu nhap ten chu tai khoan"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setAddBankDialogOpen(false); }}>Hủy</Button>
          <Button
            variant="contained"
            disabled={
              !newBankAccount.bankName.trim() ||
              !newBankAccount.bankCode.trim() ||
              !newBankAccount.accountNumber.trim() ||
              !newBankAccount.accountName.trim()
            }
            onClick={() => {
              const newAccount = {
                id: `${Date.now()}`,
                bankName: newBankAccount.bankName.trim(),
                bankCode: newBankAccount.bankCode.trim(),
                accountNumber: newBankAccount.accountNumber.trim(),
                accountName: newBankAccount.accountName.trim()
              };
              const updated = [...bankAccounts, newAccount];
              saveBankAccounts(updated);
              setSelectedBankAccountId(newAccount.id);
              setNewBankAccount({
                bankName: '',
                bankCode: '',
                accountNumber: '',
                accountName: ''
              });
              setAddBankDialogOpen(false);
            }}
          >
            Lưu
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={bankVerifyDialogOpen}
        onClose={() => setBankVerifyDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Xác nhận chuyển khoản</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Thu ngân vui lòng xác nhận lại giao dịch chuyển khoản.
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.main' }}>
            {Number(bankVerifyAmount || 0).toLocaleString('en-US')} đ
          </Typography>
          {selectedBankAccount && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              {selectedBankAccount.bankName} - {selectedBankAccount.accountNumber}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => confirmBankTransferStatus(false)}>
            Chưa thành công
          </Button>
          <Button variant="contained" onClick={() => confirmBankTransferStatus(true)}>
            Đã nhận tiền thành công
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={qrPreviewOpen} onClose={() => setQrPreviewOpen(false)} maxWidth="xs">
        <DialogTitle>Mã QR chuyển khoản</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 1 }}>
            {selectedBankAccount && (
              <img
                src={getBankQrUrl(
                  selectedBankAccount,
                  returnNeedToPay,
                  customerName || customerPhone || ''
                )}
                alt="QR chuyển khoản"
                style={{ width: 240, height: 240 }}
              />
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setQrPreviewOpen(false)}>Đóng</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={orderHistoryDetailOpen}
        onClose={() => setOrderHistoryDetailOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="body2" fontWeight={700}>
            Chi tiết hóa đơn
          </Typography>
          <IconButton size="small" onClick={() => setOrderHistoryDetailOpen(false)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {orderHistoryDetailLoading ? (
            <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
              <CircularProgress size={24} />
            </Box>
          ) : orderHistoryDetail ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {(() => {
                const createdAtLabel = orderHistoryDetail?.createdAt
                  ? new Date(orderHistoryDetail.createdAt).toLocaleString('vi-VN', { hour12: false })
                  : '';

                const customerCode = orderHistoryDetail?.customerCode || '';
                const customerLocalId = orderHistoryDetail?.customerLocalId || '';
                const isWalkIn =
                  !orderHistoryDetail?.customerLocalId &&
                  !orderHistoryDetail?.customerPhone &&
                  (!orderHistoryDetail?.customerName || orderHistoryDetail.customerName === 'Khách lẻ');
                return (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                      <Typography variant="body2">
                        Mã hóa đơn:{' '}
                        <strong>{orderHistoryDetail?.orderCode || '—'}</strong>
                      </Typography>
                      <Typography variant="body2">
                        Thời gian bán: <strong>{createdAtLabel || '-'}</strong>
                      </Typography>
                      <Typography variant="body2">
                        Người bán: <strong>{orderHistoryDetail?.cashierName || '-'}</strong>
                      </Typography>
                      <Typography variant="body2">
                        Tổng lúc mua:{' '}
                        <strong>
                          {(Number(orderHistoryDetail?.originalTotalAmount)
                            || Number(orderHistoryDetail?.invoiceGoodsSubtotal)
                            || 0
                          ).toLocaleString('en-US')} đ
                        </strong>
                      </Typography>
                      <Typography variant="body2">
                        Tổng hiện tại (sau đổi trả):{' '}
                        <strong style={{ color: '#1976d2' }}>
                          {(Number(orderHistoryDetail?.currentTotalAmount)
                            || Number(orderHistoryDetail?.currentGoodsSubtotal)
                            || 0
                          ).toLocaleString('en-US')} đ
                        </strong>
                      </Typography>
                    </Box>

                    <Paper variant="outlined" sx={{ p: 1.5 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                        Thông tin khách hàng
                      </Typography>
                      {isWalkIn ? (
                        <Typography variant="body2" color="text.secondary">
                          Khách lẻ
                        </Typography>
                      ) : (
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                          <Typography variant="body2">
                            Tên:{' '}
                            <strong>
                              {orderHistoryDetail?.customerName || 'Khách lẻ'}
                            </strong>
                            {customerCode ? (
                              <>
                                {' '}
                                (
                                <Link
                                  component="button"
                                  underline="hover"
                                  onClick={() => {
                                    if (customerLocalId) openEditCustomer(customerLocalId);
                                  }}
                                  sx={{ color: 'primary.main', fontWeight: 700 }}
                                >
                                  {customerCode}
                                </Link>
                                )
                              </>
                            ) : null}
                          </Typography>
                          <Typography variant="body2">
                            Điện thoại: <strong>{orderHistoryDetail?.customerPhone || '—'}</strong>
                          </Typography>
                          <Typography variant="body2">
                            Email: <strong>{orderHistoryDetail?.customerEmail || '—'}</strong>
                          </Typography>
                          <Typography variant="body2">
                            Tuổi / ngày sinh:{' '}
                            <strong>
                              {orderHistoryDetail?.customerAge
                                ? `${orderHistoryDetail.customerAge} tuổi`
                                : '—'}
                              {orderHistoryDetail?.customerDateOfBirth
                                ? ` (${orderHistoryDetail.customerDateOfBirth})`
                                : ''}
                            </strong>
                          </Typography>
                          <Typography variant="body2" sx={{ gridColumn: { sm: '1 / -1' } }}>
                            Địa chỉ: <strong>{orderHistoryDetail?.customerAddress || '—'}</strong>
                          </Typography>
                        </Box>
                      )}
                    </Paper>
                  </Box>
                );
              })()}

              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
                  Đơn hàng đã mua (lúc bán đầu)
                </Typography>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Mã hàng</TableCell>
                      <TableCell>Tên hàng</TableCell>
                      <TableCell align="right">SL</TableCell>
                      <TableCell align="right">Đơn giá gốc</TableCell>
                      <TableCell align="right">Giảm giá</TableCell>
                      <TableCell align="right">Giá bán</TableCell>
                      <TableCell align="right">Thành tiền</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(orderHistoryDetail?.originalItems || orderHistoryDetail?.invoiceLineItems || []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} align="center">
                          Không có dữ liệu
                        </TableCell>
                      </TableRow>
                    ) : (
                      (orderHistoryDetail.originalItems || orderHistoryDetail.invoiceLineItems).map((it, idx) => (
                        <TableRow key={`orig-${it.productLocalId || it.productCode || idx}`}>
                          <TableCell>
                            <Link
                              component="button"
                              href="#"
                              underline="hover"
                              onClick={(e) => {
                                e.preventDefault();
                                openProductMini(it);
                              }}
                              sx={{ color: 'primary.main', fontWeight: 700 }}
                            >
                              {it.productCode || '—'}
                            </Link>
                          </TableCell>
                          <TableCell>{it.productName || '—'}</TableCell>
                          <TableCell align="right">{Number(it.qty) || 0}</TableCell>
                          <TableCell align="right">
                            {(Number(it.basePrice) || Number(it.price) || 0).toLocaleString('en-US')}
                          </TableCell>
                          <TableCell align="right" sx={{ color: (Number(it.discount) || 0) > 0 ? 'error.main' : 'inherit' }}>
                            {formatItemDiscountLabel(it)}
                          </TableCell>
                          <TableCell align="right">
                            {(Number(it.price) || 0).toLocaleString('en-US')}
                          </TableCell>
                          <TableCell align="right">
                            {(Number(it.subtotal) || 0).toLocaleString('en-US')}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                    {(orderHistoryDetail?.originalItems || orderHistoryDetail?.invoiceLineItems || []).length > 0 && (
                      <TableRow>
                        <TableCell colSpan={6} align="right" sx={{ fontWeight: 700 }}>
                          Tổng tiền hàng lúc mua
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                          {(Number(orderHistoryDetail?.originalGoodsSubtotal)
                            || Number(orderHistoryDetail?.invoiceGoodsSubtotal)
                            || 0
                          ).toLocaleString('en-US')}
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow>
                      <TableCell colSpan={6} align="right" sx={{ fontWeight: 700 }}>
                        Khách đã trả lúc mua
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: 'primary.main' }}>
                        {(Number(orderHistoryDetail?.originalTotalAmount)
                          || Number(orderHistoryDetail?.invoiceGoodsSubtotal)
                          || 0
                        ).toLocaleString('en-US')}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </Box>

              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
                  Các phiếu trả / đổi liên quan
                </Typography>
                {orderHistoryDetail.returnDetails?.length ? (
                  orderHistoryDetail.returnDetails.map((rd, idx) => {
                    const returnCreatedAtLabel = rd?.createdAt
                      ? new Date(rd.createdAt).toLocaleString('vi-VN', { hour12: false })
                      : '';
                    const returnCode = displayReturnCode(rd?.returnCode);
                    const exchangeTotal = (rd.exchangeItems || []).reduce(
                      (s, it) => s + (Number(it.subtotal) || 0),
                      0
                    );
                    const returnedTotal = (rd.returnItems || []).reduce(
                      (s, it) => s + (Number(it.subtotal) || 0),
                      0
                    );
                    return (
                      <Box
                        key={`${returnCode}-${idx}`}
                        sx={{
                          p: 1.5,
                          border: '1px solid',
                          borderColor: 'divider',
                          borderRadius: 1,
                          bgcolor: 'grey.50',
                          mb: 1.5,
                        }}
                      >
                        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 1 }}>
                          <Typography variant="body2">
                            Mã trả:{' '}
                            <Link
                              component="button"
                              href="#"
                              underline="hover"
                              onClick={(e) => {
                                e.preventDefault();
                                openReturnDetailFromApi(returnCode);
                              }}
                              sx={{ color: 'primary.main', fontWeight: 700 }}
                            >
                              {returnCode}
                            </Link>
                          </Typography>
                          <Typography variant="body2">Thời gian trả: {returnCreatedAtLabel || '-'}</Typography>
                          <Typography variant="body2">
                            Tiền trả: {returnedTotal.toLocaleString('en-US')} đ
                          </Typography>
                          {(rd.exchangeItems || []).length > 0 && (
                            <Typography variant="body2">
                              Tiền mua lại: {exchangeTotal.toLocaleString('en-US')} đ
                            </Typography>
                          )}
                          <Typography variant="body2">
                            Net: {(Number(rd?.netAmount) || 0).toLocaleString('en-US')} đ
                          </Typography>
                        </Box>

                        <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 700 }}>
                          Sản phẩm đã trả
                        </Typography>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Mã hàng</TableCell>
                              <TableCell>Tên hàng</TableCell>
                              <TableCell align="right">SL</TableCell>
                              <TableCell align="right">Đơn giá</TableCell>
                              <TableCell align="right">Thành tiền</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {(rd?.returnItems || []).length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={5} align="center">
                                  Không có
                                </TableCell>
                              </TableRow>
                            ) : (
                              rd.returnItems.map((it2, i2) => (
                                <TableRow key={`${it2.productLocalId || it2.productCode || i2}`}>
                                  <TableCell>
                                    <Link
                                      component="button"
                                      href="#"
                                      underline="hover"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        openProductMini(it2);
                                      }}
                                      sx={{ color: 'primary.main', fontWeight: 700 }}
                                    >
                                      {it2.productCode || '—'}
                                    </Link>
                                  </TableCell>
                                  <TableCell>{it2.productName || '—'}</TableCell>
                                  <TableCell align="right">{Number(it2.qty) || 0}</TableCell>
                                  <TableCell align="right">
                                    {(Number(it2.price) || 0).toLocaleString('en-US')}
                                  </TableCell>
                                  <TableCell align="right">
                                    {(Number(it2.subtotal) || 0).toLocaleString('en-US')}
                                  </TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>

                        {(rd.exchangeItems || []).length > 0 && (
                          <Box sx={{ mt: 1.5 }}>
                            <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 700, color: 'primary.main' }}>
                              Sản phẩm mua lại (đổi hàng)
                            </Typography>
                            <Table size="small">
                              <TableHead>
                                <TableRow>
                                  <TableCell>Mã hàng</TableCell>
                                  <TableCell>Tên hàng</TableCell>
                                  <TableCell align="right">SL</TableCell>
                                  <TableCell align="right">Giá bán</TableCell>
                                  <TableCell align="right">Giảm giá</TableCell>
                                  <TableCell align="right">Thành tiền</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {rd.exchangeItems.map((it3, i3) => (
                                  <TableRow key={`ex-${it3.productLocalId || it3.productCode || i3}`}>
                                    <TableCell>
                                      <Link
                                        component="button"
                                        href="#"
                                        underline="hover"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          openProductMini(it3);
                                        }}
                                        sx={{ color: 'primary.main', fontWeight: 700 }}
                                      >
                                        {it3.productCode || '—'}
                                      </Link>
                                    </TableCell>
                                    <TableCell>{it3.productName || '—'}</TableCell>
                                    <TableCell align="right">{Number(it3.qty) || 0}</TableCell>
                                    <TableCell align="right">
                                      {(Number(it3.price) || 0).toLocaleString('en-US')}
                                    </TableCell>
                                    <TableCell align="right" sx={{ color: (Number(it3.discount) || 0) > 0 ? 'error.main' : 'inherit' }}>
                                      {formatItemDiscountLabel(it3)}
                                    </TableCell>
                                    <TableCell align="right">
                                      {(Number(it3.subtotal) || 0).toLocaleString('en-US')}
                                    </TableCell>
                                  </TableRow>
                                ))}
                                <TableRow>
                                  <TableCell colSpan={5} align="right" sx={{ fontWeight: 700 }}>
                                    Tổng mua lại
                                  </TableCell>
                                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                                    {exchangeTotal.toLocaleString('en-US')}
                                  </TableCell>
                                </TableRow>
                              </TableBody>
                            </Table>
                          </Box>
                        )}
                      </Box>
                    );
                  })
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    Chưa có phiếu trả liên quan
                  </Typography>
                )}
              </Box>

              {(orderHistoryDetail.showRepurchaseSection
                || (orderHistoryDetail.returnDetails || []).length > 0) && (
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
                  Đơn hàng khách đã mua lại / đang giữ (sau đổi trả)
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Đây là trạng thái hiện tại của hóa đơn — tổng tiền khách thực tế đang thanh toán sau các lần đổi trả.
                </Typography>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Mã hàng</TableCell>
                      <TableCell>Tên hàng</TableCell>
                      <TableCell align="right">SL</TableCell>
                      <TableCell align="right">Đơn giá gốc</TableCell>
                      <TableCell align="right">Giảm giá</TableCell>
                      <TableCell align="right">Giá bán</TableCell>
                      <TableCell align="right">Thành tiền</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(orderHistoryDetail?.currentItems || []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} align="center">
                          Không còn sản phẩm trên hóa đơn (đã trả hết)
                        </TableCell>
                      </TableRow>
                    ) : (
                      orderHistoryDetail.currentItems.map((it, idx) => (
                        <TableRow key={`cur-${it.productLocalId || it.productCode || idx}`}>
                          <TableCell>
                            <Link
                              component="button"
                              href="#"
                              underline="hover"
                              onClick={(e) => {
                                e.preventDefault();
                                openProductMini(it);
                              }}
                              sx={{ color: 'primary.main', fontWeight: 700 }}
                            >
                              {it.productCode || '—'}
                            </Link>
                          </TableCell>
                          <TableCell>{it.productName || '—'}</TableCell>
                          <TableCell align="right">{Number(it.qty) || 0}</TableCell>
                          <TableCell align="right">
                            {(Number(it.basePrice) || Number(it.price) || 0).toLocaleString('en-US')}
                          </TableCell>
                          <TableCell align="right" sx={{ color: (Number(it.discount) || 0) > 0 ? 'error.main' : 'inherit' }}>
                            {formatItemDiscountLabel(it)}
                          </TableCell>
                          <TableCell align="right">
                            {(Number(it.price) || 0).toLocaleString('en-US')}
                          </TableCell>
                          <TableCell align="right">
                            {(Number(it.subtotal) || 0).toLocaleString('en-US')}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                    <TableRow>
                      <TableCell colSpan={6} align="right" sx={{ fontWeight: 700 }}>
                        Tổng tiền hàng hiện tại
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>
                        {(Number(orderHistoryDetail?.currentGoodsSubtotal) || 0).toLocaleString('en-US')}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={6} align="right" sx={{ fontWeight: 700 }}>
                        Tổng khách đã thanh toán (hiện tại)
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: 'primary.main' }}>
                        {(Number(orderHistoryDetail?.currentTotalAmount)
                          || Number(orderHistoryDetail?.currentGoodsSubtotal)
                          || 0
                        ).toLocaleString('en-US')}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </Box>
              )}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Không có dữ liệu chi tiết
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOrderHistoryDetailOpen(false)}>Đóng</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={productMiniOpen} onClose={() => setProductMiniOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Mã hàng hóa</DialogTitle>
        <DialogContent>
          {productMini ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2, pt: 0.5 }}>
              <Typography variant="body2" color="text.secondary">Mã hàng</Typography>
              <Typography variant="body2" fontWeight={700}>
                {displayProductCode(productMini.productCode, productMini.barcode)}
              </Typography>
              <Typography variant="body2" color="text.secondary">Tên hàng</Typography>
              <Typography variant="body2">{productMini.productName || '—'}</Typography>
              <Typography variant="body2" color="text.secondary">Số lượng</Typography>
              <Typography variant="body2">{Number(productMini.qty) || 0}</Typography>
              <Typography variant="body2" color="text.secondary">Đơn giá</Typography>
              <Typography variant="body2">{(Number(productMini.price) || 0).toLocaleString('en-US')}</Typography>
              <Typography variant="body2" color="text.secondary">Thành tiền</Typography>
              <Typography variant="body2">{(Number(productMini.subtotal) || 0).toLocaleString('en-US')}</Typography>
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">Không có dữ liệu</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProductMiniOpen(false)}>Đóng</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={returnDetailOpen} onClose={() => setReturnDetailOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          Chi tiết hóa đơn đổi trả
          <IconButton size="small" onClick={() => setReturnDetailOpen(false)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {returnDetailLoading ? (
            <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
              <CircularProgress size={24} />
            </Box>
          ) : returnDetail ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Typography variant="body2">
                  Mã trả hàng: <strong>{returnDetail.returnCode || ''}</strong>
                </Typography>
                <Typography variant="body2">
                  Hóa đơn gốc: <strong>{returnDetail.orderCode || ''}</strong>
                </Typography>
                <Typography variant="body2">
                  Hóa đơn mua: <strong>{returnDetail.exchangeOrderCode || ''}</strong>
                </Typography>
              </Box>

              {(() => {
                const createdAtTs =
                  returnDetail?.createdAt
                  || returnDetail?.return?.createdAt
                  || returnDetail?.return?.createdAt;
                const createdAt = createdAtTs ? new Date(createdAtTs) : null;
                const createdAtLabel =
                  createdAt && !Number.isNaN(createdAt.getTime())
                    ? createdAt.toLocaleString('vi-VN', { hour12: false })
                    : '';
                const totalReturnAmount =
                  Number(returnDetail?.totalReturnAmount ?? returnDetail?.return?.totalReturnAmount) || 0;
                const totalExchangeAmount =
                  Number(returnDetail?.totalExchangeAmount ?? returnDetail?.return?.totalExchangeAmount) || 0;
                const amountDifference =
                  Number(returnDetail?.amountDifference ?? returnDetail?.return?.amountDifference) || 0;
                const diffLabel =
                  amountDifference > 0
                    ? 'Khách cần trả'
                    : amountDifference < 0
                      ? 'Cần trả khách'
                      : 'Không chênh lệch';
                const diffValue = Math.abs(amountDifference);
                const deltaBuyVsReturn = totalExchangeAmount - totalReturnAmount;
                const cashFlowAmount =
                  Number(returnDetail?.amountPaid ?? returnDetail?.return?.amountPaid) || Math.abs(deltaBuyVsReturn);
                const paymentFlowLabel =
                  deltaBuyVsReturn > 0
                    ? 'Khách trả tiền'
                    : deltaBuyVsReturn < 0
                      ? 'Đã trả khách'
                      : 'Không chênh lệch tiền';
                const customerName =
                  returnDetail?.customerName || returnDetail?.customerLabel || returnDetail?.return?.customerName || '';
                const customerPhone = returnDetail?.customerPhone || returnDetail?.return?.customerPhone || '';
                const paymentMethod =
                  returnDetail?.paymentMethod ?? returnDetail?.return?.paymentMethod;
                const paymentMethodLabel =
                  paymentMethod === 'cash'
                    ? 'Tiền mặt'
                    : paymentMethod === 'bank'
                      ? 'Chuyển khoản'
                      : paymentMethod || '';

                return (
                  <Box
                    sx={{
                      p: 1.5,
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 1,
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: 1.5,
                    }}
                  >
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Khách hàng
                      </Typography>
                      <Typography variant="body2">
                        {customerName || 'Khách lẻ'}
                        {customerPhone ? ` (${customerPhone})` : ''}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Thời gian
                      </Typography>
                      <Typography variant="body2">{createdAtLabel || '-'}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Hình thức thanh toán
                      </Typography>
                      <Typography variant="body2">{paymentMethodLabel || '-'}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Tổng tiền trả hàng
                      </Typography>
                      <Typography variant="body2">
                        {totalReturnAmount.toLocaleString('en-US')}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Tổng tiền mua hàng
                      </Typography>
                      <Typography variant="body2">
                        {totalExchangeAmount.toLocaleString('en-US')}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        {diffLabel}
                      </Typography>
                      <Typography variant="body2">
                        {diffValue.toLocaleString('en-US')}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        {paymentFlowLabel}
                      </Typography>
                      <Typography variant="body2">
                        {deltaBuyVsReturn === 0
                          ? '0'
                          : cashFlowAmount.toLocaleString('en-US')}
                      </Typography>
                    </Box>
                  </Box>
                );
              })()}

              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Sản phẩm đã trả
                </Typography>
                {returnDetail.returnItems?.length ? (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Tên sản phẩm</TableCell>
                        <TableCell align="right">Số lượng</TableCell>
                        <TableCell align="right">Đơn giá</TableCell>
                        <TableCell align="right">Thành tiền</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {returnDetail.returnItems.map((item, index) => (
                        <TableRow key={`${item.productLocalId}-${index}`}>
                          <TableCell>{item.productName}</TableCell>
                          <TableCell align="right">{item.qty}</TableCell>
                          <TableCell align="right">
                            {(Number(item.price) || 0).toLocaleString('en-US')}
                          </TableCell>
                          <TableCell align="right">
                            {(Number(item.subtotal) || 0).toLocaleString('en-US')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    Không có sản phẩm trả
                  </Typography>
                )}
              </Box>

              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Sản phẩm đã mua
                </Typography>
                {returnDetail.exchangeItems?.length ? (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Tên sản phẩm</TableCell>
                        <TableCell align="right">Số lượng</TableCell>
                        <TableCell align="right">Đơn giá</TableCell>
                        <TableCell align="right">Thành tiền</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {returnDetail.exchangeItems.map((item, index) => (
                        <TableRow key={`${item.productLocalId}-${index}`}>
                          <TableCell>{item.productName}</TableCell>
                          <TableCell align="right">{item.qty}</TableCell>
                          <TableCell align="right">
                            {(Number(item.price) || 0).toLocaleString('en-US')}
                          </TableCell>
                          <TableCell align="right">
                            {(Number(item.subtotal) || 0).toLocaleString('en-US')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    Không có sản phẩm mua mới
                  </Typography>
                )}
              </Box>
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Không có dữ liệu chi tiết
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReturnDetailOpen(false)}>Đóng</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
