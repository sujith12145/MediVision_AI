import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import {
  Box,
  Typography,
  Paper,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
  Tooltip,
  Tabs,
  Tab
} from '@mui/material'
import { DataGrid } from '@mui/x-data-grid'
import DeleteIcon from '@mui/icons-material/Delete'
import AddIcon from '@mui/icons-material/Add'
import RefreshIcon from '@mui/icons-material/Refresh'
import SecurityIcon from '@mui/icons-material/Security'
import GroupIcon from '@mui/icons-material/Group'
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'

import { useAuth } from '../../contexts/AuthContext'
import { userService } from '../../services/userService'
import { supabase } from '../../lib/supabaseClient'
import { getPendingRequests, approveRequestAdmin, rejectRequestAdmin, getOwnerEmail } from '../../services/api'

export default function UserManagement() {
  const { user, userRole } = useAuth()

  // Guard: only allow admin clearance
  if (userRole !== 'admin') {
    return <Navigate to="/dashboard" replace />
  }

  // Active Clearances grid states
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)

  // Tabs navigation
  const [activeTab, setActiveTab] = useState(0)

  // Pending requests grid states
  const [pendingRequests, setPendingRequests] = useState([])
  const [pendingLoading, setPendingLoading] = useState(false)

  // Add User Dialog states
  const [openAddDialog, setOpenAddDialog] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState('staff')
  const [isMutating, setIsMutating] = useState(false)
  const [dialogError, setDialogError] = useState(null)
  const [ownerEmail, setOwnerEmail] = useState('anso2020vja@gmail.com')

  useEffect(() => {
    const fetchOwner = async () => {
      try {
        const res = await getOwnerEmail()
        if (res?.owner_email) {
          setOwnerEmail(res.owner_email.trim().toLowerCase())
        }
      } catch (err) {
        console.error('Failed to load owner email:', err)
      }
    }
    fetchOwner()
  }, [])

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const data = await userService.getAllUsers()
      if (data) {
        const filtered = user?.email === ownerEmail
          ? data
          : data.filter(u => u.assigned_by === user?.email)
        setRows(filtered)
      } else {
        setRows([])
      }
    } catch (err) {
      console.error('Failed to fetch user roles:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchPending = async () => {
    setPendingLoading(true)
    try {
      const data = await getPendingRequests()
      setPendingRequests(data || [])
    } catch (err) {
      console.error('Failed to fetch pending requests:', err)
    } finally {
      setPendingLoading(false)
    }
  }

  // Fetch all access data and listen to Supabase real-time updates
  useEffect(() => {
    fetchUsers()
    fetchPending()

    // Realtime channel listener for user roles changes
    const userRolesChannel = supabase
      .channel('user-roles-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_roles' },
        () => {
          fetchUsers()
        }
      )
      .subscribe()

    // Realtime channel listener for pending approvals changes
    const pendingChannel = supabase
      .channel('pending-approvals-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pending_approvals' },
        () => {
          fetchPending()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(userRolesChannel)
      supabase.removeChannel(pendingChannel)
    }
  }, [])

  // Handle Add User Form Submission
  const handleAddUserSubmit = async (e) => {
    e.preventDefault()
    if (!newEmail.trim()) {
      setDialogError('Email is required.')
      return
    }
    setDialogError(null)
    setIsMutating(true)

    try {
      await userService.addUser(
        newEmail.trim().toLowerCase(),
        newRole,
        user?.email || 'admin'
      )

      setNewEmail('')
      setNewRole('staff')
      setOpenAddDialog(false)
      fetchUsers()
    } catch (err) {
      console.error('Error inserting user role:', err)
      setDialogError(err.message || 'Failed to assign role. Check if email is already registered.')
    } finally {
      setIsMutating(false)
    }
  }

  // Handle Role Deletion
  const handleDeleteRole = async (row) => {
    if (row.email === user?.email) {
      alert('You cannot delete your own admin role.')
      return
    }

    if (window.confirm(`Are you sure you want to remove access role for ${row.email}?`)) {
      try {
        await userService.deleteUser(row.id)
        fetchUsers()
      } catch (err) {
        console.error('Failed to delete user role:', err)
        alert('Failed to delete user role: ' + err.message)
      }
    }
  }

  // Handle Inline DataGrid Role Updates
  const handleProcessRowUpdate = async (newRow, oldRow) => {
    if (newRow.role === oldRow.role) return newRow

    if (user?.email !== ownerEmail) {
      if (oldRow.assigned_by !== user?.email) {
        alert('You can only update roles for your own staff.')
        return oldRow
      }
      if (newRow.role === 'admin') {
        alert('You cannot assign the Admin role.')
        return oldRow
      }
    }

    try {
      await userService.updateUser(newRow.id, newRow.role)
      return newRow
    } catch (err) {
      console.error('Failed to update user role inline:', err)
      alert('Failed to update role: ' + err.message)
      return oldRow
    }
  }

  // Approve a pending user from the list
  const handleApprovePending = async (row) => {
    try {
      await approveRequestAdmin(row.id)
      fetchPending()
      fetchUsers()
    } catch (err) {
      console.error('Failed to approve request:', err)
      alert('Failed to approve request: ' + err.message)
    }
  }

  // Reject a pending user from the list
  const handleRejectPending = async (row) => {
    if (window.confirm(`Are you sure you want to reject access request for ${row.email}?`)) {
      try {
        await rejectRequestAdmin(row.id)
        fetchPending()
      } catch (err) {
        console.error('Failed to reject request:', err)
        alert('Failed to reject request: ' + err.message)
      }
    }
  }

  // Refresh active tab's grid
  const handleRefreshClick = () => {
    if (activeTab === 0) {
      fetchUsers()
    } else {
      fetchPending()
    }
  }

  // Columns for Active clearances grid
  const columns = [
    { field: 'email', headerName: 'Email Address', flex: 1.2, minWidth: 200 },
    {
      field: 'role',
      headerName: 'Workspace Role',
      width: 180,
      editable: true,
      type: 'singleSelect',
      valueOptions: ['admin', 'pharmacist', 'staff'],
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 700,
              textTransform: 'uppercase',
              fontSize: '0.75rem',
              color:
                params.value === 'admin'
                  ? 'warning.main'
                  : params.value === 'pharmacist'
                  ? 'primary.main'
                  : 'text.secondary'
            }}
          >
            {params.value}
          </Typography>
        </Box>
      )
    },
    { field: 'assigned_by', headerName: 'Assigned By', width: 200 },
    {
      field: 'created_at',
      headerName: 'Created At',
      width: 220,
      valueGetter: (params) => {
        const val = typeof params === 'string' ? params : params?.value
        return val ? new Date(val).toLocaleString() : ''
      }
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 100,
      sortable: false,
      align: 'center',
      headerAlign: 'center',
      renderCell: (params) => (
        <Tooltip title="Delete Access Role">
          <IconButton
            size="small"
            color="error"
            onClick={() => handleDeleteRole(params.row)}
            disabled={
              params.row.email === user?.email ||
              (user?.email !== ownerEmail && params.row.assigned_by !== user?.email)
            }
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )
    }
  ]

  // Columns for Pending access requests grid
  const pendingColumns = [
    { field: 'email', headerName: 'Email Address', flex: 1.2, minWidth: 200 },
    {
      field: 'requested_role',
      headerName: 'Requested Role',
      width: 180,
      renderCell: (params) => (
        <Typography
          variant="body2"
          sx={{
            fontWeight: 700,
            textTransform: 'uppercase',
            fontSize: '0.75rem',
            color: 'warning.main',
          }}
        >
          {params.value || 'admin'}
        </Typography>
      )
    },
    {
      field: 'created_at',
      headerName: 'Requested At',
      width: 220,
      valueGetter: (params) => {
        const val = typeof params === 'string' ? params : params?.value
        return val ? new Date(val).toLocaleString() : ''
      }
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 140,
      sortable: false,
      align: 'center',
      headerAlign: 'center',
      renderCell: (params) => (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Approve Access">
            <IconButton
              size="small"
              color="success"
              onClick={() => handleApprovePending(params.row)}
            >
              <CheckIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Reject Access">
            <IconButton
              size="small"
              color="error"
              onClick={() => handleRejectPending(params.row)}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      )
    }
  ]

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, width: '100%' }}>
      {/* Page Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider', pb: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, color: 'text.primary', display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <SecurityIcon color="primary" sx={{ fontSize: 32 }} />
            User Access Management
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Manage staff authorization clearances and view active system access rules or incoming requests.
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Tooltip title="Force Refresh">
            <IconButton 
              onClick={handleRefreshClick} 
              disabled={loading || pendingLoading} 
              sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
            >
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setOpenAddDialog(true)}
            sx={{
              fontWeight: 700,
              textTransform: 'none',
              borderRadius: 2,
              background: 'linear-gradient(135deg, #0A74DA 0%, #0081FF 100%)',
            }}
          >
            Add New User
          </Button>
        </Box>
      </Box>

      {/* Tabs Switcher */}
      <Tabs
        value={activeTab}
        onChange={(e, newVal) => setActiveTab(newVal)}
        sx={{
          borderBottom: 1,
          borderColor: 'divider',
          '& .MuiTab-root': {
            textTransform: 'none',
            fontWeight: 700,
            fontSize: '0.9rem',
          }
        }}
      >
        <Tab icon={<GroupIcon />} iconPosition="start" label="Active Clearance" />
        <Tab 
          icon={<HourglassEmptyIcon />} 
          iconPosition="start" 
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              Pending Requests
              {pendingRequests.length > 0 && (
                <Box
                  sx={{
                    bgcolor: 'error.main',
                    color: 'white',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    px: 1,
                    py: 0.2,
                    borderRadius: '10px',
                  }}
                >
                  {pendingRequests.length}
                </Box>
              )}
            </Box>
          } 
        />
      </Tabs>

      {/* Grid Container */}
      <Paper
        variant="outlined"
        sx={{
          borderRadius: '12px',
          overflow: 'hidden',
          backgroundColor: 'background.paper',
          height: '60vh',
          width: '100%',
        }}
      >
        {activeTab === 0 ? (
          <DataGrid
            rows={rows}
            columns={columns}
            loading={loading}
            processRowUpdate={handleProcessRowUpdate}
            experimentalFeatures={{ newEditingApi: true }}
            sx={{
              border: 'none',
              '& .MuiDataGrid-columnHeaders': {
                backgroundColor: 'action.hover',
                borderBottom: '1px solid',
                borderColor: 'divider',
                fontWeight: 700,
              },
              '& .MuiDataGrid-cell': {
                borderBottom: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
              },
              '& .MuiDataGrid-row:hover': {
                backgroundColor: 'action.hover',
              },
            }}
          />
        ) : (
          <DataGrid
            rows={pendingRequests}
            columns={pendingColumns}
            loading={pendingLoading}
            sx={{
              border: 'none',
              '& .MuiDataGrid-columnHeaders': {
                backgroundColor: 'action.hover',
                borderBottom: '1px solid',
                borderColor: 'divider',
                fontWeight: 700,
              },
              '& .MuiDataGrid-cell': {
                borderBottom: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
              },
              '& .MuiDataGrid-row:hover': {
                backgroundColor: 'action.hover',
              },
            }}
          />
        )}
      </Paper>

      {/* Add User Dialog */}
      <Dialog open={openAddDialog} onClose={() => !isMutating && setOpenAddDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Add User Access Rule</DialogTitle>
        <DialogContent dividers sx={{ py: 2 }}>
          {dialogError && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {dialogError}
            </Alert>
          )}
          <Box component="form" id="add-user-form" onSubmit={handleAddUserSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
            <TextField
              required
              fullWidth
              label="Email Address"
              type="email"
              placeholder="user@example.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              disabled={isMutating}
            />

            <FormControl fullWidth required>
              <InputLabel id="role-select-label">Access Clearance Role</InputLabel>
              <Select
                labelId="role-select-label"
                id="role-select"
                value={newRole}
                label="Access Clearance Role"
                onChange={(e) => setNewRole(e.target.value)}
                disabled={isMutating}
              >
                <MenuItem value="staff">Staff</MenuItem>
                <MenuItem value="pharmacist">Pharmacist</MenuItem>
                {user?.email === ownerEmail && (
                  <MenuItem value="admin">Admin</MenuItem>
                )}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setOpenAddDialog(false)} disabled={isMutating} sx={{ textTransform: 'none', fontWeight: 600 }}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="add-user-form"
            variant="contained"
            disabled={isMutating}
            sx={{
              textTransform: 'none',
              fontWeight: 700,
              minWidth: 100,
              background: 'linear-gradient(135deg, #0A74DA 0%, #0081FF 100%)',
            }}
          >
            {isMutating ? <CircularProgress size={20} color="inherit" /> : 'Add User'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
