import { useState, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { useWorkspace } from '../contexts/WorkspaceContext'
import {
  uploadImage,
  confirmIntake,
  confirmLocation,
  getLocations,
  checkDuplicate
} from '../services/api'

// MUI Components
import {
  Box,
  Stepper,
  Step,
  StepLabel,
  Button,
  Typography,
  Card,
  CardContent,
  TextField,
  Tooltip,
  Chip,
  Paper,
  CircularProgress,
  Snackbar,
  Alert,
  Grid,
  InputAdornment,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material'

// MUI Icons
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import WarningIcon from '@mui/icons-material/Warning'
import EuroIcon from '@mui/icons-material/Euro'

const STEPS = ['Upload Photo', 'Review Extracted Data', 'Select Storage Location', 'Confirm Intake'];

export default function IntakeWizard() {
  const { showToast } = useWorkspace()

  const [activeStep, setActiveStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  // Intake data states
  const [recordId, setRecordId] = useState(null)
  const [confidenceScores, setConfidenceScores] = useState({})
  const [imagePreviewUrl, setImagePreviewUrl] = useState('')
  const [duplicateWarning, setDuplicateWarning] = useState({ exists: false, current_quantity: 0 })
  const [dupChoice, setDupChoice] = useState('add') // 'add' | 'new'
  
  const [values, setValues] = useState({
    medicine_name: '',
    strength: '',
    manufacturer: '',
    batch_number: '',
    expiry_date: '',
    mrp: '',
    purchase_price: '',
    quantity: '1',
    storage_location: ''
  })

  // Location selection states
  const [locationsList, setLocationsList] = useState([])
  const [selectedLocationId, setSelectedLocationId] = useState(null)
  const [selectedLocationLabel, setSelectedLocationLabel] = useState('')

  // Success result states
  const [successData, setSuccessData] = useState(null)
  const [successSnackbarOpen, setSuccessSnackbarOpen] = useState(false)

  // Fetch locations when entering Step 3
  useEffect(() => {
    if (activeStep === 2) {
      setLoading(true)
      getLocations()
        .then((res) => {
          setLocationsList(res.locations || [])
        })
        .catch((err) => {
          console.error('Failed to fetch storage locations:', err)
          showToast('Failed to load storage locations', 'error')
        })
        .finally(() => {
          setLoading(false)
        })
    }
  }, [activeStep])

  // Drag & drop configuration for Step 1
  const onDrop = async (acceptedFiles) => {
    if (!acceptedFiles || acceptedFiles.length === 0) return
    const file = acceptedFiles[0]

    setLoading(true)
    setError(null)
    
    // Revoke previous preview URL if exists
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl)
    }
    
    const preview = URL.createObjectURL(file)
    setImagePreviewUrl(preview)

    try {
      const data = await uploadImage(file)
      
      if (data.status === 'extraction_failed') {
        throw new Error(data.error_message || 'AI extraction failed. Please try again with a clearer picture.')
      }

      setRecordId(data.extraction_record_id)
      setConfidenceScores(data.confidence || {})
      
      setValues({
        medicine_name: data.medicine_name ?? '',
        strength: data.strength ?? '',
        manufacturer: data.manufacturer ?? '',
        batch_number: data.batch_number ?? '',
        expiry_date: data.expiry_date ?? '',
        mrp: data.mrp !== null ? data.mrp.toString() : '',
        purchase_price: '',
        quantity: '1',
        storage_location: ''
      })

      // Check duplicates
      if (data.medicine_name) {
        const dupCheck = await checkDuplicate(data.medicine_name, data.batch_number)
        if (dupCheck.exists) {
          setDuplicateWarning({
            exists: true,
            current_quantity: dupCheck.current_quantity
          })
        } else {
          setDuplicateWarning({ exists: false, current_quantity: 0 })
        }
      }

      setActiveStep(1) // Move to Step 2 (Review)
    } catch (err) {
      console.error(err)
      setError(err.message || 'Failed to process carton image.')
      setImagePreviewUrl('')
    } finally {
      setLoading(false)
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpeg', '.jpg', '.png'] },
    maxFiles: 1,
    disabled: loading
  })

  // Confidence check helper
  const doesFieldNeedReview = (field) => {
    const score = confidenceScores[field]
    if (score === undefined || score === null) return false
    // Low confidence threshold is 80 (or 0.80)
    return score < 0.80 || (score > 1.0 && score < 80)
  }

  const handleFieldChange = (field, value) => {
    setValues((prev) => ({ ...prev, [field]: value }))
  }

  const handleLocationSelect = (loc) => {
    setSelectedLocationId(loc.id)
    setSelectedLocationLabel(loc.label)
    handleFieldChange('storage_location', loc.label)
  }

  // Payload constructor
  const getSubmitPayload = () => {
    const effectiveBatch = (duplicateWarning.exists && dupChoice === 'new') ? null : (values.batch_number.trim() || null)
    
    return {
      medicine_name: values.medicine_name.trim(),
      strength: values.strength.trim() || null,
      manufacturer: values.manufacturer.trim() || null,
      batch_number: effectiveBatch,
      expiry_date: values.expiry_date || null,
      mrp: values.mrp ? parseFloat(values.mrp) : null,
      purchase_price: values.purchase_price ? parseFloat(values.purchase_price) : 0.0,
      quantity: parseInt(values.quantity) || 1,
      storage_location: values.storage_location.trim() || null,
      intake_status: isExpired() ? 'expired_on_arrival' : null
    }
  }

  const isExpired = () => {
    if (!values.expiry_date) return false
    const expDate = new Date(values.expiry_date)
    const today = new Date()
    today.setHours(0,0,0,0)
    return expDate.getTime() < today.getTime()
  }

  // Validate form in Step 2
  const isReviewValid = () => {
    if (!values.medicine_name.trim()) return false
    if (!values.expiry_date) return false
    if (values.purchase_price !== '' && parseFloat(values.purchase_price) < 0) return false
    if (isExpired() && dupChoice === 'add' && duplicateWarning.exists) {
      // Allow adding expired stock only with confirmation status
    }
    return true
  }

  // Stepper controllers
  const handleNext = () => {
    if (activeStep === 1 && !isReviewValid()) {
      showToast('Please correct missing values or formats before proceeding.', 'warning')
      return
    }
    setActiveStep((prev) => prev + 1)
  }

  const handleBack = () => {
    setActiveStep((prev) => prev - 1)
  }

  const handleReset = () => {
    setActiveStep(0)
    setRecordId(null)
    setConfidenceScores({})
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl)
      setImagePreviewUrl('')
    }
    setDuplicateWarning({ exists: false, current_quantity: 0 })
    setDupChoice('add')
    setValues({
      medicine_name: '',
      strength: '',
      manufacturer: '',
      batch_number: '',
      expiry_date: '',
      mrp: '',
      purchase_price: '',
      quantity: '1',
      storage_location: ''
    })
    setSelectedLocationId(null)
    setSelectedLocationLabel('')
  }

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)
    const payload = getSubmitPayload()

    try {
      // 1. Confirm intake & insert into medicine catalog
      const newMed = await confirmIntake(recordId, payload)
      
      // 2. Assign selected storage location if provided
      if (selectedLocationId) {
        const confirmPayload = {
          medicine_id: newMed.id,
          location_id: selectedLocationId,
          quantity: payload.quantity
        }
        await confirmLocation(confirmPayload)
      }

      setSuccessData(newMed)
      setSuccessSnackbarOpen(true)
      showToast(`Successfully confirmed and logged "${newMed.name}"`, 'success')
      handleReset()
    } catch (err) {
      console.error(err)
      setError(err.message || 'Failed to submit intake confirmation.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* Header Banner */}
      <Box sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: '-0.02em', background: 'linear-gradient(135deg, #f8fafc 0%, #cbd5e1 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', mb: 0.5 }}>
          Stock Intake Wizard
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          4-step digital workflow mapping image scanning, verification audits, location indexing, and confirmations.
        </Typography>
      </Box>

      {/* MUI Stepper tracker */}
      <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 4 }}>
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} variant="filled">
          {error}
        </Alert>
      )}

      {/* STEP 1: UPLOAD PHOTO */}
      {activeStep === 0 && (
        <Box sx={{ maxWidth: 600, mx: 'auto', width: '100%' }}>
          <Paper
            {...getRootProps()}
            variant="outlined"
            sx={{
              p: 6,
              textAlign: 'center',
              cursor: 'pointer',
              borderStyle: 'dashed',
              borderWidth: 2,
              borderColor: isDragActive ? 'primary.main' : 'divider',
              backgroundColor: isDragActive ? 'action.hover' : 'background.paper',
              borderRadius: '16px',
              transition: 'all 0.2s',
              '&:hover': {
                borderColor: 'primary.main',
                backgroundColor: 'action.hover'
              }
            }}
          >
            <input {...getInputProps()} />
            {loading ? (
              <Box sx={{ py: 4 }}>
                <CircularProgress size={48} sx={{ mb: 2 }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Extracting Carton Labels...
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
                  Running OCR analysis via Gemini Vision model
                </Typography>
              </Box>
            ) : (
              <Box>
                <CloudUploadIcon sx={{ fontSize: 56, color: 'text.secondary', mb: 2 }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  Drag &amp; drop container box photo here, or click to browse
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                  Supports JPG, JPEG, and PNG images up to 5 MB
                </Typography>
              </Box>
            )}
          </Paper>
        </Box>
      )}

      {/* STEP 2: REVIEW EXTRACTED DATA */}
      {activeStep === 1 && (
        <Grid container spacing={4} sx={{ alignItems: 'flex-start' }}>
          {/* Left panel - Image preview */}
          <Grid item xs={12} md={5}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2 }}>
                  Carton Image Reference
                </Typography>
                {imagePreviewUrl ? (
                  <Box
                    component="img"
                    src={imagePreviewUrl}
                    alt="Carton carton upload"
                    sx={{ width: '100%', height: 'auto', maxHeight: 350, objectFit: 'contain', borderRadius: '8px', border: '1px solid', borderColor: 'divider' }}
                  />
                ) : (
                  <Typography variant="body2" sx={{ color: 'text.disabled', textAlign: 'center', py: 6 }}>
                    No image uploaded.
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Right panel - Input Fields */}
          <Grid item xs={12} md={7}>
            {duplicateWarning.exists && (
              <Paper variant="outlined" sx={{ p: 2, mb: 3, borderColor: 'primary.light', bgcolor: 'action.hover' }}>
                <Typography variant="body2" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1, color: 'primary.main', mb: 1.5 }}>
                  <WarningIcon fontSize="small" /> Batch already exists in catalog (Current: {duplicateWarning.current_quantity} units)
                </Typography>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Button
                    size="small"
                    variant={dupChoice === 'add' ? 'contained' : 'outlined'}
                    onClick={() => setDupChoice('add')}
                  >
                    Add to stock count
                  </Button>
                  <Button
                    size="small"
                    variant={dupChoice === 'new' ? 'contained' : 'outlined'}
                    onClick={() => setDupChoice('new')}
                  >
                    Create separate line
                  </Button>
                </Box>
              </Paper>
            )}

            <Card variant="outlined">
              <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, borderBottom: '1px solid', borderColor: 'divider', pb: 1 }}>
                  Confirm Details (Low confidence fields outlined in orange)
                </Typography>

                {/* Medicine Name */}
                <Tooltip title={doesFieldNeedReview('medicine_name') ? "Review Required: Low Confidence Score from AI" : ""} placement="top-end">
                  <TextField
                    fullWidth
                    label="Medicine Name"
                    value={values.medicine_name}
                    onChange={(e) => handleFieldChange('medicine_name', e.target.value)}
                    color={doesFieldNeedReview('medicine_name') ? 'warning' : 'primary'}
                    focused={doesFieldNeedReview('medicine_name')}
                    required
                  />
                </Tooltip>

                <Grid container spacing={2}>
                  {/* Strength */}
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Strength"
                      value={values.strength}
                      onChange={(e) => handleFieldChange('strength', e.target.value)}
                    />
                  </Grid>
                  {/* Manufacturer */}
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Manufacturer"
                      value={values.manufacturer}
                      onChange={(e) => handleFieldChange('manufacturer', e.target.value)}
                    />
                  </Grid>
                </Grid>

                <Grid container spacing={2}>
                  {/* Batch Number */}
                  <Grid item xs={12} sm={6}>
                    <Tooltip title={doesFieldNeedReview('batch_number') ? "Review Required: Low Confidence Score from AI" : ""} placement="top-end">
                      <TextField
                        fullWidth
                        label="Batch Number"
                        value={values.batch_number}
                        onChange={(e) => handleFieldChange('batch_number', e.target.value)}
                        color={doesFieldNeedReview('batch_number') ? 'warning' : 'primary'}
                        focused={doesFieldNeedReview('batch_number')}
                      />
                    </Tooltip>
                  </Grid>
                  {/* Expiry Date */}
                  <Grid item xs={12} sm={6}>
                    <Tooltip title={doesFieldNeedReview('expiry_date') ? "Review Required: Low Confidence Score from AI" : ""} placement="top-end">
                      <TextField
                        fullWidth
                        label="Expiry Date"
                        type="date"
                        InputLabelProps={{ shrink: true }}
                        value={values.expiry_date}
                        onChange={(e) => handleFieldChange('expiry_date', e.target.value)}
                        color={doesFieldNeedReview('expiry_date') ? 'warning' : 'primary'}
                        focused={doesFieldNeedReview('expiry_date')}
                        required
                      />
                    </Tooltip>
                  </Grid>
                </Grid>

                <Grid container spacing={2}>
                  {/* MRP */}
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      label="MRP (Retail)"
                      type="number"
                      value={values.mrp}
                      onChange={(e) => handleFieldChange('mrp', e.target.value)}
                      InputProps={{
                        startAdornment: <InputAdornment position="start">$</InputAdornment>
                      }}
                    />
                  </Grid>
                  {/* Purchase Price */}
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      label="Purchase Price"
                      type="number"
                      value={values.purchase_price}
                      onChange={(e) => handleFieldChange('purchase_price', e.target.value)}
                      InputProps={{
                        startAdornment: <InputAdornment position="start">$</InputAdornment>
                      }}
                      required
                    />
                  </Grid>
                  {/* Quantity */}
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      label="Quantity"
                      type="number"
                      value={values.quantity}
                      onChange={(e) => handleFieldChange('quantity', e.target.value)}
                      required
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* STEP 3: SELECT STORAGE LOCATION */}
      {activeStep === 2 && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, borderBottom: '1px solid', borderColor: 'divider', pb: 1, mb: 3 }}>
              Select Storage Location Slot
            </Typography>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            ) : (
              <Box>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                  Click a storage location slot to assign the incoming medicine. Occupancy counts shown in brackets.
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                  {locationsList.length > 0 ? (
                    locationsList.map((loc) => {
                      const isSelected = selectedLocationId === loc.id;
                      const isFull = loc.current_occupancy >= loc.capacity;
                      return (
                        <Chip
                          key={loc.id}
                          label={`${loc.rack_name} R${loc.row}C${loc.column} (${loc.current_occupancy}/${loc.capacity}) [${loc.storage_type}]`}
                          onClick={() => !isFull && handleLocationSelect(loc)}
                          disabled={isFull}
                          color={isSelected ? 'primary' : 'default'}
                          variant={isSelected ? 'filled' : 'outlined'}
                          clickable={!isFull}
                          sx={{
                            borderRadius: '8px',
                            fontWeight: isSelected ? 700 : 500,
                            borderColor: isSelected ? 'primary.main' : 'divider',
                            opacity: isFull ? 0.45 : 1
                          }}
                        />
                      );
                    })
                  ) : (
                    <Typography variant="body2" sx={{ color: 'text.disabled' }}>
                      No active storage slots. You can confirm without assigning a slot first.
                    </Typography>
                  )}
                </Box>
                {selectedLocationLabel && (
                  <Typography variant="body2" sx={{ mt: 3, fontWeight: 700, color: 'primary.main' }}>
                    Selected Slot: {selectedLocationLabel}
                  </Typography>
                )}
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      {/* STEP 4: CONFIRM SUMMARY */}
      {activeStep === 3 && (
        <Grid container spacing={4}>
          <Grid item xs={12} md={7}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, borderBottom: '1px solid', borderColor: 'divider', pb: 1, mb: 3 }}>
                  Verify Summary Payload
                </Typography>
                
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2.5,
                    maxHeight: 300,
                    overflowY: 'auto',
                    backgroundColor: 'action.hover',
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    borderRadius: '8px'
                  }}
                >
                  <pre>{JSON.stringify(getSubmitPayload(), null, 2)}</pre>
                </Paper>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={5}>
            <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', p: 3, textAlign: 'center', gap: 2 }}>
              <CheckCircleIcon sx={{ fontSize: 56, color: 'success.main', mx: 'auto' }} />
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                Intake Validation Ready
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Double check the properties on the left. Once submitted, records will insert into the live inventory database and generate printable QR code identifiers.
              </Typography>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Controller Buttons */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2, borderTop: '1px solid', borderColor: 'divider', pt: 3 }}>
        <Button
          variant="outlined"
          disabled={activeStep === 0 || loading}
          onClick={handleBack}
        >
          Back
        </Button>
        
        {activeStep === 0 && imagePreviewUrl && (
          <Button variant="contained" onClick={handleNext}>
            Proceed to Review
          </Button>
        )}

        {activeStep > 0 && activeStep < STEPS.length - 1 && (
          <Button variant="contained" onClick={handleNext}>
            Next Step
          </Button>
        )}

        {activeStep === STEPS.length - 1 && (
          <Button
            variant="contained"
            color="success"
            onClick={handleSubmit}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : null}
          >
            Submit &amp; Generate QR
          </Button>
        )}
      </Box>

      {/* Success Dialog Popup for QR Code Display */}
      <Dialog
        open={successSnackbarOpen}
        onClose={() => setSuccessSnackbarOpen(false)}
        PaperProps={{
          sx: {
            borderRadius: '16px',
            p: 2,
            maxWidth: 400,
            width: '100%',
            textAlign: 'center'
          }
        }}
      >
        <DialogTitle sx={{ fontWeight: 800 }}>
          🎉 Stock Intake Logged!
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          {successData && (
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                {successData.name}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 2 }}>
                Batch: {successData.batch_number || '—'} · Quantity: {successData.quantity} Units
              </Typography>

              {successData.qr_code_image ? (
                <Box 
                  sx={{ 
                    bgcolor: 'white', 
                    p: 2, 
                    borderRadius: '12px',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    border: '1px solid',
                    borderColor: 'divider',
                    mx: 'auto',
                    width: 160,
                    height: 160,
                    '& img': {
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain'
                    }
                  }}
                >
                  <img src={successData.qr_code_image} alt="Generated QR ID code label" />
                </Box>
              ) : (
                <Typography variant="caption" color="text.disabled">
                  No QR label generated.
                </Typography>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', pb: 2 }}>
          <Button variant="contained" onClick={() => setSuccessSnackbarOpen(false)}>
            Close &amp; Finish
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
