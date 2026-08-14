import React, { useState } from 'react'
import { useDropzone } from 'react-dropzone'

// MUI Components
import {
  Box,
  Grid,
  Typography,
  Card,
  CardContent,
  Button,
  TextField,
  Paper,
  Divider,
  Chip,
  Alert
} from '@mui/material'

// MUI Icons
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner'
import FileUploadIcon from '@mui/icons-material/FileUpload'
import SearchIcon from '@mui/icons-material/Search'
import VideocamIcon from '@mui/icons-material/Videocam'
import VideocamOffIcon from '@mui/icons-material/VideocamOff'

export default function QRScanner() {
  const [cameraActive, setCameraActive] = useState(false)
  const [searchCode, setSearchCode] = useState('')
  const [scanResult, setScanResult] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)

  const handleStartCamera = () => {
    setCameraActive(!cameraActive)
    setErrorMsg(null)
    if (!cameraActive) {
      // Simulate scanning after 3 seconds
      setTimeout(() => {
        setScanResult({
          medicineName: 'Paracetamol 500mg',
          batchNumber: 'BATCH-2026-X89',
          expiryDate: '2028-11-30',
          manufacturer: 'GSK India',
          quantity: 150,
          status: 'Active / Verified'
        })
        setCameraActive(false)
      }, 3000)
    } else {
      setScanResult(null)
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/*': [] },
    maxFiles: 1,
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        // Simulate reading the QR from the uploaded image
        setScanResult({
          medicineName: 'Amoxicillin 250mg',
          batchNumber: 'BATCH-2026-A12',
          expiryDate: '2027-06-30',
          manufacturer: 'Sandoz Pharma',
          quantity: 80,
          status: 'Active / Verified'
        })
        setErrorMsg(null)
      }
    }
  })

  const handleManualSearch = (e) => {
    e.preventDefault()
    if (!searchCode.trim()) return

    if (searchCode.toUpperCase().includes('PARA')) {
      setScanResult({
        medicineName: 'Paracetamol 500mg',
        batchNumber: 'BATCH-2026-X89',
        expiryDate: '2028-11-30',
        manufacturer: 'GSK India',
        quantity: 150,
        status: 'Active / Verified'
      })
      setErrorMsg(null)
    } else if (searchCode.toUpperCase().includes('AMOX')) {
      setScanResult({
        medicineName: 'Amoxicillin 250mg',
        batchNumber: 'BATCH-2026-A12',
        expiryDate: '2027-06-30',
        manufacturer: 'Sandoz Pharma',
        quantity: 80,
        status: 'Active / Verified'
      })
      setErrorMsg(null)
    } else {
      setErrorMsg('No medicine batch matched the provided code.')
      setScanResult(null)
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, width: '100%' }}>
      {/* Title */}
      <Box sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 800, color: 'text.primary' }}>
          QR Code Scanner
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Scan medicine packaging barcodes, upload label images, or search identifiers manually.
        </Typography>
      </Box>

      {/* Grid container */}
      <Grid container spacing={4}>
        
        {/* Left Column - Camera viewfinder */}
        <Grid item xs={12} md={6}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                Live Camera Scan
              </Typography>
              
              <Box
                sx={{
                  flex: 1,
                  minHeight: 300,
                  position: 'relative',
                  border: '2px dashed',
                  borderColor: cameraActive ? 'primary.main' : 'divider',
                  borderRadius: '12px',
                  backgroundColor: 'black',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden'
                }}
              >
                {cameraActive ? (
                  <>
                    <video
                      autoPlay
                      muted
                      playsInline
                      style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }}
                    />
                    {/* Viewfinder Target Bounds overlay */}
                    <Box
                      sx={{
                        position: 'absolute',
                        width: 180,
                        height: 180,
                        border: '3px solid #0A74DA',
                        borderRadius: '16px',
                        boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)',
                        pointerEvents: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      {/* Laser Line Scan effect */}
                      <Box
                        sx={{
                          width: '100%',
                          height: '2px',
                          backgroundColor: '#06b6d4',
                          boxShadow: '0 0 8px #06b6d4',
                          animation: 'scanLine 2s linear infinite'
                        }}
                      />
                    </Box>
                    <Typography variant="caption" sx={{ position: 'absolute', bottom: 16, color: '#94a3b8', zIndex: 10 }}>
                      [Scanning active... Hold code in the center]
                    </Typography>
                  </>
                ) : (
                  <Box sx={{ textAlign: 'center', p: 4, color: 'text.secondary' }}>
                    <QrCodeScannerIcon sx={{ fontSize: 60, mb: 2, color: 'primary.main' }} />
                    <Typography variant="body2" sx={{ fontWeight: 650 }}>Camera Feed Standby</Typography>
                    <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>Click below to authorize and start the scanner</Typography>
                  </Box>
                )}
              </Box>

              <Button
                variant={cameraActive ? "outlined" : "contained"}
                color={cameraActive ? "secondary" : "primary"}
                startIcon={cameraActive ? <VideocamOffIcon /> : <VideocamIcon />}
                onClick={handleStartCamera}
                sx={{ mt: 1 }}
              >
                {cameraActive ? 'Stop Camera' : 'Start Camera'}
              </Button>
            </CardContent>
          </Card>
        </Grid>

        {/* Right Column - File upload and manual search */}
        <Grid item xs={12} md={6} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          
          {/* File Upload Fallback */}
          <Card variant="outlined">
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                Image File Upload
              </Typography>
              
              <Box
                {...getRootProps()}
                sx={{
                  border: '2px dashed',
                  borderColor: isDragActive ? 'primary.main' : 'divider',
                  borderRadius: '12px',
                  p: 4,
                  textAlign: 'center',
                  cursor: 'pointer',
                  backgroundColor: 'action.hover',
                  '&:hover': {
                    borderColor: 'primary.main',
                    backgroundColor: 'action.selected'
                  }
                }}
              >
                <input {...getInputProps()} />
                <FileUploadIcon sx={{ fontSize: 40, mb: 1, color: 'text.secondary' }} />
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {isDragActive ? 'Drop the file here' : 'Drag & drop a QR code image here'}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                  Or click to browse from local storage
                </Typography>
              </Box>
            </CardContent>
          </Card>

          {/* Manual Search Fallback */}
          <Card variant="outlined">
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                Search Manually
              </Typography>
              
              <Box component="form" onSubmit={handleManualSearch} sx={{ display: 'flex', gap: 1.5 }}>
                <TextField
                  label="Enter Medicine Code or Name"
                  size="small"
                  required
                  fullWidth
                  value={searchCode}
                  onChange={(e) => setSearchCode(e.target.value)}
                  placeholder="e.g. PARA-X89 or AMOX-A12"
                />
                <Button
                  type="submit"
                  variant="outlined"
                  startIcon={<SearchIcon />}
                  sx={{ minWidth: 110 }}
                >
                  Search
                </Button>
              </Box>
            </CardContent>
          </Card>

        </Grid>
      </Grid>

      {/* Scan Results Panel */}
      {scanResult && (
        <Card variant="outlined" sx={{ borderLeft: '5px solid', borderColor: 'success.main', mt: 1 }}>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'success.main' }}>
                🎉 Code Parsed Successfully
              </Typography>
              <Chip label={scanResult.status} color="success" size="small" sx={{ fontWeight: 700 }} />
            </Box>
            
            <Divider />

            <Grid container spacing={2}>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>Medicine Name</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{scanResult.medicineName}</Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>Batch Identifier</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>{scanResult.batchNumber}</Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>Expiry Date</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{scanResult.expiryDate}</Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>Manufacturer</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{scanResult.manufacturer}</Typography>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {errorMsg && (
        <Alert severity="error" variant="outlined" sx={{ mt: 1 }}>
          {errorMsg}
        </Alert>
      )}

      {/* Global CSS for scanning line animation */}
      <style>{`
        @keyframes scanLine {
          0% { transform: translateY(-90px); }
          50% { transform: translateY(90px); }
          100% { transform: translateY(-90px); }
        }
      `}</style>
    </Box>
  )
}
