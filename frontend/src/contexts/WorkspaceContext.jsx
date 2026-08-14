import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { useAuth } from './AuthContext'

const WorkspaceContext = createContext(null)

export function WorkspaceProvider({ children }) {
  const [activePanel, setActivePanel] = useState('dashboard')
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [toasts, setToasts] = useState([])
  const [prefilledMedicine, setPrefilledMedicine] = useState(null)
  
  // Theme Engine (theme-dark, theme-light, theme-oled)
  const [theme, setTheme] = useState(() => localStorage.getItem('mv-theme') || 'theme-oled')
  
  // Collapsible drawers
  const [copilotOpen, setCopilotOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [tasksOpen, setTasksOpen] = useState(false)

  // Consume role and loading from AuthContext
  const { user: authUser, userRole, loading: authLoading } = useAuth()
  const userEmail = authUser?.email || ''
  const userLoading = authLoading

  // Live Notifications Data
  const [notifications, setNotifications] = useState([
    { id: 1, type: 'danger', category: 'Inventory', title: 'Critical Expiry Alert', message: 'Zandu Balm Batch ZB-902 expires in 12 days.', time: '2 mins ago', unread: true },
    { id: 2, type: 'info', category: 'AI', title: 'Smart Purchase Index', message: 'Cipla Paracetamol velocity increased by 40% this week. Suggested reorder auto-generated.', time: '1 hr ago', unread: true },
    { id: 3, type: 'success', category: 'Finance', title: 'GST Reference Compiled', message: 'July GST ledger compiled successfully. Ready for preview.', time: '3 hrs ago', unread: false },
    { id: 4, type: 'warning', category: 'Voice', title: 'Unassigned Call Summary', message: 'Dr. Sharma left a prescription update call. Priority: High.', time: '5 hrs ago', unread: true }
  ])

  // Live Tasks Checklist Data
  const [tasks, setTasks] = useState([
    { id: 1, text: 'Confirm intake scan validation checks', completed: false },
    { id: 2, text: 'Review Cipla PO pricing agreements', completed: false },
    { id: 3, text: 'Write off expired carton Batch B-1090', completed: true },
    { id: 4, text: 'Calibrate backup spooler margins', completed: false }
  ])

  const toggleTask = useCallback((taskId) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t))
  }, [])

  const addTask = useCallback((text) => {
    setTasks(prev => [...prev, { id: Date.now(), text, completed: false }])
  }, [])

  const markNotificationRead = useCallback((notifId) => {
    setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, unread: false } : n))
  }, [])

  const clearAllNotifications = useCallback(() => {
    setNotifications([])
  }, [])
  
  // Update theme class on HTML element
  useEffect(() => {
    document.documentElement.className = theme
    localStorage.setItem('mv-theme', theme)
  }, [theme])

  // Reset active panel on logout
  useEffect(() => {
    if (!authUser) {
      setActivePanel('dashboard')
    }
  }, [authUser])


  const navigate = useNavigate()

  // Navigate utility
  const navigateTo = useCallback((panel) => {
    setActivePanel(panel)
    setCommandPaletteOpen(false)
    
    const routeMap = {
      'dashboard': '/dashboard',
      'inventory': '/stock-grid',
      'intake': '/stock-intake',
      'qr-scan': '/qr-scan',
      'billing': '/pos',
      'copilot': '/ai-copilot',
      'voice': '/voice-dictation',
      'analytics': '/performance',
      'suppliers-po': '/suppliers-po',
      'reports': '/reports',
      'audits': '/trace-audits',
      'finance': '/fixed-cost',
      'settings': '/settings',
      'users': '/user-management'
    }
    const targetPath = routeMap[panel] || '/dashboard'
    navigate(targetPath)
  }, [navigate])

  // Toast notification stack utility
  const showToast = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random().toString(36).substr(2, 9)
    setToasts((prev) => [...prev, { id, message, type }])
    
    // Auto remove after 4.5 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4500)
  }, [])

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // Listen to Cmd/Ctrl + K to toggle command palette
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCommandPaletteOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <WorkspaceContext.Provider
      value={{
        activePanel,
        navigateTo,
        commandPaletteOpen,
        setCommandPaletteOpen,
        toasts,
        showToast,
        removeToast,
        prefilledMedicine,
        setPrefilledMedicine,
        userEmail,
        userRole,
        userLoading,
        theme,
        setTheme,
        copilotOpen,
        setCopilotOpen,
        notificationsOpen,
        setNotificationsOpen,
        tasksOpen,
        setTasksOpen,
        notifications,
        setNotifications,
        markNotificationRead,
        clearAllNotifications,
        tasks,
        setTasks,
        toggleTask,
        addTask
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider')
  }
  return context
}
