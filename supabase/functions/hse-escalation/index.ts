// ═══════════════════════════════════════════════════════════════════════════
// hse-escalation — Supabase Edge Function
// HSE-2 Remediation: automatic escalation on Critical severity incidents
//
// TRIGGERED by: HSEModule.tsx immediately after a Critical incident is saved.
//
// CONTRACT:
//   - Looks up the HSE Manager's contact for the company from user_profiles.
//   - Inserts a record into hse_escalations to track the SLA.
//   - Sends a WhatsApp notification via the existing WABA infrastructure.
//   - If unacknowledged within 30 minutes, a separate cron job re-escalates to CEO.
//     (cron is outside this function's scope — tracked in hse_escalations.sla_deadline)
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/auth.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { incidentId, company, severity, description, location, reportedBy } =
      await req.json() as {
        incidentId: string;
        company: string;
        severity: string;
        description: string;
        location: string;
        reportedBy: string;
      };

    if (!incidentId || !company || severity !== 'Critical') {
      return new Response(
        JSON.stringify({ error: 'incidentId, company, and severity=Critical are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── Find HSE Manager and CEO for this company ────────────────────────
    const { data: hseManagers } = await supabaseAdmin
      .from('user_profiles')
      .select('id, email, phone, full_name, role')
      .eq('company', company)
      .in('role', ['hse_manager', 'manager', 'super_admin'])
      .order('role', { ascending: true })   // hse_manager first
      .limit(3);

    const primaryContact = hseManagers?.[0];
    const now            = new Date();
    const slaDeadline    = new Date(now.getTime() + 30 * 60 * 1000).toISOString(); // +30 min

    // ── Write escalation record ──────────────────────────────────────────
    const { data: escalation, error: escErr } = await supabaseAdmin
      .from('hse_escalations')
      .insert({
        id:              crypto.randomUUID(),
        incident_id:     incidentId,
        company,
        severity,
        escalated_to:    primaryContact?.id ?? null,
        escalated_at:    now.toISOString(),
        sla_deadline:    slaDeadline,
        acknowledged:    false,
        acknowledged_at: null,
      })
      .select()
      .single();

    if (escErr) {
      // Table may not exist yet — log and continue (notification still fires)
      console.warn('[hse-escalation] hse_escalations insert failed:', escErr.message);
    }

    // ── Send WhatsApp alert ──────────────────────────────────────────────
    // Uses the same WABA infrastructure as morning-briefing / report-narrative.
    const wabaToken   = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
    const wabaPhoneId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
    const recipientPhone = primaryContact?.phone;

    let notificationSent = false;
    if (wabaToken && wabaPhoneId && recipientPhone) {
      const messageBody = [
        `🚨 *CRITICAL HSE INCIDENT — ${company}*`,
        ``,
        `📍 *Location:* ${location || 'Not specified'}`,
        `📝 *Description:* ${description?.slice(0, 200) || 'No description'}`,
        `👤 *Reported by:* ${reportedBy || 'System'}`,
        `⏰ *Time:* ${now.toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}`,
        ``,
        `⚠️ Acknowledge within 30 minutes or this escalates to CEO.`,
        ``,
        `Incident ID: ${incidentId}`,
      ].join('\n');

      try {
        const waRes = await fetch(
          `https://graph.facebook.com/v20.0/${wabaPhoneId}/messages`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${wabaToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: recipientPhone.replace(/\D/g, ''),
              type: 'text',
              text: { body: messageBody },
            }),
          }
        );
        notificationSent = waRes.ok;
        if (!waRes.ok) {
          console.warn('[hse-escalation] WhatsApp send failed:', await waRes.text());
        }
      } catch (waErr) {
        console.warn('[hse-escalation] WhatsApp exception:', waErr);
      }
    }

    return new Response(
      JSON.stringify({
        escalationId:     escalation?.id ?? null,
        slaDeadline,
        notificationSent,
        escalatedTo:      primaryContact?.email ?? null,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('[hse-escalation]', msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
