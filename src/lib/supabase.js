import { createClient } from '@supabase/supabase-js'

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession:    true,   // mantém sessão no localStorage entre refreshes
    detectSessionInUrl: true,  // lê token do hash na URL (OAuth, magic link)
    autoRefreshToken:  true,   // renova o access token automaticamente
  },
})
