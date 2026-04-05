/**
 * intercompanyService.ts — Phase 6
 *
 * Automated dual-company GL posting for intercompany transfers.
 * When GlassCo sells glass to GTK:
 *   GlassCo: Dr Intercompany Receivable / Cr Revenue (or Inventory)
 *   GTK:     Dr Raw Material Inventory / Cr Intercompany Payable
 *
 * All transfers are logged in localStorage + Supabase.
 */

import { Company } from '@/modules/shared/types/core';
import { LedgerTransaction, LedgerDocType } from '@/modules/finance/types/finance';
import { FinanceService } from '@/modules/finance/services/financeService';
import { supabase } from '@/src/services/supabaseClient';
import { Logger } from '@/modules/shared/services/logger';
import { toast } from 'sonner';

export type TransferType =
  | 'Glass Supply'
  | 'Aluminium Supply'
  | 'Hardware Supply'
  | 'Services'
  | 'Cash Transfer'
  | 'Loan/Advance';

export interface IntercompanyTransfer {
  id:           string;
  fromCompany:  Company;
  toCompany:    Company;
  type:         TransferType;
  amount:       number;
  description:  string;
  date:         string;
  fromGLTxId:   string;
  toGLTxId:     string;
  status:       'Posted' | 'Reversed';
  postedBy:     string;
  createdAt:    string;
  referenceDoc?: string;
}

const ICO_KEY = 'gtk_erp_intercompany_transfers';

const _load = (): IntercompanyTransfer[] => {
  try { return JSON.parse(localStorage.getItem(ICO_KEY) || '[]'); } catch { return []; }
};
const _save = (data: IntercompanyTransfer[]) => localStorage.setItem(ICO_KEY, JSON.stringify(data));

// ── GL account codes per transfer type (from company side) ────────────
const FROM_ACCOUNTS: Record<TransferType, { debit: [string,string]; credit: [string,string] }> = {
  'Glass Supply':       { debit: ['122', 'Intercompany Receivable'],    credit: ['41110', 'Service Income'] },
  'Aluminium Supply':   { debit: ['122', 'Intercompany Receivable'],    credit: ['41110', 'Service Income'] },
  'Hardware Supply':    { debit: ['122', 'Intercompany Receivable'],    credit: ['41110', 'Service Income'] },
  'Services':           { debit: ['122', 'Intercompany Receivable'],    credit: ['41110', 'Service Income'] },
  'Cash Transfer':      { debit: ['122', 'Intercompany Receivable'],    credit: ['11112', 'Cash in Hand — Main'] },
  'Loan/Advance':       { debit: ['122', 'Intercompany Receivable'],    credit: ['11112', 'Cash in Hand — Main'] },
};

const TO_ACCOUNTS: Record<TransferType, { debit: [string,string]; credit: [string,string] }> = {
  'Glass Supply':       { debit: ['11511', 'Glass / Raw Material Inventory'], credit: ['221', 'Intercompany Payable'] },
  'Aluminium Supply':   { debit: ['11511', 'Aluminium Profiles — Stock'],     credit: ['221', 'Intercompany Payable'] },
  'Hardware Supply':    { debit: ['11513', 'Hardware & Accessories'],          credit: ['221', 'Intercompany Payable'] },
  'Services':           { debit: ['53817', 'Service Expense — Intercompany'], credit: ['221', 'Intercompany Payable'] },
  'Cash Transfer':      { debit: ['11112', 'Cash in Hand — Main'],            credit: ['221', 'Intercompany Payable'] },
  'Loan/Advance':       { debit: ['11421', 'Intercompany Advance'],           credit: ['221', 'Intercompany Payable'] },
};

const ensureIcoAccounts = (company: Company, side: 'from' | 'to', type: TransferType) => {
  const map = side === 'from' ? FROM_ACCOUNTS[type] : TO_ACCOUNTS[type];
  const [dCode, dName] = map.debit;
  const [cCode, cName] = map.credit;

  // Ensure parent hierarchy for intercompany accounts
  if (side === 'from') {
    const arParent  = FinanceService.ensureAccount(company, 'CURRENT ASSETS',          2, null, 'Asset', '11');
    const arCtrl    = FinanceService.ensureAccount(company, 'TRADE RECEIVABLES',        3, arParent.id, 'Asset', '12');
    FinanceService.ensureAccount(company, 'INTERCOMPANY RECEIVABLE', 4, arCtrl.id, 'Asset', '1220');
  } else {
    const liabParent = FinanceService.ensureAccount(company, 'CURRENT LIABILITIES',    2, null, 'Liability', '22');
    FinanceService.ensureAccount(company, 'INTERCOMPANY PAYABLE', 3, liabParent.id, 'Liability', '2210');
  }

  const debitAcc  = FinanceService.ensureAccount(company, dName, 5, null, side === 'from' ? 'Asset' : 'Asset',   dCode);
  const creditAcc = FinanceService.ensureAccount(company, cName, 5, null, side === 'from' ? 'Revenue' : 'Liability', cCode);
  return { debitAcc, creditAcc };
};

// ── Post transfer — both companies simultaneously ─────────────────────
export async function postIntercompanyTransfer(params: {
  fromCompany: Company;
  toCompany:   Company;
  type:        TransferType;
  amount:      number;
  description: string;
  date:        string;
  postedBy:    string;
  referenceDoc?: string;
}): Promise<IntercompanyTransfer> {
  const { fromCompany, toCompany, type, amount, description, date, postedBy, referenceDoc } = params;

  const id = `ICO-${Date.now().toString().slice(-8)}`;
  const fromGLTxId = `GL-${id}-FROM`;
  const toGLTxId   = `GL-${id}-TO`;

  // ── FROM company GL entry ─────────────────────────────────────────
  const fromAccs = ensureIcoAccounts(fromCompany, 'from', type);
  const fromTx: LedgerTransaction = {
    id: fromGLTxId, company: fromCompany, docType: 'JV' as LedgerDocType,
    docDate: date, date,
    description: `[ICO-OUT] ${type}: To ${toCompany} — ${description}`,
    referenceId: id, status: 'Posted',
    details: [
      { accountId: fromAccs.debitAcc.id,  debit: amount, credit: 0,      text: `ICO Receivable ← ${toCompany}` },
      { accountId: fromAccs.creditAcc.id, debit: 0,      credit: amount, text: `${type} supplied to ${toCompany}` },
    ],
  };

  // ── TO company GL entry ───────────────────────────────────────────
  const toAccs = ensureIcoAccounts(toCompany, 'to', type);
  const toTx: LedgerTransaction = {
    id: toGLTxId, company: toCompany, docType: 'JV' as LedgerDocType,
    docDate: date, date,
    description: `[ICO-IN] ${type}: From ${fromCompany} — ${description}`,
    referenceId: id, status: 'Posted',
    details: [
      { accountId: toAccs.debitAcc.id,  debit: amount, credit: 0,      text: `${type} received from ${fromCompany}` },
      { accountId: toAccs.creditAcc.id, debit: 0,      credit: amount, text: `ICO Payable → ${fromCompany}` },
    ],
  };

  // Post both in sequence — get current ledger, append both, save once
  const ledger = FinanceService.getLedger();
  ledger.push(fromTx, toTx);
  FinanceService.saveLedger(ledger);

  // ── Log transfer ──────────────────────────────────────────────────
  const transfer: IntercompanyTransfer = {
    id, fromCompany, toCompany, type, amount, description, date,
    fromGLTxId, toGLTxId, status: 'Posted', postedBy,
    createdAt: new Date().toISOString(), referenceDoc,
  };
  const all = _load();
  all.push(transfer);
  _save(all);

  // Supabase persist
  try {
    await supabase.from('intercompany_transfers').upsert([{
      id, from_company: fromCompany, to_company: toCompany, type, amount,
      description, date, from_gl_tx_id: fromGLTxId, to_gl_tx_id: toGLTxId,
      status: 'Posted', posted_by: postedBy, reference_doc: referenceDoc || null,
      updated_at: new Date().toISOString(),
    }]);
  } catch (e) {
    Logger.warn('IntercompanyService', 'Supabase persist failed', e);
  }

  toast.success(
    `ICO Transfer ${id} posted. ${fromCompany} Dr Receivable / ${toCompany} Dr ${type}. PKR ${amount.toLocaleString()}`,
    { duration: 6000 }
  );

  return transfer;
}

// ── Reverse a transfer ────────────────────────────────────────────────
export async function reverseIntercompanyTransfer(transferId: string, actor: string): Promise<void> {
  const all = _load();
  const t = all.find(x => x.id === transferId);
  if (!t) { toast.error('Transfer not found.'); return; }
  if (t.status === 'Reversed') { toast.error('Already reversed.'); return; }

  // Post reversal entries (swap debit/credit)
  const revId = `REV-${transferId}`;
  const ledger = FinanceService.getLedger();

  const fromOriginal = ledger.find(l => l.id === t.fromGLTxId);
  const toOriginal   = ledger.find(l => l.id === t.toGLTxId);

  if (fromOriginal) {
    ledger.push({
      ...fromOriginal,
      id: `${revId}-FROM`, docDate: new Date().toISOString().split('T')[0],
      date: new Date().toISOString().split('T')[0],
      description: `[REVERSAL] ${fromOriginal.description}`,
      details: fromOriginal.details.map(d => ({ ...d, debit: d.credit, credit: d.debit })),
    });
  }
  if (toOriginal) {
    ledger.push({
      ...toOriginal,
      id: `${revId}-TO`, docDate: new Date().toISOString().split('T')[0],
      date: new Date().toISOString().split('T')[0],
      description: `[REVERSAL] ${toOriginal.description}`,
      details: toOriginal.details.map(d => ({ ...d, debit: d.credit, credit: d.debit })),
    });
  }

  FinanceService.saveLedger(ledger);

  const idx = all.findIndex(x => x.id === transferId);
  all[idx].status = 'Reversed';
  _save(all);

  toast.success(`Transfer ${transferId} reversed by ${actor}.`);
}

export const IntercompanyService = {
  listTransfers: (company?: Company): IntercompanyTransfer[] => {
    const all = _load();
    return company
      ? all.filter(t => t.fromCompany === company || t.toCompany === company)
           .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      : all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  postTransfer: postIntercompanyTransfer,
  reverseTransfer: reverseIntercompanyTransfer,
};
