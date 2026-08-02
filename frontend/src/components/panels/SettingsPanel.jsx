export default function SettingsPanel() {
  return (
    <div className="panel-enter text-slate-100 flex flex-col gap-6">
      <div className="panel-header">
        <div>
          <h2 className="panel-title flex items-center gap-2">
            <span>⚙️</span> System Settings
          </h2>
          <p className="panel-subtitle">Configure hardware scanning and peripheral triggers</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-card p-6 flex flex-col gap-4">
          <h3 className="text-sm font-bold text-slate-200">Label Printing Options</h3>
          <p className="text-xs text-slate-500 leading-normal">
            Select label size and printer parameters. Custom shelf label layout uses standard 3.5" x 2.0" dimensions.
          </p>
          <div className="flex flex-col gap-3 mt-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase text-slate-400">Default Label Size</label>
              <select className="input-base font-semibold">
                <option>3.5in x 2.0in (Standard shelf tag)</option>
                <option>4.0in x 1.0in (Vial wrap)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="glass-card p-6 flex flex-col gap-4">
          <h3 className="text-sm font-bold text-slate-200">Receipt Printers</h3>
          <p className="text-xs text-slate-500 leading-normal">
            Configure default checkout printing targets. Uses standard courier thermal receipts.
          </p>
          <div className="flex flex-col gap-3 mt-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase text-slate-400">Connection Mode</label>
              <select className="input-base font-semibold">
                <option>System Default Print Spooler</option>
                <option>Raw POS (USB/Serial)</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
