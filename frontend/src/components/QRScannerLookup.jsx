import { useState, useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { lookupMedicineByQRCode, searchMedicines } from '../services/api'
import AuditHistoryModal from './AuditHistoryModal'

export default function QRScannerLookup({ onNavigateToBilling }) {
  const [qrIdInput, setQrIdInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [medicine, setMedicine] = useState(null)
  const [searchedId, setSearchedId] = useState('')

  // Manual fallback search states
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
        html5QrCodeRef.current.stop().catch(err => console.error('Error stopping scanner on unmount:', err))
      }
    }
  }, [])

  // Start the live camera scanner
  const startScanner = async () => {
    setScannerError(null)
    setMedicine(null)
    setError(null)
    setScanning(true)

    // Give DOM a millisecond to mount the #qr-reader div
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
            // QR Code scanned successfully
            handleLookup(decodedText)
            stopScanner()
          },
          () => {
            // Quiet debug - ignore verbose frame scan failures
          }
        )
      } catch (err) {
        console.error('Camera startup failed:', err)
        setScannerError('Could not access camera. Please ensure permissions are granted or use one of the fallbacks.')
        setScanning(false)
      }
    }, 150)
  }

  // Stop camera scanning
  const stopScanner = async () => {
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      try {
        await html5QrCodeRef.current.stop()
      } catch (err) {
        console.error('Error stopping camera scanner:', err)
      }
    }
    setScanning(false)
  }

  // Handle QR scanning from an image file
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
      setError('Could not decode QR code from this image. Please check the image quality or enter the ID manually.')
    } finally {
      setLoading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // Execute lookup logic
  const handleLookup = async (codeId) => {
    setLoading(true)
    setError(null)
    setMedicine(null)
    setSearchedId(codeId)
    setSearchResults([]) // Clear query results list upon lookup

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

  // Handle manual search fallback submission
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
        // If single match found, load it directly via its unique QR Code ID (live read)
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

  // Handle selection from search results list
  const handleSelectMedicine = (med) => {
    handleLookup(med.qr_code_id)
    setSearchResults([])
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch animate-fade-in">
      {/* Hidden container required by html5-qrcode file scanner helper */}
      <div id="qr-reader-hidden" style={{ display: 'none' }}></div>

      {/* Left side: Scan Input Console (Camera & Fallbacks) */}
      <div className="lg:col-span-5 border border-slate-800/80 bg-surface-800/20 backdrop-blur-md rounded-3xl p-6 flex flex-col justify-between gap-6 min-h-[450px]">
        <div className="flex flex-col gap-4">
          <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <span>📷</span> QR Scanner Console
          </h3>
          <p className="text-slate-400 text-xs leading-relaxed">
            Scan a printed shelf label QR code using your device camera, upload an image file, or enter the ID manually to lookup inventory data.
          </p>

          {/* Camera Scanning Frame */}
          <div className="relative mt-2 border border-slate-800 bg-surface-900/60 rounded-2xl overflow-hidden flex flex-col items-center justify-center min-h-[220px]">
            {scanning ? (
              <div className="relative w-full h-[220px]">
                {/* Glow Scanner Overlay Frame */}
                <div id="qr-reader" className="w-full h-full"></div>
                <div className="absolute inset-0 border-2 border-primary-500/20 pointer-events-none" />
                {/* Laser scan line micro-animation */}
                <div className="absolute left-0 right-0 h-0.5 bg-accent-400 shadow-[0_0_12px_rgba(6,182,212,0.8)] opacity-70 animate-bounce top-1/2" />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-6 gap-3.5 text-center">
                <span className="text-3xl">📹</span>
                <p className="text-xs text-slate-400 font-semibold">Camera scanner is off</p>
                <button
                  type="button"
                  onClick={startScanner}
                  className="bg-primary-500/10 hover:bg-primary-500/20 border border-primary-500/20 hover:border-primary-500/40 text-primary-400 font-bold px-4 py-2 rounded-xl transition cursor-pointer text-xs"
                >
                  🔋 Start Camera Scanner
                </button>
              </div>
            )}
          </div>

          {scannerError && (
            <div className="p-3 rounded-xl border border-rose-500/25 bg-rose-950/20 text-rose-350 text-[11px] font-semibold leading-relaxed">
              ⚠️ {scannerError}
            </div>
          )}

          {scanning && (
            <button
              type="button"
              onClick={stopScanner}
              className="w-full bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 hover:border-rose-500/40 text-rose-400 font-bold py-2 rounded-xl transition cursor-pointer text-xs"
            >
              🛑 Stop Camera
            </button>
          )}

          {/* Separator */}
          <div className="flex items-center gap-3 py-1">
            <div className="h-px bg-slate-800/80 flex-grow" />
            <span className="text-[10px] text-slate-600 font-bold uppercase tracking-wider">OR USE FALLBACKS</span>
            <div className="h-px bg-slate-800/80 flex-grow" />
          </div>

          {/* Image Upload Input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">
              Upload Label Photo
            </label>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={handleFileUpload}
              className="block w-full text-xs text-slate-400 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-slate-800 file:bg-surface-900 file:text-slate-300 hover:file:bg-surface-800 file:transition cursor-pointer file:cursor-pointer"
            />
          </div>

          {/* Manual search fallback */}
          <form onSubmit={handleManualSearchSubmit} className="flex flex-col gap-1.5 mt-2">
            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">
              Search by Name or Batch Number (Fallback)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. Paracetamol or B240315"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-grow bg-surface-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-700 focus:outline-none focus:border-primary-500/80 transition-all font-semibold"
              />
              <button
                type="submit"
                disabled={!searchQuery.trim() || loading}
                className="bg-surface-900 border border-slate-800 hover:border-slate-700 text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed font-bold px-3.5 rounded-xl transition cursor-pointer text-xs"
              >
                Search
              </button>
            </div>
          </form>

          {/* Search Results List */}
          {searchResults.length > 0 && (
            <div className="mt-3 bg-surface-900 border border-slate-800 rounded-xl p-2 max-h-[220px] overflow-y-auto flex flex-col gap-1 shadow-lg">
              {searchResults.map((med) => (
                <button
                  key={med.id}
                  type="button"
                  onClick={() => handleSelectMedicine(med)}
                  className="w-full text-left p-2 rounded-lg hover:bg-surface-800 text-xs transition flex justify-between items-center border border-transparent hover:border-slate-700 bg-surface-950/20"
                >
                  <div className="flex flex-col">
                    <span className="font-bold text-slate-200">{med.name}</span>
                    <span className="text-[10px] text-slate-500">
                      Batch: {med.batch_number || 'N/A'} | Expiry: {med.expiry_date || 'N/A'}
                    </span>
                  </div>
                  <span className="text-primary-400 font-bold text-[10px] uppercase tracking-wider">Select →</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right side: Search / Scan Results Details Card */}
      <div className="lg:col-span-7 border border-slate-800/80 bg-surface-800/40 backdrop-blur-md rounded-3xl p-6 shadow-xl flex flex-col justify-between min-h-[450px]">
        <div>
          <h3 className="text-lg font-bold text-slate-100 mb-4 flex items-center gap-2">
            <span>📋</span> Lookup Result details
          </h3>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 text-xs">
              <div className="relative w-8 h-8 mx-auto mb-3">
                <div className="absolute inset-0 rounded-full border-2 border-primary-500/20" />
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary-500 animate-spin" />
              </div>
              <span className="animate-pulse">Searching matching medicine...</span>
            </div>
          ) : error ? (
            <div className="p-8 text-center border border-dashed border-rose-500/20 bg-rose-950/5 rounded-2xl flex flex-col items-center gap-3 animate-fade-in">
              <span className="text-3xl">🔍🚫</span>
              <p className="font-bold text-rose-400 text-sm">No Matching Medicine Found</p>
              <p className="text-xs text-slate-400 leading-relaxed max-w-[280px]">
                {error}
              </p>
              <button
                type="button"
                onClick={() => setError(null)}
                className="mt-1 bg-surface-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 text-xs font-semibold px-4 py-2 rounded-xl transition cursor-pointer"
              >
                Clear Search
              </button>
            </div>
          ) : medicine ? (
            <div className="flex flex-col gap-6 animate-fade-in">
              {/* Product Profile Glass Card */}
              <div className="p-5 rounded-2xl bg-surface-900/60 border border-slate-800 flex items-start gap-4">
                {/* QR Code thumbnail */}
                <div className="w-20 h-20 bg-white rounded-lg flex items-center justify-center p-1.5 shadow-md flex-shrink-0">
                  {medicine.qr_code_image ? (
                    <img src={medicine.qr_code_image} alt="QR Code Thumbnail" className="w-full h-full" />
                  ) : (
                    <span className="text-[10px] text-slate-400">No QR</span>
                  )}
                </div>
                <div>
                  <h4 className="text-lg font-black text-slate-100">{medicine.name}</h4>
                  <p className="text-xs text-slate-400 font-semibold mt-0.5">Strength: {medicine.strength || 'N/A'}</p>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">Manufacturer: {medicine.manufacturer || 'N/A'}</p>
                </div>
              </div>

              {/* Specifications grid */}
              <div className="grid grid-cols-2 gap-4 text-xs font-semibold">
                <div className="bg-surface-900/30 border border-slate-800/40 rounded-xl p-3.5 flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Batch Number</span>
                  <span className="font-mono text-slate-200 text-sm">{medicine.batch_number || 'N/A'}</span>
                </div>
                <div className="bg-surface-900/30 border border-slate-800/40 rounded-xl p-3.5 flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Stock Level</span>
                  <span className={`text-sm ${medicine.quantity <= medicine.reorder_threshold ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {medicine.quantity} units {medicine.quantity <= medicine.reorder_threshold && '⚠️ (Low)'}
                  </span>
                </div>
                <div className="bg-surface-900/30 border border-slate-800/40 rounded-xl p-3.5 flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Expiry Date</span>
                  <span className="font-mono text-slate-200 text-sm">
                    {medicine.expiry_date ? new Date(medicine.expiry_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A'}
                  </span>
                </div>
                <div className="bg-surface-900/30 border border-slate-800/40 rounded-xl p-3.5 flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Storage Location</span>
                  <span className="text-slate-200 text-sm">📍 {medicine.storage_location || 'Not Specified'}</span>
                </div>
                <div className="bg-surface-900/30 border border-slate-800/40 rounded-xl p-3.5 flex flex-col gap-1 col-span-2">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Retail Price (MRP)</span>
                  <span className="font-mono text-emerald-400 text-sm font-bold">₹{medicine.mrp ? parseFloat(medicine.mrp).toFixed(2) : '0.00'}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-20 text-slate-500 border border-dashed border-slate-800/80 rounded-2xl flex flex-col items-center justify-center">
              <span className="text-4xl block mb-3">🔍🏷️</span>
              <p className="font-semibold text-slate-400 text-xs">Ready to lookup shelf label code</p>
              <p className="text-[10px] text-slate-650 mt-1 max-w-[280px] leading-relaxed">
                Start scanning via camera, upload a label image, or enter the ID string to display the real-time stock details card.
              </p>
            </div>
          )}
        </div>

        {/* Action Panel */}
        {medicine && (
          <div className="border-t border-slate-800/50 pt-4 mt-6 flex flex-wrap gap-4 items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setMedicine(null)
                setError(null)
              }}
              className="bg-surface-900 border border-slate-850 hover:border-slate-700 text-slate-450 hover:text-slate-300 font-bold px-4 py-2.5 rounded-xl transition cursor-pointer text-xs"
            >
              Clear Result
            </button>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setSelectedMedicineForHistory(medicine)}
                className="text-xs font-bold text-primary-400 hover:text-accent-400 bg-primary-500/5 hover:bg-primary-500/10 border border-primary-500/15 hover:border-accent-500/20 px-4 py-2.5 rounded-xl transition-all cursor-pointer inline-flex items-center gap-1.5"
              >
                🕰 View Audit Trail
              </button>

              <button
                type="button"
                disabled={medicine.quantity <= 0}
                onClick={() => onNavigateToBilling(medicine)}
                className="text-xs font-extrabold text-slate-900 bg-gradient-to-r from-primary-500 to-accent-500 hover:from-primary-600 hover:to-accent-600 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-650 disabled:cursor-not-allowed px-5 py-2.5 rounded-xl transition duration-200 shadow-lg shadow-primary-500/10 cursor-pointer inline-flex items-center gap-1.5 uppercase tracking-wider"
              >
                💳 Sell Item
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Audit History Timeline Modal popup */}
      {selectedMedicineForHistory && (
        <AuditHistoryModal
          medicine={selectedMedicineForHistory}
          onClose={() => setSelectedMedicineForHistory(null)}
        />
      )}
    </div>
  )
}
