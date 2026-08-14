import { useState, useEffect, useCallback } from 'react'
import { getInventory, getManufacturers, getExpirySummary, getMedicineHistory } from '../../services/api'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import GlassCard from '../ui/GlassCard'
import AnimatedCounter from '../ui/AnimatedCounter'
import Badge from '../ui/Badge'
import Spinner from '../ui/Spinner'

export default function InventoryPanel() {
  const [items, setItems] = useState([])
  const [totalItems, setTotalItems] = useState(0)
  const [loading, setLoading] = useState(false)
  const [manufacturers, setManufacturers] = useState([])
  const [summary, setSummary] = useState({ red: 0, amber: 0, green: 0 })

  // Query Parameters
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedManufacturer, setSelectedManufacturer] = useState('')
  const [selectedExpiryStatus, setSelectedExpiryStatus] = useState('')
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  // Triple View Layout State: 'list' | 'grid' | 'compact'
  const [viewMode, setViewMode] = useState('list')

  // Column Chooser State
  const [visibleColumns, setVisibleColumns] = useState({
    strength: true,
    manufacturer: true,
    batch: true,
    expiry: true,
    mrp: true,
    qty: true,
    location: true
  })

  // Selected Medicine Detail Slide-over Workspace
  const [activeMedicineProfile, setActiveMedicineProfile] = useState(null)
  const [activeMedicineLogs, setActiveMedicineLogs] = useState([])
  const [loadingProfileHistory, setLoadingProfileHistory] = useState(false)

  // Column Resizing States (Widths in pixels)
  const [colWidths, setColWidths] = useState({
    name: 200,
    manufacturer: 140,
    batch: 100,
    expiry: 140,
    mrp: 90,
    qty: 70
  })

  // Handle Ctrl+K / CommandPalette prefilled medicine selection
  const { prefilledMedicine, setPrefilledMedicine } = useWorkspace()

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
      setCurrentPage(1)
    }, 250)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1)
  }, [selectedManufacturer, selectedExpiryStatus, itemsPerPage])

  // Load unique manufacturers
  const loadManufacturersList = async () => {
    try {
      const list = await getManufacturers()
      setManufacturers(list || [])
    } catch (err) {
      console.error('Failed to retrieve unique manufacturers:', err)
    }
  }

  // Fetch paginated inventory
  const loadInventoryData = useCallback(async () => {
    setLoading(true)
    try {
      const offset = (currentPage - 1) * itemsPerPage
      const data = await getInventory({
        limit: itemsPerPage,
        offset: offset,
        search: debouncedSearch,
        manufacturer: selectedManufacturer,
        expiry_status: selectedExpiryStatus
      })
      setItems(data.items || [])
      setTotalItems(data.total || 0)
    } catch (err) {
      console.error('Failed to load inventory:', err)
    } finally {
      setLoading(false)
    }
  }, [currentPage, itemsPerPage, debouncedSearch, selectedManufacturer, selectedExpiryStatus])

  // Load stats summary
  const loadExpirySummary = useCallback(async () => {
    try {
      const data = await getExpirySummary()
      setSummary(data || { red: 0, amber: 0, green: 0 })
    } catch (err) {
      console.error('Failed to retrieve expiry summary:', err)
    }
  }, [])

  useEffect(() => {
    loadManufacturersList()
    loadExpirySummary()
  }, [loadExpirySummary])

  useEffect(() => {
    loadInventoryData()
  }, [loadInventoryData])

  // Check prefilled medicine from Command Palette redirect
  useEffect(() => {
    if (prefilledMedicine) {
      handleOpenProfile(prefilledMedicine)
      setPrefilledMedicine(null) // clear instantly
    }
  }, [prefilledMedicine, setPrefilledMedicine])

  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1
  const startRecord = (currentPage - 1) * itemsPerPage + 1
  const endRecord = Math.min(currentPage * itemsPerPage, totalItems)

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage)
    }
  }

  const getExpiryBadge = (expiryDateStr) => {
    if (!expiryDateStr) {
      return { label: 'No Expiry', variant: 'success' }
    }
    
    const expiryDate = new Date(expiryDateStr)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const timeDiff = expiryDate.getTime() - today.getTime()
    const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24))

    const formattedDate = expiryDate.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })

    if (daysDiff <= 30) {
      return {
        label: `${daysDiff < 0 ? 'Expired' : 'Expires Soon'} (${formattedDate})`,
        variant: 'danger'
      }
    }
    if (daysDiff <= 90) {
      return {
        label: `Expiring (${formattedDate})`,
        variant: 'warning'
      }
    }
    return {
      label: formattedDate,
      variant: 'success'
    }
  }

  const handleOpenProfile = async (med) => {
    setActiveMedicineProfile(med)
    setLoadingProfileHistory(true)
    try {
      const logsData = await getMedicineHistory(med.id)
      setActiveMedicineLogs(logsData || [])
    } catch (e) {
      setActiveMedicineLogs([])
    } finally {
      setLoadingProfileHistory(false)
    }
  }

  const toggleColumnVisibility = (col) => {
    setVisibleColumns(prev => ({ ...prev, [col]: !prev[col] }))
  }

  const handlePrintLabel = (med) => {
    const printWindow = window.open('', '_blank', 'width=450,height=300')
    if (!printWindow) {
      alert('Pop-up blocked. Please allow pop-ups for this site to print labels.')
      return
    }

    const qrCodeSvg = med.qr_code_image || ''
    const formattedExpiry = med.expiry_date 
      ? new Date(med.expiry_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      : 'N/A'

    printWindow.document.write(`
      <html>
        <head>
          <title>Print Label - ${med.name}</title>
          <style>
            @page { size: 3.5in 2.0in; margin: 0; }
            body {
              font-family: system-ui, -apple-system, sans-serif;
              margin: 0; padding: 12px;
              width: 3.5in; height: 2.0in;
              box-sizing: border-box;
              display: flex; align-items: center; gap: 14px;
              background: white; color: black;
            }
            .qr-container { width: 1.1in; height: 1.1in; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
            .qr-container img { width: 100%; height: 100%; }
            .info-container { display: flex; flex-direction: column; justify-content: center; min-width: 0; flex-grow: 1; }
            .name { font-size: 13px; font-weight: 800; margin: 0 0 4px 0; word-break: break-word; line-height: 1.2; }
            .detail { font-size: 9px; margin: 2px 0; color: #333; font-family: monospace; word-break: break-all; }
            .expiry { font-weight: 700; color: #000; }
          </style>
        </head>
        <body>
          <div class="qr-container">
            ${qrCodeSvg ? `<img src="${qrCodeSvg}" alt="QR Code" />` : '<div style="font-size:8px;color:#999;">No QR</div>'}
          </div>
          <div class="info-container">
            <div class="name">${med.name} ${med.strength || ''}</div>
            <div class="detail"><strong>Batch:</strong> ${med.batch_number || 'N/A'}</div>
            <div class="detail" class="expiry"><strong>Expiry:</strong> ${formattedExpiry}</div>
            <div class="detail" style="font-size: 8px; color: #666; margin-top: 4px;">ID: ${med.qr_code_id || 'N/A'}</div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  return (
    <div className="panel-enter flex flex-col gap-6 font-sans relative">
      
      {/* Header */}
      <div className="panel-header">
        <div>
          <h2 className="panel-title flex items-center gap-2">
            <span>📦</span> Stock Inventory Data Grid
          </h2>
          <p className="panel-subtitle">Sort, choose columns, audit traceability ledger, and print QR labels</p>
        </div>
      </div>

      {/* Expiry summary rows */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <GlassCard className="p-4 flex items-center justify-between border-rose-500/20 bg-rose-950/5">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase font-bold text-rose-400 tracking-wider">Critical Expiry</span>
            <span className="text-xl font-extrabold text-slate-100 font-mono">
              <AnimatedCounter value={summary.red} />
            </span>
          </div>
          <div className="text-xl select-none">🚨</div>
        </GlassCard>

        <GlassCard className="p-4 flex items-center justify-between border-amber-500/20 bg-amber-950/5">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">Warning Expiry</span>
            <span className="text-xl font-extrabold text-slate-100 font-mono">
              <AnimatedCounter value={summary.amber} />
            </span>
          </div>
          <div className="text-xl select-none">⚠️</div>
        </GlassCard>

        <GlassCard className="p-4 flex items-center justify-between border-emerald-500/20 bg-emerald-950/5">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">Safe Stock</span>
            <span className="text-xl font-extrabold text-slate-100 font-mono">
              <AnimatedCounter value={summary.green} />
            </span>
          </div>
          <div className="text-xl select-none">✅</div>
        </GlassCard>
      </div>

      {/* Grid Settings & Filters Toolbar */}
      <GlassCard className="p-4 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-900 pb-3">
          
          {/* Layout view controls toggle */}
          <div className="flex items-center gap-1 bg-surface-950 p-1 border border-border rounded-lg text-xs font-bold font-mono">
            <button 
              onClick={() => setViewMode('list')}
              className={`py-1 px-3.5 rounded-md transition ${viewMode === 'list' ? 'bg-primary text-white' : 'text-slate-500'}`}
            >
              List
            </button>
            <button 
              onClick={() => setViewMode('grid')}
              className={`py-1 px-3.5 rounded-md transition ${viewMode === 'grid' ? 'bg-primary text-white' : 'text-slate-500'}`}
            >
              Cards
            </button>
            <button 
              onClick={() => setViewMode('compact')}
              className={`py-1 px-3.5 rounded-md transition ${viewMode === 'compact' ? 'bg-primary text-white' : 'text-slate-500'}`}
            >
              Compact
            </button>
          </div>

          {/* Column Chooser Dropdown */}
          <div className="flex items-center gap-2.5 text-xs font-semibold">
            <span className="text-slate-500 uppercase text-[9px] tracking-wider font-bold">Columns:</span>
            <div className="flex items-center gap-3">
              {['strength', 'manufacturer', 'batch', 'expiry', 'mrp', 'qty', 'location'].map((col) => (
                <label key={col} className="flex items-center gap-1.5 cursor-pointer text-slate-400 hover:text-white capitalize">
                  <input
                    type="checkbox"
                    checked={visibleColumns[col]}
                    onChange={() => toggleColumnVisibility(col)}
                    className="accent-primary w-3.5 h-3.5 cursor-pointer"
                  />
                  <span>{col}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Inputs queries */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-5 relative">
            <span className="absolute left-3 top-3 text-slate-500 text-sm">🔍</span>
            <input
              type="text"
              placeholder="Search medicine name, batch number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-base pl-9 pr-8"
            />
          </div>

          <div className="sm:col-span-3">
            <select
              value={selectedManufacturer}
              onChange={(e) => setSelectedManufacturer(e.target.value)}
              className="input-base text-xs font-bold"
            >
              <option value="">All Manufacturers</option>
              {manufacturers.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <select
              value={selectedExpiryStatus}
              onChange={(e) => setSelectedExpiryStatus(e.target.value)}
              className="input-base text-xs font-bold"
            >
              <option value="">All Expiries</option>
              <option value="valid">Valid Stock</option>
              <option value="near_expiry">Near Expiry (≤30 Days)</option>
              <option value="expired">Expired Stock</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <select
              value={itemsPerPage}
              onChange={(e) => setItemsPerPage(parseInt(e.target.value))}
              className="input-base text-xs font-bold"
            >
              <option value={5}>5 per page</option>
              <option value={10}>10 per page</option>
              <option value={25}>25 per page</option>
            </select>
          </div>
        </div>
      </GlassCard>

      {/* Main Grid Viewport */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500 text-xs font-bold animate-pulse font-mono">
          <Spinner size="md" className="border-t-primary" />
          <span>QUERYING ACTIVE DATABASE NODES...</span>
        </div>
      ) : items.length > 0 ? (
        viewMode === 'grid' ? (
          /* Cards Grid Mode */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {items.map((med) => {
              const expiryInfo = getExpiryBadge(med.expiry_date)
              const isLow = med.quantity <= med.reorder_threshold
              return (
                <GlassCard 
                  key={med.id} 
                  className="p-5 flex flex-col justify-between gap-4 cursor-pointer"
                  onClick={() => handleOpenProfile(med)}
                >
                  <div className="flex justify-between items-start">
                    <div className="min-w-0 flex-1">
                      <strong className="text-sm text-slate-200 block truncate">{med.name}</strong>
                      <span className="text-[10px] text-slate-500 font-semibold block mt-0.5">{med.manufacturer || 'N/A'}</span>
                    </div>
                    <Badge variant={isLow ? 'danger' : 'success'} className="font-mono text-[9px] uppercase">
                      Stock: {med.quantity}
                    </Badge>
                  </div>

                  <div className="flex flex-col gap-1 border-t border-slate-900 pt-3 text-[10px] font-bold text-slate-500">
                    {visibleColumns.batch && <div>Batch: <span className="text-slate-350 font-mono">{med.batch_number || 'N/A'}</span></div>}
                    {visibleColumns.expiry && <div>Expiry: <span className="text-slate-350 font-mono">{med.expiry_date || 'N/A'}</span></div>}
                    {visibleColumns.mrp && <div>MRP Price: <span className="text-emerald-400 font-mono">₹{med.mrp}</span></div>}
                  </div>
                </GlassCard>
              )
            })}
          </div>
        ) : (
          /* List & Compact Mode Table */
          <div className="data-grid-container overflow-x-auto">
            <table className="mv-table">
              <thead>
                <tr>
                  <th style={{ width: colWidths.name }}>Medicine Name</th>
                  {visibleColumns.strength && <th>Strength</th>}
                  {visibleColumns.manufacturer && <th style={{ width: colWidths.manufacturer }}>Manufacturer</th>}
                  {visibleColumns.batch && <th style={{ width: colWidths.batch }}>Batch No.</th>}
                  {visibleColumns.expiry && <th style={{ width: colWidths.expiry }}>Expiry Date</th>}
                  {visibleColumns.mrp && <th style={{ width: colWidths.mrp }} className="text-right">MRP</th>}
                  {visibleColumns.qty && <th style={{ width: colWidths.qty }} className="text-center">Qty</th>}
                  {visibleColumns.location && <th>Location</th>}
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody className={viewMode === 'compact' ? 'font-mono text-[10px]' : ''}>
                {items.map((med) => {
                  const isLow = med.quantity <= med.reorder_threshold
                  const expiryInfo = getExpiryBadge(med.expiry_date)
                  return (
                    <tr 
                      key={med.id} 
                      className="hover:bg-slate-900/30 cursor-pointer"
                      onClick={() => handleOpenProfile(med)}
                    >
                      <td className="font-bold text-slate-200">
                        {med.name}
                        {med.intake_status === 'expired_on_arrival' && (
                          <span className="ml-2 bg-rose-500/10 border border-rose-500/35 text-[8px] font-bold text-rose-400 py-0.5 px-1.5 rounded">
                            EXPIRED ARRIVAL
                          </span>
                        )}
                      </td>
                      {visibleColumns.strength && <td className="text-slate-400">{med.strength || '—'}</td>}
                      {visibleColumns.manufacturer && <td className="text-slate-400 truncate max-w-[120px]">{med.manufacturer || '—'}</td>}
                      {visibleColumns.batch && <td className="font-mono text-slate-500">{med.batch_number || '—'}</td>}
                      {visibleColumns.expiry && (
                        <td>
                          <Badge variant={expiryInfo.variant} className="font-mono text-[8px]">
                            {expiryInfo.label}
                          </Badge>
                        </td>
                      )}
                      {visibleColumns.mrp && (
                        <td className="text-right font-mono font-bold text-slate-250">
                          ₹{med.mrp ? parseFloat(med.mrp).toFixed(2) : '0.00'}
                        </td>
                      )}
                      {visibleColumns.qty && (
                        <td className="text-center">
                          <Badge variant={isLow ? 'danger' : 'success'} className="font-mono px-2 py-0.5">
                            {med.quantity}
                          </Badge>
                        </td>
                      )}
                      {visibleColumns.location && (
                        <td className="text-slate-550 text-xs font-mono">
                          {med.storage_location ? `📍 ${med.storage_location}` : '—'}
                        </td>
                      )}
                      <td className="text-right" onClick={(e) => e.stopPropagation()}>
                        <button 
                          onClick={() => handlePrintLabel(med)}
                          className="btn-ghost py-1 px-2.5 text-[10px] font-bold border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10"
                        >
                          🖨️ Label
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="text-center py-16 border border-dashed border-slate-900 rounded-xl text-slate-550">
          <span className="text-3xl block mb-2 select-none">📦</span>
          <p className="font-semibold text-slate-400 text-xs">No matching medicines found.</p>
        </div>
      )}

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-900 pt-4 mt-2 text-xs text-slate-500 font-semibold font-mono">
          <div>
            Showing <span className="font-bold text-slate-400">{startRecord}</span> to{' '}
            <span className="font-bold text-slate-400">{endRecord}</span> of{' '}
            <span className="font-bold text-slate-400">{totalItems}</span> items
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1 || loading}
              className="btn-ghost py-1 px-3.5"
            >
              Prev
            </button>
            <div className="px-3.5 py-1 bg-surface-950 border border-slate-900 rounded-lg text-slate-200 font-bold">
              Page {currentPage} of {totalPages}
            </div>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages || loading}
              className="btn-ghost py-1 px-3.5"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Medicine Profile Slide-over Workspace Drawer */}
      {activeMedicineProfile && (
        <div className="fixed inset-0 z-50 bg-[#000000]/60 backdrop-filter blur-md flex items-center justify-end animate-fade-in">
          <div className="w-full max-w-[500px] h-full bg-[#040816] border-l border-slate-900 p-6 flex flex-col justify-between shadow-2xl overflow-y-auto">
            <div>
              <div className="flex justify-between items-center border-b border-slate-900 pb-4">
                <div className="flex items-center gap-2">
                  <span className="text-base">💊</span>
                  <strong className="text-xs uppercase text-slate-350 tracking-wider">Medicine Workspace</strong>
                </div>
                <button 
                  onClick={() => { setActiveMedicineProfile(null); setActiveMedicineLogs([]); }}
                  className="text-slate-500 hover:text-white text-xs cursor-pointer bg-transparent border-none"
                >
                  ✕ Close
                </button>
              </div>

              {/* Profile card details */}
              <div className="flex flex-col gap-6 mt-6">
                <div className="p-4 bg-surface-950/60 border border-slate-850 rounded-xl flex gap-4">
                  <div className="w-14 h-14 bg-white rounded-lg p-1 flex items-center justify-center shrink-0">
                    {activeMedicineProfile.qr_code_image ? (
                      <img src={activeMedicineProfile.qr_code_image} alt="QR" className="w-full h-full" />
                    ) : (
                      <span className="text-[7px] text-slate-400">No QR</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-base font-black text-slate-100 truncate">{activeMedicineProfile.name}</h4>
                    <span className="text-xs text-slate-400 block mt-0.5">Strength: {activeMedicineProfile.strength || 'N/A'}</span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">Mfr: {activeMedicineProfile.manufacturer || 'N/A'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs font-semibold">
                  <div className="bg-surface-950/40 p-3 border border-slate-900 rounded-xl font-mono flex flex-col gap-0.5">
                    <span className="text-[9px] uppercase font-bold text-slate-500">Batch Number</span>
                    <span className="text-slate-200">{activeMedicineProfile.batch_number || 'N/A'}</span>
                  </div>
                  <div className="bg-surface-950/40 p-3 border border-slate-900 rounded-xl flex flex-col gap-0.5">
                    <span className="text-[9px] uppercase font-bold text-slate-500">Rack Location</span>
                    <span className="text-slate-200">📍 {activeMedicineProfile.storage_location || 'Not set'}</span>
                  </div>
                  <div className="bg-surface-950/40 p-3 border border-slate-900 rounded-xl font-mono flex flex-col gap-0.5">
                    <span className="text-[9px] uppercase font-bold text-slate-500">Retail Price (MRP)</span>
                    <span className="text-emerald-400 font-bold">₹{activeMedicineProfile.mrp}</span>
                  </div>
                  <div className="bg-surface-950/40 p-3 border border-slate-900 rounded-xl flex flex-col gap-0.5">
                    <span className="text-[9px] uppercase font-bold text-slate-500">Inventory Stock</span>
                    <span className="text-slate-200 font-mono font-bold">{activeMedicineProfile.quantity} units</span>
                  </div>
                </div>

                {/* Audit trail sub timeline */}
                <div className="flex flex-col gap-2">
                  <span className="text-[9px] uppercase font-bold text-slate-550 tracking-wider">Traceability trail</span>
                  <div className="bg-surface-950/40 border border-slate-900 rounded-xl p-4 flex flex-col gap-4 max-h-[180px] overflow-y-auto">
                    {loadingProfileHistory ? (
                      <Spinner size="sm" className="border-t-primary mx-auto" />
                    ) : activeMedicineLogs.length > 0 ? (
                      activeMedicineLogs.map((log) => (
                        <div key={log.id} className="border-b border-slate-900/60 pb-2 last:border-none last:pb-0 text-[10px]">
                          <div className="flex justify-between items-center text-slate-400 font-bold">
                            <span className="capitalize">{log.action.replace('_', ' ')}</span>
                            <span className="text-slate-550 font-mono text-[9px]">{new Date(log.timestamp).toLocaleDateString()}</span>
                          </div>
                          <span className="text-slate-500 font-medium block mt-0.5">Actor: {log.changed_by || 'System'}</span>
                        </div>
                      ))
                    ) : (
                      <span className="text-slate-650 text-[10px] text-center">No modifications logged yet.</span>
                    )}
                  </div>
                </div>

              </div>
            </div>

            <div className="flex gap-3 border-t border-slate-900 pt-4 mt-6">
              <button 
                onClick={() => handlePrintLabel(activeMedicineProfile)}
                className="btn-ghost flex-1 py-2.5 text-xs font-bold border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10"
              >
                🖨️ Print Label
              </button>
              <button 
                onClick={() => { setActiveMedicineProfile(null); setActiveMedicineLogs([]); }}
                className="btn-primary flex-1 py-2.5 text-xs uppercase tracking-wider font-extrabold"
              >
                ✓ Dismiss Workspace
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
