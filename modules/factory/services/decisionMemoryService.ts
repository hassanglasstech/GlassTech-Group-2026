// ═══════════════════════════════════════════════════════════════════
// Decision Memory Service — Three-Layer Agent Memory
// Layer 1: Episodic (what happened) — every decision + outcome
// Layer 2: Semantic (what it means) — extracted facts/patterns
// Layer 3: Procedural (what to do) — rules that guide decisions
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/src/services/supabaseClient';

// ── Types ────────────────────────────────────────────────────────────
export interface EpisodicMemory {
  decision_id:      string;
  agent_type:       'finance' | 'production' | 'ops';
  decision_type:    string;
  context_snapshot: Record<string, any>;
  decision_made:    'APPROVE' | 'REJECT' | 'APPROVE_WITH_CONDITIONS' | 'ESCALATE' | 'DEFER';
  reasoning:        string;
  conditions:       string[];
  confidence_score: number;
  outcome?:         string;
  outcome_value?:   number;
  outcome_date?:    string;
  owner_feedback?:  'confirmed' | 'overridden' | 'amended';
  override_reason?: string;
}

export interface SemanticFact {
  fact_id:              string;
  agent_type:           string;
  fact_category:        string;
  fact_statement:       string;
  confidence:           number;
  supporting_decisions: string[];
  evidence_count:       number;
  invalidated:          boolean;
}

export interface ProceduralRule {
  rule_id:        string;
  agent_type:     string;
  rule_type:      'hard_rule' | 'soft_rule' | 'guideline';
  condition_text: string;
  action_text:    string;
  priority:       number;
  override_count: number;
  follow_count:   number;
  success_rate:   number;
  active:         boolean;
}

// ═══ EPISODIC MEMORY ═════════════════════════════════════════════════

export const saveDecision = async (memory: EpisodicMemory): Promise<void> => {
  await supabase.from('agent_episodic_memory').insert({
    decision_id:      memory.decision_id,
    agent_type:       memory.agent_type,
    decision_type:    memory.decision_type,
    context_snapshot: memory.context_snapshot,
    decision_made:    memory.decision_made,
    reasoning:        memory.reasoning,
    conditions:       memory.conditions,
    confidence_score: memory.confidence_score,
    created_at:       new Date().toISOString(),
  }).then(undefined, () => {});
};

export const recordOutcome = async (
  decisionId: string,
  outcome: string,
  outcomeValue?: number
): Promise<void> => {
  await supabase.from('agent_episodic_memory').update({
    outcome,
    outcome_value: outcomeValue ?? null,
    outcome_date:  new Date().toISOString(),
  }).eq('decision_id', decisionId).then(undefined, () => {});
};

export const recordFeedback = async (
  decisionId: string,
  feedback: 'confirmed' | 'overridden' | 'amended',
  overrideReason?: string
): Promise<void> => {
  await supabase.from('agent_episodic_memory').update({
    owner_feedback:  feedback,
    override_reason: overrideReason ?? null,
  }).eq('decision_id', decisionId).then(undefined, () => {});
};

export const getSimilarDecisions = async (
  agentType: string,
  decisionType: string,
  limit = 10
): Promise<EpisodicMemory[]> => {
  const { data } = await supabase
    .from('agent_episodic_memory')
    .select('*')
    .eq('agent_type', agentType)
    .eq('decision_type', decisionType)
    .not('outcome', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data || []) as EpisodicMemory[];
};

export const getDecisionAccuracy = async (
  agentType: string,
  decisionType: string
): Promise<{ total: number; correct: number; accuracy: number }> => {
  const decisions = await getSimilarDecisions(agentType, decisionType, 50);
  const withOutcome = decisions.filter(d => d.outcome);
  const correct = withOutcome.filter(d =>
    d.owner_feedback === 'confirmed' ||
    ['success', 'paid'].includes(d.outcome || '')
  ).length;
  const total = withOutcome.length;
  return { total, correct, accuracy: total > 0 ? correct / total : 0.5 };
};

// ═══ SEMANTIC MEMORY ═════════════════════════════════════════════════

export const saveFact = async (fact: Omit<SemanticFact, 'invalidated'>): Promise<void> => {
  await supabase.from('agent_semantic_memory').upsert({
    fact_id:              fact.fact_id,
    agent_type:           fact.agent_type,
    fact_category:        fact.fact_category,
    fact_statement:       fact.fact_statement,
    confidence:           fact.confidence,
    supporting_decisions: fact.supporting_decisions,
    evidence_count:       fact.evidence_count,
    invalidated:          false,
    updated_at:           new Date().toISOString(),
  }, { onConflict: 'fact_id' }).then(undefined, () => {});
};

export const getRelevantFacts = async (
  agentType: string,
  category?: string,
  limit = 10
): Promise<SemanticFact[]> => {
  let query = supabase
    .from('agent_semantic_memory')
    .select('*')
    .eq('agent_type', agentType)
    .eq('invalidated', false)
    .order('confidence', { ascending: false })
    .limit(limit);
  if (category) query = query.eq('fact_category', category);
  const { data } = await query;
  return (data || []) as SemanticFact[];
};

export const searchFacts = async (
  agentType: string,
  searchTerm: string
): Promise<SemanticFact[]> => {
  const { data } = await supabase
    .from('agent_semantic_memory')
    .select('*')
    .eq('agent_type', agentType)
    .eq('invalidated', false)
    .ilike('fact_statement', `%${searchTerm}%`)
    .limit(5);
  return (data || []) as SemanticFact[];
};

// Auto-extract semantic facts from episodic patterns
export const extractSemanticFacts = async (
  agentType: string,
  decisionType: string,
  contextKey: string // e.g., 'client_name'
): Promise<void> => {
  const decisions = await getSimilarDecisions(agentType, decisionType, 30);
  if (decisions.length < 10) return; // Need minimum 10 decisions

  // Group by context key value
  const groups: Record<string, { decisions: EpisodicMemory[]; goodCount: number; totalCount: number }> = {};
  for (const d of decisions) {
    const key = d.context_snapshot?.[contextKey];
    if (!key) continue;
    if (!groups[key]) groups[key] = { decisions: [], goodCount: 0, totalCount: 0 };
    groups[key].decisions.push(d);
    groups[key].totalCount++;
    if (['success', 'paid'].includes(d.outcome || '') || d.owner_feedback === 'confirmed') {
      groups[key].goodCount++;
    }
  }

  // Extract facts for entities with 3+ decisions
  for (const [entity, group] of Object.entries(groups)) {
    if (group.totalCount < 3) continue;

    const rate = group.goodCount / group.totalCount;
    const statement = rate >= 0.7
      ? `${entity} — reliable (${Math.round(rate * 100)}% success rate over ${group.totalCount} decisions)`
      : rate <= 0.3
        ? `${entity} — high risk (${Math.round((1 - rate) * 100)}% failure rate over ${group.totalCount} decisions)`
        : `${entity} — mixed results (${Math.round(rate * 100)}% success over ${group.totalCount} decisions)`;

    const category = contextKey.includes('client') ? 'client_behavior'
      : contextKey.includes('vendor') ? 'vendor_reliability'
      : 'operational';

    await saveFact({
      fact_id:              `SF-${agentType}-${contextKey}-${entity.replace(/\s+/g, '-').slice(0, 30)}`,
      agent_type:           agentType,
      fact_category:        category,
      fact_statement:       statement,
      confidence:           Math.min(0.95, 0.5 + (group.totalCount * 0.03)),
      supporting_decisions: group.decisions.map(d => d.decision_id),
      evidence_count:       group.totalCount,
    });
  }
};

// ═══ PROCEDURAL MEMORY ═══════════════════════════════════════════════

export const getActiveRules = async (
  agentType: string,
  ruleType?: string
): Promise<ProceduralRule[]> => {
  let query = supabase
    .from('agent_procedural_memory')
    .select('*')
    .eq('agent_type', agentType)
    .eq('active', true)
    .order('priority', { ascending: false });
  if (ruleType) query = query.eq('rule_type', ruleType);
  const { data } = await query;
  return (data || []) as ProceduralRule[];
};

export const recordRuleOutcome = async (
  ruleId: string,
  followed: boolean,
  success: boolean
): Promise<void> => {
  const { data } = await supabase
    .from('agent_procedural_memory')
    .select('follow_count, override_count, success_rate')
    .eq('rule_id', ruleId)
    .single();

  if (!data) return;

  const newFollow   = (data.follow_count || 0) + (followed ? 1 : 0);
  const newOverride = (data.override_count || 0) + (followed ? 0 : 1);
  const total       = newFollow + newOverride;
  const successCount = Math.round((data.success_rate || 0.5) * (total - 1)) + (success ? 1 : 0);
  const newRate     = total > 0 ? successCount / total : 0.5;

  await supabase.from('agent_procedural_memory').update({
    follow_count:   newFollow,
    override_count: newOverride,
    success_rate:   Math.round(newRate * 1000) / 1000,
    updated_at:     new Date().toISOString(),
  }).eq('rule_id', ruleId).then(undefined, () => {});
};
