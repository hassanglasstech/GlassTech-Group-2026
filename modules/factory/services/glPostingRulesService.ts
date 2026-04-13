// ═══════════════════════════════════════════════════════════════════
// GL Posting Rules Service — 12 IFRS-compliant auto-posting rules
// Each rule maps a business event to a GL entry with validation.
// Used by agents and services to ensure correct postings.
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/src/services/supabaseClient';

// ── Types ────────────────────────────────────────────────────────────
export interface GLPostingRule {
  rule_id:             string;
  rule_name:           string;
  trigger_event:       string;
  debit_account_code:  string;
  debit_account_name:  string;
  credit_account_code: string;
  credit_account_name: string;
  amount_formula:      string;
  ias_reference:       string;
  requires_approval:   boolean;
  approval_threshold:  number | null;
  period_lock_check:   boolean;
  agent_authority:     string[];
  active:              boolean;
}

export interface GLEntryRequest {
  rule_id:     string;
  company:     string;
  amount:      number;
  description: string;
  reference_id?: string;
  agent_name:  string;
  entry_date:  string;
  metadata?:   Record<string, any>;
}

export interface GLValidationResult {
  valid:          boolean;
  errors:         string[];
  requires_approval: boolean;
  approval_reason?:  string;
}

// ── Cache ────────────────────────────────────────────────────────────
let rulesCache: GLPostingRule[] | null = null;
let cacheExpiry = 0;

// ── Load rules (DB first, then fallback) ─────────────────────────────
export const loadRules = async (): Promise<GLPostingRule[]> => {
  if (rulesCache && Date.now() < cacheExpiry) return rulesCache;

  const { data } = await supabase
    .from('gl_posting_rules_v2')
    .select('*')
    .eq('active', true)
    .order('rule_id');

  rulesCache = (data || []) as GLPostingRule[];
  cacheExpiry = Date.now() + 300000; // 5 min cache
  return rulesCache;
};

// ── Get rule by ID ───────────────────────────────────────────────────
export const getRule = async (ruleId: string): Promise<GLPostingRule | null> => {
  const rules = await loadRules();
  return rules.find(r => r.rule_id === ruleId) || null;
};

// ── Get rules by trigger event ───────────────────────────────────────
export const getRulesForEvent = async (triggerEvent: string): Promise<GLPostingRule[]> => {
  const rules = await loadRules();
  return rules.filter(r => r.trigger_event === triggerEvent);
};

// ── Validate a GL entry request ──────────────────────────────────────
export const validateGLEntry = async (
  entry: GLEntryRequest
): Promise<GLValidationResult> => {
  const errors: string[] = [];
  const rule = await getRule(entry.rule_id);

  if (!rule) {
    return { valid: false, errors: [`GL rule ${entry.rule_id} not found`], requires_approval: false };
  }

  // Check agent authority
  if (!rule.agent_authority.includes(entry.agent_name) && !rule.agent_authority.includes('FinanceAgent')) {
    errors.push(`Agent ${entry.agent_name} not authorized for rule ${entry.rule_id}. Allowed: ${rule.agent_authority.join(', ')}`);
  }

  // Check amount
  if (entry.amount <= 0) {
    errors.push('Amount must be positive');
  }

  // Check company
  if (!entry.company) {
    errors.push('Company is required');
  }

  // Check entry date format
  if (!/^\d{4}-\d{2}-\d{2}/.test(entry.entry_date)) {
    errors.push('Invalid entry date format (YYYY-MM-DD)');
  }

  // Check approval requirement
  let requiresApproval = rule.requires_approval;
  let approvalReason: string | undefined;

  if (rule.approval_threshold && entry.amount > rule.approval_threshold) {
    requiresApproval = true;
    approvalReason = `Amount PKR ${entry.amount.toLocaleString()} exceeds threshold PKR ${rule.approval_threshold.toLocaleString()} for ${rule.rule_name}`;
  }

  return {
    valid: errors.length === 0,
    errors,
    requires_approval: requiresApproval,
    approval_reason: approvalReason,
  };
};

// ── Submit GL entry for approval ─────────────────────────────────────
export const submitForApproval = async (
  entry: GLEntryRequest,
  rule: GLPostingRule,
  reason: string
): Promise<string> => {
  const { data } = await supabase.from('gl_entries_pending_approval').insert({
    agent_name:    entry.agent_name,
    gl_rule_id:    entry.rule_id,
    entry_details: {
      debit:  { code: rule.debit_account_code, name: rule.debit_account_name },
      credit: { code: rule.credit_account_code, name: rule.credit_account_name },
      amount: entry.amount,
      date:   entry.entry_date,
      ref:    entry.reference_id,
      desc:   entry.description,
      ias:    rule.ias_reference,
    },
    amount_pkr: entry.amount,
    company:    entry.company,
    period:     entry.entry_date.slice(0, 7),
    reason,
    status:     'pending',
  }).select('entry_id').single();

  return data?.entry_id || '';
};

// ── Get all 12 GL touch point rules summary ──────────────────────────
export const getGLTouchPointSummary = async (): Promise<{
  total: number;
  requiresApproval: number;
  agentAuthority: Record<string, number>;
}> => {
  const rules = await loadRules();
  const agentAuth: Record<string, number> = {};
  rules.forEach(r => r.agent_authority.forEach(a => { agentAuth[a] = (agentAuth[a] || 0) + 1; }));

  return {
    total: rules.length,
    requiresApproval: rules.filter(r => r.requires_approval).length,
    agentAuthority: agentAuth,
  };
};
