// supabase functions deploy profit-share-calculator
// Schedule: 0 9 24 * *  (9am on 24th of every month)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAuth, corsHeaders } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // ── Auth gate ─────────────────────────────────────────────────────
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    const month = new Date().toISOString().slice(0, 7);
    const { data: kpiData } = await supabase.from('worker_kpi').select('employee_id, efficiency_score').eq('month', month);
    if (!kpiData || kpiData.length === 0) return new Response(JSON.stringify({ message: 'No KPI data' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const baselineKPI  = 84;
    const avgKPI       = kpiData.reduce((s: number, k: any) => s + (k.efficiency_score || 0), 0) / kpiData.length;
    const improvement  = Math.max(0, avgKPI - baselineKPI);

    if (improvement < 2) return new Response(JSON.stringify({ message: 'Improvement below threshold' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const extraProfit = Math.round(improvement * 50000);
    const bonusPool   = Math.round(extraProfit * 0.10);
    const perPerson   = Math.round(bonusPool / kpiData.length / 100) * 100;

    // Create agent task for owner approval
    await supabase.from('agent_tasks').insert({
      title:       `[Profit Share] ${month} — PKR ${bonusPool.toLocaleString()} bonus pool ready`,
      description: `Cutting team efficiency: ${Math.round(avgKPI)}% (baseline: ${baselineKPI}%). Extra profit: PKR ${extraProfit.toLocaleString()}. ${kpiData.length} cutters × PKR ${perPerson.toLocaleString()} each. ERP → Compensation Justice → Profit Share tab mein approve karo.`,
      priority:    'High',
      status:      'Open',
      created_by:  'Profit Share Agent',
      created_at:  new Date().toISOString(),
      updated_at:  new Date().toISOString(),
    });

    // WhatsApp notification if configured
    const waUrl = Deno.env.get('SUPABASE_URL') + '/functions/v1/whatsapp-notify';
    await fetch(waUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `🏆 *Profit Share Alert — ${month}*\n\nCutting team ne ${Math.round(avgKPI)}% efficiency achieve ki (baseline ${baselineKPI}%).\n\nBonus Pool: PKR ${bonusPool.toLocaleString()}\nPer cutter: PKR ${perPerson.toLocaleString()}\n\nERP mein approve karo ✅`,
        type: 'report', priority: 'Normal',
      }),
    }).catch(() => {});

    return new Response(JSON.stringify({ triggered: true, bonus_pool: bonusPool, per_person: perPerson }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
