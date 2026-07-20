import { useState, useEffect, useCallback } from 'react'
import { getInventory, getManufacturers, getExpirySummary } from '../services/api'
import AuditHistoryModal from './AuditHistoryModal'

export default function InventoryTable({ refreshCounter, userRole }) {
  // Filters & State
  const [items, setItems] = useState([])
  const [totalItems, setTotalItems] = useState(0)
  const [loading, setLoading] = useState(false)
  const [manufacturers, setManufacturers] = useState([])
  const [selectedMedicineForHistory, setSelectedMedicineForHistory] = useState(null)
  const [summary, setSummary] = useState({ red: 0, amber: 0, green: 0 })

  // Query Parameters
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedManufacturer, setSelectedManufacturer] = useState('')
  const [selectedExpiryStatus, setSelectedExpiryStatus] = useState('')
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  // 1. Debounce Search Input to avoid redundant API requests
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
      setCurrentPage(1) // Reset page to 1 when search text changes
    }, 350)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // 2. Reset page on filter changes
  useEffect(() => {
    setCurrentPage(1)
  }, [selectedManufacturer, selectedExpiryStatus, itemsPerPage])

  // 3. Load unique manufacturers on mount (and on manual refreshes)
  const loadManufacturersList = async () => {
    try {
      const list = await getManufacturers()
      setManufacturers(list || [])
    } catch (err) {
      console.error('Failed to retrieve unique manufacturers:', err)
    }
  }

  // 4. Fetch Paginated & Filtered Inventory from Backend
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

  // Effect to load inventory data when query triggers change
  useEffect(() => {
    loadInventoryData()
  }, [loadInventoryData])

  // Load expiry summary counts
  const loadExpirySummary = useCallback(async () => {
    try {
      const data = await getExpirySummary()
      setSummary(data || { red: 0, amber: 0, green: 0 })
    } catch (err) {
      console.error('Failed to retrieve expiry summary:', err)
    }
  }, [])

  // Effect to load manufacturers list and expiry summary on mount/refresh
  useEffect(() => {
    loadManufacturersList()
    loadExpirySummary()
  }, [refreshCounter, loadExpirySummary])

  // Effect to reload data when refreshCounter increments from parent
  useEffect(() => {
    if (refreshCounter > 0) {
      loadInventoryData()
    }
  }, [refreshCounter, loadInventoryData])

  // Helpers
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
      return {
        label: 'No Expiry',
        classes: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25'
      }
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
        classes: 'text-rose-400 bg-rose-500/10 border-rose-500/25'
      }
    }
    if (daysDiff <= 90) {
      return {
        label: `Expiring (${formattedDate})`,
        classes: 'text-amber-400 bg-amber-500/10 border-amber-500/25'
      }
    }
    return {
      label: formattedDate,
      classes: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25'
    }
  }

  // Handler for viewing medicine audit trails
  const handleViewHistory = (medicine) => {
    setSelectedMedicineForHistory(medicine)
  }

  // Handler for printing small shelf labels
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
            @page {
              size: 3.5in 2.0in;
              margin: 0;
            }
            body {
              font-family: system-ui, -apple-system, sans-serif;
              margin: 0;
              padding: 12px;
              width: 3.5in;
              height: 2.0in;
              box-sizing: border-box;
              display: flex;
              align-items: center;
              gap: 14px;
              background: white;
              color: black;
            }
            .qr-container {
              width: 1.1in;
              height: 1.1in;
              flex-shrink: 0;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .qr-container img {
              width: 100%;
              height: 100%;
            }
            .info-container {
              display: flex;
              flex-direction: column;
              justify-content: center;
              min-width: 0;
              flex-grow: 1;
            }
            .name {
              font-size: 13px;
              font-weight: 800;
              margin: 0 0 4px 0;
              word-break: break-word;
              line-height: 1.2;
            }
            .detail {
              font-size: 9px;
              margin: 2px 0;
              color: #333;
              font-family: monospace;
              word-break: break-all;
            }
            .expiry {
              font-weight: 700;
              color: #000;
            }
            @media print {
              body {
                -webkit-print-color-adjust: exact;
              }
            }
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
    <div className="border border-slate-800/80 bg-surface-800/40 backdrop-blur-md rounded-3xl p-6 shadow-xl flex flex-col gap-6 animate-fade-in">
      
      {/* Expiry Bucket Summary metrics (Rule-based) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 flex items-center justify-between shadow-sm hover:scale-[1.01] transition-all">
          <div>
            <span className="text-[10px] uppercase font-bold text-rose-400 tracking-wider">Critical Expiry</span>
            <div className="text-2xl font-black text-slate-100 mt-1 font-mono">{summary.red}</div>
            <p className="text-[10px] text-rose-400/70 font-semibold mt-0.5">Expires ≤ 30 days</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
            <span className="text-lg leading-none select-none">🚨</span>
          </div>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-center justify-between shadow-sm hover:scale-[1.01] transition-all">
          <div>
            <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">Warning Expiry</span>
            <div className="text-2xl font-black text-slate-100 mt-1 font-mono">{summary.amber}</div>
            <p className="text-[10px] text-amber-400/70 font-semibold mt-0.5">Expires 31–90 days</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
            <span className="text-lg leading-none select-none">⚠️</span>
          </div>
        </div>

        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 flex items-center justify-between shadow-sm hover:scale-[1.01] transition-all">
          <div>
            <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">Safe Stock</span>
            <div className="text-2xl font-black text-slate-100 mt-1 font-mono">{summary.green}</div>
            <p className="text-[10px] text-emerald-400/70 font-semibold mt-0.5">Expires &gt; 90 days / None</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
            <span className="text-lg leading-none select-none">✅</span>
          </div>
        </div>
      </div>

      {/* Header and Search Filters */}
      <div className="flex flex-col gap-5 border-b border-slate-800/50 pb-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <span>📦</span> Live Stock Inventory
            </h3>
            <p className="text-slate-400 text-xs mt-1">
              Securely query and filter stored medicines (SQL Parameterized ORM).
            </p>
          </div>

          {/* Quick Stats */}
          <div className="flex gap-4 text-xs font-semibold">
            <span className="bg-surface-900 border border-slate-800 px-3.5 py-1.5 rounded-xl text-slate-400">
              Total Lines: <strong className="text-slate-200 font-mono">{totalItems}</strong>
            </span>
          </div>
        </div>

        {/* Filter Controls Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          
          {/* 1. Search Box */}
          <div className="md:col-span-5 relative">
            <span className="absolute left-3.5 top-3 text-slate-500 text-sm">🔍</span>
            <input
              type="text"
              placeholder="Search by medicine name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-primary-500/80 transition-all font-medium"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-3 text-slate-500 hover:text-slate-300 text-xs font-bold"
              >
                Clear
              </button>
            )}
          </div>

          {/* 2. Manufacturer Filter Dropdown */}
          <div className="md:col-span-3">
            <select
              value={selectedManufacturer}
              onChange={(e) => setSelectedManufacturer(e.target.value)}
              className="w-full bg-surface-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-primary-500/80 transition-all font-medium"
            >
              <option value="">All Manufacturers</option>
              {manufacturers.map((mfg) => (
                <option key={mfg} value={mfg}>
                  {mfg}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Expiry Filter Dropdown */}
          <div className="md:col-span-2">
            <select
              value={selectedExpiryStatus}
              onChange={(e) => setSelectedExpiryStatus(e.target.value)}
              className="w-full bg-surface-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-primary-500/80 transition-all font-medium"
            >
              <option value="">All Expiry Status</option>
              <option value="valid">Valid Stock</option>
              <option value="near_expiry">Near Expiry (≤30 Days)</option>
              <option value="expired">Expired Stock</option>
            </select>
          </div>

          {/* 4. Page Size Dropdown */}
          <div className="md:col-span-2">
            <select
              value={itemsPerPage}
              onChange={(e) => setItemsPerPage(parseInt(e.target.value))}
              className="w-full bg-surface-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-400 focus:outline-none focus:border-primary-500/80 transition-all font-medium"
            >
              <option value={5}>5 per page</option>
              <option value={10}>10 per page</option>
              <option value={25}>25 per page</option>
              <option value={50}>50 per page</option>
            </select>
          </div>

        </div>
      </div>

      {/* Inventory Table Grid */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="text-center py-16 text-slate-500 text-sm">
            <div className="relative w-8 h-8 mx-auto mb-3">
              <div className="absolute inset-0 rounded-full border-2 border-primary-500/20" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary-500 animate-spin" />
            </div>
            <span className="animate-pulse">Loading inventory records…</span>
          </div>
        ) : items.length > 0 ? (
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-800/80 text-slate-500 font-semibold uppercase text-xs tracking-wider">
                <th className="py-3 px-4">Medicine Name</th>
                <th className="py-3 px-4">Strength</th>
                <th className="py-3 px-4">Manufacturer</th>
                <th className="py-3 px-4">Batch No.</th>
                <th className="py-3 px-4">Expiry Date</th>
                <th className="py-3 px-4 text-right">MRP</th>
                <th className="py-3 px-4 text-center">Qty</th>
                <th className="py-3 px-4">Location</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {items.map((med) => {
                const isLowStock = med.quantity <= med.reorder_threshold
                const expiryInfo = getExpiryBadge(med.expiry_date)
                
                return (
                  <tr key={med.id} className="hover:bg-surface-800/25 transition-colors group">
                    <td className="py-4 px-4 font-bold text-slate-200">
                      {med.name}
                      {med.intake_status === 'expired_on_arrival' && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          ⚠️ EXPIRED ON ARRIVAL
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-slate-300 font-medium">{med.strength || '—'}</td>
                    <td className="py-4 px-4 text-slate-400 font-medium">{med.manufacturer || '—'}</td>
                    <td className="py-4 px-4 font-mono text-slate-400 text-xs">{med.batch_number || '—'}</td>
                    <td className="py-4 px-4">
                      <span className={`px-2 py-0.5 rounded-md border text-xs font-medium font-mono ${expiryInfo.classes}`}>
                        {expiryInfo.label}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right text-slate-200 font-semibold font-mono">
                      {med.mrp ? `₹${parseFloat(med.mrp).toFixed(2)}` : '—'}
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold font-mono ${
                        isLowStock 
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/25' 
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25'
                      }`}>
                        {med.quantity}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-slate-400 font-medium text-xs">
                      {med.storage_location ? (
                        <span className="bg-surface-900 px-2 py-1 rounded border border-slate-800">
                          📍 {med.storage_location}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="py-4 px-4 text-right flex items-center justify-end gap-2">
                      {userRole === 'admin' && (
                        <button
                          onClick={() => handleViewHistory(med)}
                          className="text-xs font-bold text-primary-400 hover:text-accent-400 bg-primary-500/5 hover:bg-primary-500/10 border border-primary-500/15 hover:border-accent-500/20 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer inline-flex items-center gap-1 opacity-80 group-hover:opacity-100"
                        >
                          🕰 View History
                        </button>
                      )}
                      <button
                        onClick={() => handlePrintLabel(med)}
                        className="text-xs font-bold text-emerald-400 hover:text-accent-400 bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/15 hover:border-accent-500/20 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer inline-flex items-center gap-1 opacity-80 group-hover:opacity-100"
                      >
                        🖨️ Print Label
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <div className="text-center py-16 text-slate-500 border border-dashed border-slate-800/80 rounded-2xl">
            <span className="text-3xl block mb-2">📦</span>
            <p className="font-semibold text-slate-400">No medicines match the criteria</p>
            <p className="text-xs text-slate-600 mt-1">Adjust search parameters or select different filters.</p>
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-800/50 pt-5 text-xs text-slate-400 font-medium">
          <div>
            Showing <span className="font-bold text-slate-300">{startRecord}</span> to{' '}
            <span className="font-bold text-slate-300">{endRecord}</span> of{' '}
            <span className="font-bold text-slate-300">{totalItems}</span> records
          </div>

          <div className="flex items-center gap-2">
            {/* Prev button */}
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1 || loading}
              className={`px-3 py-2 rounded-lg border text-xs font-semibold transition ${
                currentPage === 1
                  ? 'border-slate-800 text-slate-600 cursor-not-allowed bg-transparent'
                  : 'border-slate-700 text-slate-300 hover:border-slate-500 bg-surface-900 cursor-pointer active:scale-95'
              }`}
            >
              Previous
            </button>

            {/* Current page indicator */}
            <div className="px-3.5 py-2 rounded-lg bg-surface-900 border border-slate-800 text-slate-200 font-bold font-mono">
              Page {currentPage} of {totalPages}
            </div>

            {/* Next button */}
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages || loading}
              className={`px-3 py-2 rounded-lg border text-xs font-semibold transition ${
                currentPage === totalPages
                  ? 'border-slate-800 text-slate-600 cursor-not-allowed bg-transparent'
                  : 'border-slate-700 text-slate-300 hover:border-slate-500 bg-surface-900 cursor-pointer active:scale-95'
              }`}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Audit History Timeline Modal */}
      {selectedMedicineForHistory && (
        <AuditHistoryModal
          medicine={selectedMedicineForHistory}
          onClose={() => setSelectedMedicineForHistory(null)}
        />
      )}
    </div>
  )
}
