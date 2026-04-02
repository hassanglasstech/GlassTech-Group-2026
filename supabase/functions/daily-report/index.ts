// ═══════════════════════════════════════════════════════════════════
// Supabase Edge Function: daily-report
// Cron: 6:00 PM daily → generate HTML report → store in Supabase
//
// Deploy: supabase functions deploy daily-report
// Schedule (Supabase Dashboard): 0 13 * * *   ← 6pm PKT = 1pm UTC
// ═══════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const today     = new Date();
    const todayStr  = today.toISOString().split('T')[0];
    const startOfDay = `${todayStr}T00:00:00.000Z`;
    const endOfDay   = `${todayStr}T23:59:59.999Z`;

    // Fetch today's factory events
    const { data: events } = await supabase
      .from('factory_events')
      .select('*')
      .gte('created_at', startOfDay)
      .lte('created_at', endOfDay)
      .order('created_at', { ascending: true });

    // Fetch open escalations
    const { data: escalations } = await supabase
      .from('factory_escalation_alerts')
      .select('*')
      .eq('resolved', false);

    // Fetch open HSE incidents
    const { data: hseIncidents } = await supabase
      .from('hse_incidents')
      .select('*')
      .eq('closed', false)
      .gte('created_at', startOfDay);

    const evList   = events        || [];
    const escList  = escalations   || [];
    const hseList  = hseIncidents  || [];

    // Group events by sector
    const sectors = ['Production', 'Store', 'Maintenance', 'HR', 'Logistics', 'Office'];
    const bySector: Record<string, typeof evList> = {};
    sectors.forEach(s => { bySector[s] = evList.filter(e => e.sector === s); });

    const urgent   = evList.filter(e => e.priority === 'Urgent');
    const resolved = evList.filter(e => e.status === 'Resolved' || e.status === 'Closed');
    const open     = evList.filter(e => e.status === 'Open' || e.status === 'Pending');

    // Generate HTML report
    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; color: #1a1a1a; }
  .header { background: #0f172a; color: white; padding: 24px 32px; border-radius: 12px; margin-bottom: 20px; }
  .header h1 { margin: 0; font-size: 22px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; }
  .header p  { margin: 4px 0 0; font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; }
  .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
  .kpi { background: white; border-radius: 10px; padding: 16px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .kpi .num { font-size: 28px; font-weight: 900; color: #0f172a; }
  .kpi .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; margin-top: 4px; }
  .kpi.urgent .num { color: #ef4444; }
  .kpi.resolved .num { color: #22c55e; }
  .section { background: white; border-radius: 10px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .section h2 { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #0f172a; margin: 0 0 14px; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; }
  .event-row { padding: 8px 0; border-bottom: 1px solid #f8fafc; display: flex; gap: 12px; align-items: flex-start; }
  .event-row:last-child { border-bottom: none; }
  .badge { font-size: 9px; font-weight: 700; padding: 2px 8px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; }
  .badge.urgent   { background: #fee2e2; color: #dc2626; }
  .badge.medium   { background: #fef9c3; color: #ca8a04; }
  .badge.low      { background: #f1f5f9; color: #64748b; }
  .badge.open     { background: #fee2e2; color: #dc2626; }
  .badge.resolved { background: #dcfce7; color: #16a34a; }
  .badge.pending  { background: #fef9c3; color: #ca8a04; }
  .event-text { font-size: 12px; color: #1e293b; flex: 1; }
  .event-meta { font-size: 10px; color: #94a3b8; margin-top: 2px; }
  .no-events { font-size: 12px; color: #94a3b8; font-style: italic; padding: 8px 0; }
  .alert-row { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 10px 14px; margin-bottom: 8px; font-size: 12px; color: #dc2626; }
  .hse-row { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 10px 14px; margin-bottom: 8px; font-size: 12px; }
  .footer { text-align: center; font-size: 10px; color: #94a3b8; margin-top: 24px; }
</style>
</head>
<body>
<div class="header">
  <h1>GlassTech Group — Daily Factory Report</h1>
  <p>${today.toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} &nbsp;·&nbsp; Generated 6:00 PM PKT</p>
</div>

<div class="kpi-row">
  <div class="kpi"><div class="num">${evList.length}</div><div class="lbl">Total Events</div></div>
  <div class="kpi urgent"><div class="num">${urgent.length}</div><div class="lbl">Urgent</div></div>
  <div class="kpi resolved"><div class="num">${resolved.length}</div><div class="lbl">Resolved</div></div>
  <div class="kpi"><div class="num">${open.length}</div><div class="lbl">Still Open</div></div>
</div>

${escList.length > 0 ? `
<div class="section">
  <h2>⚠️ Overdue Escalations (${escList.length})</h2>
  ${escList.map(e => `<div class="alert-row">${e.event_type} — ${e.sector} — ${e.hours_overdue}hr overdue</div>`).join('')}
</div>` : ''}

${hseList.length > 0 ? `
<div class="section">
  <h2>🛡️ HSE Incidents Today (${hseList.length})</h2>
  ${hseList.map(i => `<div class="hse-row"><strong>${i.severity}</strong> · ${i.category} · ${i.description}</div>`).join('')}
</div>` : ''}

<div class="section">
  <h2>Events by Sector</h2>
  ${sectors.map(s => {
    const sevents = bySector[s] || [];
    return `<div style="margin-bottom:14px">
      <div style="font-size:11px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">${s} (${sevents.length})</div>
      ${sevents.length === 0
        ? '<div class="no-events">No events</div>'
        : sevents.map(e => `
          <div class="event-row">
            <span class="badge ${e.priority.toLowerCase()}">${e.priority}</span>
            <span class="badge ${e.status.toLowerCase().replace(' ','-')}">${e.status}</span>
            <div>
              <div class="event-text">${e.event_type} — ${e.detail}</div>
              <div class="event-meta">${new Date(e.created_at).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })} · ${e.logged_by}</div>
            </div>
          </div>`).join('')
      }
    </div>`;
  }).join('')}
</div>

<div class="footer">GlassTech Group ERP · Auto-generated daily report · ${todayStr}</div>
</body>
</html>`;

    // Store report in Supabase
    const { data: report, error } = await supabase
      .from('daily_reports')
      .insert({
        report_date:   todayStr,
        html_content:  html,
        event_count:   evList.length,
        urgent_count:  urgent.length,
        open_count:    open.length,
        created_at:    new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) throw error;

    return new Response(
      JSON.stringify({ success: true, report_id: report.id, events: evList.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
