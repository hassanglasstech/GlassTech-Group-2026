// ═══════════════════════════════════════════════════════════════════
// Supabase Edge Function: gemini-proxy
// Holds GEMINI_API_KEY server-side — never exposed to the browser.
// Requires JWT auth (authenticated Supabase user).
//
// POST body: { prompt: string, model?: string, jsonMode?: boolean }
// Returns:   { text: string }
//
// Deploy: supabase functions deploy gemini-proxy
// ═══════════════════════════════════════════════════════════════════

import { requireAuth, corsHeaders } from '../_shared/auth.ts';
import { checkRateLimit } from '../_shared/rateLimiter.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // ── Auth gate ─────────────────────────────────────────────────────
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  // ── Rate limit per authenticated user (go-live fix: prevents quota abuse)
  if (!auth.isCron && auth.userId) {
    const svc = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    const rl = await checkRateLimit(auth.userId, svc);
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded', reason: rl.reason, retryAfter: rl.retryAfter }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }

  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiKey) {
    return new Response(
      JSON.stringify({ error: 'GEMINI_API_KEY not configured in Supabase secrets' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body      = await req.json();
    const prompt    = body.prompt   as string;
    const model     = (body.model   as string) || 'gemini-2.0-flash';
    const jsonMode  = (body.jsonMode as boolean) || false;

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: 'prompt is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const generationConfig: Record<string, unknown> = { temperature: 0.2 };
    if (jsonMode) generationConfig.responseMimeType = 'application/json';

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig,
        }),
      }
    );

    if (!geminiRes.ok) {
      const errData = await geminiRes.json().catch(() => ({}));
      return new Response(
        JSON.stringify({ error: 'Gemini API error', details: errData }),
        { status: geminiRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const geminiData = await geminiRes.json();
    const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    return new Response(
      JSON.stringify({ text }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
