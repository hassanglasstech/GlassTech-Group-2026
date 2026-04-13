// supabase functions deploy claude-proxy
// Proxies Claude API calls server-side — avoids CORS + keeps API key secure
// Supports both standard and streaming responses.
// Security: JWT auth, model whitelist, max tokens cap, rate limiting.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Inline shared auth (dashboard deploy mein _shared available nahi hota) ──
const ALLOWED_ORIGIN = Deno.env.get('SITE_URL') || 'https://glasstech-erp.vercel.app';

const corsHeaders = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

// ── Security: Model whitelist ────────────────────────────────────────
const ALLOWED_MODELS = new Set([
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-6',
]);

// ── Security: Allowed request body keys ──────────────────────────────
const ALLOWED_BODY_KEYS = new Set([
  'model', 'max_tokens', 'messages', 'system', 'tools',
  'stream', '_agent_id', 'tool_choice', 'temperature',
]);

// ── Security: Rate limiter (inline) ──────────────────────────────────
async function checkRateLimit(userId: string, supabase: any): Promise<{ allowed: boolean; retryAfter?: number }> {
  const now      = new Date();
  const hourAgo  = new Date(now.getTime() - 3600000).toISOString();
  const minAgo   = new Date(now.getTime() - 60000).toISOString();

  // Count calls in last hour and last minute
  const [hourRes, minRes] = await Promise.all([
    supabase.from('agent_rate_limits').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', hourAgo),
    supabase.from('agent_rate_limits').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', minAgo),
  ]);

  const hourCount = hourRes.count ?? 0;
  const minCount  = minRes.count ?? 0;

  if (minCount >= 10) return { allowed: false, retryAfter: 60 };
  if (hourCount >= 100) return { allowed: false, retryAfter: 3600 };

  // Log this call
  await supabase.from('agent_rate_limits').insert({ user_id: userId, created_at: now.toISOString() }).catch(() => {});

  return { allowed: true };
}

// ── Main handler ────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Reject non-POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) {
    return new Response(JSON.stringify({
      error: 'ANTHROPIC_API_KEY not set in Supabase secrets'
    }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const body = await req.json();

    // ── Rate limiting (skip for cron/service calls) ─────────────
    if (!auth.isCron && auth.userId) {
      const rateCheck = await checkRateLimit(auth.userId, supabase);
      if (!rateCheck.allowed) {
        return new Response(JSON.stringify({
          error: 'Rate limit exceeded. Try again later.',
          limit: rateCheck.retryAfter === 60 ? '10 calls/minute' : '100 calls/hour',
        }), {
          status: 429,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Retry-After': String(rateCheck.retryAfter),
          },
        });
      }
    }

    // ── Model whitelist ─────────────────────────────────────────
    if (!body.model || !ALLOWED_MODELS.has(body.model)) {
      return new Response(JSON.stringify({
        error: `Model not allowed. Use: ${[...ALLOWED_MODELS].join(', ')}`,
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── Validate messages array ─────────────────────────────────
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return new Response(JSON.stringify({ error: 'messages must be a non-empty array' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Cap max tokens ──────────────────────────────────────────
    body.max_tokens = Math.min(body.max_tokens || 1000, 1500);

    // ── Cap system prompt length ────────────────────────────────
    if (body.system && typeof body.system === 'string' && body.system.length > 5000) {
      body.system = body.system.slice(0, 5000);
    }

    // ── Strip unknown keys ──────────────────────────────────────
    const sanitizedBody: Record<string, any> = {};
    for (const key of Object.keys(body)) {
      if (ALLOWED_BODY_KEYS.has(key)) sanitizedBody[key] = body[key];
    }

    const isStreaming = sanitizedBody.stream === true;

    // ── Forward to Anthropic ────────────────────────────────────
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(sanitizedBody),
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
      const inp = data.usage.input_tokens || 0;
      const out = data.usage.output_tokens || 0;
      const pricing = sanitizedBody.model === 'claude-sonnet-4-6'
        ? { i: 3.00, o: 15.00 }
        : { i: 0.80, o: 4.00 };
      const costUsd = (inp * pricing.i + out * pricing.o) / 1_000_000;
      await supabase.from('agent_api_calls').insert({
        agent_name:     body._agent_id || 'proxy',
        model:          sanitizedBody.model,
        input_tokens:   inp,
        output_tokens:  out,
        tokens_used:    inp + out,
        cost_usd:       costUsd,
        cost_pkr:       costUsd * 278,
        created_at:     new Date().toISOString(),
      }).catch(() => {});
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
