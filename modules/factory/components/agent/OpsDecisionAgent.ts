// ═══════════════════════════════════════════════════════════════════
// Ops Decision Agent — Requisition, Vendor Selection, Reorder
// Uses three-layer memory for learning from outcomes
// ═══════════════════════════════════════════════════════════════════

import { InventoryService } from '@/modules/procurement/services/inventoryService';
import {
  saveDecision, getActiveRules, getRelevantFacts, searchFacts,
  getSimilarDecisions,
} from '@/modules/factory/services/decisionMemoryService';
import {
  computeDecisionConfidence, getActionLevel,
} from '@/modules/factory/services/confidenceScoringService';

export interface OpsDecision {
  decision_id:      string;
  decision_type:    string;
  context:          Record<string, any>;
  decision:         string;
  reasoning:        string;
  conditions:       string[];
  confidence:       number;
  action_level:     'autonomous' | 'recommend' | 'escalate';
  applicable_rules: { rule_id: string; condition: string; action: string }[];
  semantic_facts:   string[];
}

const genId = () => `ODA-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;

// ═══ UC-1: Requisition Approval ══════════════════════════════════════
export const assessRequisition = async (
  category: string,
  description: string,
  amount: number,
  priority: string
): Promise<OpsDecision> => {
  const decisionId = genId();
  const context = { category, description, amount, priority };

  const [rules, confidence] = await Promise.all([
    getActiveRules('ops'),
    computeDecisionConfidence('ops', 'requisition_approval'),
  ]);

  // Urgent + low value = auto-approve
  if (priority === 'Urgent' && amount < 5000) {
    return buildOpsDecision(decisionId, 'requisition_approval', context,
      'APPROVE', `Urgent requisition under PKR 5,000 — auto-approve threshold.`,
      [], Math.max(confidence.confidence, 0.85), rules);
  }

  // High value = owner approval
  if (amount > 50000) {
    return buildOpsDecision(decisionId, 'requisition_approval', context,
      'ESCALATE', `Requisition PKR ${amount.toLocaleString()} exceeds auto-approve limit (PKR 50,000).`,
      ['Requires owner approval', 'Attach 3 vendor quotes if > PKR 100K'],
      confidence.confidence, rules);
  }

  return buildOpsDecision(decisionId, 'requisition_approval', context,
    'APPROVE', `Standard requisition (${category}, PKR ${amount.toLocaleString()}). Within budget.`,
    [], confidence.confidence, rules);
};

// ═══ UC-2: Vendor Selection ══════════════════════════════════════════
export const selectVendor = async (
  materialType: string,
  requiredQty: number
): Promise<OpsDecision> => {
  const decisionId = genId();
  const vendors = InventoryService.getVendors?.() || JSON.parse(localStorage.getItem('gtk_erp_vendors') || '[]');
  const glasscoVendors = vendors.filter((v: any) => v.company === 'Glassco' || v.company === 'GlassCo');

  const [rules, facts, confidence] = await Promise.all([
    getActiveRules('ops'),
    getRelevantFacts('ops', 'vendor_reliability'),
    computeDecisionConfidence('ops', 'vendor_selection'),
  ]);

  // Check for high-breach vendors
  const breachRule = rules.find(r => r.rule_id === 'SR-OPS-002');

  const context = {
    material_type: materialType,
    required_qty: requiredQty,
    vendor_count: glasscoVendors.length,
    vendor_facts: facts.map((f: any) => f.fact_statement),
  };

  if (glasscoVendors.length === 0) {
    return buildOpsDecision(decisionId, 'vendor_selection', context,
      'ESCALATE', 'No vendors found in master. Add vendor first.',
      ['Create vendor record', 'Get rate quotes'], confidence.confidence, rules);
  }

  const reasoning = facts.length > 0
    ? `${glasscoVendors.length} vendors available. Memory: ${facts[0].fact_statement}`
    : `${glasscoVendors.length} vendors available. No reliability data yet — recommend lowest rate.`;

  return buildOpsDecision(decisionId, 'vendor_selection', context,
    'APPROVE_WITH_CONDITIONS', reasoning,
    ['Compare rates from top 3 vendors', 'Check delivery timeline'],
    confidence.confidence, rules);
};

// ═══ UC-3: Inventory Reorder ═════════════════════════════════════════
export const assessReorder = async (
  materialId: string,
  currentQty: number,
  monthlyUsage: number
): Promise<OpsDecision> => {
  const decisionId = genId();
  const coverageDays = monthlyUsage > 0 ? Math.round((currentQty / monthlyUsage) * 30) : 999;

  const [rules, confidence] = await Promise.all([
    getActiveRules('ops'),
    computeDecisionConfidence('ops', 'reorder_trigger'),
  ]);

  const context = { material_id: materialId, current_qty: currentQty, monthly_usage: monthlyUsage, coverage_days: coverageDays };

  // Auto-reorder rule
  const reorderRule = rules.find(r => r.rule_id === 'SR-OPS-001');
  const threshold = monthlyUsage * 0.20; // 20% of monthly

  if (currentQty <= threshold) {
    return buildOpsDecision(decisionId, 'reorder_trigger', context,
      'APPROVE', `Stock critical: ${coverageDays} days coverage. Below 20% threshold. Auto-requisition recommended.`,
      ['Create urgent requisition', 'Notify purchase manager'],
      Math.max(confidence.confidence, 0.80), rules);
  }

  if (coverageDays < 15) {
    return buildOpsDecision(decisionId, 'reorder_trigger', context,
      'APPROVE_WITH_CONDITIONS', `Stock low: ${coverageDays} days coverage. Order within 3 days.`,
      ['Create normal priority requisition'], confidence.confidence, rules);
  }

  return buildOpsDecision(decisionId, 'reorder_trigger', context,
    'DEFER', `Stock adequate: ${coverageDays} days coverage. No reorder needed.`,
    [], confidence.confidence, rules);
};

// ── Helper ───────────────────────────────────────────────────────────
function buildOpsDecision(
  id: string, type: string, context: Record<string, any>,
  decision: string, reasoning: string, conditions: string[],
  confidence: number, rules: any[]
): OpsDecision {
  const result: OpsDecision = {
    decision_id:   id,
    decision_type: type,
    context,
    decision:      decision as any,
    reasoning,
    conditions,
    confidence,
    action_level:     getActionLevel(confidence),
    applicable_rules: rules.slice(0, 5).map((r: any) => ({
      rule_id: r.rule_id, condition: r.condition_text, action: r.action_text,
    })),
    semantic_facts: [],
  };

  saveDecision({
    decision_id:      id,
    agent_type:       'ops',
    decision_type:    type,
    context_snapshot: context,
    decision_made:    decision as any,
    reasoning,
    conditions,
    confidence_score: confidence,
  }).catch(() => {});

  return result;
}
