import { createClient } from '@supabase/supabase-js';

const supabaseUrl    = import.meta.env.VITE_SUPABASE_URL    || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Prevent lock timeout issues in React Strict Mode / double renders
    lock: async (name, acquireTimeout, fn) => {
      return fn();  // skip lock — single user app, no concurrency needed
    },
    persistSession:    true,
    detectSessionInUrl: true,
    autoRefreshToken:  true,
  },
});
