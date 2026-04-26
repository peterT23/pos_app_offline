import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Navigation from './components/Navigation'
import PosPage from './pages/PosPage'
import ProductsPage from './pages/ProductsPage'
import CustomersPage from './pages/CustomersPage'
import ReportsPage from './pages/ReportsPage'
import SettingsPage from './pages/SettingsPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import AdminDashboard from './admin/pages/Dashboard'
import AdminProductsPage from './admin/pages/ProductsPage'
import AdminCustomersPage from './admin/pages/CustomersPage'
import AdminUsersPage from './admin/pages/UsersPage'
import AdminStoresPage from './admin/pages/StoresPage'
import AdminSuppliersPage from './admin/pages/SuppliersPage'
import AdminReportsPage from './admin/pages/ReportsPage'
import AdminInvoicesPage from './admin/pages/InvoicesPage'
import AdminReturnsPage from './admin/pages/ReturnsPage'
import AdminPurchaseOrdersPage from './admin/pages/PurchaseOrdersPage'
import AdminPurchaseOrderNewPage from './admin/pages/PurchaseOrderNewPage'
import AdminCreatePurchaseOrderPage from './admin/pages/CreatePurchaseOrderPage'
import AdminPurchaseReturnPage from './admin/pages/PurchaseReturnPage'
import AdminSettingsPage from './admin/pages/SettingsPage'
import AdminAccountPage from './admin/pages/AccountPage'
import { AuthProvider } from './auth/AuthContext'
import RequireAuth from './auth/RequireAuth'
import AppErrorBoundary from './components/AppErrorBoundary'
import './App.css'

function AppContent() {
  const location = useLocation();
  const hideNav =
    location.pathname === '/pos' ||
    location.pathname === '/login' ||
    location.pathname === '/register' ||
    location.pathname.startsWith('/admin');

  return (
    <>
      {/* Chỉ hiển thị Navigation khi không phải POS/Login */}
      {!hideNav && <Navigation />}
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        {/* Trang POS bán hàng */}
        <Route
          path="/pos"
          element={(
            <RequireAuth>
              <PosPage />
            </RequireAuth>
          )}
        />
        
        {/* Trang quản lý sản phẩm */}
        <Route
          path="/products"
          element={(
            <RequireAuth>
              <ProductsPage />
            </RequireAuth>
          )}
        />
        
        {/* Trang quản lý khách hàng */}
        <Route
          path="/customers"
          element={(
            <RequireAuth>
              <CustomersPage />
            </RequireAuth>
          )}
        />
        
        {/* Trang báo cáo */}
        <Route
          path="/reports"
          element={(
            <RequireAuth>
              <ReportsPage />
            </RequireAuth>
          )}
        />
        
        {/* Trang cài đặt */}
        <Route
          path="/settings"
          element={(
            <RequireAuth>
              <SettingsPage />
            </RequireAuth>
          )}
        />

        {/* Admin (gộp chung cùng app POS Offline) */}
        <Route path="/dashboard" element={<Navigate to="/admin/dashboard" replace />} />
        <Route
          path="/admin/dashboard"
          element={(
            <RequireAuth>
              <AdminDashboard />
            </RequireAuth>
          )}
        />
        <Route
          path="/admin/products"
          element={(
            <RequireAuth>
              <AdminProductsPage />
            </RequireAuth>
          )}
        />
        <Route
          path="/admin/customers"
          element={(
            <RequireAuth>
              <AdminCustomersPage />
            </RequireAuth>
          )}
        />
        <Route
          path="/admin/users"
          element={(
            <RequireAuth>
              <AdminUsersPage />
            </RequireAuth>
          )}
        />
        <Route
          path="/admin/stores"
          element={(
            <RequireAuth>
              <AdminStoresPage />
            </RequireAuth>
          )}
        />
        <Route
          path="/admin/suppliers"
          element={(
            <RequireAuth>
              <AdminSuppliersPage />
            </RequireAuth>
          )}
        />
        <Route
          path="/admin/reports"
          element={(
            <RequireAuth>
              <AdminReportsPage />
            </RequireAuth>
          )}
        />
        <Route
          path="/admin/invoices"
          element={(
            <RequireAuth>
              <AdminInvoicesPage />
            </RequireAuth>
          )}
        />
        <Route
          path="/admin/returns"
          element={(
            <RequireAuth>
              <AdminReturnsPage />
            </RequireAuth>
          )}
        />
        <Route
          path="/admin/purchase-orders"
          element={(
            <RequireAuth>
              <AdminPurchaseOrdersPage />
            </RequireAuth>
          )}
        />
        <Route
          path="/admin/purchase-orders/new"
          element={(
            <RequireAuth>
              <AdminPurchaseOrderNewPage />
            </RequireAuth>
          )}
        />
        <Route
          path="/admin/purchase-orders/:id/edit"
          element={(
            <RequireAuth>
              <AdminCreatePurchaseOrderPage />
            </RequireAuth>
          )}
        />
        <Route
          path="/admin/purchase-orders/:id/return"
          element={(
            <RequireAuth>
              <AdminPurchaseReturnPage />
            </RequireAuth>
          )}
        />
        <Route
          path="/admin/settings"
          element={(
            <RequireAuth>
              <AdminSettingsPage />
            </RequireAuth>
          )}
        />
        <Route
          path="/admin/account"
          element={(
            <RequireAuth>
              <AdminAccountPage />
            </RequireAuth>
          )}
        />
        <Route path="/admin/*" element={<Navigate to="/admin/dashboard" replace />} />
        
        {/* Mặc định redirect về POS */}
        <Route path="/" element={<Navigate to="/pos" replace />} />
        <Route path="*" element={<Navigate to="/pos" replace />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <HashRouter>
      <AppErrorBoundary>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </AppErrorBoundary>
    </HashRouter>
  )
}

export default App
