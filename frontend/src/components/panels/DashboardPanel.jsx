import { useEffect, useState } from 'react'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { getExpirySummary, getInventory, getReorderSuggestions, getSalesHistory } from '../../services/api'
import GlassCard from '../ui/GlassCard'
import AnimatedCounter from '../ui/AnimatedCounter'
import Badge from '../ui/Badge'
import Spinner from '../ui/Spinner'

export default function DashboardPanel() {
  const { navigateTo, userEmail, userRole } = useWorkspace()
  
  const [loading, setLoading] = useState(true)
  const [expirySummary, setExpirySummary] = useState({ red: 0, amber: 0, green: 0 })
  const [totalItems, setTotalItems] = useState(0)
  const [reorders, setReorders] = useState([])
  const [salesSummary, setSalesSummary] = useState({ count: 0, totalAmount: 0 })

  useEffect(() => {
    async function loadDashboardData() {
      setLoading(true)
      try {
        const expiryData = await getExpirySummary()
        setExpirySummary(expiryData || { red: 0, amber: 0, green: 0 })

        const invData = await getInventory({ limit: 1 })
        setTotalItems(invData.total || 0)

        const reorderData = await getReorderSuggestions()
        setReorders(reorderData ? reorderData.slice(0, 4) : [])

        const today = new Date().toISOString().split('T')[0]
        const salesData = await getSalesHistory({ start_date: today })
        
        let sum = 0
        if (salesData) {
          salesData.forEach((s) => {
            sum += parseFloat(s.total_amount) || 0
          })
        }
        setSalesSummary({
          count: salesData ? salesData.length : 0,
          totalAmount: sum
        })
      } catch (err) {
        console.error('Error loading dashboard data:', err)
      } finally {
        setLoading(false)
      }
    }

    loadDashboardData()
  }, [])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Spinner size="lg" className="border-t-primary" />
        <span className="text-xs text-slate-500 font-bold animate-pulse font-mono">
          LOADING MISSION CONTROL CORE...
        </span>
      </div>
    )
  }

  const totalStockCount = expirySummary.red + expirySummary.amber + expirySummary.green
  const criticalPercent = totalStockCount > 0 ? Math.round((expirySummary.red / totalStockCount) * 100) : 0
  const warningPercent = totalStockCount > 0 ? Math.round((expirySummary.amber / totalStockCount) * 100) : 0
  const safePercent = totalStockCount > 0 ? Math.round((expirySummary.green / totalStockCount) * 100) : 0

  // Pharmacy Health Score calculation logic
  const healthScore = totalStockCount > 0 
    ? Math.max(0, 100 - (expirySummary.red * 5) - (expirySummary.amber * 2) - (reorders.length * 3))
    : 100

  // SVG dimensions for circular gauge
  const radius = 40
  const circumference = 2 * Math.PI * radius
  const strokeOffset = circumference - (healthScore / 100) * circumference

  return (
    <div className="panel-enter flex flex-col gap-6 font-sans">
      
      {/* Welcome strip banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-black text-gradient tracking-tight leading-none">
            Welcome back, {userEmail ? userEmail.split('@')[0] : 'Operator'}
          </h1>
          <p className="panel-subtitle">Pharmacy operational yield status, warning lists, and P&amp;L records.</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="cyan" className="font-mono text-[9px] uppercase tracking-wider">
            {userRole} clearances
          </Badge>
          <Badge variant="neutral" className="font-mono text-[9px] uppercase tracking-wider">
            {new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
          </Badge>
        </div>
      </div>

      {/* Primary KPI widgets and Health Gauge Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* Live Counters column (8 cols) */}
        <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <GlassCard className="p-5 flex flex-col justify-between">
            <div className="flex flex-col gap-1">
              <span className="kpi-label">Active Stock Catalog</span>
              <span className="kpi-value text-slate-100">
                <AnimatedCounter value={totalItems} />
              </span>
            </div>
            <span className="text-[10px] text-slate-500 font-semibold block mt-4 border-t border-slate-900 pt-2">
              Unique medicines tracked in catalog database
            </span>
          </GlassCard>

          <GlassCard className="p-5 flex flex-col justify-between border-rose-500/20 bg-rose-950/5">
            <div className="flex flex-col gap-1">
              <span className="kpi-label text-rose-450">Critical Expirations</span>
              <span className="kpi-value text-rose-400">
                <AnimatedCounter value={expirySummary.red} />
              </span>
            </div>
            <span className="text-[10px] text-rose-500/70 font-semibold block mt-4 border-t border-rose-900 pt-2">
              Requires write-off or return in ≤ 30 days
            </span>
          </GlassCard>

          <GlassCard className="p-5 flex flex-col justify-between border-amber-500/20 bg-amber-950/5">
            <div className="flex flex-col gap-1">
              <span className="kpi-label text-amber-450">Warning Expiries</span>
              <span className="kpi-value text-amber-400">
                <AnimatedCounter value={expirySummary.amber} />
              </span>
            </div>
            <span className="text-[10px] text-amber-500/70 font-semibold block mt-4 border-t border-slate-900 pt-2">
              Expiring in 31–90 days threshold range
            </span>
          </GlassCard>

          <GlassCard className="p-5 flex flex-col justify-between border-emerald-500/20 bg-emerald-950/5">
            <div className="flex flex-col gap-1">
              <span className="kpi-label text-emerald-400">Today's POS Billings</span>
              <span className="kpi-value text-emerald-400">
                <AnimatedCounter value={salesSummary.totalAmount} prefix="₹" decimals={2} />
              </span>
            </div>
            <span className="text-[10px] text-emerald-500/70 font-semibold block mt-4 border-t border-slate-900 pt-2">
              Calculated from {salesSummary.count} invoices submitted
            </span>
          </GlassCard>
        </div>

        {/* Circular Pharmacy Health Gauge column (4 cols) */}
        <div className="lg:col-span-4">
          <GlassCard className="p-5 flex flex-col items-center justify-center text-center gap-4 h-full relative overflow-hidden">
            <div className="relative w-28 h-28 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90">
                {/* background track line */}
                <circle 
                  cx="56" cy="56" r={radius} 
                  fill="transparent" 
                  stroke="var(--border)" 
                  strokeWidth="8" 
                />
                {/* value stroke line */}
                <circle 
                  cx="56" cy="56" r={radius} 
                  fill="transparent" 
                  stroke="url(#healthGrad)" 
                  strokeWidth="8"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeOffset}
                  strokeLinecap="round"
                />
                
                {/* SVG gradient details */}
                <defs>
                  <linearGradient id="healthGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" />
                    <stop offset="100%" stopColor="var(--accent)" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center font-mono select-none">
                <span className="text-2xl font-black text-white">{healthScore}%</span>
                <span className="text-[8px] uppercase tracking-widest text-slate-500 font-bold font-sans">Health OS</span>
              </div>
            </div>

            <div>
              <strong className="text-xs font-bold text-slate-200 block">Pharmacy Health Index</strong>
              <p className="text-[10px] text-slate-500 leading-relaxed font-semibold mt-1">
                Weighted calculation based on critical expirations and reorder suggestions queue gaps.
              </p>
            </div>
          </GlassCard>
        </div>

      </div>

      {/* Main split grid: Expiry allocations and Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* Left Side: Expiry visualizer and actions list (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <GlassCard className="p-5 flex flex-col gap-6 justify-between flex-1">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pb-2 border-b border-border">
                Expiry Inventory Distribution
              </h3>

              {/* Progress bars allocations */}
              <div className="flex flex-col gap-3.5 mt-5">
                {[
                  { label: '≤ 30 Days (Critical)', count: expirySummary.red, percent: criticalPercent, color: '#ef4444' },
                  { label: '31–90 Days (Warning)', count: expirySummary.amber, percent: warningPercent, color: '#f59e0b' },
                  { label: 'Safe Expiry (> 90 Days)', count: expirySummary.green, percent: safePercent, color: '#10b981' }
                ].map((item, idx) => (
                  <div key={idx} className="flex flex-col gap-1.5 font-mono text-xs">
                    <div className="flex justify-between items-center text-slate-350">
                      <span className="font-sans font-bold text-xs">{item.label}</span>
                      <div className="flex gap-2">
                        <span className="text-slate-200 font-bold">{item.count} units</span>
                        <span className="text-slate-500">({item.percent}%)</span>
                      </div>
                    </div>
                    {/* progress line */}
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${item.percent}%`, backgroundColor: item.color, boxShadow: `0 0 8px ${item.color}80` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 border-t border-slate-900 pt-4 mt-2">
              <button 
                onClick={() => navigateTo('intake')}
                className="btn-ghost flex flex-col items-center p-4 rounded-xl gap-2 hover:bg-primary-glow hover:border-primary/30 text-center w-full"
              >
                <span className="text-lg">📸</span>
                <span className="text-[10px] font-bold uppercase text-slate-300">Intake OCR</span>
              </button>
              <button 
                onClick={() => navigateTo('qr-lookup')}
                className="btn-ghost flex flex-col items-center p-4 rounded-xl gap-2 hover:bg-cyan-500/10 hover:border-cyan-500/30 text-center w-full"
              >
                <span className="text-lg">🔍</span>
                <span className="text-[10px] font-bold uppercase text-slate-300">QR Scanner</span>
              </button>
              <button 
                onClick={() => navigateTo('billing')}
                className="btn-ghost flex flex-col items-center p-4 rounded-xl gap-2 hover:bg-emerald-500/10 hover:border-emerald-500/30 text-center w-full"
              >
                <span className="text-lg">💳</span>
                <span className="text-[10px] font-bold uppercase text-slate-300">POS Billing</span>
              </button>
            </div>
          </GlassCard>
        </div>

        {/* Right Side: Reorder suggestion logs lists (5 cols) */}
        <div className="lg:col-span-5">
          <GlassCard className="p-5 flex flex-col justify-between h-full min-h-[300px]">
            <div>
              <div className="flex justify-between items-center pb-2 border-b border-border">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Low Stock Reorders Alert
                </h3>
                <button 
                  onClick={() => navigateTo('reorder')}
                  className="text-[9px] font-bold text-primary hover:underline bg-transparent border-none cursor-pointer uppercase font-mono"
                >
                  View Queue ➔
                </button>
              </div>

              <div className="flex flex-col gap-2.5 mt-4">
                {reorders.length > 0 ? (
                  reorders.map((item) => (
                    <div 
                      key={item.id}
                      className="p-3 bg-surface-900/30 border border-slate-900 rounded-xl flex items-center justify-between hover:border-slate-800 transition"
                    >
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <strong className="text-xs text-slate-200 truncate">{item.name}</strong>
                        <span className="text-[9px] text-slate-500 font-semibold block font-mono">
                          Stock: {item.quantity} · Reorder Limit: {item.reorder_threshold}
                        </span>
                      </div>
                      <Badge variant="danger" className="text-[8px] font-mono font-bold uppercase">
                        Order +{item.suggested_reorder_quantity}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl text-slate-500">
                    <span className="text-2xl block mb-1">🛡️</span>
                    <p className="font-semibold text-slate-400 text-xs">All inventory lines safe</p>
                  </div>
                )}
              </div>
            </div>

            <button 
              onClick={() => navigateTo('suppliers')}
              className="btn-ghost w-full mt-6 py-2 text-xs font-bold uppercase tracking-wider bg-surface-950/20"
            >
              🤝 Select wholesale suppliers
            </button>
          </GlassCard>
        </div>

      </div>

    </div>
  )
}
