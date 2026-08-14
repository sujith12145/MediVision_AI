import { useEffect } from 'react'
import { WorkspaceProvider, useWorkspace } from './contexts/WorkspaceContext'
import { NotificationProvider } from './contexts/NotificationContext'
import AppLayout from './AppLayout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { getTheme } from './theme'
import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'

// Panels
import InventoryPanel from './components/panels/InventoryPanel'
import IntakeWizard from './pages/IntakeWizard'
import BillingPanel from './components/panels/BillingPanel'
import CopilotPanel from './components/panels/CopilotPanel'
import FinancePanel from './components/panels/FinancePanel'
import SettingsPanel from './components/panels/SettingsPanel'

// New Panels
import AnalyticsPanel from './components/panels/AnalyticsPanel'
import VoiceCenter from './pages/VoiceCenter'
import ReportsPanel from './components/panels/ReportsPanel'

// Upgraded Pages
import SuppliersPO from './pages/SuppliersPO'
import QRScanner from './pages/QRScanner'
import TraceAudits from './pages/TraceAudits'

// New Admin & Public Pages
import UserManagement from './pages/Admin/UserManagement'
import AccessDenied from './pages/AccessDenied'
import ApproveAccess from './pages/ApproveAccess'

function WorkspaceRouter() {
  const { userRole } = useWorkspace()

  // Guard Helper to check admin clearance
  const AdminRoute = ({ children }) => {
    return userRole === 'admin' ? children : <Navigate to="/dashboard" replace />
  }

  return (
    <Routes>
      {/* Core Redirect / Root */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      
      {/* Explicit routes */}
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/voice-dictation" element={<VoiceCenter />} />

      {/* Dynamic module routes */}
      <Route path="/stock-grid" element={<InventoryPanel />} />
      <Route path="/stock-intake" element={<IntakeWizard />} />
      <Route path="/qr-scan" element={<QRScanner />} />
      <Route path="/pos" element={<BillingPanel />} />
      <Route path="/ai-copilot" element={<CopilotPanel />} />
      <Route 
        path="/fixed-cost" 
        element={
          <AdminRoute>
            <FinancePanel />
          </AdminRoute>
        } 
      />
      <Route path="/suppliers-po" element={<SuppliersPO />} />
      <Route 
        path="/performance" 
        element={
          <AdminRoute>
            <AnalyticsPanel />
          </AdminRoute>
        } 
      />
      <Route path="/reports" element={<ReportsPanel />} />
      <Route 
        path="/settings" 
        element={
          <AdminRoute>
            <SettingsPanel />
          </AdminRoute>
        } 
      />
      <Route 
        path="/trace-audits" 
        element={
          <AdminRoute>
            <TraceAudits />
          </AdminRoute>
        } 
      />
      <Route 
        path="/user-management" 
        element={
          <AdminRoute>
            <UserManagement />
          </AdminRoute>
        } 
      />

      {/* Catch-all fallback redirects to /dashboard */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

function ThemedApp() {
  const { theme } = useWorkspace()
  const mode = theme.replace('theme-', '')
  const muiTheme = getTheme(mode)

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <AppLayout>
        <WorkspaceRouter />
      </AppLayout>
    </ThemeProvider>
  )
}

export default function App() {
  useEffect(() => {
    console.log('App is mounting...')
  }, [])

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/access-denied" element={<AccessDenied />} />
      <Route path="/approve" element={<ApproveAccess />} />
      
      {/* Protected Routes */}
      <Route 
        path="/*" 
        element={
          <ProtectedRoute>
            <WorkspaceProvider>
              <NotificationProvider>
                <ThemedApp />
              </NotificationProvider>
            </WorkspaceProvider>
          </ProtectedRoute>
        } 
      />
    </Routes>
  )
}
