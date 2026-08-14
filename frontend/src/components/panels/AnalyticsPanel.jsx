import { useState } from 'react'
import GlassCard from '../ui/GlassCard'
import AnimatedCounter from '../ui/AnimatedCounter'
import Badge from '../ui/Badge'

export default function AnalyticsPanel() {
  const [selectedRange, setSelectedRange] = useState('30d')
  
  // Custom mock data for charts
  const salesTrend = [
    { label: 'Jul 01', sales: 42000, margin: 12600 },
    { label: 'Jul 05', sales: 48000, margin: 14400 },
    { label: 'Jul 10', sales: 52000, margin: 15600 },
    { label: 'Jul 15', sales: 61000, margin: 18300 },
    { label: 'Jul 20', sales: 58000, margin: 17400 },
    { label: 'Jul 25', sales: 65000, margin: 19500 },
    { label: 'Jul 30', sales: 72000, margin: 21600 }
  ]

  const categoryDistribution = [
    { name: 'Antibiotics', percentage: 35, color: '#6366f1', value: '₹2.8L' },
    { name: 'Analgesics', percentage: 25, color: '#06b6d4', value: '₹2.0L' },
    { name: 'Cardiovascular', percentage: 20, color: '#10b981', value: '₹1.6L' },
    { name: 'Nutraceuticals', percentage: 12, color: '#f59e0b', value: '₹96K' },
    { name: 'Others', percentage: 8, color: '#ef4444', value: '₹64K' }
  ]

  // Convert coordinate logic for SVG charts
  const svgWidth = 500
  const svgHeight = 200
  const padding = 35
  const graphWidth = svgWidth - padding * 2
  const graphHeight = svgHeight - padding * 2

  const maxVal = Math.max(...salesTrend.map(d => d.sales)) * 1.1
  const points = salesTrend.map((d, idx) => {
    const x = padding + (idx / (salesTrend.length - 1)) * graphWidth
    const y = svgHeight - padding - (d.sales / maxVal) * graphHeight
    return `${x},${y}`
  }).join(' ')

  const fillPoints = `${padding},${svgHeight - padding} ${points} ${svgWidth - padding},${svgHeight - padding}`

  return (
    <div className="panel-enter flex flex-col gap-6">
      
      {/* Header and filters */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-5">
        <div>
          <h2 className="panel-title flex items-center gap-2">
            <span>📈</span> Executive Analytics Dashboard
          </h2>
          <p className="panel-subtitle">Review real-time revenues, profit margins, category allocations, and demands</p>
        </div>
        <select 
          value={selectedRange} 
          onChange={(e) => setSelectedRange(e.target.value)}
          className="input-base py-1.5 px-3.5 text-xs font-bold w-40"
        >
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days (Default)</option>
          <option value="90d">Last quarter</option>
        </select>
      </div>

      {/* Counter widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <GlassCard className="p-5 flex flex-col gap-1.5">
          <span className="kpi-label">Average Transaction Value</span>
          <span className="text-xl font-extrabold text-slate-100 font-mono">
            <AnimatedCounter value={1420.5} prefix="₹" decimals={2} />
          </span>
          <span className="text-[10px] text-emerald-400 font-bold">▲ +4.2% from last week</span>
        </GlassCard>

        <GlassCard className="p-5 flex flex-col gap-1.5">
          <span className="kpi-label">Estimated Gross Yield</span>
          <span className="text-xl font-extrabold text-slate-100 font-mono">
            <AnimatedCounter value={846300} prefix="₹" decimals={0} />
          </span>
          <span className="text-[10px] text-emerald-400 font-bold">▲ +12% MoM growth</span>
        </GlassCard>

        <GlassCard className="p-5 flex flex-col gap-1.5">
          <span className="kpi-label">Return on Investment (ROI)</span>
          <span className="text-xl font-extrabold text-slate-100 font-mono">
            <AnimatedCounter value={32.8} suffix="%" decimals={1} />
          </span>
          <span className="text-[10px] text-slate-500 font-semibold">Overall inventory margin index</span>
        </GlassCard>

        <GlassCard className="p-5 flex flex-col gap-1.5 border-rose-500/20 bg-rose-950/5">
          <span className="kpi-label text-rose-450">Loss Expiry Projection</span>
          <span className="text-xl font-extrabold text-rose-400 font-mono">
            <AnimatedCounter value={18450} prefix="₹" decimals={0} />
          </span>
          <span className="text-[10px] text-rose-500/80 font-bold">▼ -30% decrease from June write-offs</span>
        </GlassCard>
      </div>

      {/* Custom SVG Charts split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* Sales trend area line chart */}
        <div className="lg:col-span-8">
          <GlassCard className="p-5 flex flex-col justify-between h-full">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pb-2 border-b border-border">
                Revenues &amp; Margin Velocity
              </h3>
              
              <div className="relative mt-6 flex justify-center">
                <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full max-h-56">
                  {/* Grid Lines */}
                  {[0.25, 0.5, 0.75, 1].map((ratio, i) => (
                    <line 
                      key={i} 
                      x1={padding} 
                      y1={svgHeight - padding - ratio * graphHeight} 
                      x2={svgWidth - padding} 
                      y2={svgHeight - padding - ratio * graphHeight} 
                      stroke="var(--border)" 
                      strokeDasharray="4 4"
                    />
                  ))}
                  
                  {/* Area fill */}
                  <polygon points={fillPoints} fill="url(#areaGrad)" opacity="0.12" />

                  {/* Gradient definition */}
                  <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" />
                      <stop offset="100%" stopColor="transparent" />
                    </linearGradient>
                  </defs>

                  {/* Line path */}
                  <polyline points={points} fill="none" stroke="var(--primary)" strokeWidth="3" />

                  {/* X-Axis labels */}
                  {salesTrend.map((d, idx) => {
                    const x = padding + (idx / (salesTrend.length - 1)) * graphWidth
                    return (
                      <text 
                        key={idx} 
                        x={x} 
                        y={svgHeight - 12} 
                        fill="var(--text-dim)" 
                        fontSize="8" 
                        fontFamily="var(--font-mono)" 
                        textAnchor="middle"
                      >
                        {d.label}
                      </text>
                    )
                  })}
                </svg>
              </div>
            </div>

            <div className="flex gap-6 mt-4 border-t border-border pt-4 text-[10px] font-bold text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-primary" /> Daily Billings (Revenue)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-cyan-400" /> Projected Margin
              </span>
            </div>
          </GlassCard>
        </div>

        {/* Category distribution split */}
        <div className="lg:col-span-4">
          <GlassCard className="p-5 flex flex-col justify-between h-full">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pb-2 border-b border-border">
                Category Sales share
              </h3>

              <div className="flex flex-col gap-4 mt-6">
                {categoryDistribution.map((cat, idx) => (
                  <div key={idx} className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center text-xs font-semibold">
                      <span className="text-slate-350">{cat.name}</span>
                      <div className="flex gap-2">
                        <span className="text-slate-200 font-mono font-bold">{cat.value}</span>
                        <span className="text-slate-500">({cat.percentage}%)</span>
                      </div>
                    </div>
                    {/* progress line */}
                    <div className="w-full h-1.5 rounded-full bg-surface-900 border border-slate-800 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${cat.percentage}%`, backgroundColor: cat.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button 
              onClick={() => alert('Transactions ledger export compiled.')}
              className="btn-ghost w-full mt-6 py-2 text-xs font-bold uppercase tracking-wider bg-surface-950/20"
            >
              📥 Export Ledger Spreadsheet
            </button>
          </GlassCard>
        </div>

      </div>

    </div>
  )
}
