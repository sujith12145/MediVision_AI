import React from 'react'
import { Box, Typography, Button, Paper, Alert, AlertTitle } from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary captured a runtime exception:', error, errorInfo)
  }

  handleReset = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            bgcolor: '#02050f',
            p: 3,
            color: '#fff'
          }}
        >
          <Paper
            variant="outlined"
            sx={{
              maxWidth: 600,
              width: '100%',
              p: 4,
              borderRadius: '16px',
              bgcolor: 'rgba(9, 14, 26, 0.85)',
              borderColor: 'error.main',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 8px 32px rgba(230, 74, 25, 0.2)'
            }}
          >
            <Alert 
              severity="error" 
              variant="filled" 
              sx={{ mb: 3, borderRadius: '12px', bgcolor: 'error.dark' }}
            >
              <AlertTitle sx={{ fontWeight: 800 }}>Application Runtime Exception</AlertTitle>
              {this.state.error?.toString() || 'An unexpected rendering error crashed the React UI.'}
            </Alert>

            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 4, lineHeight: 1.6 }}>
              A critical rendering or state error was intercepted by the MediVision Error Boundary layer. Other segments of the operating system may still be fully responsive. Try reloading the console.
            </Typography>

            <Button
              variant="contained"
              color="error"
              size="large"
              startIcon={<RefreshIcon />}
              onClick={this.handleReset}
              sx={{
                borderRadius: '10px',
                textTransform: 'none',
                fontWeight: 700,
                px: 4
              }}
            >
              Reload Page
            </Button>
          </Paper>
        </Box>
      )
    }

    return this.props.children
  }
}
