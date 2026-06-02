// ═══════════════════════════════════════════════════════════════════
// Supabase Edge Function: generate-delivery-otp                Sprint 12
//
// Generates a 6-digit OTP for proof-of-delivery, stores SHA-256 hash in
// delivery_otps, and dispatches the plaintext to the customer via SMS
// or WhatsApp. Driver enters the OTP on his /driver/:tripId screen to
// prove customer-side handover.
//
// POST body: {
//   dispatch_id:    string;
//   customer_phone: string;     // E.164 e.g. +923001234567
//   channel?:       'sms' | 'whatsapp'  (default 'whatsapp')
//   ttl_minutes?:   number      // default 10
// }
//
// Response: { ok: true, expires_at }   (plaintext OTP NEVER returned)
//
// Secrets needed:
//   SUPABASE_SERVICE_ROLE_KEY  — server-side DB writes
//   WA_PHONE_NUMBER_ID, WA_ACCESS_TOKEN  — WhatsApp sender (reuses
//                                          whatsapp-notify config)
//   SMS_API_KEY, SMS_API_URL   — optional SMS fallback (LMK / Saysol)
//
// Deploy:  supabase functions deploy generate-delivery-otp
// ═══════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAuth, corsHeaders } from '../_shared/auth.ts';

interface RequestBody {
  dispatch_id?:     string;
  customer_phone?:  string;
  channel?:         'sms' | 'whatsapp';
  ttl_minutes?:     number;
}

// SHA-256 hex
async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf  = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function generate6DigitOtp(): string {
  // 000000 – 999999, zero-padded
  const n = Math.floor(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000);
  return n.toString().padStart(6, '0');
}

async function sendViaWhatsApp(to: string, otp: string, dispatchId: string): Promise<{ ok: boolean; error?: string }> {
  const phoneNumberId = Deno.env.get('WA_PHONE_NUMBER_ID');
  const accessToken   = Deno.env.get('WA_ACCESS_TOKEN');
  if (!phoneNumberId || !accessToken) {
    return { ok: false, error: 'WhatsApp secrets not configured' };
  }

  // Strip leading + for Meta API
  const toNum = to.replace(/^\+/, '');
  const message = `🔐 GlassTech Delivery OTP: ${otp}\n\nGive this code to the driver to confirm receipt of your order ${dispatchId}.\n\nValid for 10 minutes.`;

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
    const json = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: JSON.stringify(json) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function sendViaSms(to: string, otp: string, dispatchId: string): Promise<{ ok: boolean; error?: string }> {
  const apiUrl = Deno.env.get('SMS_API_URL');
  const apiKey = Deno.env.get('SMS_API_KEY');
  if (!apiUrl || !apiKey) {
    return { ok: false, error: 'SMS secrets not configured' };
  }

  const message = `GlassTech OTP: ${otp} for delivery ${dispatchId}. Valid 10 min.`;

  try {
    const r = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to, message }),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      return { ok: false, error: txt || `SMS send failed (HTTP ${r.status})` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Auth — driver app may call with anon key + dispatch token; for OTP
  // generation we require dispatcher auth (regular user JWT or service key)
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  let body: RequestBody = {};
  try { body = await req.json(); } catch { /* empty body OK -> validation below catches */ }

  const dispatchId    = body.dispatch_id?.trim();
  const customerPhone = body.customer_phone?.trim();
  const channel       = body.channel ?? 'whatsapp';
  const ttlMinutes    = Math.max(1, Math.min(60, body.ttl_minutes ?? 10));

  if (!dispatchId || !customerPhone) {
    return new Response(
      JSON.stringify({ error: 'dispatch_id and customer_phone required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  // Look up dispatch — must exist and have a company
  const { data: dispatch, error: dErr } = await supabase
    .from('tempering_dispatches')
    .select('id, company, data')
    .eq('id', dispatchId)
    .single();

  if (dErr || !dispatch) {
    return new Response(
      JSON.stringify({ error: 'dispatch_not_found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // Generate + hash OTP
  const otp      = generate6DigitOtp();
  const otpHash  = await sha256Hex(otp);
  const expires  = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
  const company  = (dispatch as { company?: string; data?: { company?: string } }).company
                ?? (dispatch as { data?: { company?: string } }).data?.company
                ?? 'Glassco';

  // Insert row (server-side — SHA-256 only, plaintext never stored)
  const { error: insErr } = await supabase.from('delivery_otps').insert({
    dispatch_id:    dispatchId,
    company,
    customer_phone: customerPhone,
    otp_hash:       otpHash,
    expires_at:     expires,
  });

  if (insErr) {
    return new Response(
      JSON.stringify({ error: 'otp_persist_failed', detail: insErr.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // Dispatch the plaintext OTP to the customer
  const send = channel === 'sms'
    ? await sendViaSms(customerPhone, otp, dispatchId)
    : await sendViaWhatsApp(customerPhone, otp, dispatchId);

  if (!send.ok) {
    // Don't 500 — the OTP row exists; surface the channel error
    return new Response(
      JSON.stringify({
        ok:           false,
        otp_persisted: true,
        expires_at:   expires,
        channel,
        channel_error: send.error,
      }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  return new Response(
    JSON.stringify({ ok: true, expires_at: expires, channel }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
