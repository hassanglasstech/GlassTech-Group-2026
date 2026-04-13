// supabase functions deploy claude-proxy
// Proxies Claude API calls server-side — avoids CORS + keeps API key secure
// Supports both standard and streaming responses.
// Requires JWT auth (user session or service role key).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Inline shared auth (dashboard deploy mein _shared available nahi hota) ──
const ALLOWED_ORIGIN = Deno.env.get('SITE_URL') || 'https://glasstech-erp.vercel.app';

const corsHeaders = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

type AuthResult =
  | { ok: true;  isCron: boolean; userId: string | null }
  | { ok: false; response: Response };

async function requireAuth(req: Request): Promise<AuthResult> {
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

  if ((serviceKey && token === serviceKey) || (cronSecret && token === cronSecret)) {
    return { ok: true, isCron: true, userId: null };
  }

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

// ── Main handler ────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) {
    return new Response(JSON.stringify({
      error: 'ANTHROPIC_API_KEY not set in Supabase secrets'
    }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const body = await req.json();
    const isStreaming = body.stream === true;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    // Streaming: pipe SSE directly to client
    if (isStreaming && res.body) {
      return new Response(res.body, {
        status: res.status,
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // Standard: parse, track tokens, return
    const data = await res.json();

    // Fire-and-forget token tracking
    if (data.usage) {
      try {
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );
        await supabase.from('agent_token_usage').insert({
          agent_id:       body._agent_id || 'proxy',
          model:          body.model || 'unknown',
          input_tokens:   data.usage.input_tokens || 0,
          output_tokens:  data.usage.output_tokens || 0,
          total_tokens:   (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
          estimated_cost: 0,
          created_at:     new Date().toISOString(),
        }).catch(() => {});
      } catch {}
    }

    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
