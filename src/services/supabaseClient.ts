import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Agar keys missing hain toh console mein error show hoga
if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Supabase environment variables are missing!");
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');
