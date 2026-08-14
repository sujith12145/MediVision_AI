import { useState, useEffect, useRef } from 'react'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { searchMedicines } from '../../services/api'
import Spinner from '../ui/Spinner'

export default function CommandPalette() {
  const { 
    commandPaletteOpen, 
    setCommandPaletteOpen, 
    navigateTo, 
    userRole,
    setPrefilledMedicine
  } = useWorkspace()
  
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  
  const inputRef = useRef(null)
  const containerRef = useRef(null)

  // Standard menu commands
  const commands = [
    { id: 'dashboard', label: 'Go to Dashboard Panel', shortcut: 'G D', icon: '📊' },
    { id: 'inventory', label: 'Go to Stock Grid Catalog', shortcut: 'G I', icon: '📦' },
    { id: 'intake', label: 'Go to Stock Intake Scanner', shortcut: 'G A', icon: '📸' },
    { id: 'qr-lookup', label: 'Go to QR Scan Lookup', shortcut: 'G Q', icon: '🔍' },
    { id: 'billing', label: 'Go to POS checkout billing', shortcut: 'G B', icon: '💳' },
    { id: 'copilot', label: 'Go to Copilot AI operations', shortcut: 'G C', icon: '💬' },
    { id: 'voice', label: 'Go to Voice transcript logs', shortcut: 'G V', icon: '🎙️' },
    { id: 'analytics', label: 'Go to Performance Analytics', shortcut: 'G P', icon: '📈' },
    { id: 'suppliers', label: 'Go to Suppliers Purchase Orders', shortcut: 'G O', icon: '🤝' },
    { id: 'reports', label: 'Go to PDF template centers', shortcut: 'G R', icon: '📋' },
    { id: 'audit', label: 'Go to Traceability security audits', shortcut: 'G S', icon: '🛡️' },
    { id: 'finance', label: 'Go to Fixed cost overrides', shortcut: 'G F', icon: '💸', adminOnly: true },
    { id: 'settings', label: 'Go to System settings config', shortcut: 'G H', icon: '⚙️' }
  ]

  // Live filter standard command items
  const filteredCommands = commands.filter((cmd) => {
    const matchesSearch = cmd.label.toLowerCase().includes(search.toLowerCase())
    const passesRoleGate = !cmd.adminOnly || userRole === 'admin'
    return matchesSearch && passesRoleGate
  })

  // Debounced live DB search for medicines
  useEffect(() => {
    if (!search.trim()) {
      setSearchResults([])
      return
    }

    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const meds = await searchMedicines(search.trim())
        setSearchResults(meds ? meds.slice(0, 5) : [])
      } catch (e) {
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 200)

    return () => clearTimeout(timer)
  }, [search])

  const totalResults = [...filteredCommands, ...searchResults]

  // Focus triggers
  useEffect(() => {
    if (commandPaletteOpen) {
      setSearch('')
      setActiveIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [commandPaletteOpen])

  const handleSelectIndex = (item) => {
    if (item.qr_code_id) {
      // It is a medicine record
      setPrefilledMedicine(item)
      navigateTo('inventory')
    } else {
      // It is a navigation command
      navigateTo(item.id)
    }
    setCommandPaletteOpen(false)
  }

  // Keyboard navigation
  useEffect(() => {
    if (!commandPaletteOpen) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setCommandPaletteOpen(false)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((prev) => (prev + 1) % totalResults.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((prev) => (prev - 1 + totalResults.length) % totalResults.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (totalResults[activeIndex]) {
          handleSelectIndex(totalResults[activeIndex])
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [commandPaletteOpen, activeIndex, totalResults])

  // Click outside close
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setCommandPaletteOpen(false)
      }
    }
    if (commandPaletteOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [commandPaletteOpen])

  if (!commandPaletteOpen) return null

  return (
    <div className="cmd-overlay">
      <div ref={containerRef} className="cmd-palette">
        {/* Search Input bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border bg-surface-950/20">
          <span className="text-slate-500 text-sm">🔍</span>
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command or medicine name to jump..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setActiveIndex(0)
            }}
            className="flex-grow bg-transparent text-slate-100 placeholder-slate-600 outline-none text-xs font-semibold"
          />
          {searching && <Spinner size="sm" className="border-t-primary" />}
          <span className="shortcut-tag text-[9px] select-none font-bold">ESC</span>
        </div>

        {/* Search Results list */}
        <div className="max-h-[300px] overflow-y-auto py-2">
          {totalResults.length > 0 ? (
            totalResults.map((item, index) => {
              const isActive = index === activeIndex
              const isMed = !!item.qr_code_id

              return (
                <button
                  key={isMed ? `med-${item.id}` : `cmd-${item.id}`}
                  onClick={() => handleSelectIndex(item)}
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-xs font-semibold transition border-l-2 ${
                    isActive
                      ? 'bg-surface-900/60 text-white border-primary shadow-[inset_0_0_1px_rgba(255,255,255,0.05)]'
                      : 'text-slate-400 hover:bg-surface-950/40 border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <span className="text-sm select-none">{isMed ? '💊' : item.icon}</span>
                    <span className="truncate max-w-[280px]">
                      {item.label || item.name}
                      {isMed && (
                        <span className="text-[9px] text-slate-550 block font-normal mt-0.5">
                          Batch: {item.batch_number || 'N/A'} · Stock: {item.quantity} · Price: ₹{item.mrp}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono tracking-wider">
                    {isMed ? 'DATABASE MATCH' : item.shortcut}
                  </span>
                </button>
              )
            })
          ) : (
            <div className="text-center py-8 text-slate-600 text-xs">
              No matching commands or database medicines found.
            </div>
          )}
        </div>

        {/* Footer shortcuts info */}
        <div className="bg-surface-950/40 px-4 py-2 border-t border-border flex items-center justify-between text-[9px] text-slate-650 font-bold uppercase tracking-wider select-none font-mono">
          <div className="flex gap-4">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
          </div>
          <span>MediVision OS search</span>
        </div>
      </div>
    </div>
  )
}
