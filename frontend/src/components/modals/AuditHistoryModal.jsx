import { useState, useEffect } from 'react'
import { getMedicineHistory } from '../../services/api'
import Modal from '../ui/Modal'
import Spinner from '../ui/Spinner'
import Badge from '../ui/Badge'

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

  const getActionConfig = (action, actorName) => {
    const actor = actorName || 'System Process'
    switch (action) {
      case 'created':
        return {
          title: 'Inventory Line Created',
          subtitle: `Initiated by ${actor}`,
          icon: '✨',
          variant: 'success'
        }
      case 'quantity_updated':
        return {
          title: 'Stock Level Adjusted',
          subtitle: `Updated by ${actor}`,
          icon: '📈',
          variant: 'accent'
        }
      case 'ai_corrected':
        return {
          title: 'Value Correction Confirmed',
          subtitle: `Verified by ${actor}`,
          icon: '✍️',
          variant: 'warning'
        }
      default:
        return {
          title: action.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()),
          subtitle: `Modified by ${actor}`,
          icon: '📝',
          variant: 'neutral'
        }
    }
  }

  const renderDetails = (log) => {
    if (log.action === 'created') {
      try {
        const payload = JSON.parse(log.new_value)
        return (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-slate-400 bg-surface-950/40 p-3.5 rounded-xl border border-slate-800/60 font-medium font-mono mt-2">
            <div className="truncate">Name: <span className="text-slate-200 font-sans font-semibold">{payload.name}</span></div>
            <div className="truncate">Batch: <span className="text-slate-200">{payload.batch_number || '—'}</span></div>
            <div className="truncate">Qty: <span className="text-slate-200">{payload.quantity}</span></div>
            <div className="truncate">MRP: <span className="text-slate-200">₹{payload.mrp || '—'}</span></div>
          </div>
        )
      } catch {
        return <div className="text-xs text-slate-500 mt-2 font-mono break-all bg-surface-950/40 p-3.5 rounded-xl border border-slate-800/60">{log.new_value}</div>
      }
    }

    if (log.action === 'quantity_updated') {
      return (
        <div className="flex items-center gap-2 text-xs text-slate-400 bg-surface-950/40 p-3.5 rounded-xl border border-slate-800/60 font-medium font-mono mt-2 w-fit">
          <span>Qty Level:</span>
          <span className="text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 font-bold">{log.old_value}</span>
          <span className="text-slate-600">➔</span>
          <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-bold">{log.new_value}</span>
        </div>
      )
    }

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
          <div className="flex flex-col gap-2 bg-surface-950/40 p-3.5 rounded-xl border border-slate-800/60 mt-2 font-mono">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Corrected Field: {fieldLabel}</span>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
              <span className="text-slate-500 w-16">AI Output:</span>
              <span className="text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">"{oldDisplay}"</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
              <span className="text-slate-500 w-16">User Val:</span>
              <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">"{newDisplay}"</span>
            </div>
          </div>
        )
      }
    }

    return (
      <div className="flex flex-col gap-2 mt-2 bg-surface-950/40 p-3.5 rounded-xl border border-slate-800/60 text-xs text-slate-400 font-mono">
        {log.old_value && <div className="truncate">Old: {log.old_value}</div>}
        {log.new_value && <div className="truncate">New: {log.new_value}</div>}
      </div>
    )
  }

  return (
    <Modal
      isOpen={!!medicine}
      onClose={onClose}
      title={`Traceability History Ledger`}
      maxWidth="max-w-2xl"
    >
      <div className="flex flex-col gap-4">
        {/* Medicine summary info */}
        <div className="flex items-center justify-between bg-surface-900 border border-slate-800/80 p-4 rounded-xl">
          <div>
            <h4 className="font-bold text-slate-100 text-sm">{medicine?.name}</h4>
            <p className="text-[10px] text-slate-500 font-semibold mt-0.5 uppercase tracking-wider font-mono">
              Batch: {medicine?.batch_number || 'N/A'} · Current Stock: {medicine?.quantity} units
            </p>
          </div>
        </div>

        {/* Timeline body */}
        <div className="max-h-[50vh] overflow-y-auto pr-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Spinner size="md" />
              <span className="text-xs text-slate-500 font-semibold animate-pulse">Loading history logs…</span>
            </div>
          ) : error ? (
            <div className="alert alert-danger py-3 text-xs leading-normal">
              <span>⚠</span>
              <span>{error}</span>
            </div>
          ) : logs.length > 0 ? (
            <div className="relative border-l border-slate-800 ml-4 py-2 flex flex-col gap-6">
              {logs.map((log) => {
                const config = getActionConfig(log.action, log.changed_by)
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
                    {/* timeline marker */}
                    <div className="absolute -left-[4.5px] top-2 w-2.5 h-2.5 rounded-full bg-slate-800 border-2 border-surface-900 group-hover:bg-primary-500 group-hover:scale-125 transition-all duration-300" />
                    
                    {/* log card details */}
                    <div className="bg-surface-900/40 border border-slate-800/80 rounded-xl p-4 transition duration-200 hover:border-slate-700 hover:bg-surface-900/60">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm select-none">{config.icon}</span>
                          <span className="font-bold text-slate-200 text-xs tracking-tight">{config.title}</span>
                          <Badge variant={config.variant}>
                            {log.action}
                          </Badge>
                        </div>
                        <span className="text-[9px] font-bold font-mono text-slate-550 bg-surface-950 px-2 py-0.5 rounded border border-slate-800/40">
                          {timestamp}
                        </span>
                      </div>
                      
                      <p className="text-slate-400 text-xs font-semibold pb-2 border-b border-slate-800/40">
                        {config.subtitle}
                      </p>

                      {renderDetails(log)}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl text-slate-500">
              <span className="text-3xl block mb-2">📜</span>
              <p className="font-semibold text-slate-400 text-xs">No modifications logged yet</p>
            </div>
          )}
        </div>

        {/* Modal controls */}
        <div className="flex justify-end pt-3 border-t border-slate-800/50 mt-2">
          <button onClick={onClose} className="btn-ghost">
            Close audit trail
          </button>
        </div>
      </div>
    </Modal>
  )
}
