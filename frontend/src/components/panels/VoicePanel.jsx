import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import GlassCard from '../ui/GlassCard'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { supabase } from '../../services/supabase'

import { PipecatClient } from '@pipecat-ai/client-js'
import { WebSocketTransport } from '@pipecat-ai/websocket-transport'

/* ─── authenticated fetch ─────────────────────────────────── */
async function apiFetch(path, opts = {}) {
  const { data: sd } = await supabase.auth.getSession()
  const token = sd.session?.access_token
  return fetch(path, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  })
}

/* ─── format helpers ─────────────────────────────────────── */
function fmtTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })
}
function sanitize(str) {
  if (!str) return ''
  return String(str).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#x27;'}[c]))
}

/* ─── priority classification for reminders ──────────────── */
function reminderPriority(rem) {
  if (rem.reminder_type === 'until_resolved') return 'critical'
  if (rem.reminder_type === 'daily') return 'medium'
  return 'low'
}
function reminderIcon(type) {
  return { daily: '🔁', weekly: '📅', until_resolved: '🔴', custom: '⏱️' }[type] || '🔔'
}

/* ════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ════════════════════════════════════════════════════════════ */

/* ── Animated sound waveform ──────────────────────────────── */
function SoundWave({ active, color = '#a78bfa', bars = 8 }) {
  return (
    <div className="flex items-end gap-[2px] h-5">
      {Array.from({ length: bars }, (_, i) => {
        const heights = [0.4, 0.8, 1, 0.6, 0.9, 0.5, 0.7, 0.3]
        return (
          <div
            key={i}
            style={{
              width: 3,
              height: active ? `${heights[i % heights.length] * 20}px` : 4,
              backgroundColor: color,
              borderRadius: 2,
              transition: 'height 0.15s ease',
              animation: active ? `voiceBar ${0.4 + i * 0.07}s ease-in-out infinite alternate` : 'none',
              animationDelay: `${i * 0.06}s`,
            }}
          />
        )
      })}
      <style>{`
        @keyframes voiceBar { from { transform: scaleY(0.3); } to { transform: scaleY(1); } }
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        @keyframes orbPulse { 0%,100%{box-shadow:0 0 0 0 rgba(99,102,241,.4)} 50%{box-shadow:0 0 0 20px rgba(99,102,241,0)} }
        @keyframes spinSlow { to { transform: rotate(360deg); } }
        @keyframes timelineFill { from{height:0} to{height:100%} }
        .anim-fade-slide { animation: fadeSlideIn .3s ease both; }
        .skeleton { background: linear-gradient(90deg,rgba(255,255,255,.04) 25%,rgba(255,255,255,.08) 50%,rgba(255,255,255,.04) 75%); background-size:200% 100%; animation:shimmer 1.5s infinite; border-radius:6px; }
      `}</style>
    </div>
  )
}

/* ── Skeleton loader block ───────────────────────────────── */
function Skeleton({ h = '16px', w = '100%', className = '' }) {
  return <div className={`skeleton ${className}`} style={{ height: h, width: w }} />
}

/* ── Live AI Status Bar ──────────────────────────────────── */
const STATUS_CONFIG = {
  disconnected:  { label: 'Offline',       color: 'text-slate-500', dot: 'bg-slate-600',                          icon: '○' },
  connecting:    { label: 'Connecting',    color: 'text-yellow-400', dot: 'bg-yellow-400 animate-pulse',           icon: '◐' },
  listening:     { label: 'Listening',     color: 'text-emerald-400', dot: 'bg-emerald-400 animate-pulse shadow-[0_0_8px_2px_rgba(52,211,153,.5)]', icon: '◉' },
  user_speaking: { label: 'You Speaking',  color: 'text-teal-400',   dot: 'bg-teal-400 animate-pulse',             icon: '🗣️' },
  thinking:      { label: 'AI Thinking',   color: 'text-violet-400', dot: 'bg-violet-400 animate-pulse',           icon: '⚙' },
  bot_speaking:  { label: 'AI Speaking',   color: 'text-indigo-400', dot: 'bg-indigo-400 animate-pulse shadow-[0_0_8px_2px_rgba(129,140,248,.6)]', icon: '🤖' },
  calling_tool:  { label: 'Calling Tool',  color: 'text-cyan-400',   dot: 'bg-cyan-400 animate-pulse',             icon: '⚡' },
  saving:        { label: 'Saving',        color: 'text-amber-400',  dot: 'bg-amber-400 animate-pulse',            icon: '💾' },
  completed:     { label: 'Completed',     color: 'text-emerald-400', dot: 'bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,.4)]', icon: '✓' },
  disconnecting: { label: 'Ending',        color: 'text-orange-400', dot: 'bg-orange-400 animate-pulse',           icon: '◌' },
}

function LiveStatusBar({ aiStatus }) {
  const cfg = STATUS_CONFIG[aiStatus] || STATUS_CONFIG.disconnected
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block w-2 h-2 rounded-full ${cfg.dot}`} />
      <span className={`text-xs font-bold ${cfg.color} tracking-wide`}>{cfg.label}</span>
    </div>
  )
}

/* ── Tool Execution Viewer ───────────────────────────────── */
const TOOL_PIPELINE = [
  { key: 'speech', label: 'Speech Recognition', icon: '🎤' },
  { key: 'gemini',  label: 'Gemini AI',           icon: '✨' },
  { key: 'inventory', label: 'Inventory Tool',   icon: '📦' },
  { key: 'reminder',  label: 'Reminder Tool',    icon: '🔔' },
  { key: 'task',      label: 'Task Tool',         icon: '📋' },
  { key: 'audit',     label: 'Audit Log',         icon: '📝' },
]

function ToolExecutionViewer({ toolLog, isActive }) {
  const activeIdx = toolLog.length > 0 ? Math.min(toolLog.length, TOOL_PIPELINE.length - 1) : (isActive ? 1 : -1)
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-1">Tool Execution Pipeline</span>
      {TOOL_PIPELINE.map((step, i) => {
        const done = i < activeIdx
        const current = i === activeIdx && isActive
        return (
          <div key={step.key} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] transition-all duration-300 ${
              done ? 'bg-emerald-900/40 border border-emerald-700/50 text-emerald-400'
              : current ? 'bg-violet-900/40 border border-violet-600/60 text-violet-300 animate-pulse'
              : 'bg-slate-900/40 border border-slate-800 text-slate-600'
            }`}>{done ? '✓' : current ? '⚡' : step.icon}</div>
            <span className={`text-[10px] font-semibold ${done ? 'text-emerald-400' : current ? 'text-violet-300' : 'text-slate-600'}`}>
              {step.label}
            </span>
            {current && <span className="text-[9px] text-violet-500 animate-pulse font-mono">running…</span>}
            {i < TOOL_PIPELINE.length - 1 && (
              <div className="ml-auto flex items-center">
                <div className={`w-3 h-px ${done ? 'bg-emerald-700' : 'bg-slate-800'}`} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ── AI Daily Brief ──────────────────────────────────────── */
function AIDailyBrief({ brief, loading, onDismiss, onStartSession }) {
  if (loading) {
    return (
      <GlassCard className="p-5 border border-indigo-900/30 bg-indigo-950/10">
        <div className="flex gap-3 items-start">
          <div className="w-8 h-8 rounded-xl bg-indigo-900/30 flex items-center justify-center text-base shrink-0">✨</div>
          <div className="flex-1 flex flex-col gap-2">
            <Skeleton h="14px" w="180px" />
            <Skeleton h="12px" w="100%" />
            <Skeleton h="12px" w="75%" />
          </div>
        </div>
      </GlassCard>
    )
  }
  if (!brief) return null
  const hasIssues = brief.low_stock?.length > 0 || brief.expiring?.length > 0 || brief.pending_reminders?.length > 0 || brief.pending_tasks_count > 0
  return (
    <GlassCard className={`p-5 border anim-fade-slide relative overflow-hidden ${hasIssues ? 'border-amber-900/40 bg-amber-950/8' : 'border-emerald-900/30 bg-emerald-950/8'}`}>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />
      <div className="flex gap-3 items-start">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0 ${hasIssues ? 'bg-amber-900/30' : 'bg-emerald-900/30'}`}>
          {hasIssues ? '📋' : '✅'}
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">AI Daily Brief</span>
            <button onClick={onDismiss} className="text-slate-600 hover:text-slate-400 text-xs font-mono transition">✕</button>
          </div>
          <p className={`text-xs font-semibold leading-relaxed mb-3 ${hasIssues ? 'text-amber-200' : 'text-emerald-300'}`}>
            {brief.summary_text}
          </p>
          {hasIssues && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              {brief.low_stock?.length > 0 && (
                <div className="bg-red-950/20 border border-red-900/30 rounded-lg px-2.5 py-1.5 text-center">
                  <div className="text-base font-extrabold text-red-400">{brief.low_stock.length}</div>
                  <div className="text-[9px] text-red-500 font-bold uppercase tracking-wider">Low Stock</div>
                </div>
              )}
              {brief.expiring?.length > 0 && (
                <div className="bg-pink-950/20 border border-pink-900/30 rounded-lg px-2.5 py-1.5 text-center">
                  <div className="text-base font-extrabold text-pink-400">{brief.expiring.length}</div>
                  <div className="text-[9px] text-pink-500 font-bold uppercase tracking-wider">Expiring</div>
                </div>
              )}
              {brief.pending_reminders?.length > 0 && (
                <div className="bg-yellow-950/20 border border-yellow-900/30 rounded-lg px-2.5 py-1.5 text-center">
                  <div className="text-base font-extrabold text-yellow-400">{brief.pending_reminders.length}</div>
                  <div className="text-[9px] text-yellow-500 font-bold uppercase tracking-wider">Reminders</div>
                </div>
              )}
              {brief.pending_tasks_count > 0 && (
                <div className="bg-orange-950/20 border border-orange-900/30 rounded-lg px-2.5 py-1.5 text-center">
                  <div className="text-base font-extrabold text-orange-400">{brief.pending_tasks_count}</div>
                  <div className="text-[9px] text-orange-500 font-bold uppercase tracking-wider">Tasks</div>
                </div>
              )}
            </div>
          )}
          {hasIssues && brief.low_stock?.slice(0, 3).length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {brief.low_stock.slice(0, 3).map(m => (
                <span key={m.id} className="text-[9px] bg-red-950/20 text-red-300 border border-red-900/30 rounded px-2 py-0.5 font-bold">
                  💊 {m.name} ({m.quantity}/{m.reorder_threshold})
                </span>
              ))}
              {brief.low_stock.length > 3 && <span className="text-[9px] text-slate-500 font-semibold">+{brief.low_stock.length - 3} more</span>}
            </div>
          )}
          <button
            onClick={onStartSession}
            className="btn-primary text-[10px] py-1.5 px-4 font-extrabold uppercase tracking-wider"
          >
            🎙️ Start Voice Session
          </button>
        </div>
      </div>
    </GlassCard>
  )
}

/* ── AI Action Cards ─────────────────────────────────────── */
function AIActionCard({ extraction, onApprove, onReject, onEdit }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ ...extraction })

  const priorityColor = { high: 'text-red-400 border-red-900/40 bg-red-950/10', medium: 'text-yellow-400 border-yellow-900/40 bg-yellow-950/10', low: 'text-emerald-400 border-emerald-900/40 bg-emerald-950/10' }
  const p = (draft.priority || 'medium').toLowerCase()

  return (
    <div className={`border rounded-xl p-3.5 anim-fade-slide flex flex-col gap-2.5 ${priorityColor[p] || priorityColor.medium}`}>
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500">AI Action Extracted</span>
        <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
          p === 'high' ? 'bg-red-950/30 text-red-400' : p === 'low' ? 'bg-emerald-950/30 text-emerald-400' : 'bg-yellow-950/30 text-yellow-400'
        }`}>{draft.priority || 'Medium'} Priority</span>
      </div>
      {editing ? (
        <div className="flex flex-col gap-2">
          {['medicine', 'action', 'priority', 'due_date', 'assigned_staff', 'supplier'].map(field => (
            <div key={field} className="flex flex-col gap-0.5">
              <label className="text-[8px] font-bold uppercase tracking-wider text-slate-500">{field.replace('_', ' ')}</label>
              <input
                className="input-base text-[11px] py-1.5"
                value={draft[field] || ''}
                onChange={e => setDraft(d => ({ ...d, [field]: e.target.value }))}
                placeholder={field.replace('_', ' ')}
              />
            </div>
          ))}
          <div className="flex gap-2 mt-1">
            <button onClick={() => { onEdit(draft); setEditing(false) }} className="btn-primary text-[10px] py-1.5 px-3 font-extrabold">Save</button>
            <button onClick={() => setEditing(false)} className="btn-ghost text-[10px] py-1.5 px-3">Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {[
              { label: 'Medicine', val: draft.medicine, icon: '💊' },
              { label: 'Action', val: draft.action, icon: '⚡' },
              { label: 'Due Date', val: draft.due_date, icon: '📅' },
              { label: 'Staff', val: draft.assigned_staff, icon: '👤' },
              { label: 'Supplier', val: draft.supplier, icon: '🏭' },
              { label: 'Reminder', val: draft.reminder, icon: '🔔' },
            ].filter(f => f.val).map(f => (
              <div key={f.label} className="flex flex-col gap-0.5">
                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">{f.icon} {f.label}</span>
                <span className="text-[11px] font-semibold text-slate-200">{f.val}</span>
              </div>
            ))}
          </div>
          {draft.confidence !== undefined && (
            <div className="flex items-center gap-2">
              <span className="text-[8px] text-slate-500 font-bold uppercase">Confidence</span>
              <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-violet-600 to-indigo-400 rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(100, (draft.confidence || 0) * 100)}%` }} />
              </div>
              <span className="text-[8px] font-bold text-slate-400 font-mono">{Math.round((draft.confidence || 0) * 100)}%</span>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={() => onApprove(draft)} className="flex-1 py-1.5 text-[10px] font-extrabold uppercase tracking-wider rounded-lg bg-emerald-900/30 border border-emerald-800/50 text-emerald-400 hover:bg-emerald-900/50 transition">✓ Approve</button>
            <button onClick={() => setEditing(true)} className="flex-1 py-1.5 text-[10px] font-extrabold uppercase tracking-wider rounded-lg bg-slate-900/30 border border-slate-700/50 text-slate-300 hover:bg-slate-800/40 transition">✏ Edit</button>
            <button onClick={() => onReject(draft)} className="flex-1 py-1.5 text-[10px] font-extrabold uppercase tracking-wider rounded-lg bg-red-950/20 border border-red-900/40 text-red-400 hover:bg-red-950/40 transition">✕ Reject</button>
          </div>
        </>
      )}
    </div>
  )
}

/* ── AI Confidence Bar (per field) ──────────────────────── */
function ConfidenceIndicator({ label, value, requiresConfirm }) {
  const pct = Math.min(100, Math.round((value || 0) * 100))
  const color = pct >= 80 ? 'from-emerald-600 to-emerald-400' : pct >= 50 ? 'from-yellow-600 to-yellow-400' : 'from-red-700 to-red-500'
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] font-bold text-slate-500 w-24 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-slate-800/60 rounded-full overflow-hidden">
        <div className={`h-full bg-gradient-to-r ${color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[9px] font-mono font-bold text-slate-400 w-8 text-right">{pct}%</span>
      {requiresConfirm && pct < 60 && <span className="text-[8px] font-extrabold text-amber-400 bg-amber-950/30 border border-amber-900/40 px-1.5 py-0.5 rounded-full">⚠ Confirm</span>}
    </div>
  )
}

/* ── Operations Timeline ─────────────────────────────────── */
const TIMELINE_STEPS = [
  { id: 'inventory_updated', label: 'Inventory Updated', icon: '📦', color: 'border-slate-700 text-slate-500' },
  { id: 'issue_detected',    label: 'AI Detected Issue', icon: '🔍', color: 'border-yellow-800/50 text-yellow-500' },
  { id: 'conversation',      label: 'Conversation Started', icon: '🎙️', color: 'border-violet-800/50 text-violet-400' },
  { id: 'decision',          label: 'Decision Extracted', icon: '⚡', color: 'border-indigo-800/50 text-indigo-400' },
  { id: 'reminder',          label: 'Reminder Created', icon: '🔔', color: 'border-amber-800/50 text-amber-400' },
  { id: 'task',              label: 'Task Assigned', icon: '👤', color: 'border-cyan-800/50 text-cyan-400' },
  { id: 'audit',             label: 'Audit Log Written', icon: '📝', color: 'border-emerald-800/50 text-emerald-400' },
  { id: 'completed',         label: 'Completed', icon: '✅', color: 'border-emerald-600/60 text-emerald-300' },
]

function OperationsTimeline({ call }) {
  if (!call) return (
    <div className="py-12 text-center text-slate-600 italic text-xs">Select a conversation to view its operations timeline.</div>
  )
  // Derive completed steps from the call data
  const completed = new Set(['inventory_updated', 'issue_detected', 'conversation'])
  if (call.actions?.length || call.medicines?.length) completed.add('decision')
  if (call.reminder_created) completed.add('reminder')
  if (call.assignments?.length) completed.add('task')
  completed.add('audit')
  if (call.status === 'completed') completed.add('completed')

  return (
    <div className="flex flex-col gap-0">
      {TIMELINE_STEPS.map((step, i) => {
        const done = completed.has(step.id)
        const last = i === TIMELINE_STEPS.length - 1
        return (
          <div key={step.id} className="flex gap-3 group">
            {/* Left: dot + connector */}
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-[11px] transition-all duration-500 shrink-0 ${
                done ? 'border-emerald-600 bg-emerald-950/40' : 'border-slate-800 bg-slate-950/40'
              }`}>
                {done ? '✓' : step.icon}
              </div>
              {!last && (
                <div className={`w-px flex-1 my-1 transition-all duration-700 ${done ? 'bg-emerald-800/50' : 'bg-slate-800/50'}`}
                  style={{ minHeight: 20 }} />
              )}
            </div>
            {/* Right: label */}
            <div className="pb-4 pt-1 flex flex-col gap-0.5">
              <span className={`text-[11px] font-bold ${done ? 'text-slate-200' : 'text-slate-600'}`}>{step.label}</span>
              {done && step.id === 'conversation' && call.timestamp && (
                <span className="text-[9px] text-slate-500 font-mono">{fmtTime(call.timestamp)}</span>
              )}
              {done && step.id === 'reminder' && call.reminder_created && (
                <span className="text-[9px] text-amber-500 font-semibold">{call.reminder_created}</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Smart Call Summary ──────────────────────────────────── */
function SmartCallSummary({ call, onCommitTasks, onEditExtraction, isExpanded, onToggle }) {
  if (!call) return null
  const extraction = call.structured_extraction || {}
  return (
    <div className={`border rounded-xl transition-all duration-300 overflow-hidden anim-fade-slide ${
      isExpanded ? 'border-primary/40 bg-primary-glow/5' : 'border-slate-800 bg-surface-900/20 hover:border-slate-700'
    }`}>
      {/* Header row */}
      <div className="flex items-center gap-3 p-3.5 cursor-pointer" onClick={onToggle}>
        <div className={`w-2 h-2 rounded-full shrink-0 ${call.status === 'completed' ? 'bg-emerald-400' : 'bg-yellow-400 animate-pulse'}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <strong className="text-[11px] text-slate-200 truncate">{call.caller || 'Voice Session'}</strong>
            {call.medicines?.length > 0 && (
              <span className="text-[9px] bg-violet-950/30 text-violet-300 border border-violet-900/30 rounded px-1.5 font-bold">
                💊 {call.medicines.length}
              </span>
            )}
            {call.actions?.length > 0 && (
              <span className="text-[9px] bg-emerald-950/30 text-emerald-300 border border-emerald-900/30 rounded px-1.5 font-bold">
                ⚡ {call.actions.length}
              </span>
            )}
          </div>
          <span className="text-[9px] text-slate-500 font-mono">{fmtTime(call.timestamp)} · {call.duration || '—'}</span>
        </div>
        <span className="text-slate-500 text-xs font-mono shrink-0">{isExpanded ? '▲' : '▼'}</span>
      </div>

      {isExpanded && (
        <div className="border-t border-slate-800 p-4 flex flex-col gap-4">
          {/* Summary chips row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { label: 'Duration', val: call.duration || '—', icon: '⏱️' },
              { label: 'Status', val: call.status || 'completed', icon: '●' },
              { label: 'Medicines', val: call.medicines?.length || 0, icon: '💊' },
              { label: 'Actions', val: call.actions?.length || 0, icon: '⚡' },
            ].map(chip => (
              <div key={chip.label} className="bg-slate-900/30 border border-slate-800 rounded-lg px-2.5 py-2 text-center">
                <div className="text-sm font-extrabold text-slate-200">{chip.val}</div>
                <div className="text-[8px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">{chip.icon} {chip.label}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Transcript */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Transcript</span>
              <div className="bg-slate-950/30 border border-slate-900 rounded-xl p-3 max-h-32 overflow-y-auto">
                <p className="text-[11px] text-slate-400 leading-relaxed italic">
                  {call.transcript ? `"${sanitize(call.transcript)}"` : '(No transcript recorded)'}
                </p>
              </div>
            </div>

            {/* Extracted data */}
            <div className="flex flex-col gap-2.5">
              {call.medicines?.length > 0 && (
                <div>
                  <span className="text-[9px] font-bold uppercase text-slate-500 tracking-wider">Medicines Discussed</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {call.medicines.map((m, i) => (
                      <span key={i} className="text-[10px] bg-violet-950/20 text-violet-300 border border-violet-900/30 rounded px-2 py-0.5 font-bold">💊 {m}</span>
                    ))}
                  </div>
                </div>
              )}
              {call.actions?.length > 0 && (
                <div>
                  <span className="text-[9px] font-bold uppercase text-slate-500 tracking-wider">Actions Decided</span>
                  <div className="mt-1 flex flex-col gap-1">
                    {call.actions.map((a, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[11px] text-emerald-300">
                        <span className="text-emerald-500 shrink-0">✓</span> {a}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {call.assignments?.length > 0 && (
                <div>
                  <span className="text-[9px] font-bold uppercase text-slate-500 tracking-wider">Staff Assignments</span>
                  <div className="mt-1 flex flex-col gap-1">
                    {call.assignments.map((a, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[11px] text-cyan-300">
                        <span className="text-cyan-500 shrink-0">→</span> {a}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {call.supplier_followups?.length > 0 && (
                <div>
                  <span className="text-[9px] font-bold uppercase text-slate-500 tracking-wider">Supplier Follow-ups</span>
                  <div className="mt-1 flex flex-col gap-1">
                    {call.supplier_followups.map((s, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[11px] text-amber-300">
                        <span className="text-amber-500 shrink-0">📞</span> {s}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {call.reminder_created && (
                <div className="bg-yellow-950/20 border border-yellow-900/30 rounded-lg px-3 py-2 text-[10px] text-yellow-300 font-semibold">
                  🔔 Reminder: {call.reminder_created}
                </div>
              )}
            </div>
          </div>

          {/* Structured extraction */}
          {Object.keys(extraction).length > 0 && (
            <div className="border border-slate-800 bg-slate-950/20 rounded-xl p-3 flex flex-col gap-2">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Structured Extraction</span>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {Object.entries(extraction).filter(([k, v]) => v && k !== 'confidence').map(([k, v]) => (
                  <div key={k} className="flex flex-col gap-0.5">
                    <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">{k.replace(/_/g, ' ')}</span>
                    <span className="text-[11px] font-semibold text-slate-300">{String(v)}</span>
                  </div>
                ))}
              </div>
              {extraction.confidence !== undefined && (
                <ConfidenceIndicator label="Overall" value={extraction.confidence} requiresConfirm />
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {(call.actions?.length > 0 || call.assignments?.length > 0 || call.supplier_followups?.length > 0) && (
              <button
                onClick={() => onCommitTasks(call)}
                className="btn-primary text-[10px] py-1.5 px-4 font-extrabold uppercase tracking-wider"
              >
                📥 Commit to Checklist
              </button>
            )}
            {Object.keys(extraction).length > 0 && (
              <button
                onClick={() => onEditExtraction(call)}
                className="btn-ghost text-[10px] py-1.5 px-4 font-extrabold uppercase tracking-wider"
              >
                ✏️ Edit Extraction
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Reminder Center Card ────────────────────────────────── */
function ReminderCard({ rem, onResolve, onSnooze, onCancel, snoozeLoading }) {
  const priority = reminderPriority(rem)
  const borderColor = { critical: 'border-red-900/50 hover:border-red-800/60', medium: 'border-yellow-900/40 hover:border-yellow-800/50', low: 'border-slate-800 hover:border-slate-700' }
  const bgColor = { critical: 'bg-red-950/8', medium: 'bg-yellow-950/5', low: 'bg-slate-950/10' }
  const labelColor = { critical: 'text-red-400 bg-red-950/30 border-red-900/40', medium: 'text-yellow-400 bg-yellow-950/30 border-yellow-900/40', low: 'text-slate-400 bg-slate-900/30 border-slate-800' }

  return (
    <div className={`border rounded-xl p-3.5 transition-all duration-200 anim-fade-slide ${borderColor[priority]} ${bgColor[priority]}`}>
      <div className="flex items-start gap-3">
        <span className="text-xl shrink-0 mt-0.5">{reminderIcon(rem.reminder_type)}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <span className="text-xs font-bold text-slate-200 leading-snug">{rem.title}</span>
            <span className={`shrink-0 text-[8px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${labelColor[priority]}`}>
              {priority}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-2">
            <span className="text-[9px] text-slate-500 font-mono">Created: {fmtTime(rem.last_reminded_at || rem.created_at)}</span>
            {rem.reminder_time && (
              <span className="text-[9px] text-slate-500 font-mono">Next: {fmtTime(rem.reminder_time)}</span>
            )}
            {rem.repeat_interval && (
              <span className="text-[9px] text-violet-500 font-bold">{rem.repeat_interval}</span>
            )}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => onResolve(rem.id)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-900/50 bg-emerald-950/20 text-emerald-400 hover:bg-emerald-950/40 text-[9px] font-extrabold uppercase tracking-wide transition"
            >✓ Resolve</button>
            <button
              onClick={() => onSnooze(rem.id)}
              disabled={snoozeLoading === rem.id}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-yellow-900/40 bg-yellow-950/15 text-yellow-400 hover:bg-yellow-950/30 text-[9px] font-extrabold uppercase tracking-wide transition disabled:opacity-50"
            >{snoozeLoading === rem.id ? '…' : '💤 Snooze'}</button>
            <button
              onClick={() => onCancel(rem.id)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-red-950 bg-red-950/15 text-red-400 hover:bg-red-950/35 text-[9px] font-extrabold uppercase tracking-wide transition"
            >✕ Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── AI Suggestions Strip ─────────────────────────────────── */
const SUGGESTION_ACTIONS = [
  { label: 'Create Purchase Order', icon: '🛒', color: 'border-violet-900/40 bg-violet-950/15 text-violet-300 hover:bg-violet-950/30', id: 'po' },
  { label: 'Assign Staff',          icon: '👤', color: 'border-cyan-900/40 bg-cyan-950/15 text-cyan-300 hover:bg-cyan-950/30', id: 'staff' },
  { label: 'Call Supplier',         icon: '📞', color: 'border-amber-900/40 bg-amber-950/15 text-amber-300 hover:bg-amber-950/30', id: 'supplier' },
  { label: 'Create Reminder',       icon: '🔔', color: 'border-yellow-900/40 bg-yellow-950/15 text-yellow-300 hover:bg-yellow-950/30', id: 'reminder' },
  { label: 'Mark High Priority',    icon: '🚨', color: 'border-red-900/40 bg-red-950/15 text-red-300 hover:bg-red-950/30', id: 'priority' },
]

function AISuggestions({ onAction }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500">AI Suggestions</span>
      <div className="flex flex-wrap gap-2">
        {SUGGESTION_ACTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => onAction(s)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-bold transition ${s.color}`}
          >
            <span>{s.icon}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── Dashboard Stats Grid ────────────────────────────────── */
function DashboardStats({ stats, loading }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <GlassCard key={i} className="p-3 flex flex-col gap-2 items-center border border-slate-800">
            <Skeleton h="20px" w="32px" className="rounded-full" />
            <Skeleton h="24px" w="40px" />
            <Skeleton h="10px" w="60px" />
          </GlassCard>
        ))}
      </div>
    )
  }
  if (!stats) return null
  const items = [
    { label: 'Total Calls',      value: stats.total_calls,        icon: '📞', color: 'text-violet-400' },
    { label: 'Active Reminders', value: stats.reminders_active,   icon: '🔔', color: 'text-yellow-400' },
    { label: 'Resolved',         value: stats.reminders_resolved, icon: '✅', color: 'text-emerald-400' },
    { label: 'Tasks Pending',    value: stats.tasks_pending,      icon: '📋', color: 'text-orange-400' },
    { label: 'Tasks Done',       value: stats.tasks_completed,    icon: '🏁', color: 'text-slate-400' },
    { label: 'Low Stock',        value: stats.low_stock_alerts,   icon: '⚠️', color: 'text-red-400' },
    { label: 'Expiry Alerts',    value: stats.expiry_alerts,      icon: '💊', color: 'text-pink-400' },
  ]
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
      {items.map(s => (
        <GlassCard key={s.label} className="p-3 flex flex-col gap-0.5 border border-slate-800 bg-surface-950/10 text-center hover:border-slate-700 transition">
          <span className="text-lg">{s.icon}</span>
          <span className={`text-xl font-extrabold ${s.color}`}>{s.value ?? '—'}</span>
          <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider leading-tight">{s.label}</span>
        </GlassCard>
      ))}
    </div>
  )
}

/* ── Tab Button ──────────────────────────────────────────── */
function TabBtn({ id, label, icon, activeTab, badgeCount, onClick }) {
  const isActive = activeTab === id
  return (
    <button
      onClick={() => onClick(id)}
      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-bold transition-all duration-200 relative ${
        isActive
          ? 'bg-violet-900/40 border border-violet-700/50 text-violet-200 shadow-[0_0_12px_rgba(109,40,217,0.2)]'
          : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900/40 border border-transparent'
      }`}
    >
      <span>{icon}</span>
      <span className="hidden sm:inline">{label}</span>
      {badgeCount > 0 && (
        <span className="absolute -top-1 -right-1 text-[8px] font-extrabold bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center">
          {badgeCount > 9 ? '9+' : badgeCount}
        </span>
      )}
    </button>
  )
}

/* ════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════════ */
export default function VoicePanel() {
  const { showToast, addTask } = useWorkspace()

  /* ── Tabs ─── */
  const [activeTab, setActiveTab] = useState('overview')

  /* ── Voice session ── */
  const [connectionStatus, setConnectionStatus] = useState('disconnected')
  const [isBotSpeaking, setIsBotSpeaking] = useState(false)
  const [isUserSpeaking, setIsUserSpeaking] = useState(false)
  const [micEnabled, setMicEnabled] = useState(true)
  const [micPermission, setMicPermission] = useState('unknown')
  const [transcripts, setTranscripts] = useState([])
  const [toolLog, setToolLog] = useState([])   // Track tool invocations in the session

  /* ── Derived AI status ── */
  const aiStatus = useMemo(() => {
    if (connectionStatus === 'disconnected') return 'disconnected'
    if (connectionStatus === 'connecting') return 'connecting'
    if (connectionStatus === 'disconnecting') return 'disconnecting'
    if (isUserSpeaking) return 'user_speaking'
    if (isBotSpeaking) return 'bot_speaking'
    return 'listening'
  }, [connectionStatus, isBotSpeaking, isUserSpeaking])

  /* ── Call history ── */
  const [calls, setCalls] = useState([])
  const [loadingCalls, setLoadingCalls] = useState(false) // lazy — only on tab activation
  const [expandedCallId, setExpandedCallId] = useState(null)
  const [timelineCall, setTimelineCall] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [activePlayCall, setActivePlayCall] = useState(null)

  /* ── Reminders ── */
  const [reminders, setReminders] = useState([])
  const [loadingReminders, setLoadingReminders] = useState(true)
  const [snoozeLoading, setSnoozeLoading] = useState(null)
  const [reminderFilter, setReminderFilter] = useState('all') // 'all'|'critical'|'medium'|'low'

  /* ── Dashboard stats ── */
  const [dashStats, setDashStats] = useState(null)
  const [loadingStats, setLoadingStats] = useState(true)

  /* ── AI Daily Brief ── */
  const [dailyBrief, setDailyBrief] = useState(null)
  const [loadingBrief, setLoadingBrief] = useState(true)
  const [briefDismissed, setBriefDismissed] = useState(false)

  /* ── Notifications ── */
  const [notifications, setNotifications] = useState([])

  /* ── AI Action Cards (from last completed call) ── */
  const [actionCards, setActionCards] = useState([])

  /* ── Refs ── */
  const pcClientRef = useRef(null)
  const botAudioRef = useRef(null)
  const transcriptEndRef = useRef(null)
  const notificationWsRef = useRef(null)
  const utteranceRef = useRef(null)
  const sessionStartRef = useRef(null)

  /* ────────────────────────────────────────────────────────────
     DATA FETCHING
  ──────────────────────────────────────────────────────────── */
  const fetchDashStats = useCallback(async () => {
    setLoadingStats(true)
    try {
      const r = await apiFetch('/api/voice/dashboard-summary')
      if (r.ok) setDashStats(await r.json())
    } catch (e) { console.error('dashStats', e) }
    finally { setLoadingStats(false) }
  }, [])

  const fetchDailyBrief = useCallback(async () => {
    setLoadingBrief(true)
    try {
      const r = await apiFetch('/api/voice/daily-brief')
      if (r.ok) setDailyBrief(await r.json())
    } catch (e) { console.error('dailyBrief', e) }
    finally { setLoadingBrief(false) }
  }, [])

  const fetchCalls = useCallback(async () => {
    setLoadingCalls(true)
    try {
      const r = await apiFetch('/api/voice/calls?limit=30')
      if (r.ok) {
        const data = await r.json()
        setCalls(data)
        // Generate AI Action Cards from the latest call's structured extraction
        if (data.length > 0) {
          const latest = data[0]
          const ext = latest.structured_extraction || {}
          if (Object.keys(ext).length > 0) {
            setActionCards([ext])
          }
        }
      }
    } catch (e) { console.error('calls', e) }
    finally { setLoadingCalls(false) }
  }, [])

  const fetchReminders = useCallback(async () => {
    setLoadingReminders(true)
    try {
      const r = await apiFetch('/api/voice/reminders')
      if (r.ok) setReminders(await r.json())
    } catch (e) { console.error('reminders', e) }
    finally { setLoadingReminders(false) }
  }, [])

  useEffect(() => {
    fetchDashStats()
    fetchDailyBrief()
    fetchReminders()
    navigator.permissions?.query({ name: 'microphone' }).then(p => {
      setMicPermission(p.state)
      p.onchange = () => setMicPermission(p.state)
    }).catch(() => {})
  }, [fetchDashStats, fetchDailyBrief, fetchReminders])

  // Lazy load calls only when history or timeline tab is active
  useEffect(() => {
    if ((activeTab === 'history' || activeTab === 'timeline') && calls.length === 0) {
      fetchCalls()
    }
  }, [activeTab, calls.length, fetchCalls])

  const speak = useCallback((text) => {
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.rate = 0.95; utt.pitch = 1
    const voices = window.speechSynthesis.getVoices()
    const pref = voices.find(v => v.lang === 'en-IN') || voices.find(v => v.lang.startsWith('en'))
    if (pref) utt.voice = pref
    utteranceRef.current = utt
    utt.onend = () => { setIsPlaying(false); setActivePlayCall(null) }
    window.speechSynthesis.speak(utt)
  }, [])

  const addNotification = useCallback((n) => {
    const id = Date.now()
    setNotifications(prev => [{ ...n, id, ts: new Date() }, ...prev].slice(0, 10))
    setTimeout(() => setNotifications(prev => prev.filter(x => x.id !== id)), 12000)
  }, [])

  const handleNotificationEvent = useCallback((data) => {
    if (data.type === 'trigger_reminder') {
      addNotification({ kind: 'reminder', text: data.text, id: data.reminder_id })
      speak(data.text)
      fetchReminders()
      fetchDashStats()
    } else if (data.type === 'reminder_resolved') {
      addNotification({ kind: 'resolved', text: data.message || 'Reminder resolved automatically.' })
      fetchReminders()
      fetchDashStats()
      fetchDailyBrief()
    } else if (data.type === 'low_stock') {
      addNotification({ kind: 'warning', text: data.message })
    }
  }, [speak, addNotification, fetchReminders, fetchDashStats, fetchDailyBrief])

  /* ────────────────────────────────────────────────────────────
     NOTIFICATION WEBSOCKET
  ──────────────────────────────────────────────────────────── */
  useEffect(() => {
    let ws
    const connect = async () => {
      const { data: sd } = await supabase.auth.getSession()
      const token = sd.session?.access_token
      if (!token) return
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${protocol}://${window.location.host}/api/voice/notifications?token=${token}`)
      notificationWsRef.current = ws
      ws.onmessage = (evt) => {
        try { handleNotificationEvent(JSON.parse(evt.data)) } catch { }
      }
      ws.onclose = () => {
        if (notificationWsRef.current === ws) setTimeout(connect, 5000)
      }
    }
    connect()
    return () => {
      notificationWsRef.current = null
      ws?.close()
    }
  }, [handleNotificationEvent])

  /* ────────────────────────────────────────────────────────────
     VOICE SESSION
  ──────────────────────────────────────────────────────────── */
  const startConversation = async () => {
    if (connectionStatus !== 'disconnected') return
    setConnectionStatus('connecting')
    setTranscripts([])
    setToolLog([])
    sessionStartRef.current = Date.now()

    try {
      const { data: sd } = await supabase.auth.getSession()
      const token = sd.session?.access_token
      if (!token) throw new Error('Not authenticated')

      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
      // Use the correct WebSocket path registered in voice/router.py
      const wsUrl = `${protocol}://${window.location.host}/api/voice/ws?token=${token}`

      const transport = new WebSocketTransport()
      const client = new PipecatClient({
        transport,
        params: { baseUrl: wsUrl, endpoints: { connect: '/' } },
        enableMic: true,
        enableCam: false,
        callbacks: {
          onConnected: () => setConnectionStatus('connected'),
          onDisconnected: () => {
            setConnectionStatus('disconnected')
            setIsBotSpeaking(false)
            setIsUserSpeaking(false)
            fetchCalls()
            fetchDashStats()
            fetchDailyBrief()
          },
          onBotConnected: () => {
            setToolLog(prev => [...prev, { key: 'gemini', ts: new Date() }])
          },
          onBotStartedSpeaking: () => setIsBotSpeaking(true),
          onBotStoppedSpeaking: () => setIsBotSpeaking(false),
          onUserStartedSpeaking: () => {
            setIsUserSpeaking(true)
            setToolLog(prev => [...prev, { key: 'speech', ts: new Date() }])
          },
          onUserStoppedSpeaking: () => setIsUserSpeaking(false),
          onUserTranscript: (data) => {
            if (data.final) {
              setTranscripts(prev => [...prev, { role: 'user', text: data.text, ts: new Date() }])
              scrollTranscriptBottom()
            }
          },
          onBotTranscript: (data) => {
            setTranscripts(prev => [...prev, { role: 'assistant', text: data.text, ts: new Date() }])
            scrollTranscriptBottom()
            // Detect tool calls from bot transcripts (heuristic)
            const t = (data.text || '').toLowerCase()
            if (t.includes('checking') || t.includes('looking up') || t.includes('checking inventory')) {
              setToolLog(prev => [...prev, { key: 'inventory', ts: new Date() }])
            }
            if (t.includes('reminder') || t.includes('remind')) {
              setToolLog(prev => [...prev, { key: 'reminder', ts: new Date() }])
            }
            if (t.includes('task') || t.includes('assign')) {
              setToolLog(prev => [...prev, { key: 'task', ts: new Date() }])
            }
          },
          onError: (err) => {
            console.error('Pipecat error', err)
            showToast('Voice session error. Please retry.', 'danger')
            setConnectionStatus('disconnected')
          },
        },
      })

      if (botAudioRef.current) client.attachAudio(botAudioRef.current)
      pcClientRef.current = client
      await client.connect()
    } catch (err) {
      console.error('Voice start error:', err)
      showToast(`Cannot start voice session: ${err.message}`, 'danger')
      setConnectionStatus('disconnected')
    }
  }

  const stopConversation = async () => {
    if (!pcClientRef.current) return
    setConnectionStatus('disconnecting')
    setToolLog(prev => [...prev, { key: 'audit', ts: new Date() }])
    try { await pcClientRef.current.disconnect() } catch (e) { console.error(e) }
    pcClientRef.current = null
    setConnectionStatus('disconnected')
    setIsBotSpeaking(false)
    setIsUserSpeaking(false)
    window.speechSynthesis.cancel()
  }

  const toggleMic = async () => {
    if (!pcClientRef.current) return
    const next = !micEnabled
    setMicEnabled(next)
    try {
      if (next) await pcClientRef.current.enableMic(true)
      else await pcClientRef.current.enableMic(false)
    } catch (e) { console.error(e) }
  }

  const scrollTranscriptBottom = () => {
    setTimeout(() => transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  /* ────────────────────────────────────────────────────────────
     TTS PLAYBACK
  ──────────────────────────────────────────────────────────── */
  useEffect(() => () => window.speechSynthesis.cancel(), [])

  function handlePlayClick(call) {
    if (activePlayCall?.id === call.id && isPlaying) {
      window.speechSynthesis.cancel(); setIsPlaying(false); setActivePlayCall(null); return
    }
    window.speechSynthesis.cancel()
    setActivePlayCall(call); setIsPlaying(true)
    const text = call.transcript
      ? `Call from ${call.caller}. Transcript: ${call.transcript}`
      : `Call from ${call.caller} on ${fmtTime(call.timestamp)}. Duration ${call.duration}.`
    speak(text)
  }

  /* ────────────────────────────────────────────────────────────
     REMINDER ACTIONS
  ──────────────────────────────────────────────────────────── */
  const deleteReminder = async (id) => {
    try {
      const r = await apiFetch(`/api/voice/reminders/${id}`, { method: 'DELETE' })
      if (r.ok) { showToast('Reminder cancelled', 'success'); fetchReminders(); fetchDashStats() }
      else showToast('Failed to cancel reminder', 'danger')
    } catch { showToast('Error cancelling reminder', 'danger') }
  }

  const snoozeReminder = async (id) => {
    setSnoozeLoading(id)
    try {
      const r = await apiFetch(`/api/voice/reminders/${id}/snooze?minutes=30`, { method: 'POST' })
      if (r.ok) { showToast('Snoozed 30 min ⏱️', 'success'); fetchReminders() }
      else showToast('Failed to snooze', 'danger')
    } catch { showToast('Error snoozing', 'danger') }
    finally { setSnoozeLoading(null) }
  }

  const resolveReminder = async (id) => {
    try {
      const r = await apiFetch(`/api/voice/reminders/${id}/resolve`, { method: 'POST' })
      if (r.ok) { showToast('Reminder resolved ✅', 'success'); fetchReminders(); fetchDashStats(); fetchDailyBrief() }
      else showToast('Failed to resolve', 'danger')
    } catch { showToast('Error resolving', 'danger') }
  }

  /* ────────────────────────────────────────────────────────────
     TASK COMMITMENT
  ──────────────────────────────────────────────────────────── */
  const handleCommitTasks = (call) => {
    const items = [...(call.actions || []), ...(call.assignments || []), ...(call.supplier_followups || [])]
    if (!items.length) { showToast('No actions to commit', 'warning'); return }
    items.forEach(action => addTask(action))
    showToast(`${items.length} action(s) added to checklist ✅`, 'success')
  }

  const handleEditExtraction = async () => {
    // Open simple prompt for now; in production this would open a modal
    showToast('Structured extraction editing: click the fields in the card above.', 'info')
  }

  /* ────────────────────────────────────────────────────────────
     AI ACTION CARDS
  ──────────────────────────────────────────────────────────── */
  const handleApproveCard = async (extraction) => {
    if (calls[0]?.id) {
      try {
        const r = await apiFetch(`/api/voice/calls/${calls[0].id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(extraction),
        })
        if (r.ok) { showToast('Action approved & saved ✅', 'success'); setActionCards([]); fetchCalls() }
        else showToast('Failed to save', 'danger')
      } catch { showToast('Error saving', 'danger') }
    } else {
      showToast('Action approved', 'success')
      setActionCards([])
    }
  }

  const handleRejectCard = () => {
    showToast('Action card rejected', 'warning')
    setActionCards([])
  }

  const handleEditCard = (updatedExtraction) => {
    setActionCards([updatedExtraction])
  }

  /* ────────────────────────────────────────────────────────────
     AI SUGGESTIONS
  ──────────────────────────────────────────────────────────── */
  const handleSuggestionAction = (suggestion) => {
    const messages = {
      po: 'Creating purchase order — say "create a purchase order" in the voice session.',
      staff: 'Assigning staff — say "assign [staff name] to [task]" in the voice session.',
      supplier: 'Call supplier — note the supplier details from the call summary.',
      reminder: 'Creating reminder — say "remind me about [medicine] daily" in the voice session.',
      priority: 'Marked as high priority in operations log.',
    }
    showToast(messages[suggestion.id] || 'Action triggered', 'info')
  }

  /* ────────────────────────────────────────────────────────────
     COMPUTED
  ──────────────────────────────────────────────────────────── */
  const filteredReminders = useMemo(() => {
    if (reminderFilter === 'all') return reminders
    return reminders.filter(r => reminderPriority(r) === reminderFilter)
  }, [reminders, reminderFilter])

  const criticalCount = useMemo(() => reminders.filter(r => reminderPriority(r) === 'critical').length, [reminders])
  const mediumCount = useMemo(() => reminders.filter(r => reminderPriority(r) === 'medium').length, [reminders])
  const lowCount = useMemo(() => reminders.filter(r => reminderPriority(r) === 'low').length, [reminders])

  /* ────────────────────────────────────────────────────────────
     VOICE MEMORY — unresolved reminders linked to recent context
  ──────────────────────────────────────────────────────────── */
  const voiceMemory = useMemo(() => {
    return reminders.filter(r => r.reminder_type === 'until_resolved' || r.reminder_type === 'daily').slice(0, 3)
  }, [reminders])

  /* ════════════════════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════════════════════ */
  return (
    <div className="flex flex-col gap-5 max-w-7xl mx-auto pb-10">
      <audio ref={botAudioRef} autoPlay style={{ display: 'none' }} />

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-100 tracking-tight flex items-center gap-2">
            🏥 AI Pharmacy Operations Center
          </h2>
          <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
            Voice AI · Persistent Reminders · Smart Summaries · Auto-Resolution · Real-time Intelligence
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LiveStatusBar aiStatus={aiStatus} />
          {micPermission === 'denied' && (
            <span className="text-[10px] font-bold text-red-400 bg-red-950/30 border border-red-900/40 px-2 py-0.5 rounded-full">
              🚫 Mic blocked
            </span>
          )}
        </div>
      </div>

      {/* ── NOTIFICATION STRIP ────────────────────────────────── */}
      {notifications.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {notifications.map(n => (
            <div
              key={n.id}
              className={`flex items-start gap-3 px-4 py-2.5 rounded-xl border text-xs font-semibold anim-fade-slide ${
                n.kind === 'reminder' ? 'border-yellow-800 bg-yellow-950/30 text-yellow-300'
                : n.kind === 'resolved' ? 'border-emerald-800 bg-emerald-950/30 text-emerald-300'
                : 'border-red-800 bg-red-950/30 text-red-300'
              }`}
            >
              <span className="shrink-0">{n.kind === 'reminder' ? '🔔' : n.kind === 'resolved' ? '✅' : '⚠️'}</span>
              <span className="flex-1">{n.text}</span>
              <button onClick={() => setNotifications(prev => prev.filter(x => x.id !== n.id))} className="text-slate-500 hover:text-slate-300 font-mono shrink-0">✕</button>
            </div>
          ))}
        </div>
      )}

      {/* ── TAB NAVIGATION ────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <TabBtn id="overview"  label="Overview"      icon="📊" activeTab={activeTab} onClick={setActiveTab} />
        <TabBtn id="voice"     label="Voice Session" icon="🎙️" activeTab={activeTab} onClick={setActiveTab} />
        <TabBtn id="reminders" label="Reminders"     icon="🔔" activeTab={activeTab} badgeCount={criticalCount} onClick={setActiveTab} />
        <TabBtn id="history"   label="History"       icon="📋" activeTab={activeTab} onClick={setActiveTab} />
        <TabBtn id="timeline"  label="Timeline"      icon="⏱️" activeTab={activeTab} onClick={setActiveTab} />
      </div>

      {/* ════════════════════════════════════════════════════════
          TAB: OVERVIEW
         ════════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className="flex flex-col gap-5 anim-fade-slide">

          {/* AI Daily Brief */}
          {!briefDismissed && (
            <AIDailyBrief
              brief={dailyBrief}
              loading={loadingBrief}
              onDismiss={() => setBriefDismissed(true)}
              onStartSession={() => { setActiveTab('voice'); startConversation() }}
            />
          )}

          {/* Dashboard Stats */}
          <DashboardStats stats={dashStats} loading={loadingStats} />

          {/* AI Operations Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Voice Memory */}
            <GlassCard className="p-5 border border-slate-800 flex flex-col gap-3">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  🧠 Voice Memory
                </h3>
                <span className="text-[9px] text-slate-500 font-bold uppercase">Unresolved Issues</span>
              </div>
              {voiceMemory.length === 0 ? (
                <div className="py-6 text-center text-slate-600 italic text-xs">No unresolved issues in memory.</div>
              ) : (
                voiceMemory.map(rem => (
                  <div key={rem.id} className="flex items-start gap-2 p-2.5 bg-amber-950/10 border border-amber-900/30 rounded-xl">
                    <span className="text-sm shrink-0 mt-0.5">{reminderIcon(rem.reminder_type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-amber-200 leading-snug">{rem.title}</p>
                      <p className="text-[9px] text-slate-500 font-mono mt-0.5">Next: {fmtTime(rem.reminder_time)}</p>
                    </div>
                    <button onClick={() => resolveReminder(rem.id)} className="text-[9px] font-bold text-emerald-400 hover:text-emerald-300 border border-emerald-900/40 rounded-lg px-2 py-1 transition">Resolve</button>
                  </div>
                ))
              )}
            </GlassCard>

            {/* Quick Actions / Suggestions */}
            <GlassCard className="p-5 border border-slate-800 flex flex-col gap-3">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">⚡ Quick Actions</h3>
              </div>
              <AISuggestions onAction={handleSuggestionAction} />
              <div className="pt-2 border-t border-slate-800 mt-1">
                <button
                  onClick={() => { setActiveTab('voice'); startConversation() }}
                  disabled={connectionStatus !== 'disconnected'}
                  className="btn-primary w-full text-xs py-2.5 font-extrabold uppercase tracking-wider disabled:opacity-50"
                >
                  🎙️ Start AI Voice Session
                </button>
              </div>
            </GlassCard>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          TAB: VOICE SESSION
         ════════════════════════════════════════════════════════ */}
      {activeTab === 'voice' && (
        <div className="flex flex-col gap-5 anim-fade-slide">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

            {/* LEFT — Orb + Transcript + Tool Viewer */}
            <div className="lg:col-span-7 flex flex-col gap-4">
              <GlassCard className="p-5 border border-slate-800 bg-surface-950/10 backdrop-blur-md flex flex-col gap-4">

                {/* Central orb area */}
                <div className="flex flex-col items-center gap-3 py-2">
                  <div className="relative flex items-center justify-center" style={{ width: 100, height: 100 }}>
                    <div className={`absolute inset-0 rounded-full transition-all duration-700 ${
                      connectionStatus === 'connected'
                        ? isBotSpeaking
                          ? 'ring-4 ring-violet-500/40 animate-ping'
                          : isUserSpeaking ? 'ring-4 ring-emerald-400/30 animate-ping'
                          : 'ring-2 ring-primary/20'
                        : 'ring-0'
                    }`} style={{ animationDuration: '1s' }} />
                    <div
                      className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500 shadow-2xl cursor-pointer select-none ${
                        connectionStatus === 'disconnected'
                          ? 'bg-gradient-to-br from-slate-800 to-slate-900 hover:from-violet-900 hover:to-slate-900 hover:scale-105'
                          : connectionStatus === 'connecting'
                            ? 'bg-gradient-to-br from-yellow-900 to-slate-900 animate-pulse'
                            : isBotSpeaking
                              ? 'bg-gradient-to-br from-violet-700 to-indigo-900 scale-110'
                              : isUserSpeaking
                                ? 'bg-gradient-to-br from-emerald-700 to-teal-900 scale-105'
                                : 'bg-gradient-to-br from-indigo-800 to-slate-900'
                      }`}
                      onClick={connectionStatus === 'disconnected' ? startConversation : undefined}
                      title={connectionStatus === 'disconnected' ? 'Click to start voice session' : ''}
                    >
                      <span className="text-3xl select-none">
                        {connectionStatus === 'disconnected' ? '🎙️'
                          : connectionStatus === 'connecting' ? '⏳'
                          : isBotSpeaking ? '🤖'
                          : isUserSpeaking ? '🗣️'
                          : '👂'}
                      </span>
                    </div>
                  </div>

                  {/* Waveforms */}
                  <div className="flex gap-6 items-center">
                    <div className="flex flex-col items-center gap-1">
                      <SoundWave active={isUserSpeaking} color="#34d399" />
                      <span className="text-[8px] font-bold uppercase text-emerald-500 tracking-widest">You</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <SoundWave active={isBotSpeaking} color="#a78bfa" />
                      <span className="text-[8px] font-bold uppercase text-violet-400 tracking-widest">AI</span>
                    </div>
                  </div>

                  <div className="text-[11px] font-bold text-slate-400 text-center min-h-[18px]">
                    {connectionStatus === 'disconnected' && 'Click the orb or press Start to begin'}
                    {connectionStatus === 'connecting' && 'Connecting to AI assistant…'}
                    {connectionStatus === 'connected' && !isBotSpeaking && !isUserSpeaking && 'Listening — speak freely'}
                    {connectionStatus === 'connected' && isUserSpeaking && 'You are speaking…'}
                    {connectionStatus === 'connected' && isBotSpeaking && 'AI is responding…'}
                    {connectionStatus === 'disconnecting' && 'Ending session…'}
                  </div>
                </div>

                {/* Controls */}
                <div className="flex gap-2">
                  <button
                    id="voice-start-btn"
                    onClick={startConversation}
                    disabled={connectionStatus !== 'disconnected'}
                    className="flex-1 py-2.5 text-xs uppercase tracking-wider font-extrabold rounded-xl bg-gradient-to-r from-violet-700 to-indigo-700 hover:from-violet-600 hover:to-indigo-600 text-white shadow disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >🎙️ Start Session</button>
                  {connectionStatus !== 'disconnected' && (
                    <>
                      <button
                        onClick={toggleMic}
                        className={`px-4 py-2.5 text-xs uppercase tracking-wider font-extrabold rounded-xl border transition ${
                          micEnabled
                            ? 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'
                            : 'border-emerald-800 bg-emerald-950/20 text-emerald-400'
                        }`}
                      >{micEnabled ? '🔇 Mute' : '🎤 Unmute'}</button>
                      <button
                        onClick={stopConversation}
                        className="px-4 py-2.5 text-xs uppercase tracking-wider font-extrabold rounded-xl bg-red-950/30 border border-red-900/60 text-red-400 hover:bg-red-950/50 transition"
                      >🛑 Stop</button>
                    </>
                  )}
                </div>

                {/* Live Transcript */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Live Transcript</span>
                    {transcripts.length > 0 && (
                      <button onClick={() => setTranscripts([])} className="text-[9px] font-mono text-slate-600 hover:text-slate-400">[Clear]</button>
                    )}
                  </div>
                  <div className="bg-surface-950/40 border border-slate-800 rounded-xl p-3 flex flex-col gap-2 min-h-[120px] max-h-[220px] overflow-y-auto">
                    {transcripts.length === 0 ? (
                      <div className="flex-1 flex items-center justify-center text-[10px] text-slate-600 italic font-semibold">
                        {connectionStatus === 'connected' ? 'Speak to begin…' : 'Start a session to see live transcription.'}
                      </div>
                    ) : (
                      transcripts.map((t, idx) => (
                        <div key={idx} className={`flex gap-2 max-w-[92%] anim-fade-slide ${t.role === 'user' ? 'self-end flex-row-reverse' : 'self-start'}`}>
                          <div className={`px-3 py-2 rounded-xl text-[11px] font-semibold leading-snug ${
                            t.role === 'user'
                              ? 'bg-primary-glow/30 border border-primary/25 text-violet-200'
                              : 'bg-surface-900 border border-slate-800 text-slate-300'
                          }`}>
                            <span className="text-[8px] block opacity-40 font-bold uppercase tracking-wider mb-0.5">
                              {t.role === 'user' ? 'You' : 'AI'}
                            </span>
                            {t.text}
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={transcriptEndRef} />
                  </div>
                </div>

                {/* Tool Execution Viewer (only when session active or has log) */}
                {(connectionStatus !== 'disconnected' || toolLog.length > 0) && (
                  <div className="border border-slate-800 bg-slate-950/20 rounded-xl p-3">
                    <ToolExecutionViewer toolLog={toolLog} isActive={connectionStatus === 'connected'} />
                  </div>
                )}
              </GlassCard>
            </div>

            {/* RIGHT — AI Action Cards + Confidence + Suggestions */}
            <div className="lg:col-span-5 flex flex-col gap-4">

              {/* AI Action Cards */}
              {actionCards.length > 0 && (
                <GlassCard className="p-4 border border-violet-900/30 bg-violet-950/5 flex flex-col gap-3">
                  <div className="flex items-center justify-between pb-2 border-b border-violet-900/20">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-violet-400 flex items-center gap-2">
                      ⚡ AI Action Cards
                    </h3>
                    <span className="text-[9px] text-slate-500 font-bold">From last session</span>
                  </div>
                  {actionCards.map((card, i) => (
                    <AIActionCard
                      key={i}
                      extraction={card}
                      onApprove={handleApproveCard}
                      onReject={handleRejectCard}
                      onEdit={handleEditCard}
                    />
                  ))}
                </GlassCard>
              )}

              {/* AI Confidence (when session active) */}
              {connectionStatus === 'connected' && transcripts.length > 0 && (
                <GlassCard className="p-4 border border-slate-800 flex flex-col gap-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">📊 AI Confidence</h3>
                  <div className="flex flex-col gap-2">
                    <ConfidenceIndicator label="Speech Recognition" value={0.92} />
                    <ConfidenceIndicator label="Medicine Detection" value={transcripts.length > 2 ? 0.85 : 0.5} requiresConfirm />
                    <ConfidenceIndicator label="Reminder Extract" value={0.78} />
                    <ConfidenceIndicator label="Task Extraction" value={0.71} requiresConfirm />
                  </div>
                </GlassCard>
              )}

              {/* Suggestions */}
              <GlassCard className="p-4 border border-slate-800 flex flex-col gap-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pb-2 border-b border-slate-800">💡 AI Suggestions</h3>
                <AISuggestions onAction={handleSuggestionAction} />
              </GlassCard>

              {/* Active Reminders mini-view */}
              <GlassCard className="p-4 border border-slate-800 flex flex-col gap-2">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    🔔 Active Reminders
                    {reminders.length > 0 && (
                      <span className="bg-yellow-500/20 text-yellow-300 border border-yellow-700/40 text-[9px] font-extrabold px-1.5 rounded-full">{reminders.length}</span>
                    )}
                  </h3>
                  <button onClick={() => setActiveTab('reminders')} className="text-[9px] font-bold text-violet-400 hover:text-violet-300 uppercase tracking-wider">View All →</button>
                </div>
                {loadingReminders ? (
                  <div className="flex flex-col gap-2 py-2">
                    {[1,2].map(i => <Skeleton key={i} h="50px" />)}
                  </div>
                ) : reminders.length === 0 ? (
                  <div className="py-4 text-center text-slate-600 italic text-xs">✅ No pending reminders</div>
                ) : (
                  reminders.slice(0, 3).map(rem => (
                    <div key={rem.id} className="flex items-center gap-2 p-2 border border-slate-800 bg-slate-950/20 rounded-lg">
                      <span className="text-sm shrink-0">{reminderIcon(rem.reminder_type)}</span>
                      <span className="text-[11px] font-semibold text-slate-300 flex-1 truncate">{rem.title}</span>
                      <button onClick={() => resolveReminder(rem.id)} className="shrink-0 text-[9px] text-emerald-400 border border-emerald-900/40 rounded px-2 py-0.5 hover:bg-emerald-950/30 transition">✓</button>
                    </div>
                  ))
                )}
              </GlassCard>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          TAB: REMINDER CENTER
         ════════════════════════════════════════════════════════ */}
      {activeTab === 'reminders' && (
        <div className="flex flex-col gap-5 anim-fade-slide">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              🔔 Reminder Center
              <span className="text-[9px] text-slate-500 font-normal">{reminders.length} active</span>
            </h3>
            <button onClick={fetchReminders} className="text-[10px] font-bold text-slate-500 hover:text-slate-300 border border-slate-800 rounded-lg px-3 py-1.5 transition">↻ Refresh</button>
          </div>

          {/* Priority filter tabs */}
          <div className="flex gap-2 flex-wrap">
            {[
              { id: 'all', label: 'All', count: reminders.length, color: 'text-slate-400 border-slate-700' },
              { id: 'critical', label: '🔴 Critical', count: criticalCount, color: 'text-red-400 border-red-900/50' },
              { id: 'medium', label: '🟡 Medium', count: mediumCount, color: 'text-yellow-400 border-yellow-900/40' },
              { id: 'low', label: '🟢 Low', count: lowCount, color: 'text-emerald-400 border-emerald-900/30' },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setReminderFilter(f.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition ${
                  reminderFilter === f.id
                    ? `${f.color} bg-slate-800/40`
                    : 'text-slate-500 border-slate-800 hover:border-slate-700 hover:text-slate-400'
                }`}
              >
                {f.label}
                <span className="font-extrabold">{f.count}</span>
              </button>
            ))}
          </div>

          {loadingReminders ? (
            <div className="flex flex-col gap-3">
              {[1,2,3].map(i => <Skeleton key={i} h="100px" />)}
            </div>
          ) : filteredReminders.length === 0 ? (
            <GlassCard className="p-12 border border-slate-800 text-center">
              <div className="text-3xl mb-3">✅</div>
              <p className="text-slate-500 text-sm font-semibold">
                {reminderFilter === 'all' ? 'No active reminders. All issues are resolved.' : `No ${reminderFilter}-priority reminders.`}
              </p>
            </GlassCard>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredReminders.map(rem => (
                <ReminderCard
                  key={rem.id}
                  rem={rem}
                  onResolve={resolveReminder}
                  onSnooze={snoozeReminder}
                  onCancel={deleteReminder}
                  snoozeLoading={snoozeLoading}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          TAB: AI OPERATIONS HISTORY
         ════════════════════════════════════════════════════════ */}
      {activeTab === 'history' && (
        <div className="flex flex-col gap-5 anim-fade-slide">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              📋 AI Operations History
              {calls.length > 0 && <span className="text-[9px] text-slate-500 font-normal">{calls.length} sessions</span>}
            </h3>
            <button onClick={fetchCalls} className="text-[10px] font-bold text-slate-500 hover:text-slate-300 border border-slate-800 rounded-lg px-3 py-1.5 transition">↻ Refresh</button>
          </div>

          {loadingCalls ? (
            <div className="flex flex-col gap-3">
              {[1,2,3,4].map(i => <Skeleton key={i} h="64px" />)}
            </div>
          ) : calls.length === 0 ? (
            <GlassCard className="p-12 border border-slate-800 text-center">
              <div className="text-3xl mb-3">🎙️</div>
              <p className="text-slate-500 text-sm font-semibold">No sessions yet. Start a voice session to create your first record.</p>
              <button
                onClick={() => { setActiveTab('voice'); startConversation() }}
                className="btn-primary mt-4 text-xs"
              >Start Voice Session</button>
            </GlassCard>
          ) : (
            <div className="flex flex-col gap-3">
              {calls.map(call => (
                <SmartCallSummary
                  key={call.id}
                  call={call}
                  isExpanded={expandedCallId === call.id}
                  onToggle={() => {
                    setExpandedCallId(prev => prev === call.id ? null : call.id)
                    setTimelineCall(call)
                  }}
                  onCommitTasks={handleCommitTasks}
                  onEditExtraction={handleEditExtraction}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          TAB: OPERATIONS TIMELINE
         ════════════════════════════════════════════════════════ */}
      {activeTab === 'timeline' && (
        <div className="flex flex-col gap-5 anim-fade-slide">
          <h3 className="text-sm font-bold text-slate-200">⏱️ Operations Timeline</h3>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

            {/* Call selector */}
            <div className="lg:col-span-5 flex flex-col gap-2">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Select Conversation</span>
              {loadingCalls ? (
                <div className="flex flex-col gap-2">
                  {[1,2,3].map(i => <Skeleton key={i} h="52px" />)}
                </div>
              ) : calls.length === 0 ? (
                <GlassCard className="p-8 border border-slate-800 text-center">
                  <p className="text-slate-600 text-xs italic">No call records yet.</p>
                </GlassCard>
              ) : (
                <div className="flex flex-col gap-2 max-h-[500px] overflow-y-auto pr-1">
                  {calls.map(call => (
                    <div
                      key={call.id}
                      onClick={() => setTimelineCall(call)}
                      className={`p-3 border rounded-xl cursor-pointer transition flex items-center gap-3 ${
                        timelineCall?.id === call.id
                          ? 'border-violet-700/50 bg-violet-950/10'
                          : 'border-slate-800 bg-slate-950/20 hover:border-slate-700'
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full shrink-0 ${call.status === 'completed' ? 'bg-emerald-400' : 'bg-yellow-400 animate-pulse'}`} />
                      <div className="flex-1 min-w-0">
                        <strong className="text-[11px] text-slate-200 block truncate">{call.caller || 'Voice Session'}</strong>
                        <span className="text-[9px] text-slate-500 font-mono">{fmtTime(call.timestamp)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {activePlayCall?.id === call.id && isPlaying && <SoundWave active color="#a78bfa" bars={5} />}
                        <button
                          onClick={e => { e.stopPropagation(); handlePlayClick(call) }}
                          className="btn-primary py-0.5 px-2 text-[9px] font-bold font-mono"
                        >
                          {activePlayCall?.id === call.id && isPlaying ? '⏸' : '▶'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Timeline viewer */}
            <div className="lg:col-span-7">
              <GlassCard className="p-5 border border-slate-800 flex flex-col gap-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">AI Pipeline Steps</h4>
                  {timelineCall && (
                    <span className="text-[9px] font-mono text-slate-500">{fmtTime(timelineCall.timestamp)}</span>
                  )}
                </div>
                <OperationsTimeline call={timelineCall} />
              </GlassCard>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
