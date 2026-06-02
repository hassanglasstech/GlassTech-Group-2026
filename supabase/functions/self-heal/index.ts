// supabase functions deploy self-heal
// Schedule: 0 */6 * * *  (every 6 hours)
// Monitors system health, auto-fixes what it can, alerts on the rest

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAuth, corsHeaders } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // ── Auth gate ─────────────────────────────────────────────────────
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const issues: any[] = [];
  const fixed:  any[] = [];

  try {
    const now = new Date();

    // ── Check 1: Sync lag — records created but not synced ──────────
    const cutoff = new Date(now.getTime() - 24 * 3600000).toISOString();
    const { count: unsyncedReqs } = await supabase
      .from('gtk_erp_requisitions')
      .select('id', { count: 'exact', head: true })
      .lt('created_at', cutoff)
      .is('updated_at', null);

    if ((unsyncedReqs || 0) > 0) {
      issues.push({ type: 'sync_lag', desc: `${unsyncedReqs} requisitions missing updated_at`, severity: 'warning', auto_fixable: true });
      // Auto-fix: set updated_at
      await supabase.from('gtk_erp_requisitions').update({ updated_at: now.toISOString() }).is('updated_at', null);
      fixed.push('sync_lag');
    }

    // ── Check 2: Stale predictive alerts ────────────────────────────
    const { count: staleAlerts } = await supabase
      .from('predictive_alerts')
      .select('id', { count: 'exact', head: true })
      .eq('actioned', false)
      .eq('dismissed', false)
      .lt('created_at', new Date(now.getTime() - 7 * 86400000).toISOString());

    if ((staleAlerts || 0) > 5) {
      issues.push({ type: 'stale_alerts', desc: `${staleAlerts} predictive alerts older than 7 days`, severity: 'low', auto_fixable: true });
      // Auto-fix: dismiss stale
      await supabase.from('predictive_alerts')
        .update({ dismissed: true, dismissed_at: now.toISOString() })
        .eq('actioned', false).eq('dismissed', false)
        .lt('created_at', new Date(now.getTime() - 7 * 86400000).toISOString());
      fixed.push('stale_alerts');
    }

    // ── Check 3: Agent tasks overdue ────────────────────────────────
    const { count: overdueTaskCount } = await supabase
      .from('agent_tasks')
      .select('id', { count: 'exact', head: true })
      .in('status', ['Open', 'In Progress'])
      .lt('due_date', now.toISOString().split('T')[0]);

    if ((overdueTaskCount || 0) > 0) {
      issues.push({ type: 'overdue_tasks', desc: `${overdueTaskCount} agent tasks overdue`, severity: 'medium', auto_fixable: false });
    }

    // ── Check 4: Factory events stuck open > 72hrs ───────────────────
    const { count: stuckEvents } = await supabase
      .from('factory_events')
      .select('id', { count: 'exact', head: true })
      .in('status', ['Open', 'Pending'])
      .lt('created_at', new Date(now.getTime() - 72 * 3600000).toISOString());

    if ((stuckEvents || 0) > 0) {
      issues.push({ type: 'stuck_events', desc: `${stuckEvents} factory events open > 72hrs`, severity: 'medium', auto_fixable: false });
      // Add to repair queue for human attention
      await supabase.from('repair_queue').insert({
        issue_type:   'stuck_events',
        description:  `${stuckEvents} factory events have been open for more than 72 hours`,
        record_count: stuckEvents,
        status:       'pending',
        auto_fixable: false,
        created_at:   now.toISOString(),
      });
    }

    // ── Check 5: SLA review overdue ──────────────────────────────────
    const today = now.toISOString().split('T')[0];
    const { count: slaReviewsDue } = await supabase
      .from('vendor_sla')
      .select('id', { count: 'exact', head: true })
      .eq('active', true)
      .lte('next_rate_review', today)
      .eq('reminded', false);

    if ((slaReviewsDue || 0) > 0) {
      issues.push({ type: 'sla_review', desc: `${slaReviewsDue} vendor rate reviews due`, severity: 'low', auto_fixable: false });
    }

    // ── Log all issues ────────────────────────────────────────────────
    for (const issue of issues) {
      await supabase.from('system_health_log').insert({
        check_type:  issue.type,
        status:      fixed.includes(issue.type) ? 'fixed' : issue.severity === 'warning' ? 'warning' : 'error',
        details:     issue.desc,
        auto_fixed:  fixed.includes(issue.type),
        fix_action:  fixed.includes(issue.type) ? 'Auto-fixed by self-heal' : null,
        severity:    issue.severity,
        created_at:  now.toISOString(),
      });
    }

    // Log ok status if all clear
    if (issues.length === 0) {
      await supabase.from('system_health_log').insert({
        check_type: 'full_scan', status: 'ok', details: 'All systems healthy', severity: 'low', created_at: now.toISOString(),
      });
    }

    // WhatsApp alert if critical issues unfixed
    const criticalUnfixed = issues.filter(i => !fixed.includes(i.type) && (i.severity === 'medium' || i.severity === 'high'));
    if (criticalUnfixed.length > 0) {
      const waUrl = Deno.env.get('SUPABASE_URL') + '/functions/v1/whatsapp-notify';
      await fetch(waUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `🔧 *ERP Health Alert*\n\n${criticalUnfixed.map(i => `• ${i.desc}`).join('\n')}\n\nERP → System Health tab mein dekho.`,
          type: 'alert', priority: 'Normal',
        }),
      }).catch(() => {});
    }

    return new Response(JSON.stringify({ issues: issues.length, fixed: fixed.length, critical: criticalUnfixed.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
