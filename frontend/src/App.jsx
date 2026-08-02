import { useAuth } from './contexts/AuthContext'
import { WorkspaceProvider, useWorkspace } from './contexts/WorkspaceContext'
import AppShell from './components/layout/AppShell'
import LandingPage from './pages/LandingPage'

// Panels
import DashboardPanel from './components/panels/DashboardPanel'
import InventoryPanel from './components/panels/InventoryPanel'
import IntakePanel from './components/panels/IntakePanel'
import QRLookupPanel from './components/panels/QRLookupPanel'
import BillingPanel from './components/panels/BillingPanel'
import CopilotPanel from './components/panels/CopilotPanel'
import FinancePanel from './components/panels/FinancePanel'
import ReorderPanel from './components/panels/ReorderPanel'
import SettingsPanel from './components/panels/SettingsPanel'

// New Panels
import AnalyticsPanel from './components/panels/AnalyticsPanel'
import SuppliersPanel from './components/panels/SuppliersPanel'
import VoicePanel from './components/panels/VoicePanel'
import ReportsPanel from './components/panels/ReportsPanel'
import AuditPanel from './components/panels/AuditPanel'

function WorkspaceRouter() {
  const { activePanel, userRole } = useWorkspace()

  // Secure route check (for staff trying to navigate to admin panel)
  const isLocked = (activePanel === 'finance') && userRole === 'staff'
  const panelToRender = isLocked ? 'dashboard' : activePanel

  switch (panelToRender) {
    case 'dashboard':
      return <DashboardPanel />
    case 'inventory':
      return <InventoryPanel />
    case 'intake':
      return <IntakePanel />
    case 'qr-lookup':
      return <QRLookupPanel />
    case 'billing':
      return <BillingPanel />
    case 'copilot':
      return <CopilotPanel />
    case 'finance':
      return <FinancePanel />
    case 'reorder':
      return <ReorderPanel />
    case 'analytics':
      return <AnalyticsPanel />
    case 'suppliers':
      return <SuppliersPanel />
    case 'voice':
      return <VoicePanel />
    case 'reports':
      return <ReportsPanel />
    case 'audit':
      return <AuditPanel />
    case 'settings':
      return <SettingsPanel />
    default:
      return <DashboardPanel />
  }
}

export default function App() {
  const { isAuthenticated } = useAuth()

  if (!isAuthenticated) {
    return <LandingPage />
  }

  return (
    <WorkspaceProvider>
      <AppShell>
        <WorkspaceRouter />
      </AppShell>
    </WorkspaceProvider>
  )
}
