import { useState, useEffect } from 'react'
import { getGstReportMedicines, downloadGstReport } from '../../services/api'
import Modal from '../ui/Modal'
import Spinner from '../ui/Spinner'
import Badge from '../ui/Badge'

export default function GstConfigModal({ isOpen, onClose, selectedMonth, showToast }) {
  const [medicines, setMedicines] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  // Local config state: { [medId]: { hsn_code: string, gst_rate: number } }
  const [gstConfig, setGstConfig] = useState({})
  const [gstFormat, setGstFormat] = useState('pdf')
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (!isOpen || !selectedMonth) return

    async function loadMedicines() {
      setLoading(true)
      setError(null)
      try {
        const meds = await getGstReportMedicines(selectedMonth)
        setMedicines(meds || [])
        
        const initialConfig = {}
        if (meds) {
          meds.forEach((med) => {
            initialConfig[med.id] = { hsn_code: '', gst_rate: 18 }
          })
        }
        setGstConfig(initialConfig)
      } catch (err) {
        console.error('Failed to load GST medicines:', err)
        setError(err.message || 'Failed to load medicines list.')
      } finally {
        setLoading(false)
      }
    }

    loadMedicines()
  }, [isOpen, selectedMonth])

  const handleConfigChange = (medId, field, val) => {
    setGstConfig((prev) => ({
      ...prev,
      [medId]: {
        ...prev[medId],
        [field]: val
      }
    }))
  }

  const handleDownload = async () => {
    setDownloading(true)
    try {
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
      showToast('GST invoice report downloaded successfully!', 'success')
      onClose()
    } catch (err) {
      console.error('GST download error:', err)
      showToast(err.message || 'Failed to compile GST report.', 'error')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Configure GST Sales Report (${selectedMonth})`}
      maxWidth="max-w-2xl"
    >
      <div className="flex flex-col gap-4">
        <div className="alert alert-warning py-3 text-[11px] leading-normal font-semibold">
          ⚠️ <strong>Filing Disclaimer:</strong> For reference audit review only. Confirm values before filing.
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-500 text-xs font-semibold animate-pulse">
            <Spinner size="sm" />
            <span>Loading sold items list…</span>
          </div>
        ) : error ? (
          <div className="alert alert-danger py-2 text-xs">
            <span>⚠</span>
            <span>{error}</span>
          </div>
        ) : medicines.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-slate-800 rounded-xl text-slate-500 text-xs font-semibold">
            📭 No transaction items sold in {selectedMonth}. Cannot compile report.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="max-h-[30vh] overflow-y-auto border border-slate-800 rounded-xl">
              <table className="mv-table text-xs">
                <thead>
                  <tr className="bg-surface-950/60 sticky top-0 z-10 border-b border-slate-800">
                    <th className="py-2 px-3">Medicine</th>
                    <th className="py-2 px-3 w-1/3">HSN Code</th>
                    <th className="py-2 px-3 w-1/4">GST Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {medicines.map((med) => (
                    <tr key={med.id} className="hover:bg-surface-900/40 border-b border-slate-850">
                      <td className="py-2 px-3 font-semibold text-slate-200 truncate max-w-[150px]">{med.name}</td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          placeholder="e.g. 3004"
                          value={gstConfig[med.id]?.hsn_code ?? ''}
                          onChange={(e) => handleConfigChange(med.id, 'hsn_code', e.target.value)}
                          className="input-base py-1 px-2.5 text-xs font-mono font-bold"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <select
                          value={gstConfig[med.id]?.gst_rate ?? 18}
                          onChange={(e) => handleConfigChange(med.id, 'gst_rate', parseFloat(e.target.value))}
                          className="input-base py-1 px-2 text-xs font-bold"
                        >
                          <option value={0}>0% (Exempt)</option>
                          <option value={5}>5% (Concessional)</option>
                          <option value={12}>12% (Standard)</option>
                          <option value={18}>18% (Standard Plus)</option>
                          <option value={28}>28% (Luxury)</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Format choice */}
            <div className="flex items-center gap-4 bg-surface-950/50 p-3.5 border border-slate-800/80 rounded-xl text-xs font-semibold">
              <span className="text-slate-500 uppercase text-[10px] tracking-wider">Report Format:</span>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-200">
                  <input
                    type="radio"
                    name="gstFormat"
                    value="pdf"
                    checked={gstFormat === 'pdf'}
                    onChange={() => setGstFormat('pdf')}
                    className="accent-primary-500 w-4 h-4 cursor-pointer"
                  />
                  PDF Report
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-200">
                  <input
                    type="radio"
                    name="gstFormat"
                    value="excel"
                    checked={gstFormat === 'excel'}
                    onChange={() => setGstFormat('excel')}
                    className="accent-primary-500 w-4 h-4 cursor-pointer"
                  />
                  Excel Ledger
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Modal Controls */}
        <div className="flex justify-end pt-3 border-t border-slate-800/50 mt-2 gap-3">
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          {medicines.length > 0 && (
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="btn-primary py-2 px-4 text-xs font-bold uppercase tracking-wider disabled:opacity-40"
            >
              {downloading ? 'Compiling…' : '📥 Download Report'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
