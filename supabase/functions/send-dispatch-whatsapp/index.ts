// ═══════════════════════════════════════════════════════════════════
// Supabase Edge Function: send-dispatch-whatsapp              Sprint 12
//
// Sends a "Your truck is on the way" WhatsApp message to the customer
// when a tempering/delivery dispatch is authorized. Includes:
//   - Dispatch ID
//   - Vehicle number + driver name
//   - ETA (caller-supplied)
//   - Live tracking link (the public driver screen)
//
// POST body: {
//   dispatch_id:     string;
//   customer_name:   string;
//   customer_phone:  string;     // E.164
//   eta?:            string;     // human-readable e.g. "2:30 PM"
//   tracking_url?:   string;     // overrides the default constructed URL
// }
//
// Response: { ok: true, message_id }
//
// Secrets needed: WA_PHONE_NUMBER_ID, WA_ACCESS_TOKEN, SITE_URL
//
// Deploy: supabase functions deploy send-dispatch-whatsapp
// ═══════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAuth, corsHeaders } from '../_shared/auth.ts';

interface RequestBody {
  dispatch_id?:    string;
  customer_name?:  string;
  customer_phone?: string;
  eta?:            string;
  tracking_url?:   string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  let body: RequestBody = {};
  try { body = await req.json(); } catch { /* validation below */ }

  const dispatchId    = body.dispatch_id?.trim();
  const customerName  = body.customer_name?.trim();
  const customerPhone = body.customer_phone?.trim();
  const eta           = body.eta?.trim();

  if (!dispatchId || !customerName || !customerPhone) {
    return new Response(
      JSON.stringify({ error: 'dispatch_id, customer_name, customer_phone required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const phoneNumberId = Deno.env.get('WA_PHONE_NUMBER_ID');
  const accessToken   = Deno.env.get('WA_ACCESS_TOKEN');
  const siteUrl       = Deno.env.get('SITE_URL') ?? 'https://glasstech-erp.vercel.app';

  if (!phoneNumberId || !accessToken) {
    return new Response(
      JSON.stringify({ error: 'WhatsApp secrets not configured (WA_PHONE_NUMBER_ID, WA_ACCESS_TOKEN)' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // Fetch driver token + vehicle info from the dispatch row
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const { data: dispatch } = await supabase
    .from('tempering_dispatches')
    .select('id, driver_token, vehicle_invoice_no, data')
    .eq('id', dispatchId)
    .single();

  type DispatchData = { vehicleNo?: string; driverName?: string; plantName?: string };
  const dispatchData = (dispatch as { data?: DispatchData } | null)?.data ?? {};
  const vehicleNo  = dispatchData.vehicleNo  ?? '—';
  const driverName = dispatchData.driverName ?? '—';
  const driverToken = (dispatch as { driver_token?: string } | null)?.driver_token ?? '';

  const trackingUrl = body.tracking_url
    ?? `${siteUrl}/#/driver/${dispatchId}${driverToken ? `?t=${driverToken}` : ''}`;

  const message =
    `🚛 *GlassTech Delivery Update*\n\n` +
    `Dear ${customerName},\n\n` +
    `Your order *${dispatchId}* is on the way.\n\n` +
    `🚚 Vehicle: ${vehicleNo}\n` +
    `👤 Driver: ${driverName}\n` +
    (eta ? `⏰ ETA: ${eta}\n` : '') +
    `\n📍 Track here:\n${trackingUrl}\n\n` +
    `On arrival, you'll receive an OTP — share it with the driver to confirm delivery.\n\n` +
    `Thank you for choosing GlassTech.`;

  const toNum = customerPhone.replace(/^\+/, '');

  try {
    const r = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toNum,
        type: 'text',
        text: { body: message },
      }),
    });

    const json = await r.json().catch(() => ({} as Record<string, unknown>));
    if (!r.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: 'whatsapp_send_failed', detail: json }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    type WhatsAppResponse = { messages?: Array<{ id: string }> };
    const messageId = (json as WhatsAppResponse).messages?.[0]?.id;

    return new Response(
      JSON.stringify({ ok: true, message_id: messageId, tracking_url: trackingUrl }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
