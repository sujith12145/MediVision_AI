import { useState, useEffect, useCallback } from 'react'
import { 
  getFinanceOverview, 
  saveFinanceRecord, 
  getFinanceRecords,
  getGstReportMedicines,
  downloadGstReport,
  downloadTransactionsExport
} from '../services/api'

export default function MonthlyOverview({ userRole }) {
  const [selectedMonth, setSelectedMonth] = useState('')
  const [overview, setOverview] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  // Form input states
  const [inputs, setInputs] = useState({
    rent: '0',
    electricity_and_bills: '0',
    staff_salaries: '0',
    other_expenses: '0',
    other_revenue: '0'
  })

  // Transactions Export Date Range Filter
  const [exportDates, setExportDates] = useState({ start: '', end: '' })

  // GST Invoice Report states
  const [showGstModal, setShowGstModal] = useState(false)
  const [gstMedicines, setGstMedicines] = useState([])
  const [gstConfig, setGstConfig] = useState({})
  const [gstFormat, setGstFormat] = useState('pdf')
  const [gstLoading, setGstLoading] = useState(false)
  const [gstError, setGstError] = useState(null)

  // Generate last 6 months options
  const [monthOptions, setMonthOptions] = useState([])

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
    setLoading(true)
    setError(null)
    try {
      // 1. Fetch Selected Month Overview
      const data = await getFinanceOverview(selectedMonth)
      setOverview(data)
      setInputs({
        rent: data.rent.toString(),
        electricity_and_bills: data.electricity_and_bills.toString(),
        staff_salaries: data.staff_salaries.toString(),
        other_expenses: data.other_expenses.toString(),
        other_revenue: data.other_revenue.toString()
      })

      // 2. Fetch History for MoM Table (Last 3 Months)
      const histData = await getFinanceRecords()
      setHistory(histData.slice(0, 3))
    } catch (err) {
      setError(err.message || 'Failed to fetch financial data.')
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

  // Fetch overview and history when selectedMonth changes
  useEffect(() => {
    if (!selectedMonth) return
    fetchData()
    updateDefaultDatesForMonth(selectedMonth)
  }, [selectedMonth, fetchData, updateDefaultDatesForMonth])

  const handleTransactionsDownload = async () => {
    try {
      setError(null)
      setSuccess(null)
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
      setSuccess('Transactions ledger downloaded successfully!')
    } catch (err) {
      setError(err.message || 'Failed to download transactions ledger.')
    }
  }

  const handleOpenGstModal = async () => {
    setShowGstModal(true)
    setGstLoading(true)
    setGstError(null)
    try {
      const meds = await getGstReportMedicines(selectedMonth)
      setGstMedicines(meds)
      const initialConfig = {}
      meds.forEach(med => {
        initialConfig[med.id] = { hsn_code: '', gst_rate: 18 } // default 18% (can select others)
      })
      setGstConfig(initialConfig)
    } catch (err) {
      setGstError(err.message || 'Failed to load medicines for GST report.')
    } finally {
      setGstLoading(false)
    }
  }

  const handleGstConfigChange = (medId, field, value) => {
    setGstConfig(prev => ({
      ...prev,
      [medId]: {
        ...prev[medId],
        [field]: value
      }
    }))
  }

  const handleGstReportDownload = async () => {
    try {
      setError(null)
      setSuccess(null)
      setShowGstModal(false)
      const blob = await downloadGstReport({
        month: selectedMonth,
        medicines_config: gstConfig,
        format: gstFormat
      })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `GST_Sales_Report_${selectedMonth}.${gstFormat === 'excel' ? 'xlsx' : 'pdf'}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      setSuccess('GST sales report downloaded successfully!')
    } catch (err) {
      setError(err.message || 'Failed to download GST sales report.')
    }
  }

  const handleInputChange = (field, value) => {
    setInputs(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)

    // Validate inputs are non-negative
    const payload = {
      month: selectedMonth,
      rent: parseFloat(inputs.rent) || 0.0,
      electricity_and_bills: parseFloat(inputs.electricity_and_bills) || 0.0,
      staff_salaries: parseFloat(inputs.staff_salaries) || 0.0,
      other_expenses: parseFloat(inputs.other_expenses) || 0.0,
      other_revenue: parseFloat(inputs.other_revenue) || 0.0
    }

    if (Object.values(payload).some(v => typeof v === 'number' && v < 0)) {
      setError('Operational values and revenue must be non-negative numbers.')
      setSaving(false)
      return
    }

    try {
      await saveFinanceRecord(payload)
      setSuccess('Monthly finance record saved successfully!')
      fetchData() // reload metrics & history comparison
    } catch (err) {
      setError(err.message || 'Failed to save financial record.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-fade-in">
      
      {/* LEFT COLUMN: Overview Metrics and MoM Comparison Table */}
      <div className="lg:col-span-8 flex flex-col gap-6">
        
        {/* Header and Selector */}
        <div className="border border-slate-800/80 bg-surface-800/40 backdrop-blur-md rounded-3xl p-6 shadow-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <span>📊</span> Monthly Business Performance
            </h2>
            <p className="text-slate-500 text-[11px] mt-0.5 font-medium uppercase tracking-wider">
              Live sales tracking &amp; manual operational metrics
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 font-semibold uppercase">Select Month:</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-surface-900 border border-slate-700 rounded-xl px-3.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-primary-500/80 font-bold"
            >
              {monthOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Status Alerts */}
        {error && (
          <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-950/20 text-rose-300 flex items-center gap-3 text-xs font-medium animate-fade-in">
            <span>⚠️</span> {error}
          </div>
        )}

        {success && (
          <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-950/20 text-emerald-300 flex items-center justify-between gap-3 text-xs font-medium animate-fade-in">
            <span>✓ {success}</span>
            <button onClick={() => setSuccess(null)} className="text-emerald-400 font-bold hover:text-emerald-200">Dismiss</button>
          </div>
        )}

        {/* Live KPI Cards */}
        {overview && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            
            {/* Total Costs */}
            <div className="border border-slate-800 bg-surface-900/60 p-4.5 rounded-2xl flex flex-col gap-1.5 shadow-sm">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Costs</span>
              <span className="text-lg font-extrabold text-slate-200">${overview.total_costs.toFixed(2)}</span>
              <span className="text-[9px] text-slate-500 leading-tight">Sum of rent, bills, salaries, &amp; other fixed expenses</span>
            </div>

            {/* Inventory Value */}
            <div className="border border-slate-800 bg-surface-900/60 p-4.5 rounded-2xl flex flex-col gap-1.5 shadow-sm">
              <span className="text-[10px] uppercase font-bold text-primary-400 tracking-wider flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse"></span>
                Inventory Invested
              </span>
              <span className="text-lg font-extrabold text-slate-200">${overview.current_inventory_investment.toFixed(2)}</span>
              <span className="text-[9px] text-slate-500 leading-tight">Live sum of (qty * Cost Price) for active stock rows</span>
            </div>

            {/* Estimated Margin */}
            <div className="border border-slate-800 bg-surface-900/60 p-4.5 rounded-2xl flex flex-col gap-1.5 shadow-sm">
              <span className="text-[10px] uppercase font-bold text-primary-400 tracking-wider flex items-center gap-1">
                Estimated Margin
              </span>
              <span className="text-lg font-extrabold text-slate-200">${overview.estimated_margin.toFixed(2)}</span>
              <span className="text-[9px] text-slate-500 leading-tight">Total margin computed from stored purchase prices &amp; actual sales</span>
            </div>

            {/* Net Profit */}
            <div className={`border p-4.5 rounded-2xl flex flex-col gap-1.5 shadow-sm ${
              overview.net_profit >= 0 
                ? 'border-emerald-500/20 bg-emerald-950/10' 
                : 'border-rose-500/20 bg-rose-950/10'
            }`}>
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Net Profit / Loss</span>
              <span className={`text-lg font-extrabold ${overview.net_profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {overview.net_profit >= 0 ? '+' : '-'}${Math.abs(overview.net_profit).toFixed(2)}
              </span>
              <span className="text-[9px] text-slate-500 leading-tight">Total revenue (computed sales + other revenue) minus operational costs</span>
            </div>

            {/* ROI */}
            <div className="border border-slate-800 bg-surface-900/60 p-4.5 rounded-2xl flex flex-col gap-1.5 shadow-sm">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Return on Invest</span>
              <span className={`text-lg font-extrabold ${overview.return_on_investment >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {overview.return_on_investment.toFixed(1)}%
              </span>
              <span className="text-[9px] text-slate-500 leading-tight">Net Profit divided by current inventory investment</span>
            </div>

          </div>
        )}

        {/* MoM Comparison Table */}
        <div className="border border-slate-800/80 bg-surface-800/40 backdrop-blur-md rounded-3xl p-6 shadow-xl flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-200">Month-over-Month History</h3>
            <p className="text-[10px] text-slate-500 font-medium mt-0.5">Performance tracking across the last 3 saved entries</p>
          </div>

          <div className="overflow-x-auto">
            {history.length > 0 ? (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">Month</th>
                    <th className="py-2.5 px-3">App Sales</th>
                    <th className="py-2.5 px-3">Other Rev</th>
                    <th className="py-2.5 px-3">Total Rev</th>
                    <th className="py-2.5 px-3">Total Cost</th>
                    <th className="py-2.5 px-3 text-right">Net Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => {
                    const totalCost = parseFloat(row.rent) + parseFloat(row.electricity_and_bills) + parseFloat(row.staff_salaries) + parseFloat(row.other_expenses)
                    const profit = parseFloat(row.total_revenue) - totalCost
                    return (
                      <tr key={row.id} className="border-b border-slate-800/40 hover:bg-surface-900/40 text-slate-300 font-medium transition">
                        <td className="py-2.5 px-3 font-bold text-slate-100">{row.month}</td>
                        <td className="py-2.5 px-3 text-slate-300">${parseFloat(row.computed_revenue).toFixed(2)}</td>
                        <td className="py-2.5 px-3 text-slate-400">${parseFloat(row.other_revenue).toFixed(2)}</td>
                        <td className="py-2.5 px-3 text-slate-300 font-bold">${parseFloat(row.total_revenue).toFixed(2)}</td>
                        <td className="py-2.5 px-3 text-slate-400">${totalCost.toFixed(2)}</td>
                        <td className={`py-2.5 px-3 text-right font-bold ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {profit >= 0 ? '+' : '-'}${Math.abs(profit).toFixed(2)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <div className="py-8 text-center text-slate-500 font-medium text-xs border border-dashed border-slate-800 rounded-2xl bg-surface-900/20">
                📭 No financial records entered yet. Use the panel on the right to start tracking.
              </div>
            )}
          </div>
        </div>

        {/* Document & Tax Center */}
        <div className="border border-slate-800/80 bg-surface-800/40 backdrop-blur-md rounded-3xl p-6 shadow-xl flex flex-col gap-5">
          <div>
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <span>📁</span> Document &amp; Tax Center
            </h3>
            <p className="text-[10px] text-slate-500 font-medium mt-0.5">
              Export transaction ledgers or generate references for manual GST filing
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1 border-t border-slate-800/50">
            {/* Transaction Excel Export */}
            <div className="flex flex-col gap-3">
              <div>
                <h4 className="text-xs font-bold text-slate-300">Transaction Export</h4>
                <p className="text-[9px] text-slate-500 leading-relaxed mt-0.5">
                  Download an Excel sheet (.xlsx) of all inflows &amp; outflows for a selected range.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <div className="flex-1 flex flex-col gap-1">
                    <label className="text-[8px] uppercase font-bold text-slate-400 tracking-wider">Start Date</label>
                    <input
                      type="date"
                      value={exportDates.start}
                      onChange={(e) => setExportDates(prev => ({ ...prev, start: e.target.value }))}
                      className="bg-surface-900 border border-slate-700 rounded-xl px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-primary-500 font-medium"
                    />
                  </div>
                  <div className="flex-1 flex flex-col gap-1">
                    <label className="text-[8px] uppercase font-bold text-slate-400 tracking-wider">End Date</label>
                    <input
                      type="date"
                      value={exportDates.end}
                      onChange={(e) => setExportDates(prev => ({ ...prev, end: e.target.value }))}
                      className="bg-surface-900 border border-slate-700 rounded-xl px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-primary-500 font-medium"
                    />
                  </div>
                </div>

                <button
                  onClick={handleTransactionsDownload}
                  className="w-full bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 font-bold py-2 rounded-xl text-xs transition active:scale-98 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  📥 Download Transactions (Excel)
                </button>
              </div>
            </div>

            {/* GST Report Compiler */}
            <div className="flex flex-col gap-3 border-t md:border-t-0 md:border-l border-slate-800/50 pt-4 md:pt-0 md:pl-5">
              <div>
                <h4 className="text-xs font-bold text-slate-300">GST Invoice Report</h4>
                <p className="text-[9px] text-slate-500 leading-relaxed mt-0.5">
                  Generate a references report for the selected month to review and file yourself.
                </p>
              </div>

              <div className="flex flex-col gap-3 h-full justify-between">
                <div className="text-[8px] text-slate-500 leading-normal italic bg-slate-900/30 p-2 rounded-lg border border-slate-800/50">
                  * Note: HSN codes and GST rates can be configured per medicine before generating.
                </div>

                <button
                  onClick={handleOpenGstModal}
                  className="w-full bg-primary-600 hover:bg-primary-500 text-white font-bold py-2 rounded-xl text-xs transition active:scale-98 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  📝 Generate GST Report
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* RIGHT COLUMN: Owner Input Form */}
      <div className="lg:col-span-4 flex flex-col gap-5">
        
        {/* Input Form Panel */}
        {userRole === 'admin' ? (
          <form onSubmit={handleSave} className="border border-slate-800/80 bg-surface-800/40 backdrop-blur-md rounded-3xl p-6 shadow-xl flex flex-col gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-200">Compile Monthly Metrics</h3>
              <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                Compile and enter fixed operational expenditures and sales for the month selected on the left.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              
              {/* Rent */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wide">Monthly Rent ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={inputs.rent}
                  onChange={(e) => handleInputChange('rent', e.target.value)}
                  className="bg-surface-900 border border-slate-700/60 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-primary-500/80 transition font-medium"
                />
              </div>

              {/* Electricity & Bills */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wide">Electricity &amp; Bills ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={inputs.electricity_and_bills}
                  onChange={(e) => handleInputChange('electricity_and_bills', e.target.value)}
                  className="bg-surface-900 border border-slate-700/60 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-primary-500/80 transition font-medium"
                />
              </div>

              {/* Staff Salaries */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wide">Staff Salaries ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={inputs.staff_salaries}
                  onChange={(e) => handleInputChange('staff_salaries', e.target.value)}
                  className="bg-surface-900 border border-slate-700/60 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-primary-500/80 transition font-medium"
                />
              </div>

              {/* Other Expenses */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wide">Other Fixed Costs ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={inputs.other_expenses}
                  onChange={(e) => handleInputChange('other_expenses', e.target.value)}
                  className="bg-surface-900 border border-slate-700/60 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-primary-500/80 transition font-medium"
                />
              </div>

              {/* Computed App Sales (Read Only) */}
              <div className="flex flex-col gap-1.5 border-t border-slate-800/65 pt-3 mt-1">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wide">Recorded App Sales</label>
                  <span className="text-[9px] text-emerald-400 font-bold bg-emerald-950/30 px-1.5 py-0.5 rounded-md border border-emerald-900/30 font-sans">Live Database</span>
                </div>
                <div className="bg-surface-900/80 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-400 font-bold font-mono">
                  ${(overview?.computed_revenue ?? 0).toFixed(2)}
                </div>
              </div>

              {/* Other Revenue */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold text-primary-400 tracking-wide">Other Revenue ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={inputs.other_revenue}
                  onChange={(e) => handleInputChange('other_revenue', e.target.value)}
                  className="bg-surface-900 border border-slate-700/60 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-primary-500/80 transition font-medium"
                  placeholder="e.g. Cash sales, overrides"
                />
              </div>

              {/* Total Revenue Display */}
              <div className="flex flex-col gap-1.5 bg-primary-950/10 border border-primary-900/20 p-3 rounded-xl">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] uppercase font-bold text-slate-300 tracking-wide">Total Estimated Revenue</span>
                  <span className="text-xs font-black text-primary-400 font-mono">
                    ${((overview?.computed_revenue ?? 0) + (parseFloat(inputs.other_revenue) || 0)).toFixed(2)}
                  </span>
                </div>
              </div>

            </div>

            <button
              type="submit"
              disabled={saving || loading}
              className={`w-full py-2.5 rounded-xl text-center text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                saving || loading
                  ? 'bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed'
                  : 'bg-primary-600 hover:bg-primary-500 text-white cursor-pointer active:scale-98'
              }`}
            >
              {saving ? 'Saving Entries…' : 'Save Monthly Entry'}
            </button>
          </form>
        ) : (
          <div className="border border-slate-800/80 bg-surface-800/40 backdrop-blur-md rounded-3xl p-6 shadow-xl flex flex-col gap-4 text-center py-12">
            <span className="text-3xl">🔒</span>
            <h3 className="text-sm font-bold text-slate-200">Management Action Only</h3>
            <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
              Only Administrators can compile or edit monthly expenditures and supplementary revenue entries.
            </p>
          </div>
        )}

        {/* Transparency Label Panel */}
        <div className="border border-slate-800/80 bg-surface-900/40 rounded-2xl p-4 shadow-sm text-[10px] text-slate-400 leading-relaxed flex flex-col gap-1.5">
          <h4 className="font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wide text-[9px]">
            🛡️ Financial Transparency Notice
          </h4>
          <p>
            App sales are calculated live from recorded patient checkouts. Rent, utility bills, salaries, and other operational expenses are entered manually by the pharmacy manager.
          </p>
          <p>
            Managers can declare supplementary income not captured by the billing system under the <strong>Other Revenue</strong> field.
          </p>
          <p className="border-t border-slate-800/50 pt-1.5 mt-1 font-semibold text-primary-400">
            * Note: Inventory investment values are pulled live from the database to represent active stock asset cost.
          </p>
        </div>

      </div>

      {/* GST Configuration Modal */}
      {showGstModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-surface-800 border border-slate-700/60 rounded-3xl p-6 w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh] animate-scale-up">
            {/* Modal Header */}
            <div className="flex justify-between items-center pb-4 border-b border-slate-700/50">
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <span>📄</span> Configure GST Report ({selectedMonth})
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Specify HSN codes and GST rates for medicines sold in this month to compile a compliant invoice report.
                </p>
              </div>
              <button 
                onClick={() => setShowGstModal(false)}
                className="text-slate-400 hover:text-slate-200 text-lg cursor-pointer bg-transparent border-0 font-sans"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-4">
              {/* Disclaimer */}
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-xl text-[10px] leading-relaxed font-medium">
                ⚠️ <strong>Disclaimer:</strong> This report is for reference only. Verify all figures and file directly through the official GST portal or your accountant. This tool does not transmit data to any government system.
              </div>

              {gstLoading ? (
                <div className="py-12 text-center text-xs text-slate-400 font-medium flex flex-col items-center gap-2">
                  <span className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></span>
                  Loading medicines sold in {selectedMonth}...
                </div>
              ) : gstError ? (
                <div className="py-8 text-center text-xs text-rose-300 border border-rose-500/20 bg-rose-950/10 rounded-xl">
                  ⚠️ {gstError}
                </div>
              ) : gstMedicines.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500 font-medium border border-dashed border-slate-700 rounded-xl">
                  📭 No medicines were sold during {selectedMonth}. Cannot generate GST report.
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="max-h-[35vh] overflow-y-auto border border-slate-700/50 rounded-xl">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-surface-900 border-b border-slate-700/80 text-slate-400 font-bold uppercase text-[9px] tracking-wider sticky top-0">
                          <th className="py-2 px-3">Medicine</th>
                          <th className="py-2 px-3 w-1/3">HSN Code</th>
                          <th className="py-2 px-3 w-1/4">GST Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gstMedicines.map(med => (
                          <tr key={med.id} className="border-b border-slate-700/30 hover:bg-surface-900/30">
                            <td className="py-2 px-3 text-slate-200 font-medium">{med.name}</td>
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                placeholder="e.g. 3004"
                                value={gstConfig[med.id]?.hsn_code ?? ''}
                                onChange={(e) => handleGstConfigChange(med.id, 'hsn_code', e.target.value)}
                                className="w-full bg-surface-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-primary-500/80 font-medium"
                              />
                            </td>
                            <td className="py-2 px-3">
                              <select
                                value={gstConfig[med.id]?.gst_rate ?? 18}
                                onChange={(e) => handleGstConfigChange(med.id, 'gst_rate', parseFloat(e.target.value))}
                                className="w-full bg-surface-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-primary-500/80 font-bold"
                              >
                                <option value={0}>0% (Tax Exempt)</option>
                                <option value={5}>5% (Concessional)</option>
                                <option value={12}>12% (Standard)</option>
                                <option value={18}>18% (Standard Plus)</option>
                                <option value={28}>28% (Luxury/Demerit)</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Format Selection */}
                  <div className="flex items-center gap-4 bg-surface-900/60 p-3.5 border border-slate-700/40 rounded-xl mt-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Report Format:</span>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs text-slate-200 font-medium cursor-pointer">
                        <input
                          type="radio"
                          name="gstFormat"
                          value="pdf"
                          checked={gstFormat === 'pdf'}
                          onChange={() => setGstFormat('pdf')}
                          className="accent-primary-500"
                        />
                        PDF Document
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-slate-200 font-medium cursor-pointer">
                        <input
                          type="radio"
                          name="gstFormat"
                          value="excel"
                          checked={gstFormat === 'excel'}
                          onChange={() => setGstFormat('excel')}
                          className="accent-primary-500"
                        />
                        Excel Sheet
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-4 border-t border-slate-700/50 flex justify-end gap-3">
              <button
                onClick={() => setShowGstModal(false)}
                className="px-4 py-2 border border-slate-700 hover:bg-surface-900 rounded-xl text-xs text-slate-300 font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
              {gstMedicines.length > 0 && (
                <button
                  onClick={handleGstReportDownload}
                  className="px-5 py-2 bg-primary-600 hover:bg-primary-500 rounded-xl text-xs text-white font-bold transition flex items-center gap-1.5 cursor-pointer active:scale-98"
                >
                  📥 Compile and Download
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

