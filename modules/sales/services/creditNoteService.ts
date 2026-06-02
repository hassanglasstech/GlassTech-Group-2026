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
import { Invoice }  from '@/modules/finance/types/finance';
import { FinanceService } from '@/modules/finance/services/financeService';
import { SalesService }   from '@/modules/sales/services/salesService';
import { AsyncSalesService } from '@/modules/sales/services/asyncSalesService';
import { allocateSerial } from '@/modules/sales/services/serialAllocator';
import { reverseDeliveryCOGS } from '@/modules/procurement/services/glasscoGLService';
import { errMsg } from '@/modules/shared/services/utils';

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

  const today = new Date().toISOString().split('T')[0];

  // Allocate the sequential CN number atomically. This was previously missing:
  // `cnId` was referenced below but never defined, throwing a ReferenceError
  // on every credit-note issuance (feature was completely broken).
  const cnId = await getNextCNNumber(company);

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
  const reason = cn.reason;
  const txId  = `GL-${cnId}`;
  const today = new Date().toISOString().split('T')[0];

  // ── Find AR account from original invoice GL ──────────────────────────────
  const allGL  = FinanceService.getLedger();
  const origTx = allGL.find(t => t.id === invoice.glTxId);

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

  // AR account = the debit side of the original invoice GL
  const arDetail = origTx.details?.find(d => d.debit > 0);
  const revDetail = origTx.details?.find(d => d.credit > 0);
  if (!arDetail || !revDetail) {
    throw new Error(
      `Original invoice GL "${invoice.glTxId}" is malformed — missing debit or ` +
      `credit line. Cannot derive AR/Revenue accounts for credit note.`
    );
  }
  const arAccId  = arDetail.accountId;
  const revAccId = revDetail.accountId;

  // ── Post reversing GL ─────────────────────────────────────────────────────
  FinanceService.recordTransaction({
    id: txId, company, docType: 'RV',
    docDate: today, date: today,
    description: `CREDIT NOTE ${cnId}: ${invoice.clientName} — ${reason}`,
    referenceId: invoice.id,
    status: 'Posted',
    details: [
      { accountId: revAccId, debit: amount,  credit: 0,      text: `Revenue reversal: ${cnId}` },
      { accountId: arAccId,  debit: 0,       credit: amount, text: `AR reduction: ${invoice.clientName}` },
    ],
  });

  // ── Reduce invoice balance ────────────────────────────────────────────────
  const allInvoices = SalesService.getInvoices() as any[];
  const newBalance  = invoice.balance - amount;
  const newStatus   = newBalance <= 0 ? 'Paid' : invoice.status;

  SalesService.saveInvoices(
    allInvoices.map(i =>
      i.id === invoice.id
        ? { ...i, balance: Math.max(0, newBalance), status: newStatus }
        : i
    )
  );

  // ── Persist approved CN record (Supabase + localStorage) ────────────────
  const approvedCN: CreditNote = {
    ...cn,
    glTxId: txId,
    status: 'Posted',
    approvedBy: approver,
    approvedAt: new Date().toISOString(),
  };
  persistCreditNote(company, approvedCN);

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
  } catch (e: unknown) {
    console.warn(`[approveCreditNote] COGS reversal skipped for ${cnId}: ${errMsg(e)}`);
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

  const allGL  = FinanceService.getLedger();
  const origTx = allGL.find(t => t.id === invoice.glTxId);

  if (origTx) {
    // Post exact reversal of original GL entry
    FinanceService.recordTransaction({
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
    });
  }

  // ── Phase-3 (3.6): also reverse the COGS entry (full 100%) ──
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
  } catch (e: unknown) {
    console.warn(`[voidInvoice] COGS reversal skipped for ${invoice.id}: ${errMsg(e)}`);
  }

  // ── Mark invoice Voided (preserve prior status for restore) ──────────────
  const allInvoices = await AsyncSalesService.getInvoices() as any[];
  await AsyncSalesService.saveInvoices(
    allInvoices.map(i =>
      i.id === invoice.id
        ? {
            ...i,
            revertedStatus: i.status,         // preserve prior (Partial / Outstanding)
            status: 'Voided',
            balance: 0,
            voidedBy,
            voidedAt: today,
          }
        : i
    )
  );

  // ── Revert quotation to Approved ──────────────────────────────────────────
  const allQ = SalesService.getQuotations();
  SalesService.saveQuotations(
    allQ.map((q) =>
      q.id === invoice.orderId ? { ...q, status: 'Approved', invoiceNo: undefined } : q
    )
  );
}
