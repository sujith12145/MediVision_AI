import { useState } from 'react'
import GlassCard from '../ui/GlassCard'
import Badge from '../ui/Badge'

export default function ReportsPanel() {
  const [selectedTemplate, setSelectedTemplate] = useState('sales')
  const [scheduleTime, setScheduleTime] = useState('weekly')
  
  const templates = [
    { id: 'sales', title: 'Monthly Revenue P&L Ledger', desc: 'Detailed breakdown of cash yields, fixed costs overrides, ROI metrics, and drug categories shares.', format: 'PDF, Excel' },
    { id: 'expiry', title: 'Expiry Write-off Audit Report', desc: 'Compilation of write-offs, near-expiring stocks warnings, and estimated expiry losses.', format: 'PDF' },
    { id: 'gst', title: 'GST Invoice Reference Compilation', desc: 'Tax bracket classification based on HSN settings for drug lines sold.', format: 'Excel' }
  ]

  const getAiSummary = (templateId) => {
    switch (templateId) {
      case 'sales':
        return 'July yield ended with net profit ₹1.4L. Margin metrics are stable at 32.8% ROI. Sun Pharmaceutical remains top supplier by PO quantity.'
      case 'expiry':
        return 'Critical expiration count reduced by 30%. Zandu Balm ZB-902 represents highest risk. Suggested action: discount and move lines.'
      case 'gst':
        return '85% items fell under standard 18% GST rate bracket. Antibiotics catalog generated ₹1.2L taxable yields. HSN configurations resolved.'
      default:
        return ''
    }
  }

  return (
    <div className="panel-enter flex flex-col gap-6">
      
      {/* Header */}
      <div className="panel-header">
        <div>
          <h2 className="panel-title flex items-center gap-2">
            <span>📋</span> Professional Reports Center
          </h2>
          <p className="panel-subtitle">Generate tabular spreadsheet ledgers, PDF summaries, and schedule reports</p>
        </div>
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
                <label className="text-[9px] uppercase font-bold text-slate-500">Recurrence Interval</label>
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
                <label className="text-[9px] uppercase font-bold text-slate-500">Destination Email</label>
                <input 
                  type="email" 
                  placeholder="pharmacy-records@medivision.local" 
                  className="input-base"
                />
              </div>
            </div>

            <button 
              onClick={() => alert(`Report schedule set to: ${scheduleTime}`)}
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
                  <div className="bg-surface-950/60 p-4 border border-slate-850 rounded-xl text-xs font-semibold leading-relaxed text-slate-300">
                    <strong className="block text-primary mb-1">🤖 Gemini Compiled Summary:</strong>
                    "{getAiSummary(selectedTemplate)}"
                  </div>
                </div>

                {/* Previews box */}
                <div className="flex flex-col gap-2">
                  <span className="text-[9px] uppercase font-bold text-slate-550 tracking-wider">Tabular Preview</span>
                  <div className="bg-surface-950/30 p-4 border border-slate-900 rounded-xl text-[10px] font-mono text-slate-400 flex flex-col gap-1">
                    <div className="flex justify-between border-b border-slate-900 pb-1 font-bold text-slate-300">
                      <span>Row Field</span>
                      <span>Value Projection</span>
                    </div>
                    <div className="flex justify-between py-0.5"><span>Unique Medicines</span><span>154 Lines</span></div>
                    <div className="flex justify-between py-0.5"><span>Average MRP Margin</span><span>32.8%</span></div>
                    <div className="flex justify-between py-0.5"><span>Expiring Stock Val</span><span>₹18.4K</span></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button 
                onClick={() => alert('PDF document download initiated.')}
                className="btn-ghost flex-1 py-2.5 text-xs font-bold"
              >
                📄 PDF Preview
              </button>
              <button 
                onClick={() => alert('Excel ledger spreadsheet compiled.')}
                className="btn-primary flex-1 py-2.5 text-xs uppercase tracking-wider font-extrabold"
              >
                📥 Excel Download
              </button>
            </div>
          </GlassCard>
        </div>

      </div>

    </div>
  )
}
