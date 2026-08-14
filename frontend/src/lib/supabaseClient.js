import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://tmlhthmtojuyxfjakgej.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtbGh0aG10b2p1eXhmamFrZ2VqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3MTE5NzMsImV4cCI6MjA5OTI4Nzk3M30.4GDd4K_FBT8pLGXv-5Q3Scoe0W2O2JyBSgOtE0ztZCc';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
