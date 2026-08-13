import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext()

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [userRole, setUserRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(null)

  const fetchUserRole = async (email) => {
    if (!email) {
      setUserRole(null)
      setAuthError(null)
      return null
    }
    const normalized = email.trim().toLowerCase()
    console.log(`[AuthContext] fetchUserRole initiating query for email: "${normalized}"`)
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('email', normalized)
        .maybeSingle()

      if (error) {
        console.error('[AuthContext] Database query error fetching role:', error)
        setAuthError(`Database error: ${error.message}`)
        setUserRole(null)
        return null
      }

      console.log(`[AuthContext] Database query success for "${normalized}". Data returned:`, data)
      const role = data?.role || null
      setUserRole(role)
      if (role) {
        setAuthError(null)
      } else {
        setAuthError('No role assigned. Please contact your administrator.')
      }
      return role
    } catch (err) {
      console.error('[AuthContext] Unexpected error fetching user role:', err)
      setAuthError(`Connection error: ${err.message || err}`)
      setUserRole(null)
      return null
    }
  }

  // Expose direct query test function for browser console debugging (TASK 5)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.testSupabaseRoleQuery = async (email = 'anso2020vja@gmail.com') => {
        console.log(`[Test] Querying user_roles table for: "${email}"`)
        const { data, error } = await supabase
          .from('user_roles')
          .select('*')
          .eq('email', email.trim().toLowerCase())
        if (error) {
          console.error('[Test] Query failed:', error)
          return { success: false, error }
        }
        console.log('[Test] Query successful! Data returned:', data)
        return { success: true, data }
      }
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)
      
      if (currentUser) {
        await fetchUserRole(currentUser.email)
      } else {
        setUserRole(null)
        setAuthError(null)
      }
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const currentUser = session?.user ?? null
        setUser(currentUser)
        
        if (currentUser) {
          await fetchUserRole(currentUser.email)
        } else {
          setUserRole(null)
          setAuthError(null)
        }
        setLoading(false)
      }
    )

    return () => listener?.subscription?.unsubscribe()
  }, [])

  const signInWithGoogle = async () => {
    setAuthError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
    })
    if (error) setAuthError(error.message)
  }

  const signInWithEmail = async (email, password) => {
    setLoading(true)
    setAuthError(null)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw error
      if (data?.session?.user) {
        setUser(data.session.user)
        await fetchUserRole(data.session.user.email)
      }
    } catch (error) {
      console.error('Email Sign In Error:', error)
      setAuthError(error.message || 'Authentication failed. Please try again.')
      throw error
    } finally {
      setLoading(false)
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setUserRole(null)
    setAuthError(null)
  }

  return (
    <AuthContext.Provider value={{ user, userRole, loading, authError, signInWithGoogle, signInWithEmail, signOut, fetchUserRole }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
