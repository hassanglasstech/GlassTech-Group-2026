import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAuth, corsHeaders } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // ── Auth gate ─────────────────────────────────────────────────────
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  try {
    const now = new Date(); const todayStr = now.toISOString().split('T')[0]; const startOfDay = `${todayStr}T00:00:00.000Z`;
    const [{ data: events }, { data: escl }, { data: hse }, { data: tasks }, { data: preds }] = await Promise.all([
      supabase.from('factory_events').select('event_type,sector,priority,status').gte('created_at', startOfDay),
      supabase.from('factory_escalation_alerts').select('event_type,hours_overdue').eq('resolved', false),
      supabase.from('hse_incidents').select('severity,category').eq('closed', false).gte('created_at', startOfDay),
      supabase.from('agent_tasks').select('title,priority').in('status', ['Open','In Progress']).lte('due_date', todayStr),
      supabase.from('predictive_alerts').select('title,severity').eq('actioned', false).eq('dismissed', false).limit(3),
    ]);
    const ev = events || []; const urgent = ev.filter((e: any) => e.priority === 'Urgent'); const resolved = ev.filter((e: any) => e.status === 'Resolved' || e.status === 'Closed');
    const summary = `Date: ${now.toLocaleDateString('en-PK',{weekday:'long',day:'numeric',month:'long'})}\nEvents: ${ev.length} total, ${urgent.length} urgent, ${resolved.length} resolved\nUrgent: ${urgent.map((e: any) => `${e.event_type}(${e.sector})`).join(', ') || 'none'}\nEscalations: ${(escl||[]).length}\nHSE: ${(hse||[]).length}\nTasks due: ${(tasks||[]).length}\nAI alerts: ${(preds||[]).map((p: any) => p.title).join(', ') || 'none'}`;
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 450, system: 'You are GlassTech factory report writer. Write 2-3 paragraph professional narrative in English/Roman-Urdu. Plain paragraphs only, no markdown.', messages: [{ role: 'user', content: `Write today narrative:\n${summary}` }] }) });
    const d = await r.json(); const narrative = d.content?.[0]?.text || 'Generation failed.';
    const html = `<div style="background:#f0f9ff;border-left:4px solid #2563eb;padding:18px 22px;margin:16px 0;border-radius:0 8px 8px 0"><div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:10px">AI Narrative Summary</div><div style="font-size:13px;color:#1e293b;line-height:1.75">${narrative.replace(/\n\n/g,'</div><div style="font-size:13px;color:#1e293b;line-height:1.75;margin-top:10px">').replace(/\n/g,'<br>')}</div></div>`;
    const { data: existing } = await supabase.from('daily_reports').select('id,html_content').eq('report_date', todayStr).single();
    if (existing) { await supabase.from('daily_reports').update({ html_content: existing.html_content.replace('<div class="section">', html + '<div class="section">') }).eq('report_date', todayStr); }
    else { await supabase.from('daily_reports').upsert({ report_date: todayStr, html_content: `<!DOCTYPE html><html><body style="font-family:Arial;padding:24px">${html}</body></html>`, event_count: ev.length, urgent_count: urgent.length, open_count: ev.length - resolved.length, created_at: now.toISOString() }, { onConflict: 'report_date' }); }
    return new Response(JSON.stringify({ success: true, chars: narrative.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) { return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
});
