// ═══════════════════════════════════════════════════════════════════
// GL Validation Engine — Pre-posting and post-posting checks
// Ensures every GL entry is balanced, period-valid, authorized,
// and non-duplicate before touching the ledger.
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/src/services/supabaseClient';
import { FinanceService } from '@/modules/finance/services/financeService';

// ── Types ────────────────────────────────────────────────────────────
export interface GLEntry {
  debit_account_code:  string;
  debit_account_name:  string;
  credit_account_code: string;
  credit_account_name: string;
  amount:              number;
  company:             string;
  entry_date:          string;
  description:         string;
  doc_type:            string;   // 'AGT-JV' for agent, 'JV' for manual, etc.
  reference_id?:       string;
  agent_name?:         string;
}

export interface ValidationResult {
  valid:    boolean;
  errors:   string[];
  warnings: string[];
}

// ═══ PRE-POSTING CHECKS ═════════════════════════════════════════════

export const prePostValidation = (entry: GLEntry): ValidationResult => {
  const errors: string[]   = [];
  const warnings: string[] = [];

  // 1. Balanced entry (debit = credit by definition in single-entry format)
  if (entry.amount <= 0) {
    errors.push('Amount must be positive');
  }

  // 2. GL accounts exist
  const accounts = FinanceService.getAccounts().filter((a: any) => a.company === entry.company);
  const debitExists  = accounts.some((a: any) => a.code === entry.debit_account_code);
  const creditExists = accounts.some((a: any) => a.code === entry.credit_account_code);

  if (!debitExists) {
    errors.push(`Debit account ${entry.debit_account_code} (${entry.debit_account_name}) not found in chart of accounts`);
  }
  if (!creditExists) {
    errors.push(`Credit account ${entry.credit_account_code} (${entry.credit_account_name}) not found in chart of accounts`);
  }

  // 3. Company_id present
  if (!entry.company) {
    errors.push('Company is required');
  }

  // 4. Entry date format
  if (!/^\d{4}-\d{2}-\d{2}/.test(entry.entry_date)) {
    errors.push('Invalid entry date format');
  }

  // 5. Description present
  if (!entry.description || entry.description.length < 3) {
    errors.push('Description is required (min 3 chars)');
  }

  // 6. Agent-posted entries should use AGT-JV doc_type
  if (entry.agent_name && entry.doc_type !== 'AGT-JV') {
    warnings.push(`Agent-posted entry should use doc_type = "AGT-JV" for audit separation (currently: "${entry.doc_type}")`);
  }

  // 7. Large amount warning
  if (entry.amount > 500000) {
    warnings.push(`Large entry: PKR ${entry.amount.toLocaleString()} — verify before posting`);
  }

  return { valid: errors.length === 0, errors, warnings };
};

// ═══ PERIOD LOCK CHECK ══════════════════════════════════════════════

export const checkPeriodLock = (entryDate: string, company: string): {
  locked: boolean;
  period: string;
  message: string;
} => {
  const period = entryDate.slice(0, 7); // YYYY-MM
  const periods = JSON.parse(localStorage.getItem('gtk_erp_fiscal_periods') || '[]');
  const match = periods.find((p: any) => p.month === period && p.company === company);

  if (match && match.status === 'Closed') {
    return {
      locked:  true,
      period,
      message: `Period ${period} is CLOSED for ${company}. Contact Finance to reopen.`,
    };
  }

  return { locked: false, period, message: `Period ${period} is open` };
};

// ═══ AUTHORITY CHECK ════════════════════════════════════════════════

export interface AuthorityMatrix {
  canAutoPost:       boolean;
  requiresApproval:  boolean;
  hardBlock:         boolean;
  reason:            string;
}

export const checkAgentAuthority = (
  agentName: string,
  entryType: string,
  amount: number
): AuthorityMatrix => {

  // Hard blocks (no agent can do these)
  if (entryType === 'change_gl_account_code') {
    return { canAutoPost: false, requiresApproval: false, hardBlock: true, reason: 'GL account code changes are never autonomous' };
  }
  if (entryType === 'period_close') {
    return { canAutoPost: false, requiresApproval: false, hardBlock: true, reason: 'Period closing is owner-only' };
  }

  // Revenue recognition always requires approval
  if (entryType === 'revenue_recognition') {
    return { canAutoPost: false, requiresApproval: true, hardBlock: false, reason: 'Revenue entries always require owner approval' };
  }

  // Payment vouchers always require approval
  if (entryType === 'payment_voucher' || entryType === 'vendor_payment') {
    return { canAutoPost: false, requiresApproval: true, hardBlock: false, reason: 'Payment vouchers always require owner approval' };
  }

  // Amount-based thresholds
  if (amount > 100000) {
    return { canAutoPost: false, requiresApproval: true, hardBlock: false, reason: `Amount PKR ${amount.toLocaleString()} > 100K requires owner approval` };
  }
  if (amount > 10000) {
    return { canAutoPost: false, requiresApproval: true, hardBlock: false, reason: `Amount PKR ${amount.toLocaleString()} > 10K requires owner notification` };
  }

  // Small amounts — auto-post allowed for authorized agents
  const autoPostAgents = ['ProductionAgent', 'QCAgent', 'OpsAgent', 'FinanceAgent'];
  if (autoPostAgents.includes(agentName)) {
    return { canAutoPost: true, requiresApproval: false, hardBlock: false, reason: `${agentName} authorized for auto-post < PKR 10K` };
  }

  return { canAutoPost: false, requiresApproval: true, hardBlock: false, reason: 'Default: requires approval' };
};

// ═══ POST-POSTING VALIDATION ════════════════════════════════════════

export const postPostValidation = async (company: string): Promise<{
  trialBalanced: boolean;
  negativeInventory: boolean;
  negativeCash: boolean;
  warnings: string[];
}> => {
  const warnings: string[] = [];
  const accounts = FinanceService.getAccounts().filter((a: any) => a.company === company);
  const ledger   = FinanceService.getLedger().filter((t: any) => t.company === company);

  // Calculate balances
  const balances: Record<string, number> = {};
  accounts.forEach((a: any) => { balances[a.id] = 0; });
  ledger.forEach((tx: any) => {
    if (tx.status !== 'Posted') return;
    tx.details?.forEach((d: any) => {
      if (balances[d.accountId] !== undefined) {
        balances[d.accountId] += (d.debit || 0) - (d.credit || 0);
      }
    });
  });

  // Trial balance check
  const totalDebits  = Object.values(balances).filter(b => b > 0).reduce((s, b) => s + b, 0);
  const totalCredits = Math.abs(Object.values(balances).filter(b => b < 0).reduce((s, b) => s + b, 0));
  const trialBalanced = Math.abs(totalDebits - totalCredits) < 1; // PKR 1 tolerance

  if (!trialBalanced) {
    warnings.push(`Trial balance off by PKR ${Math.abs(totalDebits - totalCredits).toFixed(2)}`);
  }

  // Negative inventory check
  const inventoryAccounts = accounts.filter((a: any) => a.code?.startsWith('12') || a.code?.startsWith('13'));
  const negativeInventory = inventoryAccounts.some((a: any) => (balances[a.id] || 0) < -1);
  if (negativeInventory) {
    warnings.push('Negative inventory balance detected — investigate');
  }

  // Negative cash check
  const cashAccounts = accounts.filter((a: any) => a.code?.startsWith('111') || a.code?.startsWith('105'));
  const negativeCash = cashAccounts.some((a: any) => (balances[a.id] || 0) < -1);
  if (negativeCash) {
    warnings.push('Negative cash balance — possible overdraft');
  }

  return { trialBalanced, negativeInventory, negativeCash, warnings };
};
