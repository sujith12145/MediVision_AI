import { useState } from 'react'
import { supabase } from '../services/supabase'
import Spinner from '../components/ui/Spinner'

export default function LandingPage() {
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState(null)

  const handleGoogleLogin = async () => {
    setLoginLoading(true)
    setLoginError(null)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      })
      if (error) throw error
    } catch (err) {
      console.error('Google OAuth initialization error:', err)
      
      // Auto-classify common configuration errors for developer convenience
      let message = err.message ?? 'Failed to initialize Google login.'
      if (message.includes('provider is not enabled')) {
        message = 'Google OAuth provider is not enabled in your Supabase project. Please enable it in: Supabase Dashboard > Authentication > Providers > Google.'
      }
      
      setLoginError(message)
      setLoginLoading(false)
    }
  }

  // Developer Bypass Login using default seeded credential values
  const handleDeveloperBypass = async () => {
    setLoginLoading(true)
    setLoginError(null)
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: 'admin@medivision.local',
        password: 'MediVision123!'
      })
      if (error) {
        throw new Error('Default credentials admin@medivision.local / MediVision123! not found. Please run python seed_demo_user.py in your backend directory.')
      }
      setLoginLoading(false)
    } catch (err) {
      console.error('Developer bypass login error:', err)
      setLoginError(err.message)
      setLoginLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#02050f] text-slate-100 relative overflow-hidden font-sans flex items-center justify-center">
      {/* Background glow nodes */}
      <div className="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-accent/5 blur-[120px] pointer-events-none" />

      {/* Floating particles grid */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.012)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.012)_1px,transparent_1px)] bg-[size:45px_45px] pointer-events-none opacity-40" />

      {/* Authenticate console card */}
      <div className="glass-card max-w-sm w-full p-8 text-center flex flex-col items-center gap-6 relative z-10 mx-6 shadow-elevated">
        
        {/* Brand logo */}
        <div className="logo-mark text-slate-900 font-extrabold text-xl select-none w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-glow">
          🩺
        </div>

        {/* Titles */}
        <div className="flex flex-col gap-1.5 mt-2">
          <h1 className="text-2xl font-black text-slate-100 tracking-tight leading-none">
            Welcome to MediVision AI
          </h1>
          <p className="text-xs font-semibold text-slate-450 uppercase tracking-widest font-mono">
            AI-Powered Pharmacy Operating System
          </p>
        </div>

        <div className="w-full h-px bg-slate-900/60 my-1" />

        {/* Google Authentication Triggers */}
        <div className="w-full flex flex-col gap-3">
          
          {/* Continue with Google */}
          <button
            onClick={handleGoogleLogin}
            disabled={loginLoading}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-100 text-slate-900 font-bold py-3 px-5 rounded-xl transition shadow-[0_4px_20px_rgba(255,255,255,0.12)] hover:shadow-[0_6px_24px_rgba(255,255,255,0.22)] hover:-translate-y-0.5 active:scale-98 cursor-pointer text-xs"
            title="Sign in with your registered Google account"
          >
            {loginLoading ? (
              <>
                <Spinner size="sm" className="border-t-slate-900" />
                <span>Connecting with Google…</span>
              </>
            ) : (
              <>
                <svg className="w-4.5 h-4.5 shrink-0" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.87-2.6-3.3-4.53-6.16-4.53z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                </svg>
                <span>Continue with Google</span>
              </>
            )}
          </button>

          {/* Sign up with Google */}
          <button
            onClick={handleGoogleLogin}
            disabled={loginLoading}
            className="w-full flex items-center justify-center gap-3 bg-transparent hover:bg-slate-900 border border-slate-700/60 text-slate-200 font-bold py-2.5 px-5 rounded-xl transition hover:-translate-y-0.5 active:scale-98 cursor-pointer text-xs"
            title="Create a new account using your Google profile"
          >
            <span>Google Icon ➔</span>
            <span>Sign up with Google</span>
          </button>

          {loginError && (
            <div className="alert alert-danger text-[10px] py-3 text-left leading-normal mt-1">
              <span>⚠</span>
              <span>{loginError}</span>
            </div>
          )}
        </div>

        {/* Local Bypass Links */}
        <div className="flex flex-col gap-2.5 mt-2">
          <button 
            onClick={handleDeveloperBypass}
            disabled={loginLoading}
            className="text-[10px] text-slate-500 hover:text-primary transition underline font-semibold bg-transparent border-none cursor-pointer"
          >
            Bypass Google OAuth (Developer Mode)
          </button>
          
          <div className="flex flex-col gap-0.5 text-[8px] text-slate-650 font-semibold font-mono uppercase tracking-wider select-none">
            <span>Supabase OAuth Security Layer</span>
            <span className="text-[7px] text-slate-700 font-normal">Encrypted session validation</span>
          </div>
        </div>

      </div>
    </div>
  )
}
