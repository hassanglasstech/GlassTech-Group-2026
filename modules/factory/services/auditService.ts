// ═══════════════════════════════════════════════════════════════════
// Audit Service — silent audit trail + auto risk flagging
// Immutable log: insert-only, no update/delete
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/src/services/supabaseClient';

// ── Types ────────────────────────────────────────────────────────────
export interface AuditEntry {
  action_type:       string;
  module:            string;
  user_id?:          string;
  agent_id?:         string;
  tool_name?:        string;
  data_before?:      Record<string, any>;
  data_after?:       Record<string, any>;
  gl_entries_created?: any[];
  approval_chain?:   any[];
}

// ── Risk flagging rules ──────────────────────────────────────────────
const FLAG_RULES: { check: (e: AuditEntry, ctx: any) => string | null }[] = [
  // GL entry > PKR 500K without dual approval
  { check: (e, ctx) => {
    const amount = ctx.amount || e.data_after?.amount || e.data_after?.total_amount || 0;
    const approvals = (e.approval_chain || []).length;
    if (amount > 500000 && approvals < 2) return 'GL_HIGH_VALUE_NO_DUAL_APPROVAL';
    return null;
  }},
  // First transaction with vendor
  { check: (e) => {
    if (e.tool_name === 'draft_payment_voucher' && e.data_after?.is_first_vendor_txn) return 'NEW_VENDOR_FIRST_PAYMENT';
    return null;
  }},
  // Stock write-down > PKR 100K
  { check: (e) => {
    if (e.action_type === 'stock_writedown' && (e.data_after?.amount || 0) > 100000) return 'LARGE_STOCK_WRITEDOWN';
    return null;
  }},
  // GL reversal
  { check: (e) => {
    if (e.action_type === 'reversal' || e.tool_name === 'reverse_execution') return 'GL_REVERSAL';
    return null;
  }},
  // Self-approval (same user creates and approves)
  { check: (e) => {
    if (e.data_after?.created_by && e.data_after?.approved_by &&
        e.data_after.created_by === e.data_after.approved_by) return 'SELF_APPROVAL';
    return null;
  }},
  // Action outside business hours (8pm-6am PKT)
  { check: () => {
    const pktHour = new Date(Date.now() + 5 * 3600000).getUTCHours(); // UTC+5
    if (pktHour >= 20 || pktHour < 6) return 'OUTSIDE_BUSINESS_HOURS';
    return null;
  }},
];

// ── Calculate risk score + flags ─────────────────────────────────────
const assessRisk = (entry: AuditEntry, ctx: any = {}): { score: number; flags: string[] } => {
  const flags: string[] = [];

  for (const rule of FLAG_RULES) {
    const flag = rule.check(entry, ctx);
    if (flag) flags.push(flag);
  }

  // Score: 0 = no risk, 10 = critical
  let score = 0;
  if (flags.includes('GL_HIGH_VALUE_NO_DUAL_APPROVAL')) score += 4;
  if (flags.includes('NEW_VENDOR_FIRST_PAYMENT')) score += 3;
  if (flags.includes('LARGE_STOCK_WRITEDOWN')) score += 3;
  if (flags.includes('GL_REVERSAL')) score += 2;
  if (flags.includes('SELF_APPROVAL')) score += 4;
  if (flags.includes('OUTSIDE_BUSINESS_HOURS')) score += 1;

  // Write tools get base risk
  const writeTool = ['create_quotation', 'create_requisition', 'create_invoice',
    'create_payment_receipt', 'draft_payment_voucher', 'update_order_status'];
  if (entry.tool_name && writeTool.includes(entry.tool_name)) score += 1;

  return { score: Math.min(10, score), flags };
};

// ── Log an audit entry (fire-and-forget, never blocks) ───────────────
export const logAudit = async (
  entry: AuditEntry,
  ctx?: { amount?: number }
): Promise<void> => {
  const { score, flags } = assessRisk(entry, ctx || {});

  await supabase.from('agent_audit_log').insert({
    action_type:        entry.action_type,
    module:             entry.module,
    user_id:            entry.user_id,
    agent_id:           entry.agent_id,
    tool_name:          entry.tool_name,
    data_before:        entry.data_before || {},
    data_after:         entry.data_after || {},
    gl_entries_created: entry.gl_entries_created || [],
    approval_chain:     entry.approval_chain || [],
    risk_score:         score,
    flags,
  }).then(() => {}, () => {});
};

// ── Get high-risk entries ────────────────────────────────────────────
export const getHighRiskEntries = async (days = 7): Promise<any[]> => {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data } = await supabase.from('agent_audit_log')
    .select('*')
    .gte('risk_score', 7)
    .gte('created_at', since)
    .order('risk_score', { ascending: false })
    .limit(20);
  return data || [];
};

// ── Get audit summary for dashboard ──────────────────────────────────
export const getAuditSummary = async (days = 7): Promise<{
  total_actions: number;
  high_risk: number;
  flag_counts: Record<string, number>;
  by_module: Record<string, number>;
}> => {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data } = await supabase.from('agent_audit_log')
    .select('risk_score, flags, module')
    .gte('created_at', since);

  const entries = data || [];
  const flagCounts: Record<string, number> = {};
  const byModule: Record<string, number> = {};

  entries.forEach((e: any) => {
    (e.flags || []).forEach((f: string) => { flagCounts[f] = (flagCounts[f] || 0) + 1; });
    byModule[e.module] = (byModule[e.module] || 0) + 1;
  });

  return {
    total_actions: entries.length,
    high_risk:     entries.filter((e: any) => e.risk_score >= 7).length,
    flag_counts:   flagCounts,
    by_module:     byModule,
  };
};
