import { useEffect, useState } from 'react'
import { useWorkspace } from '../contexts/WorkspaceContext'
import {
  getExpirySummary,
  getInventory,
  getRecentSales,
  getDashboardKpis,
  getReorderSuggestions
} from '../services/api'

// MUI Components
import {
  Box,
  Grid,
  Card,
  CardContent,
  CardHeader,
  Typography,
  Paper,
  CircularProgress,
  Avatar,
  Chip,
  Stack,
  useTheme
} from '@mui/material'

// MUI DataGrid
import { DataGrid } from '@mui/x-data-grid'

// MUI Icons
import Inventory2Icon from '@mui/icons-material/Inventory2'
import AttachMoneyIcon from '@mui/icons-material/AttachMoney'
import WarningIcon from '@mui/icons-material/Warning'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'

// Recharts Components
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  Legend as ChartLegend,
  ResponsiveContainer
} from 'recharts'

export default function Dashboard() {
  const { userEmail, userRole } = useWorkspace()
  const theme = useTheme()

  useEffect(() => {
    console.log('Dashboard rendered successfully')
  }, [])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Live Data States
  const [kpis, setKpis] = useState({
    total_skus: 142,
    total_value: 48250.00,
    items_below_threshold: 12,
    expiring_count: 18,
    expiring_value: 4500.50
  })
  const [expiryChartData, setExpiryChartData] = useState([
    { name: 'Green (Safe)', value: 112, color: '#2E7D32' },
    { name: 'Amber (Warning)', value: 22, color: '#f59e0b' },
    { name: 'Red (Urgent)', value: 8, color: '#E64A19' }
  ])
  const [salesVelocity, setSalesVelocity] = useState([
    { date: 'Mon', sales: 1200 },
    { date: 'Tue', sales: 950 },
    { date: 'Wed', sales: 1400 },
    { date: 'Thu', sales: 1100 },
    { date: 'Fri', sales: 1650 },
    { date: 'Sat', sales: 1300 },
    { date: 'Sun', sales: 800 }
  ])
  const [criticalStockouts, setCriticalStockouts] = useState([
    { id: 1, name: 'Paracetamol 500mg', quantity: 2, reorder_threshold: 15, deficit: 13 },
    { id: 2, name: 'Amoxicillin 250mg', quantity: 5, reorder_threshold: 20, deficit: 15 },
    { id: 3, name: 'Metformin 500mg', quantity: 1, reorder_threshold: 10, deficit: 9 }
  ])
  const [adminClearance, setAdminClearance] = useState([
    { id: 1, name: 'Paracetamol 500mg', manufacturer: 'GSK', quantity: 2, reorder_threshold: 15, deficit: 13, suggested_order: 28 },
    { id: 2, name: 'Amoxicillin 250mg', manufacturer: 'Sandoz', quantity: 5, reorder_threshold: 20, deficit: 15, suggested_order: 35 },
    { id: 3, name: 'Metformin 500mg', manufacturer: 'Merck', quantity: 1, reorder_threshold: 10, deficit: 9, suggested_order: 19 },
    { id: 4, name: 'Ibuprofen 400mg', manufacturer: 'Abbott', quantity: 3, reorder_threshold: 12, deficit: 9, suggested_order: 21 },
    { id: 5, name: 'Atorvastatin 20mg', manufacturer: 'Pfizer', quantity: 4, reorder_threshold: 15, deficit: 11, suggested_order: 26 }
  ])

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        const [kpiData, expiryData, salesData, reordersData] = await Promise.all([
          getDashboardKpis().catch(() => null),
          getExpirySummary().catch(() => null),
          getRecentSales().catch(() => null),
          getReorderSuggestions().catch(() => null)
        ])

        if (kpiData) {
          setKpis({
            total_skus: kpiData.total_skus,
            total_value: kpiData.total_value,
            items_below_threshold: kpiData.items_below_threshold,
            expiring_count: kpiData.expiring_count,
            expiring_value: kpiData.expiring_value
          })
        }

        if (expiryData) {
          const formattedExpiry = [
            { name: 'Green (>90 Days)', value: expiryData.green || 0, color: '#2E7D32' },
            { name: 'Amber (31-90 Days)', value: expiryData.amber || 0, color: '#f59e0b' },
            { name: 'Red (≤30 Days)', value: expiryData.red || 0, color: '#E64A19' }
          ].filter(item => item.value > 0)
          if (formattedExpiry.length > 0) {
            setExpiryChartData(formattedExpiry)
          }
        }

        if (salesData && salesData.length > 0) {
          setSalesVelocity(salesData)
        }

        if (reordersData && reordersData.length > 0) {
          // Filter critical stockouts
          const stockouts = reordersData
            .filter(item => item.quantity < item.reorder_threshold)
            .map((item, idx) => ({
              id: item.medicine_id || idx,
              name: item.name,
              quantity: item.quantity,
              reorder_threshold: item.reorder_threshold,
              deficit: item.reorder_threshold - item.quantity
            }))
          setCriticalStockouts(stockouts)

          // Admin clearance dataset
          const clearance = reordersData.map((item, idx) => ({
            id: item.medicine_id || idx,
            name: item.name,
            manufacturer: item.manufacturer || 'General',
            quantity: item.quantity,
            reorder_threshold: item.reorder_threshold,
            deficit: item.reorder_threshold - item.quantity,
            suggested_order: item.suggested_reorder_quantity || 20
          }))
          setAdminClearance(clearance)
        }

      } catch (err) {
        console.error('Failed to load live data, falling back to mock data', err)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(val)
  }

  // DataGrid Columns definitions
  const stockoutColumns = [
    { field: 'name', headerName: 'Medicine Name', flex: 1 },
    { field: 'quantity', headerName: 'Current Stock', width: 120, type: 'number' },
    { field: 'reorder_threshold', headerName: 'Reorder Threshold', width: 140, type: 'number' },
    {
      field: 'deficit',
      headerName: 'Deficit',
      width: 100,
      type: 'number',
      renderCell: (params) => (
        <Typography variant="body2" sx={{ color: 'error.main', fontWeight: 800, mt: 1 }}>
          {params.value}
        </Typography>
      )
    }
  ]

  const clearanceColumns = [
    { field: 'name', headerName: 'Medicine Name', flex: 1 },
    { field: 'manufacturer', headerName: 'Manufacturer', width: 120 },
    { field: 'quantity', headerName: 'Current Stock', width: 100, type: 'number' },
    { field: 'reorder_threshold', headerName: 'Reorder Threshold', width: 120, type: 'number' },
    { field: 'deficit', headerName: 'Deficit', width: 80, type: 'number' },
    {
      field: 'suggested_order',
      headerName: 'Suggested Order',
      width: 140,
      renderCell: (params) => (
        <Chip
          label={`Order +${params.value}`}
          color="primary"
          size="small"
          variant="outlined"
          sx={{ fontWeight: 800, mt: 0.5 }}
        />
      )
    }
  ]

  if (loading && expiryChartData.length === 0) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 2 }}>
        <CircularProgress size={50} thickness={4} />
        <Typography variant="body2" sx={{ fontWeight: 700, letterSpacing: '0.1em', color: 'text.secondary' }}>
          LOADING MISSION CONTROL...
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: theme.spacing(3) }}>
      {/* Header Banner */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2, borderBottom: '1px solid', borderColor: 'divider', pb: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: '-0.02em', background: 'linear-gradient(135deg, #f8fafc 0%, #cbd5e1 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', mb: 0.5 }}>
            Welcome back, {userEmail ? userEmail.split('@')[0] : 'Operator'}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Pharmacy operational metrics, stock alerts, and sales performance dashboard.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Chip label={`${userRole} clearance`} size="small" color="primary" variant="outlined" sx={{ textTransform: 'uppercase', fontSize: 10, fontWeight: 700 }} />
          <Chip label={new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} size="small" variant="outlined" sx={{ fontSize: 10, fontWeight: 700 }} />
        </Box>
      </Box>

      {/* Row 1: KPI Cards */}
      <Grid container spacing={3}>
        {/* KPI 1: Total SKUs */}
        <Grid item xs={12} sm={6} md={3}>
          <Card variant="outlined" sx={{ height: '100%', '&:hover': { borderColor: 'primary.main' } }}>
            <CardHeader
              avatar={
                <Avatar sx={{ bgcolor: 'rgba(10, 116, 218, 0.1)', color: 'primary.main' }}>
                  <Inventory2Icon />
                </Avatar>
              }
              title={
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Total SKUs
                </Typography>
              }
            />
            <CardContent sx={{ pt: 0 }}>
              <Typography variant="h4" sx={{ fontWeight: 800 }}>
                {kpis.total_skus}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* KPI 2: Total Inventory Value */}
        <Grid item xs={12} sm={6} md={3}>
          <Card variant="outlined" sx={{ height: '100%', '&:hover': { borderColor: 'primary.main' } }}>
            <CardHeader
              avatar={
                <Avatar sx={{ bgcolor: 'rgba(46, 125, 50, 0.1)', color: 'success.main' }}>
                  <AttachMoneyIcon />
                </Avatar>
              }
              title={
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Total Stock Value
                </Typography>
              }
            />
            <CardContent sx={{ pt: 0 }}>
              <Typography variant="h4" sx={{ fontWeight: 800 }}>
                {formatCurrency(kpis.total_value)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* KPI 3: Items Below Threshold */}
        <Grid item xs={12} sm={6} md={3}>
          <Card variant="outlined" sx={{ height: '100%', '&:hover': { borderColor: 'error.main' } }}>
            <CardHeader
              avatar={
                <Avatar sx={{ bgcolor: 'rgba(230, 74, 25, 0.1)', color: 'secondary.main' }}>
                  <WarningIcon />
                </Avatar>
              }
              title={
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Below Threshold
                </Typography>
              }
            />
            <CardContent sx={{ pt: 0 }}>
              <Typography variant="h4" sx={{ fontWeight: 800, color: kpis.items_below_threshold > 0 ? 'secondary.main' : 'text.primary' }}>
                {kpis.items_below_threshold}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* KPI 4: Expiring in <=30 Days */}
        <Grid item xs={12} sm={6} md={3}>
          <Card variant="outlined" sx={{ height: '100%', '&:hover': { borderColor: 'error.main' } }}>
            <CardHeader
              avatar={
                <Avatar sx={{ bgcolor: 'rgba(230, 74, 25, 0.1)', color: 'error.main' }}>
                  <CalendarMonthIcon />
                </Avatar>
              }
              title={
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Expiring (≤30 Days)
                </Typography>
              }
            />
            <CardContent sx={{ pt: 0 }}>
              <Typography variant="h4" sx={{ fontWeight: 800, color: kpis.expiring_count > 0 ? 'error.main' : 'text.primary' }}>
                {formatCurrency(kpis.expiring_value)}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10, display: 'block', mt: 0.5 }}>
                {kpis.expiring_count} batches expiring soon
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Split Grid Section */}
      <Grid container spacing={3}>
        
        {/* Left Column (xs={12} md={6}): Expiry Doughnut + Critical Stockouts Table */}
        <Grid item xs={12} md={6}>
          <Stack direction="column" spacing={3}>
            {/* Expiry Distribution Doughnut Chart */}
            <Card variant="outlined">
              <CardContent sx={{ display: 'flex', flexDirection: 'column' }}>
                <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid', borderColor: 'divider', pb: 1, mb: 2 }}>
                  Expiry Distribution
                </Typography>
                <Box sx={{ minHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={expiryChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {expiryChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <ChartTooltip formatter={(value) => [`${value} SKUs`, 'Count']} />
                      <ChartLegend layout="vertical" align="right" verticalAlign="middle" iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                </Box>
              </CardContent>
            </Card>

            {/* Table 1: Critical Stockouts */}
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid', borderColor: 'divider', pb: 1, mb: 2 }}>
                  Critical Stockouts
                </Typography>
                <Box sx={{ width: '100%' }}>
                  <DataGrid
                    rows={criticalStockouts}
                    columns={stockoutColumns}
                    autoHeight
                    density="compact"
                    initialState={{
                      pagination: {
                        paginationModel: { pageSize: 3 },
                      },
                    }}
                    pageSizeOptions={[3]}
                    disableRowSelectionOnClick
                    sx={{
                      border: 'none',
                      '& .MuiDataGrid-cell:focus': {
                        outline: 'none'
                      }
                    }}
                  />
                </Box>
              </CardContent>
            </Card>
          </Stack>
        </Grid>

        {/* Right Column (xs={12} md={6}): Sales Velocity Bar + Admin Clearance Suggestions Table */}
        <Grid item xs={12} md={6}>
          <Stack direction="column" spacing={3}>
            {/* Sales Velocity Bar Chart */}
            <Card variant="outlined">
              <CardContent sx={{ display: 'flex', flexDirection: 'column' }}>
                <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid', borderColor: 'divider', pb: 1, mb: 2 }}>
                  Sales Velocity (Last 7 Days)
                </Typography>
                <Box sx={{ minHeight: 220 }}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={salesVelocity}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <ChartTooltip formatter={(value) => [`$${value.toFixed(2)}`, 'Sales']} />
                      <Bar dataKey="sales" fill="#0A74DA" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </CardContent>
            </Card>

            {/* Table 2: Admin Clearance */}
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid', borderColor: 'divider', pb: 1, mb: 2 }}>
                  Admin Clearance Suggestions
                </Typography>
                <Box sx={{ width: '100%' }}>
                  <DataGrid
                    rows={adminClearance}
                    columns={clearanceColumns}
                    autoHeight
                    density="compact"
                    initialState={{
                      pagination: {
                        paginationModel: { pageSize: 3 },
                      },
                    }}
                    pageSizeOptions={[3]}
                    disableRowSelectionOnClick
                    sx={{
                      border: 'none',
                      '& .MuiDataGrid-cell:focus': {
                        outline: 'none'
                      }
                    }}
                  />
                </Box>
              </CardContent>
            </Card>
          </Stack>
        </Grid>

      </Grid>
    </Box>
  )
}
