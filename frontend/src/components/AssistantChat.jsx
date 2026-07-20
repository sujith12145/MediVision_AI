import { useState, useRef, useEffect } from 'react'
import { askAssistant } from '../services/api'

export default function AssistantChat() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  
  const messagesEndRef = useRef(null)

  // Scroll to bottom whenever messages change
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = async (questionText) => {
    const query = questionText || input.trim()
    if (!query) return

    if (!questionText) {
      setInput('')
    }

    // Append user message
    const userMsg = { sender: 'user', text: query, timestamp: new Date() }
    setMessages((prev) => [...prev, userMsg])
    setLoading(true)

    try {
      const response = await askAssistant(query)
      
      // Append assistant message with raw data
      const assistantMsg = {
        sender: 'assistant',
        text: response.answer,
        rawData: response.raw_data || [],
        timestamp: new Date()
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch (err) {
      console.error('Assistant request failed:', err)
      
      // Append assistant message indicating error
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

  return (
    <div className="border border-slate-800/80 bg-surface-800/40 backdrop-blur-md rounded-3xl p-6 shadow-xl animate-fade-in">
      
      {/* Chat Interface */}
      <div className="w-full flex flex-col h-[600px] border border-slate-800 bg-surface-900/60 rounded-2xl overflow-hidden shadow-inner">
        
        {/* Chat Header */}
        <div className="bg-surface-950/40 border-b border-slate-800 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🤖</span>
            <div>
              <h4 className="font-bold text-slate-100 text-sm">Inventory Query Engine</h4>
              <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Secure ORM parameter execution only</p>
            </div>
          </div>
          <span className="text-[10px] uppercase font-bold text-primary-400 bg-primary-500/10 border border-primary-500/20 px-2 py-0.5 rounded-full tracking-wider font-mono">
            Rule-Based Tools
          </span>
        </div>

        {/* Message Log */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {/* Greeting message */}
          <div className="flex gap-2.5 max-w-[85%] self-start">
            <div className="w-7 h-7 rounded-lg bg-primary-500/10 border border-primary-500/20 flex items-center justify-center text-xs overflow-hidden select-none flex-shrink-0">
              🤖
            </div>
            <div className="bg-surface-900 border border-slate-800/80 rounded-2xl rounded-tl-none p-3.5 shadow-sm text-xs leading-relaxed text-slate-300">
              <p className="font-bold text-slate-200 mb-1">Hello! I am your secure inventory assistant.</p>
              I can answer queries using defined query tools. I will never compile arbitrary SQL. Type your query below.
            </div>
          </div>

          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex gap-2.5 max-w-[85%] ${msg.sender === 'user' ? 'self-end flex-row-reverse' : 'self-start'}`}
            >
              {/* Profile icon */}
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs overflow-hidden select-none flex-shrink-0 ${
                msg.sender === 'user'
                  ? 'bg-accent-500/10 border border-accent-500/20'
                  : 'bg-primary-500/10 border border-primary-500/20'
              }`}>
                {msg.sender === 'user' ? '👤' : '🤖'}
              </div>

              {/* Balloon */}
              <div className="flex flex-col gap-2">
                <div className={`rounded-2xl p-3.5 shadow-sm text-xs leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-accent-600 text-white rounded-tr-none'
                    : 'bg-surface-900 border border-slate-800/80 text-slate-300 rounded-tl-none'
                }`}>
                  <span className="whitespace-pre-wrap">{msg.text}</span>
                </div>

                {/* Collapsible raw data container */}
                {msg.sender === 'assistant' && msg.rawData && msg.rawData.length > 0 && (
                  <RawDataToggle data={msg.rawData} />
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-2.5 max-w-[85%] self-start animate-pulse">
              <div className="w-7 h-7 rounded-lg bg-primary-500/10 border border-primary-500/20 flex items-center justify-center text-sm flex-shrink-0">
                🤖
              </div>
              <div className="bg-surface-900 border border-slate-800/80 rounded-2xl rounded-tl-none p-3.5 shadow-sm text-xs text-slate-500 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                <span>Running secure tool calls…</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSend()
          }}
          className="bg-surface-950/20 border-t border-slate-800/80 p-3 flex gap-2 items-center"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about inventory values, manufacturers, expirations..."
            disabled={loading}
            className="flex-grow bg-surface-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-primary-500/80 transition font-medium"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="bg-primary-600 hover:bg-primary-500 disabled:opacity-40 disabled:hover:bg-primary-600 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shrink-0"
          >
            <span>Send</span>
            <span>🚀</span>
          </button>
        </form>

      </div>

    </div>
  )
}

// Collapsible raw data helper component
function RawDataToggle({ data }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border border-slate-800/60 bg-surface-900/40 rounded-xl overflow-hidden mt-1 max-w-[550px]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full bg-surface-950/40 px-3 py-2 text-[9px] text-slate-400 hover:text-slate-200 transition font-bold flex items-center justify-between border-b border-slate-800/40"
      >
        <span>🔍 Raw Query Results ({data.length} rows found)</span>
        <span>{expanded ? '▲ Hide' : '▼ Show'}</span>
      </button>

      {expanded && (
        <div className="p-2 overflow-x-auto max-h-[180px] text-[9px]">
          <table className="w-full text-left text-slate-400 border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500">
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
                <tr key={row.id} className="border-b border-slate-800/30 hover:bg-surface-800/20">
                  <td className="py-1 px-1.5 font-bold text-slate-300">{row.name} {row.strength}</td>
                  <td className="py-1 px-1.5 truncate max-w-[80px]">{row.manufacturer || '—'}</td>
                  <td className="py-1 px-1.5 font-mono">{row.quantity}</td>
                  <td className="py-1 px-1.5 font-mono">{row.expiry_date || '—'}</td>
                  <td className="py-1 px-1.5 font-mono">${row.mrp}</td>
                  <td className="py-1 px-1.5 truncate max-w-[60px]">{row.storage_location || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
