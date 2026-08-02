import { useState, useEffect, useRef } from 'react'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { askAssistant } from '../../services/api'
import Spinner from '../ui/Spinner'

export default function GlobalCopilotDrawer() {
  const { 
    copilotOpen, 
    setCopilotOpen, 
    navigateTo, 
    showToast,
    theme 
  } = useWorkspace()
  
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [reasoningSteps, setReasoningSteps] = useState([])
  const [voiceActive, setVoiceActive] = useState(false)
  const [listeningText, setListeningText] = useState('Listening...')
  
  const drawerRef = useRef(null)
  const messagesEndRef = useRef(null)
  
  // Click outside to close drawer
  useEffect(() => {
    function handleClickOutside(event) {
      if (drawerRef.current && !drawerRef.current.contains(event.target)) {
        const trigger = document.getElementById('copilot-trigger-btn')
        if (trigger && !trigger.contains(event.target)) {
          setCopilotOpen(false);
        }
      }
    }
    if (copilotOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [copilotOpen, setCopilotOpen])

  useEffect(() => {
    if (copilotOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, copilotOpen, loading, reasoningSteps])

  const suggestedPrompts = [
    { text: 'Which items are low stock?', category: 'inventory' },
    { text: 'Analyze upcoming expiries', category: 'expiry' },
    { text: 'Compute net P&L margin', category: 'finance' },
    { text: 'Verify voice recordings', category: 'voice' }
  ]

  const handleSend = async (queryText) => {
    const query = queryText || input.trim()
    if (!query) return

    if (!queryText) setInput('')
    
    // Add user message
    const userMsg = { sender: 'user', text: query, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)
    
    // Set up step-by-step reasoning check list
    setReasoningSteps(['Constructing secure database queries...', 'Validating user role clearance...', 'Reading SQL index nodes...'])
    
    try {
      // Simulate real-time reasoning steps delay
      await new Promise(r => setTimeout(r, 600))
      setReasoningSteps(prev => [...prev, 'Compiling records with Gemini Flash Orator...'])
      
      const res = await askAssistant(query)
      
      await new Promise(r => setTimeout(r, 400))
      setReasoningSteps([])

      const copilotMsg = {
        sender: 'copilot',
        text: res.answer,
        rawData: res.raw_data || [],
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
      setMessages(prev => [...prev, copilotMsg])
    } catch (err) {
      setReasoningSteps([])
      const errMsg = {
        sender: 'copilot',
        text: 'I ran into an issue looking up that query on our secure server. Check your syntax or try another command.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
      setMessages(prev => [...prev, errMsg])
    } finally {
      setLoading(false)
    }
  }

  // Voice recording simulation
  const startVoiceCapture = () => {
    setVoiceActive(true)
    setListeningText('Calibrating audio channels...')
    
    setTimeout(() => {
      setListeningText('Listening for pharmacy dictation...')
    }, 1000)

    setTimeout(() => {
      setListeningText('Transcribing dictation with Whisper AI...')
    }, 2800)

    setTimeout(() => {
      setVoiceActive(false)
      handleSend('Show me medicines expiring in the next 30 days')
      showToast('Voice search matched: "Show me medicines expiring in the next 30 days"', 'info')
    }, 4500)
  }

  return (
    <>
      {/* Floating Trigger Action Button */}
      <button 
        id="copilot-trigger-btn"
        onClick={() => setCopilotOpen(!copilotOpen)}
        className="copilot-trigger-btn"
        title="Ask MediVision Copilot"
      >
        <span className="text-xl select-none">{copilotOpen ? '✕' : '💬'}</span>
      </button>

      {/* Main Drawer Shell */}
      <aside 
        ref={drawerRef}
        className={`copilot-drawer ${copilotOpen ? 'open' : ''}`}
      >
        {/* Drawer Header */}
        <div className="px-5 py-4 border-b border-glass-border flex items-center justify-between bg-surface-950/40">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">MediVision Copilot</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="shortcut-tag text-[9px]">CTRL+K</span>
            <button 
              onClick={() => setCopilotOpen(false)}
              className="text-slate-400 hover:text-white text-xs cursor-pointer bg-transparent border-none"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Conversation Feed */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          
          {/* Welcome Card */}
          <div className="flex gap-2.5 max-w-[88%] self-start">
            <div className="w-6 h-6 rounded-lg bg-primary-glow border border-primary/20 flex items-center justify-center text-xs shrink-0 select-none">
              🤖
            </div>
            <div className="bg-surface-950/50 border border-slate-800/80 p-3 rounded-xl rounded-tl-none text-xs text-slate-300 leading-normal">
              <strong className="block text-slate-100 mb-0.5">Welcome to pharmacy control, operator.</strong>
              Ask me about catalog volumes, active bills, P&L forecasts, or scan records. Select a quick query to test:
            </div>
          </div>

          {/* Quick Prompts */}
          {messages.length === 0 && (
            <div className="grid grid-cols-2 gap-2 mt-1 pl-8">
              {suggestedPrompts.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(p.text)}
                  className="btn-ghost p-2.5 text-left rounded-lg hover:border-primary/40 text-[10px] leading-snug cursor-pointer flex flex-col gap-1 w-full bg-surface-950/20"
                >
                  <span className="font-bold text-slate-350">{p.text}</span>
                  <span className="text-[8px] text-slate-500 uppercase tracking-wider font-mono">#{p.category}</span>
                </button>
              ))}
            </div>
          )}

          {/* Messages list */}
          {messages.map((msg, idx) => {
            const isUser = msg.sender === 'user'
            return (
              <div
                key={idx}
                className={`flex gap-2.5 max-w-[90%] ${isUser ? 'self-end flex-row-reverse' : 'self-start'}`}
              >
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] shrink-0 select-none ${
                  isUser ? 'bg-accent-glow border border-accent/20' : 'bg-primary-glow border border-primary/20'
                }`}>
                  {isUser ? '👤' : '🤖'}
                </div>

                <div className="flex flex-col gap-1.5 max-w-full">
                  <div className={`p-3 rounded-xl text-xs leading-normal ${
                    isUser
                      ? 'bg-primary text-white rounded-tr-none'
                      : 'bg-surface-950/50 border border-slate-800/80 text-slate-200 rounded-tl-none'
                  }`}>
                    <span className="whitespace-pre-wrap">{msg.text}</span>
                  </div>
                  
                  {/* Embedded smart actions */}
                  {!isUser && msg.text.toLowerCase().includes('stock') && (
                    <div className="flex gap-2 mt-1">
                      <button 
                        onClick={() => { navigateTo('inventory'); setCopilotOpen(false); }}
                        className="btn-ghost py-1 px-2 text-[9px] font-bold border-primary/20 text-primary uppercase"
                      >
                        📦 Open Inventory
                      </button>
                    </div>
                  )}
                  {!isUser && msg.text.toLowerCase().includes('billing') && (
                    <div className="flex gap-2 mt-1">
                      <button 
                        onClick={() => { navigateTo('billing'); setCopilotOpen(false); }}
                        className="btn-ghost py-1 px-2 text-[9px] font-bold border-emerald-500/20 text-emerald-400 uppercase"
                      >
                        💳 Go to Checkout
                      </button>
                    </div>
                  )}

                  {/* SQL matching collapsibles */}
                  {!isUser && msg.rawData && msg.rawData.length > 0 && (
                    <div className="border border-slate-800 bg-surface-950/30 rounded-lg overflow-hidden mt-1 text-[9px] font-mono">
                      <div className="px-2.5 py-1 bg-surface-950/80 border-b border-slate-800 text-slate-500 font-bold flex justify-between">
                        <span>ORM MATCHES ({msg.rawData.length} rows)</span>
                      </div>
                      <div className="max-h-28 overflow-y-auto p-1.5">
                        {msg.rawData.slice(0, 3).map((row, rIdx) => (
                          <div key={rIdx} className="border-b border-slate-800/40 py-1 last:border-0">
                            <span className="font-bold text-slate-350">{row.name}</span> · Stock: <span className="text-emerald-400 font-bold">{row.quantity}</span> · Price: <span className="text-slate-400 font-bold">₹{row.mrp}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <span className="text-[8px] text-slate-500 self-end font-mono mt-0.5">{msg.time}</span>
                </div>
              </div>
            )
          })}

          {/* Reasoning Steps Panel */}
          {loading && reasoningSteps.length > 0 && (
            <div className="pl-8 flex flex-col gap-1.5 text-[10px] text-slate-500 font-mono animate-pulse border-l border-slate-800/80 ml-3">
              {reasoningSteps.map((step, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <span className="text-emerald-500">✓</span>
                  <span>{step}</span>
                </div>
              ))}
              <div className="flex items-center gap-1.5 mt-1 text-[9px] text-primary">
                <Spinner size="sm" className="border-t-primary" />
                <span>Generating reasoning summary...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Voice active overlay visualizer */}
        {voiceActive && (
          <div className="absolute inset-0 bg-surface-950/90 backdrop-filter blur-sm z-20 flex flex-col items-center justify-center p-6 text-center animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-gradient-primary flex items-center justify-center text-white mb-6 animate-pulse-glow shadow-glow text-2xl">
              🎙️
            </div>
            
            <h4 className="text-sm font-bold text-slate-200 tracking-tight">{listeningText}</h4>
            <p className="text-[10px] text-slate-500 mt-2">Speak clearly into the operator headset</p>

            {/* Simulated audio waveform */}
            <div className="flex items-center gap-1.5 justify-center mt-8 h-8">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((h, i) => (
                <div 
                  key={i} 
                  className="w-1 bg-gradient-primary rounded-full animate-waveform"
                  style={{ animationDelay: `${i * 90}ms`, height: `${h * 3.5}px` }}
                />
              ))}
            </div>

            <button 
              onClick={() => setVoiceActive(false)}
              className="btn-ghost mt-12 py-1.5 px-4 text-xs hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-rose-450"
            >
              Cancel Dictation
            </button>
          </div>
        )}

        {/* Pinned Input control */}
        <div className="p-3 border-t border-glass-border bg-surface-950/20 flex gap-2 items-center">
          <button 
            onClick={startVoiceCapture}
            className="w-8 h-8 rounded-lg bg-surface-900 border border-border hover:border-primary/40 text-slate-400 hover:text-primary flex items-center justify-center cursor-pointer transition"
            title="Dictate Query (Voice)"
          >
            🎙️
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSend()
            }}
            placeholder="Ask Copilot or dictate operations..."
            className="input-base py-1.5 flex-1"
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim()}
            className="w-8 h-8 rounded-lg bg-gradient-primary text-white border-none flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-lg transition"
          >
            ➔
          </button>
        </div>
      </aside>
    </>
  )
}
