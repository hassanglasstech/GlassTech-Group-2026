/**
 * intercompanyService.ts — Phase 2 Migration
 * SUPABASE-PRIMARY. localStorage = offline fallback only.
 * intercompany_transfers table added in migration 005.
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

// ── Local fallback helpers ────────────────────────────────────────────
const getLocal  = (): IntercompanyTransfer[] => { try { return JSON.parse(localStorage.getItem(ICO_KEY) || '[]'); } catch { return []; } };
const saveLocal = (d: IntercompanyTransfer[]) => { try { localStorage.setItem(ICO_KEY, JSON.stringify(d)); } catch {} };

const rowToTransfer = (r: any): IntercompanyTransfer => ({
  id:           r.id,
  fromCompany:  r.from_company,
  toCompany:    r.to_company,
  type:         r.type,
  amount:       Number(r.amount || 0),
  description:  r.description || '',
  date:         r.date || '',
  fromGLTxId:   r.from_gl_tx_id || '',
  toGLTxId:     r.to_gl_tx_id   || '',
  status:       r.status || 'Posted',
  postedBy:     r.posted_by || '',
  createdAt:    r.created_at || new Date().toISOString(),
  referenceDoc: r.reference_doc ?? undefined,
});

// ── GL account maps (unchanged) ───────────────────────────────────────
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
  if (side === 'from') {
    const arParent = FinanceService.ensureAccount(company, 'CURRENT ASSETS',   2, null, 'Asset', '11');
    const arCtrl   = FinanceService.ensureAccount(company, 'TRADE RECEIVABLES', 3, arParent.id, 'Asset', '12');
    FinanceService.ensureAccount(company, 'INTERCOMPANY RECEIVABLE', 4, arCtrl.id, 'Asset', '1220');
  } else {
    const liabParent = FinanceService.ensureAccount(company, 'CURRENT LIABILITIES', 2, null, 'Liability', '22');
    FinanceService.ensureAccount(company, 'INTERCOMPANY PAYABLE', 3, liabParent.id, 'Liability', '2210');
  }
  const debitAcc  = FinanceService.ensureAccount(company, dName, 5, null, side === 'from' ? 'Asset' : 'Asset',   dCode);
  const creditAcc = FinanceService.ensureAccount(company, cName, 5, null, side === 'from' ? 'Revenue' : 'Liability', cCode);
  return { debitAcc, creditAcc };
};

// ── Post transfer ─────────────────────────────────────────────────────
export async function postIntercompanyTransfer(params: {
  fromCompany: Company; toCompany: Company; type: TransferType;
  amount: number; description: string; date: string;
  postedBy: string; referenceDoc?: string;
}): Promise<IntercompanyTransfer> {
  const { fromCompany, toCompany, type, amount, description, date, postedBy, referenceDoc } = params;

  const id        = `ICO-${Date.now().toString().slice(-8)}`;
  const fromGLTxId = `GL-${id}-FROM`;
  const toGLTxId   = `GL-${id}-TO`;

  const fromAccs = ensureIcoAccounts(fromCompany, 'from', type);
  const toAccs   = ensureIcoAccounts(toCompany,   'to',   type);

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

  const ledger = FinanceService.getLedger();
  ledger.push(fromTx, toTx);
  FinanceService.saveLedger(ledger);

  const transfer: IntercompanyTransfer = {
    id, fromCompany, toCompany, type, amount, description, date,
    fromGLTxId, toGLTxId, status: 'Posted', postedBy,
    createdAt: new Date().toISOString(), referenceDoc,
  };

  // ── Supabase PRIMARY write ────────────────────────────────────────
  try {
    const { error } = await supabase.from('intercompany_transfers').upsert([{
      id,
      from_company:   fromCompany,
      to_company:     toCompany,
      type,
      amount,
      description,
      date,
      from_gl_tx_id:  fromGLTxId,
      to_gl_tx_id:    toGLTxId,
      status:         'Posted',
      posted_by:      postedBy,
      reference_doc:  referenceDoc || null,
      updated_at:     new Date().toISOString(),
    }]);
    if (error) Logger.warn('IntercompanyService', 'Supabase write failed', error);
  } catch (e) {
    Logger.warn('IntercompanyService', 'Supabase unavailable — saved locally', e);
  }

  // Local cache update
  const local = getLocal();
  local.push(transfer);
  saveLocal(local);

  toast.success(
    `ICO Transfer ${id} posted. ${fromCompany} → ${toCompany}. PKR ${amount.toLocaleString()}`,
    { duration: 6000 }
  );
  return transfer;
}

// ── Reverse transfer ──────────────────────────────────────────────────
export async function reverseIntercompanyTransfer(transferId: string, actor: string): Promise<void> {
  const all = getLocal();
  const t = all.find(x => x.id === transferId);
  if (!t) { toast.error('Transfer not found.'); return; }
  if (t.status === 'Reversed') { toast.error('Already reversed.'); return; }

  const revId  = `REV-${transferId}`;
  const ledger = FinanceService.getLedger();

  const fromOriginal = ledger.find(l => l.id === t.fromGLTxId);
  const toOriginal   = ledger.find(l => l.id === t.toGLTxId);
  const today = new Date().toISOString().split('T')[0];

  if (fromOriginal) ledger.push({
    ...fromOriginal, id: `${revId}-FROM`, docDate: today, date: today,
    description: `[REVERSAL] ${fromOriginal.description}`,
    details: fromOriginal.details.map(d => ({ ...d, debit: d.credit, credit: d.debit })),
  });
  if (toOriginal) ledger.push({
    ...toOriginal, id: `${revId}-TO`, docDate: today, date: today,
    description: `[REVERSAL] ${toOriginal.description}`,
    details: toOriginal.details.map(d => ({ ...d, debit: d.credit, credit: d.debit })),
  });
  FinanceService.saveLedger(ledger);

  const idx = all.findIndex(x => x.id === transferId);
  all[idx].status = 'Reversed';
  saveLocal(all);

  try {
    await supabase.from('intercompany_transfers')
      .update({ status: 'Reversed', updated_at: new Date().toISOString() })
      .eq('id', transferId);
  } catch (e) {
    Logger.warn('IntercompanyService', 'Supabase reverse failed', e);
  }

  toast.success(`Transfer ${transferId} reversed by ${actor}.`);
}

// ── List transfers — SUPABASE FIRST ──────────────────────────────────
export const IntercompanyService = {
  listTransfers: async (company?: Company): Promise<IntercompanyTransfer[]> => {
    try {
      let q = supabase
        .from('intercompany_transfers')
        .select('*')
        .order('created_at', { ascending: false });

      const { data, error } = await q;
      if (error || !data) return getLocal().filter(t =>
        !company || t.fromCompany === company || t.toCompany === company
      );

      const mapped = data.map(rowToTransfer).filter(t =>
        !company || t.fromCompany === company || t.toCompany === company
      );
      saveLocal(mapped);
      return mapped;
    } catch {
      const local = getLocal();
      return company
        ? local.filter(t => t.fromCompany === company || t.toCompany === company)
        : local;
    }
  },
  postTransfer:    postIntercompanyTransfer,
  reverseTransfer: reverseIntercompanyTransfer,
};
