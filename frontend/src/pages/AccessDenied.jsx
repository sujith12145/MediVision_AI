import { useState, useEffect } from 'react'
import { Box, Typography, Button, Paper, Avatar, Alert, CircularProgress } from '@mui/material'
import ShieldAlertIcon from '@mui/icons-material/Shield'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { requestAccess } from '../services/api'

const COOLDOWN_SECONDS = 300 // 5 minutes

const AccessDenied = () => {
  const { user, signOut, authError, fetchUserRole } = useAuth()
  const navigate = useNavigate()

  const [status, setStatus] = useState('idle') // idle | loading | success | error
  const [alertMessage, setAlertMessage] = useState('')
  const [errorSeverity, setErrorSeverity] = useState('error') // 'error' | 'info' | 'warning'
  const [cooldown, setCooldown] = useState(0)

  const [refreshing, setRefreshing] = useState(false)
  const [refreshMessage, setRefreshMessage] = useState('')
  const [refreshSeverity, setRefreshSeverity] = useState('info')

  // Initialize cooldown state based on previous requests
  useEffect(() => {
    if (!user?.email) return
    const key = `last_access_request_${user.email}`
    const lastRequest = localStorage.getItem(key)
    if (lastRequest) {
      const elapsed = Date.now() - parseInt(lastRequest, 10)
      const remainingSeconds = Math.ceil((COOLDOWN_SECONDS * 1000 - elapsed) / 1000)
      if (remainingSeconds > 0) {
        setCooldown(remainingSeconds)
      }
    }
  }, [user?.email])

  // Count down the cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const handleRequestAccess = async () => {
    if (!user?.email || cooldown > 0 || status === 'loading') return

    setStatus('loading')
    setAlertMessage('')

    try {
      const res = await requestAccess(user.email)
      setStatus('success')
      setAlertMessage(
        res?.message ||
        'Request sent! Check the server console for the approval link.'
      )
      const now = Date.now()
      localStorage.setItem(`last_access_request_${user.email}`, now.toString())
      setCooldown(COOLDOWN_SECONDS)
    } catch (err) {
      // err.message is already the exact `detail` string from FastAPI
      const msg = err?.message || 'Unexpected error. Please try again.'

      // Classify severity so the UI gives appropriate colour cues
      const isInfoError =
        msg.toLowerCase().includes('already') ||
        msg.toLowerCase().includes('pending') ||
        msg.toLowerCase().includes('role')

      setStatus('error')
      setErrorSeverity(isInfoError ? 'info' : 'error')
      setAlertMessage(msg)

      // Apply cooldown on info errors (no retrying spam), not on server errors
      if (isInfoError) {
        const now = Date.now()
        localStorage.setItem(`last_access_request_${user.email}`, now.toString())
        setCooldown(COOLDOWN_SECONDS)
      }
    }
  }

  const handleRefreshRole = async () => {
    if (!user?.email || refreshing) return
    setRefreshing(true)
    setRefreshMessage('')
    try {
      console.log('[AccessDenied] Manually triggering role refresh for:', user.email)
      const role = await fetchUserRole(user.email)
      if (role) {
        setRefreshSeverity('success')
        setRefreshMessage(`Role verified: '${role}'. Redirecting...`)
        setTimeout(() => {
          navigate('/')
        }, 1500)
      } else {
        setRefreshSeverity('warning')
        setRefreshMessage('No role assigned yet. Please ensure the administrator has approved your request.')
      }
    } catch (err) {
      setRefreshSeverity('error')
      setRefreshMessage(`Refresh failed: ${err.message || err}`)
    } finally {
      setRefreshing(false)
    }
  }

  const formatCooldown = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0A74DA 0%, #1a3a5c 50%, #0A1628 100%)',
        position: 'relative',
        overflow: 'hidden',
        padding: 3,
      }}
    >
      {/* Background Decorative Circles */}
      <Box
        sx={{
          position: 'absolute',
          width: 500,
          height: 500,
          borderRadius: '50%',
          backgroundColor: '#ffffff',
          top: '-100px',
          left: '-100px',
          opacity: 0.03,
          pointerEvents: 'none',
          filter: 'blur(40px)',
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          width: 600,
          height: 600,
          borderRadius: '50%',
          backgroundColor: '#ffffff',
          bottom: '-150px',
          right: '-150px',
          opacity: 0.03,
          pointerEvents: 'none',
          filter: 'blur(50px)',
        }}
      />

      <Paper
        elevation={0}
        sx={{
          width: '100%',
          maxWidth: 480,
          borderRadius: 4,
          p: { xs: 4, sm: 5 },
          backdropFilter: 'blur(20px)',
          background: 'rgba(255, 255, 255, 0.95)',
          boxShadow: '0 30px 60px rgba(0, 0, 0, 0.3)',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        {/* Warning Shield Avatar */}
        <Avatar
          sx={{
            width: 72,
            height: 72,
            background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
            boxShadow: '0 8px 16px rgba(239, 68, 68, 0.3)',
            mb: 3,
          }}
        >
          <ShieldAlertIcon sx={{ fontSize: 40, color: '#ffffff' }} />
        </Avatar>

        {/* Access Denied heading */}
        <Typography
          variant="h4"
          component="h1"
          sx={{
            fontWeight: 800,
            color: '#1e293b',
            letterSpacing: '-0.025em',
            mb: 2,
          }}
        >
          Access Denied
        </Typography>

        {/* Body Text */}
        <Typography
          variant="body1"
          sx={{
            color: '#475569',
            lineHeight: 1.6,
            mb: 1.5,
            fontWeight: 500,
          }}
        >
          Your email <strong>{user?.email}</strong> has not been assigned a role in MediVision AI.
        </Typography>
        
        <Typography
          variant="body2"
          sx={{
            color: '#64748b',
            mb: 3,
          }}
        >
          To log in, you must request authorization clearance from the administrator.
        </Typography>

        {/* Auth Context Error Alert */}
        {authError && (
          <Alert
            severity="error"
            sx={{
              width: '100%',
              mb: 2,
              borderRadius: 2,
              textAlign: 'left',
              fontSize: '0.85rem',
              '& .MuiAlert-message': { wordBreak: 'break-word' },
            }}
          >
            <strong>Role Check Details:</strong> {authError}
          </Alert>
        )}

        {/* Refresh Status Alert */}
        {refreshMessage && (
          <Alert
            severity={refreshSeverity}
            sx={{
              width: '100%',
              mb: 2,
              borderRadius: 2,
              textAlign: 'left',
              fontSize: '0.85rem',
              '& .MuiAlert-message': { wordBreak: 'break-word' },
            }}
          >
            {refreshMessage}
          </Alert>
        )}

        {/* Status Alert — shows exact backend error detail */}
        {(status === 'success' || status === 'error') && alertMessage && (
          <Alert
            severity={status === 'success' ? 'success' : errorSeverity}
            sx={{
              width: '100%',
              mb: 3,
              borderRadius: 2,
              textAlign: 'left',
              fontSize: '0.85rem',
              '& .MuiAlert-message': { wordBreak: 'break-word' },
            }}
          >
            {alertMessage}
          </Alert>
        )}

        <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Request Access Button */}
          <Button
            fullWidth
            variant="contained"
            onClick={handleRequestAccess}
            disabled={status === 'loading' || cooldown > 0}
            sx={{
              py: 1.5,
              fontWeight: 700,
              fontSize: '1rem',
              borderRadius: 2.5,
              textTransform: 'none',
              background: 'linear-gradient(135deg, #0A74DA 0%, #0081FF 100%)',
              boxShadow: '0 4px 12px rgba(10, 116, 218, 0.25)',
              '&:hover': {
                background: 'linear-gradient(135deg, #085fb3 0%, #006ce6 100%)',
                boxShadow: '0 6px 16px rgba(10, 116, 218, 0.4)',
              },
            }}
          >
            {status === 'loading' ? (
              <CircularProgress size={24} color="inherit" />
            ) : cooldown > 0 ? (
              `Resend Request in ${formatCooldown(cooldown)}`
            ) : (
              'Request Access'
            )}
          </Button>

          {/* Refresh Access Button */}
          <Button
            fullWidth
            variant="outlined"
            onClick={handleRefreshRole}
            disabled={refreshing || !user?.email}
            sx={{
              py: 1.5,
              fontWeight: 700,
              fontSize: '1rem',
              borderRadius: 2.5,
              textTransform: 'none',
              borderColor: '#0A74DA',
              color: '#0A74DA',
              '&:hover': {
                borderColor: '#0081FF',
                backgroundColor: 'rgba(10, 116, 218, 0.04)',
              },
            }}
          >
            {refreshing ? (
              <CircularProgress size={24} color="inherit" />
            ) : (
              'Check Access Again'
            )}
          </Button>

          {/* Sign Out Button */}
          <Button
            fullWidth
            variant="outlined"
            onClick={handleSignOut}
            sx={{
              py: 1.5,
              fontWeight: 700,
              fontSize: '1rem',
              borderRadius: 2.5,
              textTransform: 'none',
              borderColor: '#cbd5e1',
              color: '#475569',
              '&:hover': {
                borderColor: '#94a3b8',
                backgroundColor: '#f8fafc',
              },
            }}
          >
            Sign Out
          </Button>
        </Box>
      </Paper>
    </Box>
  )
}

export default AccessDenied
