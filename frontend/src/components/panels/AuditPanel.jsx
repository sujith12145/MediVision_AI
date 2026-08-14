import { useState } from 'react'
import { searchMedicines, getMedicineHistory } from '../../services/api'
import GlassCard from '../ui/GlassCard'
import Spinner from '../ui/Spinner'
import Badge from '../ui/Badge'

export default function AuditPanel() {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [selectedMedicine, setSelectedMedicine] = useState(null)
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(null)

  const handleSearchSubmit = async (e) => {
    e.preventDefault()
    if (!searchQuery.trim()) return
    setSearching(true)
    setError(null)
    setSelectedMedicine(null)
    setLogs([])

    try {
      const data = await searchMedicines(searchQuery.trim())
      setSearchResults(data || [])
      if (data.length === 0) {
        setError(`No catalog items matched: "${searchQuery}"`)
      }
    } catch (err) {
      console.error('Audit search failed:', err)
      setError('Failed to query medicine list.')
    } finally {
      setSearching(false)
    }
  }

  const handleSelectMedicine = async (med) => {
    setSelectedMedicine(med)
    setSearchResults([])
    setSearchQuery(med.name)
    setLoading(true)
    setError(null)

    try {
      const data = await getMedicineHistory(med.id)
      setLogs(data || [])
    } catch (err) {
      console.error('Audit history fetch error:', err)
      setError('Could not retrieve audit history ledger.')
    } finally {
      setLoading(false)
    }
  }

  const getActionConfig = (action, actorName) => {
    const actor = actorName || 'System Process'
    switch (action) {
      case 'created':
        return { title: 'Created', icon: '✨', variant: 'success' }
      case 'quantity_updated':
        return { title: 'Quantity Adjusted', icon: '📈', variant: 'accent' }
      case 'ai_corrected':
        return { title: 'AI Field Corrected', icon: '✍️', variant: 'warning' }
      default:
        return { title: action.replace('_', ' '), icon: '📝', variant: 'neutral' }
    }
  }

  return (
    <div className="panel-enter flex flex-col gap-6">
      
      {/* Header */}
      <div className="panel-header">
        <div>
          <h2 className="panel-title flex items-center gap-2">
            <span>🛡️</span> Security &amp; Audit Traceability
          </h2>
          <p className="panel-subtitle">Trace modification trails, database value edits, and cashier logs</p>
        </div>
      </div>

      {/* Grid split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* Search controller panel (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <GlassCard className="p-5 flex flex-col gap-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pb-2 border-b border-border">
              Traceability Search
            </h3>

            <form onSubmit={handleSearchSubmit} className="flex gap-2">
              <input 
                type="text" 
                placeholder="Search catalog item..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-base text-xs font-semibold"
              />
              <button type="submit" className="btn-ghost py-1.5 px-3">
                {searching ? '...' : 'Find'}
              </button>
            </form>

            {/* Results listing */}
            {searchResults.length > 0 && (
              <div className="border border-slate-900 bg-surface-950/40 rounded-xl max-h-[300px] overflow-y-auto p-1.5 flex flex-col gap-1 shadow-lg">
                {searchResults.map((med) => (
                  <button
                    key={med.id}
                    onClick={() => handleSelectMedicine(med)}
                    className="w-full text-left p-2 rounded-lg hover:bg-surface-900 text-xs font-semibold transition flex justify-between items-center"
                  >
                    <div>
                      <span className="text-slate-200 block truncate">{med.name}</span>
                      <span className="text-[9px] text-slate-550 block font-normal mt-0.5">Batch: {med.batch_number || 'N/A'}</span>
                    </div>
                    <span className="text-primary text-[8px] uppercase">Select ➔</span>
                  </button>
                ))}
              </div>
            )}
          </GlassCard>
        </div>

        {/* Audit timelines details (8 cols) */}
        <div className="lg:col-span-8">
          <GlassCard className="p-5 flex flex-col justify-between h-full min-h-[400px]">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pb-2 border-b border-border mb-4">
                Traceability Audit Timeline
              </h3>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-24 gap-2">
                  <Spinner size="md" />
                  <span className="text-xs text-slate-500 font-semibold animate-pulse">Loading history logs…</span>
                </div>
              ) : error ? (
                <div className="alert alert-danger py-3 text-xs leading-normal">
                  <span>⚠</span>
                  <span>{error}</span>
                </div>
              ) : selectedMedicine ? (
                <div className="flex flex-col gap-4">
                  {/* Summary widget */}
                  <div className="p-3.5 bg-surface-950/50 border border-slate-850 rounded-xl">
                    <strong className="text-xs text-slate-200 block">{selectedMedicine.name}</strong>
                    <span className="text-[9px] font-mono text-slate-500 font-bold block mt-0.5 uppercase tracking-wider">
                      Batch: {selectedMedicine.batch_number || 'N/A'} · Current Stock: {selectedMedicine.quantity} units
                    </span>
                  </div>

                  {/* Logs lists */}
                  <div className="overflow-y-auto max-h-[50vh] pr-1 flex flex-col gap-4 relative border-l border-slate-800 ml-2 pt-2 pb-2">
                    {logs.length > 0 ? (
                      logs.map((log) => {
                        const config = getActionConfig(log.action, log.changed_by)
                        return (
                          <div key={log.id} className="relative pl-6 group">
                            {/* timeline node */}
                            <div className="absolute -left-[4.5px] top-1.5 w-2.5 h-2.5 rounded-full bg-slate-800 border-2 border-surface-950 group-hover:bg-primary transition" />
                            
                            <div className="bg-surface-900/10 border border-slate-900 hover:border-slate-800 hover:bg-surface-900/30 p-3.5 rounded-xl flex flex-col gap-2">
                              <div className="flex justify-between items-center text-[10px]">
                                <span className="font-bold text-slate-250 flex items-center gap-1.5">
                                  <span>{config.icon}</span> {config.title}
                                </span>
                                <span className="text-slate-500 font-mono">{new Date(log.timestamp).toLocaleString()}</span>
                              </div>
                              
                              <p className="text-[10px] text-slate-450 font-bold">
                                Modified by: {log.changed_by || 'System Process'}
                              </p>

                              {/* diff parameters */}
                              <div className="bg-surface-950/50 p-2.5 rounded-lg border border-slate-900 font-mono text-[9px] text-slate-400 mt-1">
                                {log.old_value && <div className="truncate text-rose-400/90">- Old: {log.old_value}</div>}
                                {log.new_value && <div className="truncate text-emerald-400/90">+ New: {log.new_value}</div>}
                              </div>
                            </div>
                          </div>
                        )
                      })
                    ) : (
                      <div className="py-10 text-center text-slate-650 text-xs">No records committed.</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-24 border border-dashed border-slate-800 rounded-xl text-slate-500 max-w-xs mx-auto mt-6">
                  <span className="text-2xl block mb-2">📜🛡️</span>
                  <p className="font-semibold text-slate-400 text-xs">Ready for audit traces</p>
                  <p className="text-[10px] text-slate-650 mt-1 leading-relaxed">
                    Search and select a catalog drug on the left console to load its complete history timeline matches.
                  </p>
                </div>
              )}
            </div>
          </GlassCard>
        </div>

      </div>

    </div>
  )
}
