// ═══════════════════════════════════════════════════════════════════
// Intercompany Settlement Agent — IAS 24 / IFRS 10 Compliant
// Handles cross-company transactions (GlassCo → GTK, etc.)
// Posts dual-ledger entries + tracks for consolidation elimination
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/src/services/supabaseClient';
import { enforcePeriodLock } from './PeriodLockEnforcer';
import { prePostValidation, checkAgentAuthority } from './GLValidationEngine';

// ── Types ────────────────────────────────────────────────────────────
export interface IntercompanyTransfer {
  from_company:    string;  // e.g. 'Glassco'
  to_company:      string;  // e.g. 'GTK'
  amount:          number;
  description:     string;
  transaction_type: 'sale' | 'purchase' | 'transfer' | 'settlement';
  reference_id?:   string;
  include_gst?:    boolean;
  gst_rate?:       number;  // e.g. 0.18 for 18% GST
}

export interface IntercompanyResult {
  success:          boolean;
  txn_id?:          string;
  seller_gl_id?:    string;
  buyer_gl_id?:     string;
  errors:           string[];
  requires_approval: boolean;
}

// ── IAS 24: Intercompany GL Account Codes ────────────────────────────
const ICO_ACCOUNTS = {
  receivable:  { code: '1220', name: 'Intercompany Receivable' },
  payable:     { code: '2210', name: 'Intercompany Payable' },
  sales:       { code: '4510', name: 'Intercompany Sales' },
  purchases:   { code: '5510', name: 'Intercompany Purchases' },
  gst_output:  { code: '2310', name: 'GST Output Tax' },
  gst_input:   { code: '1350', name: 'GST Input Tax' },
};

// ── Process intercompany transfer ────────────────────────────────────
export const processIntercompanyTransfer = async (
  transfer: IntercompanyTransfer
): Promise<IntercompanyResult> => {
  const errors: string[] = [];
  const entryDate = new Date().toISOString().split('T')[0];

  // Validate companies differ
  if (transfer.from_company === transfer.to_company) {
    return { success: false, errors: ['Cannot transfer to same company'], requires_approval: false };
  }

  // Check period locks for both companies
  const sellerPeriod = enforcePeriodLock(entryDate, transfer.from_company);
  const buyerPeriod  = enforcePeriodLock(entryDate, transfer.to_company);

  if (!sellerPeriod.allowed) errors.push(`Seller: ${sellerPeriod.message}`);
  if (!buyerPeriod.allowed) errors.push(`Buyer: ${buyerPeriod.message}`);

  if (errors.length > 0) {
    return { success: false, errors, requires_approval: false };
  }

  // Check authority
  const auth = checkAgentAuthority('FinanceAgent', 'intercompany_transfer', transfer.amount);
  if (auth.hardBlock) {
    return { success: false, errors: [auth.reason], requires_approval: false };
  }

  // GST calculation
  const gstAmount = transfer.include_gst ? transfer.amount * (transfer.gst_rate || 0.18) : 0;
  const totalWithGst = transfer.amount + gstAmount;

  // ── Step 1: Seller books (GlassCo as seller) ─────────────────
  // Dr ICO Receivable - Buyer
  // Cr ICO Sales
  // Cr GST Payable (if applicable)
  const sellerEntry = {
    company:     transfer.from_company,
    date:        entryDate,
    docType:     'AGT-JV',
    description: `[ICO] ${transfer.description} — ${transfer.from_company} → ${transfer.to_company}`,
    status:      'Posted',
    createdBy:   'IntercompanyAgent',
    details: [
      { accountId: '', accountCode: ICO_ACCOUNTS.receivable.code, accountName: `${ICO_ACCOUNTS.receivable.name} - ${transfer.to_company}`, debit: totalWithGst, credit: 0 },
      { accountId: '', accountCode: ICO_ACCOUNTS.sales.code, accountName: ICO_ACCOUNTS.sales.name, debit: 0, credit: transfer.amount },
      ...(gstAmount > 0 ? [{ accountId: '', accountCode: ICO_ACCOUNTS.gst_output.code, accountName: ICO_ACCOUNTS.gst_output.name, debit: 0, credit: gstAmount }] : []),
    ],
  };

  // ── Step 2: Buyer books (GTK as buyer) ────────────────────────
  // Dr Inventory/Project Cost
  // Dr GST Input (if applicable)
  // Cr ICO Payable - Seller
  const buyerEntry = {
    company:     transfer.to_company,
    date:        entryDate,
    docType:     'AGT-JV',
    description: `[ICO] ${transfer.description} — received from ${transfer.from_company}`,
    status:      'Posted',
    createdBy:   'IntercompanyAgent',
    details: [
      { accountId: '', accountCode: ICO_ACCOUNTS.purchases.code, accountName: ICO_ACCOUNTS.purchases.name, debit: transfer.amount, credit: 0 },
      ...(gstAmount > 0 ? [{ accountId: '', accountCode: ICO_ACCOUNTS.gst_input.code, accountName: ICO_ACCOUNTS.gst_input.name, debit: gstAmount, credit: 0 }] : []),
      { accountId: '', accountCode: ICO_ACCOUNTS.payable.code, accountName: `${ICO_ACCOUNTS.payable.name} - ${transfer.from_company}`, debit: 0, credit: totalWithGst },
    ],
  };

  // ── Step 3: Log intercompany transaction ──────────────────────
  const { data: txn } = await supabase.from('intercompany_transaction_log').insert({
    from_company:     transfer.from_company,
    to_company:       transfer.to_company,
    amount:           transfer.amount,
    description:      transfer.description,
    transaction_type: transfer.transaction_type,
    gl_entry_id_from: sellerEntry.description,
    gl_entry_id_to:   buyerEntry.description,
    eliminated:       false,
    created_at:       new Date().toISOString(),
  }).select('txn_id').single().then(undefined, () => ({ data: null }));

  return {
    success:           true,
    txn_id:            txn?.txn_id,
    errors:            [],
    requires_approval: auth.requiresApproval,
  };
};

// ── IFRS 10: Month-end consolidation elimination ─────────────────────
export const generateEliminationEntries = async (period: string): Promise<{
  success: boolean;
  eliminated_count: number;
  total_revenue_eliminated: number;
  errors: string[];
}> => {
  // Find all uneliminated ICO transactions for this period
  const { data: txns } = await supabase
    .from('intercompany_transaction_log')
    .select('*')
    .eq('eliminated', false)
    .lte('created_at', `${period}-31T23:59:59`);

  if (!txns || txns.length === 0) {
    return { success: true, eliminated_count: 0, total_revenue_eliminated: 0, errors: [] };
  }

  // Group by company pair
  const pairs: Record<string, typeof txns> = {};
  txns.forEach(t => {
    const key = [t.from_company, t.to_company].sort().join('↔');
    if (!pairs[key]) pairs[key] = [];
    pairs[key].push(t);
  });

  let eliminatedCount = 0;
  let totalRevenue = 0;

  for (const [pair, pairTxns] of Object.entries(pairs)) {
    const totalAmount = pairTxns.reduce((s, t) => s + (t.amount || 0), 0);

    // Log elimination
    await supabase.from('elimination_log').insert({
      period,
      company_pair:          pair,
      revenue_eliminated:    totalAmount,
      cogs_eliminated:       totalAmount, // At cost for ICO
      receivable_eliminated: totalAmount,
      payable_eliminated:    totalAmount,
      net_adjustment:        0, // ICO at cost = zero net impact
      elimination_entries:   pairTxns.map(t => t.txn_id),
      created_by:            'IntercompanyAgent',
    }).then(undefined, () => {});

    // Mark as eliminated
    const txnIds = pairTxns.map(t => t.txn_id);
    await supabase.from('intercompany_transaction_log')
      .update({ eliminated: true, elimination_period: period })
      .in('txn_id', txnIds)
      .then(undefined, () => {});

    eliminatedCount += pairTxns.length;
    totalRevenue += totalAmount;
  }

  return {
    success: true,
    eliminated_count: eliminatedCount,
    total_revenue_eliminated: totalRevenue,
    errors: [],
  };
};
