import { useState, useEffect, useCallback } from 'react'
import { getReorderSuggestions } from '../services/api'

export default function ReorderSuggestions({ refreshCounter, className = '' }) {
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadSuggestions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getReorderSuggestions()
      setSuggestions(data || [])
    } catch (err) {
      console.error('Failed to load reorder suggestions:', err)
      setError(err.message || 'Failed to fetch suggestions.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSuggestions()
  }, [refreshCounter, loadSuggestions])

  return (
    <div className={`border border-slate-800/80 bg-surface-800/40 backdrop-blur-md rounded-3xl p-6 shadow-xl flex flex-col gap-4 h-full animate-fade-in ${className}`}>
      
      {/* Panel Header */}
      <div>
        <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
          <span>📋</span> Reorder Recommendations
        </h3>
      </div>

      {/* Suggestions List Container */}
      <div className="flex-1 overflow-y-auto pr-1">
        {loading ? (
          <div className="text-center py-10 text-slate-500 text-xs">
            <div className="relative w-6 h-6 mx-auto mb-2">
              <div className="absolute inset-0 rounded-full border-2 border-primary-500/20" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary-500 animate-spin" />
            </div>
            <span className="animate-pulse">Loading stock alerts…</span>
          </div>
        ) : error ? (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3.5 rounded-xl text-xs text-center">
            ⚠️ {error}
          </div>
        ) : suggestions.length > 0 ? (
          <div className="flex flex-col gap-3">
            {suggestions.map((item) => (
              <div
                key={item.medicine_id}
                className="bg-surface-900/50 border border-slate-800/80 hover:border-slate-700/80 rounded-2xl p-3.5 flex flex-col gap-2.5 transition-all duration-300"
              >
                {/* Title & Info */}
                <div>
                  <div className="font-bold text-slate-200 text-xs tracking-tight line-clamp-1">
                    {item.name}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {item.strength || '—'} · {item.manufacturer || '—'}
                  </div>
                </div>

                {/* Stock Level Details & Suggested Alert */}
                <div className="flex items-center justify-between gap-2 border-t border-slate-800/40 pt-2 text-[10px] font-medium">
                  {/* Current stock status */}
                  <div className="text-slate-400">
                    Stock: <strong className="text-rose-400 font-mono">{item.quantity}</strong>
                    <span className="text-slate-600 font-mono mx-1">/</span>
                    Limit: <strong className="text-slate-400 font-mono">{item.reorder_threshold}</strong>
                  </div>

                  {/* Highlight suggested addition amount */}
                  <span className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-2 py-1 rounded-lg font-bold font-mono text-[9px] uppercase tracking-wide">
                    Suggest +{item.suggested_reorder_quantity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-slate-500 border border-dashed border-slate-800/80 rounded-2xl flex flex-col items-center justify-center p-4">
            <span className="text-2xl mb-1.5">🛡️</span>
            <p className="font-bold text-slate-400 text-xs">All Stock Levels Safe</p>
            <p className="text-[10px] text-slate-600 mt-0.5 leading-normal max-w-[160px]">
              No medicines currently fall below reorder thresholds.
            </p>
          </div>
        )}
      </div>

    </div>
  )
}
