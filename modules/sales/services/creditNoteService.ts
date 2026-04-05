/**
 * creditNoteService.ts — Phase 2 (EC-01, BA-01)
 *
 * EC-01: Credit Note — partial/full reversal of a posted invoice
 * BA-01: Invoice Void — full reversal, marks invoice Voided
 *
 * GL pattern (mirror of deliveryInvoiceService):
 *   Credit Note: Dr Revenue  / Cr AR  (reduce both)
 *   Invoice Void: same as credit note for full amount + status → Voided
 */

import { Company } from '@/modules/shared/types/core';
import { Invoice }  from '@/modules/finance/types/finance';
import { FinanceService } from '@/modules/finance/services/financeService';
import { SalesService }   from '@/modules/sales/services/salesService';
import { AsyncSalesService } from '@/modules/sales/services/asyncSalesService';

// ── CreditNote record type ────────────────────────────────────────────────────
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
  glTxId:      string;
  status:      'Posted' | 'Void';
  createdBy:   string;
  createdAt:   string;
}

// ── Sequential CN numbering ───────────────────────────────────────────────────
const getNextCNNumber = (company: Company): string => {
  const year = new Date().getFullYear();
  const key  = `gtk_erp_cn_seq_${company}_${year}`;
  const next = parseInt(localStorage.getItem(key) || '0', 10) + 1;
  localStorage.setItem(key, String(next));
  return `CN-${company.substring(0, 3).toUpperCase()}-${year}-${String(next).padStart(4, '0')}`;
};

// ── localStorage helpers ──────────────────────────────────────────────────────
const CN_KEY = (company: Company) => `gtk_erp_credit_notes_${company}`;

export const getCreditNotes = (company: Company): CreditNote[] => {
  try { return JSON.parse(localStorage.getItem(CN_KEY(company)) || '[]'); } catch { return []; }
};

const saveCreditNotes = (company: Company, data: CreditNote[]) => {
  localStorage.setItem(CN_KEY(company), JSON.stringify(data));
};

// ── Issue Credit Note ─────────────────────────────────────────────────────────
export function issueCreditNote(params: {
  invoice:   Invoice;
  amount:    number;
  reason:    string;
  company:   Company;
  createdBy: string;
}): CreditNote {
  const { invoice, amount, reason, company, createdBy } = params;

  if (amount <= 0)              throw new Error('Credit note amount must be positive.');
  if (amount > invoice.balance) throw new Error(`Amount (${amount}) exceeds outstanding balance (${invoice.balance}).`);

  const cnId  = getNextCNNumber(company);
  const txId  = `GL-${cnId}`;
  const today = new Date().toISOString().split('T')[0];

  // ── Find AR account from original invoice GL ──────────────────────────────
  const allGL  = FinanceService.getLedger();
  const origTx = allGL.find(t => t.id === invoice.glTxId);

  // AR account = the debit side of the original invoice GL
  const arDetail = origTx?.details?.find(d => d.debit > 0);
  const arAccId  = arDetail?.accountId ?? `${company}-12210`;

  // Revenue account = credit side of original invoice GL
  const revDetail = origTx?.details?.find(d => d.credit > 0);
  const revAccId  = revDetail?.accountId ?? `${company}-41110`;

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

  // ── Persist CN record ─────────────────────────────────────────────────────
  const cn: CreditNote = {
    id: cnId, company,
    invoiceId:  invoice.id,
    invoiceNo:  invoice.id,
    clientId:   invoice.clientId,
    clientName: invoice.clientName,
    date: today, reason, amount,
    glTxId: txId,
    status: 'Posted',
    createdBy,
    createdAt: new Date().toISOString(),
  };
  saveCreditNotes(company, [...getCreditNotes(company), cn]);

  // ── Financial Event ───────────────────────────────────────────────────────
  FinanceService.saveFinancialEvents([
    ...FinanceService.getFinancialEvents(),
    {
      id: `EVT-${cnId}`, company, date: today,
      sourceModule: 'Sales',
      description: `Credit Note ${cnId} — ${invoice.clientName} — PKR ${amount.toLocaleString()}`,
      amount, referenceId: cnId, status: 'Posted',
    },
  ]);

  return cn;
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

  // ── Mark invoice Voided ───────────────────────────────────────────────────
  const allInvoices = await AsyncSalesService.getInvoices() as any[];
  await AsyncSalesService.saveInvoices(
    allInvoices.map(i =>
      i.id === invoice.id
        ? { ...i, status: 'Voided', balance: 0, voidedBy, voidedAt: today }
        : i
    )
  );

  // ── Revert quotation to Approved ──────────────────────────────────────────
  const allQ = SalesService.getQuotations();
  SalesService.saveQuotations(
    allQ.map((q: any) =>
      q.id === invoice.orderId ? { ...q, status: 'Approved', invoiceNo: undefined } : q
    )
  );
}
