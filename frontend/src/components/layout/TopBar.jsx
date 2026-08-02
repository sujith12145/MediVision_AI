import { useAuth } from '../../contexts/AuthContext'
import { useWorkspace } from '../../contexts/WorkspaceContext'

export default function TopBar() {
  const { signOut } = useAuth()
  const { 
    setCommandPaletteOpen, 
    userEmail, 
    userRole,
    theme,
    setTheme,
    notificationsOpen,
    setNotificationsOpen,
    tasksOpen,
    setTasksOpen,
    notifications,
    tasks
  } = useWorkspace()

  const unreadNotifs = notifications.filter(n => n.unread).length
  const pendingTasks = tasks.filter(t => !t.completed).length

  const cycleTheme = () => {
    if (theme === 'theme-oled') setTheme('theme-light')
    else if (theme === 'theme-light') setTheme('theme-dark')
    else setTheme('theme-oled')
  }

  const getThemeEmoji = () => {
    if (theme === 'theme-oled') return '🌑 OLED'
    if (theme === 'theme-light') return '☀️ Light'
    return '🌙 Dark'
  }

  return (
    <header className="workspace-topbar">
      {/* Universal Search trigger button */}
      <div className="flex-1 max-w-sm">
        <button
          onClick={() => setCommandPaletteOpen(true)}
          className="search-trigger-btn"
        >
          <div className="search-trigger-left">
            <span className="search-icon">🔍</span>
            <span className="search-placeholder">Search medicines, invoices, actions...</span>
          </div>
          <kbd className="search-shortcut">Ctrl+K</kbd>
        </button>
      </div>

      {/* Right widgets */}
      <div className="flex items-center gap-4 ml-auto">
        
        {/* Theme Cycler */}
        <button 
          onClick={cycleTheme}
          className="theme-cycle-btn"
          title="Toggle system interface theme"
        >
          {getThemeEmoji()}
        </button>

        <div className="topbar-divider" />

        {/* Tasks checklist trigger */}
        <button 
          onClick={() => setTasksOpen(!tasksOpen)}
          className="topbar-action-btn"
          title="Pending operational tasks checklist"
        >
          <span className="icon">📋</span>
          {pendingTasks > 0 && (
            <span className="badge-count badge-primary">
              {pendingTasks}
            </span>
          )}
        </button>

        {/* Notification center trigger */}
        <button 
          onClick={() => setNotificationsOpen(!notificationsOpen)}
          className="topbar-action-btn"
          title="Pharmacy warning alerts"
        >
          <span className="icon">🔔</span>
          {unreadNotifs > 0 && (
            <span className="badge-count badge-danger">
              {unreadNotifs}
            </span>
          )}
        </button>

        <div className="topbar-divider" />

        {/* User clearance badge */}
        <div className="profile-clearance-badge">
          <span className="status-dot green"></span>
          <span className="role-text">{userRole} clearance</span>
        </div>

        {/* Sign out */}
        <button onClick={signOut} className="signout-btn">
          Sign out
        </button>
      </div>
    </header>
  )
}
