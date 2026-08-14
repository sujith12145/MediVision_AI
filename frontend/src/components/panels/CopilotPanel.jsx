import { useState, useRef, useEffect } from 'react'
import { askAssistant } from '../../services/api'
import GlassCard from '../ui/GlassCard'
import Spinner from '../ui/Spinner'
import Badge from '../ui/Badge'

export default function CopilotPanel() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = async (textVal) => {
    const query = textVal || input.trim()
    if (!query) return

    if (!textVal) {
      setInput('')
    }

    const userMsg = { sender: 'user', text: query, timestamp: new Date() }
    setMessages((prev) => [...prev, userMsg])
    setLoading(true)

    try {
      const response = await askAssistant(query)
      const assistantMsg = {
        sender: 'assistant',
        text: response.answer,
        rawData: response.raw_data || [],
        timestamp: new Date()
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch (err) {
      console.error('Assistant request failed:', err)
      const errorMsg = {
        sender: 'assistant',
        text: '⚠️ I encountered an error communicating with the inventory database. Please verify your query structure.',
        timestamp: new Date()
      }
      setMessages((prev) => [...prev, errorMsg])
    } finally {
      setLoading(false)
    }
  }

  const suggestedPrompts = [
    "What medicines are currently low on stock?",
    "Show me medicines expiring in the next 30 days",
    "List all medicines from Cipla manufacturer",
    "Find medicines stored in Shelf A4"
  ]

  return (
    <div className="panel-enter flex flex-col gap-6 h-[calc(100vh-140px)]">
      
      <div className="panel-header mb-0">
        <div>
          <h2 className="panel-title flex items-center gap-2">
            <span>💬</span> AI Copilot Assistant
          </h2>
          <p className="panel-subtitle">Ask questions about inventory stock levels, manufacturers, or expiry dates</p>
        </div>
      </div>

      <GlassCard className="flex flex-col flex-1 overflow-hidden h-full">
        {/* Chat Header */}
        <div className="px-6 py-3 border-b border-slate-800 bg-surface-950/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs font-bold text-slate-350">Secure Database ORM Engine</span>
          </div>
          <Badge variant="cyan" className="font-mono text-[9px] uppercase tracking-wider">
            Gemini Flash
          </Badge>
        </div>

        {/* Conversation flow */}
        <div className="flex-grow overflow-y-auto p-6 flex flex-col gap-4">
          
          {/* Welcome Balloon */}
          <div className="flex gap-3 max-w-[80%] self-start animate-fade-in">
            <div className="w-7 h-7 rounded-lg bg-primary-500/10 border border-primary-500/20 flex items-center justify-center text-xs shrink-0 select-none">
              🤖
            </div>
            <div className="bg-surface-950/40 border border-slate-800/80 p-3.5 rounded-2xl rounded-tl-none text-xs text-slate-300 leading-normal">
              <strong className="block text-slate-200 mb-1">Hello! I am your secure inventory assistant.</strong>
              I compile and execute secure data lookups. Select a shortcut prompt below or write your own query.
            </div>
          </div>

          {/* suggested prompts on empty chat list */}
          {messages.length === 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg ml-10 mt-2">
              {suggestedPrompts.map((p) => (
                <button
                  key={p}
                  onClick={() => handleSend(p)}
                  className="btn-ghost p-3 text-left rounded-xl hover:border-primary-500/30 text-xs font-semibold leading-normal"
                >
                  💡 {p}
                </button>
              ))}
            </div>
          )}

          {/* Messages loop */}
          {messages.map((msg, idx) => {
            const isUser = msg.sender === 'user'
            return (
              <div
                key={idx}
                className={`flex gap-3 max-w-[80%] ${isUser ? 'self-end flex-row-reverse' : 'self-start'} animate-fade-in`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs shrink-0 select-none ${
                  isUser ? 'bg-accent-500/10 border border-accent-500/20' : 'bg-primary-500/10 border border-primary-500/20'
                }`}>
                  {isUser ? '👤' : '🤖'}
                </div>

                <div className="flex flex-col gap-2 max-w-full">
                  <div className={`p-3.5 rounded-2xl text-xs leading-normal ${
                    isUser
                      ? 'bg-primary-600 text-white rounded-tr-none'
                      : 'bg-surface-950/40 border border-slate-800/80 text-slate-300 rounded-tl-none'
                  }`}>
                    <span className="whitespace-pre-wrap">{msg.text}</span>
                  </div>

                  {/* collapsibles raw data tables */}
                  {!isUser && msg.rawData && msg.rawData.length > 0 && (
                    <RawDataToggle data={msg.rawData} />
                  )}
                </div>
              </div>
            )
          })}

          {/* Loading Typing Indicator */}
          {loading && (
            <div className="flex gap-3 max-w-[80%] self-start animate-pulse">
              <div className="w-7 h-7 rounded-lg bg-primary-500/10 border border-primary-500/20 flex items-center justify-center text-xs shrink-0 select-none">
                🤖
              </div>
              <div className="bg-surface-950/40 border border-slate-800/80 p-3.5 rounded-2xl rounded-tl-none text-xs text-slate-500 flex items-center gap-2.5">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounceDot" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounceDot" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounceDot" style={{ animationDelay: '300ms' }} />
                </div>
                <span>Executing secure tool calls…</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Pinned Input bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSend()
          }}
          className="p-4 border-t border-slate-800/80 bg-surface-950/30 flex gap-3 items-center"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            placeholder="Ask about inventory values, manufacturers, expirations..."
            className="input-base flex-grow py-2.5 text-xs font-semibold"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="btn-primary py-2.5 px-4 text-xs font-extrabold uppercase tracking-wider shrink-0 disabled:opacity-40"
          >
            Send 🚀
          </button>
        </form>
      </GlassCard>

    </div>
  )
}

function RawDataToggle({ data }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border border-slate-800/80 bg-surface-950/20 rounded-xl overflow-hidden mt-1 max-w-lg">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 text-[9px] font-bold text-slate-500 hover:text-slate-350 transition flex items-center justify-between border-b border-slate-800/40 bg-surface-950/50 cursor-pointer"
      >
        <span>🔍 SQL Ledger matches ({data.length} rows found)</span>
        <span>{expanded ? '▲ Hide' : '▼ Show'}</span>
      </button>

      {expanded && (
        <div className="p-2.5 overflow-x-auto max-h-[160px] text-[9px] font-mono">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-600">
                <th className="py-1 px-1.5">Medicine</th>
                <th className="py-1 px-1.5">Mfr</th>
                <th className="py-1 px-1.5">Qty</th>
                <th className="py-1 px-1.5">Expiry</th>
                <th className="py-1 px-1.5">MRP</th>
                <th className="py-1 px-1.5">Loc</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.id} className="border-b border-slate-800/30 hover:bg-surface-800/10 text-slate-400">
                  <td className="py-1 px-1.5 font-bold text-slate-300 truncate max-w-[80px]">{row.name} {row.strength}</td>
                  <td className="py-1 px-1.5 truncate max-w-[80px]">{row.manufacturer || '—'}</td>
                  <td className="py-1 px-1.5 font-bold">{row.quantity}</td>
                  <td className="py-1 px-1.5">{row.expiry_date || '—'}</td>
                  <td className="py-1 px-1.5 font-bold text-emerald-400">₹{row.mrp}</td>
                  <td className="py-1 px-1.5 truncate max-w-[65px]">{row.storage_location || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
