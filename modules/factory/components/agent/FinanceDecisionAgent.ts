// ═══════════════════════════════════════════════════════════════════
// Finance Decision Agent — Credit, Vendor Payment, Write-off
// Uses three-layer memory for learning from outcomes
// ═══════════════════════════════════════════════════════════════════

import { SalesService } from '@/modules/sales/services/salesService';
import {
  saveDecision, getSimilarDecisions, getActiveRules,
  getRelevantFacts, searchFacts, EpisodicMemory,
} from '@/modules/factory/services/decisionMemoryService';
import {
  computeDecisionConfidence, getActionLevel,
} from '@/modules/factory/services/confidenceScoringService';

// ── Types ────────────────────────────────────────────────────────────
export interface FinanceDecision {
  decision_id:      string;
  decision_type:    string;
  context:          Record<string, any>;
  decision:         string;
  reasoning:        string;
  conditions:       string[];
  confidence:       number;
  action_level:     'autonomous' | 'recommend' | 'escalate';
  similar_past:     { decision_id: string; outcome: string; confidence: number }[];
  applicable_rules: { rule_id: string; condition: string; action: string }[];
  semantic_facts:   string[];
}

const genId = () => `FDA-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;

// ═══ UC-1: Credit Approval ═══════════════════════════════════════════
export const assessCreditApproval = async (
  clientName: string,
  orderValue: number
): Promise<FinanceDecision> => {
  const decisionId   = genId();
  const decisionType = 'credit_approval';

  // Gather context
  const quotations = SalesService.getQuotations().filter((q: any) => q.company === 'Glassco');
  const clientOrders = quotations.filter((q: any) =>
    q.clientName?.toLowerCase().includes(clientName.toLowerCase())
  );
  const invoices = SalesService.getInvoices().filter((i: any) =>
    i.company === 'Glassco' && i.clientName?.toLowerCase().includes(clientName.toLowerCase())
  );
  const overdue = invoices.filter((i: any) =>
    (i.status === 'Outstanding' || i.status === 'Overdue') &&
    i.dueDate < new Date().toISOString().split('T')[0]
  );
  const totalOverdue = overdue.reduce((s: number, i: any) => s + (i.amount || i.totalAmount || 0), 0);
  const lifetimeRevenue = clientOrders.reduce((s: number, q: any) => s + (q.totalAmount || 0), 0);

  // Calculate avg payment delay
  const paymentReceipts = SalesService.getPaymentReceipts?.() || [];
  const clientReceipts = paymentReceipts.filter((r: any) =>
    invoices.some((i: any) => i.id === r.invoiceId)
  );
  const avgDelayDays = clientOrders.length > 0
    ? overdue.reduce((s: number, i: any) => {
        const due = new Date(i.dueDate).getTime();
        const now = Date.now();
        return s + Math.max(0, (now - due) / 86400000);
      }, 0) / Math.max(1, overdue.length)
    : 0;

  const context = {
    client_name: clientName,
    order_value: orderValue,
    current_overdue: totalOverdue,
    overdue_count: overdue.length,
    avg_delay_days: Math.round(avgDelayDays),
    lifetime_revenue: lifetimeRevenue,
    total_orders: clientOrders.length,
  };

  // Load memory layers
  const [rules, facts, confidence, similar] = await Promise.all([
    getActiveRules('finance'),
    searchFacts('finance', clientName),
    computeDecisionConfidence('finance', decisionType, clientName),
    getSimilarDecisions('finance', decisionType, 5),
  ]);

  // Apply hard rules first
  const hardRules = rules.filter(r => r.rule_type === 'hard_rule');
  for (const rule of hardRules) {
    if (rule.rule_id === 'HR-FIN-001' && avgDelayDays > 90) {
      return buildDecision(decisionId, decisionType, context, 'REJECT',
        `Hard rule: Client overdue ${Math.round(avgDelayDays)} days (>90). 100% advance required.`,
        ['100% advance mandatory before any production'], 1.0, rules, facts, similar);
    }
  }

  // Soft rule evaluation
  const conditions: string[] = [];
  let decision: string;
  let reasoning: string;

  if (totalOverdue > 0 && avgDelayDays > 30) {
    decision = 'APPROVE_WITH_CONDITIONS';
    conditions.push(`50% advance required (PKR ${Math.round(orderValue * 0.5).toLocaleString()})`);
    conditions.push('Final payment due on delivery');
    reasoning = `Client has PKR ${totalOverdue.toLocaleString()} overdue (${Math.round(avgDelayDays)} days avg). `;
    reasoning += lifetimeRevenue > 1000000
      ? `High lifetime value (PKR ${lifetimeRevenue.toLocaleString()}) — worth maintaining relationship with conditions.`
      : 'Moderate value client — advance required to mitigate risk.';
  } else if (totalOverdue > 0) {
    decision = 'APPROVE_WITH_CONDITIONS';
    conditions.push('Payment on delivery');
    reasoning = `Minor overdue (PKR ${totalOverdue.toLocaleString()}, ${Math.round(avgDelayDays)} days). Manageable risk.`;
  } else {
    decision = 'APPROVE';
    reasoning = `No overdue. ${clientOrders.length > 0 ? `Repeat client (${clientOrders.length} orders).` : 'New client — standard terms.'}`;
  }

  // Add semantic facts to reasoning
  if (facts.length > 0) {
    reasoning += ` Memory: ${facts[0].fact_statement}`;
  }

  return buildDecision(decisionId, decisionType, context, decision, reasoning,
    conditions, confidence.confidence, rules, facts, similar);
};

// ═══ UC-2: Vendor Payment Priority ═══════════════════════════════════
export const prioritizeVendorPayments = async (
  cashAvailable: number
): Promise<FinanceDecision> => {
  const decisionId = genId();
  const invoices = SalesService.getInvoices?.() || [];
  // Simplified: use quotation data as proxy for pending vendor payments
  const vendorFacts = await getRelevantFacts('finance', 'vendor_reliability');

  const context = { cash_available: cashAvailable, vendor_facts: vendorFacts.length };
  const confidence = await computeDecisionConfidence('finance', 'vendor_payment');
  const rules = await getActiveRules('finance', 'soft_rule');
  const discountRule = rules.find(r => r.rule_id === 'SR-FIN-002');

  const reasoning = discountRule
    ? `Prioritize vendors with early payment discounts (Rule SR-FIN-002, success rate ${Math.round(discountRule.success_rate * 100)}%).`
    : 'Pay oldest invoices first (FIFO).';

  return buildDecision(decisionId, 'vendor_payment', context, 'APPROVE_WITH_CONDITIONS',
    reasoning, ['Pay discount vendors first', 'Defer non-critical by 7 days'],
    confidence.confidence, rules, vendorFacts, []);
};

// ═══ UC-3: Bad Debt Write-off ════════════════════════════════════════
export const assessBadDebt = async (
  clientName: string,
  invoiceId: string,
  overdueDays: number,
  amount: number
): Promise<FinanceDecision> => {
  const decisionId = genId();
  const context = { client_name: clientName, invoice_id: invoiceId, overdue_days: overdueDays, amount };
  const [rules, facts, confidence] = await Promise.all([
    getActiveRules('finance', 'hard_rule'),
    searchFacts('finance', clientName),
    computeDecisionConfidence('finance', 'bad_debt'),
  ]);

  // Hard rule: no write-off under 10K without legal
  const legalRule = rules.find(r => r.rule_id === 'HR-FIN-004');
  if (legalRule && amount < 10000) {
    return buildDecision(decisionId, 'bad_debt', context, 'REJECT',
      'Hard rule: Cannot write off < PKR 10,000 without legal notice attempt.',
      ['Send legal notice first', 'Wait 30 days for response'], 1.0, rules, facts, []);
  }

  if (overdueDays > 150) {
    return buildDecision(decisionId, 'bad_debt', context, 'APPROVE_WITH_CONDITIONS',
      `Invoice ${overdueDays} days overdue. IAS 39 provision recommended.`,
      ['Send final legal notice', 'Book provision: Dr Bad Debt Expense / Cr Allowance for Doubtful'],
      confidence.confidence, rules, facts, []);
  }

  return buildDecision(decisionId, 'bad_debt', context, 'DEFER',
    `Overdue ${overdueDays} days — not yet at write-off threshold (150 days). Continue collection.`,
    ['Escalate collection calls', 'Review in 30 days'],
    confidence.confidence, rules, facts, []);
};

// ── Helper ───────────────────────────────────────────────────────────
function buildDecision(
  id: string, type: string, context: Record<string, any>,
  decision: string, reasoning: string, conditions: string[],
  confidence: number, rules: any[], facts: any[], similar: any[]
): FinanceDecision {
  const result: FinanceDecision = {
    decision_id:      id,
    decision_type:    type,
    context,
    decision:         decision as any,
    reasoning,
    conditions,
    confidence,
    action_level:     getActionLevel(confidence),
    similar_past:     similar.slice(0, 3).map((d: any) => ({
      decision_id: d.decision_id, outcome: d.outcome, confidence: d.confidence_score,
    })),
    applicable_rules: rules.slice(0, 5).map((r: any) => ({
      rule_id: r.rule_id, condition: r.condition_text, action: r.action_text,
    })),
    semantic_facts:   facts.map((f: any) => f.fact_statement),
  };

  // Save to episodic memory (fire-and-forget)
  saveDecision({
    decision_id:      id,
    agent_type:       'finance',
    decision_type:    type,
    context_snapshot: context,
    decision_made:    decision as any,
    reasoning,
    conditions,
    confidence_score: confidence,
  }).catch(() => {});

  return result;
}
