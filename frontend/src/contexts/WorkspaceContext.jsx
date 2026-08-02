import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../services/supabase'

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
  
  // User state
  const [userEmail, setUserEmail] = useState('')
  const [userRole, setUserRole] = useState('staff')
  const [userLoading, setUserLoading] = useState(true)

  // Update theme class on HTML element
  useEffect(() => {
    document.documentElement.className = theme
    localStorage.setItem('mv-theme', theme)
  }, [theme])


  // Fetch current user details
  const fetchUser = useCallback(async () => {
    setUserLoading(true)
    try {
      const { data, error } = await supabase.auth.getUser()
      if (data?.user) {
        setUserEmail(data.user.email ?? '')
        setUserRole(data.user.user_metadata?.role ?? 'staff')
      } else {
        setUserEmail('')
        setUserRole('staff')
      }
    } catch (err) {
      console.error('Failed to get user metadata:', err)
    } finally {
      setUserLoading(false)
    }
  }, [])

  // Listen to auth changes
  useEffect(() => {
    fetchUser()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        fetchUser()
      } else if (event === 'SIGNED_OUT') {
        setUserEmail('')
        setUserRole('staff')
        setActivePanel('dashboard')
      }
    })
    return () => subscription.unsubscribe()
  }, [fetchUser])

  // Navigate utility
  const navigateTo = useCallback((panel) => {
    setActivePanel(panel)
    setCommandPaletteOpen(false)
  }, [])

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
