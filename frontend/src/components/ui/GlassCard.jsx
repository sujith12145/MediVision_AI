export default function GlassCard({ children, className = '', lift = false, style = {} }) {
  return (
    <div
      className={`glass-card ${lift ? 'card-lift' : ''} ${className}`}
      style={style}
    >
      {children}
    </div>
  )
}
