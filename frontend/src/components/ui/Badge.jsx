export default function Badge({ children, variant = 'neutral', className = '' }) {
  let variantClass = 'badge-neutral'

  switch (variant) {
    case 'success':
      variantClass = 'badge-success'
      break
    case 'warning':
      variantClass = 'badge-warning'
      break
    case 'danger':
    case 'critical':
      variantClass = 'badge-danger'
      break
    case 'accent':
      variantClass = 'badge-accent'
      break
    case 'cyan':
      variantClass = 'badge-cyan'
      break
    default:
      variantClass = 'badge-neutral'
  }

  return (
    <span className={`badge ${variantClass} ${className}`}>
      {children}
    </span>
  )
}
