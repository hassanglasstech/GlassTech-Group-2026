import { supabase } from '@/src/services/supabaseClient';

// ── Log a decision ────────────────────────────────────────────────────
export const logDecision = async (params: {
  type:          string;
  entityId?:     string;
  entityType?:   string;
  entityLabel?:  string;
  decision:      string;
  context?:      Record<string, any>;
  agentSuggested?: string;
  overrodeAgent?:  boolean;
  createdBy?:    string;
  notifiedAt?:   Date;
}) => {
  const now = new Date();
  await supabase.from('decision_log').insert({
    decision_type:  params.type,
    entity_id:      params.entityId || null,
    entity_type:    params.entityType || null,
    entity_label:   params.entityLabel || null,
    decision:       params.decision,
    context:        params.context || {},
    hour_of_day:    now.getHours(),
    day_of_week:    now.getDay(),
    time_to_decide: params.notifiedAt ? Math.round((now.getTime() - params.notifiedAt.getTime()) / 1000) : null,
    agent_suggested: params.agentSuggested || null,
    overrode_agent:  params.overrodeAgent || false,
    created_by:      params.createdBy || 'Hassan',
    created_at:      now.toISOString(),
  });
};

// ── Analyze decision patterns ─────────────────────────────────────────
export const analyzeDecisionPatterns = async (): Promise<{
  timePattern:    { bestHour: number; worstHour: number; insight: string };
  speedPattern:   { avgSeconds: number; fastCategories: string[]; slowCategories: string[] };
  overrideRate:   number;
  totalDecisions: number;
  insights:       string[];
}> => {
  const { data: decisions } = await supabase
    .from('decision_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (!decisions || decisions.length === 0) {
    return { timePattern: { bestHour: 9, worstHour: 15, insight: 'Not enough data yet' }, speedPattern: { avgSeconds: 0, fastCategories: [], slowCategories: [] }, overrideRate: 0, totalDecisions: 0, insights: ['Decisions log ho rahi hain — patterns baad mein dikhenge'] };
  }

  // Time pattern
  const hourApprovals: Record<number, { approved: number; total: number }> = {};
  decisions.forEach(d => {
    const h = d.hour_of_day;
    if (!hourApprovals[h]) hourApprovals[h] = { approved: 0, total: 0 };
    hourApprovals[h].total++;
    if (d.decision === 'approved') hourApprovals[h].approved++;
  });

  let bestHour = 9, worstHour = 15, bestRate = 0, worstRate = 1;
  Object.entries(hourApprovals).forEach(([hour, data]) => {
    if (data.total >= 3) {
      const rate = data.approved / data.total;
      if (rate > bestRate)  { bestRate = rate;  bestHour = Number(hour); }
      if (rate < worstRate) { worstRate = rate; worstHour = Number(hour); }
    }
  });

  // Speed pattern
  const withTime = decisions.filter(d => d.time_to_decide > 0);
  const avgSeconds = withTime.length > 0
    ? Math.round(withTime.reduce((s, d) => s + d.time_to_decide, 0) / withTime.length)
    : 0;

  const catSpeed: Record<string, number[]> = {};
  withTime.forEach(d => {
    if (!catSpeed[d.decision_type]) catSpeed[d.decision_type] = [];
    catSpeed[d.decision_type].push(d.time_to_decide);
  });
  const catAvg = Object.entries(catSpeed).map(([cat, times]) => ({
    cat, avg: times.reduce((s, t) => s + t, 0) / times.length
  })).sort((a, b) => a.avg - b.avg);

  const fastCategories = catAvg.slice(0, 2).map(c => c.cat);
  const slowCategories = catAvg.slice(-2).map(c => c.cat);

  // Override rate
  const overrides    = decisions.filter(d => d.overrode_agent).length;
  const overrideRate = Math.round((overrides / decisions.length) * 100);

  // Natural language insights
  const insights: string[] = [];
  if (bestHour !== worstHour) insights.push(`Tumhara best decision time ${bestHour}:00-${bestHour + 1}:00 hai — approval rate ${Math.round(bestRate * 100)}%`);
  if (avgSeconds > 0) insights.push(`Average decision time: ${avgSeconds > 3600 ? Math.round(avgSeconds / 3600) + ' hours' : avgSeconds > 60 ? Math.round(avgSeconds / 60) + ' min' : avgSeconds + ' sec'}`);
  if (overrideRate > 30) insights.push(`Tum ${overrideRate}% baar agent se disagree karte ho — agent ko calibrate karna chahiye`);
  if (overrideRate < 10 && decisions.length > 20) insights.push(`Agent accuracy high hai — ${100 - overrideRate}% suggestions accept ho rahi hain`);

  return { timePattern: { bestHour, worstHour, insight: insights[0] || '' }, speedPattern: { avgSeconds, fastCategories, slowCategories }, overrideRate, totalDecisions: decisions.length, insights };
};

// ── Org memory helpers ────────────────────────────────────────────────
export const addOrgMemory = async (params: {
  category:   string;
  title:      string;
  content:    string;
  entities?:  Record<string, any>;
  tags?:      string[];
  importance?: string;
  source?:    string;
  createdBy?: string;
}) => {
  await supabase.from('org_memory').insert({
    category:   params.category,
    title:      params.title,
    content:    params.content,
    entities:   params.entities || {},
    tags:       params.tags || [],
    importance: params.importance || 'medium',
    source:     params.source || 'manual',
    created_by: params.createdBy || 'Hassan',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
};

export const searchOrgMemory = async (query: string, category?: string): Promise<any[]> => {
  let q = supabase.from('org_memory').select('*').ilike('content', `%${query}%`);
  if (category) q = q.eq('category', category);
  const { data } = await q.order('importance').limit(10);
  return data || [];
};

// ── Log uncomfortable truth ───────────────────────────────────────────
export const logUncomfortableTruth = async (params: {
  category:     string;
  title:        string;
  finding:      string;
  dataEvidence: Record<string, any>;
  severity:     string;
}) => {
  // Check if already exists (avoid duplicates)
  const { data: existing } = await supabase
    .from('uncomfortable_truths')
    .select('id')
    .eq('title', params.title)
    .eq('acknowledged', false)
    .limit(1);

  if (existing && existing.length > 0) return;

  await supabase.from('uncomfortable_truths').insert({
    category:     params.category,
    title:        params.title,
    finding:      params.finding,
    data_evidence: params.dataEvidence,
    severity:     params.severity,
    acknowledged: false,
    created_at:   new Date().toISOString(),
  });
};
