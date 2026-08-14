import { Navigate } from 'react-router-dom'
import { CircularProgress, Box } from '@mui/material'
import { useAuth } from '../contexts/AuthContext'

const ProtectedRoute = ({ children }) => {
  const { user, userRole, loading } = useAuth()

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#0f172a' }}>
        <CircularProgress size={50} thickness={4} sx={{ color: '#38bdf8' }} />
      </Box>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!userRole) {
    return <Navigate to="/access-denied" replace />
  }

  return children
}

export default ProtectedRoute
