import { useState, useEffect, useCallback } from 'react'
import { getSmartReorderPredictions } from '../services/api'

export default function SmartReorderPrediction({ refreshCounter }) {
  const [predictions, setPredictions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadPredictions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getSmartReorderPredictions()
      setPredictions(data || [])
    } catch (err) {
      console.error('Failed to load smart predictions:', err)
      setError(err.message || 'Failed to fetch predictions.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPredictions()
  }, [refreshCounter, loadPredictions])

  // Get status class styling
  const getStatusBadge = (status) => {
    switch (status) {
      case 'urgent':
        return 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
      case 'upcoming':
        return 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
      case 'safe':
        return 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
      case 'insufficient_history':
      default:
        return 'bg-slate-700/20 border border-slate-700/30 text-slate-400'
    }
  }

  const getStatusLabel = (status) => {
    switch (status) {
      case 'urgent':
        return '🚨 Urgent (<7 days)'
      case 'upcoming':
        return '⚠️ Upcoming (<14 days)'
      case 'safe':
        return '✓ Safe (>=14 days)'
      case 'insufficient_history':
      default:
        return '❔ Low Sales Volume'
    }
  }

  return (
    <div className="border border-slate-800/80 bg-surface-800/40 backdrop-blur-md rounded-3xl p-6 shadow-xl flex flex-col gap-4 animate-fade-in">
      
      {/* Panel Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <span>🔮</span> Smart Reorder Prediction
          </h3>
        </div>
        
        {/* Info Legend */}
        <div className="flex items-center gap-3 text-[10px] text-slate-500 font-bold bg-surface-900 px-3.5 py-1.5 rounded-xl border border-slate-800/60">
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Urgent
          </div>
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Upcoming
          </div>
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Safe
          </div>
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500" /> Low Volume
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="text-center py-12 text-slate-500 text-xs">
            <div className="relative w-7 h-7 mx-auto mb-2">
              <div className="absolute inset-0 rounded-full border-2 border-primary-500/20" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary-500 animate-spin" />
            </div>
            <span className="animate-pulse">Loading smart recommendations…</span>
          </div>
        ) : error ? (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-xs text-center">
            ⚠️ {error}
          </div>
        ) : predictions.length > 0 ? (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-3">Medicine Name</th>
                <th className="py-3 px-3">Current Stock</th>
                <th className="py-3 px-3">Daily Velocity</th>
                <th className="py-3 px-3">Days to Stock-Out</th>
                <th className="py-3 px-3">Reorder Suggestion</th>
                <th className="py-3 px-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {predictions.map((item) => (
                <tr key={item.medicine_id} className="border-b border-slate-800/40 hover:bg-surface-900/40 text-slate-300 font-medium transition duration-200">
                  
                  {/* Name and description */}
                  <td className="py-3 px-3 font-semibold text-slate-200">
                    <div>{item.name}</div>
                    <div className="text-[9px] text-slate-500 mt-0.5">
                      {item.strength || '—'} · {item.manufacturer || '—'}
                    </div>
                  </td>
                  
                  {/* Current Stock */}
                  <td className="py-3 px-3 font-mono font-bold">
                    {item.quantity}
                    <span className="text-[9px] text-slate-500 font-normal ml-1">(Limit: {item.reorder_threshold})</span>
                  </td>

                  {/* Daily Velocity */}
                  <td className="py-3 px-3 font-mono">
                    {item.daily_sales_velocity !== null 
                      ? `${item.daily_sales_velocity.toFixed(2)} units/day` 
                      : <span className="text-slate-500 italic text-[10px]">Low volume</span>
                    }
                  </td>

                  {/* Days until stock-out */}
                  <td className="py-3 px-3 font-mono font-semibold">
                    {item.estimated_days_until_stockout !== null ? (
                      item.estimated_days_until_stockout > 999 ? (
                        <span className="text-emerald-400">&infin; days</span>
                      ) : (
                        <span className={item.estimated_days_until_stockout < 7 ? 'text-rose-400 font-bold' : item.estimated_days_until_stockout < 14 ? 'text-amber-400' : 'text-slate-300'}>
                          {item.estimated_days_until_stockout.toFixed(1)} days
                        </span>
                      )
                    ) : (
                      <span className="text-slate-500 italic text-[10px]">N/A</span>
                    )}
                  </td>

                  {/* Suggested reorder qty */}
                  <td className="py-3 px-3">
                    {item.suggested_reorder_quantity > 0 ? (
                      <div className="flex items-center gap-1.5">
                        <span className="bg-primary-500/10 border border-primary-500/20 text-primary-400 px-2 py-0.5 rounded-lg font-bold font-mono text-[10px]">
                          +{item.suggested_reorder_quantity}
                        </span>
                        <span className="text-[8px] text-slate-500 uppercase tracking-wide font-bold">
                          {item.status === 'insufficient_history' ? 'Fallback' : '2wk supply'}
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-500 font-bold font-mono">—</span>
                    )}
                  </td>

                  {/* Status Badge */}
                  <td className="py-3 px-3 text-right">
                    <span className={`px-2 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider ${getStatusBadge(item.status)}`}>
                      {getStatusLabel(item.status)}
                    </span>
                  </td>

                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="py-12 text-center text-slate-500 border border-dashed border-slate-800 rounded-2xl bg-surface-900/20">
            📭 No medicines found in inventory.
          </div>
        )}
      </div>
    </div>
  )
}
