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
import { requireAuth, corsHeaders } from '../_shared/auth.ts';

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

    // ── 1. Fetch all data in parallel ────────────────────────────
    const [
      quotationsRes, jobOrdersRes, requisitionsRes,
      agentActionsRes, factoryEventsRes,
    ] = await Promise.all([
      supabase.from('quotations').select('id,client_name,project_name,status,total_amount,created_at,due_date').gte('created_at', monthAgo.toISOString()),
      supabase.from('quotations').select('id,client_name,project_name,status,total_amount,created_at').eq('status', 'In Production').limit(20),
      supabase.from('requisitions').select('id,category,status,priority,created_at,header_text').eq('status', 'Pending').limit(20),
      supabase.from('agent_actions').select('tool_name,result,executed_at').gte('executed_at', weekAgo.toISOString()).order('executed_at', { ascending: false }).limit(20),
      supabase.from('factory_events').select('sector,event_type,priority,status,detail,created_at').gte('created_at', weekAgo.toISOString()).eq('status', 'Open'),
    ]);

    const quotations    = quotationsRes.data    || [];
    const jobOrders     = jobOrdersRes.data     || [];
    const requisitions  = requisitionsRes.data  || [];
    const agentActions  = agentActionsRes.data  || [];
    const factoryEvents = factoryEventsRes.data || [];

    // ── 2. Compute KPIs ──────────────────────────────────────────
    const todayQuotations = quotations.filter(q => q.created_at?.startsWith(todayStr));
    const totalBilled     = quotations.reduce((s, q) => s + (q.total_amount || 0), 0);
    const overdueOrders   = quotations.filter(q => {
      if (!q.due_date || q.status === 'Cancelled') return false;
      return new Date(q.due_date) < now && q.status !== 'Dispatched';
    });

    const urgentReqs      = requisitions.filter(r => r.priority === 'Urgent');
    const urgentEvents    = factoryEvents.filter(e => e.priority === 'Urgent');
    const stuckJobs       = jobOrders.filter(j => {
      const days = Math.floor((now.getTime() - new Date(j.created_at).getTime()) / 86400000);
      return days >= 3;
    });

    // ── 3. Build data summary for Claude ─────────────────────────
    const dataForClaude = {
      date: now.toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      finance: {
        this_month_quotations: quotations.length,
        total_billed_month: PKR(totalBilled),
        today_new_quotations: todayQuotations.length,
        overdue_orders: overdueOrders.length,
        overdue_details: overdueOrders.slice(0, 5).map(q => `${sanitizeName(q.client_name)} — ${PKR(q.total_amount || 0)}`),
      },
      production: {
        active_job_orders: jobOrders.length,
        stuck_3plus_days: stuckJobs.length,
        stuck_details: stuckJobs.slice(0, 5).map(j => `${sanitizeName(j.client_name)} / ${sanitizeName(j.project_name)}`),
      },
      operations: {
        pending_requisitions: requisitions.length,
        urgent_requisitions: urgentReqs.length,
        urgent_req_details: urgentReqs.slice(0, 3).map(r => sanitizeName(r.header_text?.replace('[AGENT] ', '') || r.category)),
        open_factory_events: factoryEvents.length,
        urgent_events: urgentEvents.length,
        urgent_event_details: urgentEvents.slice(0, 3).map(e => `${sanitizeName(e.sector)}: ${sanitizeName(e.event_type)}`),
      },
      agent_activity: {
        actions_this_week: agentActions.length,
        recent_actions: agentActions.slice(0, 5).map(a => a.tool_name),
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
        messages: [{
          role: 'user',
          content: `You are GlassTech ERP assistant. Generate a WhatsApp morning briefing for Hassan (owner).

Data: ${JSON.stringify(dataForClaude)}

Rules:
- Write in Roman Urdu + English mix (conversational, like a smart assistant)
- Max 300 words
- Start with "Assalam o Alaikum Hassan bhai! ☀️"
- Structure: 3 sections only — 💰 Finance, 🏭 Production, ⚡ Action Needed
- Highlight urgent items with emojis
- End with one key focus recommendation
- No markdown headers, use emojis instead
- Be direct and actionable`,
        }],
      }),
    });

    const claudeData = await claudeRes.json();
    const briefingText = claudeData.content?.[0]?.text || 'Morning briefing generate nahi ho saka.';

    // Track token usage
    if (claudeData.usage) {
      await supabase.from('agent_token_usage').insert({
        agent_id:       'morning-briefing',
        model:          'claude-haiku-4-5-20251001',
        input_tokens:   claudeData.usage.input_tokens || 0,
        output_tokens:  claudeData.usage.output_tokens || 0,
        total_tokens:   (claudeData.usage.input_tokens || 0) + (claudeData.usage.output_tokens || 0),
        estimated_cost: 0,
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
        overdue_orders:       overdueOrders.length,
        open_events:          factoryEvents.length,
        stuck_jobs:           stuckJobs.length,
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
        overdue_orders: overdueOrders.length,
        stuck_jobs: stuckJobs.length,
      },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
