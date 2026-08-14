import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { login } from '../services/api'
import Spinner from '../components/ui/Spinner'

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
      setError(err.message ?? 'Login failed. Please verify credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div 
      className="min-h-dvh flex items-center justify-center px-4 relative overflow-hidden bg-bg"
    >
      {/* Immersive background glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-primary-500/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[45vw] h-[45vw] rounded-full bg-accent-500/5 blur-[120px] pointer-events-none" />

      {/* Login Card Panel */}
      <div className="w-full max-w-[420px] glass-card p-10 flex flex-col gap-8 shadow-2xl relative z-10 border border-slate-800">
        {/* Brand Header */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="logo-mark text-slate-900 font-extrabold text-2xl select-none w-14 h-14">
            🩺
          </div>
          <div>
            <h1 className="text-2xl font-black gradient-text-accent tracking-tight">
              MediVision AI
            </h1>
            <p className="text-xs text-slate-500 mt-1.5 font-medium">
              Enterprise Pharmacy Operating System
            </p>
          </div>
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="username" className="text-xs font-bold text-slate-400 uppercase tracking-wide">
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
              className="input-base"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-xs font-bold text-slate-400 uppercase tracking-wide">
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
              className="input-base"
            />
          </div>

          {error && (
            <div className="alert alert-danger animate-fade-in py-3 text-xs leading-normal">
              <span>⚠</span>
              <span>{error}</span>
            </div>
          )}

          <button
            id="login-submit-btn"
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-3 mt-2 text-xs uppercase tracking-wider font-extrabold flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Spinner size="sm" className="border-t-white" />
                <span>Signing in…</span>
              </>
            ) : (
              <span>Sign In</span>
            )}
          </button>
        </form>

        {/* Info label footer */}
        <div className="text-center flex flex-col gap-1 mt-2 border-t border-slate-800/60 pt-4">
          <span className="text-[10px] text-slate-650 font-bold uppercase tracking-wider font-mono">
            Protected by JWT
          </span>
          <span className="text-[9px] text-slate-700">
            Session credentials expire in 60 minutes
          </span>
        </div>
      </div>
    </div>
  )
}
