import { useState, useEffect } from 'react'

// Named constants for purchase-risk warning thresholds
const RISK_EXPIRY_DAYS_THRESHOLD = 30
const RISK_QUANTITY_THRESHOLD = 20

/**
 * ConfirmationScreen — shows the extracted fields alongside the uploaded image.
 * Uses a premium dark-mode dashboard look with high-fidelity validation feedback.
 */
export default function ConfirmationScreen({
  record,
  imageFile,
  onSave,
  onCancel,
  isSaving,
  error,
  isDuplicate,
  existingStockQty,
  isNonMedicineWarning,
}) {
  const [values, setValues] = useState({
    medicine_name: record.medicine_name ?? '',
    strength: record.strength ?? '',
    manufacturer: record.manufacturer ?? '',
    batch_number: record.batch_number ?? '',
    expiry_date: record.expiry_date ?? '',
    mrp: record.mrp !== null ? record.mrp.toString() : '',
    purchase_price: '',
    quantity: '1',
    storage_location: '',
  })


  // Track confirmation state for fields with 60-89 confidence
  const [confirmedFields, setConfirmedFields] = useState({})

  // Purchase-risk warning acknowledgment checkbox state
  const [riskAcknowledged, setRiskAcknowledged] = useState(false)

  // Already-expired stock confirmation reason state
  const [expiredReason, setExpiredReason] = useState('')

  // Helper to format date string YYYY-MM-DD to DD/MM/YYYY
  const formatDateToDDMMYYYY = (dateStr) => {
    if (!dateStr) return ''
    const parts = dateStr.split('-')
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`
    }
    return dateStr
  }

  // Timezone-safe check if a date string is in the past
  const isDateExpired = () => {
    if (!values.expiry_date) return false
    const parts = values.expiry_date.split('-')
    if (parts.length !== 3) return false
    const year = parseInt(parts[0], 10)
    const month = parseInt(parts[1], 10) - 1
    const day = parseInt(parts[2], 10)
    
    const expDate = new Date(year, month, day)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    expDate.setHours(0, 0, 0, 0)
    return expDate.getTime() < today.getTime()
  }

  // Compute days until expiry from the confirmed expiry_date input
  const getDaysUntilExpiry = () => {
    if (!values.expiry_date) return null
    const parts = values.expiry_date.split('-')
    if (parts.length !== 3) return null
    const year = parseInt(parts[0], 10)
    const month = parseInt(parts[1], 10) - 1
    const day = parseInt(parts[2], 10)
    
    const expDate = new Date(year, month, day)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    expDate.setHours(0, 0, 0, 0)
    const diffTime = expDate.getTime() - today.getTime()
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  // Duplicate-batch choice: null | 'add' | 'new'
  const [dupChoice, setDupChoice] = useState(null)

  // Generate a local object URL for previewing the image file
  const [previewUrl, setPreviewUrl] = useState('')

  useEffect(() => {
    if (imageFile) {
      const url = URL.createObjectURL(imageFile)
      setPreviewUrl(url)
      return () => URL.revokeObjectURL(url)
    }
  }, [imageFile])

  // Get field confidence and rules
  const getFieldMeta = (field) => {
    const aiConfidence = record.confidence?.[field]
    const value = values[field]

    // Fields that have confidence score from backend: medicine_name, expiry_date, batch_number
    const hasExplicitConfidence = ['medicine_name', 'expiry_date', 'batch_number'].includes(field)

    if (hasExplicitConfidence) {
      if (aiConfidence === undefined || aiConfidence === null) {
        return { status: 'red', score: null, label: 'Missing Info' }
      }
      if (aiConfidence >= 90) {
        return { status: 'green', score: aiConfidence, label: `High Confidence (${aiConfidence}%)` }
      }
      if (aiConfidence >= 60) {
        return { status: 'yellow', score: aiConfidence, label: `Verify Value (${aiConfidence}%)` }
      }
      return { status: 'red', score: aiConfidence, label: `Low Confidence (${aiConfidence}%)` }
    } else {
      // Fields without explicit confidence score: strength, manufacturer, mrp
      const isPresent = value !== undefined && value !== null && value.toString().trim() !== ''
      if (isPresent) {
        return { status: 'green', score: 100, label: 'Detected' }
      }
      return { status: 'red', score: 0, label: 'Missing Field' }
    }
  }

  // Handle value change
  const handleChange = (field, val) => {
    setValues((prev) => ({ ...prev, [field]: val }))
    if (field === 'expiry_date') {
      setRiskAcknowledged(false)
      setExpiredReason('')
    }
    
    // Automatically confirm if the user edits the field manually
    const meta = getFieldMeta(field)
    if (meta.status === 'yellow') {
      setConfirmedFields((prev) => ({ ...prev, [field]: true }))
    }
  }

  // Handle expired reason selection changes
  const handleExpiredReasonChange = (val) => {
    if (val === 'misread') {
      handleChange('expiry_date', '')
      setExpiredReason('')
    } else {
      setExpiredReason(val)
    }
  }

  // Handle confirmation toggle for yellow fields
  const toggleConfirm = (field) => {
    setConfirmedFields((prev) => ({ ...prev, [field]: !prev[field] }))
  }

  // Check validation to enable/disable Save button
  const isFormValid = () => {
    const fieldsToCheck = [
      'medicine_name', 
      'strength', 
      'manufacturer', 
      'batch_number', 
      'expiry_date', 
      'mrp', 
      'purchase_price'
    ]
    
    for (const field of fieldsToCheck) {
      const value = values[field]
      const meta = getFieldMeta(field)

      // Red status fields: MUST have a non-empty value
      if (meta.status === 'red') {
        if (!value || value.toString().trim() === '') {
          return false
        }
      }

      // Yellow status fields: MUST be clicked/confirmed
      if (meta.status === 'yellow') {
        if (!confirmedFields[field]) {
          return false
        }
      }
    }

    // Check that medicine name (required by DB) is not empty
    if (!values.medicine_name.trim()) return false

    // Check that purchase price is non-negative
    if (values.purchase_price && parseFloat(values.purchase_price) < 0) return false

    return true
  }

  // Form submit
  const handleSubmit = (e) => {
    e.preventDefault()
    if (!isValid || isSaving) return
    // If user chose 'create new entry' for a duplicate batch, wipe batch_number
    // so the backend uniqueness check finds no match and creates a fresh row.
    const effectiveBatch = (isDuplicate && dupChoice === 'new') ? null : (values.batch_number.trim() || null)

    const payload = {
      medicine_name: values.medicine_name.trim(),
      strength: values.strength.trim() || null,
      manufacturer: values.manufacturer.trim() || null,
      batch_number: effectiveBatch,
      expiry_date: values.expiry_date || null,
      mrp: values.mrp ? parseFloat(values.mrp) : null,
      purchase_price: values.purchase_price ? parseFloat(values.purchase_price) : 0.0,
      quantity: parseInt(values.quantity) || 1,
      storage_location: values.storage_location.trim() || null,
      intake_status: isDateExpired() ? 'expired_on_arrival' : null,
    }

    onSave(record.extraction_record_id, payload)
  }

  const fieldsConfig = [
    { key: 'medicine_name', label: 'Medicine Name', placeholder: 'e.g. Paracetamol IP 500mg', type: 'text' },
    { key: 'strength', label: 'Dosage Strength', placeholder: 'e.g. 500mg, 10ml', type: 'text' },
    { key: 'manufacturer', label: 'Manufacturer / Brand', placeholder: 'e.g. Cipla Ltd', type: 'text' },
    { key: 'batch_number', label: 'Batch / Lot Number', placeholder: 'e.g. B240315', type: 'text' },
    { key: 'expiry_date', label: 'Expiry Date', type: 'date' },
    { key: 'mrp', label: 'MRP (Max Retail Price)', placeholder: 'e.g. 28.50', type: 'number', step: '0.01' },
    { key: 'purchase_price', label: 'Purchase Price (per unit)', placeholder: 'e.g. 18.50', type: 'number', step: '0.01' },
  ]

  // Duplicate-batch: gate Save button until user makes an explicit choice
  const dupGateOk = !isDuplicate || dupChoice !== null

  // Purchase-risk warning checks
  const daysUntilExpiry = getDaysUntilExpiry()
  const isRiskAlertActive = daysUntilExpiry !== null && daysUntilExpiry <= RISK_EXPIRY_DAYS_THRESHOLD && (parseInt(values.quantity) || 0) > RISK_QUANTITY_THRESHOLD
  const riskGateOk = !isRiskAlertActive || riskAcknowledged

  // Already-expired warning checks
  const isExpiredActive = isDateExpired()
  const expiredGateOk = !isExpiredActive || expiredReason === 'confirmed_correct'

  const isValid = isFormValid() && dupGateOk && riskGateOk && expiredGateOk

  return (
    <div className="w-full max-w-[1600px] mx-auto px-4 py-8 animate-fade-in">
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-100">
            Confirm AI Extraction
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Please verify, complete, and confirm the AI-extracted fields from the carton image before saving.
          </p>
        </div>
        <button
          onClick={onCancel}
          className="self-start md:self-auto px-4 py-2 border border-slate-700 hover:border-slate-500 rounded-lg text-sm font-medium text-slate-300 transition"
        >
          ← Cancel & Upload New
        </button>
      </div>

      {/* ── Edge case 3: Non-medicine image warning ─────────────────────── */}
      {isNonMedicineWarning && (
        <div className="mb-5 p-4 rounded-xl border border-amber-500/30 bg-amber-950/20 flex items-start gap-3 animate-fade-in">
          <span className="text-2xl mt-0.5 shrink-0">🖼️</span>
          <div>
            <p className="text-amber-300 font-bold text-sm">This image does not appear to contain a medicine carton.</p>
            <p className="text-amber-400/80 text-xs mt-1 leading-relaxed">
              The AI could not identify any medicine name or readable label. All fields below require manual entry.
              If this was a mistake, cancel and upload the correct carton photo.
            </p>
          </div>
        </div>
      )}

      {/* ── Edge case 2: Duplicate batch banner ──────────────────────────── */}
      {isDuplicate && (
        <div className="mb-5 p-4 rounded-xl border border-sky-500/30 bg-sky-950/20 animate-fade-in">
          <div className="flex items-start gap-3">
            <span className="text-2xl mt-0.5 shrink-0">📦</span>
            <div className="flex-1">
              <p className="text-sky-300 font-bold text-sm">This batch is already in your inventory</p>
              <p className="text-sky-400/80 text-xs mt-1">
                Current stock: <span className="font-bold text-sky-200">{existingStockQty} units</span>. How do you want to proceed?
              </p>
              <div className="flex gap-3 mt-3">
                <button
                  type="button"
                  onClick={() => setDupChoice('add')}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all ${
                    dupChoice === 'add'
                      ? 'bg-sky-500/20 border-sky-400/50 text-sky-200'
                      : 'bg-surface-900/60 border-slate-700 text-slate-300 hover:border-sky-500/40'
                  }`}
                >
                  ➕ Add to existing stock
                </button>
                <button
                  type="button"
                  onClick={() => setDupChoice('new')}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all ${
                    dupChoice === 'new'
                      ? 'bg-violet-500/20 border-violet-400/50 text-violet-200'
                      : 'bg-surface-900/60 border-slate-700 text-slate-300 hover:border-violet-500/40'
                  }`}
                >
                  🆕 Create separate entry
                </button>
              </div>
              {dupChoice === 'new' && (
                <p className="text-[11px] text-violet-400/80 mt-2 italic">
                  The batch number will be cleared so a distinct inventory line is created.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 rounded-xl border border-rose-500/20 bg-rose-950/20 text-rose-300 flex items-center gap-3">
          <span className="text-xl">⚠</span>
          <div className="text-sm">{error}</div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Image scanner preview */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="relative border border-primary-500/25 bg-surface-800/80 backdrop-blur-md rounded-2xl p-3 overflow-hidden shadow-2xl group">
            {/* Holographic scanner border glows */}
            <div className="absolute inset-0 bg-gradient-to-tr from-primary-500/5 to-accent-500/5 pointer-events-none" />
            
            {/* Scan Line effect */}
            <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-transparent via-accent-400 to-transparent shadow-[0_0_12px_#22d3ee] animate-scan pointer-events-none" />

            <div className="relative rounded-xl overflow-hidden bg-surface-900 border border-slate-800 aspect-square flex items-center justify-center">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Scanned carton preview"
                  className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
                />
              ) : (
                <div className="text-slate-600 text-center p-4">
                  <span className="text-4xl block mb-2">📸</span>
                  No image preview available
                </div>
              )}
            </div>

            {/* AI extraction metadata log */}
            <div className="mt-3 p-3 bg-surface-900/60 rounded-xl border border-slate-800/80 flex flex-col gap-1.5 text-xs text-slate-400 font-mono">
              <div className="flex justify-between border-b border-slate-800/50 pb-1 text-slate-500">
                <span>METADATA KEY</span>
                <span>STATUS</span>
              </div>
              <div className="flex justify-between">
                <span>Record ID:</span>
                <span className="text-slate-300">#{record.extraction_record_id}</span>
              </div>
              <div className="flex justify-between">
                <span>AI Pipeline Status:</span>
                <span className="text-emerald-400 font-semibold">{record.status.toUpperCase()}</span>
              </div>
              {record.notes && (
                <div className="border-t border-slate-800/50 pt-1.5 mt-1 text-amber-400/90 italic leading-relaxed">
                  <span className="font-semibold block not-italic text-slate-500 mb-0.5 text-[10px]">AI EXTRACTION NOTES</span>
                  "{record.notes}"
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Confirmaton Form */}
        <form onSubmit={handleSubmit} className="lg:col-span-7 flex flex-col gap-6">
          <div className="border border-slate-800/80 bg-surface-800/60 backdrop-blur-md rounded-2xl p-6 shadow-2xl flex flex-col gap-4">
            <h3 className="text-lg font-semibold text-slate-200 border-b border-slate-800 pb-3 flex items-center gap-2">
              <span>📋</span> Core Medicine Details
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {fieldsConfig.map(({ key, label, placeholder, type, step }) => {
                const meta = getFieldMeta(key)
                const isConfirmed = confirmedFields[key]
                const value = values[key]

                // Border classes based on confidence meta
                let cardBorderClass = 'border-slate-800'
                let bgClass = 'bg-surface-900/40'
                
                if (meta.status === 'green') {
                  cardBorderClass = 'border-emerald-500/20 shadow-[0_0_12px_rgba(16,185,129,0.02)]'
                  bgClass = 'bg-emerald-950/5'
                } else if (meta.status === 'yellow') {
                  cardBorderClass = isConfirmed 
                    ? 'border-emerald-500/20 bg-emerald-950/5' 
                    : 'border-amber-500/35 bg-amber-950/5 shadow-[0_0_12px_rgba(245,158,11,0.02)]'
                } else if (meta.status === 'red') {
                  const isEmpty = !value || value.toString().trim() === ''
                  cardBorderClass = isEmpty 
                    ? 'border-rose-500/40 bg-rose-950/10 shadow-[0_0_12px_rgba(239,68,68,0.03)] animate-pulse-subtle' 
                    : 'border-emerald-500/20 bg-emerald-950/5'
                }

                return (
                  <div
                    key={key}
                    className={`p-4 rounded-xl border transition-all duration-300 flex flex-col gap-2 ${cardBorderClass} ${bgClass}`}
                  >
                    {/* Header: Label and Badge */}
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-semibold text-slate-400 tracking-wide uppercase">
                        {label}
                      </label>

                      {/* Confidence Badge */}
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                        meta.status === 'green' || (meta.status === 'yellow' && isConfirmed)
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : meta.status === 'yellow'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}>
                        {meta.status === 'green' || (meta.status === 'yellow' && isConfirmed) ? '✓ ' : '⚠ '}
                        {meta.status === 'yellow' && isConfirmed ? 'Confirmed' : meta.label}
                      </span>
                    </div>

                    {/* Form Input wrapper */}
                    <div className="flex gap-2 items-center">
                      <input
                        type={type}
                        step={step}
                        placeholder={placeholder}
                        value={value}
                        onChange={(e) => handleChange(key, e.target.value)}
                        className="flex-grow bg-surface-900 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-primary-500/80 transition-all font-medium"
                      />

                      {/* Confirm button for yellow fields */}
                      {meta.status === 'yellow' && (
                        <button
                          type="button"
                          onClick={() => toggleConfirm(key)}
                          className={`p-2 rounded-lg border text-sm transition-all flex items-center justify-center shrink-0 w-10 h-10 overflow-hidden ${
                            isConfirmed
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                              : 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20 animate-pulse'
                          }`}
                          title={isConfirmed ? "Mark as unverified" : "Confirm this AI value"}
                        >
                          ✓
                        </button>
                      )}
                    </div>

                    {/* AI notes shown on ALL red and yellow cards — not just yellow.
                        Edge case 1: this is how blurry-expiry warnings surface inline. */}
                    {(meta.status === 'yellow' || meta.status === 'red') && record.notes && (
                      <p className={`text-[11px] leading-tight p-2 rounded-lg border mt-1 font-medium ${
                        meta.status === 'yellow'
                          ? 'text-amber-400/90 bg-amber-950/20 border-amber-500/15'
                          : 'text-rose-400/90 bg-rose-950/20 border-rose-500/15'
                      }`}>
                        💡 AI Note: {record.notes}
                      </p>
                    )}

                    {meta.status === 'red' && (!value || value.toString().trim() === '') && (
                      <p className="text-[11px] text-rose-400 leading-tight bg-rose-950/30 p-2 rounded-lg border border-rose-500/15 mt-1 font-medium">
                        ✍ Required. Please type manually.
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Bottom Card: Inventory Quantities & Storage Location */}
          <div className="border border-slate-800/80 bg-surface-800/60 backdrop-blur-md rounded-2xl p-6 shadow-2xl flex flex-col gap-4">
            <h3 className="text-lg font-semibold text-slate-200 border-b border-slate-800 pb-3 flex items-center gap-2">
              <span>📦</span> Inventory details
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400 tracking-wide uppercase">
                  Add Quantity
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={values.quantity}
                  onChange={(e) => {
                    setValues((prev) => ({ ...prev, quantity: e.target.value }))
                    setRiskAcknowledged(false)
                  }}
                  className="bg-surface-900 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500/80 transition-all font-medium"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400 tracking-wide uppercase">
                  Storage Location (Rack / Shelf)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Shelf A4, Drawer 2"
                  value={values.storage_location}
                  onChange={(e) => setValues((prev) => ({ ...prev, storage_location: e.target.value }))}
                  className="bg-surface-900 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-primary-500/80 transition-all font-medium"
                />
              </div>
            </div>
          </div>

          {/* ── Purchase-Risk Warning Banner ─────────────────────────────────── */}
          {isRiskAlertActive && (
            <div className="p-4 rounded-xl border border-amber-600/50 bg-amber-500/10 flex flex-col gap-3 animate-fade-in text-left mb-4">
              <div className="flex items-start gap-3">
                <span className="text-xl mt-0.5 shrink-0">⚠️</span>
                <div>
                  <p className="text-amber-300 font-bold text-sm">Purchase Risk Alert: Near-Expiry Bulk Stock</p>
                  <p className="text-amber-200/90 text-xs mt-1 leading-relaxed">
                    You're stocking a large quantity ({values.quantity} units) of <strong className="text-slate-100">{values.medicine_name || 'this medicine'}</strong>, which expires in {daysUntilExpiry} days.
                    Consider ordering a smaller quantity to reduce the risk of unsold, expired stock.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-1 pl-8">
                <input
                  type="checkbox"
                  id="acknowledge-risk-chk"
                  checked={riskAcknowledged}
                  onChange={(e) => setRiskAcknowledged(e.target.checked)}
                  className="w-4 h-4 rounded bg-surface-900 border-slate-700 text-amber-550 focus:ring-amber-500 cursor-pointer"
                />
                <label htmlFor="acknowledge-risk-chk" className="text-xs font-semibold text-slate-300 select-none cursor-pointer">
                  I've reviewed this, proceed anyway
                </label>
              </div>
            </div>
          )}

          {/* ── Already-Expired Warning Banner ─────────────────────────────────── */}
          {isExpiredActive && (
            <div className="p-4 rounded-xl border border-rose-500/80 bg-rose-900 flex flex-col gap-3 animate-fade-in text-left mb-4 shadow-xl">
              <div className="flex items-start gap-3">
                <span className="text-xl mt-0.5 shrink-0">🚨</span>
                <div className="flex-1">
                  <p className="text-rose-100 font-bold text-sm">Critical Alert: Already-Expired Stock</p>
                  <p className="text-rose-200/90 text-xs mt-1 leading-relaxed">
                    This medicine's expiry date ({formatDateToDDMMYYYY(values.expiry_date)}) has already passed. Adding already-expired stock to inventory is unusual — please confirm this is intentional (e.g. for disposal tracking) and not a misread date.
                  </p>
                  
                  <div className="mt-3">
                    <label htmlFor="expired-reason-select" className="block text-xs font-semibold text-rose-100 mb-1">
                      Select explicit reason before saving:
                    </label>
                    <select
                      id="expired-reason-select"
                      value={expiredReason}
                      onChange={(e) => handleExpiredReasonChange(e.target.value)}
                      className="bg-surface-900 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-rose-400 transition-all font-medium w-full cursor-pointer"
                    >
                      <option value="">-- Select a reason --</option>
                      <option value="confirmed_correct">Confirmed correct — logging expired stock for disposal/write-off</option>
                      <option value="misread">Date was misread — let me re-enter it</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 mt-2">
            <button
              type="submit"
              disabled={!isValid || isSaving}
              className={`flex-grow py-3.5 rounded-xl text-center text-sm font-semibold tracking-wide transition-all shadow-xl flex items-center justify-center gap-2 ${
                isValid && !isSaving
                  ? 'bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white cursor-pointer active:scale-98 shadow-primary-500/20'
                  : 'bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed shadow-none'
              }`}
            >
              {isSaving ? (
                <>
                  <span className="animate-spin text-lg">⏳</span> Saving to Inventory…
                </>
              ) : (
                <>
                  <span>📥</span> Save to Inventory
                </>
              )}
            </button>
            
            <button
              type="button"
              disabled={isSaving}
              onClick={onCancel}
              className="py-3.5 px-6 border border-slate-700 hover:border-slate-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm font-semibold text-slate-300 transition"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
