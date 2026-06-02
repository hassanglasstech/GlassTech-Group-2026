import { createClient } from '@supabase/supabase-js';

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL     || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// IMPORTANT — flowType: 'pkce'
//
// The app uses HashRouter (URLs like /#/admin). Supabase's default "implicit"
// flow returns auth tokens in the URL hash fragment (#access_token=…), but
// HashRouter consumes the hash BEFORE Supabase JS can parse it. The result is
// the magic-link / invite redirect loop Hassan reported: user clicks link,
// lands on the app, hash gets eaten by the router, Supabase never sees the
// tokens, no session is created, app falls back to the login screen.
//
// PKCE flow returns the code in the QUERY STRING (?code=…&state=…), which
// HashRouter ignores entirely. Supabase JS exchanges the code for a session
// automatically when detectSessionInUrl is true. This is also the modern
// recommended flow per Supabase docs.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession:     true,
    detectSessionInUrl: true,
    autoRefreshToken:   true,
    flowType:           'pkce',
  },
});
