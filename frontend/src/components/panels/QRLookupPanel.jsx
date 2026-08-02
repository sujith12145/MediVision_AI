import { useState, useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { lookupMedicineByQRCode, searchMedicines } from '../../services/api'
import GlassCard from '../ui/GlassCard'
import Spinner from '../ui/Spinner'
import Badge from '../ui/Badge'
import AuditHistoryModal from '../modals/AuditHistoryModal'

export default function QRLookupPanel() {
  const { navigateTo, setPrefilledMedicine } = useWorkspace()

  // Manual fallback search states
  const [qrIdInput, setQrIdInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [medicine, setMedicine] = useState(null)
  const [searchedId, setSearchedId] = useState('')

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])

  // Scanner States
  const [scanning, setScanning] = useState(false)
  const [scannerError, setScannerError] = useState(null)
  
  const html5QrCodeRef = useRef(null)
  const fileInputRef = useRef(null)

  // Audit History Modal State
  const [selectedMedicineForHistory, setSelectedMedicineForHistory] = useState(null)

  // Cleanup scanner on component unmount
  useEffect(() => {
    return () => {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.stop().catch((err) => console.error('Error stopping scanner on unmount:', err))
      }
    }
  }, [])

  // Start scanner
  const startScanner = async () => {
    setScannerError(null)
    setMedicine(null)
    setError(null)
    setScanning(true)

    setTimeout(async () => {
      try {
        const qrScanner = new Html5Qrcode("qr-reader")
        html5QrCodeRef.current = qrScanner

        await qrScanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 }
          },
          (decodedText) => {
            handleLookup(decodedText)
            stopScanner()
          },
          () => {}
        )
      } catch (err) {
        console.error('Camera startup failed:', err)
        setScannerError('Could not access camera scanner.')
        setScanning(false)
      }
    }, 100)
  }

  const stopScanner = async () => {
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      try {
        await html5QrCodeRef.current.stop()
      } catch (err) {
        console.error('Error stopping camera:', err)
      }
    }
    setScanning(false)
  }

  // Handle QR scanning from image upload
  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setLoading(true)
    setError(null)
    setMedicine(null)

    try {
      const qrScanner = new Html5Qrcode("qr-reader-hidden")
      const decodedText = await qrScanner.scanFile(file, true)
      handleLookup(decodedText)
    } catch (err) {
      console.error('File QR scan failed:', err)
      setError('Could not decode QR code from this image.')
    } finally {
      setLoading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // Execute lookup
  const handleLookup = async (codeId) => {
    setLoading(true)
    setError(null)
    setMedicine(null)
    setSearchedId(codeId)
    setSearchResults([])

    try {
      const data = await lookupMedicineByQRCode(codeId)
      setMedicine(data)
    } catch (err) {
      console.error('Medicine lookup error:', err)
      setError(err.message || `No medicine matches the QR ID: "${codeId}"`)
    } finally {
      setLoading(false)
    }
  }

  // Manual fallback search submission
  const handleManualSearchSubmit = async (e) => {
    e.preventDefault()
    if (!searchQuery.trim()) return
    setLoading(true)
    setError(null)
    setMedicine(null)
    setSearchResults([])

    try {
      const data = await searchMedicines(searchQuery.trim())
      if (data.length === 0) {
        setError(`No medicines found matching: "${searchQuery}"`)
      } else if (data.length === 1) {
        handleLookup(data[0].qr_code_id)
      } else {
        setSearchResults(data)
      }
    } catch (err) {
      console.error('Search error:', err)
      setError(err.message || 'Error searching medicines')
    } finally {
      setLoading(false)
    }
  }

  const handleSelectSearchResult = (med) => {
    handleLookup(med.qr_code_id)
    setSearchResults([])
  }

  const handleNavigateToBilling = () => {
    if (medicine) {
      setPrefilledMedicine(medicine)
      navigateTo('billing')
    }
  }

  return (
    <div className="panel-enter flex flex-col gap-6">
      
      {/* Hidden container required by html5-qrcode file scanner helper */}
      <div id="qr-reader-hidden" style={{ display: 'none' }}></div>

      <div className="panel-header">
        <div>
          <h2 className="panel-title flex items-center gap-2">
            <span>🔍</span> QR Scanner Lookup
          </h2>
          <p className="panel-subtitle">Scan tag QR codes to review real-time database entries</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        
        {/* Left Side: Scanner Controls console */}
        <div className="lg:col-span-5 flex flex-col justify-between gap-6 min-h-[450px]">
          <GlassCard className="p-6 flex flex-col gap-4 flex-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pb-1 border-b border-slate-800">
              Scanner Console
            </h3>

            {/* Scanning area frame */}
            <div className="relative mt-2 border border-slate-800 bg-surface-950/40 rounded-xl overflow-hidden flex flex-col items-center justify-center min-h-[200px] p-4">
              {scanning ? (
                <div className="relative w-full h-[200px]">
                  <div id="qr-reader" className="w-full h-full"></div>
                  <div className="absolute inset-0 border border-primary-500/20 pointer-events-none" />
                  <div className="absolute left-0 right-0 h-[2px] bg-accent-400 shadow-[0_0_8px_cyan] opacity-80 animate-bounce top-1/2" />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 text-center py-6">
                  <span className="text-2xl">📹</span>
                  <p className="text-xs text-slate-500 font-semibold">Camera is offline</p>
                  <button onClick={startScanner} className="btn-primary py-2 px-4 text-xs font-extrabold uppercase tracking-wider">
                    Start Camera
                  </button>
                </div>
              )}
            </div>

            {scannerError && (
              <div className="alert alert-danger py-2.5 text-[11px] leading-normal font-semibold">
                ⚠️ {scannerError}
              </div>
            )}

            {scanning && (
              <button onClick={stopScanner} className="btn-danger w-full py-2 text-xs">
                Stop Camera
              </button>
            )}

            <div className="flex items-center gap-3 py-1 mt-1">
              <div className="h-px bg-slate-800/80 flex-grow" />
              <span className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">or use fallbacks</span>
              <div className="h-px bg-slate-800/80 flex-grow" />
            </div>

            {/* File upload */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-bold uppercase text-slate-500 tracking-wider">
                Upload Label Photo
              </label>
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                onChange={handleFileUpload}
                className="block w-full text-xs text-slate-400 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-slate-800 file:bg-surface-900 file:text-slate-350 hover:file:bg-surface-800 file:transition cursor-pointer file:cursor-pointer"
              />
            </div>

            {/* Manual fallback input */}
            <form onSubmit={handleManualSearchSubmit} className="flex flex-col gap-1.5 mt-1">
              <label className="text-[9px] font-bold uppercase text-slate-500 tracking-wider">
                Search manually
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. Paracetamol or B240315"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input-base py-1.5 text-xs font-semibold"
                />
                <button type="submit" className="btn-ghost py-1.5 px-3 text-xs">
                  Search
                </button>
              </div>
            </form>

            {/* Search list results fallbacks */}
            {searchResults.length > 0 && (
              <div className="bg-surface-950 border border-slate-800/80 rounded-xl p-2 max-h-[160px] overflow-y-auto flex flex-col gap-1 mt-1 shadow-lg">
                {searchResults.map((med) => (
                  <button
                    key={med.id}
                    type="button"
                    onClick={() => handleSelectSearchResult(med)}
                    className="w-full text-left p-2 rounded-lg hover:bg-surface-900 text-xs transition flex justify-between items-center border border-transparent hover:border-slate-700 bg-surface-900/10"
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="font-bold text-slate-200 truncate">{med.name}</span>
                      <span className="text-[9px] text-slate-500 font-semibold mt-0.5">
                        Batch: {med.batch_number || 'N/A'} | Exp: {med.expiry_date || 'N/A'}
                      </span>
                    </div>
                    <span className="text-primary-400 font-bold text-[9px] uppercase shrink-0 ml-2">Select →</span>
                  </button>
                ))}
              </div>
            )}
          </GlassCard>
        </div>

        {/* Right Side: Lookup Details Card */}
        <div className="lg:col-span-7 flex flex-col justify-between min-h-[450px]">
          <GlassCard className="p-6 flex flex-col justify-between flex-grow">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pb-2 border-b border-slate-800">
                Lookup Result
              </h3>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-24 gap-2 text-slate-500 text-xs font-semibold animate-pulse">
                  <Spinner size="md" />
                  <span>Searching medicine records…</span>
                </div>
              ) : error ? (
                <div className="py-16 text-center flex flex-col items-center gap-3 animate-fade-in max-w-sm mx-auto">
                  <span className="text-3xl">🔍🚫</span>
                  <p className="font-bold text-rose-400 text-xs">No Matching Medicine Found</p>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    {error}
                  </p>
                  <button onClick={() => setError(null)} className="btn-ghost py-1 px-3 text-xs mt-1">
                    Clear Error
                  </button>
                </div>
              ) : medicine ? (
                <div className="flex flex-col gap-6 mt-4 animate-fade-in">
                  
                  {/* profile grid card */}
                  <div className="p-4.5 rounded-xl bg-surface-950/60 border border-slate-800/80 flex items-start gap-4 shadow-inner">
                    <div className="w-16 h-16 bg-white rounded-lg flex items-center justify-center p-1 shadow-md shrink-0">
                      {medicine.qr_code_image ? (
                        <img src={medicine.qr_code_image} alt="QR Thumbnail" className="w-full h-full" />
                      ) : (
                        <span className="text-[8px] text-slate-400 font-bold">No QR</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-base font-black text-slate-100 truncate">{medicine.name}</h4>
                      <p className="text-xs text-slate-400 font-semibold mt-1">Strength: {medicine.strength || 'N/A'}</p>
                      <p className="text-xs text-slate-500 font-medium mt-0.5 truncate">Mfr: {medicine.manufacturer || 'N/A'}</p>
                    </div>
                  </div>

                  {/* Specification grid */}
                  <div className="grid grid-cols-2 gap-4 text-xs font-semibold">
                    <div className="bg-surface-950/30 border border-slate-800/60 rounded-xl p-3.5 flex flex-col gap-1 font-mono">
                      <span className="text-[9px] uppercase font-bold text-slate-550 tracking-wider">Batch Number</span>
                      <span className="text-slate-200">{medicine.batch_number || 'N/A'}</span>
                    </div>

                    <div className="bg-surface-950/30 border border-slate-800/60 rounded-xl p-3.5 flex flex-col gap-1">
                      <span className="text-[9px] uppercase font-bold text-slate-550 tracking-wider">Stock Level</span>
                      <span className={medicine.quantity <= medicine.reorder_threshold ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                        {medicine.quantity} units {medicine.quantity <= medicine.reorder_threshold && '⚠️ (Low)'}
                      </span>
                    </div>

                    <div className="bg-surface-950/30 border border-slate-800/60 rounded-xl p-3.5 flex flex-col gap-1 font-mono">
                      <span className="text-[9px] uppercase font-bold text-slate-550 tracking-wider">Expiry Date</span>
                      <span className="text-slate-200">
                        {medicine.expiry_date ? new Date(medicine.expiry_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A'}
                      </span>
                    </div>

                    <div className="bg-surface-950/30 border border-slate-800/60 rounded-xl p-3.5 flex flex-col gap-1">
                      <span className="text-[9px] uppercase font-bold text-slate-550 tracking-wider">Rack Location</span>
                      <span className="text-slate-200">📍 {medicine.storage_location || 'Not Specified'}</span>
                    </div>

                    <div className="bg-surface-950/30 border border-slate-800/60 rounded-xl p-3.5 flex flex-col gap-1 col-span-2 font-mono">
                      <span className="text-[9px] uppercase font-bold text-slate-550 tracking-wider">Retail Price (MRP)</span>
                      <span className="text-emerald-400 font-bold text-sm">₹{medicine.mrp ? parseFloat(medicine.mrp).toFixed(2) : '0.00'}</span>
                    </div>
                  </div>

                </div>
              ) : (
                <div className="text-center py-24 border border-dashed border-slate-800 rounded-xl text-slate-500 max-w-sm mx-auto">
                  <span className="text-3xl block mb-2">🔍🏷️</span>
                  <p className="font-semibold text-slate-400 text-xs">Ready to lookup shelf QR</p>
                  <p className="text-[10px] text-slate-650 mt-1 leading-relaxed">
                    Start scanning via camera, upload a label image, or enter the ID to load the real-time specifications card.
                  </p>
                </div>
              )}
            </div>

            {/* Action panel below */}
            {medicine && (
              <div className="border-t border-slate-800/80 pt-4 mt-4 flex items-center justify-between flex-wrap gap-4">
                <button onClick={() => setMedicine(null)} className="btn-ghost py-2 text-xs">
                  Clear Result
                </button>
                <div className="flex gap-3">
                  <button onClick={() => setSelectedMedicineForHistory(medicine)} className="btn-ghost py-2 text-xs text-primary-400 border-primary-500/20">
                    🕰 Audit trail
                  </button>
                  <button
                    onClick={handleNavigateToBilling}
                    disabled={medicine.quantity <= 0}
                    className="btn-primary py-2 px-4 text-xs font-extrabold uppercase tracking-wider"
                  >
                    💳 Sell Item
                  </button>
                </div>
              </div>
            )}
          </GlassCard>
        </div>

      </div>

      {/* Audit modal */}
      {selectedMedicineForHistory && (
        <AuditHistoryModal
          medicine={selectedMedicineForHistory}
          onClose={() => setSelectedMedicineForHistory(null)}
        />
      )}

    </div>
  )
}
