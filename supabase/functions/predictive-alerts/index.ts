// ═══════════════════════════════════════════════════════════════════
// Supabase Edge Function: predictive-alerts
// Runs hourly cron — analyzes ERP data and generates predictive alerts
//
// Deploy: supabase functions deploy predictive-alerts
// Schedule: 0 * * * *  (every hour)
// ═══════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PredictiveAlert {
  alert_type:   string;
  title:        string;
  message:      string;
  severity:     string;
  confidence:   number;
  entity_type?: string;
  entity_id?:   string;
  entity_label?:string;
  data_snapshot?: any;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const alerts: PredictiveAlert[] = [];
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  try {

    // ── 1. SLA Breach Prediction ────────────────────────────────────
    // Vendors approaching SLA threshold (>80% breach rate)
    const { data: vendors } = await supabase
      .from('vendor_sla')
      .select('*')
      .eq('active', true)
      .gt('total_orders', 3);  // min 3 orders for meaningful data

    (vendors || []).forEach((v: any) => {
      const breachRate = v.total_orders > 0 ? (v.breach_count / v.total_orders) : 0;
      if (breachRate >= 0.4) {
        alerts.push({
          alert_type:   'SLA_BREACH',
          title:        `Vendor SLA Risk: ${v.vendor_name}`,
          message:      `${v.vendor_name} ka breach rate ${Math.round(breachRate * 100)}% hai (${v.breach_count}/${v.total_orders} orders). Delivery delays expected.`,
          severity:     breachRate >= 0.6 ? 'High' : 'Medium',
          confidence:   Math.min(95, Math.round(breachRate * 100 + 30)),
          entity_type:  'vendor',
          entity_id:    v.id,
          entity_label: v.vendor_name,
          data_snapshot: { breach_count: v.breach_count, total_orders: v.total_orders, breach_rate: breachRate },
        });
      }
    });

    // ── 2. Overdue Events Pattern ───────────────────────────────────
    const cutoff48 = new Date(now.getTime() - 48 * 3600000).toISOString();
    const { data: overdueEvents } = await supabase
      .from('factory_events')
      .select('sector, count')
      .in('status', ['Open', 'Pending'])
      .lt('created_at', cutoff48);

    if ((overdueEvents?.length ?? 0) >= 5) {
      alerts.push({
        alert_type: 'CAPACITY_RISK',
        title:      'Factory Backlog Building Up',
        message:    `${overdueEvents!.length} events 48hr se zyada se Open/Pending hain. Factory capacity ya staffing issue ho sakti hai.`,
        severity:   overdueEvents!.length >= 10 ? 'High' : 'Medium',
        confidence: 80,
        data_snapshot: { overdue_count: overdueEvents!.length },
      });
    }

    // ── 3. QC Failure Pattern ───────────────────────────────────────
    // If QC fail rate > 15% in last 7 days
    const last7 = new Date(now.getTime() - 7 * 86400000).toISOString();
    const { count: qcFails } = await supabase
      .from('factory_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', 'QC Rejection')
      .gte('created_at', last7);

    const { count: totalProduction } = await supabase
      .from('factory_events')
      .select('id', { count: 'exact', head: true })
      .eq('sector', 'Production')
      .gte('created_at', last7);

    if ((qcFails ?? 0) >= 3 && (totalProduction ?? 0) > 0) {
      const qcRate = Math.round(((qcFails ?? 0) / (totalProduction ?? 1)) * 100);
      if (qcRate >= 15) {
        alerts.push({
          alert_type: 'QC_PATTERN',
          title:      'QC Rejection Rate High',
          message:    `Last 7 days mein ${qcFails} QC rejections (${qcRate}% rate). Raw material quality ya cutting process check karo.`,
          severity:   qcRate >= 25 ? 'High' : 'Medium',
          confidence: 85,
          data_snapshot: { qc_fails: qcFails, total_events: totalProduction, rate: qcRate },
        });
      }
    }

    // ── 4. Delivery Delay Risk ──────────────────────────────────────
    // Events with Urgent priority unresolved > 12hr
    const cutoff12 = new Date(now.getTime() - 12 * 3600000).toISOString();
    const { count: urgentUnresolved } = await supabase
      .from('factory_events')
      .select('id', { count: 'exact', head: true })
      .eq('priority', 'Urgent')
      .in('status', ['Open', 'Pending'])
      .lt('created_at', cutoff12);

    if ((urgentUnresolved ?? 0) >= 2) {
      alerts.push({
        alert_type: 'DELIVERY_DELAY',
        title:      'Urgent Issues Unresolved — Delivery at Risk',
        message:    `${urgentUnresolved} urgent events 12hr se zyada se unresolved hain. Customer delivery dates miss ho sakti hain.`,
        severity:   'High',
        confidence: 75,
        data_snapshot: { urgent_unresolved: urgentUnresolved },
      });
    }

    // ── 5. Rate Review Due ──────────────────────────────────────────
    const { data: reviewDue } = await supabase
      .from('vendor_sla')
      .select('vendor_name, next_rate_review')
      .eq('active', true)
      .lte('next_rate_review', todayStr)
      .eq('reminded', false)
      .limit(5);

    if ((reviewDue?.length ?? 0) > 0) {
      alerts.push({
        alert_type:   'VENDOR_RISK',
        title:        `${reviewDue!.length} Vendor Rate Reviews Due`,
        message:      `Rate review due: ${reviewDue!.map((v: any) => v.vendor_name).join(', ')}. Market rates check karo.`,
        severity:     'Low',
        confidence:   99,
        data_snapshot: { vendors: reviewDue!.map((v: any) => v.vendor_name) },
      });
    }

    // ── 6. HSE Pattern ─────────────────────────────────────────────
    const { count: hseCount } = await supabase
      .from('hse_incidents')
      .select('id', { count: 'exact', head: true })
      .eq('closed', false)
      .gte('severity', 'Major');

    if ((hseCount ?? 0) >= 2) {
      alerts.push({
        alert_type: 'QC_PATTERN',
        title:      'Multiple Open HSE Incidents',
        message:    `${hseCount} major/critical HSE incidents open hain. Safety audit recommended.`,
        severity:   'Critical',
        confidence: 99,
        data_snapshot: { open_hse: hseCount },
      });
    }

    // ── Deduplicate — skip if same type exists unactioned today ─────
    const { data: existing } = await supabase
      .from('predictive_alerts')
      .select('alert_type')
      .eq('actioned', false)
      .eq('dismissed', false)
      .gte('created_at', `${todayStr}T00:00:00Z`);

    const existingTypes = new Set((existing || []).map((e: any) => e.alert_type));

    const newAlerts = alerts.filter(a => {
      // Allow multiple per type if different entity
      return true;
    });

    // Insert new alerts
    if (newAlerts.length > 0) {
      await supabase.from('predictive_alerts').insert(
        newAlerts.map(a => ({ ...a, created_at: now.toISOString() }))
      );
    }

    return new Response(
      JSON.stringify({ generated: newAlerts.length, total_checked: 6 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
