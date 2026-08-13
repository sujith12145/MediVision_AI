/**
 * api.js — centralised fetch wrapper
 *
 * - Automatically attaches the Bearer token from the active Supabase session.
 * - The Supabase SDK auto-refreshes the token before expiry — no manual refresh needed.
 * - Redirects to login on 401 so individual callers don't need to handle it.
 * - Throws a plain Error with a human-readable message on non-2xx responses.
 */

import { supabase } from '../lib/supabaseClient'

const BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? '/api' : 'https://medi-vision-ai.onrender.com')

async function getToken() {
  const localToken = localStorage.getItem('supabaseToken')
  if (localToken) return localToken

  const { data } = await supabase.auth.getSession()
  const sessionToken = data.session?.access_token ?? null
  if (sessionToken) {
    localStorage.setItem('supabaseToken', sessionToken)
  }
  return sessionToken
}

async function request(path, options = {}) {
  const token = await getToken()
  const headers = {
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })

  if (res.status === 401) {
    await supabase.auth.signOut()
    localStorage.removeItem('supabaseToken')
    window.location.href = '/login'
    return
  }


  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const body = await res.json()
      detail = body.detail ?? detail
    } catch {
      /* ignore parse error */
    }
    throw new Error(detail)
  }

  if (res.status === 204) return null
  return res.json()
}

async function downloadFile(path, options = {}) {
  const token = await getToken()
  const headers = {
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })

  if (res.status === 401) {
    await supabase.auth.signOut()
    localStorage.removeItem('supabaseToken')
    window.location.href = '/login'
    return
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const body = await res.json()
      detail = body.detail ?? detail
    } catch {
      /* ignore parse error */
    }
    throw new Error(detail)
  }

  return res.blob()
}

// ── Auth ────────────────────────────────────────────────────────────────────
export async function login(email, password) {
  // Sign in directly via Supabase JS SDK — no backend proxy call needed.
  // The session (access_token) is automatically stored by the SDK.
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) throw new Error(error.message)
  if (!data.session) throw new Error('Login failed — no session returned.')

  // Return same shape as old backend endpoint so LoginPage.jsx is unchanged.
  return { access_token: data.session.access_token, token_type: 'bearer' }
}

// ── Health ──────────────────────────────────────────────────────────────────
export const getHealth = () => request('/health')

// ── Intake & Medicines ──────────────────────────────────────────────────────
export const uploadImage = (file) => {
  const formData = new FormData()
  formData.append('file', file)
  return request('/intake/upload', {
    method: 'POST',
    body: formData,
  })
}

export const confirmIntake = (recordId, payload) => {
  return request(`/intake/confirm/${recordId}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export const checkDuplicate = (medicine_name, batch_number) => {
  const params = new URLSearchParams({ medicine_name })
  if (batch_number) params.append('batch_number', batch_number)
  return request(`/intake/check-duplicate?${params.toString()}`)
}

export const lookupMedicineByQRCode = (qrCodeId) => {
  return request(`/medicines/lookup/${encodeURIComponent(qrCodeId)}`)
}

export const searchMedicines = (q) => {
  return request(`/medicines/search?q=${encodeURIComponent(q)}`)
}

export const getMedicines = () => {
  return request('/medicines')
}

export const getInventory = (params = {}) => {
  const queryParts = []
  if (params.limit !== undefined) queryParts.push(`limit=${params.limit}`)
  if (params.offset !== undefined) queryParts.push(`offset=${params.offset}`)
  if (params.search) queryParts.push(`search=${encodeURIComponent(params.search)}`)
  if (params.manufacturer) queryParts.push(`manufacturer=${encodeURIComponent(params.manufacturer)}`)
  if (params.expiry_status) queryParts.push(`expiry_status=${encodeURIComponent(params.expiry_status)}`)

  const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : ''
  return request(`/inventory${queryString}`)
}

export const getManufacturers = () => {
  return request('/inventory/manufacturers')
}

export const getMedicineHistory = (medicineId) => {
  return request(`/inventory/${medicineId}/history`)
}

export const getExpirySummary = () => {
  return request('/inventory/expiry-summary')
}

export const getReorderSuggestions = () => {
  return request('/inventory/reorder-suggestions')
}

export const getSmartReorderPredictions = () => {
  return request('/inventory/smart-reorder-predictions')
}


export const askAssistant = (question) => {
  return request('/assistant/ask', {
    method: 'POST',
    body: JSON.stringify({ question })
  })
}

// ── Monthly Finance ─────────────────────────────────────────────────────────
export const getFinanceRecords = () => {
  return request('/finance')
}

export const getFinanceOverview = (month) => {
  return request(`/finance/overview/${month}`)
}

export const saveFinanceRecord = (payload) => {
  return request('/finance', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export const getGstReportMedicines = (month) => {
  return request(`/finance/gst-report/medicines/${month}`)
}

export const downloadGstReport = (payload) => {
  return downloadFile('/finance/gst-report', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export const downloadTransactionsExport = (params = {}) => {
  const queryParts = []
  if (params.start_date) queryParts.push(`start_date=${encodeURIComponent(params.start_date)}`)
  if (params.end_date) queryParts.push(`end_date=${encodeURIComponent(params.end_date)}`)
  if (params.month) queryParts.push(`month=${encodeURIComponent(params.month)}`)
  const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : ''
  return downloadFile(`/finance/transactions/export${queryString}`)
}

export const downloadSalesReport = (month, format = 'pdf') => {
  return downloadFile(`/finance/sales-report?month=${encodeURIComponent(month)}&format=${encodeURIComponent(format)}`)
}

export const downloadExpiryReport = (format = 'pdf') => {
  return downloadFile(`/finance/expiry-report?format=${encodeURIComponent(format)}`)
}

export const getGstReportSummary = (month) => {
  return request(`/finance/gst-report/summary/${month}`)
}

export const getFinancialRisk = () => {
  return request('/analytics/financial-risk')
}


// ── Sales & Billing ─────────────────────────────────────────────────────────
export const createSale = (payload) => {
  return request('/sales', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export const getSalesHistory = (params = {}) => {
  const queryParts = []
  if (params.start_date) queryParts.push('start_date=' + encodeURIComponent(params.start_date))
  if (params.end_date) queryParts.push('end_date=' + encodeURIComponent(params.end_date))
  const queryString = queryParts.length > 0 ? '?' + queryParts.join('&') : ''
  return request('/sales' + queryString)
}

export const getRecentSales = () => {
  return request('/sales/recent')
}

export const getDashboardKpis = () => {
  return request('/inventory/dashboard-kpis')
}

// ── Stock Locations ────────────────────────────────────────────────────────
export const confirmLocation = (payload) => {
  return request('/stock/confirm-location', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export const getLocations = () => {
  return request('/stock/locations')
}

export const createLocation = (payload) => {
  return request('/stock/locations', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export const generatePurchaseOrder = (items) => {
  return downloadFile('/orders/generate-po', {
    method: 'POST',
    body: JSON.stringify(items)
  })
}

export const getPurchaseOrdersHistory = () => {
  return request('/orders/history')
}

export const updatePurchaseOrderStatus = (poId, status) => {
  return request(`/orders/${poId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status })
  })
}

export const requestAccess = (email) => {
  return request('/auth/request-access', {
    method: 'POST',
    body: JSON.stringify({ email })
  })
}

export const approveAccess = (token) => {
  return request(`/auth/approve-access?token=${encodeURIComponent(token)}`)
}

export const getPendingRequests = () => {
  return request('/auth/pending-requests')
}

export const approveRequestAdmin = (id) => {
  return request('/auth/approve-request-admin', {
    method: 'POST',
    body: JSON.stringify({ id })
  })
}

export const rejectRequestAdmin = (id) => {
  return request('/auth/reject-request-admin', {
    method: 'POST',
    body: JSON.stringify({ id })
  })
}

export const getOwnerEmail = () => {
  return request('/auth/owner-email')
}

export default { 
  login, 
  getHealth, 
  uploadImage, 
  confirmIntake, 
  lookupMedicineByQRCode,
  searchMedicines,
  getMedicines, 
  getInventory, 
  getManufacturers, 
  getMedicineHistory, 
  getExpirySummary, 
  getReorderSuggestions,
  getSmartReorderPredictions,
  askAssistant, 
  getFinanceRecords, 
  getFinanceOverview, 
  saveFinanceRecord,
  getGstReportMedicines,
  downloadGstReport,
  downloadTransactionsExport,
  downloadSalesReport,
  downloadExpiryReport,
  getGstReportSummary,
  getFinancialRisk,
  createSale,
  getSalesHistory,
  getRecentSales,
  getDashboardKpis,
  confirmLocation,
  getLocations,
  createLocation,
  generatePurchaseOrder,
  getPurchaseOrdersHistory,
  updatePurchaseOrderStatus,
  requestAccess,
  approveAccess,
  getPendingRequests,
  approveRequestAdmin,
  rejectRequestAdmin,
  getOwnerEmail
}
