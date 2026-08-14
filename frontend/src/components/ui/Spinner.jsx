export default function Spinner({ size = 'md', className = '' }) {
  let sizeClass = 'spinner'
  if (size === 'sm') sizeClass = 'spinner spinner-sm'
  if (size === 'lg') sizeClass = 'spinner spinner-lg'

  return <div className={`${sizeClass} ${className}`} aria-hidden="true" />
}
