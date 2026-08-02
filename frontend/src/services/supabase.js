/**
 * supabase.js — Supabase JS client singleton.
 *
 * Reads credentials from Vite environment variables:
 *   VITE_SUPABASE_URL        — your project URL
 *   VITE_SUPABASE_ANON_KEY   — your project's anon/public key
 *
 * These are safe to expose in the browser — they are the anon key,
 * not the service_role key.  Row Level Security (RLS) must be configured
 * in the Supabase dashboard to protect data appropriately.
 *
 * Usage
 * -----
 *   import { supabase } from './supabase'
 *   const { data, error } = await supabase.auth.signInWithPassword(...)
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[MediVision] VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in frontend/.env.local'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,          // stores session in localStorage automatically
    autoRefreshToken: true,        // silently refreshes the JWT before expiry
    detectSessionInUrl: true,      // parse OAuth redirect token parameters in the URL
  },
})
