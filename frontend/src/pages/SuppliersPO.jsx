import React, { useState } from 'react'
import { DataGrid } from '@mui/x-data-grid'

// MUI Components
import {
  Box,
  Typography,
  Button,
  Paper,
  Card,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Tooltip
} from '@mui/material'

// MUI Icons
import AddIcon from '@mui/icons-material/Add'
import VisibilityIcon from '@mui/icons-material/Visibility'
import DeleteIcon from '@mui/icons-material/Delete'
import DownloadIcon from '@mui/icons-material/Download'

export default function SuppliersPO() {
  const [open, setOpen] = useState(false)
  const [supplierName, setSupplierName] = useState('')
  const [itemsText, setItemsText] = useState('')
  const [expectedDelivery, setExpectedDelivery] = useState('')
  
  // Pre-populated mock data for immediate visual fidelity
  const [purchaseOrders, setPurchaseOrders] = useState([
    { id: 1, poNumber: 'PO-0021', supplierName: 'Cipla Laboratories', orderDate: '2026-08-01', totalItems: 14, totalCost: 1540.00, status: 'Received' },
    { id: 2, poNumber: 'PO-0022', supplierName: 'GlaxoSmithKline IP', orderDate: '2026-08-02', totalItems: 8, totalCost: 850.50, status: 'Sent' },
    { id: 3, poNumber: 'PO-0023', supplierName: 'Sandoz Pharma', orderDate: '2026-08-03', totalItems: 19, totalCost: 2200.00, status: 'Draft' },
    { id: 4, poNumber: 'PO-0024', supplierName: 'AstraZeneca plc', orderDate: '2026-08-04', totalItems: 5, totalCost: 450.00, status: 'Sent' },
    { id: 5, poNumber: 'PO-0025', supplierName: 'Pfizer India Corp', orderDate: '2026-08-04', totalItems: 12, totalCost: 1800.00, status: 'Received' },
    { id: 6, poNumber: 'PO-0026', supplierName: 'Dr. Reddys Labs', orderDate: '2026-08-05', totalItems: 3, totalCost: 310.00, status: 'Cancelled' }
  ])

  const handleOpenDialog = () => {
    setOpen(true)
  }

  const handleCloseDialog = () => {
    setOpen(false)
    setSupplierName('')
    setItemsText('')
    setExpectedDelivery('')
  }

  const handleCreateOrder = (e) => {
    e.preventDefault()
    if (!supplierName.trim()) return

    const newPO = {
      id: Date.now(),
      poNumber: `PO-${String(purchaseOrders.length + 21).padStart(4, '0')}`,
      supplierName: supplierName.trim(),
      orderDate: new Date().toISOString().split('T')[0],
      totalItems: itemsText.split('\n').filter(line => line.trim()).length || 1,
      totalCost: 120.00 + Math.random() * 800.00,
      status: 'Draft'
    }

    setPurchaseOrders(prev => [newPO, ...prev])
    handleCloseDialog()
  }

  const handleDeletePO = (id) => {
    setPurchaseOrders(prev => prev.filter(po => po.id !== id))
  }

  const handleDownloadPO = (po) => {
    // Generate a mock CSV download
    const csvContent = "data:text/csv;charset=utf-8," 
      + `Purchase Order Number,${po.poNumber}\n`
      + `Supplier Name,${po.supplierName}\n`
      + `Order Date,${po.orderDate}\n`
      + `Total Items,${po.totalItems}\n`
      + `Total Cost,${po.totalCost.toFixed(2)}\n`
      + `Status,${po.status}\n`
    
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `PO_${po.poNumber}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const getStatusChipColor = (status) => {
    switch (status) {
      case 'Draft':
        return 'default'
      case 'Sent':
        return 'primary'
      case 'Received':
        return 'success'
      case 'Cancelled':
        return 'error'
      default:
        return 'default'
    }
  }

  const columns = [
    { field: 'poNumber', headerName: 'PO Number', width: 130, renderCell: (params) => (
      <Typography variant="body2" sx={{ fontWeight: 700, mt: 1.5 }}>{params.value}</Typography>
    )},
    { field: 'supplierName', headerName: 'Supplier Name', flex: 1 },
    { field: 'orderDate', headerName: 'Order Date', width: 140 },
    { field: 'totalItems', headerName: 'Total Items', width: 120, type: 'number' },
    { field: 'totalCost', headerName: 'Total Cost', width: 140, type: 'number', renderCell: (params) => (
      <Typography variant="body2" sx={{ fontWeight: 700, mt: 1.5 }}>${params.value.toFixed(2)}</Typography>
    )},
    { field: 'status', headerName: 'Status', width: 130, renderCell: (params) => (
      <Chip
        label={params.value}
        size="small"
        color={getStatusChipColor(params.value)}
        sx={{ fontWeight: 700, mt: 1 }}
      />
    )},
    { field: 'actions', headerName: 'Actions', width: 160, renderCell: (params) => (
      <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
        <Tooltip title="View Order">
          <IconButton size="small" onClick={() => handleDownloadPO(params.row)}>
            <VisibilityIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Download CSV">
          <IconButton size="small" onClick={() => handleDownloadPO(params.row)}>
            <DownloadIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Cancel/Delete PO">
          <IconButton size="small" color="error" onClick={() => handleDeletePO(params.row.id)}>
            <DeleteIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Box>
    )}
  ]

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header section with toolbar */}
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid',
          borderColor: 'divider'
        }}
      >
        <Typography variant="h5" sx={{ fontWeight: 800, color: 'text.primary' }}>
          Purchase Orders
        </Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={handleOpenDialog}
          sx={{ borderRadius: '8px' }}
        >
          New Order
        </Button>
      </Paper>

      {/* Main Grid Table */}
      <Card variant="outlined">
        <Box sx={{ height: 450, width: '100%' }}>
          <DataGrid
            rows={purchaseOrders}
            columns={columns}
            autoHeight
            initialState={{
              pagination: {
                paginationModel: { pageSize: 5 },
              },
            }}
            pageSizeOptions={[5]}
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

      {/* Modal Dialog Form */}
      <Dialog open={open} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Create New Purchase Order</DialogTitle>
        <Box component="form" onSubmit={handleCreateOrder}>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <TextField
              label="Supplier Name"
              required
              fullWidth
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder="e.g. Cipla India Laboratories"
            />
            <TextField
              label="Items List (one per line)"
              multiline
              rows={4}
              required
              fullWidth
              value={itemsText}
              onChange={(e) => setItemsText(e.target.value)}
              placeholder="e.g. Paracetamol 500mg - Qty: 200&#10;Amoxicillin 250mg - Qty: 150"
            />
            <TextField
              label="Expected Delivery Date"
              type="date"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={expectedDelivery}
              onChange={(e) => setExpectedDelivery(e.target.value)}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button onClick={handleCloseDialog} color="inherit">Cancel</Button>
            <Button type="submit" variant="contained" color="primary">Create PO</Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  )
}
