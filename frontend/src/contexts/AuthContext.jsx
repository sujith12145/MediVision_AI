/**
 * AuthContext.jsx
 *
 * Provides:
 *   - isAuthenticated  Boolean — whether a live Supabase session exists
 *   - signIn(token?)   Triggers a re-check of the current session state
 *   - signOut()        Signs out from Supabase and clears the session
 *
 * Session management is handled entirely by the Supabase JS SDK:
 *   - Token storage, refresh, and expiry are automatic.
 *   - onAuthStateChange fires on login, logout, and token refresh.
 *   - No manual localStorage manipulation needed.
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '../services/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check active session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session)
      setLoading(false)
    })

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session)
      setLoading(false)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(() => {
    setIsAuthenticated(true)
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setIsAuthenticated(false)
  }, [])

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-surface-900 text-slate-100">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border-4 border-primary-500/20" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary-550 animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

/** Convenience hook — throws if used outside <AuthProvider>. */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
