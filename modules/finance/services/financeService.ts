// ═══════════════════════════════════════════════════════════════════════
//  financeService.ts — Core Finance Service
//  PHASE 1 MIGRATION: Supabase-Primary + In-Memory Cache
//  Pattern: hrService.ts — Supabase → in-memory cache → localStorage fallback
//  All GL data now lives in Supabase. localStorage = offline buffer only.
// ═══════════════════════════════════════════════════════════════════════

// GL double-entry balance logic extracted to a dependency-free module
// (audit #13) so tests import the REAL assertion, not an inline copy.
// Re-exported here for backward compatibility (many callers import
// LedgerImbalanceError from financeService).
import { LedgerImbalanceError, assertGLBalance as _assertGLBalance } from './glBalance';
export { LedgerImbalanceError };

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
import { SOFT_DELETE_ENABLED } from '../../shared/config/softDelete';
import { PeriodService } from './periodService';
import { useAuthStore, UserRole } from '@/modules/auth/authStore';
import { useAppStore } from '@/modules/shared/store/appStore';

// ── Active company resolver (mirrors asyncSalesService.activeCompany) ──
// The sidebar switcher updates ONLY appStore.selectedCompany. The go-live
// user's profile.company is 'GTK' (super_admin seed) while App.tsx forces
// selectedCompany='Nippon'. Loading the finance cache by profile.company
// fetched GTK accounts/ledger, so the Nippon COA, trial balance, statements,
// aging and posting inbox all rendered EMPTY. Prefer the selected company;
// fall back to the auth profile only before the app store has bootstrapped.
const activeCompany = (): string => {
  try {
    const sel = useAppStore.getState().selectedCompany;
    if (sel) return sel;
  } catch { /* appStore not initialised yet */ }
  return useAuthStore.getState().profile?.company ?? '';
};

// _assertGLBalance is now imported from ./glBalance (single source of truth).

// ── Audit #6 (Layer 1): report aggregation shapes ─────────────────────
// Exported so report components consume the exact type the async getters
// return (server RPC or JS fallback — same shape either way).

/** One Trial Balance row — the account plus its rolled-up Dr/Cr totals. */
export interface TrialBalanceRow extends Account {
  debit:  number;
  credit: number;
  net:    number;        // absolute value of (debit − credit)
  side:   'Dr' | 'Cr';   // natural side of the net balance
}

/** AR aging bucket totals (app vocabulary: 0-30 / 31-60 / 61-90 / 90+). */
export interface ARAgingBuckets {
  '0-30':  number;
  '31-60': number;
  '61-90': number;
  '90+':   number;
  total:   number;
}

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

// ── Ledger dirty-set snapshot (audit #3 — safe-incremental GL writes) ──
// PROBLEM: saveLedger previously re-uploaded the ENTIRE ledger array on every
// posting (`_upsert('ledger', d.map(ledgerToRow))`). With two users holding
// stale caches, each whole-array push clobbers the other's rows — classic
// whole-array last-write-wins. Yet the DOMINANT GL op is an APPEND (a brand-new
// balanced entry): the new row's id is unique, so it can NEVER truly collide
// with another user's row. The whole-array push manufactured a collision that
// the append itself never had.
//
// FIX: track a per-tx snapshot and push ONLY the new/changed rows. An append
// is "new" (its id is absent from the snapshot) → pushed alone; rows that
// another tab/user changed this session, but that THIS save did not touch,
// are left out of the payload entirely → no clobber.
//
// Key   = LedgerTransaction.id
// Value = a stable JSON hash of the DOMAIN object (JSON.stringify(tx)).
//   ⚠ We hash the DOMAIN tx, NOT ledgerToRow(tx). ledgerToRow injects
//     `updated_at: new Date().toISOString()` (and resolves created_by/updated_by
//     from the auth store) which changes on every call — hashing its output
//     would mark every row "changed" and defeat the whole purpose.
//
// Retry safety: flushRetryQueue (audit #4) still rebuilds the WHOLE ledger from
// the local buffer on a terminal push failure, so a failed dirty push is fully
// recovered on next init/online. The dirty-set is a fast-path optimisation for
// the happy path; the retry queue remains the durable safety net. Deletes are
// out of scope (audit #5) — this only ever pushes new/changed rows, never removes.
const _ledgerPushSnapshot = new Map<string, string>();

// Reset + reseed the snapshot from a freshly-loaded ledger. Called after the
// cache is populated (Supabase or localStorage fallback) so the first save
// after a load does NOT treat every already-persisted row as "changed".
const _seedLedgerSnapshot = (ledger: LedgerTransaction[]): void => {
  _ledgerPushSnapshot.clear();
  for (const tx of ledger) _ledgerPushSnapshot.set(tx.id, JSON.stringify(tx));
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
  status:      (r.status || r.data?.status || 'Parked') as LedgerTransaction['status'],
  details:     Array.isArray(r.details) ? r.details : (r.data?.details || []),
  reqId:       r.req_id  ?? r.data?.reqId  ?? undefined,
  // Maker-Checker audit fields (Task 1 — Phase 9)
  draftedBy:   r.drafted_by  ?? undefined,
  approvedBy:  r.approved_by ?? undefined,
  createdBy:   r.created_by  ?? undefined,
  updatedBy:   r.updated_by  ?? undefined,
  postedAt:    r.posted_at   ?? undefined,
  // Audit #5: harmless read — undefined when the column is absent (pre-089).
  deletedAt:   r.deleted_at  ?? undefined,
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
// SEC-1: company is resolved from the authenticated user's profile so the
// DB-level RLS policy and the application filter are both in effect.
// Neither can be bypassed independently.
const _loadCache = async (): Promise<void> => {
  const company = activeCompany();
  if (!company) {
    Logger.warn('Finance', '_loadCache called with no company — skipping Supabase load');
    return;
  }
  try {
    const [
      { data: accounts },
      { data: ledger },
      { data: costCenters },
      { data: pettyCash },
      { data: recurring },
      { data: events },
    ] = await Promise.all([
      supabase.from('accounts').select('*').eq('company', company),
      supabase.from('ledger').select('*').eq('company', company),
      supabase.from('cost_centers').select('*').eq('company', company),
      supabase.from('petty_cash').select('*').eq('company', company),
      supabase.from('recurring_expenses').select('*').eq('company', company),
      supabase.from('financial_events').select('*').eq('company', company),
    ]);

    if (accounts?.length)    { _cache.accounts          = accounts.map(rowToAccount);          safeSave(KEYS.ACCOUNTS,           _cache.accounts); }
    if (ledger?.length)      { _cache.ledger             = ledger.map(rowToLedger);             safeSave(KEYS.LEDGER,             _cache.ledger); }
    if (costCenters?.length) { _cache.costCenters        = costCenters.map(rowToCostCenter);    safeSave(KEYS.COST_CENTERS,       _cache.costCenters); }
    if (pettyCash?.length)   { _cache.pettyCash          = pettyCash.map(rowToPettyCash);       safeSave(KEYS.PETTY_CASH,         _cache.pettyCash); }
    if (recurring?.length)   { _cache.recurringExpenses  = recurring.map(rowToRecurring);       safeSave(KEYS.RECURRING_EXPENSES, _cache.recurringExpenses); }
    if (events?.length)      { _cache.financialEvents    = events.map(rowToFinancialEvent);     safeSave(KEYS.FINANCIAL_EVENTS,   _cache.financialEvents); }

    _cache.loaded = true;
    // Audit #3: seed the dirty-set from the just-loaded ledger so the first
    // saveLedger after a load pushes ONLY new/changed rows, not the whole array.
    _seedLedgerSnapshot(_cache.ledger);
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
    // Audit #3: seed the dirty-set from the localStorage-fallback ledger too.
    _seedLedgerSnapshot(_cache.ledger);
  }
};

// ── Push helpers: App object → Supabase row ───────────────────────────
const accountToRow = (a: Account) => ({
  id: a.id, company: a.company, code: a.code, name: a.name,
  level: a.level, parent_id: a.parentId ?? null, type: a.type,
  is_active: true,
  updated_at: new Date().toISOString(),
});

// Sprint 1: exported so deliveryInvoiceService can build atomic-RPC payloads
// without re-implementing the column mapping. Keep this in lockstep with the
// Supabase `ledger` table column list (migration 003 + 20260434).
export const ledgerToRow = (t: LedgerTransaction) => ({
  id: t.id, company: t.company, doc_type: t.docType, doc_date: t.docDate,
  date: t.date, description: t.description,
  reference_id: t.referenceId ?? null, status: t.status,
  details: t.details ?? [],
  data: { reqId: t.reqId },
  // Maker-Checker columns (Task 1 — Phase 9)
  drafted_by:     t.draftedBy  ?? null,
  approved_by:    t.approvedBy ?? null,
  jv_approved_at: (t.docType === 'JV' && t.approvedBy && t.postedAt) ? t.postedAt : null,
  // Standard audit columns
  created_by:  t.createdBy ?? useAuthStore.getState().user?.email ?? null,
  updated_by:  t.updatedBy ?? useAuthStore.getState().user?.email ?? null,
  posted_at:   t.postedAt  ?? null,
  updated_at:  new Date().toISOString(),
  // Audit #5: carry the tombstone through the push. Omitted entirely while
  // SOFT_DELETE_ENABLED is false so pre-migration upserts never reference a
  // non-existent column.
  ...(SOFT_DELETE_ENABLED ? { deleted_at: t.deletedAt ?? null } : {}),
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

// ── Durable retry register (audit #4) ────────────────────────────────
// Before this fix, a terminal _upsert failure only showed a toast claiming
// "will retry on next sync" — but nothing ever retried: the entry stayed in
// localStorage, shown as posted, and never reached Supabase. Now every
// terminal failure is recorded here and re-pushed on app init and whenever
// the browser comes back online (rows are rebuilt from the local buffer at
// flush time, so the retry always pushes the CURRENT state).
const RETRY_KEY = 'gtk_erp_finance_retry_tables';
interface FinanceRetryEntry { table: string; label: string; failedAt: string }
let _retryListenerWired = false;
let _companySwitchWired = false;   // P1-6: reload finance cache on company switch (wire once)

const _recordRetry = (table: string, label: string): void => {
  const cur: FinanceRetryEntry[] = safeParse(RETRY_KEY);
  const next = cur.filter(r => r.table !== table); // dedupe per table
  next.push({ table, label, failedAt: new Date().toISOString() });
  safeSave(RETRY_KEY, next);
};

// ── Supabase upsert — visible error, never silent ─────────────────────
const _upsert = async (table: string, rows: any[], label: string): Promise<void> => {
  // Retry on transient Postgres errors (deadlock detected, statement timeout,
  // serialization failure). Exponential backoff: 100ms, 300ms, 900ms.
  const TRANSIENT_PATTERNS = ['deadlock detected', 'could not serialize', 'statement timeout'];
  const isTransient = (msg: string) =>
    TRANSIENT_PATTERNS.some(p => (msg || '').toLowerCase().includes(p));

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
      if (!error) return; // success

      if (attempt < 2 && isTransient(error.message)) {
        Logger.warn('Finance', `${label} upsert transient error (attempt ${attempt + 1}): ${error.message}`);
        await new Promise(r => setTimeout(r, 100 * Math.pow(3, attempt)));
        continue;
      }

      Logger.error('Finance', `${label} upsert failed`, error);
      _recordRetry(table, label);
      toast.error(`GL sync failed (${label}) — saved locally, queued for auto-retry.`, {
        id: `finance-sync-${table}`, duration: 5000,
      });
      return;
    } catch (err: any) {
      if (attempt < 2 && isTransient(err?.message || '')) {
        await new Promise(r => setTimeout(r, 100 * Math.pow(3, attempt)));
        continue;
      }
      Logger.error('Finance', `${label} exception`, err);
      _recordRetry(table, label);
      toast.error(`GL sync error (${label}) — saved locally, queued for auto-retry.`, {
        id: `finance-err-${table}`, duration: 5000,
      });
      return;
    }
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
    // Audit #4: drain any GL pushes that terminally failed in a previous
    // session (fire-and-forget), and re-drain whenever we come back online.
    void FinanceService.flushRetryQueue();
    if (typeof window !== 'undefined' && !_retryListenerWired) {
      _retryListenerWired = true;
      window.addEventListener('online', () => { void FinanceService.flushRetryQueue(); });
    }
    // P1-6: the cache is loaded ONCE for the boot company. Without this, every
    // cache-fed finance report (trial balance, GL, statements, dashboards) keeps
    // showing the boot company's data after a sidebar company switch. Subscribe
    // once so a selectedCompany change re-pulls the finance cache for the new
    // company. refresh() sets _cache.loaded=false then reloads via activeCompany().
    if (!_companySwitchWired) {
      _companySwitchWired = true;
      useAppStore.subscribe((state, prev) => {
        if (state.selectedCompany && state.selectedCompany !== prev.selectedCompany) {
          void FinanceService.refresh();
        }
      });
    }
  },

  refresh: async (): Promise<void> => {
    _cache.loaded = false;
    await _loadCache();
  },

  // ── Durable retry drain (audit #4) ─────────────────────────────────
  // Re-pushes tables whose last cloud upsert terminally failed. Rows are
  // rebuilt from the CURRENT local buffer, so the newest state wins. Only
  // tables with module-scope row mappers are rebuildable here; others are
  // dropped from the register (they re-push on their next save anyway).
  flushRetryQueue: async (): Promise<void> => {
    const pending: FinanceRetryEntry[] = safeParse(RETRY_KEY);
    if (!pending.length) return;

    const remaining: FinanceRetryEntry[] = [];
    for (const entry of pending) {
      let rows: any[] | null = null;
      switch (entry.table) {
        case 'accounts':   rows = FinanceService.getAccounts().map(accountToRow); break;
        case 'ledger':     rows = FinanceService.getLedger().map(ledgerToRow); break;
        case 'petty_cash': rows = FinanceService.getPettyCashEntries().map(pettyCashToRow); break;
        default:
          Logger.warn('Finance', `retry-queue: no row builder for ${entry.table} — dropping (re-pushes on next save)`);
          continue;
      }
      if (!rows.length) continue; // nothing local to push — drop entry
      try {
        const { error } = await supabase.from(entry.table).upsert(rows, { onConflict: 'id' });
        if (error) {
          Logger.warn('Finance', `retry-queue: ${entry.table} still failing: ${error.message}`);
          remaining.push(entry);
        } else {
          Logger.action('system', 'FINANCE', 'RETRY_SYNC_OK', { extra: { table: entry.table, rows: rows.length } });
          toast.success(`GL re-sync complete (${entry.label})`, { id: `finance-retry-${entry.table}` });
        }
      } catch (err: any) {
        Logger.warn('Finance', `retry-queue: ${entry.table} exception: ${err?.message || err}`);
        remaining.push(entry);
      }
    }
    safeSave(RETRY_KEY, remaining);
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
    const all = !_cache.loaded ? safeParse(KEYS.LEDGER) : _cache.ledger;
    // Audit #5: hide tombstoned entries from every reader (trial balance,
    // statements, aging, posting inbox). Inert while SOFT_DELETE_ENABLED is
    // false — every entry has deletedAt === undefined until the flag is on.
    if (SOFT_DELETE_ENABLED) {
      return all.filter((t: LedgerTransaction) => !t.deletedAt);
    }
    return all;
  },

  /**
   * Soft-delete (tombstone) a ledger entry so it stops affecting the books and
   * is NOT resurrected by the next sync pull (audit #5). Stamps deletedAt and
   * re-saves through saveLedger — the dirty-set pushes ONLY the tombstoned row.
   *
   * No-op guard returns an error while SOFT_DELETE_ENABLED is false (the DB
   * column does not exist yet), so callers can surface a clear message instead
   * of silently doing nothing.
   */
  softDeleteLedgerEntry: (id: string): { ok: boolean; error?: string } => {
    if (!SOFT_DELETE_ENABLED) {
      return { ok: false, error: 'Soft-delete is disabled — apply migration 089 and enable SOFT_DELETE_ENABLED first.' };
    }
    // Read the FULL buffer (including any already-tombstoned rows) — never
    // getLedger(), which filters tombstones out and would drop them on re-save.
    const all: LedgerTransaction[] = _cache.loaded ? _cache.ledger : safeParse(KEYS.LEDGER);
    const target = all.find(t => t.id === id);
    if (!target) return { ok: false, error: `Ledger entry ${id} not found.` };
    if (target.deletedAt) return { ok: true }; // already tombstoned — idempotent
    const stamped = all.map(t =>
      t.id === id ? { ...t, deletedAt: new Date().toISOString() } : t
    );
    FinanceService.saveLedger(stamped);
    Logger.action(
      'FINANCE', 'LEDGER_SOFT_DELETE', `Soft-deleted ledger entry ${id}`,
      { referenceId: id, extra: { company: target.company, by: useAuthStore.getState().user?.email ?? 'system' } }
    );
    return { ok: true };
  },

  saveLedger: (d: LedgerTransaction[]): void => {
    // FIN-3: Hard gate — every Posted entry must balance before ANY write.
    // A single imbalanced entry in the batch aborts the entire save so the
    // caller can fix the offending transaction. Parked / Draft entries are
    // intentionally exempt: they may be works-in-progress.
    //
    // MAKER-CHECKER gate (Task 1 — Phase 9):
    // Manual JVs (docType === 'JV') can NEVER be saved directly as 'Posted'
    // without an approvedBy field. They must go through:
    //   draftJV() → Draft  →  approveJV() → Posted
    //
    // Exception: system-auto entries (createdBy === 'system-auto') generated
    // by recurring expense scheduler, depreciation, and intercompany GL are
    // pre-audited and bypass the 4-eyes requirement.
    d.forEach(entry => {
      if (entry.status === 'Posted') {
        _assertGLBalance(entry);
        if (
          entry.docType === 'JV' &&
          !entry.approvedBy &&
          entry.createdBy !== 'system-auto'
        ) {
          throw new Error(
            `MakerChecker: Manual JV "${entry.id}" cannot be saved as Posted without approval. ` +
            `Use FinanceService.draftJV() to create the Draft entry, ` +
            `then FinanceService.approveJV("${entry.id}") for an authorized user to post it.`
          );
        }
      }
    });
    _cache.ledger = d;
    safeSave(KEYS.LEDGER, d);

    // ── Dirty-set push (audit #3 — safe-incremental GL writes) ─────────
    // Instead of re-uploading the ENTIRE ledger (whole-array last-write-wins,
    // which lets two stale caches clobber each other), push ONLY rows that are
    // new or changed vs the last-seen snapshot. Rationale: the dominant op is
    // an APPEND — a brand-new balanced entry whose unique id is absent from the
    // snapshot, so it is pushed alone and can never collide with another user's
    // row. Rows this save did not touch are omitted entirely, so a concurrent
    // edit in another tab is not overwritten.
    //
    // We hash the DOMAIN tx (JSON.stringify(tx)), NOT ledgerToRow(tx): the row
    // mapper stamps a fresh `updated_at` on every call, which would make every
    // row look "changed". A failed push is still fully recovered by
    // flushRetryQueue (audit #4), which rebuilds the whole ledger from the local
    // buffer — so this fast-path never risks data loss. Deletes are out of scope
    // (audit #5); this only ever pushes new/changed rows.
    const changed = d.filter(tx => _ledgerPushSnapshot.get(tx.id) !== JSON.stringify(tx));
    if (changed.length) {
      _upsert('ledger', changed.map(ledgerToRow), 'ledger');
      // Record the pushed state so the next save recognises these rows as clean.
      changed.forEach(tx => _ledgerPushSnapshot.set(tx.id, JSON.stringify(tx)));
    }
  },

  // ── Maker-Checker JV workflow (Task 1 — Phase 9) ──────────────────
  //
  // Flow:  draftJV(tx)  →  status='Draft', draftedBy=<maker>
  //         approveJV(id) →  role+4eyes check, GL balance gate, status='Posted'
  //
  // Roles authorised to be Checker (approveJV):
  //   super_admin, owner, hassan, gtk_admin, glassco_admin, nippon_admin
  //   (these map to the roles in the 14-role RBAC that have financial authority)
  //
  // System-auto JVs (createdBy='system-auto') bypass this flow entirely —
  // they are generated by trusted background processes (recurring expenses,
  // depreciation scheduler, intercompany GL) that are independently audited.

  /** JV_APPROVER_ROLES — roles authorised to be the Checker in the 4-eyes flow */
  JV_APPROVER_ROLES: ['super_admin', 'owner', 'hassan', 'gtk_admin', 'glassco_admin', 'nippon_admin'] as UserRole[],

  /**
   * Create a manual Journal Voucher in Draft status (Maker step).
   *
   * - Validates docType === 'JV'
   * - Validates the fiscal period is open
   * - Does NOT run _assertGLBalance (incomplete lines are allowed at draft time)
   * - Sets status = 'Draft', draftedBy = current user email
   * - Saves to ledger cache + Supabase
   *
   * @throws if docType is not 'JV' or the fiscal period is closed
   */
  draftJV: (tx: Omit<LedgerTransaction, 'status' | 'draftedBy' | 'approvedBy' | 'postedAt'>): LedgerTransaction => {
    if (tx.docType !== 'JV') {
      throw new Error(
        `draftJV: Only 'JV' document type can enter the Maker-Checker flow. ` +
        `Received docType "${tx.docType}". Use recordTransaction() for other doc types.`
      );
    }
    const txDate = tx.date || tx.docDate || new Date().toISOString().split('T')[0];
    if (!PeriodService.isPeriodOpen(tx.company, txDate)) {
      const month = txDate.slice(0, 7);
      toast.error(
        `Period ${month} is CLOSED — cannot draft a JV in a closed period. ` +
        `Re-open the period in Finance → Period Manager.`,
        { duration: 8000 }
      );
      throw new Error(`draftJV: Period ${month} is closed for company ${tx.company}`);
    }
    const currentUser = useAuthStore.getState().user?.email ?? 'unknown';
    const now = new Date().toISOString();
    const draft: LedgerTransaction = {
      ...tx,
      status:    'Draft',
      draftedBy: currentUser,
      createdBy: currentUser,
      updatedBy: currentUser,
    };
    const all = FinanceService.getLedger();
    all.push(draft);
    // saveLedger will NOT trigger the Maker-Checker gate here because status='Draft'
    FinanceService.saveLedger(all);
    toast.success(
      `JV "${draft.id}" saved as Draft by ${currentUser}. Awaiting approval from an authorised finance user.`,
      { duration: 6000 }
    );
    return draft;
  },

  /**
   * Approve a Draft JV and flip it to Posted (Checker step).
   *
   * Guards enforced (in order):
   *   1. JV must exist in ledger
   *   2. JV must be in 'Draft' status
   *   3. Caller's role must be in JV_APPROVER_ROLES
   *   4. 4-Eyes: approver email must differ from draftedBy email
   *   5. Fiscal period must still be open
   *   6. GL double-entry must balance (_assertGLBalance)
   *
   * On success: status → 'Posted', approvedBy set, postedAt set, Supabase synced.
   *
   * @param jvId - the LedgerTransaction.id of the Draft JV to approve
   * @throws on any guard failure — caller must surface the message to the user
   */
  approveJV: (jvId: string): LedgerTransaction => {
    const profile     = useAuthStore.getState().profile;
    const currentUser = profile?.email ?? useAuthStore.getState().user?.email ?? '';

    // Guard 1: Role authorisation
    if (!profile || !FinanceService.JV_APPROVER_ROLES.includes(profile.role as UserRole)) {
      throw new Error(
        `MakerChecker: Role "${profile?.role ?? 'unknown'}" is not authorised to approve JVs. ` +
        `Required one of: ${FinanceService.JV_APPROVER_ROLES.join(' | ')}.`
      );
    }

    const all = FinanceService.getLedger();
    const idx = all.findIndex(t => t.id === jvId);

    // Guard 2: JV must exist
    if (idx === -1) {
      throw new Error(`MakerChecker: JV "${jvId}" not found in the ledger.`);
    }

    const jv = all[idx];

    // Guard 3: Must be in Draft
    if (jv.status !== 'Draft') {
      throw new Error(
        `MakerChecker: JV "${jvId}" is not in Draft status (current status: "${jv.status}"). ` +
        `Only Draft JVs can be approved.`
      );
    }

    // Guard 4: 4-Eyes — approver must be a different person from the Maker
    if (jv.draftedBy && jv.draftedBy === currentUser) {
      throw new Error(
        `MakerChecker: 4-Eyes Violation — "${currentUser}" cannot approve their own JV. ` +
        `A different authorised user must approve JV "${jvId}". ` +
        `This is enforced to prevent single-person manipulation of the General Ledger.`
      );
    }

    // Guard 5: Period check at approval time (period may have been closed since drafting)
    const txDate = jv.date || jv.docDate || '';
    if (txDate && !PeriodService.isPeriodOpen(jv.company, txDate)) {
      const month = txDate.slice(0, 7);
      toast.error(
        `Period ${month} is CLOSED — JV approval blocked. ` +
        `Re-open the period or void this JV.`,
        { duration: 8000 }
      );
      throw new Error(`approveJV: Period ${month} is closed for company ${jv.company}`);
    }

    // Guard 6: GL double-entry balance — must pass before status flip
    _assertGLBalance(jv);

    const now = new Date().toISOString();
    const approved: LedgerTransaction = {
      ...jv,
      status:    'Posted',
      approvedBy: currentUser,
      updatedBy:  currentUser,
      postedAt:   now,
    };

    all[idx] = approved;
    // approvedBy is now set → saveLedger's Maker-Checker gate passes
    FinanceService.saveLedger(all);

    toast.success(
      `JV "${jvId}" approved and posted by ${currentUser}.`,
      { duration: 5000 }
    );
    return approved;
  },

  /**
   * Retrieve all Draft JVs for a company — the "approval inbox" for Checkers.
   */
  getDraftJVs: (company: Company): LedgerTransaction[] => {
    return FinanceService.getLedger().filter(
      t => t.company === company && t.docType === 'JV' && t.status === 'Draft'
    );
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
  getMappingRules:  (): FinancialMappingRule[] => safeParse(KEYS.MAPPING_RULES),
  saveMappingRules: (d: FinancialMappingRule[]): void => { safeSave(KEYS.MAPPING_RULES, d); },
  getGLConfig:      (): GLConfiguration[]      => safeParse(KEYS.GL_CONFIG),
  // Persist the GL event→account mapping rules. Config-only (localStorage);
  // does NOT post to the ledger — the double-entry path is untouched.
  saveGLConfig:     (d: GLConfiguration[]): void => { safeSave(KEYS.GL_CONFIG, d); },

  // ── Legacy compat ──────────────────────────────────────────────────
  loadAccountsAsync: async (): Promise<void> => { await FinanceService.init(); },

  // ── Seed Default COA ───────────────────────────────────────────────
  // DEADLOCK FIX (Sprint 40):
  // The previous version checked the LOCAL cache for each company's COA
  // existence. But _loadCache only fetches accounts for the user's CURRENT
  // company. So if Hassan was on GTK, the local cache had only GTK rows —
  // the seed loop then thought GTI/Glassco/Nippon/Factory were missing and
  // pushed ~250 rows to Supabase on EVERY page load. Those rows already
  // existed in Supabase, the UPSERT raced with the parallel SyncService
  // push, and Postgres killed one of them with "deadlock detected".
  //
  // Real fix: ask Supabase directly which companies already have accounts,
  // and skip those entirely. Only truly empty companies get seeded.
  seedDefaultCOA: async (): Promise<void> => {
    try {
      const { data: dbRows, error } = await supabase
        .from('accounts')
        .select('company')
        .limit(1000);

      if (error) {
        Logger.warn('Finance', 'seedDefaultCOA: Supabase check failed — skipping seed (safe default)', error);
        return;
      }

      const companiesInDB = new Set((dbRows || []).map((r: any) => r.company));
      const existing = FinanceService.getAccounts();
      const companies: Company[] = ['GTK', 'GTI', 'Glassco', 'Nippon', 'Factory'];
      let added = false;
      const newAccounts: Account[] = [];

      for (const co of companies) {
        const coaTree = COMPANY_COA[co];
        if (!coaTree) continue;
        if (companiesInDB.has(co)) continue;             // already in Supabase — skip
        if (existing.some(a => a.company === co)) continue; // already in local cache — skip
        newAccounts.push(...flattenCOA(coaTree, co));
        added = true;
      }

      if (added) {
        // Merge new + existing, sort by level ASC so parents are upserted
        // before children — keeps the FK lock order consistent and avoids
        // self-deadlock on the parent_id self-reference.
        const merged = [...existing, ...newAccounts].sort((a, b) => a.level - b.level);
        FinanceService.saveAccounts(merged);
      }
    } catch (err: unknown) {
      Logger.warn('Finance', 'seedDefaultCOA: unexpected failure — skipped', err);
    }
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

    // Glassco PV: GT-PV-GLS-MMYY-XXXX starting from 12001
    const now = new Date();
    const pvMmyy = `${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getFullYear().toString().slice(-2)}`;
    const compPrefix = company.slice(0,3).toUpperCase();
    let pvId: string;
    if (company === 'Glassco') {
      const pvCountKey = `gtk_last_seq_Glassco_PV`;
      const allLedger = FinanceService.getLedger();
      let maxPvSeq = 12000;
      const storedSeq = parseInt(localStorage.getItem(pvCountKey) || '12000', 10);
      if (storedSeq > maxPvSeq) maxPvSeq = storedSeq;
      allLedger.forEach((t: any) => {
        if (t.id && typeof t.id === 'string' && t.id.startsWith('GT-PV-GLS-')) {
          const parts = t.id.split('-');
          const seq = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(seq) && seq > maxPvSeq) maxPvSeq = seq;
        }
      });
      const nextPvSeq = maxPvSeq + 1;
      try { localStorage.setItem(pvCountKey, nextPvSeq.toString()); } catch {}
      pvId = `GT-PV-GLS-${pvMmyy}-${nextPvSeq.toString().padStart(4, '0')}`;
    } else {
      pvId = `PV-${compPrefix}-${Date.now().toString().slice(-8)}`;
    }

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

    // Phase-7 (P4-4): ensure both accounts exist before referencing them.
    // Audit RC-18: previously the PV referenced "${company}-${code}" without
    // calling ensureAccount — if the COA hadn't been seeded yet (or someone
    // added a custom subcategory), the Parked PV pointed to a non-existent
    // account → invisible in trial balance, ledger orphaned at post-time.
    // Best-effort level=4 placement under the matching parent code.
    const debitParentCode = debitCode.length >= 2 ? debitCode.slice(0, -1) : debitCode;
    const creditParentCode = creditAcc.code.length >= 2 ? creditAcc.code.slice(0, -1) : creditAcc.code;
    const debitType: Account['type']  = isStorePurchase ? 'Asset' : 'Expense';
    const creditType: Account['type'] = ['11112','11111','11121'].includes(creditAcc.code) ? 'Asset' : 'Liability';
    const debitAcc  = FinanceService.ensureAccount(company, debitName,        4, null, debitType,  debitCode);
    const creditAccObj = FinanceService.ensureAccount(company, creditAcc.name, 4, null, creditType, creditAcc.code);

    const pv: LedgerTransaction = {
      id: pvId, company, docType: 'PV' as LedgerDocType,
      docDate: req.date || new Date().toISOString().split('T')[0],
      date: req.date || new Date().toISOString().split('T')[0],
      description: pvDesc, referenceId: req.id, status: 'Parked', reqId: req.id,
      details: [
        { accountId: debitAcc.id, debit: amount, credit: 0,
          text: `${debitCode} ${debitName}${isStorePurchase ? ' [ADVANCE]' : ''}`,
          costCenterId: req.items?.[0]?.costCenter || undefined },
        { accountId: creditAccObj.id, debit: 0, credit: amount,
          text: `${creditAcc.code} ${creditAcc.name} | ${paymentMode || 'Cash'}` },
      ],
    };

    // Phase-7 (P4-5): assert balance before persisting. Already balanced by
    // construction (debit = credit = amount), but if a future refactor adds
    // a third line we want LedgerImbalanceError, not silent corruption.
    _assertGLBalance(pv);

    const all = FinanceService.getLedger();
    all.push(pv);
    FinanceService.saveLedger(all);
    return pv;
  },

  // ── Settle Advance on GRN ───────────────────────────────────────────
  // GAP-04: `cfoOverride` lets a CFO/Finance Manager approve a settlement
  // that exceeds the 1.5× FIN-1 cap. The override is logged to bypass_log
  // (Control Exception Register) with mandatory reason + approver — no
  // silent overruns. Without the override, the original hard cap stands.
  settleAdvance: (params: {
    company: Company; reqId: string; grnId: string;
    actualAmount: number; categoryTotals: Record<string, number>; purchaserName?: string;
    cfoOverride?: { approver: string; reason: string };
  }): { settlementId: string; variance: number; status: 'Exact' | 'Under-spend' | 'Over-spend' } => {
    const { company, reqId, grnId, actualAmount, categoryTotals, purchaserName, cfoOverride } = params;
    const today = new Date().toISOString().split('T')[0];
    const allGL = FinanceService.getLedger();

    const advanceEntry =
      allGL.find(t => t.reqId === reqId && t.status === 'Posted' && t.details?.some(d => d.text?.includes('[ADVANCE]'))) ||
      allGL.find(t => t.reqId === reqId && t.details?.some(d => d.text?.includes('[ADVANCE]')));

    const advanceAmount = advanceEntry
      ? advanceEntry.details.reduce((s, d) => s + (d.debit || 0), 0) : 0;

    // FIN-2: Orphan settlement guard.
    // If a reqId was supplied but no matching advance GL entry was found, the
    // settlement has no originating advance — allowing it would create phantom
    // credits (Employee Advances cleared with nothing on the debit side).
    // The only safe option is to reject and ask the user to restore or re-raise
    // the advance entry before settling.
    if (reqId && !advanceEntry) {
      throw new Error(
        `OrphanSettlementError: No advance GL entry found for requisition "${reqId}". ` +
        `The advance may have been deleted, never posted, or settled already. ` +
        `Restore the originating advance entry or create a new one before settling.`
      );
    }

    // FIN-1: Hard cap on advance overclaiming.
    // If actual spend > 1.5× the approved advance, reject immediately
    // UNLESS cfoOverride is provided (GAP-04). Override path writes a
    // bypass_log entry so the exception register tracks every breach.
    const MAX_ADVANCE_VARIANCE_MULTIPLIER = 1.5;
    if (advanceAmount > 0 && actualAmount > advanceAmount * MAX_ADVANCE_VARIANCE_MULTIPLIER) {
      const maxAllowed = Math.floor(advanceAmount * MAX_ADVANCE_VARIANCE_MULTIPLIER);
      if (!cfoOverride || !cfoOverride.approver || !cfoOverride.reason) {
        throw new Error(
          `AdvanceOverclaimError: Actual PKR ${actualAmount} exceeds ${MAX_ADVANCE_VARIANCE_MULTIPLIER}× ` +
          `the advance (PKR ${advanceAmount}). Maximum claimable without CFO approval: PKR ${maxAllowed}. ` +
          `Raise a CFO approval request for the excess PKR ${actualAmount - maxAllowed}.`
        );
      }
      // Log the CFO-approved breach to bypass_log (fire-and-forget; offline-safe).
      try {
        supabase.from('bypass_log').insert({
          user_name: cfoOverride.approver,
          module: 'Finance',
          rule_bypassed: 'FIN-1',
          record_id: `${reqId}::${grnId}`,
          bypass_reason:
            `Advance overclaim approved: actual PKR ${actualAmount} vs advance PKR ${advanceAmount} ` +
            `(excess PKR ${actualAmount - maxAllowed}). Reason: ${cfoOverride.reason}`,
          status: 'Open',
          company,
          addressing_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
        }).then(({ error }: any) => {
          if (error) Logger.warn('Finance', 'FIN-1 bypass_log insert failed', error);
        });
      } catch (e) {
        Logger.warn('Finance', 'FIN-1 bypass_log threw', e);
      }
      Logger.action(
        'Finance', 'FIN1_OVERRIDE',
        `${reqId}/${grnId} — Approver ${cfoOverride.approver} — PKR ${actualAmount} vs ${advanceAmount}`
      );
    }

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

  // ── Audit #6 (Layer 1): Server-side Trial Balance aggregation ───────
  // Pushes the per-account Dr/Cr roll-up into Postgres (RPC `trial_balance`,
  // migration 088) so the browser receives grouped totals instead of the
  // entire ledger. On ANY error / empty result (e.g. before the migration is
  // applied, or offline) it FALLS BACK to the in-memory JS reduce over
  // getLedger() — identical output — so the report never breaks.
  //
  // Returns the exact shape TrialBalance.tsx already renders:
  //   Account + { debit, credit, net, side } — non-zero accounts only.
  getTrialBalanceAsync: async (company: Company): Promise<TrialBalanceRow[]> => {
    const accounts = FinanceService.getAccounts().filter(a => a.company === company);

    // Assemble the report row for an account from its Dr/Cr totals.
    const buildRows = (totals: Map<string, { debit: number; credit: number }>): TrialBalanceRow[] =>
      accounts.map(acc => {
        const t = totals.get(acc.id) ?? { debit: 0, credit: 0 };
        const net = t.debit - t.credit;
        const row: TrialBalanceRow = {
          ...acc,
          debit: t.debit,
          credit: t.credit,
          net: Math.abs(net),
          side: net >= 0 ? 'Dr' : 'Cr',
        };
        return row;
      }).filter(r => r.debit !== 0 || r.credit !== 0);

    // JS fallback — the original in-memory reduce (kept as the safety net).
    const jsFallback = (): TrialBalanceRow[] => {
      const totals = new Map<string, { debit: number; credit: number }>();
      FinanceService.getLedger()
        .filter(t => t.company === company && t.status === 'Posted')
        .forEach(tx => {
          (tx.details || []).forEach(d => {
            const cur = totals.get(d.accountId) ?? { debit: 0, credit: 0 };
            cur.debit  += Number(d.debit)  || 0;
            cur.credit += Number(d.credit) || 0;
            totals.set(d.accountId, cur);
          });
        });
      return buildRows(totals);
    };

    try {
      const { data, error } = await supabase.rpc('trial_balance', { p_company: company });
      if (error || !Array.isArray(data) || data.length === 0) {
        if (error) Logger.warn('Finance', `getTrialBalanceAsync: RPC unavailable — JS fallback (${error.message})`);
        return jsFallback();
      }
      const rows = data as Array<{ account_id: string; debit: number; credit: number }>;
      const totals = new Map<string, { debit: number; credit: number }>();
      rows.forEach(r => totals.set(r.account_id, {
        debit:  Number(r.debit)  || 0,
        credit: Number(r.credit) || 0,
      }));
      return buildRows(totals);
    } catch (e) {
      Logger.warn('Finance', 'getTrialBalanceAsync: RPC threw — JS fallback', e);
      return jsFallback();
    }
  },

  // ── Audit #6 (Layer 1): Server-side AR Aging aggregation ────────────
  // Pushes the AR aging bucket roll-up into Postgres (RPC `ar_aging`,
  // migration 088), computed from the invoices table (outstanding balance
  // aged by invoice date). On ANY error / empty result it FALLS BACK to a
  // JS reduce over the live invoice balances (getInvoiceBalancesAsync) →
  // never breaks before the migration is applied or when offline.
  //
  // Buckets use the app's AgingReport vocabulary (0-30 / 31-60 / 61-90 / 90+).
  getARAgingAsync: async (company: Company): Promise<ARAgingBuckets> => {
    const empty: ARAgingBuckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0 };

    // JS fallback — age live invoice balances by their invoice date client-side.
    const jsFallback = async (): Promise<ARAgingBuckets> => {
      try {
        const invoices = await supabase
          .from('invoices')
          .select('total_amount, received_amount, balance, status, date')
          .eq('company', company);
        if (invoices.error || !Array.isArray(invoices.data)) return empty;
        const now = Date.now();
        const b: ARAgingBuckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0 };
        for (const raw of invoices.data as Array<Record<string, unknown>>) {
          if (String(raw.status ?? '') === 'Void') continue;
          const total    = Number(raw.total_amount)    || 0;
          const received = Number(raw.received_amount)  || 0;
          const balCol   = raw.balance;
          const bal = Math.max(balCol == null ? total - received : Number(balCol) || 0, 0);
          if (bal <= 0) continue;
          const dateStr = typeof raw.date === 'string' ? raw.date : '';
          const days = dateStr
            ? Math.floor((now - new Date(dateStr).getTime()) / 86400000)
            : 0;
          if (days <= 30)      b['0-30']  += bal;
          else if (days <= 60) b['31-60'] += bal;
          else if (days <= 90) b['61-90'] += bal;
          else                 b['90+']   += bal;
          b.total += bal;
        }
        return b;
      } catch (e) {
        Logger.warn('Finance', 'getARAgingAsync: JS fallback failed', e);
        return empty;
      }
    };

    try {
      const { data, error } = await supabase.rpc('ar_aging', { p_company: company });
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row) {
        if (error) Logger.warn('Finance', `getARAgingAsync: RPC unavailable — JS fallback (${error.message})`);
        return jsFallback();
      }
      const r = row as {
        bucket_current: number; bucket_30: number; bucket_60: number;
        bucket_90plus: number; total: number;
      };
      return {
        '0-30':  Number(r.bucket_current) || 0,
        '31-60': Number(r.bucket_30)      || 0,
        '61-90': Number(r.bucket_60)      || 0,
        '90+':   Number(r.bucket_90plus)  || 0,
        total:   Number(r.total)          || 0,
      };
    } catch (e) {
      Logger.warn('Finance', 'getARAgingAsync: RPC threw — JS fallback', e);
      return jsFallback();
    }
  },

  // ── FIN-4: Live Invoice Balances ───────────────────────────────────
  // Queries the `invoice_balances` view (Migration 016) which computes
  //   live_balance = total_amount − Σ(payment_receipts.amount)
  // in real-time, eliminating the stale `paid_amount` field on invoices.
  // AgingReport and BillingHub should call this instead of invoices.paid_amount.
  getInvoiceBalancesAsync: async (company: Company): Promise<Array<{
    id: string;
    company: string;
    total_amount: number;
    paid_amount: number;
    live_balance: number;
  }>> => {
    try {
      const { data, error } = await supabase
        .from('invoice_balances')
        .select('id, company, total_amount, paid_amount, live_balance')
        .eq('company', company);
      if (error) {
        console.warn('[FinanceService] getInvoiceBalancesAsync:', error.message);
        return [];
      }
      return (data ?? []) as any[];
    } catch (e) {
      console.error('[FinanceService] getInvoiceBalancesAsync failed:', e);
      return [];
    }
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

  // ── Phase-7 (P3-2): Vendor AP balance — sum of all AP debits/credits ─
  // Returns the net outstanding payable to a vendor (positive = we owe them).
  // Walks the full ledger, identifies AP entries by account-name match
  // (Payable / AP) AND a vendor-name match in the line text. Cheap because
  // single user, single-company; if perf becomes an issue we'll index AP by
  // vendor in a separate ap_balances table.
  getVendorAPBalance: (company: Company, vendorName: string): {
    totalCredits: number; totalDebits: number; outstanding: number;
  } => {
    const v = (vendorName || '').trim().toLowerCase();
    if (!v) return { totalCredits: 0, totalDebits: 0, outstanding: 0 };
    const accs = FinanceService.getAccounts().filter(a =>
      a.company === company &&
      a.type === 'Liability' &&
      /payable|\bap\b/i.test(a.name || '')
    );
    const apIds = new Set(accs.map(a => a.id));
    const ledger = FinanceService.getLedger().filter(t =>
      t.company === company && t.status === 'Posted'
    );
    let totalCredits = 0, totalDebits = 0;
    for (const tx of ledger) {
      for (const d of (tx.details || [])) {
        if (!apIds.has(d.accountId)) continue;
        const text = String(d.text || '').toLowerCase();
        if (!text.includes(v)) continue;
        totalCredits += Number(d.credit) || 0;
        totalDebits  += Number(d.debit)  || 0;
      }
    }
    return {
      totalCredits, totalDebits,
      outstanding: totalCredits - totalDebits, // net liability
    };
  },

  // ── Phase-7 (P3-3): Post a vendor payment voucher ────────────────────
  // Standard payment GL: Dr AP — Vendor / Cr Cash-in-Hand or Bank.
  // Reduces the AP balance + reduces cash. Used by the vendor payment UI
  // (Finance / Procurement). Throws if the input is malformed; uses
  // assertGLBalance + recordTransaction so MakerChecker is enforced (this
  // IS a manual JV — accountant must approve).
  postVendorPaymentGL: (params: {
    company:    Company;
    vendorName: string;
    amount:     number;
    paymentDate: string;
    paidBy:     'Cash' | 'Bank';
    bankAccountName?: string;     // required if paidBy === 'Bank'
    apAccountCode?:   string;     // override AP account code (e.g. 21111 / 21112 / 21113)
    invoiceRef?:      string;     // vendor invoice no being settled
    createdBy?:       string;     // for MakerChecker; default 'finance-user'
  }): LedgerTransaction => {
    const { company, vendorName, amount, paymentDate, paidBy } = params;
    if (!vendorName?.trim()) throw new Error('Vendor name is required.');
    if (!amount || amount <= 0) throw new Error('Payment amount must be > 0.');
    if (!paymentDate) throw new Error('Payment date is required.');

    // Resolve AP account (specific code → vendor sub-ledger → generic AP)
    let apAcc: any = null;
    if (params.apAccountCode) {
      apAcc = FinanceService.getAccounts().find(a =>
        a.company === company && a.code === params.apAccountCode
      );
    }
    if (!apAcc) {
      // Default to "Payable — Other Vendors" (21113), parent of trade payables
      const tpParent = FinanceService.ensureAccount(company, 'TRADE PAYABLES', 3, null, 'Liability', '211');
      apAcc = FinanceService.ensureAccount(company, 'Payable — Other Vendors', 4, tpParent.id, 'Liability', '21113');
    }

    // Resolve cash/bank account
    let cashAcc: any = null;
    if (paidBy === 'Bank') {
      const bankParent = FinanceService.ensureAccount(company, 'BANK', 2, null, 'Asset', '111');
      cashAcc = FinanceService.ensureAccount(
        company, params.bankAccountName || 'BANK — DEFAULT', 3, bankParent.id, 'Asset', '1112'
      );
    } else {
      const cashParent = FinanceService.ensureAccount(company, 'CASH', 2, null, 'Asset', '111');
      cashAcc = FinanceService.ensureAccount(company, 'CASH IN HAND', 3, cashParent.id, 'Asset', '11111');
    }

    if (!apAcc || !cashAcc) throw new Error('Could not resolve AP or Cash/Bank account.');

    const txId = `PV-${vendorName.replace(/[^A-Z0-9]/gi, '').slice(0, 8).toUpperCase()}-${Date.now().toString().slice(-6)}`;
    const tx: LedgerTransaction = {
      id: txId, company, docType: 'PV',
      docDate: paymentDate, date: paymentDate,
      description: `Vendor Payment: ${vendorName}${params.invoiceRef ? ' | Inv ' + params.invoiceRef : ''} | PKR ${amount.toLocaleString('en-PK')}`,
      referenceId: params.invoiceRef || vendorName,
      status: 'Posted',
      // Manual JV — operator must be named for MakerChecker audit trail.
      createdBy: params.createdBy || 'finance-user',
      details: [
        { accountId: apAcc.id,   debit: amount, credit: 0,      text: `AP settlement: ${vendorName}` },
        { accountId: cashAcc.id, debit: 0,      credit: amount, text: `${paidBy} payment to ${vendorName}` },
      ],
    } as LedgerTransaction;

    _assertGLBalance(tx);
    FinanceService.recordTransaction(tx);
    return tx;
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
