import { useState, useEffect } from 'react'
import { getMedicineHistory } from '../services/api'

export default function AuditHistoryModal({ medicine, onClose }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!medicine?.id) return

    const loadHistory = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await getMedicineHistory(medicine.id)
        setLogs(data || [])
      } catch (err) {
        console.error('Failed to retrieve history logs:', err)
        setError(err.message || 'Failed to load history audit log.')
      } finally {
        setLoading(false)
      }
    }

    loadHistory()
  }, [medicine])

  // Format Action / Role name for display
  const getActionHeading = (log) => {
    const actor = log.changed_by || 'Unknown User'
    switch (log.action) {
      case 'created':
        return {
          title: 'Inventory Line Created',
          subtitle: `Initiated by ${actor}`,
          icon: '✨',
          colorClass: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
        }
      case 'quantity_updated':
        return {
          title: 'Stock Quantity Top-up',
          subtitle: `Updated by ${actor}`,
          icon: '📈',
          colorClass: 'bg-primary-500/10 border-primary-500/20 text-primary-400'
        }
      case 'ai_corrected':
        return {
          title: 'Manual Correction Applied',
          subtitle: `Verified by ${actor}`,
          icon: '✍️',
          colorClass: 'bg-amber-500/10 border-amber-500/20 text-amber-400'
        }
      default:
        return {
          title: log.action.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()),
          subtitle: `Logged by ${actor}`,
          icon: '📝',
          colorClass: 'bg-slate-500/10 border-slate-500/20 text-slate-400'
        }
    }
  }

  // Parse values safely and present them cleanly
  const renderLogDetails = (log) => {
    // 1. Creation Action
    if (log.action === 'created') {
      try {
        const payload = JSON.parse(log.new_value)
        return (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-slate-400 bg-surface-950/40 p-3 rounded-xl border border-slate-800/65 font-medium mt-2">
            <div>Name: <strong className="text-slate-300 font-sans">{payload.name}</strong></div>
            <div>Batch: <strong className="text-slate-300 font-mono text-[10px]">{payload.batch_number || '—'}</strong></div>
            <div>Starting Quantity: <strong className="text-slate-300 font-mono">{payload.quantity}</strong></div>
          </div>
        )
      } catch {
        return <div className="text-xs text-slate-500 mt-2 font-mono break-all">{log.new_value}</div>
      }
    }

    // 2. Quantity Update Top-up
    if (log.action === 'quantity_updated') {
      return (
        <div className="flex items-center gap-2 text-xs text-slate-400 bg-surface-950/40 p-3 rounded-xl border border-slate-800/65 font-medium mt-2">
          <span>Inventory Level changed:</span>
          <code className="text-rose-400 bg-rose-500/5 px-2 py-0.5 rounded border border-rose-500/10 font-mono font-bold">{log.old_value}</code>
          <span className="text-slate-600">➔</span>
          <code className="text-emerald-400 bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/10 font-mono font-bold">{log.new_value}</code>
        </div>
      )
    }

    // 3. Single Field Human Correction
    if (log.action === 'ai_corrected') {
      const oldVal = log.old_value || ''
      const newVal = log.new_value || ''

      const prefixes = ['medicine_name:', 'strength:', 'manufacturer:', 'batch_number:', 'expiry_date:', 'mrp:']
      const matchedPrefix = prefixes.find(p => oldVal.startsWith(p) || newVal.startsWith(p))

      if (matchedPrefix) {
        const fieldLabel = matchedPrefix.slice(0, -1).replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
        const oldDisplay = oldVal.slice(matchedPrefix.length).trim() || '(empty)'
        const newDisplay = newVal.slice(matchedPrefix.length).trim() || '(empty)'

        return (
          <div className="flex flex-col gap-1.5 bg-surface-950/40 p-3 rounded-xl border border-slate-800/65 mt-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Corrected Field: {fieldLabel}</span>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
              <span className="text-slate-500">AI Extracted:</span>
              <code className="text-rose-300/80 bg-rose-500/5 px-2 py-0.5 rounded border border-rose-500/10 font-mono">"{oldDisplay}"</code>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
              <span className="text-slate-500">Confirmed:</span>
              <code className="text-emerald-300/80 bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/10 font-mono">"{newDisplay}"</code>
            </div>
          </div>
        )
      }
    }

    // Fallback Renderer
    return (
      <div className="flex flex-col gap-2 mt-2 bg-surface-950/40 p-3 rounded-xl border border-slate-800/65 text-xs text-slate-400 font-mono">
        {log.old_value && <div>Old: {log.old_value}</div>}
        {log.new_value && <div>New: {log.new_value}</div>}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-950/70 backdrop-blur-sm animate-fade-in">
      {/* Modal Container */}
      <div className="relative w-full max-w-2xl bg-surface-800/90 border border-slate-800/80 rounded-3xl p-6 shadow-2xl flex flex-col gap-5 max-h-[85vh] overflow-hidden">
        
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-slate-800/50 pb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <span>🕰</span> Audit Trail & Traceability
            </h3>
            <p className="text-slate-400 text-xs mt-1">
              Complete chronological ledger of modifications made to <strong className="text-slate-300">{medicine?.name}</strong>.
            </p>
          </div>
          
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 bg-surface-900 border border-slate-800 hover:border-slate-700 w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer text-sm font-bold overflow-hidden select-none"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="text-center py-16 text-slate-500 text-sm">
              <div className="relative w-8 h-8 mx-auto mb-3">
                <div className="absolute inset-0 rounded-full border-2 border-primary-500/20" />
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary-500 animate-spin" />
              </div>
              <span className="animate-pulse">Retrieving audit history…</span>
            </div>
          ) : error ? (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-2xl text-sm text-center">
              ⚠️ {error}
            </div>
          ) : logs.length > 0 ? (
            <div className="relative border-l border-slate-800 ml-4 py-2 flex flex-col gap-6">
              {logs.map((log) => {
                const config = getActionHeading(log)
                const timestamp = new Date(log.timestamp).toLocaleString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                })

                return (
                  <div key={log.id} className="relative pl-6 group">
                    {/* Circle Dot Marker on Timeline Line */}
                    <div className="absolute -left-[4.5px] top-1.5 w-2 h-2 rounded-full bg-slate-800 border border-surface-800 group-hover:bg-primary-500 group-hover:scale-125 transition-all duration-300" />
                    
                    {/* Log Entry Card */}
                    <div className="bg-surface-900/50 border border-slate-800/80 rounded-2xl p-4 shadow-sm transition-all duration-300 hover:border-slate-700/80 hover:bg-surface-900/75">
                      
                      {/* Header row */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-base select-none">{config.icon}</span>
                          <span className="font-bold text-slate-200 text-sm tracking-tight">{config.title}</span>
                          <span className={`px-2 py-0.5 rounded-full border text-[9px] font-bold ${config.colorClass}`}>
                            {log.action}
                          </span>
                        </div>
                        <span className="text-[10px] font-semibold font-mono text-slate-500 bg-surface-950 px-2 py-0.5 rounded border border-slate-800/40">
                          {timestamp}
                        </span>
                      </div>
                      
                      {/* Subtitle / Actor */}
                      <p className="text-slate-400 text-xs font-medium pb-2 border-b border-slate-800/40">
                        {config.subtitle}
                      </p>

                      {/* Values Change Details */}
                      {renderLogDetails(log)}

                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-16 text-slate-500 border border-dashed border-slate-800 rounded-2xl">
              <span className="text-3xl block mb-2">📜</span>
              <p className="font-semibold text-slate-400">No modifications logged yet</p>
              <p className="text-xs text-slate-600 mt-1">This medicine has no registered changes or corrections.</p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex justify-end pt-3 border-t border-slate-800/50">
          <button
            onClick={onClose}
            className="bg-surface-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-slate-100 px-5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95"
          >
            Close Audit Trail
          </button>
        </div>

      </div>
    </div>
  )
}
