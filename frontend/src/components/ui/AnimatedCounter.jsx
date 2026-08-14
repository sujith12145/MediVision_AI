import { useEffect, useState } from 'react'

export default function AnimatedCounter({ value, duration = 800, prefix = '', suffix = '', decimals = 0 }) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let start = 0
    const end = parseFloat(value)
    if (isNaN(end)) {
      setCount(value)
      return
    }

    if (end === 0) {
      setCount(0)
      return
    }

    const startTime = performance.now()

    const updateCount = (now) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      
      // Ease out quad formula
      const easeProgress = progress * (2 - progress)
      
      const current = start + easeProgress * (end - start)
      setCount(current)

      if (progress < 1) {
        requestAnimationFrame(updateCount)
      } else {
        setCount(end)
      }
    }

    requestAnimationFrame(updateCount)
  }, [value, duration])

  const formatted = typeof count === 'number' 
    ? count.toFixed(decimals)
    : count

  return (
    <span className="mono-value">
      {prefix}{formatted}{suffix}
    </span>
  )
}
