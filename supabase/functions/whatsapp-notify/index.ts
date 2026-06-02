// ═══════════════════════════════════════════════════════════════════
// Supabase Edge Function: whatsapp-notify
// Sends WhatsApp messages via WhatsApp Business Cloud API (Meta)
//
// Setup:
// 1. Meta Developer Account → Create App → WhatsApp product
// 2. Get Phone Number ID and Access Token
// 3. Add secrets in Supabase:
//    WA_PHONE_NUMBER_ID  — your WhatsApp Business phone number ID
//    WA_ACCESS_TOKEN     — permanent token from Meta
//    WA_TO_NUMBER        — Hassan's WhatsApp number e.g. 923001234567
//
// Deploy: supabase functions deploy whatsapp-notify
//
// Can be called from other functions (daily-report, escalation, etc.)
// POST body: { message: "text", type: "alert|report|task" }
// ═══════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAuth, corsHeaders } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // ── Auth gate (accepts service role key from internal callers) ────
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const phoneNumberId = Deno.env.get('WA_PHONE_NUMBER_ID');
  const accessToken   = Deno.env.get('WA_ACCESS_TOKEN');
  const toNumber      = Deno.env.get('WA_TO_NUMBER');

  if (!phoneNumberId || !accessToken || !toNumber) {
    return new Response(JSON.stringify({
      error: 'WhatsApp secrets not configured. Add WA_PHONE_NUMBER_ID, WA_ACCESS_TOKEN, WA_TO_NUMBER in Supabase secrets.'
    }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const message  = body.message  || '';
    const type     = body.type     || 'alert';
    const priority = body.priority || 'Normal';

    if (!message) {
      return new Response(JSON.stringify({ error: 'message required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Prefix emoji based on type/priority
    const prefix =
      priority === 'Urgent' || priority === 'Critical' ? '🚨 ' :
      type === 'report'  ? '📋 ' :
      type === 'task'    ? '✅ ' :
      type === 'predict' ? '🔮 ' : '🏭 ';

    const finalMessage = `${prefix}*GlassTech ERP*\n\n${message}`;

    // Call WhatsApp Cloud API
    const waRes = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type:    'individual',
          to:                toNumber,
          type:              'text',
          text: { body: finalMessage },
        }),
      }
    );

    const waData = await waRes.json();

    if (!waRes.ok) {
      return new Response(JSON.stringify({ error: waData }), {
        status: waRes.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Log to Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    await supabase.from('whatsapp_log').insert({
      message:    finalMessage.slice(0, 500),
      type,
      priority,
      wa_msg_id:  waData.messages?.[0]?.id,
      sent_to:    toNumber,
      status:     'sent',
      created_at: new Date().toISOString(),
    }).catch(() => {}); // silently fail if table doesn't exist

    return new Response(
      JSON.stringify({ success: true, message_id: waData.messages?.[0]?.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
