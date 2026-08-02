import { useEffect, useState, useRef } from 'react'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { uploadImage, confirmIntake, checkDuplicate, confirmLocation, getLocations, createLocation } from '../../services/api'
import GlassCard from '../ui/GlassCard'
import Spinner from '../ui/Spinner'
import Badge from '../ui/Badge'

// Named constants for purchase-risk warning thresholds
const RISK_EXPIRY_DAYS_THRESHOLD = 30
const RISK_QUANTITY_THRESHOLD = 20

export default function IntakePanel() {
  const { showToast } = useWorkspace()

  // Steps: 'upload' | 'confirm'
  const [activeStep, setActiveStep] = useState('upload')
  const [currentRecord, setCurrentRecord] = useState(null)
  const [uploadFile, setUploadFile] = useState(null)

  // Drag & Drop states
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)

  // Edge cases state flags
  const [isDuplicate, setIsDuplicate] = useState(false)
  const [existingStockQty, setExistingStockQty] = useState(null)
  const [isNonMedicineWarning, setIsNonMedicineWarning] = useState(false)

  // Camera states
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState(null)
  const [videoStream, setVideoStream] = useState(null)
  const videoRef = useRef(null)

  // Confirmation screen form values
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [values, setValues] = useState({
    medicine_name: '',
    strength: '',
    manufacturer: '',
    batch_number: '',
    expiry_date: '',
    mrp: '',
    purchase_price: '',
    quantity: '1',
    storage_location: '',
  })

  // Storage Location Assignment states
  const [savedMedicine, setSavedMedicine] = useState(null)
  const [locationInfo, setLocationInfo] = useState(null)
  const [allLocations, setAllLocations] = useState([])
  const [selectedLocationId, setSelectedLocationId] = useState(null)
  const [customLocation, setCustomLocation] = useState({
    rack_name: 'Rack A',
    row: '',
    column: '',
    capacity: 20,
    storage_type: 'shelf',
  })
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [activeRack, setActiveRack] = useState(null)

  // Confirmed fields mapping for yellow warning metrics
  const [confirmedFields, setConfirmedFields] = useState({})
  const [riskAcknowledged, setRiskAcknowledged] = useState(false)
  const [expiredReason, setExpiredReason] = useState('')
  const [dupChoice, setDupChoice] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')

  // Current Pipeline Stage for visual stepper
  const [pipelineStage, setPipelineStage] = useState('idle') // idle | uploaded | ocr | duplicate | ready

  // ── Camera Handler Handlers ────────────────────────────────────────────────
  const startCamera = async () => {
    setCameraError(null)
    setIsCameraActive(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      })
      setVideoStream(stream)
    } catch (err) {
      console.error('Camera access error:', err)
      setCameraError('Camera access denied or unavailable.')
      setIsCameraActive(false)
    }
  }

  const stopCamera = () => {
    if (videoStream) {
      videoStream.getTracks().forEach((track) => track.stop())
    }
    setVideoStream(null)
    setIsCameraActive(false)
  }

  const capturePhoto = () => {
    if (videoRef.current) {
      const video = videoRef.current
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth || 640
      canvas.height = video.videoHeight || 480
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      
      canvas.toBlob(async (blob) => {
        if (blob) {
          const file = new File([blob], 'captured_carton.jpg', { type: 'image/jpeg' })
          stopCamera()
          await processFile(file)
        }
      }, 'image/jpeg', 0.95)
    }
  }

  // Bind video element stream
  useEffect(() => {
    if (isCameraActive && videoStream && videoRef.current) {
      videoRef.current.srcObject = videoStream
    }
  }, [isCameraActive, videoStream])

  // Clean streams on unmount
  useEffect(() => {
    return () => {
      if (videoStream) {
        videoStream.getTracks().forEach((track) => track.stop())
      }
    }
  }, [videoStream])

  // Drag & drop triggers
  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0]
      await processFile(file)
    }
  }

  const handleFileSelect = async (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      await processFile(file)
    }
  }

  // Process files through Gemini Vision API
  const processFile = async (file) => {
    if (!['image/jpeg', 'image/jpg', 'image/png'].includes(file.type)) {
      setUploadError('Unsupported format. Please select JPG or PNG.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('File is too large. Max size allowed is 5 MB.')
      return
    }

    setUploading(true)
    setUploadError(null)
    setUploadFile(file)
    setIsDuplicate(false)
    setExistingStockQty(null)
    setIsNonMedicineWarning(false)
    setDupChoice(null)
    setConfirmedFields({})
    setRiskAcknowledged(false)
    setExpiredReason('')
    setPipelineStage('uploaded')

    try {
      // Simulate pipeline progression visually
      await new Promise(r => setTimeout(r, 600))
      setPipelineStage('ocr')
      
      const data = await uploadImage(file)
      if (data.status === 'extraction_failed') {
        throw new Error(data.error_message || 'AI extraction failed. Image might be unreadable.')
      }

      await new Promise(r => setTimeout(r, 450))
      setPipelineStage('duplicate')

      // Check for non-medicine warning
      const nameConf = data.confidence?.medicine_name
      if (!data.medicine_name && (nameConf === null || nameConf === undefined || nameConf < 30)) {
        setIsNonMedicineWarning(true)
      }

      // Duplicate batch checks
      if (data.medicine_name) {
        try {
          const dupCheck = await checkDuplicate(data.medicine_name, data.batch_number)
          if (dupCheck.exists) {
            setIsDuplicate(true)
            setExistingStockQty(dupCheck.current_quantity)
          }
        } catch (e) {
          // ignore check error
        }
      }

      await new Promise(r => setTimeout(r, 400))
      setPipelineStage('ready')

      setCurrentRecord(data)
      setValues({
        medicine_name: data.medicine_name ?? '',
        strength: data.strength ?? '',
        manufacturer: data.manufacturer ?? '',
        batch_number: data.batch_number ?? '',
        expiry_date: data.expiry_date ?? '',
        mrp: data.mrp !== null ? data.mrp.toString() : '',
        purchase_price: '',
        quantity: '1',
        storage_location: '',
      })

      // Generate preview URL
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)

      setActiveStep('confirm')
    } catch (err) {
      setUploadError(err.message || 'Failed to extract information from carton image.')
      setUploadFile(null)
      setPipelineStage('idle')
    } finally {
      setUploading(false)
    }
  }

  // Handle Save
  const handleConfirmSave = async (e) => {
    e.preventDefault()
    if (!currentRecord || isSaving) return

    setIsSaving(true)
    setSaveError(null)

    // Clear batch number if user opted to create new line for duplicate
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

    try {
      const newMed = await confirmIntake(currentRecord.extraction_record_id, payload)
      if (newMed.location_assignment) {
        setSavedMedicine(newMed)
        setLocationInfo({
          auto_assigned: true,
          assigned_location: newMed.location_assignment,
          message: `Store in ${newMed.location_assignment.label} — same as existing stock.`
        })
        setActiveStep('location_confirm')
      } else if (newMed.location_candidates) {
        setSavedMedicine(newMed)
        setLocationInfo({
          auto_assigned: false,
          candidates: newMed.location_candidates,
          message: "Select a storage location for this medicine."
        })
        // Pre-select first candidate if any
        if (newMed.location_candidates.length > 0) {
          setSelectedLocationId(newMed.location_candidates[0].location_id)
          setActiveRack(newMed.location_candidates[0].rack_name)
        }
        setActiveStep('location_confirm')
        // Load active locations list
        try {
          const res = await getLocations()
          const locs = res.locations || []
          setAllLocations(locs)
          if (newMed.location_candidates.length > 0) {
            setActiveRack(newMed.location_candidates[0].rack_name)
          } else if (locs.length > 0) {
            const uniqueRacks = [...new Set(locs.map(l => l.rack_name))]
            setActiveRack(uniqueRacks[0])
          }
        } catch (e) {
          console.error("Failed to load locations:", e)
        }
      } else {
        showToast(`"${newMed.name}" added to inventory successfully!`, 'success')
        handleCancel()
      }
    } catch (err) {
      setSaveError(err.message || 'Failed to save medicine records.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleConfirmLocationSubmit = async () => {
    if (!savedMedicine || isSaving) return

    setIsSaving(true)
    setSaveError(null)

    try {
      let locationId = selectedLocationId

      if (showCustomForm) {
        // Create custom location first
        const payload = {
          rack_name: customLocation.rack_name.trim(),
          row: parseInt(customLocation.row),
          column: parseInt(customLocation.column),
          capacity: parseInt(customLocation.capacity) || 20,
          storage_type: customLocation.storage_type
        }
        const newLoc = await createLocation(payload)
        locationId = newLoc.id
      }

      // Call confirm-location endpoint
      const confirmPayload = {
        medicine_id: savedMedicine.id,
        location_id: locationId,
        quantity: parseInt(values.quantity) || 1
      }
      await confirmLocation(confirmPayload)
      showToast(`Stock location assigned successfully!`, 'success')
      handleCancel()
    } catch (err) {
      setSaveError(err.message || 'Failed to assign storage location.')
    } finally {
      setIsSaving(false)
    }
  }

  const getRacksList = () => {
    const racks = allLocations.map(loc => loc.rack_name)
    if (customLocation.rack_name.trim()) {
      racks.push(customLocation.rack_name.trim())
    }
    return [...new Set(racks)].sort()
  }

  const renderRackGrid = () => {
    const rackLocations = allLocations.filter(loc => loc.rack_name === activeRack)
    
    // Determine grid size
    const maxRow = Math.max(...rackLocations.map(l => l.row), 4)
    const maxCol = Math.max(...rackLocations.map(l => l.column), 5)

    const rows = []
    for (let r = 1; r <= maxRow; r++) {
      const cols = []
      for (let c = 1; c <= maxCol; c++) {
        const loc = rackLocations.find(l => l.row === r && l.column === c)
        cols.push({ row: r, col: c, location: loc })
      }
      rows.push(cols)
    }

    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4">
          {rows.map((rowCells, rIdx) => {
            const rowNum = rIdx + 1
            return (
              <div key={rowNum} className="flex gap-4 items-center">
                <span className="w-14 text-[9px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                  Row {rowNum}
                </span>
                
                <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                  {rowCells.map((cell) => {
                    const isSuggested = locationInfo?.candidates?.some(cand => cand.location_id === cell.location?.id)
                    const isSelected = selectedLocationId === cell.location?.id
                    const isCustomHover = !cell.location && showCustomForm && parseInt(customLocation.row) === cell.row && parseInt(customLocation.column) === cell.col

                    let cellBg = 'bg-surface-950/20 border-slate-900/60 text-slate-600 hover:border-slate-800'
                    let clickHandler = () => {
                      setCustomLocation(prev => ({
                        ...prev,
                        rack_name: activeRack,
                        row: cell.row.toString(),
                        column: cell.col.toString()
                      }))
                      setShowCustomForm(true)
                      setSelectedLocationId(null)
                    }

                    if (cell.location) {
                      const isFull = cell.location.current_occupancy >= cell.location.capacity

                      if (isSelected) {
                        cellBg = 'bg-primary-glow border-primary text-primary shadow-glow cursor-pointer'
                      } else if (isSuggested) {
                        cellBg = 'bg-amber-500/10 border-amber-500/40 text-amber-300 hover:border-amber-500/70 cursor-pointer animate-pulse'
                      } else if (isFull) {
                        cellBg = 'bg-rose-950/10 border-rose-950/30 text-rose-500/60 cursor-not-allowed opacity-60'
                      } else {
                        cellBg = 'bg-surface-900/40 border-slate-800 text-slate-300 hover:border-slate-700 cursor-pointer'
                      }

                      clickHandler = () => {
                        if (isFull) return
                        setSelectedLocationId(cell.location.id)
                        setShowCustomForm(false)
                      }
                    } else {
                      if (isCustomHover) {
                        cellBg = 'bg-primary-glow border-primary text-primary border-dashed cursor-pointer'
                      } else {
                        cellBg = 'bg-surface-950/10 border-slate-950/40 border-dashed text-slate-700 hover:text-slate-500 hover:border-slate-850 cursor-pointer'
                      }
                    }

                    return (
                      <button
                        key={`${cell.row}-${cell.col}`}
                        type="button"
                        onClick={clickHandler}
                        className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition text-center select-none min-h-[70px] ${cellBg}`}
                      >
                        <span className="text-[10px] font-bold font-mono">
                          Col {cell.col}
                        </span>
                        {cell.location ? (
                          <div className="flex flex-col items-center gap-1 w-full">
                            <span className="text-[8px] font-bold opacity-85 uppercase tracking-wider px-1 py-0.2 rounded bg-surface-950/80 border border-slate-900 text-slate-400">
                              {cell.location.storage_type}
                            </span>
                            <div className="w-full h-1 bg-surface-950 rounded-full overflow-hidden">
                              <div 
                                className={`h-full ${isSelected ? 'bg-primary' : isSuggested ? 'bg-amber-400' : 'bg-emerald-400'}`} 
                                style={{ width: `${Math.min((cell.location.current_occupancy / cell.location.capacity) * 100, 100)}%` }} 
                              />
                            </div>
                            <span className="text-[8px] font-mono text-slate-500">
                              {cell.location.current_occupancy}/{cell.location.capacity}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[8px] opacity-60 font-bold">+ New</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const handleCancel = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl('')
    }
    setUploadFile(null)
    setCurrentRecord(null)
    setSaveError(null)
    setIsDuplicate(false)
    setExistingStockQty(null)
    setIsNonMedicineWarning(false)
    setDupChoice(null)
    setActiveStep('upload')
    setPipelineStage('idle')
    setSavedMedicine(null)
    setLocationInfo(null)
    setSelectedLocationId(null)
    setShowCustomForm(false)
    setCustomLocation({
      rack_name: 'Rack A',
      row: '',
      column: '',
      capacity: 20,
      storage_type: 'shelf',
    })
  }

  // Risk warnings evaluation helpers
  const isDateExpired = () => {
    if (!values.expiry_date) return false
    const parts = values.expiry_date.split('-')
    if (parts.length !== 3) return false
    const expDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
    const today = new Date()
    today.setHours(0,0,0,0)
    expDate.setHours(0,0,0,0)
    return expDate.getTime() < today.getTime()
  }

  const getDaysUntilExpiry = () => {
    if (!values.expiry_date) return null
    const parts = values.expiry_date.split('-')
    if (parts.length !== 3) return null
    const expDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
    const today = new Date()
    today.setHours(0,0,0,0)
    expDate.setHours(0,0,0,0)
    const diff = expDate.getTime() - today.getTime()
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
  }

  const getFieldMeta = (field) => {
    if (!currentRecord) return { status: 'red', score: 0, label: 'No Data' }
    const confidenceScore = currentRecord.confidence?.[field]
    const value = values[field]

    const hasExplicitConfidence = ['medicine_name', 'expiry_date', 'batch_number'].includes(field)
    if (hasExplicitConfidence) {
      if (confidenceScore === undefined || confidenceScore === null) {
        return { status: 'red', score: null, label: 'Missing Info' }
      }
      if (confidenceScore >= 90) return { status: 'green', score: confidenceScore, label: `High (${confidenceScore}%)` }
      if (confidenceScore >= 60) return { status: 'yellow', score: confidenceScore, label: `Verify (${confidenceScore}%)` }
      return { status: 'red', score: confidenceScore, label: `Low (${confidenceScore}%)` }
    } else {
      const isPresent = value !== undefined && value !== null && value.toString().trim() !== ''
      return isPresent 
        ? { status: 'green', score: 100, label: 'Detected' }
        : { status: 'red', score: 0, label: 'Missing Field' }
    }
  }

  const handleFieldChange = (field, val) => {
    setValues((prev) => ({ ...prev, [field]: val }))
    if (field === 'expiry_date') {
      setRiskAcknowledged(false)
      setExpiredReason('')
    }
    const meta = getFieldMeta(field)
    if (meta.status === 'yellow') {
      setConfirmedFields((prev) => ({ ...prev, [field]: true }))
    }
  }

  const toggleConfirmField = (field) => {
    setConfirmedFields((prev) => ({ ...prev, [field]: !prev[field] }))
  }

  // Form validations logic
  const isFormValid = () => {
    const fields = ['medicine_name', 'strength', 'manufacturer', 'batch_number', 'expiry_date', 'mrp', 'purchase_price']
    for (const f of fields) {
      const val = values[f]
      const meta = getFieldMeta(f)
      if (meta.status === 'red' && (!val || val.toString().trim() === '')) return false
      if (meta.status === 'yellow' && !confirmedFields[f]) return false
    }
    if (!values.medicine_name.trim()) return false
    if (values.purchase_price && parseFloat(values.purchase_price) < 0) return false
    return true
  }

  const daysUntilExpiry = getDaysUntilExpiry()
  const isRiskAlertActive = daysUntilExpiry !== null && daysUntilExpiry <= RISK_EXPIRY_DAYS_THRESHOLD && (parseInt(values.quantity) || 0) > RISK_QUANTITY_THRESHOLD
  const riskGateOk = !isRiskAlertActive || riskAcknowledged

  const isExpiredActive = isDateExpired()
  const expiredGateOk = !isExpiredActive || expiredReason === 'confirmed_correct'
  const dupGateOk = !isDuplicate || dupChoice !== null

  const isSaveEnabled = isFormValid() && riskGateOk && expiredGateOk && dupGateOk

  const pipelineStages = [
    { key: 'uploaded', label: 'Carton Uploaded' },
    { key: 'ocr', label: 'Gemini OCR Parsing' },
    { key: 'duplicate', label: 'Batch Indexing' },
    { key: 'ready', label: 'Validation Ready' }
  ]

  return (
    <div className="panel-enter flex flex-col gap-6 font-sans">
      
      {/* Upload View State */}
      {activeStep === 'upload' && (
        <>
          <div className="panel-header">
            <div>
              <h2 className="panel-title flex items-center gap-2">
                <span>📸</span> Vision Intake Scanner
              </h2>
              <p className="panel-subtitle">Upload drug container carton photos to auto-extract stock metadata</p>
            </div>
          </div>

          {/* Pipeline visualization stepper */}
          {pipelineStage !== 'idle' && (
            <div className="grid grid-cols-4 gap-4 p-4 border border-border bg-surface-950/40 rounded-2xl text-xs font-mono select-none">
              {pipelineStages.map((stage) => {
                const isActive = pipelineStage === stage.key
                const isCleared = ['uploaded', 'ocr', 'duplicate', 'ready'].indexOf(pipelineStage) >= ['uploaded', 'ocr', 'duplicate', 'ready'].indexOf(stage.key)
                
                return (
                  <div key={stage.key} className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold ${
                        isActive ? 'bg-primary text-white animate-pulse' : isCleared ? 'bg-emerald-500 text-white' : 'bg-surface-850 text-slate-500'
                      }`}>
                        {isCleared ? '✓' : ''}
                      </span>
                      <span className={isActive ? 'text-primary font-bold' : isCleared ? 'text-slate-200 font-semibold' : 'text-slate-500'}>
                        {stage.label}
                      </span>
                    </div>
                    <div className={`h-1 rounded-full ${
                      isCleared ? 'bg-gradient-primary' : 'bg-surface-850'
                    }`} />
                  </div>
                )
              })}
            </div>
          )}

          {uploadError && (
            <div className="alert alert-danger py-3 text-xs leading-normal">
              <span>⚠</span>
              <span>{uploadError}</span>
            </div>
          )}

          <div className="w-full max-w-2xl mx-auto">
            {isCameraActive ? (
              <GlassCard className="p-6 flex flex-col items-center justify-center gap-4 border border-slate-800">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full max-h-[260px] object-cover rounded-xl bg-black border border-slate-700"
                />
                <div className="flex gap-3 mt-2">
                  <button onClick={capturePhoto} className="btn-primary py-2 px-5 text-xs uppercase tracking-wider font-extrabold">
                    Capture Photo
                  </button>
                  <button onClick={stopCamera} className="btn-ghost py-2 px-4 text-xs text-rose-400 border-rose-500/20">
                    Cancel
                  </button>
                </div>
              </GlassCard>
            ) : (
              <GlassCard
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                className={`p-10 min-h-[320px] flex flex-col items-center justify-center text-center gap-5 cursor-pointer transition border-2 border-dashed ${
                  dragActive
                    ? 'border-primary bg-primary-glow shadow-glow'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <input
                  type="file"
                  id="file-upload-input"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileSelect}
                  disabled={uploading}
                />

                <label htmlFor="file-upload-input" className="w-full flex flex-col items-center justify-center cursor-pointer gap-4">
                  {uploading ? (
                    <div className="flex flex-col items-center gap-4 py-8">
                      <Spinner size="lg" className="border-t-primary" />
                      <div>
                        <p className="text-slate-200 text-xs font-bold font-mono">EXTRACTING METADATA LABELS...</p>
                        <p className="text-slate-500 text-[10px] mt-1 animate-pulse">Consulting Gemini Vision model indices</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-surface-900/60 border border-slate-800 flex items-center justify-center shadow-inner text-2xl select-none">
                        📸
                      </div>
                      <div>
                        <p className="text-slate-200 text-xs font-bold">
                          Drag &amp; drop container box photo here, or <span className="text-primary hover:underline">browse</span>
                        </p>
                        <p className="text-slate-500 text-[10px] mt-1.5 leading-normal">
                          Supports JPG, JPEG, and PNG images up to 5 MB
                        </p>
                      </div>
                    </div>
                  )}
                </label>

                {!uploading && (
                  <div className="flex items-center gap-3 mt-2" onClick={(e) => e.stopPropagation()}>
                    <span className="text-[10px] text-slate-500 font-bold uppercase select-none">or</span>
                    <button onClick={startCamera} className="btn-primary py-2 px-5 text-xs font-extrabold uppercase tracking-wider">
                      📷 Open Web Camera
                    </button>
                  </div>
                )}
              </GlassCard>
            )}
          </div>
        </>
      )}

      {/* Confirmation View State (Side-by-Side Canvas) */}
      {activeStep === 'confirm' && (
        <div className="flex flex-col gap-6">
          <div className="panel-header border-b border-slate-900 pb-4">
            <div>
              <h2 className="panel-title flex items-center gap-2">
                <span>📋</span> Side-by-Side Verification Canvas
              </h2>
              <p className="panel-subtitle">Review Gemini confidence indices before confirming inventory insert</p>
            </div>
            <button onClick={handleCancel} className="btn-ghost py-1.5 px-3.5 text-xs font-bold">
              ← Cancel &amp; Scan another
            </button>
          </div>

          {/* Warning boxes */}
          {isNonMedicineWarning && (
            <div className="alert alert-warning py-3 text-xs leading-normal">
              <span>🖼️</span>
              <div>
                <strong>Verify Alert:</strong> No medicine identified with high confidence. All fields require manual verification.
              </div>
            </div>
          )}

          {isDuplicate && (
            <GlassCard className="p-4 border-sky-500/20 bg-sky-950/5 flex flex-col gap-3">
              <p className="text-xs text-sky-300 font-semibold">
                Batch already exists in inventory (Current Stock: {existingStockQty} units)
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setDupChoice('add')}
                  className={`btn-ghost flex-1 py-2 text-xs font-semibold ${
                    dupChoice === 'add' ? 'bg-sky-500/10 border-sky-500/40 text-sky-300' : ''
                  }`}
                >
                  ➕ Add to existing stock level
                </button>
                <button
                  type="button"
                  onClick={() => setDupChoice('new')}
                  className={`btn-ghost flex-1 py-2 text-xs font-semibold ${
                    dupChoice === 'new' ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-300' : ''
                  }`}
                >
                  🆕 Create separate catalog line
                </button>
              </div>
            </GlassCard>
          )}

          {saveError && (
            <div className="alert alert-danger py-3 text-xs leading-normal">
              <span>⚠</span>
              <span>{saveError}</span>
            </div>
          )}

          {/* Form wrapper */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Scanned image preview with vertical scan line (Left column 5 cols) */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              <GlassCard className="p-3 relative overflow-hidden">
                {uploading && <div className="animate-scan-line pointer-events-none" />}
                <div className="rounded-xl overflow-hidden bg-surface-950 aspect-square flex items-center justify-center border border-slate-900">
                  {previewUrl ? (
                    <img src={previewUrl} alt="Scanned preview" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-slate-600 text-xs font-semibold font-mono">No Preview</span>
                  )}
                </div>
              </GlassCard>
            </div>

            {/* Input grid (Right column 7 cols) */}
            <form onSubmit={handleConfirmSave} className="lg:col-span-7 flex flex-col gap-6">
              <GlassCard className="p-6 flex flex-col gap-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pb-2 border-b border-border">
                  AI extracted inputs
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { key: 'medicine_name', label: 'Medicine Name', type: 'text' },
                    { key: 'strength', label: 'Dosage Strength', type: 'text' },
                    { key: 'manufacturer', label: 'Manufacturer', type: 'text' },
                    { key: 'batch_number', label: 'Batch/Lot Number', type: 'text' },
                    { key: 'expiry_date', label: 'Expiry Date', type: 'date' },
                    { key: 'mrp', label: 'Max Retail Price (MRP)', type: 'number', step: '0.01' },
                    { key: 'purchase_price', label: 'Purchase Cost Price', type: 'number', step: '0.01' }
                  ].map((field) => {
                    const meta = getFieldMeta(field.key)
                    const isConfirmed = confirmedFields[field.key]
                    
                    let cardBorder = 'border-slate-900'
                    if (meta.status === 'green') cardBorder = 'border-emerald-500/20'
                    if (meta.status === 'yellow' && !isConfirmed) cardBorder = 'border-amber-500/30 animate-pulse'
                    if (meta.status === 'red' && !values[field.key]) cardBorder = 'border-rose-500/30'

                    return (
                      <div key={field.key} className={`p-4.5 rounded-xl border ${cardBorder} bg-surface-900/10 flex flex-col gap-2`}>
                        <div className="flex justify-between items-center">
                          <label className="text-[9px] font-bold uppercase text-slate-500 tracking-wider">
                            {field.label}
                          </label>
                          <Badge variant={meta.status === 'yellow' && isConfirmed ? 'success' : meta.status} className="font-mono text-[8px]">
                            {meta.status === 'yellow' && isConfirmed ? 'Confirmed' : meta.label}
                          </Badge>
                        </div>

                        <div className="flex gap-2">
                          <input
                            type={field.type}
                            step={field.step}
                            value={values[field.key]}
                            required={meta.status === 'red'}
                            onChange={(e) => handleFieldChange(field.key, e.target.value)}
                            className="input-base py-1.5 text-xs font-semibold"
                          />
                          {meta.status === 'yellow' && (
                            <button
                              type="button"
                              onClick={() => toggleConfirmField(field.key)}
                              className={`px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer transition ${
                                isConfirmed
                                  ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                                  : 'bg-amber-500/10 border-amber-500/25 text-amber-400'
                              }`}
                            >
                              ✓
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </GlassCard>

              {/* Quantities & location cards */}
              <GlassCard className="p-5 flex flex-col gap-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pb-2 border-b border-border">
                  Catalog details
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5 font-semibold text-xs">
                    <label className="text-[9px] font-bold uppercase text-slate-550">Add Quantity</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={values.quantity}
                      onChange={(e) => {
                        setValues((prev) => ({ ...prev, quantity: e.target.value }))
                        setRiskAcknowledged(false)
                      }}
                      className="input-base py-1.5 font-bold font-mono"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 font-semibold text-xs">
                    <label className="text-[9px] font-bold uppercase text-slate-550">Rack Location</label>
                    <input
                      type="text"
                      placeholder="e.g. Shelf A4, Drawer 2"
                      value={values.storage_location}
                      onChange={(e) => setValues((prev) => ({ ...prev, storage_location: e.target.value }))}
                      className="input-base py-1.5"
                    />
                  </div>
                </div>
              </GlassCard>

              {/* Bulk stock near-expiry alerts */}
              {isRiskAlertActive && (
                <div className="alert alert-warning py-3 text-xs leading-normal">
                  <span>⚠️</span>
                  <div className="flex flex-col gap-1">
                    <strong>Purchase Risk Alert: Near-Expiry Bulk Stock</strong>
                    <p className="opacity-90">
                      You are adding {values.quantity} units of a medicine expiring in {daysUntilExpiry} days.
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        type="checkbox"
                        id="risk-chk"
                        checked={riskAcknowledged}
                        onChange={(e) => setRiskAcknowledged(e.target.checked)}
                        className="cursor-pointer w-4 h-4"
                      />
                      <label htmlFor="risk-chk" className="cursor-pointer font-bold text-slate-200">
                        I have reviewed this risk, proceed anyway
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Expired Stock Warning */}
              {isExpiredActive && (
                <div className="alert alert-danger py-4 text-xs leading-normal">
                  <span>🚨</span>
                  <div className="flex flex-col gap-2 flex-grow">
                    <strong>Critical Alert: Already-Expired Stock</strong>
                    <p className="opacity-90">
                      This medicine's expiry date has already passed. Confirm logs for write-off/disposal.
                    </p>
                    <select
                      value={expiredReason}
                      onChange={(e) => {
                        if (e.target.value === 'misread') {
                          handleFieldChange('expiry_date', '')
                          setExpiredReason('')
                        } else {
                          setExpiredReason(e.target.value)
                        }
                      }}
                      className="input-base bg-surface-950 font-bold"
                    >
                      <option value="">-- Select explicit reason --</option>
                      <option value="confirmed_correct">Confirmed correct — logging for write-off/disposal</option>
                      <option value="misread">Date was misread — let me re-enter it</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Form Controls */}
              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={!isSaveEnabled || isSaving}
                  className="btn-primary flex-grow py-3 text-xs uppercase tracking-wider font-extrabold"
                >
                  {isSaving ? 'Saving to inventory…' : '📥 Save to inventory'}
                </button>
                <button type="button" onClick={handleCancel} className="btn-ghost px-6 py-3">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Location Confirmation step */}
      {activeStep === 'location_confirm' && (
        <div className="flex flex-col gap-6">
          <div className="panel-header border-b border-slate-900 pb-4 flex justify-between items-center">
            <div>
              <h2 className="panel-title flex items-center gap-2">
                <span>📍</span> Storage Location Assignment
              </h2>
              <p className="panel-subtitle">
                Assign a shelf or rack location for "{savedMedicine?.name}" (Batch: {savedMedicine?.batch_number || 'N/A'}, Qty: {values.quantity})
              </p>
            </div>
            <button onClick={handleCancel} className="btn-ghost py-1.5 px-3.5 text-xs font-bold">
              Skip Assignment
            </button>
          </div>

          {saveError && (
            <div className="alert alert-danger py-3 text-xs leading-normal">
              <span>⚠</span>
              <span>{saveError}</span>
            </div>
          )}

          {locationInfo?.auto_assigned ? (
            <GlassCard className="p-8 max-w-xl mx-auto text-center flex flex-col items-center gap-6 border-emerald-500/25 bg-emerald-950/5">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-3xl select-none animate-bounce">
                ✓
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-lg font-bold text-emerald-400">Stock Automatically Placed</h3>
                <p className="text-sm text-slate-350 font-medium">
                  {locationInfo.message}
                </p>
                <div className="mt-4 p-4 rounded-xl bg-surface-950/80 border border-slate-800 inline-block font-mono text-xs">
                  <span className="text-slate-500">RACK:</span> <span className="text-emerald-400 font-bold">{locationInfo.assigned_location.rack_name}</span> &nbsp;|&nbsp; 
                  <span className="text-slate-500"> ROW:</span> <span className="text-slate-200">{locationInfo.assigned_location.row}</span> &nbsp;|&nbsp; 
                  <span className="text-slate-500"> COL:</span> <span className="text-slate-200">{locationInfo.assigned_location.column}</span>
                </div>
              </div>
              <button onClick={handleCancel} className="btn-primary mt-4 py-2.5 px-6 text-xs uppercase tracking-wider font-extrabold">
                Done / Scan Another
              </button>
            </GlassCard>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              
              {/* Left sidebar - suggested slots & custom creation */}
              <div className="lg:col-span-4 flex flex-col gap-6">
                
                {/* Suggestions Card */}
                <GlassCard className="p-5 flex flex-col gap-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pb-2 border-b border-border">
                    Suggested Slots
                  </h3>
                  <div className="flex flex-col gap-3">
                    {locationInfo?.candidates && locationInfo.candidates.length > 0 ? (
                      locationInfo.candidates.map((cand) => {
                        const isSelected = selectedLocationId === cand.location_id
                        return (
                          <button
                            key={cand.location_id}
                            type="button"
                            onClick={() => {
                              setSelectedLocationId(cand.location_id)
                              setActiveRack(cand.rack_name)
                              setShowCustomForm(false)
                            }}
                            className={`w-full text-left p-4.5 rounded-xl border transition cursor-pointer flex flex-col gap-2 ${
                              isSelected
                                ? 'bg-primary-glow border-primary shadow-glow'
                                : 'bg-surface-900/10 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex justify-between items-center">
                              <span className="text-xs font-bold text-slate-200">{cand.label}</span>
                              <Badge variant="yellow" className="text-[8px] uppercase tracking-wider">Candidate</Badge>
                            </div>
                            <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono">
                              <span>Type: {cand.storage_type}</span>
                              <span>Available: {cand.available} units</span>
                            </div>
                          </button>
                        )
                      })
                    ) : (
                      <p className="text-xs text-slate-500">No suggestions available.</p>
                    )}
                  </div>
                </GlassCard>

                {/* Custom slot creation card */}
                <GlassCard className="p-5 flex flex-col gap-4">
                  <div className="flex justify-between items-center pb-2 border-b border-border">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Or Use Custom Location
                    </h3>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCustomForm(!showCustomForm)
                        setSelectedLocationId(null)
                      }}
                      className="text-[10px] font-bold text-primary hover:underline"
                    >
                      {showCustomForm ? 'Cancel Custom' : 'Define Custom'}
                    </button>
                  </div>

                  {showCustomForm ? (
                    <div className="flex flex-col gap-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5 text-xs">
                          <label className="text-[9px] uppercase font-bold text-slate-500">Rack Name</label>
                          <input
                            type="text"
                            placeholder="e.g. Rack C"
                            value={customLocation.rack_name}
                            onChange={(e) => setCustomLocation(prev => ({ ...prev, rack_name: e.target.value }))}
                            className="input-base py-1.5"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5 text-xs">
                          <label className="text-[9px] uppercase font-bold text-slate-500">Storage Type</label>
                          <select
                            value={customLocation.storage_type}
                            onChange={(e) => setCustomLocation(prev => ({ ...prev, storage_type: e.target.value }))}
                            className="input-base py-1.5 font-bold"
                          >
                            <option value="shelf">Shelf</option>
                            <option value="refrigerator">Refrigerator</option>
                            <option value="controlled">Controlled</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div className="flex flex-col gap-1.5 text-xs">
                          <label className="text-[9px] uppercase font-bold text-slate-500">Row</label>
                          <input
                            type="number"
                            min="1"
                            placeholder="1"
                            value={customLocation.row}
                            onChange={(e) => setCustomLocation(prev => ({ ...prev, row: e.target.value }))}
                            className="input-base py-1.5 font-mono"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5 text-xs">
                          <label className="text-[9px] uppercase font-bold text-slate-500">Col</label>
                          <input
                            type="number"
                            min="1"
                            placeholder="1"
                            value={customLocation.column}
                            onChange={(e) => setCustomLocation(prev => ({ ...prev, column: e.target.value }))}
                            className="input-base py-1.5 font-mono"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5 text-xs">
                          <label className="text-[9px] uppercase font-bold text-slate-500">Capacity</label>
                          <input
                            type="number"
                            min="1"
                            value={customLocation.capacity}
                            onChange={(e) => setCustomLocation(prev => ({ ...prev, capacity: e.target.value }))}
                            className="input-base py-1.5 font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-550 leading-normal">
                      Click a candidate above, select any empty/dashed cell in the grid to customize, or toggle custom definition inputs.
                    </p>
                  )}
                </GlassCard>

                {/* Confirm / skip controls */}
                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    disabled={isSaving || (!selectedLocationId && (!showCustomForm || !customLocation.rack_name || !customLocation.row || !customLocation.column))}
                    onClick={handleConfirmLocationSubmit}
                    className="btn-primary w-full py-3 text-xs uppercase tracking-wider font-extrabold"
                  >
                    {isSaving ? 'Assigning location...' : 'Confirm Location Assignment'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="btn-ghost w-full py-2.5 text-xs text-rose-450 border-rose-500/10 hover:bg-rose-500/5"
                  >
                    Skip &amp; Scan Another
                  </button>
                </div>

              </div>

              {/* Right column - interactive layout grid */}
              <div className="lg:col-span-8 flex flex-col gap-6">
                <GlassCard className="p-6 flex flex-col gap-6">
                  <div className="flex justify-between items-center pb-3 border-b border-border">
                    <div className="flex gap-2">
                      {getRacksList().map((rack) => (
                        <button
                          key={rack}
                          type="button"
                          onClick={() => {
                            setActiveRack(rack)
                            setShowCustomForm(false)
                          }}
                          className={`px-3.5 py-1.5 rounded-lg border text-xs font-bold cursor-pointer transition ${
                            activeRack === rack
                              ? 'bg-primary-glow border-primary text-primary font-extrabold shadow-glow'
                              : 'bg-surface-900/30 border-slate-800 text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          📦 {rack}
                        </button>
                      ))}
                    </div>
                    <Badge variant="info" className="font-mono text-[9px] uppercase tracking-wider">
                      Interactive Layout
                    </Badge>
                  </div>

                  {activeRack ? (
                    renderRackGrid()
                  ) : (
                    <div className="py-16 text-center text-slate-500 font-mono text-xs">
                      No racks available. Define a custom location on the left to start.
                    </div>
                  )}
                </GlassCard>
              </div>

            </div>
          )}

        </div>
      )}

    </div>
  )
}
