export default function Toast({ message, type = 'success', onClose }) {
  let toastClass = 'toast-success'
  let icon = '✓'

  if (type === 'error') {
    toastClass = 'toast-error'
    icon = '⚠'
  } else if (type === 'info') {
    toastClass = 'toast-info'
    icon = 'ℹ'
  }

  return (
    <div className={`toast ${toastClass}`} role="alert">
      <span className="text-sm font-bold">{icon}</span>
      <span className="flex-1 text-xs font-semibold leading-normal">{message}</span>
      <button
        onClick={onClose}
        className="ml-2 text-current opacity-70 hover:opacity-100 font-bold text-xs cursor-pointer"
        aria-label="Dismiss notification"
      >
        ✕
      </button>
    </div>
  )
}
