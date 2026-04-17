// ═══════════════════════════════════════════════════════════════════════
// wazir-sunday-brief — Supabase Edge Function
//
// Cron schedule: 0 17 * * 0  (Sunday 5pm UTC = Sunday 10pm PKT)
// Set in: Supabase Dashboard → Edge Functions → wazir-sunday-brief → Schedule
//
// What it does:
//   1. Pulls comprehensive 7-day + 12-week trend data from Supabase
//      (quotations, invoices, stock, attendance, GL, NCRs, past decisions, lessons)
//   2. Sends everything to Claude Sonnet as a deep board-level brief prompt
//   3. Sonnet generates fractional-CEO quality analysis:
//        - Headline (the one number that matters this week)
//        - Top 3 concerns (with data)
//        - Top opportunities
//        - Big strategic question
//        - Celebration worth noting
//   4. Stores in wazir_weekly_reports table
//   5. Sends as WhatsApp message to Hassan
//
// Required secrets:
//   ANTHROPIC_API_KEY, WA_PHONE_NUMBER_ID, WA_ACCESS_TOKEN, WA_TO_NUMBER
// ═══════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY missing' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Gather data ──────────────────────────────────────────────────
    const now       = new Date();
    const sevenDays = new Date(now.getTime() - 7  * 86400000).toISOString();
    const twelveWks = new Date(now.getTime() - 84 * 86400000).toISOString();
    const today     = now.toISOString().split('T')[0];

    const [
      invThisWeek, invLast12w,
      quotesThisWeek,
      arOutstanding,
      stockLow,
      attendanceWeek,
      ncrsWeek,
      recentDecisions,
      activeLessons,
    ] = await Promise.all([
      supabase.from('invoices').select('id, company, client_name, total_amount, date, status').gte('date', sevenDays),
      supabase.from('invoices').select('total_amount, date').gte('date', twelveWks),
      supabase.from('quotations').select('id, company, client_name, status, date, items').gte('date', sevenDays),
      supabase.from('invoices').select('id, company, client_name, balance, due_date').gt('balance', 0),
      supabase.from('store_items').select('id, name, company, quantity, min_level, moving_average_price, total_value').not('min_level', 'is', null),
      supabase.from('attendance').select('date, status, late_minutes').gte('date', sevenDays),
      supabase.from('ncr_events').select('id, description, company, created_at, status').gte('created_at', sevenDays),
      supabase.from('wazir_decisions').select('*').order('decided_at', { ascending: false }).limit(10),
      supabase.from('wazir_lessons').select('*').eq('is_active', true).limit(15),
    ]);

    // ── Compute key metrics ──────────────────────────────────────────
    const revenueThisWeek = (invThisWeek.data || []).reduce((s, i: any) => s + (i.total_amount || 0), 0);
    const invCount        = (invThisWeek.data || []).length;

    // 12-week trailing average (for comparison)
    const weeklyAvg = (() => {
      const byWeek: Record<string, number> = {};
      (invLast12w.data || []).forEach((i: any) => {
        const d  = new Date(i.date);
        const wk = `${d.getFullYear()}-W${Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / (7 * 86400000))}`;
        byWeek[wk] = (byWeek[wk] || 0) + (i.total_amount || 0);
      });
      const weeks = Object.values(byWeek);
      return weeks.length ? weeks.reduce((a, b) => a + b, 0) / weeks.length : 0;
    })();

    const arTotal   = (arOutstanding.data || []).reduce((s, i: any) => s + (i.balance || 0), 0);
    const arOverdue = (arOutstanding.data || []).filter((i: any) => i.due_date && new Date(i.due_date) < now).length;

    const belowMinStock = (stockLow.data || []).filter((s: any) => (s.quantity || 0) < (s.min_level || 0));

    const attPresent = (attendanceWeek.data || []).filter((a: any) => a.status === 'Present').length;
    const attTotal   = (attendanceWeek.data || []).length;
    const attRate    = attTotal > 0 ? (attPresent / attTotal * 100).toFixed(1) : 'N/A';

    const quotesPending = (quotesThisWeek.data || []).filter((q: any) => ['Draft', 'Sent'].includes(q.status)).length;
    const quotesClosed  = (quotesThisWeek.data || []).filter((q: any) => q.status === 'Approved').length;
    const quoteTotal    = (quotesThisWeek.data || []).reduce((s, q: any) => {
      const lineSum = (q.items || []).reduce((ss: number, it: any) => ss + (it.amount || 0), 0);
      return s + lineSum;
    }, 0);

    // ── Build context for Claude ─────────────────────────────────────
    const briefContext = {
      period: { from: sevenDays.split('T')[0], to: today },
      revenue: {
        this_week:      revenueThisWeek,
        weekly_12w_avg: weeklyAvg,
        variance_pct:   weeklyAvg > 0 ? ((revenueThisWeek - weeklyAvg) / weeklyAvg * 100).toFixed(1) : 'N/A',
        invoice_count:  invCount,
      },
      quotes_pipeline: {
        new_quotes_this_week: quotesThisWeek.data?.length || 0,
        quotes_total_value:   quoteTotal,
        closed_this_week:     quotesClosed,
        still_pending:        quotesPending,
      },
      ar_health: {
        total_outstanding: arTotal,
        overdue_count:     arOverdue,
        top_5_overdue: (arOutstanding.data || [])
          .filter((i: any) => i.due_date)
          .sort((a: any, b: any) => (a.due_date > b.due_date ? 1 : -1))
          .slice(0, 5)
          .map((i: any) => ({
            client:       i.client_name,
            amount:       i.balance,
            days_overdue: Math.floor((now.getTime() - new Date(i.due_date).getTime()) / 86400000),
          })),
      },
      stock_health: {
        below_min_count: belowMinStock.length,
        below_min_items: belowMinStock.slice(0, 5).map((s: any) => ({
          name:    s.name,
          company: s.company,
          current: s.quantity,
          min:     s.min_level,
          value:   s.total_value,
        })),
      },
      attendance: {
        attendance_rate_this_week: attRate + '%',
      },
      quality: {
        ncrs_this_week: ncrsWeek.data?.length || 0,
        ncrs:           (ncrsWeek.data || []).slice(0, 5),
      },
      owner_recent_decisions: (recentDecisions.data || []).map((d: any) => ({
        type:    d.decision_type,
        subject: d.subject,
        amount:  d.amount,
        outcome: d.outcome_status,
      })),
      accumulated_lessons: (activeLessons.data || []).map((l: any) => `[${l.category}] ${l.pattern}`),
    };

    // ── Call Claude Sonnet ───────────────────────────────────────────
    const systemPrompt = `
You are WAZIR — the digital shadow self of Hassan, who runs 5 Pakistani glass/aluminium
companies as solo COO+CTO+CFO.

It is Sunday night 10pm PKT. Hassan needs his weekly board brief.

Your job: produce a fractional-CEO-quality briefing. Format:

═══ WAZIR's WEEKLY REVIEW — Week {N}, {Year} ═══

📊 THE HEADLINE NUMBER:
  [The ONE metric that matters this week, with the variance and a 1-line diagnosis]

🔴 THREE THINGS YOU SHOULD KNOW:
  1. [Concrete, specific concern with data]
  2. [Another one]
  3. [Third one]

🎯 ONE BIG QUESTION FOR YOU:
  [The strategic question — force him to think]
  Options A / B / (optional C) with your read on each.

🏆 ONE WIN TO CELEBRATE:
  [Something genuine — don't fabricate. If nothing, skip this section.]

══ RULES ══
1. Every claim MUST be grounded in the data provided. Never invent numbers.
2. Speak like a Big-4 partner who knows Hassan personally. Warm, direct, no fluff.
3. Use Urdu-English mix sparingly for warmth ("boss", "yaar", "ab kya karna hai").
4. Reference his accumulated lessons where relevant.
5. 200-400 words total. This is a brief, not a dissertation.
6. If concerns tie to decisions he made, be specific: "Your approval of X on [date] — outcome tracker shows Y"
7. End with a SHORT warmth note if the mood warrants it (tough week = encouragement; win week = celebrate).
`;

    const userPrompt = `
This week's data:

\`\`\`json
${JSON.stringify(briefContext, null, 2)}
\`\`\`

Write the Sunday brief now.

Also return at the end, in a separate JSON block:
\`\`\`meta
{
  "headline": "one-line headline",
  "top_concerns": [{"concern": "...", "severity": "high|medium|low"}],
  "top_opportunities": [{"opportunity": "...", "potential": "..."}],
  "big_question": "the strategic question"
}
\`\`\`
`;

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:     'claude-sonnet-4-6',
        max_tokens: 2500,
        system:     systemPrompt,
        messages:  [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!aiRes.ok) {
      const err = await aiRes.text();
      return new Response(JSON.stringify({ error: 'Claude failed', details: err }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await aiRes.json();
    const fullText: string = aiData.content?.[0]?.text || '';

    // Extract meta block if present
    const metaMatch = fullText.match(/```meta\s*([\s\S]*?)```/);
    let meta: any = {};
    try {
      if (metaMatch) meta = JSON.parse(metaMatch[1].trim());
    } catch { /* ignore */ }

    const displayBody = fullText.replace(/```meta[\s\S]*?```/, '').trim();
    const headlineMatch = displayBody.match(/HEADLINE NUMBER:\s*\n\s*(.+?)(?:\n|$)/);
    const headline = meta.headline || headlineMatch?.[1]?.trim() || 'Weekly review ready';

    // ── Store in wazir_weekly_reports ────────────────────────────────
    const weekNum = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (7 * 86400000)) + 1;
    const reportId = `WWR-${today}`;

    const inputTokens  = aiData.usage?.input_tokens  || 0;
    const outputTokens = aiData.usage?.output_tokens || 0;
    const costUsd      = (inputTokens * 3 + outputTokens * 15) / 1_000_000;

    await supabase.from('wazir_weekly_reports').upsert({
      id:                reportId,
      report_date:       today,
      week_number:       weekNum,
      year:              now.getFullYear(),
      companies_covered: ['GlassCo', 'GTK', 'GTI', 'Nippon', 'Factory'],
      headline,
      body:              displayBody,
      top_concerns:      meta.top_concerns      || [],
      top_opportunities: meta.top_opportunities || [],
      big_question:      meta.big_question      || '',
      metrics_snapshot:  briefContext,
      input_tokens:      inputTokens,
      output_tokens:     outputTokens,
      cost_pkr:          Math.round(costUsd * 278 * 100) / 100,
    }, { onConflict: 'id' });

    // ── Send WhatsApp to Hassan ──────────────────────────────────────
    const waPhoneId = Deno.env.get('WA_PHONE_NUMBER_ID');
    const waToken   = Deno.env.get('WA_ACCESS_TOKEN');
    const waToNum   = Deno.env.get('WA_TO_NUMBER');

    let waSent = false;
    if (waPhoneId && waToken && waToNum) {
      // WhatsApp text limit is ~4096 chars, but for readability split if needed
      const trimmedBody = displayBody.length > 3800 ? displayBody.slice(0, 3800) + '\n\n…(full brief in app)' : displayBody;

      const waRes = await fetch(`https://graph.facebook.com/v18.0/${waPhoneId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${waToken}` },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to:   waToNum,
          type: 'text',
          text: { body: trimmedBody },
        }),
      });
      waSent = waRes.ok;
      if (waSent) {
        await supabase.from('wazir_weekly_reports').update({ whatsapp_sent_at: new Date().toISOString() }).eq('id', reportId);
      }
    }

    return new Response(JSON.stringify({
      success:         true,
      report_id:       reportId,
      headline,
      whatsapp_sent:   waSent,
      tokens:          { input: inputTokens, output: outputTokens, cost_pkr: Math.round(costUsd * 278 * 100) / 100 },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('[wazir-sunday-brief] Error:', err);
    return new Response(JSON.stringify({ error: String(err), stack: err?.stack }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
