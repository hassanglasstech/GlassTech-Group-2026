/**
 * bypass-sla-checker — Supabase Edge Function
 *
 * Cron: runs daily at 8am PKT (3am UTC) via Supabase cron or external trigger.
 * Checks for overdue bypass_log entries (>3 days, unresolved).
 * Inserts notification for Super Admin for each overdue bypass.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl  = Deno.env.get('SUPABASE_URL')!;
const supabaseKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (_req) => {
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Query overdue bypasses (>3 days, unresolved)
    const { data: overdue, error } = await supabase
      .from('bypass_log_overdue')
      .select('*')
      .in('sla_status', ['overdue', 'critical']);

    if (error) {
      console.error('[bypass-sla-checker] Query failed:', error.message);
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    if (!overdue || overdue.length === 0) {
      console.log('[bypass-sla-checker] No overdue bypasses. All clear.');
      return new Response(JSON.stringify({ success: true, overdue: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(`[bypass-sla-checker] Found ${overdue.length} overdue bypasses.`);

    // Insert notification for each overdue bypass
    const notifications = overdue.map((entry: any) => ({
      id: `NOTIF-BYP-${entry.id}-${Date.now()}`,
      company: entry.company || 'Factory',
      data: JSON.stringify({
        type: 'bypass_sla_breach',
        title: `OVERDUE BYPASS: ${entry.module}`,
        message: `${entry.rule_bypassed} — ${entry.days_open} days old. Record: ${entry.record_id || 'N/A'}. User: ${entry.user_name}.`,
        severity: entry.sla_status === 'critical' ? 'critical' : 'warning',
        bypassId: entry.id,
        module: entry.module,
        daysOpen: entry.days_open,
        createdAt: new Date().toISOString(),
      }),
    }));

    // Try inserting into cross_company_notifications (if table exists)
    const { error: notifError } = await supabase
      .from('cross_company_notifications')
      .upsert(notifications, { onConflict: 'id' });

    if (notifError) {
      console.warn('[bypass-sla-checker] Notification insert failed (table may not exist):', notifError.message);
      // Non-fatal — the overdue detection still ran successfully
    }

    // Log summary
    for (const entry of overdue) {
      console.log(
        `OVERDUE BYPASS: [${entry.module}] — ${entry.rule_bypassed} — ${entry.days_open} days old — User: ${entry.user_name}`
      );
    }

    return new Response(JSON.stringify({
      success: true,
      overdue: overdue.length,
      entries: overdue.map((e: any) => ({
        id: e.id,
        module: e.module,
        rule: e.rule_bypassed,
        daysOpen: e.days_open,
        sla: e.sla_status,
      })),
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[bypass-sla-checker] Fatal error:', err);
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
