import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { useWorkspace } from './contexts/WorkspaceContext'
import CommandPalette from './components/layout/CommandPalette'
import GlobalCopilotDrawer from './components/layout/GlobalCopilotDrawer'
import Toast from './components/ui/Toast'

// MUI Components
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  Divider,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Avatar,
  Badge,
  Tooltip,
  Button,
  TextField,
  Paper,
  Chip,
  useMediaQuery,
  BottomNavigation,
  BottomNavigationAction,
  Menu,
  MenuItem
} from '@mui/material'

// MUI Icons
import MenuIcon from '@mui/icons-material/Menu'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import DashboardIcon from '@mui/icons-material/Dashboard'
import InventoryIcon from '@mui/icons-material/Inventory'
import AddAPhotoIcon from '@mui/icons-material/AddAPhoto'
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner'
import CreditCardIcon from '@mui/icons-material/CreditCard'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import MicIcon from '@mui/icons-material/Mic'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import BusinessIcon from '@mui/icons-material/Business'
import AssessmentIcon from '@mui/icons-material/Assessment'
import SecurityIcon from '@mui/icons-material/Security'
import AttachMoneyIcon from '@mui/icons-material/AttachMoney'
import SettingsIcon from '@mui/icons-material/Settings'
import NotificationsIcon from '@mui/icons-material/Notifications'
import ChecklistIcon from '@mui/icons-material/Checklist'
import LogoutIcon from '@mui/icons-material/Logout'
import SearchIcon from '@mui/icons-material/Search'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import LightModeIcon from '@mui/icons-material/LightMode'
import NightsStayIcon from '@mui/icons-material/NightsStay'
import AddIcon from '@mui/icons-material/Add'
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart'
import TableChartIcon from '@mui/icons-material/TableChart'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import HistoryIcon from '@mui/icons-material/History'
import PeopleIcon from '@mui/icons-material/People'
import UploadIcon from '@mui/icons-material/Upload'
import QrCodeIcon from '@mui/icons-material/QrCode'
import ShowChartIcon from '@mui/icons-material/ShowChart'
import DescriptionIcon from '@mui/icons-material/Description'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'

const DRAWER_WIDTH = 240;

export default function AppLayout({ children }) {
  const { signOut, user } = useAuth()
  
  const [anchorEl, setAnchorEl] = useState(null)
  const openMenu = Boolean(anchorEl)

  const handleAvatarClick = (event) => {
    setAnchorEl(event.currentTarget)
  }

  const handleMenuClose = () => {
    setAnchorEl(null)
  }

  const handleLogout = async () => {
    handleMenuClose()
    await signOut()
  }

  const profileEmail = user?.email || 'admin@medivision.local'
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Admin'
  const initials = userName.substring(0, 2).toUpperCase()

  const {
    activePanel,
    navigateTo,
    setCommandPaletteOpen,
    userRole,
    theme,
    setTheme,
    toasts,
    removeToast,
    notificationsOpen,
    setNotificationsOpen,
    notifications,
    markNotificationRead,
    clearAllNotifications,
    tasksOpen,
    setTasksOpen,
    tasks,
    toggleTask,
    addTask
  } = useWorkspace()

  const navigate = useNavigate()
  const location = useLocation()
  const [currentPath, setCurrentPath] = useState('/dashboard')

  useEffect(() => {
    try {
      if (location && location.pathname) {
        setCurrentPath(location.pathname)
      } else {
        setCurrentPath('/dashboard')
      }
    } catch (err) {
      console.error('Failed to parse location pathname:', err)
      setCurrentPath('/dashboard')
    }
  }, [location])

  const isMobile = useMediaQuery('(max-width:600px)')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [newTaskInput, setNewTaskInput] = useState('')

  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false)
    } else {
      setSidebarOpen(true)
    }
  }, [isMobile])

  const handleToggleSidebar = () => {
    setSidebarOpen(!sidebarOpen)
  }

  const handleAddTaskSubmit = (e) => {
    e.preventDefault()
    if (!newTaskInput.trim()) return
    addTask(newTaskInput.trim())
    setNewTaskInput('')
  }

  const cycleTheme = () => {
    if (theme === 'theme-oled') setTheme('theme-light')
    else if (theme === 'theme-light') setTheme('theme-dark')
    else setTheme('theme-oled')
  }

  const getThemeIcon = () => {
    if (theme === 'theme-oled') return <NightsStayIcon />
    if (theme === 'theme-light') return <LightModeIcon />
    return <DarkModeIcon />
  }

  const getThemeLabel = () => {
    if (theme === 'theme-oled') return 'OLED'
    if (theme === 'theme-light') return 'Light'
    return 'Dark'
  }

  // For User Avatar "admin" is derived dynamically from auth context

  const unreadNotifs = notifications.filter(n => n.unread).length
  const pendingTasks = tasks.filter(t => !t.completed).length

  // Sidebar items mapped exactly from user request
  const getRoleMenus = (role) => {
    const allMenus = [
      { text: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard' },
      { text: 'Stock Grid', icon: <InventoryIcon />, path: '/stock-grid' },
      { text: 'Stock Intake', icon: <UploadIcon />, path: '/stock-intake' },
      { text: 'QR Scan Lookup', icon: <QrCodeIcon />, path: '/qr-scan' },
      { text: 'POS checkout', icon: <ShoppingCartIcon />, path: '/pos' },
      { text: 'AI Copilot', icon: <SmartToyIcon />, path: '/ai-copilot' },
      { text: 'Voice Dictation', icon: <MicIcon />, path: '/voice-dictation' },
      { text: 'Performance', icon: <ShowChartIcon />, path: '/performance' },
      { text: 'Suppliers PO', icon: <LocalShippingIcon />, path: '/suppliers-po' },
      { text: 'Reports templates', icon: <DescriptionIcon />, path: '/reports' },
      { text: 'Trace audits', icon: <HistoryIcon />, path: '/trace-audits' },
      { text: 'Fixed cost P&L', icon: <AccountBalanceIcon />, path: '/fixed-cost' },
      { text: 'System Settings', icon: <SettingsIcon />, path: '/settings' },
      { text: 'User Management', icon: <PeopleIcon />, path: '/user-management' },
    ];

    const roleAccess = {
      admin: allMenus,
      pharmacist: allMenus.filter(m => 
        !['User Management', 'System Settings', 'Performance', 'Suppliers PO', 'Reports templates', 'Trace audits', 'Fixed cost P&L'].includes(m.text)
      ),
      staff: allMenus.filter(m =>
        ['Dashboard', 'Stock Grid', 'QR Scan Lookup', 'POS checkout'].includes(m.text)
      ),
    };

    return roleAccess[role] || [];
  };

  const handleNavClick = (item) => {
    navigate(item.path)
    
    // Sync with Workspace Context activePanel
    const keyMap = {
      'Dashboard': 'dashboard',
      'Stock Grid': 'inventory',
      'Stock Intake': 'intake',
      'QR Scan Lookup': 'qr-scan',
      'POS checkout': 'billing',
      'AI Copilot': 'copilot',
      'Voice Dictation': 'voice',
      'Performance': 'analytics',
      'Suppliers PO': 'suppliers-po',
      'Reports templates': 'reports',
      'Trace audits': 'audits',
      'Fixed cost P&L': 'finance',
      'System Settings': 'settings',
      'User Management': 'users'
    }
    const panelKey = keyMap[item.text]
    if (panelKey) {
      navigateTo(panelKey)
    }

    if (isMobile) {
      setSidebarOpen(false)
    }
  }

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Ambient background glows */}
      <div className="ambient-glow-left" />
      <div className="ambient-glow-right" />

      {/* AppBar (Top Navigation) */}
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          backdropFilter: 'blur(20px)',
          backgroundColor: (theme) => 
            theme.palette.mode === 'dark' 
              ? 'rgba(9, 14, 26, 0.75)' 
              : 'rgba(255, 255, 255, 0.8)',
          borderBottom: '1px solid',
          borderColor: 'divider',
          transition: (theme) =>
            theme.transitions.create(['width', 'margin'], {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.leavingScreen,
            }),
        }}
      >
        <Toolbar sx={{ justifyContent: 'space-between', px: { xs: 2, sm: 4 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <IconButton
              color="inherit"
              aria-label="toggle drawer"
              onClick={handleToggleSidebar}
              edge="start"
              sx={{ mr: 1, color: 'text.secondary' }}
            >
              <MenuIcon />
            </IconButton>

            {/* Brand Logo & Name */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #0A74DA 0%, #06b6d4 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 15px rgba(10, 116, 218, 0.35)',
                }}
              >
                <Typography variant="body1" sx={{ fontSize: 16 }}>🩺</Typography>
              </Box>
              <Box sx={{ display: { xs: 'none', sm: 'flex' }, flexDirection: 'column' }}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    fontWeight: 700,
                    letterSpacing: '-0.02em',
                    color: 'text.primary',
                    lineHeight: 1
                  }}
                >
                  MediVision AI
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: 8,
                    fontWeight: 700,
                    color: 'primary.main',
                    textTransform: 'uppercase',
                    letterSpacing: '0.15em',
                    fontFamily: 'monospace',
                    mt: 0.5
                  }}
                >
                  OPERATING OS
                </Typography>
              </Box>
            </Box>
          </Box>

          {/* Search Trigger Button */}
          <Box sx={{ flex: 1, maxWidth: 360, mx: 3, display: { xs: 'none', md: 'block' } }}>
            <Button
              fullWidth
              onClick={() => setCommandPaletteOpen(true)}
              startIcon={<SearchIcon sx={{ color: 'text.secondary', fontSize: 18 }} />}
              endIcon={
                <Typography
                  variant="caption"
                  sx={{
                    px: 1,
                    py: 0.2,
                    borderRadius: 1,
                    backgroundColor: 'action.selected',
                    border: '1px solid',
                    borderColor: 'divider',
                    fontFamily: 'monospace',
                    fontSize: '0.65rem'
                  }}
                >
                  Ctrl+K
                </Typography>
              }
              sx={{
                justifyContent: 'space-between',
                px: 2,
                py: 1,
                backgroundColor: 'action.hover',
                border: '1px solid',
                borderColor: 'divider',
                color: 'text.secondary',
                fontSize: '0.8125rem',
                fontWeight: 500,
                textAlign: 'left',
                borderRadius: '12px',
                '&:hover': {
                  backgroundColor: 'action.selected',
                  borderColor: 'primary.light',
                }
              }}
            >
              Search medicines, invoices...
            </Button>
          </Box>

          {/* Right Action Utilities */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 } }}>
            
            {/* Theme Toggle Button */}
            <Tooltip title={`Cycle theme (Current: ${getThemeLabel()})`}>
              <IconButton onClick={cycleTheme} color="inherit" sx={{ color: 'text.secondary' }}>
                {getThemeIcon()}
              </IconButton>
            </Tooltip>

            {/* Tasks Checklist Button */}
            <Tooltip title="Tasks Checklist">
              <IconButton
                onClick={() => setTasksOpen(!tasksOpen)}
                color="inherit"
                sx={{ color: 'text.secondary' }}
              >
                <Badge badgeContent={pendingTasks} color="primary">
                  <ChecklistIcon />
                </Badge>
              </IconButton>
            </Tooltip>

            {/* Notification Alerts Bell */}
            <Tooltip title="Warning Alerts Center">
              <IconButton
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                color="inherit"
                sx={{ color: 'text.secondary' }}
              >
                <Badge badgeContent={unreadNotifs} color="error">
                  <NotificationsIcon />
                </Badge>
              </IconButton>
            </Tooltip>

            <Divider orientation="vertical" variant="middle" flexItem sx={{ mx: 0.5, display: { xs: 'none', sm: 'block' } }} />

            {/* Clearance Chip */}
            <Chip
              label={`${userRole} clearance`}
              size="small"
              color={userRole === 'admin' ? 'warning' : 'default'}
              variant="outlined"
              sx={{
                display: { xs: 'none', sm: 'inline-flex' },
                fontSize: '0.7rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                borderRadius: '6px'
              }}
            />

            {/* User Avatar */}
            <Tooltip title={profileEmail}>
              <IconButton
                onClick={handleAvatarClick}
                size="small"
                sx={{ ml: 1, p: 0 }}
                aria-controls={openMenu ? 'account-menu' : undefined}
                aria-haspopup="true"
                aria-expanded={openMenu ? 'true' : undefined}
              >
                <Avatar
                  sx={{
                    width: 32,
                    height: 32,
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    bgcolor: 'primary.main',
                    color: 'primary.contrastText',
                    border: '2px solid',
                    borderColor: 'background.paper'
                  }}
                >
                  {initials}
                </Avatar>
              </IconButton>
            </Tooltip>

            <Menu
              anchorEl={anchorEl}
              id="account-menu"
              open={openMenu}
              onClose={handleMenuClose}
              onClick={handleMenuClose}
              PaperProps={{
                elevation: 0,
                sx: {
                  overflow: 'visible',
                  filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.32))',
                  mt: 1.5,
                  backgroundColor: 'background.paper',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: '12px',
                  minWidth: '180px',
                  '& .MuiAvatar-root': {
                    width: 32,
                    height: 32,
                    ml: -0.5,
                    mr: 1,
                  },
                  '&::before': {
                    content: '""',
                    display: 'block',
                    position: 'absolute',
                    top: 0,
                    right: 14,
                    width: 10,
                    height: 10,
                    bgcolor: 'background.paper',
                    transform: 'translateY(-50%) rotate(45deg)',
                    zIndex: 0,
                    borderLeft: '1px solid',
                    borderTop: '1px solid',
                    borderColor: 'divider',
                  },
                },
              }}
              transformOrigin={{ horizontal: 'right', vertical: 'top' }}
              anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            >
              <Box sx={{ px: 2, py: 1.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 705, color: 'text.primary' }}>
                  {userName}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', wordBreak: 'break-all' }}>
                  {profileEmail}
                </Typography>
              </Box>
              <Divider />
              <MenuItem onClick={handleLogout} sx={{ fontSize: '0.85rem', fontWeight: 650, color: 'error.main' }}>
                <ListItemIcon sx={{ color: 'error.main' }}>
                  <LogoutIcon fontSize="small" />
                </ListItemIcon>
                Logout
              </MenuItem>
            </Menu>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Left Sidebar Drawer */}
      <Drawer
        variant={isMobile ? "temporary" : "permanent"}
        open={isMobile ? sidebarOpen : true}
        onClose={isMobile ? () => setSidebarOpen(false) : undefined}
        sx={{
          width: isMobile ? DRAWER_WIDTH : (sidebarOpen ? DRAWER_WIDTH : 72),
          flexShrink: 0,
          whiteSpace: 'nowrap',
          '& .MuiDrawer-paper': {
            width: isMobile ? DRAWER_WIDTH : (sidebarOpen ? DRAWER_WIDTH : 72),
            transition: (theme) =>
              theme.transitions.create('width', {
                easing: theme.transitions.easing.sharp,
                duration: sidebarOpen
                  ? theme.transitions.duration.enteringScreen
                  : theme.transitions.duration.leavingScreen,
              }),
            boxSizing: 'border-box',
            overflowX: 'hidden',
            backgroundColor: (theme) =>
              theme.palette.mode === 'dark'
                ? 'rgba(9, 14, 26, 0.65)'
                : 'rgba(255, 255, 255, 0.8)',
            borderRight: '1px solid',
            borderColor: 'divider',
            backdropFilter: 'blur(20px)',
            pt: isMobile ? '0px' : '64px', // Space for appbar on desktop only
          },
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Box sx={{ overflowY: 'auto', overflowX: 'hidden', flex: 1, py: 2 }}>
            <List sx={{ px: 1, py: 0 }}>
              {getRoleMenus(userRole).map((item) => {
                const isSelected = currentPath === item.path

                return (
                  <ListItem key={item.text} disablePadding sx={{ display: 'block', mb: 0.5 }}>
                    <Tooltip title={!sidebarOpen ? item.text : ''} placement="right">
                      <ListItemButton
                        onClick={() => handleNavClick(item)}
                        selected={isSelected}
                        sx={{
                          minHeight: 40,
                          justifyContent: sidebarOpen ? 'initial' : 'center',
                          px: 2.5,
                          borderRadius: '8px',
                          backgroundColor: isSelected ? 'primary.light' : 'transparent',
                          color: isSelected ? 'primary.contrastText' : 'text.primary',
                          '&.Mui-selected': {
                            backgroundColor: 'primary.main',
                            color: 'primary.contrastText',
                            '&:hover': {
                              backgroundColor: 'primary.dark',
                            },
                            '& .MuiListItemIcon-root': {
                              color: 'primary.contrastText',
                            }
                          },
                          '&:hover': {
                            backgroundColor: isSelected ? 'primary.main' : 'action.hover',
                          }
                        }}
                      >
                        <ListItemIcon
                          sx={{
                            minWidth: 0,
                            mr: sidebarOpen ? 2 : 'auto',
                            justifyContent: 'center',
                            color: isSelected ? 'primary.contrastText' : 'text.secondary',
                            '& svg': { fontSize: 20 }
                          }}
                        >
                          {item.icon}
                        </ListItemIcon>
                        {sidebarOpen && (
                          <ListItemText
                            primary={item.text}
                            primaryTypographyProps={{
                              fontSize: '0.8125rem',
                              fontWeight: isSelected ? 700 : 500
                            }}
                          />
                        )}
                      </ListItemButton>
                    </Tooltip>
                  </ListItem>
                )
              })}
            </List>
          </Box>

          {/* Sidebar Footer */}
          {sidebarOpen && (
            <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider', backgroundColor: 'action.hover' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Avatar sx={{ width: 28, height: 28, fontSize: '0.75rem', bgcolor: 'primary.light' }}>
                  {initials}
                </Avatar>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', color: 'text.primary', noWrap: true }}>
                    {userName}
                  </Typography>
                  <Typography variant="caption" sx={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'warning.main' }} />
                    {userRole} clearance
                  </Typography>
                </Box>
              </Box>
            </Box>
          )}
        </Box>
      </Drawer>

      {/* Main Content Area */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,               // Takes remaining horizontal space
          width: '100%',             // Forces full width
          minHeight: '100vh',
          backgroundColor: (theme) => theme.palette.background.default,
          pt: '64px',                 // Height of Appbar
          pb: isMobile ? '56px' : '0px', // BottomNav offset
          p: { xs: 2, md: 4 },       // Nice padding, but NO max-width!
          overflowX: 'hidden',       // Prevents horizontal scroll
        }}
      >
        {/* INVISIBLE SPACER - PUSHES CONTENT BELOW THE FIXED APP BAR */}
        <Toolbar />
        {children}
      </Box>

      {/* Global Command Palette Overlay */}
      <CommandPalette />

      {/* Persistent Global Floating AI Drawer */}
      <GlobalCopilotDrawer />

      {/* Sliding Alerts Center Drawer */}
      <Drawer
        anchor="right"
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        PaperProps={{
          sx: {
            width: { xs: '100%', sm: 360 },
            backgroundColor: 'background.paper',
            backgroundImage: 'none',
            display: 'flex',
            flexDirection: 'column',
            borderLeft: '1px solid',
            borderColor: 'divider'
          }
        }}
      >
        <Box sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.75rem' }}>
            Alerts Center
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            {notifications.length > 0 && (
              <Button size="small" variant="text" onClick={clearAllNotifications} sx={{ fontSize: '0.65rem', fontWeight: 700, color: 'text.secondary' }}>
                Clear All
              </Button>
            )}
            <IconButton size="small" onClick={() => setNotificationsOpen(false)}>
              <ChevronLeftIcon />
            </IconButton>
          </Box>
        </Box>

        <Box sx={{ flex: 1, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {notifications.length > 0 ? (
            notifications.map((notif) => {
              let alertColor = 'info.main';
              let alertBg = 'action.hover';
              if (notif.type === 'danger') {
                alertColor = 'error.main';
                alertBg = 'rgba(230, 74, 25, 0.08)';
              } else if (notif.type === 'warning') {
                alertColor = 'warning.main';
                alertBg = 'rgba(245, 158, 11, 0.08)';
              } else if (notif.type === 'success') {
                alertColor = 'success.main';
                alertBg = 'rgba(46, 125, 50, 0.08)';
              }

              return (
                <Paper
                  key={notif.id}
                  variant="outlined"
                  onClick={() => markNotificationRead(notif.id)}
                  sx={{
                    p: 2,
                    cursor: 'pointer',
                    backgroundColor: alertBg,
                    borderColor: notif.unread ? alertColor : 'divider',
                    opacity: notif.unread ? 1 : 0.6,
                    transition: 'all 0.2s',
                    '&:hover': {
                      borderColor: alertColor,
                    }
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="caption" sx={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: alertColor }}>
                      #{notif.category}
                    </Typography>
                    <Typography variant="caption" sx={{ fontSize: 9, fontFamily: 'monospace', color: 'text.secondary' }}>
                      {notif.time}
                    </Typography>
                  </Box>
                  <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5, color: 'text.primary' }}>
                    {notif.title}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
                    {notif.message}
                  </Typography>
                  {notif.unread && (
                    <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 800, fontSize: 8, textTransform: 'uppercase', display: 'block', textAlign: 'right' }}>
                      ● Mark read
                    </Typography>
                  )}
                </Paper>
              )
            })
          ) : (
            <Box sx={{ textAlign: 'center', py: 8, color: 'text.disabled' }}>
              <Typography variant="body2">🔔 No active warning alerts.</Typography>
            </Box>
          )}
        </Box>
      </Drawer>

      {/* Sliding Tasks Drawer */}
      <Drawer
        anchor="right"
        open={tasksOpen}
        onClose={() => setTasksOpen(false)}
        PaperProps={{
          sx: {
            width: { xs: '100%', sm: 360 },
            backgroundColor: 'background.paper',
            backgroundImage: 'none',
            display: 'flex',
            flexDirection: 'column',
            borderLeft: '1px solid',
            borderColor: 'divider'
          }
        }}
      >
        <Box sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.75rem' }}>
            Tasks Checklist
          </Typography>
          <IconButton size="small" onClick={() => setTasksOpen(false)}>
            <ChevronLeftIcon />
          </IconButton>
        </Box>

        <Box sx={{ flex: 1, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {tasks.map((task) => (
            <Paper
              key={task.id}
              variant="outlined"
              onClick={() => toggleTask(task.id)}
              sx={{
                p: 1.5,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                borderColor: task.completed ? 'divider' : 'primary.light',
                '&:hover': {
                  borderColor: 'primary.main',
                }
              }}
            >
              <input
                type="checkbox"
                checked={task.completed}
                onChange={() => {}} // handled by click
                style={{ cursor: 'pointer' }}
              />
              <Typography
                variant="body2"
                sx={{
                  textDecoration: task.completed ? 'line-through' : 'none',
                  color: task.completed ? 'text.secondary' : 'text.primary',
                  fontWeight: task.completed ? 400 : 650,
                  fontSize: '0.8rem'
                }}
              >
                {task.text}
              </Typography>
            </Paper>
          ))}
        </Box>

        {/* Task Form */}
        <Box component="form" onSubmit={handleAddTaskSubmit} sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider', display: 'flex', gap: 1 }}>
          <TextField
            size="small"
            required
            value={newTaskInput}
            onChange={(e) => setNewTaskInput(e.target.value)}
            placeholder="Log check item..."
            variant="outlined"
            fullWidth
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: '8px',
                fontSize: '0.8rem'
              }
            }}
          />
          <Button
            type="submit"
            variant="contained"
            color="primary"
            sx={{ minWidth: 60, borderRadius: '8px', boxShadow: 'none' }}
          >
            <AddIcon />
          </Button>
        </Box>
      </Drawer>

      {/* Global Toast Stack */}
      <Box sx={{ position: 'fixed', bottom: isMobile ? 80 : 24, left: 24, zIndex: 2000, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </Box>

      {/* Persistent Bottom Navigation on Mobile */}
      {isMobile && (
        <Paper sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1000, borderTop: '1px solid', borderColor: 'divider' }} elevation={3}>
          <BottomNavigation
            showLabels
            value={activePanel}
            onChange={(event, newValue) => {
              navigateTo(newValue)
            }}
            sx={{
              backgroundColor: (theme) =>
                theme.palette.mode === 'dark'
                  ? 'rgb(9, 14, 26)'
                  : 'rgb(255, 255, 255)',
            }}
          >
            <BottomNavigationAction label="Dashboard" value="dashboard" icon={<DashboardIcon />} />
            <BottomNavigationAction label="Stock" value="inventory" icon={<InventoryIcon />} />
            <BottomNavigationAction label="Intake" value="intake" icon={<AddAPhotoIcon />} />
            <BottomNavigationAction label="POS" value="billing" icon={<CreditCardIcon />} />
            <BottomNavigationAction label="Reorder" value="suppliers-po" icon={<ShoppingCartIcon />} />
          </BottomNavigation>
        </Paper>
      )}
    </Box>
  )
}
