import { useState, useEffect, useCallback } from 'react'
import { 
  getFinanceOverview, 
  saveFinanceRecord, 
  getFinanceRecords,
  downloadTransactionsExport
} from '../../services/api'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import GlassCard from '../ui/GlassCard'
import AnimatedCounter from '../ui/AnimatedCounter'
import Badge from '../ui/Badge'
import Spinner from '../ui/Spinner'
import GstConfigModal from '../modals/GstConfigModal'

export default function FinancePanel() {
  const { showToast, userRole } = useWorkspace()

  const [selectedMonth, setSelectedMonth] = useState('')
  const [overview, setOverview] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Input states
  const [inputs, setInputs] = useState({
    rent: '0',
    electricity_and_bills: '0',
    staff_salaries: '0',
    other_expenses: '0',
    other_revenue: '0'
  })

  // Date range export states
  const [exportDates, setExportDates] = useState({ start: '', end: '' })
  
  // GST Modal control states
  const [showGstModal, setShowGstModal] = useState(false)
  const [monthOptions, setMonthOptions] = useState([])

  // Generate last 6 months dropdown options
  useEffect(() => {
    const options = []
    const d = new Date()
    for (let i = 0; i < 6; i++) {
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const label = d.toLocaleString('default', { month: 'long', year: 'numeric' })
      options.push({ value: `${year}-${month}`, label })
      d.setMonth(d.getMonth() - 1)
    }
    setMonthOptions(options)
    setSelectedMonth(options[0].value) // default to current month
  }, [])

  const fetchData = useCallback(async () => {
    if (!selectedMonth) return
    setLoading(true)
    setError(null)
    try {
      const data = await getFinanceOverview(selectedMonth)
      setOverview(data)
      setInputs({
        rent: data.rent.toString(),
        electricity_and_bills: data.electricity_and_bills.toString(),
        staff_salaries: data.staff_salaries.toString(),
        other_expenses: data.other_expenses.toString(),
        other_revenue: data.other_revenue.toString()
      })

      const histData = await getFinanceRecords()
      setHistory(histData.slice(0, 3))
    } catch (err) {
      setError(err.message || 'Failed to load financial records.')
    } finally {
      setLoading(false)
    }
  }, [selectedMonth])

  const updateDefaultDatesForMonth = useCallback((monthStr) => {
    if (!monthStr) return
    const [year, month] = monthStr.split('-').map(Number)
    const firstDay = '01'
    const lastDayVal = new Date(year, month, 0).getDate()
    const lastDay = String(lastDayVal).padStart(2, '0')
    const paddedMonth = String(month).padStart(2, '0')
    setExportDates({
      start: `${year}-${paddedMonth}-${firstDay}`,
      end: `${year}-${paddedMonth}-${lastDay}`
    })
  }, [])

  useEffect(() => {
    if (selectedMonth) {
      fetchData()
      updateDefaultDatesForMonth(selectedMonth)
    }
  }, [selectedMonth, fetchData, updateDefaultDatesForMonth])

  const handleTransactionsDownload = async () => {
    try {
      setError(null)
      const blob = await downloadTransactionsExport({
        start_date: exportDates.start,
        end_date: exportDates.end,
        month: selectedMonth
      })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Transactions_Ledger_${exportDates.start}_to_${exportDates.end}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      showToast('Transactions ledger downloaded successfully!', 'success')
    } catch (err) {
      setError(err.message || 'Failed to download transactions ledger.')
      showToast('Ledger download failed.', 'error')
    }
  }

  const handleInputChange = (field, val) => {
    setInputs((prev) => ({ ...prev, [field]: val }))
  }

  const handleSaveMetrics = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const payload = {
      month: selectedMonth,
      rent: parseFloat(inputs.rent) || 0.0,
      electricity_and_bills: parseFloat(inputs.electricity_and_bills) || 0.0,
      staff_salaries: parseFloat(inputs.staff_salaries) || 0.0,
      other_expenses: parseFloat(inputs.other_expenses) || 0.0,
      other_revenue: parseFloat(inputs.other_revenue) || 0.0
    }

    if (Object.values(payload).some((v) => typeof v === 'number' && v < 0)) {
      setError('Operational inputs must be non-negative values.')
      setSaving(false)
      return
    }

    try {
      await saveFinanceRecord(payload)
      showToast('Monthly operational metrics committed successfully!', 'success')
      fetchData()
    } catch (err) {
      setError(err.message || 'Failed to commit financial records.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="panel-enter flex flex-col gap-6">
      
      {/* Month selection header */}
      <div className="border border-slate-800/80 bg-surface-900/60 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="panel-title flex items-center gap-2">
            <span>📊</span> Finance &amp; P&amp;L Overview
          </h2>
          <p className="panel-subtitle">Review computed billing yields, GST references, and manually set fixed expenditures</p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Select Month:</label>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="input-base py-1.5 px-3.5 text-xs font-bold"
          >
            {monthOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger py-2.5 text-xs leading-normal">
          <span>⚠</span>
          <span>{error}</span>
        </div>
      )}

      {/* KPI Stats counters row */}
      {overview && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <GlassCard className="p-4 flex flex-col gap-1">
            <span className="kpi-label">Total Costs</span>
            <span className="text-base font-extrabold text-slate-200 font-mono">
              <AnimatedCounter value={overview.total_costs} prefix="₹" decimals={2} />
            </span>
            <span className="text-[9px] text-slate-500">Rent, salaries &amp; utilities</span>
          </GlassCard>

          <GlassCard className="p-4 flex flex-col gap-1">
            <span className="kpi-label text-primary-400">Inventory Invested</span>
            <span className="text-base font-extrabold text-slate-200 font-mono">
              <AnimatedCounter value={overview.current_inventory_investment} prefix="₹" decimals={2} />
            </span>
            <span className="text-[9px] text-slate-500">Stock cost price assets</span>
          </GlassCard>

          <GlassCard className="p-4 flex flex-col gap-1">
            <span className="kpi-label text-cyan-400">Estimated Margin</span>
            <span className="text-base font-extrabold text-slate-200 font-mono">
              <AnimatedCounter value={overview.estimated_margin} prefix="₹" decimals={2} />
            </span>
            <span className="text-[9px] text-slate-500">Sales yields margin</span>
          </GlassCard>

          <GlassCard className={`p-4 flex flex-col gap-1 ${
            overview.net_profit >= 0 ? 'border-emerald-500/20 bg-emerald-950/5' : 'border-rose-500/20 bg-rose-950/5'
          }`}>
            <span className="kpi-label">Net Profit / Loss</span>
            <span className={`text-base font-extrabold font-mono ${overview.net_profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              <AnimatedCounter value={overview.net_profit} prefix={overview.net_profit >= 0 ? '+₹' : '-₹'} decimals={2} />
            </span>
            <span className="text-[9px] text-slate-500">Yield minus operational costs</span>
          </GlassCard>

          <GlassCard className="p-4 flex flex-col gap-1">
            <span className="kpi-label">Return on Invest</span>
            <span className="text-base font-extrabold text-slate-200 font-mono">
              <AnimatedCounter value={overview.return_on_investment} suffix="%" decimals={1} />
            </span>
            <span className="text-[9px] text-slate-500">Net Profit / Inventory cost</span>
          </GlassCard>
        </div>
      )}

      {/* Main split grid: MoM Ledger & Operations Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left column: Mom comparison & Doc centre (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          
          {/* MoM History table */}
          <GlassCard className="p-5 flex flex-col gap-4">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pb-1 border-b border-slate-800">
                Month-over-Month History comparison
              </h3>
            </div>

            <div className="overflow-x-auto">
              {history.length > 0 ? (
                <table className="mv-table text-xs">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Sales Yield</th>
                      <th>Other Rev</th>
                      <th>Total Rev</th>
                      <th>Total Cost</th>
                      <th className="text-right">Net Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row) => {
                      const totalCost = parseFloat(row.rent) + parseFloat(row.electricity_and_bills) + parseFloat(row.staff_salaries) + parseFloat(row.other_expenses)
                      const profit = parseFloat(row.total_revenue) - totalCost
                      return (
                        <tr key={row.id}>
                          <td className="font-bold text-slate-200 font-mono">{row.month}</td>
                          <td className="font-mono">₹{parseFloat(row.computed_revenue).toFixed(2)}</td>
                          <td className="font-mono text-slate-400">₹{parseFloat(row.other_revenue).toFixed(2)}</td>
                          <td className="font-mono font-bold text-slate-200">₹{parseFloat(row.total_revenue).toFixed(2)}</td>
                          <td className="font-mono text-slate-400">₹{totalCost.toFixed(2)}</td>
                          <td className={`text-right font-mono font-bold ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {profit >= 0 ? '+' : '-'}₹{Math.abs(profit).toFixed(2)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="py-10 text-center border border-dashed border-slate-800 rounded-xl text-slate-500 text-xs font-semibold">
                  📭 No finance records entered yet
                </div>
              )}
            </div>
          </GlassCard>

          {/* Doc & Tax Centre */}
          <GlassCard className="p-5 flex flex-col gap-4">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pb-1 border-b border-slate-800">
                Document &amp; Tax export center
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Transactions XLS */}
              <div className="flex flex-col gap-3">
                <div>
                  <h4 className="text-xs font-bold text-slate-200">Transactions export ledger</h4>
                  <p className="text-[10px] text-slate-500 mt-1 leading-normal">
                    Compile and export a spreadsheet (.xlsx) file detailing checkout yields.
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <div className="flex-grow">
                      <label className="text-[8px] uppercase font-bold text-slate-550 block">Start:</label>
                      <input
                        type="date"
                        value={exportDates.start}
                        onChange={(e) => setExportDates((prev) => ({ ...prev, start: e.target.value }))}
                        className="input-base py-1 px-2 text-xs font-mono font-bold"
                      />
                    </div>
                    <div className="flex-grow">
                      <label className="text-[8px] uppercase font-bold text-slate-550 block">End:</label>
                      <input
                        type="date"
                        value={exportDates.end}
                        onChange={(e) => setExportDates((prev) => ({ ...prev, end: e.target.value }))}
                        className="input-base py-1 px-2 text-xs font-mono font-bold"
                      />
                    </div>
                  </div>
                  <button onClick={handleTransactionsDownload} className="btn-ghost py-2 mt-1 text-xs">
                    📥 Download ledger (Excel)
                  </button>
                </div>
              </div>

              {/* GST references report */}
              <div className="flex flex-col gap-3 border-t sm:border-t-0 sm:border-l border-slate-800/80 pt-4 sm:pt-0 sm:pl-5 justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-200">GST Invoice reference report</h4>
                  <p className="text-[10px] text-slate-500 mt-1 leading-normal">
                    Compile standard rate brackets reference sheet based on HSN settings.
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-[9px] text-slate-600 bg-surface-950/45 p-2 rounded border border-slate-800/40 block leading-normal italic">
                    * Allows mapping tax categories before final compiling downloads.
                  </span>
                  <button onClick={() => setShowGstModal(true)} className="btn-primary py-2 text-xs uppercase tracking-wider font-extrabold">
                    📝 Generate GST Report
                  </button>
                </div>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Right column: admin manual inputs (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          {userRole === 'admin' ? (
            <GlassCard className="p-5 flex flex-col gap-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pb-1 border-b border-slate-800">
                  Fixed Costs Compiler
                </h3>
                <p className="text-[10px] text-slate-500 mt-1 leading-normal">
                  Commit operational monthly expenditures and extra revenue below.
                </p>
              </div>

              <form onSubmit={handleSaveMetrics} className="flex flex-col gap-4 text-xs font-semibold">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500">Rent Cost (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={inputs.rent}
                    onChange={(e) => handleInputChange('rent', e.target.value)}
                    className="input-base py-1.5 font-bold font-mono"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500">Electricity &amp; Utilities (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={inputs.electricity_and_bills}
                    onChange={(e) => handleInputChange('electricity_and_bills', e.target.value)}
                    className="input-base py-1.5 font-bold font-mono"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500">Staff Salaries (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={inputs.staff_salaries}
                    onChange={(e) => handleInputChange('staff_salaries', e.target.value)}
                    className="input-base py-1.5 font-bold font-mono"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500">Other Fixed Costs (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={inputs.other_expenses}
                    onChange={(e) => handleInputChange('other_expenses', e.target.value)}
                    className="input-base py-1.5 font-bold font-mono"
                  />
                </div>

                <div className="divider my-1 opacity-30" />

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500">Recorded App Sales</label>
                  <div className="input-base py-1.5 font-bold font-mono bg-surface-950/60 text-slate-400">
                    ₹{(overview?.computed_revenue ?? 0).toFixed(2)}
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-bold text-slate-550">Other Revenue overrides (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={inputs.other_revenue}
                    onChange={(e) => handleInputChange('other_revenue', e.target.value)}
                    className="input-base py-1.5 font-bold font-mono"
                  />
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary w-full py-2.5 mt-2 text-xs font-bold uppercase tracking-wider"
                >
                  {saving ? 'Committing…' : 'Save Operational Entry'}
                </button>
              </form>
            </GlassCard>
          ) : (
            <GlassCard className="p-8 text-center flex flex-col gap-3 items-center justify-center">
              <span className="text-3xl">🔒</span>
              <h3 className="text-xs font-bold text-slate-350">Clearance Required</h3>
              <p className="text-[10px] text-slate-500 leading-normal">
                Only admin clearance credentials can modify or add fixed operational monthly parameters.
              </p>
            </GlassCard>
          )}
        </div>

      </div>

      {/* GST Modal overlay */}
      {showGstModal && (
        <GstConfigModal
          isOpen={showGstModal}
          onClose={() => setShowGstModal(false)}
          selectedMonth={selectedMonth}
          showToast={showToast}
        />
      )}

    </div>
  )
}
