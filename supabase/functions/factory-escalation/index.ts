// ═══════════════════════════════════════════════════════════════════
// Supabase Edge Function: factory-escalation
// Cron: every hour — checks overdue factory events & escalates
//
// Deploy: supabase functions deploy factory-escalation
// Cron:   set in Supabase Dashboard → Edge Functions → Schedule
//         Schedule: 0 * * * *  (every hour)
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

    const now = new Date();
    const cutoff24hr = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    // 1. Find events overdue > 24hr still Open or Pending
    const { data: overdueEvents } = await supabase
      .from('factory_events')
      .select('*')
      .in('status', ['Open', 'Pending'])
      .lt('created_at', cutoff24hr);

    if (!overdueEvents || overdueEvents.length === 0) {
      return new Response(JSON.stringify({ escalated: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Insert escalation alerts
    const alerts = overdueEvents.map(ev => ({
      event_id:   ev.id,
      sector:     ev.sector,
      event_type: ev.event_type,
      priority:   ev.priority,
      original_logged_by: ev.logged_by,
      hours_overdue: Math.floor((now.getTime() - new Date(ev.created_at).getTime()) / 3600000),
      alert_type: 'OVERDUE_24HR',
      resolved:   false,
      created_at: now.toISOString(),
    }));

    await supabase.from('factory_escalation_alerts').insert(alerts);

    // 3. Mark events as escalated (update status to 'Pending' if still Open)
    const openIds = overdueEvents.filter(e => e.status === 'Open').map(e => e.id);
    if (openIds.length > 0) {
      await supabase
        .from('factory_events')
        .update({ status: 'Pending', updated_at: now.toISOString() })
        .in('id', openIds);
    }

    return new Response(
      JSON.stringify({ escalated: overdueEvents.length, alerts: alerts.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
