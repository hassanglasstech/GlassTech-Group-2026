// ═══════════════════════════════════════════════════════════════════
// Supabase Edge Function: telegram-bot
//
// TWO MODES:
// 1. Cron (8am PKT = 3am UTC): sends morning briefing
//    Schedule: 0 3 * * *
//
// 2. Webhook (Telegram sends POST here on reply):
//    Set webhook: https://api.telegram.org/bot{TOKEN}/setWebhook?url={FUNCTION_URL}
//
// Env vars needed (Supabase Dashboard → Settings → Edge Functions → Secrets):
//   TELEGRAM_BOT_TOKEN  — from BotFather
//   TELEGRAM_CHAT_ID    — your personal chat ID (get from @userinfobot)
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// Deploy: supabase functions deploy telegram-bot
// ═══════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const CHAT_ID   = Deno.env.get('TELEGRAM_CHAT_ID')!;

async function sendTelegram(text: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id:    CHAT_ID,
      text,
      parse_mode: 'HTML',
    }),
  });
}

async function buildMorningBriefing(supabase: any): Promise<string> {
  const now        = new Date();
  const todayStr   = now.toISOString().split('T')[0];
  const startOfDay = `${todayStr}T00:00:00.000Z`;

  // Urgent open events
  const { data: urgentEvents } = await supabase
    .from('factory_events')
    .select('event_type, sector, created_at')
    .eq('priority', 'Urgent')
    .in('status', ['Open', 'Pending'])
    .order('created_at', { ascending: false })
    .limit(5);

  // Overdue escalations
  const { data: escalations } = await supabase
    .from('factory_escalation_alerts')
    .select('event_type, sector, hours_overdue')
    .eq('resolved', false)
    .limit(5);

  // Open tasks due today or overdue
  const { data: tasks } = await supabase
    .from('agent_tasks')
    .select('title, priority, due_date')
    .in('status', ['Open', 'In Progress'])
    .lte('due_date', todayStr)
    .order('due_date', { ascending: true })
    .limit(5);

  // Unread alerts
  const { count: unreadCount } = await supabase
    .from('agent_alert_history')
    .select('id', { count: 'exact', head: true })
    .eq('read', false);

  // Today's events count
  const { count: todayCount } = await supabase
    .from('factory_events')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', startOfDay);

  let msg = `🌅 <b>GlassTech Morning Briefing</b>\n`;
  msg    += `📅 ${now.toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'short' })}\n\n`;

  msg += `📊 <b>Status</b>\n`;
  msg += `• Today events: ${todayCount ?? 0}\n`;
  msg += `• Unread alerts: ${unreadCount ?? 0}\n\n`;

  if (urgentEvents?.length) {
    msg += `🚨 <b>Urgent Events (${urgentEvents.length})</b>\n`;
    urgentEvents.forEach((e: any) => {
      msg += `• ${e.event_type} — ${e.sector}\n`;
    });
    msg += '\n';
  }

  if (escalations?.length) {
    msg += `⏰ <b>Overdue Escalations (${escalations.length})</b>\n`;
    escalations.forEach((e: any) => {
      msg += `• ${e.event_type} — ${e.hours_overdue}hr\n`;
    });
    msg += '\n';
  }

  if (tasks?.length) {
    msg += `✅ <b>Tasks Due Today (${tasks.length})</b>\n`;
    tasks.forEach((t: any) => {
      msg += `• [${t.priority}] ${t.title}\n`;
    });
    msg += '\n';
  }

  if (!urgentEvents?.length && !escalations?.length && !tasks?.length) {
    msg += `✅ Sab theek hai — koi urgent item nahi.\n\n`;
  }

  msg += `<i>Reply karo: /status /tasks /events /help</i>`;
  return msg;
}

async function handleCommand(cmd: string, supabase: any): Promise<string> {
  const command = cmd.trim().toLowerCase().split(' ')[0];

  if (command === '/help') {
    return `<b>GlassTech Bot Commands</b>\n\n/status — factory summary\n/tasks — open tasks\n/events — today's events\n/urgent — urgent open events\n/help — yeh list`;
  }

  if (command === '/status') {
    return await buildMorningBriefing(supabase);
  }

  if (command === '/tasks') {
    const { data } = await supabase
      .from('agent_tasks')
      .select('title, priority, due_date, status')
      .in('status', ['Open', 'In Progress'])
      .order('due_date', { ascending: true })
      .limit(10);

    if (!data?.length) return '✅ Koi open task nahi.';
    let msg = `<b>Open Tasks (${data.length})</b>\n\n`;
    data.forEach((t: any, i: number) => {
      msg += `${i + 1}. [${t.priority}] ${t.title}`;
      if (t.due_date) msg += ` — ${t.due_date}`;
      msg += '\n';
    });
    return msg;
  }

  if (command === '/events') {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('factory_events')
      .select('event_type, sector, priority, status')
      .gte('created_at', `${today}T00:00:00.000Z`)
      .order('created_at', { ascending: false })
      .limit(10);

    if (!data?.length) return '📭 Aaj koi event nahi.';
    let msg = `<b>Today's Events (${data.length})</b>\n\n`;
    data.forEach((e: any) => {
      msg += `• [${e.priority}] ${e.event_type} — ${e.sector} (${e.status})\n`;
    });
    return msg;
  }

  if (command === '/urgent') {
    const { data } = await supabase
      .from('factory_events')
      .select('event_type, sector, detail, created_at')
      .eq('priority', 'Urgent')
      .in('status', ['Open', 'Pending'])
      .order('created_at', { ascending: false })
      .limit(10);

    if (!data?.length) return '✅ Koi urgent event nahi.';
    let msg = `<b>🚨 Urgent Events (${data.length})</b>\n\n`;
    data.forEach((e: any) => {
      msg += `• ${e.event_type} — ${e.sector}\n  ${e.detail?.slice(0, 60)}\n\n`;
    });
    return msg;
  }

  return `❓ Command samajh nahi aaya. /help likh ke dekhein.`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    // Cron trigger (GET or POST with no body / x-cron header)
    const isCron = req.method === 'GET' || req.headers.get('x-cron') === '1';

    if (isCron) {
      const briefing = await buildMorningBriefing(supabase);
      await sendTelegram(briefing);
      return new Response(JSON.stringify({ sent: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Telegram webhook (POST from Telegram)
    const body = await req.json();
    const message = body?.message;
    if (!message?.text) {
      return new Response('ok', { headers: corsHeaders });
    }

    const reply = await handleCommand(message.text, supabase);
    await sendTelegram(reply);

    return new Response('ok', { headers: corsHeaders });

  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
