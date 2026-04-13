// ═══════════════════════════════════════════════════════════════════
// Shared auth utility for all GlassTech Edge Functions
// Verifies JWT (user session) OR service role key (cron / internal)
// ═══════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
  Deno.env.get('SITE_URL'),
  'https://glasstech-erp.vercel.app',
  'https://glass-tech-group-2026.vercel.app',
].filter(Boolean) as string[];

export function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  };
}

// Static fallback for non-request contexts
export const corsHeaders = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGINS[0] || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

export type AuthResult =
  | { ok: true;  isCron: boolean; userId: string | null }
  | { ok: false; response: Response };

export async function requireAuth(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: 'Missing or invalid Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      ),
    };
  }

  const token      = authHeader.slice(7);
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const cronSecret = Deno.env.get('CRON_SECRET') ?? '';

  // Allow cron runners and internal function-to-function calls
  if ((serviceKey && token === serviceKey) || (cronSecret && token === cronSecret)) {
    return { ok: true, isCron: true, userId: null };
  }

  // Verify as a regular Supabase user JWT
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      ),
    };
  }

  return { ok: true, isCron: false, userId: user.id };
}
