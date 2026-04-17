// supabase functions deploy claude-proxy
// Proxies Claude API calls server-side — avoids CORS + keeps API key secure
// Supports both standard and streaming responses.
// Security: JWT auth, model whitelist, max tokens cap, rate limiting.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Inline shared auth (dashboard deploy mein _shared available nahi hota) ──
const ALLOWED_ORIGINS = [
  Deno.env.get('SITE_URL'),
  'https://glasstech-erp.vercel.app',
  'https://glass-tech-group-2026.vercel.app',
].filter(Boolean) as string[];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

const corsHeaders = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGINS[0] || '*',
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
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }  // Note: auth uses static corsHeaders as req not available here
      ),
    };
  }

  const token      = authHeader.slice(7);
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
  const anonKey    = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  // Service key / cron secret → trusted internal call
  if ((serviceKey && token === serviceKey) || (cronSecret && token === cronSecret)) {
    return { ok: true, isCron: true, userId: null };
  }

  // Anon key → unauthenticated browser call (allow with anonymous userId)
  if (anonKey && token === anonKey) {
    return { ok: true, isCron: false, userId: 'anonymous' };
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

// ── Security: Configurable rate limiter (loads limits from DB) ───────
let _rateConfig: { max_per_minute: number; max_per_hour: number } | null = null;
let _rateConfigExpiry = 0;

async function loadRateConfig(supabase: any) {
  const now = Date.now();
  if (_rateConfig && now < _rateConfigExpiry) return _rateConfig;
  try {
    const { data } = await supabase.from('agent_rate_config').select('max_per_minute, max_per_hour').eq('config_key', 'claude_proxy').single();
    _rateConfig = data ? { max_per_minute: data.max_per_minute ?? 10, max_per_hour: data.max_per_hour ?? 100 } : { max_per_minute: 10, max_per_hour: 100 };
  } catch { _rateConfig = { max_per_minute: 10, max_per_hour: 100 }; }
  _rateConfigExpiry = now + 300000; // 5 min cache
  return _rateConfig;
}

async function checkRateLimit(userId: string, supabase: any): Promise<{ allowed: boolean; retryAfter?: number; reason?: string }> {
  const config  = await loadRateConfig(supabase);
  const now     = new Date();
  const hourAgo = new Date(now.getTime() - 3600000).toISOString();
  const minAgo  = new Date(now.getTime() - 60000).toISOString();

  const [hourRes, minRes] = await Promise.all([
    supabase.from('agent_rate_limits').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', hourAgo),
    supabase.from('agent_rate_limits').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', minAgo),
  ]);

  const hourCount = hourRes.count ?? 0;
  const minCount  = minRes.count ?? 0;

  if (minCount >= config.max_per_minute) return { allowed: false, retryAfter: 60, reason: `${config.max_per_minute} calls/minute limit` };
  if (hourCount >= config.max_per_hour)  return { allowed: false, retryAfter: 3600, reason: `${config.max_per_hour} calls/hour limit` };

  await supabase.from('agent_rate_limits').insert({ user_id: userId, created_at: now.toISOString() }).then(() => {}, () => {});
  return { allowed: true };
}

// ── Security: Request signature verification (replay prevention) ─────
// Frontend sends X-Request-Nonce (UUID) + X-Request-Timestamp (epoch ms).
// Proxy rejects if timestamp > 5 min old or nonce already seen.
const _seenNonces = new Set<string>();
const NONCE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function verifyRequestFreshness(req: Request): { ok: boolean; error?: string } {
  const nonce     = req.headers.get('X-Request-Nonce');
  const timestamp = req.headers.get('X-Request-Timestamp');

  // Signature headers are optional — if not sent, skip (backwards compatible)
  if (!nonce || !timestamp) return { ok: true };

  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(Date.now() - ts) > NONCE_WINDOW_MS) {
    return { ok: false, error: 'Request timestamp expired (>5 min)' };
  }

  if (_seenNonces.has(nonce)) {
    return { ok: false, error: 'Duplicate request nonce (replay detected)' };
  }

  _seenNonces.add(nonce);
  // Cleanup old nonces every 1000 entries
  if (_seenNonces.size > 1000) _seenNonces.clear();

  return { ok: true };
}

// ── Main handler ────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // Reject non-POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  // ── Replay prevention ─────────────────────────────────────────
  const freshness = verifyRequestFreshness(req);
  if (!freshness.ok) {
    return new Response(JSON.stringify({ error: freshness.error }), {
      status: 403, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) {
    return new Response(JSON.stringify({
      error: 'ANTHROPIC_API_KEY not set in Supabase secrets'
    }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
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
            ...cors,
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
      }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // ── Validate messages array ─────────────────────────────────
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return new Response(JSON.stringify({ error: 'messages must be a non-empty array' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // ── Cap max tokens ──────────────────────────────────────────
    body.max_tokens = Math.min(body.max_tokens || 1000, 4096);

    // ── Cap system prompt length ────────────────────────────────
    if (body.system && typeof body.system === 'string' && body.system.length > 12000) {
      body.system = body.system.slice(0, 12000);
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
          ...cors,
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
      }).then(() => {}, () => {});
    }

    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
