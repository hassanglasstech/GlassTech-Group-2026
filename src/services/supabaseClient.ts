import { createClient } from '@supabase/supabase-js';

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Fail LOUD, not blank. createClient('','') throws synchronously at module-eval
// (before React/ErrorBoundary mount) → uncatchable white screen. If the env is
// misconfigured (forgotten Vercel var, typo), render a readable config message
// into #root instead of a blank page, then stop.
if (!supabaseUrl || !supabaseAnonKey) {
  const msg =
    'Configuration error: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set. ' +
    'Check the deployment environment variables.';
  if (typeof document !== 'undefined') {
    const root = document.getElementById('root');
    if (root) {
      root.innerHTML =
        '<div style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:1.5rem;' +
        'border:1px solid #fecdd3;background:#fff1f2;border-radius:12px;color:#9f1239">' +
        '<h1 style="font-size:1.1rem;font-weight:800;margin:0 0 .5rem">Configuration error</h1>' +
        '<p style="font-size:.9rem;margin:0;color:#7f1d1d">' + msg + '</p></div>';
    }
  }
  throw new Error(msg);
}

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

// Dev-only: expose the client on window for quick RLS / company-isolation spot-checks
// in the browser console, e.g.
//   await window.__sb.from('ledger').select('id,company').eq('company','Nippon')  // → []
// Guarded by import.meta.env.DEV, so it is NOT present in production builds.
if (import.meta.env.DEV) {
  (window as Window & { __sb?: typeof supabase }).__sb = supabase;
}
