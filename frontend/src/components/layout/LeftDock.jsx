import { useWorkspace } from '../../contexts/WorkspaceContext'

export default function LeftDock() {
  const { activePanel, navigateTo, userRole, userEmail } = useWorkspace()

  const sections = [
    {
      title: 'Workspace',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: '📊' },
        { id: 'inventory', label: 'Stock Grid', icon: '📦' },
        { id: 'intake', label: 'Stock Intake', icon: '📸' }
      ]
    },
    {
      title: 'Operations',
      items: [
        { id: 'qr-lookup', label: 'QR Scan Lookup', icon: '🔍' },
        { id: 'billing', label: 'POS checkout', icon: '💳' },
        { id: 'copilot', label: 'AI Copilot', icon: '💬' },
        { id: 'voice', label: 'Voice Dictation', icon: '🎙️' }
      ]
    },
    {
      title: 'Analytics & Audits',
      items: [
        { id: 'analytics', label: 'Performance', icon: '📈' },
        { id: 'suppliers', label: 'Suppliers PO', icon: '🤝' },
        { id: 'reports', label: 'Reports templates', icon: '📋' },
        { id: 'audit', label: 'Trace audits', icon: '🛡️' },
        { id: 'finance', label: 'Fixed cost P&L', icon: '💸', adminOnly: true }
      ]
    }
  ]

  const handleNavClick = (item) => {
    if (item.adminOnly && userRole === 'staff') {
      return // locked
    }
    navigateTo(item.id)
  }

  return (
    <aside className="workspace-dock">
      {/* Brand Header */}
      <div className="h-16 flex items-center gap-3 px-5 border-b border-glass-border">
        <div className="logo-mark text-slate-900 font-extrabold text-xs select-none">
          🩺
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-xs tracking-tight text-slate-200 leading-none">
            MediVision AI
          </span>
          <span className="text-[8px] font-bold text-primary mt-1 uppercase tracking-widest font-mono">
            OPERATING OS
          </span>
        </div>
      </div>

      {/* Categorized menu */}
      <nav className="flex-1 py-4 flex flex-col gap-3 overflow-y-auto">
        {sections.map((section, idx) => (
          <div key={idx} className="flex flex-col gap-0.5">
            <div className="section-label text-slate-500 font-bold tracking-wider">{section.title}</div>
            
            {section.items.map((item) => {
              const isActive = activePanel === item.id
              const isLocked = item.adminOnly && userRole === 'staff'

              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item)}
                  disabled={isLocked}
                  className={`dock-item ${isActive ? 'active' : ''} ${
                    isLocked ? 'opacity-30 cursor-not-allowed hover:bg-transparent' : ''
                  }`}
                  title={isLocked ? 'Admin clearance credentials required' : item.label}
                >
                  <span className="dock-item-icon text-sm select-none">{item.icon}</span>
                  <span className="flex-grow text-left font-semibold text-xs truncate">{item.label}</span>
                  {isLocked && <span className="text-[9px] opacity-60">🔒</span>}
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Footer Profile badge */}
      <div className="p-4 border-t border-glass-border bg-surface-950/40 flex flex-col gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-primary-glow border border-primary/25 flex items-center justify-center text-xs select-none">
            👤
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-[10px] font-bold text-slate-200 truncate" title={userEmail}>
              {userEmail ? userEmail.split('@')[0] : 'Pharmacy Operator'}
            </span>
            <span className="text-[8px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1 font-mono">
              <span className={`w-1.5 h-1.5 rounded-full ${userRole === 'admin' ? 'bg-amber-500' : 'bg-slate-500'}`} />
              {userRole} clearance
            </span>
          </div>
        </div>
      </div>
    </aside>
  )
}
