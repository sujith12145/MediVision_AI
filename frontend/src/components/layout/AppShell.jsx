import { useState } from 'react'
import LeftDock from './LeftDock'
import TopBar from './TopBar'
import CommandPalette from './CommandPalette'
import GlobalCopilotDrawer from './GlobalCopilotDrawer'
import Toast from '../ui/Toast'
import { useWorkspace } from '../../contexts/WorkspaceContext'

export default function AppShell({ children }) {
  const { 
    toasts, 
    removeToast,
    notificationsOpen,
    setNotificationsOpen,
    notifications,
    markNotificationRead,
    clearAllNotifications,
    tasksOpen,
    setTasksOpen,
    tasks,
    toggleTask,
    addTask
  } = useWorkspace()

  const [newTaskInput, setNewTaskInput] = useState('')

  const handleAddTaskSubmit = (e) => {
    e.preventDefault()
    if (!newTaskInput.trim()) return
    addTask(newTaskInput.trim())
    setNewTaskInput('')
  }

  const getNotifClass = (type) => {
    if (type === 'danger') return 'border-rose-500/20 bg-rose-950/5 text-rose-350'
    if (type === 'warning') return 'border-amber-500/20 bg-amber-950/5 text-amber-350'
    if (type === 'success') return 'border-emerald-500/20 bg-emerald-950/5 text-emerald-350'
    return 'border-slate-800 bg-surface-900/30 text-slate-350'
  }

  return (
    <div className="workspace">
      {/* Ambient background glows */}
      <div className="ambient-glow-left" />
      <div className="ambient-glow-right" />

      {/* Persistent Dock Navigation */}
      <LeftDock />

      {/* Main Viewport Shell */}
      <div className="workspace-main relative z-10">
        <TopBar />
        <div className="workspace-content">
          {children}
        </div>
      </div>

      {/* Global Command Palette Overlay */}
      <CommandPalette />

      {/* Persistent Global Floating AI Drawer */}
      <GlobalCopilotDrawer />

      {/* Sliding Notifications Center Drawer Overlay */}
      <aside className={`notification-slider ${notificationsOpen ? 'open' : ''}`}>
        <div className="px-5 py-4 border-b border-slate-900 flex items-center justify-between bg-surface-950/30">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">Alerts Center</h3>
          <div className="flex gap-3">
            {notifications.length > 0 && (
              <button 
                onClick={clearAllNotifications}
                className="text-[10px] text-slate-500 hover:text-slate-300 font-bold bg-transparent border-none cursor-pointer"
              >
                Clear All
              </button>
            )}
            <button 
              onClick={() => setNotificationsOpen(false)}
              className="text-slate-400 hover:text-white text-xs cursor-pointer bg-transparent border-none"
            >
              ✕
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {notifications.length > 0 ? (
            notifications.map((notif) => (
              <div 
                key={notif.id}
                className={`p-3.5 border rounded-xl flex flex-col gap-1.5 transition ${getNotifClass(notif.type)} ${
                  notif.unread ? 'opacity-100 shadow-[inset_0_0_1px_rgba(255,255,255,0.15)]' : 'opacity-60'
                }`}
                onClick={() => markNotificationRead(notif.id)}
              >
                <div className="flex justify-between items-center text-[9px] font-bold">
                  <span className="uppercase tracking-widest text-[8px] opacity-75">#{notif.category}</span>
                  <span className="font-mono">{notif.time}</span>
                </div>
                <div>
                  <strong className="text-xs text-slate-100 block font-semibold">{notif.title}</strong>
                  <p className="text-[10px] text-slate-400 leading-normal font-medium mt-0.5">{notif.message}</p>
                </div>
                {notif.unread && (
                  <span className="text-[8px] text-primary font-bold self-end uppercase mt-1">● Mark read</span>
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-20 text-slate-650 text-xs font-semibold">
              🔔 No active warning alerts.
            </div>
          )}
        </div>
      </aside>

      {/* Sliding Tasks Checklist Drawer Overlay */}
      <aside className={`task-slider ${tasksOpen ? 'open' : ''}`}>
        <div className="px-5 py-4 border-b border-slate-900 flex items-center justify-between bg-surface-950/30">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">Tasks Checklist</h3>
          <button 
            onClick={() => setTasksOpen(false)}
            className="text-slate-400 hover:text-white text-xs cursor-pointer bg-transparent border-none"
          >
            ✕
          </button>
        </div>

        {/* Task lists scroll */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {tasks.map((task) => (
            <div 
              key={task.id}
              onClick={() => toggleTask(task.id)}
              className="p-3 border border-slate-900 bg-surface-900/10 hover:border-slate-800 rounded-xl flex items-center gap-3 transition cursor-pointer"
            >
              <input 
                type="checkbox" 
                checked={task.completed} 
                onChange={() => {}} // handled by div click
                className="w-4 h-4 rounded border-slate-800 bg-surface-950 accent-primary cursor-pointer"
              />
              <span className={`text-xs font-semibold ${task.completed ? 'line-through text-slate-600' : 'text-slate-350'}`}>
                {task.text}
              </span>
            </div>
          ))}
        </div>

        {/* Task addition form input */}
        <form onSubmit={handleAddTaskSubmit} className="p-3 border-t border-slate-900 bg-surface-950/30 flex gap-2">
          <input 
            type="text"
            required
            value={newTaskInput}
            onChange={(e) => setNewTaskInput(e.target.value)}
            placeholder="Log check item..."
            className="input-base py-1.5 flex-1"
          />
          <button 
            type="submit"
            className="btn-primary py-1.5 px-3 text-xs"
          >
            Add
          </button>
        </form>
      </aside>

      {/* Global Toast Notification Overlay Stack */}
      <div className="toast-stack">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </div>
  )
}
