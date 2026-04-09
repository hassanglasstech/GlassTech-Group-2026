// ═══════════════════════════════════════════════════════════════════
// Supabase Edge Function: whatsapp-intelligence
// Receives messages from WhatsApp bridge, classifies intent,
// triggers ERP actions, creates approvals for medium-confidence items
//
// Deploy: supabase functions deploy whatsapp-intelligence
// ═══════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/auth.ts';

// ── HMAC-SHA256 helper ────────────────────────────────────────────
async function verifyWhatsAppSignature(rawBody: string, signatureHeader: string | null, secret: string): Promise<boolean> {
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const expected = signatureHeader.slice(7);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return hex === expected;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // ── H-3: Strict HMAC-SHA256 verification using Meta App Secret ──────
  // WHATSAPP_APP_SECRET is the App Secret from Meta App Dashboard → Settings.
  // This is NOT the webhook verification token — it is the secret used by Meta
  // to sign every webhook payload with HMAC-SHA256 in the x-hub-signature-256 header.
  // We read the raw body BEFORE parsing JSON so the signature covers the exact bytes.
  const rawBody   = await req.text();
  const appSecret = Deno.env.get('WHATSAPP_APP_SECRET');

  if (!appSecret) {
    // Fail closed: refuse ALL requests if the secret is not configured.
    // A missing secret is a deployment configuration error, not a client error.
    return new Response(JSON.stringify({ error: 'WHATSAPP_APP_SECRET is not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const sigHeader = req.headers.get('x-hub-signature-256');
  const valid = await verifyWhatsAppSignature(rawBody, sigHeader, appSecret);
  if (!valid) {
    return new Response(JSON.stringify({ error: 'Invalid HMAC-SHA256 signature — request rejected' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase       = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const anthropicKey   = Deno.env.get('ANTHROPIC_API_KEY')!;

  try {
    const body = JSON.parse(rawBody);
    const { sender, sender_name, group_name, message_type, raw_message, media_base64, media_type } = body;

    let transcription = raw_message;

    // ── Transcribe voice note if present ─────────────────────────
    if (message_type === 'voice' && media_base64 && Deno.env.get('OPENAI_API_KEY')) {
      try {
        const blob = await fetch(`data:${media_type};base64,${media_base64}`).then(r => r.blob());
        const form = new FormData();
        form.append('file', blob, 'audio.ogg');
        form.append('model', 'whisper-1');
        form.append('language', 'ur');

        const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}` },
          body: form,
        });
        const whisperData = await whisperRes.json();
        transcription = whisperData.text || raw_message;
      } catch {
        transcription = raw_message;
      }
    }

    // ── Load vocabulary for context ───────────────────────────────
    const { data: vocab } = await supabase.from('agent_vocabulary').select('phrase, meaning, erp_action').limit(30);
    const vocabContext = (vocab || []).map((v: any) => `"${v.phrase}" = ${v.meaning}${v.erp_action ? ` → ${v.erp_action}` : ''}`).join('\n');

    // ── Classify with Claude ──────────────────────────────────────
    const classifyRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: `You are GlassTech ERP message classifier. Classify WhatsApp messages from factory workers and market contacts.

GlassTech vocabulary:
${vocabContext}

Respond ONLY with JSON:
{
  "intent": "attendance|dispatch|factory_event|market_intel|payment|hr_complaint|maintenance|unknown",
  "confidence": 0-100,
  "summary": "one line English summary of what happened",
  "erp_action": "log_factory_event|update_event_status|market_intel_log|null",
  "auto_execute": true/false,
  "params": {}
}

auto_execute = true only if confidence >= 85 AND action is low-risk (attendance, event log).
auto_execute = false for payments, HR complaints, market intel (needs human review).`,
        messages: [{ role: 'user', content: `From: ${sender_name}${group_name ? ` (${group_name})` : ''}\nMessage: ${transcription}` }],
      }),
    });

    const classifyData = await classifyRes.json();
    let classification: any = {};

    try {
      const text = classifyData.content?.[0]?.text || '{}';
      classification = JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch {
      classification = { intent: 'unknown', confidence: 0, summary: transcription, erp_action: null, auto_execute: false };
    }

    const { intent, confidence, summary, erp_action, auto_execute, params } = classification;

    // ── Log to inbox ──────────────────────────────────────────────
    const { data: logEntry } = await supabase.from('whatsapp_inbox_log').insert({
      sender, sender_name,
      group_name:    group_name || null,
      message_type,
      raw_message,
      transcription: message_type === 'voice' ? transcription : null,
      intent:        intent || 'unknown',
      confidence:    confidence || 0,
      agent_summary: summary || transcription,
      erp_action:    erp_action || null,
      status:        'processed',
      created_at:    new Date().toISOString(),
    }).select('id').single();

    // ── Auto-execute high confidence low-risk actions ─────────────
    if (auto_execute && erp_action && confidence >= 85) {
      if (erp_action === 'log_factory_event' && params?.sector) {
        await supabase.from('factory_events').insert({
          sector:     params.sector || 'Production',
          event_type: params.event_type || intent,
          detail:     summary,
          priority:   params.priority || 'Medium',
          status:     'Open',
          logged_by:  `WhatsApp: ${sender_name}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
      if (logEntry?.id) {
        await supabase.from('whatsapp_inbox_log').update({ status: 'actioned' }).eq('id', logEntry.id);
      }
    }

    // ── Create approval task for medium confidence / important items ─
    else if (confidence >= 50 && erp_action && erp_action !== 'null') {
      await supabase.from('agent_tasks').insert({
        title:       `[WhatsApp] ${summary}`,
        description: `From: ${sender_name}${group_name ? ` via ${group_name}` : ''}\nOriginal: ${transcription}\nIntent: ${intent} (${confidence}% confidence)`,
        priority:    confidence >= 70 ? 'High' : 'Medium',
        status:      'Open',
        created_by:  'WhatsApp Agent',
        created_at:  new Date().toISOString(),
        updated_at:  new Date().toISOString(),
      });
      if (logEntry?.id) {
        await supabase.from('whatsapp_inbox_log').update({ status: 'forwarded' }).eq('id', logEntry.id);
      }
    }

    // ── Update vocabulary if new phrase learned ───────────────────
    if (confidence >= 70 && intent !== 'unknown') {
      const words = transcription.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
      for (const word of words.slice(0, 3)) {
        await supabase.from('agent_vocabulary').upsert({
          phrase:      word,
          meaning:     `${intent} context`,
          usage_count: 1,
          updated_at:  new Date().toISOString(),
        }, { onConflict: 'phrase', ignoreDuplicates: false }).then(async () => {
          await supabase.from('agent_vocabulary').rpc || null;
        }).catch(() => {});
      }
    }

    return new Response(
      JSON.stringify({ intent, confidence, summary, auto_executed: auto_execute && confidence >= 85 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
