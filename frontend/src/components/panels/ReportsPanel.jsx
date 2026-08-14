import { useState, useEffect } from 'react'
import GlassCard from '../ui/GlassCard'
import Badge from '../ui/Badge'
import Spinner from '../ui/Spinner'
import GstConfigModal from '../modals/GstConfigModal'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import {
  getFinanceOverview,
  getExpirySummary,
  getFinancialRisk,
  getGstReportSummary,
  downloadSalesReport,
  downloadExpiryReport
} from '../../services/api'

export default function ReportsPanel() {
  const { showToast } = useWorkspace()
  
  const [selectedTemplate, setSelectedTemplate] = useState('sales')
  const [scheduleTime, setScheduleTime] = useState('weekly')
  
  // Month options (same as FinancePanel)
  const [selectedMonth, setSelectedMonth] = useState('')
  const [monthOptions, setMonthOptions] = useState([])
  
  // Preview metrics states
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState(null)
  
  // Specific preview data states
  const [salesPreview, setSalesPreview] = useState(null)
  const [expiryPreview, setExpiryPreview] = useState(null)
  const [gstPreview, setGstPreview] = useState(null)

  // GST Modal control states
  const [showGstModal, setShowGstModal] = useState(false)
  const [pendingGstFormat, setPendingGstFormat] = useState('pdf')
  
  const templates = [
    { id: 'sales', title: 'Monthly Revenue P&L Ledger', desc: 'Detailed breakdown of cash yields, fixed costs overrides, ROI metrics, and drug categories shares.', format: 'PDF, Excel' },
    { id: 'expiry', title: 'Expiry Write-off Audit Report', desc: 'Compilation of write-offs, near-expiring stocks warnings, and estimated expiry losses.', format: 'PDF, Excel' },
    { id: 'gst', title: 'GST Invoice Reference Compilation', desc: 'Tax bracket classification based on HSN settings for drug lines sold.', format: 'PDF, Excel' }
  ]

  const getAiSummary = (templateId) => {
    switch (templateId) {
      case 'sales':
        return salesPreview 
          ? `Selected month ended with net profit of ₹${parseFloat(salesPreview.net_profit).toLocaleString()}. ROI is at ${parseFloat(salesPreview.return_on_investment).toFixed(1)}%.`
          : 'Operational finance metrics are ready for retrieval. Select a month to analyze yields and ROI ratios.'
      case 'expiry':
        return expiryPreview
          ? `Quarantine inventory count is ${expiryPreview.red}. Estimated total value at risk is ₹${parseFloat(expiryPreview.total_value_at_risk).toLocaleString()}. Action suggested: Quarantine expired items.`
          : 'Expiry audit calculations completed. Near-expiry items list is parsed.'
      case 'gst':
        return gstPreview
          ? `Unique items sold under standard rates: ${gstPreview.unique_medicines_count}. Taxable yields: ₹${parseFloat(gstPreview.total_taxable_value).toLocaleString()}.`
          : 'GST tax compilations resolved. Ready to run config map and download reference ledger.'
      default:
        return ''
    }
  }

  // Generate month options
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
    setSelectedMonth(options[0].value)
  }, [])

  // Fetch preview metrics dynamically
  useEffect(() => {
    if (!selectedMonth) return

    let isMounted = true

    async function fetchPreview() {
      setPreviewLoading(true)
      setPreviewError(null)
      try {
        if (selectedTemplate === 'sales') {
          const data = await getFinanceOverview(selectedMonth)
          if (isMounted) setSalesPreview(data)
        } else if (selectedTemplate === 'expiry') {
          const summary = await getExpirySummary()
          const risk = await getFinancialRisk()
          if (isMounted) {
            setExpiryPreview({
              red: summary.red,
              amber: summary.amber,
              green: summary.green,
              total_value_at_risk: risk.total_value_at_risk,
              items_affected: risk.items_affected
            })
          }
        } else if (selectedTemplate === 'gst') {
          const data = await getGstReportSummary(selectedMonth)
          if (isMounted) setGstPreview(data)
        }
      } catch (err) {
        console.error('Preview load error:', err)
        if (isMounted) setPreviewError(err.message || 'Failed to fetch live preview.')
      } finally {
        if (isMounted) setPreviewLoading(false)
      }
    }

    fetchPreview()

    return () => {
      isMounted = false
    }
  }, [selectedTemplate, selectedMonth])

  const handlePdfPreview = async () => {
    if (selectedTemplate === 'gst') {
      setPendingGstFormat('pdf')
      setShowGstModal(true)
      return
    }

    try {
      showToast('Compiling PDF report...', 'info')
      let blob
      if (selectedTemplate === 'sales') {
        blob = await downloadSalesReport(selectedMonth, 'pdf')
      } else if (selectedTemplate === 'expiry') {
        blob = await downloadExpiryReport('pdf')
      }

      if (blob) {
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${selectedTemplate === 'sales' ? 'Sales_PL_Report_' + selectedMonth : 'Expiry_Audit_Report'}.pdf`
        document.body.appendChild(a)
        a.click()
        a.remove()
        window.URL.revokeObjectURL(url)
        showToast('PDF Report downloaded successfully!', 'success')
      }
    } catch (err) {
      console.error(err)
      showToast(err.message || 'Failed to download PDF report.', 'error')
    }
  }

  const handleExcelDownload = async () => {
    if (selectedTemplate === 'gst') {
      setPendingGstFormat('excel')
      setShowGstModal(true)
      return
    }

    try {
      showToast('Compiling Excel spreadsheet...', 'info')
      let blob
      if (selectedTemplate === 'sales') {
        blob = await downloadSalesReport(selectedMonth, 'excel')
      } else if (selectedTemplate === 'expiry') {
        blob = await downloadExpiryReport('excel')
      }

      if (blob) {
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${selectedTemplate === 'sales' ? 'Sales_PL_Report_' + selectedMonth : 'Expiry_Audit_Report'}.xlsx`
        document.body.appendChild(a)
        a.click()
        a.remove()
        window.URL.revokeObjectURL(url)
        showToast('Excel spreadsheet downloaded successfully!', 'success')
      }
    } catch (err) {
      console.error(err)
      showToast(err.message || 'Failed to download Excel spreadsheet.', 'error')
    }
  }

  return (
    <div className="panel-enter flex flex-col gap-6">
      
      {/* Header */}
      <div className="border border-slate-800/80 bg-surface-900/60 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="panel-title flex items-center gap-2">
            <span>📋</span> Professional Reports Center
          </h2>
          <p className="panel-subtitle">Generate tabular spreadsheet ledgers, PDF summaries, and schedule reports</p>
        </div>

        {selectedTemplate !== 'expiry' && (
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
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* Templates catalogs */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <GlassCard className="p-5 flex flex-col gap-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pb-2 border-b border-border">
              Report Templates Library
            </h3>

            <div className="flex flex-col gap-3.5">
              {templates.map((t) => (
                <div 
                  key={t.id}
                  onClick={() => setSelectedTemplate(t.id)}
                  className={`p-4 border rounded-xl flex flex-col gap-2 transition cursor-pointer ${
                    selectedTemplate === t.id 
                      ? 'border-primary/50 bg-primary-glow' 
                      : 'border-slate-800 bg-surface-900/30 hover:border-slate-700'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <strong className="text-xs text-slate-200 block">{t.title}</strong>
                    <Badge variant="cyan" className="font-mono text-[8px]">{t.format}</Badge>
                  </div>
                  <p className="text-[10px] text-slate-450 leading-normal font-semibold">{t.desc}</p>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Automations scheduling */}
          <GlassCard className="p-5 flex flex-col gap-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pb-2 border-b border-border">
              Report Automation Scheduler
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-semibold">
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] uppercase font-bold text-slate-550">Recurrence Interval</label>
                <select 
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="input-base text-xs font-bold"
                >
                  <option value="daily">Daily Cron Summary</option>
                  <option value="weekly">Weekly Automated Email (Default)</option>
                  <option value="monthly">Monthly Consolidated Compilation</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] uppercase font-bold text-slate-550">Destination Email</label>
                <input 
                  type="email" 
                  placeholder="pharmacy-records@medivision.local" 
                  className="input-base"
                />
              </div>
            </div>

            <button 
              onClick={() => showToast(`Report schedule set to: ${scheduleTime}`, 'success')}
              className="btn-ghost py-2 mt-2 text-xs font-bold uppercase tracking-wider border-primary/20 text-primary hover:bg-primary-glow"
            >
              ✓ Update Cron Schedule
            </button>
          </GlassCard>
        </div>

        {/* Previews and AI summary summaries */}
        <div className="lg:col-span-5">
          <GlassCard className="p-5 flex flex-col justify-between h-full min-h-[420px]">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pb-2 border-b border-border">
                Live Preview &amp; Executive Summary
              </h3>

              <div className="flex flex-col gap-6 mt-4 animate-fade-in">
                {/* AI generated summary text */}
                <div className="flex flex-col gap-2">
                  <span className="text-[9px] uppercase font-bold text-slate-550 tracking-wider">AI Executive Summaries</span>
                  <div className="bg-surface-950/60 p-4 border border-slate-850 rounded-xl text-xs font-semibold leading-relaxed text-slate-300 min-h-[80px]">
                    <strong className="block text-primary mb-1">🤖 Gemini Compiled Summary:</strong>
                    "{getAiSummary(selectedTemplate)}"
                  </div>
                </div>

                {/* Previews box */}
                <div className="flex flex-col gap-2">
                  <span className="text-[9px] uppercase font-bold text-slate-550 tracking-wider">Tabular Preview</span>
                  
                  {previewLoading ? (
                    <div className="flex items-center justify-center py-8 bg-surface-950/30 border border-slate-900 rounded-xl text-slate-500">
                      <Spinner size="sm" />
                      <span className="ml-2 text-xs font-semibold">Generating preview...</span>
                    </div>
                  ) : previewError ? (
                    <div className="alert alert-danger py-2.5 text-[10px]">
                      <span>⚠ {previewError}</span>
                    </div>
                  ) : (
                    <div className="bg-surface-950/30 p-4 border border-slate-900 rounded-xl text-[10px] font-mono text-slate-400 flex flex-col gap-1">
                      <div className="flex justify-between border-b border-slate-900 pb-1 font-bold text-slate-300">
                        <span>Row Field</span>
                        <span>Value Projection</span>
                      </div>
                      
                      {selectedTemplate === 'sales' && salesPreview && (
                        <>
                          <div className="flex justify-between py-0.5"><span>Report Period</span><span>{selectedMonth}</span></div>
                          <div className="flex justify-between py-0.5"><span>Total Revenue</span><span>₹{parseFloat(salesPreview.total_revenue).toFixed(2)}</span></div>
                          <div className="flex justify-between py-0.5"><span>Total Costs</span><span>₹{parseFloat(salesPreview.total_costs).toFixed(2)}</span></div>
                          <div className="flex justify-between py-0.5"><span className="font-bold">Net Profit</span><span className={salesPreview.net_profit >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>₹{parseFloat(salesPreview.net_profit).toFixed(2)}</span></div>
                          <div className="flex justify-between py-0.5"><span>Return on Invest (ROI)</span><span>{parseFloat(salesPreview.return_on_investment).toFixed(1)}%</span></div>
                          <div className="flex justify-between py-0.5"><span>Estimated Margin</span><span>₹{parseFloat(salesPreview.estimated_margin).toFixed(2)}</span></div>
                        </>
                      )}

                      {selectedTemplate === 'expiry' && expiryPreview && (
                        <>
                          <div className="flex justify-between py-0.5"><span>Quarantined Expired SKU</span><span className="text-rose-400 font-bold">{expiryPreview.red} items</span></div>
                          <div className="flex justify-between py-0.5"><span>Near Expiry SKU (30d)</span><span className="text-amber-500">{expiryPreview.red + expiryPreview.amber} items</span></div>
                          <div className="flex justify-between py-0.5"><span>Safe Catalog SKUs</span><span className="text-emerald-400">{expiryPreview.green} items</span></div>
                          <div className="flex justify-between py-0.5"><span className="font-bold">Total Value at Risk</span><span className="text-rose-400 font-bold">₹{parseFloat(expiryPreview.total_value_at_risk).toFixed(2)}</span></div>
                          <div className="flex justify-between py-0.5"><span>Batches Affected</span><span>{expiryPreview.items_affected} batches</span></div>
                        </>
                      )}

                      {selectedTemplate === 'gst' && gstPreview && (
                        <>
                          <div className="flex justify-between py-0.5"><span>Report Period</span><span>{selectedMonth}</span></div>
                          <div className="flex justify-between py-0.5"><span>Unique Medicines Sold</span><span>{gstPreview.unique_medicines_count} lines</span></div>
                          <div className="flex justify-between py-0.5"><span>Total Taxable Value</span><span>₹{parseFloat(gstPreview.total_taxable_value).toFixed(2)}</span></div>
                          <div className="flex justify-between py-0.5"><span>Estimated GST Collected</span><span>₹{parseFloat(gstPreview.estimated_gst_tax).toFixed(2)}</span></div>
                          <div className="flex justify-between py-0.5"><span className="font-bold">Total Grand Amount</span><span className="font-bold text-slate-200">₹{parseFloat(gstPreview.total_grand_amount).toFixed(2)}</span></div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button 
                onClick={handlePdfPreview}
                disabled={previewLoading || !!previewError}
                className="btn-ghost flex-1 py-2.5 text-xs font-bold disabled:opacity-40"
              >
                📄 PDF Preview
              </button>
              <button 
                onClick={handleExcelDownload}
                disabled={previewLoading || !!previewError}
                className="btn-primary flex-1 py-2.5 text-xs uppercase tracking-wider font-extrabold disabled:opacity-40"
              >
                📥 Excel Download
              </button>
            </div>
          </GlassCard>
        </div>

      </div>

      {/* GST Modal overlay */}
      {showGstModal && (
        <GstConfigModal
          isOpen={showGstModal}
          onClose={() => setShowGstModal(false)}
          selectedMonth={selectedMonth}
          showToast={showToast}
          defaultFormat={pendingGstFormat}
        />
      )}

    </div>
  )
}
