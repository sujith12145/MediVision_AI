import React, { useState, useEffect, useRef, useMemo } from 'react'
import { PipecatClient } from '@pipecat-ai/client-js'
import { WebSocketTransport } from '@pipecat-ai/websocket-transport'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { supabase } from '../services/supabase'

// MUI Components
import {
  Box,
  Typography,
  Fab,
  Card,
  CardContent,
  Grid,
  Paper,
  Button,
  Avatar,
  Divider,
  Alert,
  Tooltip,
  IconButton,
  useTheme
} from '@mui/material'

// Icons
import MicIcon from '@mui/icons-material/Mic'
import MicOffIcon from '@mui/icons-material/MicOff'
import StopIcon from '@mui/icons-material/Stop'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import PersonIcon from '@mui/icons-material/Person'
import GavelIcon from '@mui/icons-material/Gavel'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CancelIcon from '@mui/icons-material/Cancel'

const getWsUrl = (path) => {
  try {
    const isDev = import.meta.env.DEV
    const baseUrl = import.meta.env.VITE_API_URL || (isDev ? 'localhost:8000' : 'medi-vision-ai.onrender.com')
    const cleanUrl = baseUrl.replace(/^http(s)?:\/\//, '')
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    return `${protocol}://${cleanUrl}${path}`
  } catch (e) {
    console.error('Error generating WS URL:', e)
    return `ws://localhost:8000${path}`
  }
}

export default function VoiceCenter() {
  const { showToast } = useWorkspace()
  const theme = useTheme()

  // Component Mounting State Guards
  const [isMounted, setIsMounted] = useState(true)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      setIsMounted(false)
      isMountedRef.current = false
    }
  }, [])

  // Connection and mic states
  const [connectionStatus, setConnectionStatus] = useState('disconnected') // 'disconnected' | 'connecting' | 'connected'
  const [isBotSpeaking, setIsBotSpeaking] = useState(false)
  const [isUserSpeaking, setIsUserSpeaking] = useState(false)
  const [micEnabled, setMicEnabled] = useState(true)
  const [transcripts, setTranscripts] = useState([])
  const [pendingApprovals, setPendingApprovals] = useState([])
  const [micError, setMicError] = useState(false)
  const [reconnectMsg, setReconnectMsg] = useState(null)

  // Safe State Setters wrapping triggers with isMountedRef checks
  const safeSetStatus = (val) => { if (isMountedRef.current) setConnectionStatus(val) }
  const safeSetBotSpeaking = (val) => { if (isMountedRef.current) setIsBotSpeaking(val) }
  const safeSetUserSpeaking = (val) => { if (isMountedRef.current) setIsUserSpeaking(val) }
  const safeSetTranscripts = (val) => { if (isMountedRef.current) setTranscripts(val) }
  const safeSetPendingApprovals = (val) => { if (isMountedRef.current) setPendingApprovals(val) }
  const safeSetMicError = (val) => { if (isMountedRef.current) setMicError(val) }
  const safeSetReconnectMsg = (val) => { if (isMountedRef.current) setReconnectMsg(val) }

  // Web Audio Visualizer refs
  const canvasRef = useRef(null)
  const audioCtxRef = useRef(null)
  const analyserRef = useRef(null)
  const sourceRef = useRef(null)
  const drawVisualRef = useRef(null)
  const audioStreamRef = useRef(null)

  // Pipecat client references
  const pcClientRef = useRef(null)
  const botAudioRef = useRef(null)
  const transcriptEndRef = useRef(null)
  const activeSocketRef = useRef(null)
  const reconnectAttemptRef = useRef(0)
  const reconnectTimeoutRef = useRef(null)

  const statusLabel = useMemo(() => {
    if (reconnectMsg) return reconnectMsg
    if (connectionStatus === 'disconnected') return 'Offline'
    if (connectionStatus === 'connecting') return 'Connecting...'
    if (isUserSpeaking) return 'You are speaking'
    if (isBotSpeaking) return 'AI is speaking'
    return 'Listening - Speak freely'
  }, [connectionStatus, isBotSpeaking, isUserSpeaking, reconnectMsg])

  // Setup Web Audio API Visualizer
  const startVisualizer = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Web Audio API is not supported in this browser environment.')
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioStreamRef.current = stream
      safeSetMicError(false)

      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      const audioCtx = new AudioContextClass()
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 128
      const source = audioCtx.createMediaStreamSource(stream)
      source.connect(analyser)

      audioCtxRef.current = audioCtx
      analyserRef.current = analyser
      sourceRef.current = source

      const bufferLength = analyser.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)

      const canvas = canvasRef.current
      if (!canvas) return
      const canvasCtx = canvas.getContext('2d')

      const draw = () => {
        if (!analyserRef.current || !canvas || !audioCtxRef.current || !isMountedRef.current) return
        drawVisualRef.current = requestAnimationFrame(draw)
        analyser.getByteFrequencyData(dataArray)

        canvasCtx.clearRect(0, 0, canvas.width, canvas.height)
        
        const centerX = canvas.width / 2
        const centerY = canvas.height / 2
        const baseRadius = 45
        
        let sum = 0
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i]
        }
        const avg = sum / bufferLength
        const pulseScale = 1 + (avg / 255) * 0.4
        const radius = baseRadius * pulseScale

        // Pulse Glow Ring
        canvasCtx.beginPath()
        canvasCtx.arc(centerX, centerY, radius, 0, 2 * Math.PI)
        const pulseGradient = canvasCtx.createRadialGradient(centerX, centerY, radius - 10, centerX, centerY, radius + 20)
        pulseGradient.addColorStop(0, 'rgba(10, 116, 218, 0.35)')
        pulseGradient.addColorStop(0.5, 'rgba(6, 182, 212, 0.15)')
        pulseGradient.addColorStop(1, 'rgba(6, 182, 212, 0)')
        canvasCtx.fillStyle = pulseGradient
        canvasCtx.fill()

        // Symmetrical audio wave points around the circle
        canvasCtx.beginPath()
        for (let i = 0; i < bufferLength; i++) {
          const angle = (i / bufferLength) * 2 * Math.PI
          const val = dataArray[i] / 4.0
          const r = radius + val
          const x = centerX + Math.cos(angle) * r
          const y = centerY + Math.sin(angle) * r
          
          if (i === 0) {
            canvasCtx.moveTo(x, y)
          } else {
            canvasCtx.lineTo(x, y)
          }
        }
        canvasCtx.closePath()
        
        // Glowing blue stroke
        const strokeGradient = canvasCtx.createLinearGradient(0, 0, canvas.width, canvas.height)
        strokeGradient.addColorStop(0, '#0A74DA')
        strokeGradient.addColorStop(1, '#06b6d4')
        canvasCtx.strokeStyle = strokeGradient
        canvasCtx.lineWidth = 2.5
        canvasCtx.stroke()
      }

      draw()
    } catch (err) {
      console.error('Failed to initialize microphone visualizer:', err)
      safeSetMicError(true)
      // Do not rethrow to prevent crashing the host component
    }
  }

  const stopVisualizer = () => {
    try {
      if (drawVisualRef.current) {
        cancelAnimationFrame(drawVisualRef.current)
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect()
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close()
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop())
      }
    } catch (e) {
      console.error('Error shutting down visualizer stream:', e)
    } finally {
      audioCtxRef.current = null
      analyserRef.current = null
      sourceRef.current = null
      audioStreamRef.current = null
    }
  }

  // Intercept WebSocket logic to capture tool approval requests
  const patchWebSocket = (handleRequest) => {
    try {
      const originalWebSocket = window.WebSocket
      window.WebSocket = function (url, protocols) {
        const ws = new originalWebSocket(url, protocols)
        
        const originalAddEventListener = ws.addEventListener
        ws.addEventListener = function (type, listener, options) {
          if (type === 'message') {
            const wrappedListener = function (event) {
              if (typeof event.data === 'string') {
                try {
                  const data = JSON.parse(event.data)
                  if (data.type === 'tool_approval_request') {
                    handleRequest(data)
                    return 
                  }
                } catch (e) {}
              }
              listener.call(this, event)
            }
            return originalAddEventListener.call(this, type, wrappedListener, options)
          }
          return originalAddEventListener.call(this, type, listener, options)
        }

        Object.defineProperty(ws, 'onmessage', {
          set: function (listener) {
            this._onmessage = function (event) {
              if (typeof event.data === 'string') {
                try {
                  const data = JSON.parse(event.data)
                  if (data.type === 'tool_approval_request') {
                    handleRequest(data)
                    return
                  }
                } catch (e) {}
              }
              if (listener) listener.call(this, event)
            }
          },
          get: function () {
            return this._onmessage
          }
        })

        activeSocketRef.current = ws
        return ws
      }

      return () => {
        window.WebSocket = originalWebSocket
      }
    } catch (e) {
      console.error('Failed to hook WebSocket listeners:', e)
      return () => {}
    }
  }

  const handleToolApprovalRequest = (payload) => {
    safeSetPendingApprovals(prev => [...prev, payload])
    showToast(`AI is requesting approval to run "${payload.tool}"`, 'info')
  }

  const handleApprovalResponse = (approvalId, approved) => {
    try {
      if (activeSocketRef.current && activeSocketRef.current.readyState === WebSocket.OPEN) {
        activeSocketRef.current.send(JSON.stringify({
          type: 'tool_approval_response',
          approval_id: approvalId,
          approved: approved
        }))

        safeSetPendingApprovals(prev => prev.filter(req => req.approval_id !== approvalId))
        showToast(approved ? 'Action Approved' : 'Action Rejected', approved ? 'success' : 'warning')
      } else {
        showToast('No active WebSocket session found.', 'error')
      }
    } catch (e) {
      console.error('Error sending tool approval feedback:', e)
    }
  }

  const startConversation = async () => {
    if (connectionStatus !== 'disconnected') return
    safeSetStatus('connecting')
    safeSetReconnectMsg(null)
    safeSetTranscripts([])
    safeSetPendingApprovals([])

    const unpatch = patchWebSocket(handleToolApprovalRequest)

    try {
      // First ensure mic access works, caught but non-destructive
      try {
        await startVisualizer()
      } catch (err) {
        console.warn('Non-fatal microphone block:', err)
        safeSetMicError(true)
      }

      // Fetch Supabase Token
      const { data: sd } = await supabase.auth.getSession()
      const token = sd.session?.access_token
      if (!token) throw new Error('Not authenticated. Please log in.')

      const wsUrl = getWsUrl('/api/voice/ws')

      const transport = new WebSocketTransport()
      const client = new PipecatClient({
        transport,
        params: { 
          baseUrl: wsUrl, 
          endpoints: { connect: `?token=${token}` } 
        },
        enableMic: !micError,
        enableCam: false,
        callbacks: {
          onConnected: () => {
            safeSetStatus('connected')
            reconnectAttemptRef.current = 0
            safeSetReconnectMsg(null)
          },
          onDisconnected: () => {
            safeSetStatus('disconnected')
            safeSetBotSpeaking(false)
            safeSetUserSpeaking(false)
            stopVisualizer()
            unpatch()
          },
          onBotStartedSpeaking: () => safeSetBotSpeaking(true),
          onBotStoppedSpeaking: () => safeSetBotSpeaking(false),
          onUserStartedSpeaking: () => safeSetUserSpeaking(true),
          onUserStoppedSpeaking: () => safeSetUserSpeaking(false),
          onUserTranscript: (data) => {
            if (data.final) {
              safeSetTranscripts(prev => [...prev, { role: 'user', text: data.text, ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }])
              scrollTranscriptBottom()
            }
          },
          onBotTranscript: (data) => {
            safeSetTranscripts(prev => [...prev, { role: 'assistant', text: data.text, ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }])
            scrollTranscriptBottom()
          },
          onError: (err) => {
            console.error('Pipecat error:', err)
            safeSetStatus('disconnected')
            stopVisualizer()
            unpatch()
            handleReconnect()
          }
        }
      })

      if (botAudioRef.current) {
        client.attachAudio(botAudioRef.current)
      }
      pcClientRef.current = client
      await client.connect()
    } catch (err) {
      console.error('Failed to initialize session handshake:', err)
      showToast(err.message || 'Failed to start voice session.', 'error')
      safeSetStatus('disconnected')
      stopVisualizer()
      unpatch()
    }
  }

  const handleReconnect = () => {
    try {
      if (reconnectAttemptRef.current >= 5) {
        safeSetReconnectMsg('Connection lost. Please restart session manually.')
        showToast('Maximum reconnection attempts reached.', 'error')
        return
      }
      const delay = Math.pow(2, reconnectAttemptRef.current) * 1000
      reconnectAttemptRef.current += 1
      const sec = delay / 1000
      safeSetReconnectMsg(`Connection lost. Reconnecting in ${sec}s...`)
      showToast(`Reconnecting in ${sec}s...`, 'warning')
      
      reconnectTimeoutRef.current = setTimeout(() => {
        startConversation()
      }, delay)
    } catch (e) {
      console.error('Failed to schedule reconnection:', e)
    }
  }

  const stopConversation = async () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    if (!pcClientRef.current) return
    try {
      await pcClientRef.current.disconnect()
    } catch (e) {
      console.error('Error disconnecting Pipecat client:', e)
    } finally {
      pcClientRef.current = null
      safeSetStatus('disconnected')
      safeSetBotSpeaking(false)
      safeSetUserSpeaking(false)
      stopVisualizer()
      safeSetReconnectMsg(null)
    }
  }

  const toggleMic = async () => {
    if (!pcClientRef.current) return
    const next = !micEnabled
    if (isMountedRef.current) setMicEnabled(next)
    try {
      if (next) await pcClientRef.current.enableMic(true)
      else await pcClientRef.current.enableMic(false)
    } catch (e) {
      console.error('Error toggling microphone state:', e)
    }
  }

  const scrollTranscriptBottom = () => {
    setTimeout(() => {
      transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 50)
  }

  useEffect(() => {
    return () => {
      stopVisualizer()
      if (pcClientRef.current) {
        try {
          pcClientRef.current.disconnect()
        } catch (e) {}
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, width: '100%' }}>
      <audio ref={botAudioRef} autoPlay style={{ display: 'none' }} />

      {/* Header Banner */}
      <Box sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 800, color: 'text.primary' }}>
          Voice Operations Center
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Interactive voice assistant operations with real-time waveform visualizers and strict Human-in-the-Loop decision verification.
        </Typography>
      </Box>

      {micError && (
        <Alert severity="error" variant="filled" sx={{ borderRadius: '12px' }}>
          Microphone access blocked. Please allow mic permissions or use the manual search.
        </Alert>
      )}

      <Grid container spacing={4}>
        {/* Left Column - Circular Orb Visualizer */}
        <Grid item xs={12} md={5}>
          <Card variant="outlined" sx={{ p: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'center' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Voice Controller
            </Typography>

            {/* Visualizer Canvas Area */}
            <Box
              sx={{
                width: 200,
                height: 200,
                borderRadius: '50%',
                border: '2px solid',
                borderColor: connectionStatus === 'connected' ? 'primary.main' : 'divider',
                boxShadow: (theme) => {
                  if (connectionStatus === 'connected') {
                    const color = isBotSpeaking 
                      ? theme.palette.secondary.main 
                      : isUserSpeaking 
                        ? theme.palette.success.main 
                        : theme.palette.primary.main
                    return `0 0 30px 10px ${color}`
                  }
                  return 'none'
                },
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                bgcolor: 'rgba(0,0,0,0.4)',
                transition: 'all 0.5s ease'
              }}
            >
              <canvas
                ref={canvasRef}
                width={200}
                height={200}
                style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
              />

              {/* Pulsing FAB inside orb */}
              <Fab
                color={
                  connectionStatus === 'disconnected'
                    ? 'default'
                    : isBotSpeaking
                      ? 'secondary'
                      : isUserSpeaking
                        ? 'success'
                        : 'primary'
                }
                sx={{
                  width: 90,
                  height: 90,
                  zIndex: 10,
                  boxShadow: 'none',
                  '&:hover': {
                    transform: 'scale(1.05)'
                  }
                }}
                onClick={connectionStatus === 'disconnected' ? startConversation : stopConversation}
              >
                {connectionStatus === 'disconnected' ? (
                  <MicIcon sx={{ fontSize: 36 }} />
                ) : (
                  <StopIcon sx={{ fontSize: 36 }} />
                )}
              </Fab>
            </Box>

            <Box sx={{ textCenter: 'center', width: '100%', textAlign: 'center' }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 800, display: 'block', mb: 1 }}>
                STATUS: {statusLabel}
              </Typography>
              
              {connectionStatus === 'connected' && (
                <Button
                  variant="outlined"
                  size="small"
                  onClick={toggleMic}
                  startIcon={micEnabled ? <MicOffIcon /> : <MicIcon />}
                  sx={{ borderRadius: '8px' }}
                >
                  {micEnabled ? 'Mute Mic' : 'Unmute Mic'}
                </Button>
              )}
            </Box>
          </Card>
        </Grid>

        {/* Right Column - Chat Transcript & Human in Loop Cards */}
        <Grid item xs={12} md={7} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          
          {/* Actionable Human-in-the-Loop Cards */}
          {pendingApprovals.length > 0 && (
            <Card variant="outlined" sx={{ borderColor: 'warning.light', bgcolor: 'rgba(230, 74, 25, 0.03)' }}>
              <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'warning.main', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <GavelIcon /> Verification Pending: Action Requested
                </Typography>
                <Divider />

                {pendingApprovals.map((req) => (
                  <Box key={req.approval_id} sx={{ p: 2, borderRadius: '8px', border: '1px dashed', borderColor: 'warning.main', bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'between', alignItems: 'center' }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, textTransform: 'capitalize' }}>
                        🛡️ Requested Action: {req.tool.replace('_', ' ')}
                      </Typography>
                    </Box>
                    <Box sx={{ bgcolor: 'action.hover', p: 1.5, borderRadius: '6px', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      {Object.entries(req.params).filter(([_, v]) => v).map(([k, v]) => (
                        <div key={k}>
                          <strong>{k.replace('_', ' ')}:</strong> {String(v)}
                        </div>
                      ))}
                    </Box>
                    <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 1 }}>
                      <Button
                        size="small"
                        color="success"
                        variant="contained"
                        startIcon={<CheckCircleIcon />}
                        onClick={() => handleApprovalResponse(req.approval_id, true)}
                      >
                        Approve Action
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        variant="outlined"
                        startIcon={<CancelIcon />}
                        onClick={() => handleApprovalResponse(req.approval_id, false)}
                      >
                        Reject
                      </Button>
                    </Box>
                  </Box>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Transcript Feed */}
          <Card variant="outlined" sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: 350, maxHeight: 500 }}>
            <CardContent sx={{ pb: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Transcript Feed
              </Typography>
            </CardContent>
            
            <Box sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', flexGrow: 1 }}>
              {transcripts.length === 0 ? (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'text.disabled', fontStyle: 'italic', fontSize: '0.9rem' }}>
                  {connectionStatus === 'connected' ? 'Listening for speech...' : 'Start a voice session to view transcripts.'}
                </Box>
              ) : (
                transcripts.map((t, i) => {
                  const isUser = t.role === 'user'
                  return (
                    <Box
                      key={i}
                      sx={{
                        display: 'flex',
                        gap: 1.5,
                        width: '100%',
                        flexDirection: isUser ? 'row-reverse' : 'row',
                        alignItems: 'flex-start'
                      }}
                    >
                      <Avatar sx={{ bgcolor: isUser ? 'primary.main' : 'secondary.main', width: 32, height: 32 }}>
                        {isUser ? <PersonIcon fontSize="small" /> : <SmartToyIcon fontSize="small" />}
                      </Avatar>
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', maxWidth: '75%' }}>
                        <Paper
                          variant="outlined"
                          sx={{
                            p: 1.5,
                            borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                            bgcolor: isUser ? 'primary.main' : 'action.hover',
                            color: isUser ? 'primary.contrastText' : 'text.primary',
                            border: isUser ? 'none' : '1px solid',
                            borderColor: 'divider',
                            boxShadow: isUser ? 2 : 0
                          }}
                        >
                          <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.4 }}>
                            {t.text}
                          </Typography>
                        </Paper>
                        <Typography variant="caption" sx={{ fontSize: 9, color: 'text.secondary', mt: 0.5, px: 0.5 }}>
                          {t.ts}
                        </Typography>
                      </Box>
                    </Box>
                  )
                })
              )}
              <div ref={transcriptEndRef} />
            </Box>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}
