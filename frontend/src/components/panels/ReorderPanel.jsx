import { useState, useEffect, useCallback } from 'react'
import { getReorderSuggestions, getSmartReorderPredictions } from '../../services/api'
import GlassCard from '../ui/GlassCard'
import AnimatedCounter from '../ui/AnimatedCounter'
import Badge from '../ui/Badge'
import Spinner from '../ui/Spinner'

export default function ReorderPanel() {
  const [suggestions, setSuggestions] = useState([])
  const [predictions, setPredictions] = useState([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(true)
  const [loadingPredictions, setLoadingPredictions] = useState(true)
  const [errorSuggestions, setErrorSuggestions] = useState(null)
  const [errorPredictions, setErrorPredictions] = useState(null)

  const loadSuggestions = useCallback(async () => {
    setLoadingSuggestions(true)
    setErrorSuggestions(null)
    try {
      const data = await getReorderSuggestions()
      setSuggestions(data || [])
    } catch (err) {
      console.error('Failed to load reorder suggestions:', err)
      setErrorSuggestions(err.message || 'Failed to fetch suggestions.')
    } finally {
      setLoadingSuggestions(false)
    }
  }, [])

  const loadPredictions = useCallback(async () => {
    setLoadingPredictions(true)
    setErrorPredictions(null)
    try {
      const data = await getSmartReorderPredictions()
      setPredictions(data || [])
    } catch (err) {
      console.error('Failed to load smart predictions:', err)
      setErrorPredictions(err.message || 'Failed to fetch predictions.')
    } finally {
      setLoadingPredictions(false)
    }
  }, [])

  useEffect(() => {
    loadSuggestions()
    loadPredictions()
  }, [loadSuggestions, loadPredictions])

  const getStatusBadge = (status) => {
    switch (status) {
      case 'urgent':
        return 'danger'
      case 'upcoming':
        return 'warning'
      case 'safe':
        return 'success'
      default:
        return 'neutral'
    }
  }

  const getStatusLabel = (status) => {
    switch (status) {
      case 'urgent':
        return '🚨 Urgent (<7d)'
      case 'upcoming':
        return '⚠️ Upcoming (<14d)'
      case 'safe':
        return '✓ Safe (>=14d)'
      default:
        return '❔ Low Volume'
    }
  }

  return (
    <div className="panel-enter flex flex-col gap-6">
      
      <div className="panel-header">
        <div>
          <h2 className="panel-title flex items-center gap-2">
            <span>🚨</span> Reorder queue Suggestions
          </h2>
          <p className="panel-subtitle">Review calculated rule suggestions and velocity predictions</p>
        </div>
      </div>

      {/* Main Grid: Rule Suggestions Left (4 cols), Smart Velocity Predictions Right (8 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* Left Side: Rule recommendations */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <GlassCard className="p-5 flex flex-col justify-between flex-grow">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pb-2 border-b border-slate-800 mb-3">
                Urgent low-stock Recommendations
              </h3>

              <div className="overflow-y-auto max-h-[50vh] pr-1 flex flex-col gap-3">
                {loadingSuggestions ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-500 text-xs font-semibold animate-pulse">
                    <Spinner size="sm" />
                    <span>Loading stock alerts…</span>
                  </div>
                ) : errorSuggestions ? (
                  <div className="alert alert-danger py-2 text-xs leading-normal">
                    <span>⚠️</span>
                    <span>{errorSuggestions}</span>
                  </div>
                ) : suggestions.length > 0 ? (
                  suggestions.map((item) => (
                    <div
                      key={item.medicine_id}
                      className="bg-surface-950/40 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-2"
                    >
                      <div>
                        <strong className="text-xs text-slate-200 block truncate">{item.name}</strong>
                        <span className="text-[9px] text-slate-500 font-semibold block mt-0.5 truncate">
                          {item.strength || '—'} · {item.manufacturer || '—'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 border-t border-slate-800/40 pt-2 text-[10px] font-medium font-mono">
                        <div className="text-slate-400">
                          Stock: <span className="text-rose-400 font-bold">{item.quantity}</span>
                          <span className="text-slate-650 mx-1">/</span>
                          Limit: <span>{item.reorder_threshold}</span>
                        </div>

                        <Badge variant="danger" className="text-[9px] px-2 py-0.5">
                          Order +{item.suggested_reorder_quantity}
                        </Badge>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl text-slate-550 text-xs font-semibold">
                    🛡️ All inventory stock is safe
                  </div>
                )}
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Right Side: Smart Velocity predictions */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <GlassCard className="p-5 flex flex-col justify-between flex-grow">
            <div>
              <div className="flex justify-between items-center pb-2 border-b border-slate-800 mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  🔮 AI Sales Velocity Forecasting
                </h3>
                
                <div className="flex gap-2.5 text-[8px] font-bold text-slate-550 uppercase font-mono">
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Urgent</span>
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Upcoming</span>
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Safe</span>
                </div>
              </div>

              <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
                {loadingPredictions ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-500 text-xs font-semibold animate-pulse">
                    <Spinner size="sm" />
                    <span>Calculating forecasting indices…</span>
                  </div>
                ) : errorPredictions ? (
                  <div className="alert alert-danger py-2 text-xs leading-normal">
                    <span>⚠️</span>
                    <span>{errorPredictions}</span>
                  </div>
                ) : predictions.length > 0 ? (
                  <table className="mv-table text-xs">
                    <thead>
                      <tr>
                        <th>Medicine</th>
                        <th>Current Stock</th>
                        <th>Daily Velocity</th>
                        <th>Days to Stock-Out</th>
                        <th>Suggestion</th>
                        <th className="text-right">Urgency</th>
                      </tr>
                    </thead>
                    <tbody>
                      {predictions.map((item) => (
                        <tr key={item.medicine_id} className="hover:bg-surface-900/40">
                          <td className="font-bold text-slate-200 truncate max-w-[150px]">
                            {item.name}
                            <span className="text-[9px] text-slate-550 font-normal font-sans block mt-0.5">
                              {item.strength || '—'} · {item.manufacturer || '—'}
                            </span>
                          </td>
                          <td className="font-mono">
                            {item.quantity} <span className="text-slate-550 text-[10px] font-normal">(Limit: {item.reorder_threshold})</span>
                          </td>
                          <td className="font-mono">
                            {item.daily_sales_velocity !== null 
                              ? `${item.daily_sales_velocity.toFixed(2)}/day` 
                              : <span className="text-slate-550 italic text-[10px]">Low Sales</span>
                            }
                          </td>
                          <td className="font-mono font-semibold">
                            {item.estimated_days_until_stockout !== null ? (
                              item.estimated_days_until_stockout > 999 ? (
                                <span className="text-emerald-400">&infin; days</span>
                              ) : (
                                <span className={
                                  item.estimated_days_until_stockout < 7 ? 'text-rose-400 font-bold' : item.estimated_days_until_stockout < 14 ? 'text-amber-400' : 'text-slate-350'
                                }>
                                  {item.estimated_days_until_stockout.toFixed(1)} days
                                </span>
                              )
                            ) : (
                              <span className="text-slate-550">N/A</span>
                            )}
                          </td>
                          <td>
                            {item.suggested_reorder_quantity > 0 ? (
                              <Badge variant="cyan" className="font-mono text-[9px] px-1.5 py-0.5">
                                +{item.suggested_reorder_quantity}
                              </Badge>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="text-right">
                            <Badge variant={getStatusBadge(item.status)} className="text-[9px] font-bold">
                              {getStatusLabel(item.status)}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="py-10 text-center border border-dashed border-slate-800 rounded-xl text-slate-500 text-xs font-semibold">
                    📭 No predictions compiled
                  </div>
                )}
              </div>
            </div>
          </GlassCard>
        </div>

      </div>

    </div>
  )
}
