// ═══════════════════════════════════════════════════════════════════════
//  financeService.ts — Core Finance Service
//  PHASE 1 MIGRATION: Supabase-Primary + In-Memory Cache
//  Pattern: hrService.ts — Supabase → in-memory cache → localStorage fallback
//  All GL data now lives in Supabase. localStorage = offline buffer only.
// ═══════════════════════════════════════════════════════════════════════

// ── Custom Error: GL Double-Entry Imbalance ────────────────────────────
// Thrown before ANY status flip to 'Posted'. React UI should catch this
// and surface the txId + amounts to the user — never swallow silently.
export class LedgerImbalanceError extends Error {
  constructor(
    public readonly txId:       string,
    public readonly sumDebits:  number,
    public readonly sumCredits: number,
    public readonly delta:      number,
  ) {
    super(
      `GL Imbalance in "${txId}": Σdebit ${sumDebits.toFixed(2)} ≠ Σcredit ${sumCredits.toFixed(2)} (delta ${delta >= 0 ? '+' : ''}${delta.toFixed(2)})`
    );
    this.name = 'LedgerImbalanceError';
    // Maintain proper prototype chain for instanceof checks across transpile targets
    Object.setPrototypeOf(this, LedgerImbalanceError.prototype);
  }
}

import { safeParse, safeSave } from '../../shared/services/utils';
import { supabase } from '@/src/services/supabaseClient';
import { Logger } from '@/modules/shared/services/logger';
import { toast } from 'sonner';
import { Company } from '../../shared/types/core';
import {
  Account, LedgerTransaction, LedgerDocType, CostCenter,
  PettyCashEntry, RecurringExpense, FinancialEvent,
  FinancialMappingRule, GLConfiguration
} from '../types/finance';
import { COMPANY_COA, COAAccount } from '../constants/coa.index';
import { PeriodService } from './periodService';
import { useAuthStore } from '@/modules/auth/authStore';

// ── GL Balance Assertion (private) ────────────────────────────────────
// Integer-cent arithmetic eliminates IEEE-754 rounding drift.
// Must be called before EVERY status transition to 'Posted'. Zero-tolerance.
const _assertGLBalance = (tx: { id?: string; details?: Array<{ debit?: number; credit?: number }> }): void => {
  const lines      = tx.details ?? [];
  const centsDebit  = Math.round(lines.reduce((s, d) => s + (d.debit  ?? 0), 0) * 100);
  const centsCredit = Math.round(lines.reduce((s, d) => s + (d.credit ?? 0), 0) * 100);
  if (centsDebit !== centsCredit) {
    throw new LedgerImbalanceError(
      tx.id ?? 'UNKNOWN',
      centsDebit  / 100,
      centsCredit / 100,
      (centsDebit - centsCredit) / 100,
    );
  }
};

// ── localStorage Keys (offline buffer only) ───────────────────────────
const KEYS = {
  ACCOUNTS:           'gtk_erp_accounts',
  LEDGER:             'gtk_erp_ledger',
  COST_CENTERS:       'gtk_erp_cost_centers',
  PETTY_CASH:         'gtk_erp_petty_cash',
  RECURRING_EXPENSES: 'gtk_erp_recurring_expenses',
  FINANCIAL_EVENTS:   'gtk_erp_financial_events',
  MAPPING_RULES:      'gtk_erp_mapping_rules',
  GL_CONFIG:          'gtk_erp_gl_config',
  STORE:              'gtk_erp_store',
};

// ── In-Memory Cache ───────────────────────────────────────────────────
let _cache = {
  accounts:          [] as Account[],
  ledger:            [] as LedgerTransaction[],
  costCenters:       [] as CostCenter[],
  pettyCash:         [] as PettyCashEntry[],
  recurringExpenses: [] as RecurringExpense[],
  financialEvents:   [] as FinancialEvent[],
  loaded: false,
};

// ── Mappers: Supabase row → App object ────────────────────────────────
const rowToAccount = (r: any): Account => ({
  id:       r.id,
  company:  r.company || '',
  code:     r.code     || r.data?.code     || '',
  name:     r.name     || r.data?.name     || '',
  level:    (r.level   || r.data?.level    || 1) as 1|2|3|4|5,
  parentId: r.parent_id ?? r.data?.parentId ?? null,
  type:     r.type     || r.data?.type     || 'Asset',
});

const rowToLedger = (r: any): LedgerTransaction => ({
  id:          r.id,
  company:     r.company || '',
  docType:     (r.doc_type   || r.data?.docType   || 'JV') as LedgerDocType,
  docDate:     r.doc_date    || r.data?.docDate    || '',
  date:        r.date        || r.data?.date       || '',
  description: r.description || r.data?.description || '',
  referenceId: r.reference_id ?? r.data?.referenceId ?? '',
  status:      r.status      || r.data?.status     || 'Parked',
  details:     Array.isArray(r.details) ? r.details : (r.data?.details || []),
  reqId:       r.req_id      ?? r.data?.reqId      ?? undefined,
});

const rowToCostCenter = (r: any): CostCenter => ({
  id:            r.id,
  company:       r.company        || '',
  code:          r.code           || r.data?.code          || '',
  name:          r.name           || r.data?.name          || '',
  department:    r.department     || r.data?.department     || '',
  manager:       r.manager        || r.data?.manager        || '',
  category:      (r.category      || r.data?.category       || 'H') as 'F'|'H'|'W'|'V'|'L',
  hierarchyArea: r.hierarchy_area || r.data?.hierarchyArea  || '',
  budgetMonthly: r.data?.budgetMonthly ?? undefined,
  budgetYearly:  r.data?.budgetYearly  ?? undefined,
  alertThreshold:r.data?.alertThreshold ?? 80,
});

const rowToPettyCash = (r: any): PettyCashEntry => ({
  id:                  r.id,
  company:             r.company             || '',
  date:                r.date                || '',
  description:         r.description         || '',
  type:                (r.type               || 'Payment') as 'Receipt'|'Payment',
  amount:              Number(r.amount       || 0),
  balance:             Number(r.data?.balance || 0),
  recordedBy:          r.data?.recordedBy    || '',
  status:              (r.status             || 'Parked') as 'Posted'|'Parked'|'Ignored', // M-7: unified default — no entry auto-goes live
  glAccountId:         r.data?.glAccountId   ?? undefined,
  businessTransaction: r.data?.businessTransaction ?? undefined,
  referenceDoc:        r.reference_doc       || r.data?.referenceDoc || undefined,
  targetCompany:       r.data?.targetCompany ?? undefined,
  costCenterId:        r.data?.costCenterId  ?? undefined,
});

const rowToRecurring = (r: any): RecurringExpense => ({
  id:              r.id,
  company:         r.company          || '',
  name:            r.description      || r.data?.name || '',
  amount:          Number(r.amount    || 0),
  debitAccountId:  r.data?.debitAccountId  || '',
  creditAccountId: r.data?.creditAccountId || '',
  costCenterId:    r.data?.costCenterId    || '',
  dayOfMonth:      r.data?.dayOfMonth      || 1,
  lastPostedMonth: r.data?.lastPostedMonth ?? undefined,
});

const rowToFinancialEvent = (r: any): FinancialEvent => ({
  id:           r.id,
  company:      r.company      || '',
  date:         r.date         || '',
  sourceModule: (r.data?.sourceModule || 'Inventory') as 'Inventory'|'PettyCash'|'Sales'|'HR',
  description:  r.description  || r.data?.description || '',
  amount:       Number(r.amount || 0),
  referenceId:  r.reference    || r.data?.referenceId || undefined,
  status:       (r.status      || 'Pending') as 'Pending'|'Posted'|'Ignored',
  suggestedGlId: r.data?.suggestedGlId ?? undefined,
});

// ── Load all finance data from Supabase into cache ────────────────────
const _loadCache = async (): Promise<void> => {
  try {
    const [
      { data: accounts },
      { data: ledger },
      { data: costCenters },
      { data: pettyCash },
      { data: recurring },
      { data: events },
    ] = await Promise.all([
      supabase.from('accounts').select('*'),
      supabase.from('ledger').select('*'),
      supabase.from('cost_centers').select('*'),
      supabase.from('petty_cash').select('*'),
      supabase.from('recurring_expenses').select('*'),
      supabase.from('financial_events').select('*'),
    ]);

    if (accounts?.length)    { _cache.accounts          = accounts.map(rowToAccount);          safeSave(KEYS.ACCOUNTS,           _cache.accounts); }
    if (ledger?.length)      { _cache.ledger             = ledger.map(rowToLedger);             safeSave(KEYS.LEDGER,             _cache.ledger); }
    if (costCenters?.length) { _cache.costCenters        = costCenters.map(rowToCostCenter);    safeSave(KEYS.COST_CENTERS,       _cache.costCenters); }
    if (pettyCash?.length)   { _cache.pettyCash          = pettyCash.map(rowToPettyCash);       safeSave(KEYS.PETTY_CASH,         _cache.pettyCash); }
    if (recurring?.length)   { _cache.recurringExpenses  = recurring.map(rowToRecurring);       safeSave(KEYS.RECURRING_EXPENSES, _cache.recurringExpenses); }
    if (events?.length)      { _cache.financialEvents    = events.map(rowToFinancialEvent);     safeSave(KEYS.FINANCIAL_EVENTS,   _cache.financialEvents); }

    _cache.loaded = true;
    Logger.info('Finance', `Cache loaded — ${_cache.ledger.length} GL entries, ${_cache.accounts.length} accounts`);
  } catch (err: any) {
    Logger.warn('Finance', 'Supabase load failed — using localStorage fallback', err);
    _cache.accounts          = safeParse(KEYS.ACCOUNTS);
    _cache.ledger            = safeParse(KEYS.LEDGER);
    _cache.costCenters       = safeParse(KEYS.COST_CENTERS);
    _cache.pettyCash         = safeParse(KEYS.PETTY_CASH);
    _cache.recurringExpenses = safeParse(KEYS.RECURRING_EXPENSES);
    _cache.financialEvents   = safeParse(KEYS.FINANCIAL_EVENTS);
    _cache.loaded = true;
  }
};

// ── Push helpers: App object → Supabase row ───────────────────────────
const accountToRow = (a: Account) => ({
  id: a.id, company: a.company, code: a.code, name: a.name,
  level: a.level, parent_id: a.parentId ?? null, type: a.type,
  updated_at: new Date().toISOString(),
});

const ledgerToRow = (t: LedgerTransaction) => ({
  id: t.id, company: t.company, doc_type: t.docType, doc_date: t.docDate,
  date: t.date, description: t.description,
  reference_id: t.referenceId ?? null, status: t.status,
  details: t.details ?? [],
  data: { reqId: t.reqId },
  created_by: t.createdBy ?? useAuthStore.getState().user?.email ?? null,
  updated_by: t.updatedBy ?? useAuthStore.getState().user?.email ?? null,
  posted_at:  t.postedAt ?? null,
  updated_at: new Date().toISOString(),
});

const pettyCashToRow = (e: PettyCashEntry) => ({
  id: e.id, company: e.company, date: e.date, type: e.type,
  amount: e.amount, description: e.description,
  reference_doc: e.referenceDoc ?? null, status: e.status,
  data: {
    balance: e.balance, recordedBy: e.recordedBy,
    glAccountId: e.glAccountId, businessTransaction: e.businessTransaction,
    targetCompany: e.targetCompany, costCenterId: e.costCenterId,
  },
  updated_at: new Date().toISOString(),
});

// ── Supabase upsert — visible error, never silent ─────────────────────
const _upsert = async (table: string, rows: any[], label: string): Promise<void> => {
  try {
    const { error } = await supabase.from(table).upsert(rows);
    if (error) {
      Logger.error('Finance', `${label} upsert failed`, error);
      toast.error(`GL sync failed (${label}) — saved locally, will retry on next sync.`, {
        id: `finance-sync-${table}`, duration: 5000,
      });
    }
  } catch (err: any) {
    Logger.error('Finance', `${label} exception`, err);
    toast.error(`GL sync error (${label}) — offline mode active.`, {
      id: `finance-err-${table}`, duration: 5000,
    });
  }
};

// ── Flatten COA tree into Account[] ───────────────────────────────────
const flattenCOA = (nodes: COAAccount[], company: Company, parentId: string | null = null): Account[] => {
  const result: Account[] = [];
  for (const node of nodes) {
    const acc: Account = {
      id: `${company}-${node.code}`, company,
      code: node.code, name: node.name,
      level: node.level as 1|2|3|4|5,
      parentId, type: node.type as Account['type'],
    };
    result.push(acc);
    if (node.children) result.push(...flattenCOA(node.children, company, acc.id));
  }
  return result;
};

// ═══════════════════════════════════════════════════════════════════════
//  GL SUBCATEGORY MAPPING
// ═══════════════════════════════════════════════════════════════════════

interface GLMapping {
  debitCode: string; debitName: string;
  creditCode: string; creditName: string;
}

const GTK_GL_MAP: Record<string, GLMapping> = {
  'Material / Inventory':   { debitCode:'11513', debitName:'Hardware & Accessories',            creditCode:'11112', creditName:'Cash in Hand — Main' },
  'BOM Hardware':           { debitCode:'11513', debitName:'Hardware & Accessories',            creditCode:'11112', creditName:'Cash in Hand — Main' },
  'Aluminium Profiles':     { debitCode:'11511', debitName:'Aluminium Profiles — Stock',        creditCode:'11112', creditName:'Cash in Hand — Main' },
  'Consumables':            { debitCode:'11531', debitName:'Consumables — Fabrication',         creditCode:'11112', creditName:'Cash in Hand — Main' },
  'Glass Purchase':         { debitCode:'11512', debitName:'Glass Sheets — Stock',              creditCode:'11112', creditName:'Cash in Hand — Main' },
  'Tool Purchase':          { debitCode:'12113', debitName:'Fabrication Tools & Equipment',     creditCode:'11112', creditName:'Cash in Hand — Main' },
  'Tool Replacement':       { debitCode:'12113', debitName:'Fabrication Tools & Equipment',     creditCode:'11112', creditName:'Cash in Hand — Main' },
  'Machine Parts':          { debitCode:'53621', debitName:'Fabrication Machine — Maintenance', creditCode:'11112', creditName:'Cash in Hand — Main' },
  'Maintenance / R&M':      { debitCode:'53621', debitName:'Fabrication Machine — Maintenance', creditCode:'11112', creditName:'Cash in Hand — Main' },
  'Vehicle Fuel':           { debitCode:'53511', debitName:'Vehicle Fuel — Office/Admin',       creditCode:'11112', creditName:'Cash in Hand — Main' },
  'Vehicle Maintenance':    { debitCode:'53512', debitName:'Vehicle Maintenance — Admin',       creditCode:'11112', creditName:'Cash in Hand — Main' },
  'General Expense':        { debitCode:'53817', debitName:'Miscellaneous Expenses',            creditCode:'11112', creditName:'Cash in Hand — Main' },
  'TA/DA':                  { debitCode:'53122', debitName:'Conveyance Allowance',              creditCode:'11112', creditName:'Cash in Hand — Main' },
  'Fare Expense':           { debitCode:'53122', debitName:'Conveyance Allowance',              creditCode:'11112', creditName:'Cash in Hand — Main' },
  'Scrap':                  { debitCode:'11112', debitName:'Cash in Hand — Main',               creditCode:'56113', creditName:'Inventory Write-Off' },
  'Loan Request':           { debitCode:'11421', debitName:'Employee Advances',                 creditCode:'11112', creditName:'Cash in Hand — Main' },
  'Salary Advance':         { debitCode:'11421', debitName:'Employee Advances',                 creditCode:'11112', creditName:'Cash in Hand — Main' },
  'Repair & Maintenance':   { debitCode:'53621', debitName:'Fabrication Machine — Maintenance', creditCode:'11112', creditName:'Cash in Hand — Main' },
  'Fuel Expense':           { debitCode:'53622', debitName:'Generator (15 KVA) — Fuel',         creditCode:'11112', creditName:'Cash in Hand — Main' },
};

const COMPANY_GL_OVERRIDES: Record<string, Record<string, Partial<GLMapping>>> = {
  Glassco: { 'Material / Inventory': { debitCode:'11512', debitName:'Glass Sheets — Stock' } },
};

const PAYMENT_CREDIT_MAP: Record<string, { code: string; name: string }> = {
  'Cash':             { code:'11112', name:'Cash in Hand — Main' },
  'Petty Cash':       { code:'11111', name:'Petty Cash — GTK' },
  'Personal Account': { code:'21114', name:'Payable — Other Vendors' },
  'Bank Transfer':    { code:'11121', name:'Bank — MCB Current' },
};

// ═══════════════════════════════════════════════════════════════════════
//  FinanceService — Exported API
// ═══════════════════════════════════════════════════════════════════════

export const FinanceService = {

  // ── GL Balance Assertion (public proxy) ────────────────────────────
  // Exposed so batch-posting UIs (e.g. BillingHub) can validate entries
  // before calling saveLedger. Throws LedgerImbalanceError on imbalance.
  assertGLBalance: (tx: { id?: string; details?: Array<{ debit?: number; credit?: number }> }): void => {
    _assertGLBalance(tx);
  },

  // ── Init / Refresh ─────────────────────────────────────────────────
  init: async (): Promise<void> => {
    if (!_cache.loaded) await _loadCache();
  },

  refresh: async (): Promise<void> => {
    _cache.loaded = false;
    await _loadCache();
  },

  // ── Accounts ───────────────────────────────────────────────────────
  getAccounts: (): Account[] => {
    if (!_cache.loaded) return safeParse(KEYS.ACCOUNTS);
    return _cache.accounts;
  },

  saveAccounts: (d: Account[]): void => {
    _cache.accounts = d;
    safeSave(KEYS.ACCOUNTS, d);
    _upsert('accounts', d.map(accountToRow), 'accounts');
  },

  // ── General Ledger ─────────────────────────────────────────────────
  getLedger: (): LedgerTransaction[] => {
    if (!_cache.loaded) return safeParse(KEYS.LEDGER);
    return _cache.ledger;
  },

  saveLedger: (d: LedgerTransaction[]): void => {
    _cache.ledger = d;
    safeSave(KEYS.LEDGER, d);
    _upsert('ledger', d.map(ledgerToRow), 'ledger');
  },

  // ── Cost Centers ───────────────────────────────────────────────────
  getCostCenters: (): CostCenter[] => {
    if (!_cache.loaded) return safeParse(KEYS.COST_CENTERS);
    return _cache.costCenters;
  },

  saveCostCenters: (d: CostCenter[]): void => {
    _cache.costCenters = d;
    safeSave(KEYS.COST_CENTERS, d);
    const rows = d.map(c => ({
      id: c.id, company: c.company, code: c.code, name: c.name,
      department: c.department, manager: c.manager, category: c.category,
      hierarchy_area: c.hierarchyArea,
      data: { budgetMonthly: c.budgetMonthly, budgetYearly: c.budgetYearly, alertThreshold: c.alertThreshold },
      updated_at: new Date().toISOString(),
    }));
    _upsert('cost_centers', rows, 'cost_centers');
  },

  // ── Petty Cash ─────────────────────────────────────────────────────
  getPettyCashEntries: (): PettyCashEntry[] => {
    if (!_cache.loaded) return safeParse(KEYS.PETTY_CASH);
    return _cache.pettyCash;
  },

  savePettyCashEntries: (d: PettyCashEntry[]): void => {
    _cache.pettyCash = d;
    safeSave(KEYS.PETTY_CASH, d);
    _upsert('petty_cash', d.map(pettyCashToRow), 'petty_cash');
  },

  // ── Recurring Expenses ─────────────────────────────────────────────
  getRecurringExpenses: (): RecurringExpense[] => {
    if (!_cache.loaded) return safeParse(KEYS.RECURRING_EXPENSES);
    return _cache.recurringExpenses;
  },

  saveRecurringExpenses: (d: RecurringExpense[]): void => {
    _cache.recurringExpenses = d;
    safeSave(KEYS.RECURRING_EXPENSES, d);
    const rows = d.map(r => ({
      id: r.id, company: r.company, description: r.name, amount: r.amount,
      data: {
        name: r.name, debitAccountId: r.debitAccountId,
        creditAccountId: r.creditAccountId, costCenterId: r.costCenterId,
        dayOfMonth: r.dayOfMonth, lastPostedMonth: r.lastPostedMonth,
      },
      updated_at: new Date().toISOString(),
    }));
    _upsert('recurring_expenses', rows, 'recurring_expenses');
  },

  // ── Financial Events ───────────────────────────────────────────────
  getFinancialEvents: (): FinancialEvent[] => {
    if (!_cache.loaded) return safeParse(KEYS.FINANCIAL_EVENTS);
    return _cache.financialEvents;
  },

  saveFinancialEvents: (d: FinancialEvent[]): void => {
    _cache.financialEvents = d;
    safeSave(KEYS.FINANCIAL_EVENTS, d);
    const rows = d.map(e => ({
      id: e.id, company: e.company, date: e.date,
      description: e.description, amount: e.amount,
      status: e.status, reference: e.referenceId,
      data: { sourceModule: e.sourceModule, suggestedGlId: e.suggestedGlId },
      updated_at: new Date().toISOString(),
    }));
    _upsert('financial_events', rows, 'financial_events');
  },

  // ── Config (localStorage only) ─────────────────────────────────────
  getMappingRules: (): FinancialMappingRule[] => safeParse(KEYS.MAPPING_RULES),
  getGLConfig:     (): GLConfiguration[]      => safeParse(KEYS.GL_CONFIG),

  // ── Legacy compat ──────────────────────────────────────────────────
  loadAccountsAsync: async (): Promise<void> => { await FinanceService.init(); },

  // ── Seed Default COA ───────────────────────────────────────────────
  seedDefaultCOA: (): void => {
    const existing = FinanceService.getAccounts();
    const companies: Company[] = ['GTK', 'GTI', 'Glassco', 'Nippon', 'Factory'];
    for (const co of companies) {
      const coaTree = COMPANY_COA[co];
      if (!coaTree) continue;
      if (existing.some(a => a.company === co)) continue;
      existing.push(...flattenCOA(coaTree, co));
    }
    FinanceService.saveAccounts(existing);
  },

  // ── Ensure Account ─────────────────────────────────────────────────
  ensureAccount: (company: Company, name: string, level: number, parentId: string | null, type: Account['type'], code: string): Account => {
    const all = FinanceService.getAccounts();
    const key = `${company}-${code}`;
    let acc = all.find(a => a.id === key || (a.company === company && a.code === code));
    if (acc) return acc;
    acc = { id: key, company, code, name, level: level as 1|2|3|4|5, parentId, type };
    all.push(acc);
    FinanceService.saveAccounts(all);
    return acc;
  },

  // ── Resolve Subcategory → GL Accounts ──────────────────────────────
  resolveSubcategoryGL: (company: Company, subCategory: string, paymentMode?: string): GLMapping | null => {
    const override = COMPANY_GL_OVERRIDES[company]?.[subCategory];
    const base = GTK_GL_MAP[subCategory];
    if (!base) return null;
    const mapping = { ...base, ...override };
    if (paymentMode && PAYMENT_CREDIT_MAP[paymentMode]) {
      const pm = PAYMENT_CREDIT_MAP[paymentMode];
      mapping.creditCode = pm.code;
      mapping.creditName = pm.name.replace('GTK', company === 'GTK' ? 'GTK' : company);
    }
    return mapping;
  },

  // ── Record a single transaction ─────────────────────────────────────
  recordTransaction: (tx: LedgerTransaction): void => {
    const txDate = tx.date || tx.docDate || new Date().toISOString().split('T')[0];
    if (!PeriodService.isPeriodOpen(tx.company, txDate)) {
      const month = txDate.slice(0, 7);
      toast.error(`Period ${month} is CLOSED — GL entry blocked. Re-open the period in Finance → Configuration → Period Manager.`, { duration: 8000 });
      throw new Error(`Period ${month} is closed for company ${tx.company}`);
    }
    // C-4: Assert balance before allowing any directly-Posted transaction through
    if ((tx.status || 'Parked') === 'Posted') _assertGLBalance(tx);
    const currentUser = useAuthStore.getState().user?.email ?? 'system';
    const now = new Date().toISOString();
    const all = FinanceService.getLedger();
    all.push({
      ...tx,
      status:    tx.status || 'Parked',
      createdBy: tx.createdBy ?? currentUser,
      updatedBy: currentUser,
      postedAt:  tx.status === 'Posted' ? now : tx.postedAt,
    });
    FinanceService.saveLedger(all);
  },

  // ── Store Purchase subcategories ────────────────────────────────────
  STORE_PURCHASE_SUBS: ['BOM Hardware', 'Aluminium Profiles', 'Consumables', 'Glass Purchase',
    'Tool Purchase', 'Tool Replacement', 'Machine Parts', 'Material / Inventory'] as string[],

  // ── Create Parked Payment Voucher ───────────────────────────────────
  createParkedPV: (req: any): LedgerTransaction => {
    const company = req.company as Company;
    const subCategory = req.subCategory || req.reqType || 'General Expense';
    const paymentMode = req.paymentMode || 'Cash';
    const amount = req.totalValue || req.loanAmount || req.amount || 0;
    const isStorePurchase = FinanceService.STORE_PURCHASE_SUBS.includes(subCategory);

    const itemDesc = req.items?.length
      ? req.items.map((i: any) => i.materialDesc).filter(Boolean).join(', ').slice(0, 80)
      : req.headerText || subCategory;

    const pvId = `PV-${company.slice(0,3).toUpperCase()}-${Date.now().toString().slice(-8)}`;

    const creditMap: Record<string, { code: string; name: string }> = {
      'Cash':             { code: '11112', name: 'Cash in Hand — Main' },
      'Petty Cash':       { code: '11111', name: 'Petty Cash' },
      'Personal Account': { code: '21114', name: 'Payable — Other Vendors' },
      'Bank Transfer':    { code: '11121', name: 'Bank — MCB Current' },
    };
    const creditAcc = creditMap[paymentMode] || creditMap['Cash'];

    let debitCode: string, debitName: string, pvDesc: string;
    if (isStorePurchase) {
      debitCode = '11421'; debitName = 'Employee Advances';
      pvDesc = `[PARKED] ADVANCE — ${subCategory.toUpperCase()}: ${itemDesc}`.toUpperCase();
    } else {
      const gl = FinanceService.resolveSubcategoryGL(company, subCategory, paymentMode);
      debitCode = gl?.debitCode || '53817';
      debitName = gl?.debitName || 'Miscellaneous Expenses';
      pvDesc = `[PARKED] ${subCategory.toUpperCase()}: ${itemDesc}`.toUpperCase();
    }

    const pv: LedgerTransaction = {
      id: pvId, company, docType: 'PV' as LedgerDocType,
      docDate: req.date || new Date().toISOString().split('T')[0],
      date: req.date || new Date().toISOString().split('T')[0],
      description: pvDesc, referenceId: req.id, status: 'Parked', reqId: req.id,
      details: [
        { accountId: `${company}-${debitCode}`, debit: amount, credit: 0,
          text: `${debitCode} ${debitName}${isStorePurchase ? ' [ADVANCE]' : ''}`,
          costCenterId: req.items?.[0]?.costCenter || undefined },
        { accountId: `${company}-${creditAcc.code}`, debit: 0, credit: amount,
          text: `${creditAcc.code} ${creditAcc.name} | ${paymentMode || 'Cash'}` },
      ],
    };

    const all = FinanceService.getLedger();
    all.push(pv);
    FinanceService.saveLedger(all);
    return pv;
  },

  // ── Settle Advance on GRN ───────────────────────────────────────────
  settleAdvance: (params: {
    company: Company; reqId: string; grnId: string;
    actualAmount: number; categoryTotals: Record<string, number>; purchaserName?: string;
  }): { settlementId: string; variance: number; status: 'Exact' | 'Under-spend' | 'Over-spend' } => {
    const { company, reqId, grnId, actualAmount, categoryTotals, purchaserName } = params;
    const today = new Date().toISOString().split('T')[0];
    const allGL = FinanceService.getLedger();

    const advanceEntry =
      allGL.find(t => t.reqId === reqId && t.status === 'Posted' && t.details?.some(d => d.text?.includes('[ADVANCE]'))) ||
      allGL.find(t => t.reqId === reqId && t.details?.some(d => d.text?.includes('[ADVANCE]')));

    const advanceAmount = advanceEntry
      ? advanceEntry.details.reduce((s, d) => s + (d.debit || 0), 0) : 0;
    const variance = actualAmount - advanceAmount;
    const settlementId = `SETTLE-${grnId}`;
    const details: any[] = [];

    for (const [cat, amt] of Object.entries(categoryTotals)) {
      const glMap: Record<string, { code: string; name: string }> = {
        'Hardware':   { code: '11513', name: 'Hardware & Accessories' },
        'Profile':    { code: '11511', name: 'Aluminium Profiles — Stock' },
        'Consumable': { code: '11531', name: 'Consumables — Fabrication' },
        'Raw':        { code: '11513', name: 'Hardware & Accessories' },
        'Service':    { code: '53817', name: 'Miscellaneous Expenses' },
      };
      const gl = glMap[cat] || glMap['Hardware'];
      details.push({ accountId: `${company}-${gl.code}`, debit: Math.round(amt), credit: 0,
        text: `${gl.code} ${gl.name} — GRN actual` });
    }

    const advanceClearAmount = Math.min(advanceAmount, actualAmount);

    // Named reference — NEVER use positional index (array order mutation = silent GL corruption).
    // Since JS objects are passed by reference, mutating advanceClearDetail also mutates the
    // object already held inside the details[] array — intentional and safe.
    const advanceClearDetail: { accountId: string; debit: number; credit: number; text: string } | null =
      advanceClearAmount > 0
        ? { accountId: `${company}-11421`, debit: 0, credit: Math.round(advanceClearAmount),
            text: `11421 Employee Advances — Settled vs ${reqId}` }
        : null;
    if (advanceClearDetail) details.push(advanceClearDetail);

    if (variance < 0) {
      // Under-spend: purchaser returns unspent portion.
      // Gross the advance-clear credit up to the full advance so GL balances:
      //   Σdebit  = Σcategory actuals + cash refund = actualAmount + (advanceAmount - actualAmount) = advanceAmount
      //   Σcredit = advanceAmount ✓
      if (advanceClearDetail) advanceClearDetail.credit = Math.round(advanceAmount);
      details.push({ accountId: `${company}-11112`, debit: Math.round(Math.abs(variance)), credit: 0,
        text: `11112 Cash — Refund from ${purchaserName || 'purchaser'}` });
    } else if (variance > 0) {
      // Over-spend: company pays extra out of cash.
      //   Σdebit  = Σcategory actuals = actualAmount
      //   Σcredit = advanceClearAmount (= advanceAmount) + extra cash = actualAmount ✓
      details.push({ accountId: `${company}-11112`, debit: 0, credit: Math.round(variance),
        text: `11112 Cash — Extra payment to ${purchaserName || 'purchaser'}` });
    }

    const settleTx: LedgerTransaction = {
      id: settlementId, company, docType: 'JV' as LedgerDocType,
      docDate: today, date: today,
      description: `[PARKED] ADVANCE SETTLEMENT: ${reqId} → ${grnId} | Advance: ${advanceAmount} | Actual: ${actualAmount}`.toUpperCase(),
      referenceId: grnId, reqId, status: 'Parked', details,
    };
    allGL.push(settleTx);
    FinanceService.saveLedger(allGL);
    return { settlementId, variance, status: variance === 0 ? 'Exact' : variance < 0 ? 'Under-spend' : 'Over-spend' };
  },

  // ── Get Outstanding Advances ────────────────────────────────────────
  getOutstandingAdvances: (company: Company): any[] => {
    const allGL = FinanceService.getLedger().filter(t => t.company === company);
    return allGL
      .filter(t => t.details?.some(d => d.text?.includes('[ADVANCE]')))
      .map(pv => {
        const advanceAmt = pv.details.reduce((s, d) => s + (d.debit || 0), 0);
        const settlement = allGL.find(t => t.id?.startsWith('SETTLE-') && t.reqId === pv.reqId);
        const settledAmt = settlement
          ? settlement.details.filter(d => d.accountId?.includes('11421')).reduce((s, d) => s + (d.credit || 0), 0)
          : 0;
        let purchaser = 'Unknown';
        try {
          const reqs = safeParse('gtk_erp_requisitions') as any[];
          const req = reqs.find(r => r.id === pv.reqId);
          purchaser = req?.requisitioner || req?.employeeName || 'Unknown';
        } catch (e: any) {
          Logger.warn('Finance', 'Requisition lookup failed in advance tracker', e);
        }
        return {
          reqId: pv.reqId || pv.referenceId, pvId: pv.id, amount: advanceAmt,
          date: pv.date, description: pv.description?.replace('[PARKED] ', '').replace('ADVANCE — ', '') || '',
          purchaser, settled: !!settlement, settledAmount: settledAmt,
          status: pv.status, variance: settlement ? (settledAmt - advanceAmt) : null,
        };
      }).sort((a, b) => b.date.localeCompare(a.date));
  },

  // ── Post Parked PV ──────────────────────────────────────────────────
  postParkedPV: (pvId: string): LedgerTransaction | null => {
    const all = FinanceService.getLedger();
    const idx = all.findIndex(t => t.id === pvId);
    if (idx === -1) return null;
    const pv = all[idx];
    if (pv.status !== 'Parked') return pv;
    // C-5: Atomic GL balance assertion — throws LedgerImbalanceError before any write
    _assertGLBalance(pv);
    all[idx] = { ...pv, status: 'Posted' };
    FinanceService.saveLedger(all);
    if (pv.reqId) {
      try {
        const reqs = safeParse('gtk_erp_requisitions');
        const reqIdx = reqs.findIndex((r: any) => r.id === pv.reqId);
        if (reqIdx !== -1) {
          reqs[reqIdx] = {
            ...reqs[reqIdx], paymentStatus: 'Paid',
            paidAmount: pv.details.reduce((s: number, d: any) => s + (d.debit || 0), 0),
            paymentRef: pvId, paymentDate: new Date().toISOString().split('T')[0],
          };
          safeSave('gtk_erp_requisitions', reqs);
        }
      } catch (e) { Logger.warn('Finance', 'Failed to update requisition payment status', e); }
    }
    return all[idx];
  },

  // ── Cost Center Spend ───────────────────────────────────────────────
  getCostCenterSpend: (company: Company, costCenterId: string): { posted: number; parked: number; total: number } => {
    const ledger = FinanceService.getLedger().filter(t => t.company === company);
    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    let posted = 0, parked = 0;
    for (const tx of ledger) {
      if (!tx.date?.startsWith(monthStr)) continue;
      for (const d of (tx.details || [])) {
        if (d.costCenterId !== costCenterId) continue;
        const amt = d.debit || 0;
        if (tx.status === 'Posted') posted += amt;
        else if (tx.status === 'Parked') parked += amt;
      }
    }
    return { posted, parked, total: posted + parked };
  },

  // ── Budget Check ────────────────────────────────────────────────────
  checkBudget: (company: Company, costCenterId: string): { alert: boolean; pct: number; name: string } => {
    const cc = FinanceService.getCostCenters().filter(c => c.company === company).find(c => c.id === costCenterId);
    if (!cc || !cc.budgetMonthly) return { alert: false, pct: 0, name: cc?.name || '' };
    const spend = FinanceService.getCostCenterSpend(company, costCenterId);
    const pct = Math.round((spend.total / cc.budgetMonthly) * 100);
    return { alert: pct >= (cc.alertThreshold || 80), pct, name: cc.name };
  },

  // ── Stock Alerts ────────────────────────────────────────────────────
  getStockAlerts: (company: Company): any[] => {
    try {
      return (safeParse(KEYS.STORE) as any[])
        .filter((s: any) => s.company === company && s.quantity <= (s.reorderPoint || s.minLevel || 5))
        .map((s: any) => ({
          id: s.id, name: s.name, quantity: s.quantity,
          minLevel: s.minLevel || s.reorderPoint || 5,
          category: s.category, status: s.quantity <= 0 ? 'OUT_OF_STOCK' : 'LOW',
        }));
    } catch { return []; }
  },

  // ── Post Depreciation ───────────────────────────────────────────────
  postDepreciation: (company: Company, month: string): { posted: number; skipped: number } => {
    try {
      const assets: any[] = safeParse('gtk_erp_assets');
      const all = FinanceService.getLedger();
      let posted = 0, skipped = 0;
      for (const asset of assets.filter((a: any) => a.company === company && a.status === 'Active')) {
        const depAmount = (asset.purchaseValue || 0) / ((asset.usefulLifeYears || 5) * 12);
        if (depAmount <= 0) { skipped++; continue; }
        const existingId = `DEP-${asset.id}-${month}`;
        if (all.some(t => t.id === existingId)) { skipped++; continue; }
        // H-2: Compute rounded integer ONCE and assign the exact same variable to
        // both legs. Independent Math.round() calls on a float can theoretically
        // diverge; a single variable guarantees debit === credit before _assertGLBalance.
        const depCents = Math.round(depAmount);
        const depEntry = {
          id: existingId, company, docType: 'JV' as LedgerDocType,
          docDate: `${month}-28`, date: `${month}-28`,
          description: `DEPRECIATION — ${asset.description || asset.name} — ${month}`.toUpperCase(),
          referenceId: asset.id, status: 'Posted' as const,
          createdBy: 'system-auto', updatedBy: 'system-auto',
          postedAt: new Date().toISOString(),
          details: [
            { accountId: `${company}-53911`, debit: depCents, credit: 0,        text: `Dep: ${asset.name}` },
            { accountId: `${company}-12121`, debit: 0,        credit: depCents, text: `Accum Dep: ${asset.name}` },
          ],
        };
        // C-5: Atomic balance assertion before committing any Posted entry
        _assertGLBalance(depEntry);
        all.push(depEntry);
        posted++;
      }
      FinanceService.saveLedger(all);
      return { posted, skipped };
    } catch (e) { Logger.error('Finance', 'Depreciation posting error', e); return { posted: 0, skipped: 0 }; }
  },

  // ── Post Recurring Expenses ─────────────────────────────────────────
  postRecurringExpenses: (company: Company): { posted: number; skipped: number } => {
    try {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const all = FinanceService.getLedger();
      const updatedTemplates = [...FinanceService.getRecurringExpenses()];
      let posted = 0, skipped = 0;
      for (const template of updatedTemplates.filter(r => r.company === company)) {
        if (template.lastPostedMonth === currentMonth) { skipped++; continue; }
        const txId = `RE-${template.id}-${currentMonth}`;
        if (all.some(t => t.id === txId)) { skipped++; continue; }
        const recurringEntry = {
          id: txId, company, docType: 'SA' as LedgerDocType,
          docDate: `${currentMonth}-${String(template.dayOfMonth).padStart(2,'0')}`,
          date: `${currentMonth}-${String(template.dayOfMonth).padStart(2,'0')}`,
          description: `[AUTO] RECURRING: ${template.name}`.toUpperCase(),
          referenceId: template.id, status: 'Posted' as const,
          createdBy: 'system-auto', updatedBy: 'system-auto',
          postedAt: new Date().toISOString(),
          details: [
            { accountId: template.debitAccountId, debit: template.amount, credit: 0, text: 'AUTO POST', costCenterId: template.costCenterId },
            { accountId: template.creditAccountId, debit: 0, credit: template.amount, text: 'AUTO OFFSET' },
          ],
        };
        // C-5: Atomic balance assertion before committing any Posted entry
        _assertGLBalance(recurringEntry);
        all.push(recurringEntry);
        const tIdx = updatedTemplates.findIndex(t => t.id === template.id);
        if (tIdx !== -1) updatedTemplates[tIdx] = { ...updatedTemplates[tIdx], lastPostedMonth: currentMonth };
        posted++;
      }
      FinanceService.saveLedger(all);
      FinanceService.saveRecurringExpenses(updatedTemplates);
      return { posted, skipped };
    } catch (e) { Logger.error('Finance', 'Recurring expense posting error', e); return { posted: 0, skipped: 0 }; }
  },

};
