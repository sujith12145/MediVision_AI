import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { login } from '../services/api'

/**
 * LoginPage — full-screen login gate.
 * Styled in the MediVision dark medical-tech palette.
 */
export default function LoginPage() {
  const { signIn } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const data = await login(username, password)
      signIn(data.access_token)
    } catch (err) {
      setError(err.message ?? 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(135deg, #0f1117 0%, #161b27 60%, #1a1f35 100%)' }}
    >
      {/* Ambient glow blobs */}
      <div aria-hidden="true" style={{
        position: 'fixed', top: '15%', left: '20%',
        width: 400, height: 400, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div aria-hidden="true" style={{
        position: 'fixed', bottom: '20%', right: '15%',
        width: 350, height: 350, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(6,182,212,0.10) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        width: '100%', maxWidth: 420,
        background: 'rgba(22, 27, 39, 0.85)',
        backdropFilter: 'blur(24px)',
        border: '1px solid rgba(99,102,241,0.2)',
        borderRadius: 20,
        padding: '40px 36px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
            boxShadow: '0 0 28px rgba(99,102,241,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26,
          }}>🩺</div>
          <h1 style={{
            fontSize: 26, fontWeight: 700, letterSpacing: '-0.5px',
            background: 'linear-gradient(135deg, #a5b4fc 0%, #22d3ee 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            margin: 0,
          }}>MediVision AI</h1>
          <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>
            Sign in to access the dashboard
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="username" style={{ fontSize: 13, fontWeight: 500, color: '#94a3b8' }}>
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin@medivision.local"
              style={{
                background: 'rgba(15,17,23,0.7)',
                border: '1px solid rgba(99,102,241,0.25)',
                borderRadius: 10,
                padding: '10px 14px',
                color: '#e2e8f0',
                fontSize: 14,
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => (e.target.style.borderColor = 'rgba(99,102,241,0.7)')}
              onBlur={(e) => (e.target.style.borderColor = 'rgba(99,102,241,0.25)')}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" style={{ fontSize: 13, fontWeight: 500, color: '#94a3b8' }}>
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                background: 'rgba(15,17,23,0.7)',
                border: '1px solid rgba(99,102,241,0.25)',
                borderRadius: 10,
                padding: '10px 14px',
                color: '#e2e8f0',
                fontSize: 14,
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => (e.target.style.borderColor = 'rgba(99,102,241,0.7)')}
              onBlur={(e) => (e.target.style.borderColor = 'rgba(99,102,241,0.25)')}
            />
          </div>

          {/* Error message */}
          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 8, padding: '10px 14px',
              color: '#fca5a5', fontSize: 13,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span>⚠</span> {error}
            </div>
          )}

          {/* Submit */}
          <button
            id="login-submit-btn"
            type="submit"
            disabled={loading}
            style={{
              marginTop: 4,
              padding: '12px',
              borderRadius: 10,
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              background: loading
                ? 'rgba(99,102,241,0.4)'
                : 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              color: '#fff',
              fontWeight: 600,
              fontSize: 15,
              letterSpacing: '0.2px',
              transition: 'opacity 0.2s, transform 0.1s',
              boxShadow: loading ? 'none' : '0 4px 16px rgba(99,102,241,0.35)',
            }}
            onMouseEnter={(e) => { if (!loading) e.target.style.opacity = '0.88' }}
            onMouseLeave={(e) => { e.target.style.opacity = '1' }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p style={{ marginTop: 24, textAlign: 'center', fontSize: 12, color: '#334155' }}>
          Protected by JWT · Session expires in 60 min
        </p>
      </div>
    </div>
  )
}
