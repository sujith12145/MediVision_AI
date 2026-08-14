import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { DataGrid } from '@mui/x-data-grid'
import { useWorkspace } from '../contexts/WorkspaceContext'
import {
  getSmartReorderPredictions,
  generatePurchaseOrder,
  getPurchaseOrdersHistory,
  updatePurchaseOrderStatus
} from '../services/api'

// MUI Components
import {
  Box,
  Alert,
  Typography,
  Button,
  Card,
  CardContent,
  Chip,
  Paper,
  Tabs,
  Tab,
  CircularProgress,
  IconButton,
  Tooltip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody
} from '@mui/material'

// MUI Icons
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart'
import HistoryIcon from '@mui/icons-material/History'
import DownloadIcon from '@mui/icons-material/Download'
import ChangeCircleIcon from '@mui/icons-material/ChangeCircle'

export default function ReorderCenter() {
  const { showToast } = useWorkspace()
  
  const [activeTab, setActiveTab] = useState(0)
  const [predictions, setPredictions] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [selectedRows, setSelectedRows] = useState([])

  const loadPredictions = useCallback(async () => {
    try {
      const data = await getSmartReorderPredictions()
      setPredictions(data || [])
    } catch (err) {
      console.error(err)
      showToast('Failed to load smart reorder predictions.', 'error')
    }
  }, [showToast])

  const loadHistory = useCallback(async () => {
    try {
      const data = await getPurchaseOrdersHistory()
      setHistory(data || [])
    } catch (err) {
      console.error(err)
      showToast('Failed to load purchase order history.', 'error')
    }
  }, [showToast])

  const loadAll = useCallback(async () => {
    setLoading(true)
    await Promise.all([loadPredictions(), loadHistory()])
    setLoading(false)
  }, [loadPredictions, loadHistory])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue)
  }

  // Calculate predicted stockout date helper
  const getPredictedStockoutDate = (days) => {
    if (days === null || days === undefined || days === 9999.0) {
      return 'Safe / No Sales'
    }
    const date = new Date()
    date.setDate(date.getDate() + Math.round(days))
    return date.toLocaleDateString()
  }

  // Bulk order generation trigger
  const handleBulkOrder = async () => {
    if (selectedRows.length === 0) return

    const payload = selectedRows.map(rowId => {
      const row = predictions.find(p => p.medicine_id === rowId)
      if (!row) return null
      return {
        medicine_id: row.medicine_id,
        quantity: row.suggested_reorder_quantity > 0 ? row.suggested_reorder_quantity : 20
      }
    }).filter(Boolean)

    if (payload.length === 0) {
      showToast('No valid items selected for order.', 'warning')
      return
    }

    setSubmitting(true)
    try {
      const blob = await generatePurchaseOrder(payload)
      
      // Trigger download of the CSV
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `PO_Distributor_${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      showToast('Purchase Order created and CSV downloaded successfully!', 'success')
      setSelectedRows([])
      await loadHistory()
    } catch (err) {
      console.error(err)
      showToast(err.message || 'Failed to generate Purchase Order.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // Update PO status handler
  const handleStatusChange = async (poId, newStatus) => {
    try {
      await updatePurchaseOrderStatus(poId, newStatus)
      showToast(`Purchase Order status updated to "${newStatus}"`, 'success')
      await loadHistory()
    } catch (err) {
      console.error(err)
      showToast(err.message || 'Failed to update status.', 'error')
    }
  }

  // Predictions Grid configuration
  const columns = useMemo(() => [
    {
      field: 'name',
      headerName: 'Medicine',
      width: 250,
      renderCell: (params) => (
        <Box sx={{ py: 0.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {params.row.name}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
            {params.row.strength || '—'} · {params.row.manufacturer || '—'}
          </Typography>
        </Box>
      )
    },
    {
      field: 'quantity',
      headerName: 'Current Stock',
      width: 150,
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontWeight: 600, mt: 1 }}>
          {params.row.quantity} units <Typography variant="caption" color="text.secondary">(Limit: {params.row.reorder_threshold})</Typography>
        </Typography>
      )
    },
    {
      field: 'estimated_days_until_stockout',
      headerName: 'Predicted Stockout Date',
      width: 220,
      renderCell: (params) => {
        const days = params.row.estimated_days_until_stockout
        const isUrgent = days !== null && days < 7
        const isUpcoming = days !== null && days >= 7 && days < 14
        const dateStr = getPredictedStockoutDate(days)

        return (
          <Chip
            size="small"
            label={dateStr}
            color={isUrgent ? 'error' : isUpcoming ? 'warning' : 'success'}
            variant="outlined"
            sx={{ fontWeight: 700, mt: 1 }}
          />
        )
      }
    },
    {
      field: 'suggested_reorder_quantity',
      headerName: 'Suggested Order Qty',
      width: 180,
      renderCell: (params) => {
        const qty = params.row.suggested_reorder_quantity
        return (
          <Chip
            size="small"
            label={qty > 0 ? `+${qty} Units` : 'Safe'}
            color={qty > 0 ? 'primary' : 'default'}
            sx={{ fontWeight: 700, mt: 1 }}
          />
        )
      }
    }
  ], [predictions])

  const getStatusChipColor = (status) => {
    switch (status) {
      case 'Draft':
        return 'default'
      case 'Sent':
        return 'primary'
      case 'Fulfilled':
        return 'success'
      default:
        return 'default'
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* Header Banner */}
      <Box sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: '-0.02em', background: 'linear-gradient(135deg, #f8fafc 0%, #cbd5e1 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', mb: 0.5 }}>
          Reorder Center
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Consolidate smart inventory warnings, group batch orders, generate printable CSV PO logs, and maintain distributor audit logs.
        </Typography>
      </Box>

      {/* Tabs Menu */}
      <Tabs value={activeTab} onChange={handleTabChange} sx={{ borderBottom: 1, borderColor: 'divider', mb: 1 }}>
        <Tab icon={<ShoppingCartIcon />} label="Reorder Suggestions" iconPosition="start" />
        <Tab icon={<HistoryIcon />} label="Purchase Order History" iconPosition="start" />
      </Tabs>

      {/* TAB 1: DATA GRID SUGGESTIONS */}
      {activeTab === 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {selectedRows.length > 0 && (
            <Alert
              severity="info"
              sx={{ py: 0.5, px: 2, display: 'flex', alignItems: 'center' }}
              action={
                <Button
                  variant="contained"
                  color="primary"
                  size="small"
                  onClick={handleBulkOrder}
                  disabled={submitting}
                  startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <ShoppingCartIcon />}
                >
                  Generate Bulk PO ({selectedRows.length} Items)
                </Button>
              }
            >
              {selectedRows.length} medicine items selected for bulk ordering.
            </Alert>
          )}

          <Card variant="outlined">
            <Box sx={{ height: 500, width: '100%' }}>
              <DataGrid
                rows={predictions}
                columns={columns}
                getRowId={(row) => row.medicine_id}
                checkboxSelection
                rowSelectionModel={selectedRows}
                onRowSelectionModelChange={(newSelection) => setSelectedRows(newSelection)}
                disableRowSelectionOnClick
                sx={{
                  border: 'none',
                  '& .MuiDataGrid-cell:focus': {
                    outline: 'none'
                  }
                }}
              />
            </Box>
          </Card>
        </Box>
      )}

      {/* TAB 2: PURCHASE ORDER HISTORY */}
      {activeTab === 1 && (
        <Card variant="outlined">
          <CardContent>
            {history.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 6, color: 'text.disabled', fontStyle: 'italic' }}>
                No purchase orders created yet. Select low stock items to generate your first order.
              </Box>
            ) : (
              <TableContainer component={Paper} variant="outlined">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>PO ID</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Supplier/Distributor</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Date Created</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Total Value</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Items Count</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {history.map((po) => (
                      <TableRow key={po.id} hover>
                        <TableCell sx={{ fontWeight: 600 }}>PO-{po.id}</TableCell>
                        <TableCell>{po.supplier_name}</TableCell>
                        <TableCell>
                          {new Date(po.created_at).toLocaleString('en-IN', {
                            dateStyle: 'short',
                            timeStyle: 'short'
                          })}
                        </TableCell>
                        <TableCell>${po.total_cost.toFixed(2)}</TableCell>
                        <TableCell>{po.items?.length || 0} items</TableCell>
                        <TableCell>
                          <Chip
                            label={po.status}
                            color={getStatusChipColor(po.status)}
                            size="small"
                            sx={{ fontWeight: 700 }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'flex-end', alignItems: 'center' }}>
                            <FormControl size="small" sx={{ minWidth: 120 }}>
                              <Select
                                value={po.status}
                                onChange={(e) => handleStatusChange(po.id, e.target.value)}
                                sx={{ height: 32, fontSize: '0.85rem' }}
                              >
                                <MenuItem value="Draft">Draft</MenuItem>
                                <MenuItem value="Sent">Sent</MenuItem>
                                <MenuItem value="Fulfilled">Fulfilled</MenuItem>
                              </Select>
                            </FormControl>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  )
}
