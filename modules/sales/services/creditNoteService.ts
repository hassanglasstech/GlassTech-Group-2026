/**
 * creditNoteService.ts — Phase 2 (EC-01, BA-01)
 *
 * EC-01: Credit Note — partial/full reversal of a posted invoice
 * BA-01: Invoice Void — full reversal, marks invoice Voided
 *
 * GL pattern (mirror of deliveryInvoiceService):
 *   Credit Note: Dr Revenue  / Cr AR  (reduce both)
 *   Invoice Void: same as credit note for full amount + status → Voided
 *
 * Phase-1 hardening (migration 032):
 *   • Credit notes now persisted to Supabase `credit_notes` table
 *     (was localStorage-only — refunds invisible across devices).
 *   • voidInvoice preserves the prior invoice status in
 *     `revertedStatus` so a Partial-Payment invoice can be restored.
 */

import { Company } from '@/modules/shared/types/core';
import { Invoice, LedgerTransaction }  from '@/modules/finance/types/finance';
import { FinanceService, ledgerToRow } from '@/modules/finance/services/financeService';
import { SalesService }   from '@/modules/sales/services/salesService';
import { AsyncSalesService } from '@/modules/sales/services/asyncSalesService';
import { allocateSerial } from '@/modules/sales/services/serialAllocator';
import { reverseDeliveryCOGS } from '@/modules/procurement/services/glasscoGLService';
import { supabase } from '@/src/services/supabaseClient';
import { errMsg, safeParse, safeSave } from '@/modules/shared/services/utils';
import { Logger } from '@/modules/shared/services/logger';
import { toast } from 'sonner';

// ── Audit #9: atomic-RPC plumbing (migration 090) ───────────────────────────
// approveCreditNote/voidInvoice each mutate GL + invoice + CN/quote in several
// steps. Migration 090 wraps that in ONE Postgres transaction. These helpers
// (a) detect when 090 has NOT been applied so we fall back to the legacy path
// with ZERO behavior change, and (b) mirror the RPC's committed writes into
// localStorage WITHOUT re-pushing (the RPC already wrote the cloud) — the same
// discipline deliveryInvoiceService uses after post_invoice_atomic.
const LS_LEDGER     = 'gtk_erp_ledger';
const LS_INVOICES   = 'gtk_erp_invoices';
const LS_QUOTATIONS = 'gtk_erp_quotations';
const CN_UNIFIED_KEY = 'gtk_erp_credit_notes';

/** True when the RPC is absent (migration 090 not applied) — 42883 =
 *  undefined_function, PGRST202 = not in PostgREST schema cache. */
const isRpcMissing = (error: { code?: string; message?: string } | null): boolean => {
  if (!error) return false;
  const code = error.code || '';
  const msg  = (error.message || '').toLowerCase();
  return code === '42883' || code === 'PGRST202'
    || msg.includes('could not find the function')
    || msg.includes('does not exist');
};

const mirrorLedgerLocal = (tx: LedgerTransaction): void => {
  const local = safeParse(LS_LEDGER) as LedgerTransaction[];
  safeSave(LS_LEDGER, [...local.filter(t => t.id !== tx.id), tx]);
};

const mirrorInvoiceLocal = (invoiceId: string, patch: Record<string, unknown>): void => {
  const local = safeParse(LS_INVOICES) as Array<{ id: string }>;
  safeSave(LS_INVOICES, local.map(i => (i.id === invoiceId ? { ...i, ...patch } : i)));
};

const mirrorQuotationLocal = (quotationId: string): void => {
  const local = safeParse(LS_QUOTATIONS) as Array<{ id: string }>;
  safeSave(LS_QUOTATIONS, local.map(q => (q.id === quotationId ? { ...q, status: 'Approved', invoiceNo: undefined } : q)));
};

const mirrorCreditNoteLocal = (company: Company, cn: CreditNote): void => {
  const readArr = (key: string): CreditNote[] => {
    try { return JSON.parse(localStorage.getItem(key) || '[]') as CreditNote[]; } catch { return []; }
  };
  // unified key + legacy per-company key (both consumed by getCreditNotes)
  localStorage.setItem(CN_UNIFIED_KEY, JSON.stringify([...readArr(CN_UNIFIED_KEY).filter(c => c.id !== cn.id), cn]));
  localStorage.setItem(CN_KEY(company), JSON.stringify([...readArr(CN_KEY(company)).filter(c => c.id !== cn.id), cn]));
};

// ── CreditNote record type ────────────────────────────────────────────────────
// GAP-07: Maker-Checker. A CN starts as 'Pending Approval' (no GL impact) and
// only posts to GL once an approver — distinct from the maker — calls
// `approveCreditNote`. This mirrors the JV maker-checker pattern (FIN module).
export interface CreditNote {
  id:          string;
  company:     Company;
  invoiceId:   string;
  invoiceNo:   string;
  clientId:    string;
  clientName:  string;
  date:        string;
  reason:      string;
  amount:      number;        // amount being credited
  glTxId:      string;        // empty until approved
  status:      'Pending Approval' | 'Posted' | 'Void' | 'Rejected';
  createdBy:   string;
  createdAt:   string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  /** P1-08: set when the GL reversal posted but the COGS wind-back failed.
   *  Finance must manually post the COGS reversal — gross profit is overstated
   *  until they do. Surfaced as a badge on the finance dashboard. */
  cogsReversalPending?: boolean;
  cogsReversalError?:   string;
}

// ── Sequential CN numbering (Phase-2: atomic via Postgres allocate_serial) ──
// RC-9 fix: was a pure local counter with zero collision protection. Now
// issued by the same RPC that protects orderNo and invoice numbers.
const getNextCNNumber = async (company: Company): Promise<string> => {
  const year = new Date().getFullYear();
  const seq  = await allocateSerial(company, 'CN', year, 1);
  return `CN-${company.substring(0, 3).toUpperCase()}-${year}-${String(seq).padStart(4, '0')}`;
};

// ── localStorage helpers (kept for legacy reads — Supabase is source of truth) ──
const CN_KEY = (company: Company) => `gtk_erp_credit_notes_${company}`;

export const getCreditNotes = (company: Company): CreditNote[] => {
  // Legacy per-company key first, then unified key written by AsyncSalesService.
  try {
    const legacy = JSON.parse(localStorage.getItem(CN_KEY(company)) || '[]') as CreditNote[];
    const unified = JSON.parse(localStorage.getItem('gtk_erp_credit_notes') || '[]') as CreditNote[];
    const filteredUnified = unified.filter(c => c.company === company);
    // De-duplicate by id, prefer unified (more recent)
    const map = new Map<string, CreditNote>();
    for (const c of legacy)          map.set(c.id, c);
    for (const c of filteredUnified) map.set(c.id, c);
    return Array.from(map.values());
  } catch { return []; }
};

const persistCreditNote = (company: Company, cn: CreditNote): void => {
  // 1) Legacy per-company key (back-compat). Dedupe by id — GAP-07 introduces
  //    multi-stage CN lifecycle (Pending → Posted/Rejected), and a plain append
  //    would produce duplicate rows across status transitions.
  const legacy = (() => { try { return JSON.parse(localStorage.getItem(CN_KEY(company)) || '[]'); } catch { return []; } })();
  const legacyNext = [...legacy.filter((c: CreditNote) => c.id !== cn.id), cn];
  localStorage.setItem(CN_KEY(company), JSON.stringify(legacyNext));

  // 2) Unified key + Supabase push (new in migration 032)
  const unified = (() => { try { return JSON.parse(localStorage.getItem('gtk_erp_credit_notes') || '[]'); } catch { return []; } })();
  const next = [...unified.filter((c: CreditNote) => c.id !== cn.id), cn];
  localStorage.setItem('gtk_erp_credit_notes', JSON.stringify(next));
  // Fire-and-forget cloud push (queues for retry on failure via _queueRetry inside)
  AsyncSalesService.saveCreditNotes(next).catch(() => { /* queued for retry */ });
};

// ── Issue Credit Note (Maker step — no GL yet) ──────────────────────────────
// GAP-07: This now creates a pending CN only. Call `approveCreditNote` from
// a separate user to actually post the GL reversal and reduce the invoice
// balance. To preserve callers that expect single-step issuance, pass
// `approve: { approver, role }` and we'll auto-approve in the same call.
export async function issueCreditNote(params: {
  invoice:   Invoice;
  amount:    number;
  reason:    string;
  company:   Company;
  createdBy: string;
  /** Same-call auto-approve. Approver must be DIFFERENT from maker. */
  approve?:  { approver: string };
}): Promise<CreditNote> {
  const { invoice, amount, reason, company, createdBy, approve } = params;

  if (amount <= 0)              throw new Error('Credit note amount must be positive.');
  if (amount > invoice.balance) throw new Error(`Amount (${amount}) exceeds outstanding balance (${invoice.balance}).`);

  // Allocate the sequential CN number (atomic via Postgres allocate_serial).
  const cnId  = await getNextCNNumber(company);
  const today = new Date().toISOString().split('T')[0];

  // Persist the pending CN first — GL only posts after approval.
  const pendingCN: CreditNote = {
    id: cnId, company,
    invoiceId:  invoice.id,
    invoiceNo:  invoice.id,
    clientId:   invoice.clientId,
    clientName: invoice.clientName,
    date: today, reason, amount,
    glTxId: '',
    status: 'Pending Approval',
    createdBy,
    createdAt: new Date().toISOString(),
  };
  persistCreditNote(company, pendingCN);

  if (!approve) return pendingCN;

  if (approve.approver === createdBy) {
    throw new Error(
      `Maker-Checker violation: approver (${approve.approver}) must differ from maker (${createdBy}).`
    );
  }
  return approveCreditNote({ cnId, company, approver: approve.approver, invoice });
}

// ── Approve Credit Note (Checker step — posts GL + reduces balance) ─────────
export async function approveCreditNote(params: {
  cnId:     string;
  company:  Company;
  approver: string;
  /** Pass the live invoice so we don't re-read a stale localStorage copy. */
  invoice:  Invoice;
}): Promise<CreditNote> {
  const { cnId, company, approver, invoice } = params;

  const cn = getCreditNotes(company).find(c => c.id === cnId);
  if (!cn) throw new Error(`Credit note ${cnId} not found.`);
  if (cn.status !== 'Pending Approval') {
    throw new Error(`Credit note ${cnId} is "${cn.status}" — only Pending Approval CNs can be approved.`);
  }
  if (cn.createdBy === approver) {
    throw new Error(
      `Maker-Checker violation: approver (${approver}) must differ from maker (${cn.createdBy}).`
    );
  }

  const amount = cn.amount;
  // P1-14: re-assert amount <= the invoice's LIVE balance at APPROVAL time.
  // issueCreditNote checks this only at issue time; between issue and approve
  // (or with a receipt posted on another device/session) the balance can shrink,
  // so approval would over-credit AR past zero and overwrite the fresher receipt
  // balance. The caller (CreditNoteModule) passes a freshly-fetched invoice —
  // block if the CN now exceeds it. (+0.5 epsilon absorbs GST proportional-split
  // rounding.) The server-side FOR-UPDATE re-check belongs in the 090 RPC
  // migration (094); this is the client defence for the common single-user
  // issue -> receipt -> approve sequence.
  if (amount > (Number(invoice.balance) || 0) + 0.5) {
    throw new Error(
      `Credit note ${cnId} amount (${amount}) exceeds invoice ${invoice.id} live balance (${invoice.balance}) — the balance changed since issue (a receipt may have posted). Re-issue the credit note for the current balance.`
    );
  }
  const reason = cn.reason;
  const txId  = `GL-${cnId}`;
  const today = new Date().toISOString().split('T')[0];

  // ── Find AR account from original invoice GL ──────────────────────────────
  let allGL  = FinanceService.getLedger();
  let origTx = allGL.find(t => t.id === invoice.glTxId);

  // COLD-CACHE GUARD (P1-3): the invoice GL — and its GL-COGS-* sibling that the
  // COGS reversal below relies on — may live in the cloud but not in THIS
  // device's local finance cache (fresh login / cleared cache / old invoice;
  // gtk_erp_ledger is frequently empty). Without this, a cold cache wrongly
  // BLOCKS the CN here and makes reverseDeliveryCOGS silently skip. Refresh once
  // from cloud before giving up. Only fires on a miss, so warm caches (which may
  // hold unsynced writes) are never overwritten.
  if (!origTx) {
    await FinanceService.refresh();
    allGL  = FinanceService.getLedger();
    origTx = allGL.find(t => t.id === invoice.glTxId);
  }

  // Phase-7 (P2-2): hard-fail when the original GL entry can't be located.
  // Previously the code fell back to hard-coded account codes
  // (`${company}-12210`, `${company}-41110`) that may not exist or may
  // refer to the wrong client sub-ledger. Reconciliation broke silently
  // and the CFO had no signal anything was wrong. Better to refuse the
  // CN, force operator to investigate (restore from snapshot, post a
  // manual reversal JV, or rebuild the invoice GL).
  if (!origTx) {
    throw new Error(
      `Original invoice GL entry "${invoice.glTxId}" not found for ${invoice.id}. ` +
      `Cannot issue credit note — falling back to default accounts would break ` +
      `AR/Revenue reconciliation. Restore the GL entry from snapshot, post a ` +
      `manual reversal JV, or contact Finance.`
    );
  }

  // ── Derive AR / Revenue / GST lines from the original invoice GL ──────────
  // Original invoice GL (deliveryInvoiceService) posts:
  //   Dr AR (grandTotal) / Cr Revenue (net) / Cr GST Payable (gst)
  // P1-24: the CN must reverse GST Payable too, otherwise it stays overstated
  // forever after any CN on a GST-inclusive invoice. The CN `amount` is
  // GST-inclusive (it reduces the GST-inclusive balance), so we split it
  // proportionally between revenue and GST while keeping AR reduction = amount
  // exactly — this guarantees the entry balances AND keeps the AR sub-ledger
  // aligned with the invoice balance reduction posted below.
  const arDetail  = origTx.details?.find(d => d.debit > 0);
  const gstDetail = origTx.details?.find(d => d.credit > 0 && /GST/i.test(d.text || ''));
  const revDetail = origTx.details?.find(d => d.credit > 0 && !/GST/i.test(d.text || ''));
  if (!arDetail || !revDetail) {
    throw new Error(
      `Original invoice GL "${invoice.glTxId}" is malformed — missing debit or ` +
      `credit line. Cannot derive AR/Revenue accounts for credit note.`
    );
  }

  const invGst   = Number((invoice as any).gstAmount) || 0;
  const invGrand = Number(invoice.totalAmount) || amount;
  const gstReversal = (invGst > 0 && invGrand > 0 && gstDetail)
    ? Math.round(amount * invGst / invGrand)
    : 0;
  const revReversal = amount - gstReversal;   // remainder → entry always balances

  const reversalDetails: { accountId: string; debit: number; credit: number; text: string }[] = [
    { accountId: revDetail.accountId, debit: revReversal, credit: 0, text: `Revenue reversal: ${cnId}` },
  ];
  if (gstReversal > 0 && gstDetail) {
    reversalDetails.push({ accountId: gstDetail.accountId, debit: gstReversal, credit: 0, text: `GST reversal: ${cnId}` });
  }
  reversalDetails.push({ accountId: arDetail.accountId, debit: 0, credit: amount, text: `AR reduction: ${invoice.clientName}` });

  const newBalance = invoice.balance - amount;
  const newStatus  = newBalance <= 0 ? 'Paid' : invoice.status;

  // Reversing GL tx (Dr Revenue/GST, Cr AR). Deterministic id = GL-<cnId> so a
  // re-approve is caught by the RPC's gl_already_posted idempotency guard.
  const reversalTx: LedgerTransaction = {
    id: txId, company, docType: 'RV',
    docDate: today, date: today,
    description: `CREDIT NOTE ${cnId}: ${invoice.clientName} — ${reason}`,
    referenceId: invoice.id,
    status: 'Posted',
    details: reversalDetails,
    postedAt: new Date().toISOString(),
  };

  const approvedCN: CreditNote = {
    ...cn,
    glTxId: txId,
    status: 'Posted',
    approvedBy: approver,
    approvedAt: new Date().toISOString(),
  };

  // ── Audit #9: ONE atomic Postgres transaction (migration 090) ──────────────
  // Reversing GL + invoice-balance reduction + CN→Posted commit together or not
  // at all. A crash can no longer leave the GL reversed while the CN stays
  // "Pending Approval" (which a retry would double-reverse). Falls back to the
  // legacy 3-step path with ZERO behavior change when 090 is not yet applied.
  const { error: rpcError } = await supabase.rpc('credit_note_atomic', {
    p_payload: {
      company,
      cn_id: cnId,
      reversal_ledger_row: ledgerToRow(reversalTx),
      invoice_id: invoice.id,
      invoice_new_balance: Math.max(0, newBalance),
      invoice_new_status: newStatus === invoice.status ? null : newStatus,
      cn_data: approvedCN,
    },
  });

  if (rpcError && !isRpcMissing(rpcError)) {
    // Real atomic failure — nothing committed (no GL, no balance change, CN
    // still pending). Surface so the operator can retry safely.
    throw new Error(
      `Atomic credit-note post failed: ${rpcError.message || 'unknown'}. ` +
      `No GL entry, no balance change, credit note still pending — retry safely.`
    );
  }

  if (rpcError) {
    // migration 090 not applied → legacy non-atomic path (unchanged behavior).
    FinanceService.recordTransaction(reversalTx);
    const allInvoices = SalesService.getInvoices() as any[];
    SalesService.saveInvoices(
      allInvoices.map(i =>
        i.id === invoice.id
          ? { ...i, balance: Math.max(0, newBalance), status: newStatus }
          : i
      )
    );
    persistCreditNote(company, approvedCN);
  } else {
    // Cloud committed atomically → mirror to localStorage without re-pushing.
    mirrorLedgerLocal(reversalTx);
    mirrorInvoiceLocal(invoice.id, { balance: Math.max(0, newBalance), status: newStatus });
    mirrorCreditNoteLocal(company, approvedCN);
  }

  // ── Phase-3 (3.6): reverse COGS proportionally to the CN amount ──
  // Audit I6: previously gross profit was overstated forever after a CN
  // because the COGS posted at delivery was never wound back. Now we
  // also restore inventory value proportionally.
  try {
    reverseDeliveryCOGS({
      company,
      invoiceId: invoice.id,
      reversalAmount: amount,
      invoiceGrandTotal: Number(invoice.totalAmount) || amount,
      date: today,
      reason: `CN ${cnId}`,
      reversalSuffix: cnId,
    });
  } catch (cogsErr: unknown) {
    // P1-08: revenue/AR reversal is already committed, but the COGS wind-back
    // failed. Do NOT swallow — gross profit is overstated until a human posts
    // the COGS reversal. Flag the CN for the finance dashboard + alert now.
    const msg = errMsg(cogsErr);
    Logger.error('CreditNote', `COGS reversal failed for ${cnId}`, cogsErr);
    toast.error(`Credit note ${cnId} posted, but COGS reversal failed — finance review required.`, { duration: 8000 });
    approvedCN.cogsReversalPending = true;
    approvedCN.cogsReversalError   = msg;
    persistCreditNote(company, approvedCN);
  }

  // ── Financial Event ───────────────────────────────────────────────────────
  FinanceService.saveFinancialEvents([
    ...FinanceService.getFinancialEvents(),
    {
      id: `EVT-${cnId}`, company, date: today,
      sourceModule: 'Sales',
      description: `Credit Note ${cnId} — ${invoice.clientName} — PKR ${amount.toLocaleString()} — Approver: ${approver}`,
      amount, referenceId: cnId, status: 'Posted',
    },
  ]);

  return approvedCN;
}

// ── Reject Credit Note (Checker may also reject instead of approving) ──────
export async function rejectCreditNote(params: {
  cnId:     string;
  company:  Company;
  rejecter: string;
  reason:   string;
}): Promise<CreditNote> {
  const { cnId, company, rejecter, reason } = params;
  const cn = getCreditNotes(company).find(c => c.id === cnId);
  if (!cn) throw new Error(`Credit note ${cnId} not found.`);
  if (cn.status !== 'Pending Approval') {
    throw new Error(`Cannot reject a "${cn.status}" credit note — only Pending Approval.`);
  }
  if (cn.createdBy === rejecter) {
    throw new Error(
      `Maker-Checker violation: rejecter (${rejecter}) must differ from maker (${cn.createdBy}).`
    );
  }
  const rejected: CreditNote = {
    ...cn,
    status: 'Rejected',
    rejectedBy: rejecter,
    rejectedAt: new Date().toISOString(),
    rejectionReason: reason,
  };
  persistCreditNote(company, rejected);
  return rejected;
}

// ── Void Invoice (BA-01) ──────────────────────────────────────────────────────
export async function voidInvoice(params: {
  invoice:   Invoice;
  company:   Company;
  voidedBy:  string;
}): Promise<void> {
  const { invoice, company, voidedBy } = params;

  if (invoice.status === 'Paid') throw new Error('Cannot void a fully paid invoice.');
  if ((invoice as any).status === 'Voided') throw new Error('Invoice is already voided.');
  if (invoice.receivedAmount > 0)
    throw new Error(`Invoice has partial payments (PKR ${invoice.receivedAmount.toLocaleString()}). Issue a credit note instead.`);

  const voidId = `VOID-${invoice.id}`;
  const today  = new Date().toISOString().split('T')[0];

  let allGL  = FinanceService.getLedger();
  let origTx = allGL.find(t => t.id === invoice.glTxId);

  // COLD-CACHE GUARD (P1-3): hydrate the invoice GL (+ its GL-COGS-* sibling)
  // from cloud when it isn't in this device's local cache, so the void posts the
  // AR/Revenue reversal automatically instead of falling back to warnMissingGL(),
  // and so the COGS reversal below finds its tx instead of silently skipping.
  // Only fires on a miss — warm caches with unsynced writes are never touched.
  if (!origTx) {
    await FinanceService.refresh();
    allGL  = FinanceService.getLedger();
    origTx = allGL.find(t => t.id === invoice.glTxId);
  }

  // Reversal tx = exact swap of the original GL entry. null when origTx is
  // missing (bad/missing GL) — we still void, but Finance must post a manual JV.
  const reversalTx: LedgerTransaction | null = origTx
    ? {
        id: voidId, company, docType: 'RV',
        docDate: today, date: today,
        description: `VOID: ${invoice.id} — ${invoice.clientName} — Voided by ${voidedBy}`,
        referenceId: invoice.id,
        status: 'Posted',
        details: origTx.details.map(d => ({
          ...d,
          debit:  d.credit,   // swap debit/credit
          credit: d.debit,
          text:   `VOID ${d.text}`,
        })),
        postedAt: new Date().toISOString(),
      }
    : null;

  const invoicePatch = {
    revertedStatus: invoice.status,   // preserve prior (Partial / Outstanding)
    status: 'Voided',
    balance: 0,
    voidedBy,
    voidedAt: today,
  };
  const quotationId = invoice.orderId;

  // P2-23: origTx missing — void still proceeds (leaving it Outstanding
  // overstates AR), but the AR/Revenue reversal cannot be posted automatically.
  const warnMissingGL = (): void => {
    Logger.error(
      'CreditNote',
      `Void of ${invoice.id}: original GL "${invoice.glTxId}" not found — reversal NOT posted automatically`,
      undefined
    );
    toast.error(
      `Invoice ${invoice.id} voided, but its GL entry was not found — post the AR/Revenue reversal manually.`,
      { duration: 8000 }
    );
  };

  // ── Audit #9: ONE atomic Postgres transaction (migration 090) ──────────────
  // Reversing GL + invoice→Voided + quotation→Approved commit together or not
  // at all. A crash can no longer mark the invoice Voided while revenue stays
  // recognised, and FOR UPDATE + the Voided re-assert block a double-void.
  // Falls back to the legacy path with ZERO behavior change when 090 is absent.
  const { error: rpcError } = await supabase.rpc('void_invoice_atomic', {
    p_payload: {
      company,
      invoice_id: invoice.id,
      reversal_ledger_row: reversalTx ? ledgerToRow(reversalTx) : null,
      quotation_id: quotationId ?? null,
      voided_by: voidedBy,
      voided_at: today,
    },
  });

  if (rpcError && !isRpcMissing(rpcError)) {
    // Real atomic failure — invoice unchanged. Surface so the operator retries.
    throw new Error(
      `Atomic invoice void failed: ${rpcError.message || 'unknown'}. Invoice unchanged — retry safely.`
    );
  }

  if (rpcError) {
    // migration 090 not applied → legacy non-atomic path (unchanged behavior).
    if (reversalTx) {
      FinanceService.recordTransaction(reversalTx);
    } else {
      warnMissingGL();
    }
    const allInvoices = await AsyncSalesService.getInvoices() as any[];
    await AsyncSalesService.saveInvoices(
      allInvoices.map(i => (i.id === invoice.id ? { ...i, ...invoicePatch } : i))
    );
    const allQ = SalesService.getQuotations();
    SalesService.saveQuotations(
      allQ.map((q) =>
        q.id === invoice.orderId ? { ...q, status: 'Approved', invoiceNo: undefined } : q
      )
    );
  } else {
    // Cloud committed atomically → mirror to localStorage without re-pushing.
    if (reversalTx) mirrorLedgerLocal(reversalTx); else warnMissingGL();
    mirrorInvoiceLocal(invoice.id, invoicePatch);
    if (quotationId) mirrorQuotationLocal(quotationId);
  }

  // ── Phase-3 (3.6): reverse the COGS entry (full 100%) — best-effort, outside
  // the atomic txn (touches inventory via a separate service; already flagged
  // when it fails). Runs identically in both paths.
  try {
    reverseDeliveryCOGS({
      company,
      invoiceId: invoice.id,
      reversalAmount: Number(invoice.totalAmount) || 0,
      invoiceGrandTotal: Number(invoice.totalAmount) || 1,
      date: today,
      reason: `Void by ${voidedBy}`,
      reversalSuffix: voidId,
    });
  } catch (cogsErr: unknown) {
    // P1-08: GL reversal committed but COGS wind-back failed — alert, don't swallow.
    Logger.error('CreditNote', `COGS reversal failed on void of ${invoice.id}`, cogsErr);
    toast.error(`Invoice ${invoice.id} voided, but COGS reversal failed — finance review required.`, { duration: 8000 });
  }
}
