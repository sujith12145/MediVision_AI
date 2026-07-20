import { useEffect, useState, useRef } from 'react'
import { useAuth } from './contexts/AuthContext'
import LoginPage from './pages/LoginPage'
import ConfirmationScreen from './components/ConfirmationScreen'
import InventoryTable from './components/InventoryTable'
import ReorderSuggestions from './components/ReorderSuggestions'
import SmartReorderPrediction from './components/SmartReorderPrediction'
import AssistantChat from './components/AssistantChat'

import MonthlyOverview from './components/MonthlyOverview'
import BillingAndSales from './components/BillingAndSales'
import QRScannerLookup from './components/QRScannerLookup'
import { uploadImage, confirmIntake, checkDuplicate } from './services/api'
import { supabase } from './services/supabase'

export default function App() {
  const { isAuthenticated, signOut } = useAuth()
  
  // Dashboard Steps: 'upload' | 'confirm'
  const [activeStep, setActiveStep] = useState('upload')
  const [currentRecord, setCurrentRecord] = useState(null)
  const [uploadFile, setUploadFile] = useState(null)
  const [prefilledMedicineForBilling, setPrefilledMedicineForBilling] = useState(null)
  
  // Inventory refresh trigger
  const [refreshCounter, setRefreshCounter] = useState(0)
  
  // Upload and Save states
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)

  // Duplicate-batch and non-medicine-image detection flags
  const [isDuplicate, setIsDuplicate] = useState(false)
  const [existingStockQty, setExistingStockQty] = useState(null)
  const [isNonMedicineWarning, setIsNonMedicineWarning] = useState(false)

  // Current logged in user email
  const [userEmail, setUserEmail] = useState('')
  const [userRole, setUserRole] = useState('staff')
  const [activeTab, setActiveTab] = useState('inventory') // 'inventory' or 'assistant'

  // Camera capture states, ref, and handlers
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState(null)
  const [videoStream, setVideoStream] = useState(null)
  const videoRef = useRef(null)

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
      setCameraError('Camera access denied or unavailable. Please check permissions.')
      setIsCameraActive(false)
    }
  }

  const stopCamera = () => {
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop())
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

  // Bind stream to video element when ready
  useEffect(() => {
    if (isCameraActive && videoStream && videoRef.current) {
      videoRef.current.srcObject = videoStream
    }
  }, [isCameraActive, videoStream])

  // Stop camera if active tab changes
  useEffect(() => {
    if (activeTab !== 'inventory') {
      stopCamera()
    }
  }, [activeTab])

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop())
      }
    }
  }, [videoStream])

  // Load user details
  useEffect(() => {
    if (!isAuthenticated) return
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? '')
      setUserRole(data.user?.user_metadata?.role ?? 'staff')
    })
  }, [isAuthenticated])



  // Auto-dismiss success message after 5 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [successMessage])

  // ── Drag & Drop Handlers ───────────────────────────────────────────────────
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

  // Upload file and call extraction API
  const processFile = async (file) => {
    // Basic validation
    if (!['image/jpeg', 'image/jpg', 'image/png'].includes(file.type)) {
      setUploadError('Unsupported file format. Please upload a JPG or PNG image.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('File is too large. Max size allowed is 5 MB.')
      return
    }

    setUploading(true)
    setUploadError(null)
    setSuccessMessage(null)
    setUploadFile(file)
    // Reset edge-case flags for each new upload
    setIsDuplicate(false)
    setExistingStockQty(null)
    setIsNonMedicineWarning(false)

    try {
      const data = await uploadImage(file)
      if (data.status === 'extraction_failed') {
        throw new Error(data.error_message || 'AI extraction failed. The image might be blurry or unreadable.')
      }

      // ── Edge case 3: non-medicine image detection ──────────────────────
      // If the AI couldn't even identify a medicine name with meaningful
      // confidence, the image is almost certainly not a medicine carton.
      const nameConf = data.confidence?.medicine_name
      if (!data.medicine_name && (nameConf === null || nameConf === undefined || nameConf < 30)) {
        setIsNonMedicineWarning(true)
      }

      // ── Edge case 2: duplicate batch detection ─────────────────────────
      // Only check if the AI extracted at least a medicine name.
      if (data.medicine_name) {
        try {
          const dupCheck = await checkDuplicate(data.medicine_name, data.batch_number)
          if (dupCheck.exists) {
            setIsDuplicate(true)
            setExistingStockQty(dupCheck.current_quantity)
          }
        } catch {
          // Non-fatal: if the check fails, let the user proceed normally.
          // The backend confirm endpoint will still handle the top-up.
        }
      }

      setCurrentRecord(data)
      setActiveStep('confirm')
    } catch (err) {
      setUploadError(err.message || 'Failed to extract information from image.')
      setUploadFile(null)
    } finally {
      setUploading(false)
    }
  }

  // ── Save Confirmation ──────────────────────────────────────────────────────
  const handleConfirmSave = async (recordId, payload) => {
    setIsSaving(true)
    setSaveError(null)
    try {
      const newMed = await confirmIntake(recordId, payload)
      setSuccessMessage(`"${newMed.name}" successfully added to inventory!`)
      setActiveStep('upload')
      setUploadFile(null)
      setCurrentRecord(null)
      setRefreshCounter(prev => prev + 1) // Trigger inventory table refresh
    } catch (err) {
      setSaveError(err.message || 'Failed to save medicine to inventory.')
    } finally {
      setIsSaving(false)
    }
  }

  // Cancel confirmation
  const handleCancel = () => {
    setUploadFile(null)
    setCurrentRecord(null)
    setSaveError(null)
    setIsDuplicate(false)
    setExistingStockQty(null)
    setIsNonMedicineWarning(false)
    setActiveStep('upload')
  }

  // ── Login Gate ────────────────────────────────────────────────────────────
  if (!isAuthenticated) return <LoginPage />

  return (
    <div className="min-h-dvh flex flex-col bg-surface-900 text-slate-100">
      {/* Ambient background glows */}
      <div aria-hidden="true" className="fixed top-[-10%] left-[-10%] w-[600px] h-[600px] rounded-full bg-primary-500/5 blur-[120px] pointer-events-none" />
      <div aria-hidden="true" className="fixed bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-accent-500/5 blur-[120px] pointer-events-none" />

      {/* Header / Navbar */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-surface-900/80 backdrop-blur-md">
        <div className="max-w-[1600px] mx-auto px-[38px] h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-primary-500 to-accent-500 flex items-center justify-center shadow-lg shadow-primary-500/20 text-sm overflow-hidden select-none">
              🩺
            </div>
            <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-slate-100 to-slate-300 bg-clip-text text-transparent">
              MediVision AI
            </span>
            <span className="text-[10px] uppercase tracking-wider font-semibold bg-primary-500/10 text-primary-400 border border-primary-500/20 px-2 py-0.5 rounded-full ml-1">
              v0.1.0
            </span>
          </div>

          {/* User profile & logout */}
          <div className="flex items-center gap-4">
            {userEmail && (
              <span className="hidden sm:inline text-xs font-medium text-slate-400 bg-surface-800 border border-slate-700/60 rounded-full px-3 py-1">
                👤 {userEmail}
              </span>
            )}
            <button
              id="sign-out-btn"
              onClick={signOut}
              className="text-xs font-semibold text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700 bg-surface-900 hover:bg-surface-800 px-3.5 py-1.5 rounded-lg transition"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-grow max-w-[1600px] w-full mx-auto px-[38px] py-8">
        
        {/* Step 1: Upload and dashboard list */}
        {activeStep === 'upload' && (
          <div className="flex flex-col gap-10">
            
            {/* Notification toasts */}
            {successMessage && (
              <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-950/20 text-emerald-300 flex items-center justify-between gap-3 shadow-lg shadow-emerald-950/10 animate-fade-in">
                <div className="flex items-center gap-2.5 text-sm font-medium">
                  <span>✓</span> {successMessage}
                </div>
                <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-emerald-200 text-xs font-bold">Dismiss</button>
              </div>
            )}

            {uploadError && (
              <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-950/20 text-rose-300 flex items-center justify-between gap-3 shadow-lg shadow-rose-950/10 animate-fade-in">
                <div className="flex items-center gap-2.5 text-sm font-medium">
                  <span>⚠</span> {uploadError}
                </div>
                <button onClick={() => setUploadError(null)} className="text-rose-400 hover:text-rose-200 text-xs font-bold">Dismiss</button>
              </div>
            )}

            {/* Tab Selector */}
            <div className="flex border-b border-slate-800/80 gap-6 text-sm font-semibold mb-2">
              <button
                id="inventory-tab-btn"
                onClick={() => setActiveTab('inventory')}
                className={`pb-3 transition-all relative flex items-center gap-1.5 ${
                  activeTab === 'inventory' 
                    ? 'text-slate-100 border-b-2 border-primary-500' 
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <span>📦</span> Stock & Inventory
              </button>
              <button
                id="scanner-tab-btn"
                onClick={() => setActiveTab('scanner')}
                className={`pb-3 transition-all relative flex items-center gap-1.5 ${
                  activeTab === 'scanner' 
                    ? 'text-slate-100 border-b-2 border-primary-500' 
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <span>🔍🏷️</span> Scan to Lookup
              </button>
              <button
                id="assistant-tab-btn"
                onClick={() => setActiveTab('assistant')}
                className={`pb-3 transition-all relative flex items-center gap-1.5 ${
                  activeTab === 'assistant' 
                    ? 'text-slate-100 border-b-2 border-primary-500' 
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <span>💬</span> AI Assistant Chat
              </button>
              {userRole !== 'staff' && (
                <button
                  id="finance-tab-btn"
                  onClick={() => setActiveTab('finance')}
                  className={`pb-3 transition-all relative flex items-center gap-1.5 ${
                    activeTab === 'finance' 
                      ? 'text-slate-100 border-b-2 border-primary-500' 
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <span>📊</span> Monthly Overview
                </button>
              )}
              <button
                id="billing-tab-btn"
                onClick={() => setActiveTab('billing')}
                className={`pb-3 transition-all relative flex items-center gap-1.5 ${
                  activeTab === 'billing' 
                    ? 'text-slate-100 border-b-2 border-primary-500' 
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <span>💳</span> Billing / Sales
              </button>
            </div>

            {activeTab === 'inventory' ? (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-stretch mb-8">
                  
                  {/* Left: Upload Area (60% width) */}
                  {userRole !== 'staff' && (
                    <div className="lg:col-span-3 border border-slate-800/80 bg-surface-800/40 backdrop-blur-md rounded-3xl p-8 shadow-xl flex flex-col items-center text-center justify-center gap-6 h-[380px]">
                      <div>
                        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-slate-100 via-slate-200 to-slate-400 bg-clip-text text-transparent">
                          Scan Medicine Cartons
                        </h1>
                      </div>

                      {/* Camera Permission Error */}
                      {cameraError && (
                        <div className="w-full mb-3 p-3 rounded-xl border border-rose-500/20 bg-rose-950/20 text-rose-350 text-xs font-semibold flex items-center justify-between">
                          <span>⚠️ Camera Error: {cameraError}</span>
                          <button onClick={() => setCameraError(null)} className="text-rose-450 hover:text-rose-350 font-bold ml-2">×</button>
                        </div>
                      )}

                      {/* Upload Drop Zone card */}
                      <div className="w-full">
                        {isCameraActive ? (
                          <div className="relative border border-slate-800 bg-surface-900/60 rounded-2xl p-4 flex flex-col items-center justify-center text-center transition-all duration-300 min-h-[220px] gap-4" onClick={(e) => e.stopPropagation()}>
                            <video
                              ref={videoRef}
                              autoPlay
                              playsInline
                              className="w-full max-h-[160px] object-cover rounded-xl bg-black border border-slate-700"
                            />
                            <div className="flex gap-4">
                              <button
                                type="button"
                                onClick={capturePhoto}
                                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-900 font-extrabold text-xs rounded-xl shadow-md transition duration-200 cursor-pointer"
                              >
                                📸 Capture Photo
                              </button>
                              <button
                                type="button"
                                onClick={stopCamera}
                                className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-450 font-extrabold text-xs rounded-xl border border-rose-500/25 transition duration-200 cursor-pointer"
                              >
                                ❌ Close Camera
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            onDragEnter={handleDrag}
                            onDragOver={handleDrag}
                            onDragLeave={handleDrag}
                            onDrop={handleDrop}
                            className={`relative border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 min-h-[200px] ${
                              dragActive
                                ? 'border-accent-400 bg-accent-500/5 shadow-[0_0_24px_rgba(6,182,212,0.1)]'
                                : uploading
                                ? 'border-primary-500/30 bg-surface-900/60'
                                : 'border-slate-800 hover:border-primary-500/40 bg-surface-900/40 hover:bg-surface-900/60'
                            }`}
                          >
                            <input
                              type="file"
                              id="file-upload-input"
                              accept="image/png, image/jpeg, image/jpg"
                              className="hidden"
                              onChange={handleFileSelect}
                              disabled={uploading}
                            />

                            <label htmlFor="file-upload-input" className="w-full h-full flex flex-col items-center justify-center cursor-pointer">
                              {uploading ? (
                                <div className="flex flex-col items-center gap-4">
                                  {/* Elegant glowing loading spinner */}
                                  <div className="relative w-12 h-12">
                                    <div className="absolute inset-0 rounded-full border-4 border-primary-500/20" />
                                    <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary-550 animate-spin" />
                                  </div>
                                  <div>
                                    <p className="text-slate-200 text-sm font-semibold">Uploading & Processing Image</p>
                                    <p className="text-slate-500 text-xs mt-1 animate-pulse">Running Gemini Vision Extraction pipeline…</p>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center gap-3">
                                  <div className="w-12 h-12 rounded-xl bg-surface-800 border border-slate-700/60 flex items-center justify-center shadow-inner text-2xl group-hover:scale-110 transition">
                                    📸
                                  </div>
                                  <div>
                                    <p className="text-slate-200 text-sm font-semibold">
                                      Drag & drop carton image here, or <span className="text-primary-400 hover:underline">browse</span>
                                    </p>
                                    <p className="text-slate-500 text-xs mt-1.5">
                                      Supports JPG, JPEG, and PNG images up to 5 MB
                                    </p>
                                  </div>
                                </div>
                              )}
                            </label>

                            {!uploading && (
                              <div className="flex items-center gap-2 mt-4" onClick={(e) => e.stopPropagation()}>
                                <span className="text-xs text-slate-550 font-semibold">or</span>
                                <button
                                  type="button"
                                  onClick={startCamera}
                                  className="px-4 py-2 bg-gradient-to-r from-primary-500 to-accent-500 hover:from-primary-600 hover:to-accent-600 text-slate-900 font-extrabold text-xs rounded-xl shadow-md transition duration-200 cursor-pointer uppercase tracking-wider"
                                >
                                  📷 Open Camera
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Right: Reorder Recommendations (40% width or 100% for staff) */}
                  <div className={userRole === 'staff' ? "lg:col-span-5 h-[380px]" : "lg:col-span-2 h-[380px]"}>
                    <ReorderSuggestions refreshCounter={refreshCounter} />
                  </div>
                </div>

                {/* Live Inventory Table */}
                {/* Live Inventory Table */}
                <div className="flex flex-col gap-8">
                  <InventoryTable refreshCounter={refreshCounter} userRole={userRole} />
                  <SmartReorderPrediction refreshCounter={refreshCounter} />
                </div>

              </>
            ) : activeTab === 'scanner' ? (
              <QRScannerLookup
                onNavigateToBilling={(med) => {
                  setPrefilledMedicineForBilling(med)
                  setActiveTab('billing')
                }}
              />
            ) : activeTab === 'assistant' ? (
              <AssistantChat />
            ) : (activeTab === 'finance' && userRole !== 'staff') ? (
              <MonthlyOverview userRole={userRole} />
            ) : (
              <BillingAndSales
                onSaleSuccess={() => setRefreshCounter(prev => prev + 1)}
                prefilledMedicine={prefilledMedicineForBilling}
                clearPrefilledMedicine={() => setPrefilledMedicineForBilling(null)}
              />
            )}

          </div>
        )}

        {/* Step 2: Confirmation screen */}
        {activeStep === 'confirm' && currentRecord && (
          <ConfirmationScreen
            record={currentRecord}
            imageFile={uploadFile}
            onSave={handleConfirmSave}
            onCancel={handleCancel}
            isSaving={isSaving}
            error={saveError}
            isDuplicate={isDuplicate}
            existingStockQty={existingStockQty}
            isNonMedicineWarning={isNonMedicineWarning}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-surface-950/20 py-6 text-center text-xs text-slate-500 font-medium">
        MediVision AI Inventory & Scan Operations Hub · Supabase Cloud Services
      </footer>
    </div>
  )
}
