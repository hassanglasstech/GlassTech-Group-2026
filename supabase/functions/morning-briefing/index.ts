// ═══════════════════════════════════════════════════════════════════
// Supabase Edge Function: morning-briefing
// Runs every day at 8:00 AM PKT (3:00 AM UTC)
//
// Cron schedule: 0 3 * * *
// Set in: Supabase Dashboard → Edge Functions → morning-briefing → Schedule
//
// What it does:
// 1. Pulls live data from Supabase (quotations, requisitions, jobs, petty cash)
// 2. Generates intelligent summary using Claude AI
// 3. Sends WhatsApp message to Hassan
// 4. Stores briefing in morning_briefings table
//
// Required Supabase Secrets:
//   ANTHROPIC_API_KEY     — Claude API
//   WA_PHONE_NUMBER_ID    — WhatsApp Business
//   WA_ACCESS_TOKEN       — WhatsApp Business
//   WA_TO_NUMBER          — Hassan's number e.g. 923xxxxxxxxx
// ═══════════════════════════════════════════════════════════════════

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

const PKR = (n: number) => `PKR ${Math.round(n).toLocaleString('en-PK')}`;

// ── Retry with exponential backoff ──────────────────────────────────────
const fetchWithRetry = async (url: string, opts: RequestInit, maxRetries = 3): Promise<Response> => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, opts);
      if ((response.status === 429 || response.status === 529) && attempt < maxRetries) {
        const retryAfter = response.headers.get('retry-after');
        const delay = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, attempt) * 1000;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      return response;
    } catch (netErr) {
      if (attempt === maxRetries) throw netErr;
      await new Promise(r => setTimeout(r, attempt * 1500));
    }
  }
  throw new Error('Max retries reached');
};

// ── M-2: Prompt injection sanitizer ──────────────────────────────────────────
// Strips characters that could be used to inject instructions into LLM prompts:
// angle brackets, braces, backticks, control characters, and markdown emphasis.
// Applied to ALL vendor/client names and free-text fields before interpolation.
const sanitizeName = (s: unknown): string =>
  String(s ?? '')
    .replace(/[<>{}\[\]`\\]/g, '')          // remove structural/template chars
    .replace(/[\x00-\x1F\x7F]/g, '')        // strip control characters
    .replace(/\*{2,}|_{2,}/g, '')           // strip markdown bold/italic markers
    .replace(/\bignore\b|\bforget\b|\bsystem\b|\bprompt\b/gi, '[filtered]') // common injection keywords
    .trim()
    .slice(0, 120);                          // hard cap: no token-stuffing via names

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // ── Auth gate ─────────────────────────────────────────────────────
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const now      = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const weekAgo  = new Date(now); weekAgo.setDate(now.getDate() - 7);
    const monthAgo = new Date(now); monthAgo.setDate(now.getDate() - 30);

    const yesterdayStr = new Date(now.getTime() - 86400000).toISOString().split('T')[0];

    // ── 1. Fetch comprehensive data in parallel ──────────────────
    const [
      quotationsRes, jobOrdersRes, requisitionsRes,
      factoryEventsRes, invoicesRes, ncrRes,
      pettyCashRes, decisionsRes, anomalyRes,
    ] = await Promise.all([
      supabase.from('quotations').select('id,client_name,project_name,status,total_amount,created_at,due_date').gte('created_at', monthAgo.toISOString()),
      supabase.from('quotations').select('id,client_name,project_name,status,total_amount,created_at').eq('status', 'In Production').limit(20),
      supabase.from('requisitions').select('id,category,status,priority,created_at,header_text').eq('status', 'Pending').limit(20),
      supabase.from('factory_events').select('sector,event_type,priority,status,detail,created_at').gte('created_at', weekAgo.toISOString()).eq('status', 'Open'),
      supabase.from('invoices').select('id,client_name,total_amount,status,due_date,date').gte('created_at', monthAgo.toISOString()),
      supabase.from('factory_events').select('id,event_type,detail,priority,created_at').eq('event_type', 'NCR - Glass Breakage').gte('created_at', yesterdayStr),
      supabase.from('petty_cash').select('id,amount,description,date,type').gte('date', yesterdayStr).eq('type', 'Payment'),
      supabase.from('agent_decisions').select('id,decision,department,outcome,confidence').order('created_at', { ascending: false }).limit(10),
      supabase.from('anomaly_log').select('id,anomaly_type,severity,description').is('acknowledged_at', null).order('created_at', { ascending: false }).limit(5),
    ]);

    const quotations    = quotationsRes.data    || [];
    const jobOrders     = jobOrdersRes.data     || [];
    const requisitions  = requisitionsRes.data  || [];
    const factoryEvents = factoryEventsRes.data || [];
    const invoices      = invoicesRes.data      || [];
    const ncrs          = ncrRes.data           || [];
    const pettyCash     = pettyCashRes.data     || [];
    const decisions     = decisionsRes.data     || [];
    const anomalies     = anomalyRes.data       || [];

    // ── 2. Compute comprehensive KPIs ────────────────────────────
    const todayQuotations = quotations.filter(q => q.created_at?.startsWith(todayStr));
    const yesterdayQuotes = quotations.filter(q => q.created_at?.startsWith(yesterdayStr));
    const totalBilled     = quotations.reduce((s, q) => s + (q.total_amount || 0), 0);
    const overdueInvoices = invoices.filter(i => (i.status === 'Outstanding' || i.status === 'Overdue') && i.due_date && new Date(i.due_date) < now);
    const overdueTotal    = overdueInvoices.reduce((s, i) => s + (i.total_amount || 0), 0);
    const urgentReqs      = requisitions.filter(r => r.priority === 'Urgent');
    const urgentEvents    = factoryEvents.filter(e => e.priority === 'Urgent');
    const stuckJobs       = jobOrders.filter(j => Math.floor((now.getTime() - new Date(j.created_at).getTime()) / 86400000) >= 3);
    const bigCashMoves    = pettyCash.filter(p => (p.amount || 0) >= 50000);
    const decisionAccuracy = decisions.filter(d => d.outcome).length > 0
      ? Math.round(decisions.filter(d => d.outcome === 'correct').length / decisions.filter(d => d.outcome).length * 100) : null;

    // ── 3. Build structured data for Claude narrative ─────────────
    const dataForClaude = {
      date: now.toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      yesterday_summary: {
        quotations_created: yesterdayQuotes.length,
        quotations_approved: yesterdayQuotes.filter(q => q.status === 'Approved').length,
        ncr_breakage_events: ncrs.length,
        ncr_details: ncrs.slice(0, 3).map(n => sanitizeName(n.detail || n.event_type)),
        cash_expenses_yesterday: pettyCash.reduce((s, p) => s + (p.amount || 0), 0),
        big_cash_moves: bigCashMoves.map(p => `${sanitizeName(p.description)} — ${PKR(p.amount)}`),
      },
      today_priorities: {
        overdue_invoices: overdueInvoices.length,
        overdue_total: PKR(overdueTotal),
        overdue_top3: overdueInvoices.slice(0, 3).map(i => `${sanitizeName(i.client_name)} — ${PKR(i.total_amount || 0)}`),
        pending_requisitions: requisitions.length,
        urgent_requisitions: urgentReqs.length,
        stuck_jobs_3plus_days: stuckJobs.length,
        stuck_details: stuckJobs.slice(0, 3).map(j => sanitizeName(j.client_name)),
        open_urgent_events: urgentEvents.length,
        unacknowledged_anomalies: anomalies.length,
        anomaly_highlights: anomalies.slice(0, 2).map(a => `[${a.severity}] ${a.description}`),
      },
      finance_snapshot: {
        month_quotations: quotations.length,
        month_billed: PKR(totalBilled),
        today_new: todayQuotations.length,
      },
      production_snapshot: {
        active_jobs: jobOrders.length,
      },
      agent_intelligence: {
        decision_accuracy: decisionAccuracy ? `${decisionAccuracy}%` : 'Not enough data yet',
        recent_decisions: decisions.slice(0, 3).map(d => `${d.department}: ${d.decision}`),
      },
    };

    // ── 4. Generate smart summary via Claude (with retry) ─────────
    const claudeRes = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: `You are GlassTech owner Hassan's daily business briefer. Be concise, specific, and action-oriented. Reference real numbers from the data provided. Write in Roman Urdu + English mix.`,
        messages: [{
          role: 'user',
          content: `Generate morning briefing for ${dataForClaude.date}.

DATA: ${JSON.stringify(dataForClaude)}

FORMAT (exactly 3 sections, max 400 words total):

☀️ YESTERDAY SUMMARY
- What happened yesterday: quotations, production, cash moves, NCR events
- Use actual numbers. Skip sections with zero activity.

📋 TODAY PRIORITIES (ranked by urgency)
1. Overdue payments approaching critical
2. Pending approvals
3. Stuck production orders
4. Stock/anomaly alerts

🤖 AGENT RECOMMENDATIONS (max 3 one-liners)
- One finance action
- One production action
- One ops/HR action

RULES:
- Start with "Assalam o Alaikum Hassan bhai! ☀️"
- Use emojis for section headers, not markdown
- Be direct — no fluff
- End with one key focus for today
- If anomaly alerts exist, flag them prominently`,
        }],
      }),
    });

    const claudeData = await claudeRes.json();
    const briefingText = claudeData.content?.[0]?.text || 'Morning briefing generate nahi ho saka.';

    // Track token usage
    if (claudeData.usage) {
      const inp = claudeData.usage.input_tokens || 0;
      const out = claudeData.usage.output_tokens || 0;
      const costUsd = (inp * 0.80 + out * 4.00) / 1_000_000;
      await supabase.from('agent_api_calls').insert({
        agent_name:     'morning-briefing',
        model:          'claude-haiku-4-5-20251001',
        input_tokens:   inp,
        output_tokens:  out,
        tokens_used:    inp + out,
        cost_usd:       costUsd,
        cost_pkr:       costUsd * 278,
        created_at:     new Date().toISOString(),
      }).catch(() => {});
    }

    // ── 5. Store briefing in Supabase ─────────────────────────────
    await supabase.from('morning_briefings').upsert({
      briefing_date: todayStr,
      briefing_text: briefingText,
      raw_data:      dataForClaude,
      kpis: {
        total_billed_month:   totalBilled,
        active_jobs:          jobOrders.length,
        pending_reqs:         requisitions.length,
        urgent_reqs:          urgentReqs.length,
        overdue_invoices:     overdueInvoices.length,
        overdue_total:        overdueTotal,
        open_events:          factoryEvents.length,
        stuck_jobs:           stuckJobs.length,
        ncr_yesterday:        ncrs.length,
        anomalies_open:       anomalies.length,
      },
      created_at: now.toISOString(),
    }, { onConflict: 'briefing_date' });

    // ── 6. Send WhatsApp ──────────────────────────────────────────
    const waPhone = Deno.env.get('WA_PHONE_NUMBER_ID');
    const waToken = Deno.env.get('WA_ACCESS_TOKEN');
    const waTo    = Deno.env.get('WA_TO_NUMBER');
    let waSent    = false;

    if (waPhone && waToken && waTo) {
      const waRes = await fetch(`https://graph.facebook.com/v18.0/${waPhone}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${waToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: waTo,
          type: 'text',
          text: { body: briefingText },
        }),
      });
      waSent = waRes.ok;
    }

    return new Response(JSON.stringify({
      success: true,
      date: todayStr,
      briefing_preview: briefingText.substring(0, 150) + '...',
      whatsapp_sent: waSent,
      kpis: {
        active_jobs: jobOrders.length,
        pending_reqs: requisitions.length,
        overdue_invoices: overdueInvoices.length,
        stuck_jobs: stuckJobs.length,
        anomalies: anomalies.length,
      },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
