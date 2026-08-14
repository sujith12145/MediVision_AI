import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Box, Typography, Button, Paper, CircularProgress, Avatar } from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import { approveAccess } from '../services/api'

const ApproveAccess = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')

  const [loading, setLoading] = useState(true)
  const [success, setSuccess] = useState(false)
  const [email, setEmail] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const handleApproval = async () => {
      if (!token) {
        setErrorMsg('Invalid approval URL. No verification token was provided.')
        setLoading(false)
        return
      }

      try {
        const res = await approveAccess(token)
        setSuccess(true)
        setEmail(res?.email || 'The user')
      } catch (err) {
        setErrorMsg(err?.message || 'Invalid or expired approval token.')
      } finally {
        setLoading(false)
      }
    }

    handleApproval()
  }, [token])

  const handleActionClick = () => {
    navigate('/login')
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
        {loading ? (
          <Box sx={{ py: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <CircularProgress size={56} thickness={4} sx={{ color: '#0A74DA' }} />
            <Typography variant="body1" sx={{ color: '#475569', fontWeight: 600 }}>
              Verifying and provisioning workspace access...
            </Typography>
          </Box>
        ) : success ? (
          <>
            <Avatar
              sx={{
                width: 72,
                height: 72,
                background: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
                boxShadow: '0 8px 16px rgba(16, 185, 129, 0.3)',
                mb: 3,
              }}
            >
              <CheckCircleIcon sx={{ fontSize: 44, color: '#ffffff' }} />
            </Avatar>

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
              Access Granted
            </Typography>

            <Typography
              variant="body1"
              sx={{
                color: '#475569',
                lineHeight: 1.6,
                mb: 4,
                fontWeight: 500,
              }}
            >
              Workspace clearance has been successfully provisioned. The email <strong>{email}</strong> is now registered as an administrator and can log in to MediVision AI.
            </Typography>

            <Button
              fullWidth
              variant="contained"
              onClick={handleActionClick}
              sx={{
                py: 1.5,
                fontWeight: 700,
                fontSize: '1rem',
                borderRadius: 2.5,
                textTransform: 'none',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                  boxShadow: '0 6px 16px rgba(16, 185, 129, 0.4)',
                },
              }}
            >
              Go to Dashboard
            </Button>
          </>
        ) : (
          <>
            <Avatar
              sx={{
                width: 72,
                height: 72,
                background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
                boxShadow: '0 8px 16px rgba(239, 68, 68, 0.3)',
                mb: 3,
              }}
            >
              <ErrorIcon sx={{ fontSize: 44, color: '#ffffff' }} />
            </Avatar>

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
              Link Expired
            </Typography>

            <Typography
              variant="body1"
              sx={{
                color: '#475569',
                lineHeight: 1.6,
                mb: 4,
                fontWeight: 500,
              }}
            >
              {errorMsg}
            </Typography>

            <Button
              fullWidth
              variant="contained"
              onClick={handleActionClick}
              sx={{
                py: 1.5,
                fontWeight: 700,
                fontSize: '1rem',
                borderRadius: 2.5,
                textTransform: 'none',
                background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                boxShadow: '0 4px 12px rgba(15, 23, 42, 0.25)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #334155 0%, #1e293b 100%)',
                  boxShadow: '0 6px 16px rgba(15, 23, 42, 0.4)',
                },
              }}
            >
              Back to Login
            </Button>
          </>
        )}
      </Paper>
    </Box>
  )
}

export default ApproveAccess
