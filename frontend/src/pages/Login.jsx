import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Paper,
  Typography,
  TextField,
  Tabs,
  Tab,
  Button,
  Divider,
  Alert,
  CircularProgress,
  Link,
  InputAdornment,
  IconButton,
  Avatar
} from '@mui/material'
import EmailIcon from '@mui/icons-material/Email'
import LockIcon from '@mui/icons-material/Lock'
import Visibility from '@mui/icons-material/Visibility'
import VisibilityOff from '@mui/icons-material/VisibilityOff'
import LocalHospitalIcon from '@mui/icons-material/LocalHospital'
import { useAuth } from '../contexts/AuthContext'

// Premium colored Google SVG Icon
const GoogleSvgIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ marginRight: 8 }}
  >
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.75-.63-1.25-1.54-1.25-2.63z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      fill="#EA4335"
    />
  </svg>
)

export default function Login() {
  const { user, loading, authError, signInWithGoogle, signInWithEmail } = useAuth()
  const navigate = useNavigate()

  // Local states
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [tabValue, setTabValue] = useState(0)
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [localError, setLocalError] = useState(null)

  // Redirect if user is already authenticated
  useEffect(() => {
    if (user && !loading) {
      navigate('/dashboard')
    }
  }, [user, loading, navigate])

  // Prevent flash of form when auth status is resolving
  if (loading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0A74DA 0%, #1a3a5c 50%, #0A1628 100%)',
          gap: 2,
        }}
      >
        <CircularProgress size={50} thickness={4} sx={{ color: '#ffffff' }} />
        <Typography variant="body2" sx={{ color: '#ffffff', opacity: 0.8, fontWeight: 600 }}>
          {user ? 'Checking access permissions...' : 'Restoring session...'}
        </Typography>
      </Box>
    )
  }

  const handleEmailSignIn = async (e) => {
    e.preventDefault()
    if (!email || !password) {
      setLocalError('Please fill in both your email and password.')
      return
    }
    setLocalError(null)
    setIsSubmitting(true)
    try {
      await signInWithEmail(email, password)
    } catch (err) {
      console.error('Email login failed:', err)
      setLocalError(err.message || 'Incorrect email or password. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setLocalError(null)
    setIsSubmitting(true)
    try {
      await signInWithGoogle()
    } catch (err) {
      console.error('Google sign in error:', err)
      setLocalError(err.message || 'Google authentication failed.')
      setIsSubmitting(false)
    }
  }

  const activeError = localError || authError

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
      {/* Background Decorative Circles (Opacity 0.03) */}
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
          maxWidth: 440,
          borderRadius: 4,
          p: { xs: 3, sm: 4 },
          backdropFilter: 'blur(20px)',
          background: 'rgba(255, 255, 255, 0.95)',
          boxShadow: '0 30px 60px rgba(0, 0, 0, 0.3)',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        {/* Medical Cross Logo */}
        <Avatar
          sx={{
            width: 64,
            height: 64,
            background: 'linear-gradient(135deg, #0A74DA 0%, #00C6FF 100%)',
            boxShadow: '0 8px 16px rgba(10, 116, 218, 0.3)',
            mb: 2.5,
          }}
        >
          <LocalHospitalIcon sx={{ fontSize: 36, color: '#ffffff' }} />
        </Avatar>

        {/* Title & Subtitle */}
        <Typography
          variant="h4"
          component="h1"
          align="center"
          sx={{
            fontWeight: 800,
            color: '#0A1628',
            letterSpacing: '-0.025em',
            mb: 0.5,
          }}
        >
          MediVision AI
        </Typography>
        <Typography
          variant="body2"
          align="center"
          sx={{
            color: '#5c728a',
            fontWeight: 500,
            mb: 3.5,
          }}
        >
          Advanced Pharmacy Intelligence
        </Typography>

        {/* Error Alert */}
        {activeError && (
          <Alert
            severity="error"
            onClose={() => setLocalError(null)}
            sx={{
              width: '100%',
              mb: 3,
              borderRadius: 2,
              animation: 'fadeIn 0.3s ease-in-out',
            }}
          >
            {activeError}
          </Alert>
        )}

        {/* Tabs for Email vs Magic Link */}
        <Tabs
          value={tabValue}
          onChange={(e, newValue) => {
            setTabValue(newValue)
            setLocalError(null)
          }}
          variant="fullWidth"
          sx={{
            width: '100%',
            mb: 3,
            borderBottom: '1px solid rgba(0,0,0,0.08)',
            '& .MuiTabs-indicator': {
              backgroundColor: '#0A74DA',
              height: 3,
              borderRadius: 1,
            },
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.95rem',
              color: '#5c728a',
              minHeight: 48,
              '&.Mui-selected': {
                color: '#0A74DA',
              },
            },
          }}
        >
          <Tab icon={<EmailIcon sx={{ fontSize: 20 }} />} iconPosition="start" label="Email" id="login-tab-email" />
          <Tab icon={<Visibility sx={{ fontSize: 20 }} />} iconPosition="start" label="Magic Link" id="login-tab-magic" />
        </Tabs>

        {/* Email & Password Form */}
        {tabValue === 0 && (
          <Box component="form" onSubmit={handleEmailSignIn} noValidate sx={{ width: '100%' }}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label="Email Address"
              name="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <EmailIcon color="action" />
                  </InputAdornment>
                ),
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2.5,
                },
              }}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Password"
              type={showPassword ? 'text' : 'password'}
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LockIcon color="action" />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle password visibility"
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2.5,
                },
              }}
            />

            {/* Forgot Password Link */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1.5, mb: 2 }}>
              <Link
                component="button"
                variant="body2"
                onClick={(e) => {
                  e.preventDefault()
                  setLocalError('Password recovery is currently under maintenance. Please contact support.')
                }}
                sx={{
                  color: '#0A74DA',
                  textDecoration: 'none',
                  fontWeight: 600,
                  '&:hover': {
                    textDecoration: 'underline',
                  },
                }}
              >
                Forgot password?
              </Link>
            </Box>

            {/* Sign In Button */}
            <Button
              type="submit"
              fullWidth
              variant="contained"
              disabled={isSubmitting}
              sx={{
                py: 1.5,
                fontWeight: 700,
                fontSize: '1rem',
                borderRadius: 2.5,
                textTransform: 'none',
                background: 'linear-gradient(135deg, #0A74DA 0%, #0081FF 100%)',
                boxShadow: '0 4px 12px rgba(10, 116, 218, 0.25)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #0966C2 0%, #0072E3 100%)',
                  boxShadow: '0 6px 16px rgba(10, 116, 218, 0.4)',
                },
              }}
            >
              {isSubmitting ? <CircularProgress size={24} color="inherit" /> : 'Sign In'}
            </Button>
          </Box>
        )}

        {/* Magic Link Section */}
        {tabValue === 1 && (
          <Box sx={{ width: '100%', py: 1 }}>
            <Alert severity="info" sx={{ borderRadius: 2, mb: 2 }}>
              Magic Link sign-in is coming soon! Please use the Email tab.
            </Alert>
            <TextField
              margin="normal"
              disabled
              fullWidth
              label="Email Address"
              placeholder="name@example.com"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <EmailIcon color="action" />
                  </InputAdornment>
                ),
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2.5,
                },
              }}
            />
            <Button
              fullWidth
              disabled
              variant="contained"
              sx={{
                py: 1.5,
                mt: 2,
                borderRadius: 2.5,
                textTransform: 'none',
                fontWeight: 700,
              }}
            >
              Send Magic Link
            </Button>
          </Box>
        )}

        {/* "or continue with" Divider */}
        <Box sx={{ width: '100%', my: 3 }}>
          <Divider sx={{ '&::before, &::after': { borderColor: 'rgba(0,0,0,0.08)' } }}>
            <Typography variant="body2" sx={{ color: '#8899a6', px: 1, fontWeight: 500 }}>
              or continue with
            </Typography>
          </Divider>
        </Box>

        {/* Google Sign In Button */}
        <Button
          fullWidth
          variant="outlined"
          onClick={handleGoogleSignIn}
          disabled={isSubmitting}
          startIcon={!isSubmitting && <GoogleSvgIcon />}
          sx={{
            py: 1.5,
            textTransform: 'none',
            fontSize: '0.95rem',
            fontWeight: 600,
            borderRadius: 2.5,
            borderColor: 'rgba(0,0,0,0.15)',
            color: '#1a3a5c',
            '&:hover': {
              borderColor: 'rgba(0,0,0,0.3)',
              backgroundColor: 'rgba(0,0,0,0.02)',
            },
          }}
        >
          {isSubmitting ? <CircularProgress size={24} color="inherit" /> : 'Sign in with Google'}
        </Button>

        {/* Terms & Privacy Footer */}
        <Box sx={{ mt: 4, textAlign: 'center' }}>
          <Typography variant="caption" sx={{ color: '#8899a6', display: 'block', lineHeight: 1.5 }}>
            By signing in, you agree to our{' '}
            <Link
              href="#"
              underline="hover"
              onClick={(e) => {
                e.preventDefault()
                setLocalError('Terms of Service document is being updated. Please contact support.')
              }}
              sx={{ fontWeight: 600, color: '#0A74DA', textDecoration: 'none' }}
            >
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link
              href="#"
              underline="hover"
              onClick={(e) => {
                e.preventDefault()
                setLocalError('Privacy Policy document is being updated. Please contact support.')
              }}
              sx={{ fontWeight: 600, color: '#0A74DA', textDecoration: 'none' }}
            >
              Privacy Policy
            </Link>
            .
          </Typography>
        </Box>
      </Paper>
    </Box>
  )
}
