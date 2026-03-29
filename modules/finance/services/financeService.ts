// ═══════════════════════════════════════════════════════════════════════
//  financeService.ts — Core Finance Service
//  Session 2: Store Purchases Recording + GL Wiring
//  All finance operations: GL posting, Parked PV, COA seed, GL mapping
// ═══════════════════════════════════════════════════════════════════════

import { safeParse, safeSave } from '../../shared/services/utils';
import { SyncService } from '@/src/services/SyncService';
import { Company } from '../../shared/types/core';
import {
  Account, LedgerTransaction, LedgerDocType, CostCenter,
  PettyCashEntry, RecurringExpense, FinancialEvent,
  FinancialMappingRule, GLConfiguration
} from '../types/finance';
import { COMPANY_COA, COAAccount } from '../constants/coa.index';

// ── localStorage Keys ─────────────────────────────────────────────────
const KEYS = {
  ACCOUNTS:           'accounts',
  LEDGER:             'gtk_erp_ledger',
  COST_CENTERS:       'cost_centers',
  PETTY_CASH:         'petty_cash',
  RECURRING_EXPENSES: 'recurring_expenses',
  FINANCIAL_EVENTS:   'financial_events',
  MAPPING_RULES:      'mapping_rules',
  GL_CONFIG:          'gl_config',
  STORE:              'store',
};

// ── Flatten COA tree into Account[] ───────────────────────────────────
const flattenCOA = (nodes: COAAccount[], company: Company, parentId: string | null = null): Account[] => {
  const result: Account[] = [];
  for (const node of nodes) {
    const acc: Account = {
      id: `${company}-${node.code}`,
      company,
      code: node.code,
      name: node.name,
      level: node.level as 1|2|3|4|5,
      parentId,
      type: node.type as Account['type'],
    };
    result.push(acc);
    if (node.children) {
      result.push(...flattenCOA(node.children, company, acc.id));
    }
  }
  return result;
};

// ═══════════════════════════════════════════════════════════════════════
//  GL SUBCATEGORY MAPPING — Requisition subcategory → GL accounts
//  Used by GLPreviewPanel in Requisitions.tsx
// ═══════════════════════════════════════════════════════════════════════

interface GLMapping {
  debitCode: string;
  debitName: string;
  creditCode: string;
  creditName: string;
}

// ── GTK-specific GL mappings (keyed by subcategory) ──────────────────
const GTK_GL_MAP: Record<string, GLMapping> = {
  // Production materials — inventory accounts (Dr Store, Cr Cash)
  'Material / Inventory':   { debitCode:'11513', debitName:'Hardware & Accessories',         creditCode:'11112', creditName:'Cash in Hand — Main' },
  'BOM Hardware':           { debitCode:'11513', debitName:'Hardware & Accessories',         creditCode:'11112', creditName:'Cash in Hand — Main' },
  'Aluminium Profiles':     { debitCode:'11511', debitName:'Aluminium Profiles — Stock',     creditCode:'11112', creditName:'Cash in Hand — Main' },
  'Consumables':            { debitCode:'11531', debitName:'Consumables — Fabrication',      creditCode:'11112', creditName:'Cash in Hand — Main' },
  'Glass Purchase':         { debitCode:'11512', debitName:'Glass Sheets — Stock',           creditCode:'11112', creditName:'Cash in Hand — Main' },
  // Tools & capital items
  'Tool Purchase':          { debitCode:'12113', debitName:'Fabrication Tools & Equipment',  creditCode:'11112', creditName:'Cash in Hand — Main' },
  'Tool Replacement':       { debitCode:'12113', debitName:'Fabrication Tools & Equipment',  creditCode:'11112', creditName:'Cash in Hand — Main' },
  'Machine Parts':          { debitCode:'53621', debitName:'Fabrication Machine — Maintenance', creditCode:'11112', creditName:'Cash in Hand — Main' },
  // R&M
  'Maintenance / R&M':      { debitCode:'53621', debitName:'Fabrication Machine — Maintenance', creditCode:'11112', creditName:'Cash in Hand — Main' },
  'Vehicle Fuel':           { debitCode:'53511', debitName:'Vehicle Fuel — Office/Admin',    creditCode:'11112', creditName:'Cash in Hand — Main' },
  'Vehicle Maintenance':    { debitCode:'53512', debitName:'Vehicle Maintenance — Admin',    creditCode:'11112', creditName:'Cash in Hand — Main' },
  // Admin
  'General Expense':        { debitCode:'53817', debitName:'Miscellaneous Expenses',         creditCode:'11112', creditName:'Cash in Hand — Main' },
  'TA/DA':                  { debitCode:'53122', debitName:'Conveyance Allowance',           creditCode:'11112', creditName:'Cash in Hand — Main' },
  'Fare Expense':           { debitCode:'53122', debitName:'Conveyance Allowance',           creditCode:'11112', creditName:'Cash in Hand — Main' },
  'Scrap':                  { debitCode:'11112', debitName:'Cash in Hand — Main',            creditCode:'56113', creditName:'Inventory Write-Off' },
  // HR
  'Loan Request':           { debitCode:'11421', debitName:'Employee Advances',              creditCode:'11112', creditName:'Cash in Hand — Main' },
  'Salary Advance':         { debitCode:'11421', debitName:'Employee Advances',              creditCode:'11112', creditName:'Cash in Hand — Main' },
  // Factory
  'Repair & Maintenance':   { debitCode:'53621', debitName:'Fabrication Machine — Maintenance', creditCode:'11112', creditName:'Cash in Hand — Main' },
  'Fuel Expense':           { debitCode:'53622', debitName:'Generator (15 KVA) — Fuel',      creditCode:'11112', creditName:'Cash in Hand — Main' },
};

// ── Company-specific overrides (Glassco, Nippon may differ) ──────────
const COMPANY_GL_OVERRIDES: Record<string, Record<string, Partial<GLMapping>>> = {
  Glassco: {
    'Material / Inventory': { debitCode:'11512', debitName:'Glass Sheets — Stock' },
  },
};

// ── Payment Mode → Credit Account override ───────────────────────────
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

  // ── Basic CRUD ──────────────────────────────────────────────────────
  getAccounts:            (): Account[]            => safeParse(KEYS.ACCOUNTS),
  saveAccounts:           (d: Account[])           => { safeSave(KEYS.ACCOUNTS, d); SyncService.markDirty('accounts'); },
  getLedger:              (): LedgerTransaction[]   => safeParse(KEYS.LEDGER),
  saveLedger:             (d: LedgerTransaction[])  => { safeSave(KEYS.LEDGER, d); SyncService.markDirty('ledger'); },
  getCostCenters:         (): CostCenter[]          => safeParse(KEYS.COST_CENTERS),
  getPettyCashEntries:    (): PettyCashEntry[]       => safeParse(KEYS.PETTY_CASH),
  savePettyCashEntries:   (d: PettyCashEntry[])      => { safeSave(KEYS.PETTY_CASH, d); SyncService.markDirty('petty_cash'); },
  getRecurringExpenses:   (): RecurringExpense[]     => safeParse(KEYS.RECURRING_EXPENSES),
  saveRecurringExpenses:  (d: RecurringExpense[])    => { safeSave(KEYS.RECURRING_EXPENSES, d); SyncService.markDirty('recurring_expenses'); },
  getFinancialEvents:     (): FinancialEvent[]       => safeParse(KEYS.FINANCIAL_EVENTS),
  saveFinancialEvents:    (d: FinancialEvent[])      => { safeSave(KEYS.FINANCIAL_EVENTS, d); SyncService.markDirty('financial_events'); },
  getMappingRules:        (): FinancialMappingRule[]  => safeParse(KEYS.MAPPING_RULES),
  getGLConfig:            (): GLConfiguration[]      => safeParse(KEYS.GL_CONFIG),

  // ── Async Supabase load ─────────────────────────────────────────────
  loadAccountsAsync: async () => {
    try {
      await SyncService.pullTable('accounts');
    } catch (e) {
      console.warn('[FinanceService] Async account load failed, using localStorage:', e);
    }
  },

  // ── Seed Default COA ────────────────────────────────────────────────
  seedDefaultCOA: () => {
    const existing = FinanceService.getAccounts();
    const companies: Company[] = ['GTK', 'GTI', 'Glassco', 'Nippon', 'Factory'];

    for (const co of companies) {
      const coaTree = COMPANY_COA[co];
      if (!coaTree) continue;

      const hasCompanyAccounts = existing.some(a => a.company === co);
      if (hasCompanyAccounts) continue;

      const flattened = flattenCOA(coaTree, co);
      existing.push(...flattened);
    }

    FinanceService.saveAccounts(existing);
  },

  // ── Ensure Account (create if not exists) ───────────────────────────
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

  // ── Resolve Subcategory → GL Accounts ───────────────────────────────
  resolveSubcategoryGL: (company: Company, subCategory: string, paymentMode?: string): GLMapping | null => {
    // 1. Check company-specific override
    const override = COMPANY_GL_OVERRIDES[company]?.[subCategory];
    const base = GTK_GL_MAP[subCategory];
    if (!base) return null;

    const mapping = { ...base, ...override };

    // 2. Override credit side based on payment mode
    if (paymentMode && PAYMENT_CREDIT_MAP[paymentMode]) {
      const pm = PAYMENT_CREDIT_MAP[paymentMode];
      // Adjust company prefix for petty cash/bank accounts
      mapping.creditCode = pm.code;
      mapping.creditName = pm.name.replace('GTK', company === 'GTK' ? 'GTK' : company);
    }

    return mapping;
  },

  // ── Record a single transaction (append to ledger) ──────────────────
  recordTransaction: (tx: LedgerTransaction) => {
    const all = FinanceService.getLedger();
    all.push(tx);
    FinanceService.saveLedger(all);
  },

  // ── Create Parked Payment Voucher from Approved Requisition ─────────
  createParkedPV: (req: any): LedgerTransaction => {
    const company = req.company as Company;
    const subCategory = req.subCategory || req.reqType || 'General Expense';
    const paymentMode = req.paymentMode || (req.requiresCashPayment ? 'Cash' : 'Cash');
    const amount = req.totalValue || req.loanAmount || req.amount || 0;

    const gl = FinanceService.resolveSubcategoryGL(company, subCategory, paymentMode);

    // Fallback GL if no mapping found
    const debitCode  = gl?.debitCode  || '53817';
    const debitName  = gl?.debitName  || 'Miscellaneous Expenses';
    const creditCode = gl?.creditCode || '11112';
    const creditName = gl?.creditName || 'Cash in Hand — Main';

    // Build description
    const itemDesc = req.items?.length
      ? req.items.map((i: any) => i.materialDesc).filter(Boolean).join(', ').slice(0, 80)
      : req.headerText || subCategory;

    const pvId = `PV-${company.slice(0,3).toUpperCase()}-${Date.now().toString().slice(-8)}`;

    const pv: LedgerTransaction = {
      id: pvId,
      company,
      docType: 'PV' as LedgerDocType,
      docDate: req.date || new Date().toISOString().split('T')[0],
      date: req.date || new Date().toISOString().split('T')[0],
      description: `[PARKED] ${subCategory.toUpperCase()}: ${itemDesc}`.toUpperCase(),
      referenceId: req.id,
      status: 'Parked',
      reqId: req.id,
      details: [
        {
          accountId: `${company}-${debitCode}`,
          debit: amount,
          credit: 0,
          text: `${debitCode} ${debitName}`,
          costCenterId: req.items?.[0]?.costCenter || undefined,
        },
        {
          accountId: `${company}-${creditCode}`,
          debit: 0,
          credit: amount,
          text: `${creditCode} ${creditName} | ${paymentMode || 'Cash'}`,
        }
      ],
    };

    // Save to ledger
    const all = FinanceService.getLedger();
    all.push(pv);
    FinanceService.saveLedger(all);

    return pv;
  },

  // ── Post Parked PV (Finance review → Post to GL) ────────────────────
  postParkedPV: (pvId: string): LedgerTransaction | null => {
    const all = FinanceService.getLedger();
    const idx = all.findIndex(t => t.id === pvId);
    if (idx === -1) return null;

    const pv = all[idx];
    if (pv.status !== 'Parked') return pv;

    // Mark as Posted
    all[idx] = { ...pv, status: 'Posted' };
    FinanceService.saveLedger(all);

    // Update linked Requisition payment status
    if (pv.reqId) {
      try {
        const reqs = safeParse('requisitions');
        const reqIdx = reqs.findIndex((r: any) => r.id === pv.reqId);
        if (reqIdx !== -1) {
          reqs[reqIdx] = {
            ...reqs[reqIdx],
            paymentStatus: 'Paid',
            paidAmount: pv.details.reduce((s: number, d: any) => s + (d.debit || 0), 0),
            paymentRef: pvId,
            paymentDate: new Date().toISOString().split('T')[0],
          };
          safeSave('requisitions', reqs);
          SyncService.markDirty('requisitions');
        }
      } catch (e) {
        console.warn('[FinanceService] Failed to update requisition payment status:', e);
      }
    }

    return all[idx];
  },

  // ── Cost Center Spend (current month) ───────────────────────────────
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
    const ccs = FinanceService.getCostCenters().filter(c => c.company === company);
    const cc = ccs.find(c => c.id === costCenterId);
    if (!cc || !cc.budgetMonthly) return { alert: false, pct: 0, name: cc?.name || '' };

    const spend = FinanceService.getCostCenterSpend(company, costCenterId);
    const pct = Math.round((spend.total / cc.budgetMonthly) * 100);
    const threshold = cc.alertThreshold || 80;

    return { alert: pct >= threshold, pct, name: cc.name };
  },

  // ── Stock Alerts (low stock items) ──────────────────────────────────
  getStockAlerts: (company: Company): any[] => {
    try {
      const store: any[] = safeParse(KEYS.STORE);
      return store
        .filter((s: any) => s.company === company && s.quantity <= (s.reorderPoint || s.minLevel || 5))
        .map((s: any) => ({
          id: s.id,
          name: s.name,
          quantity: s.quantity,
          minLevel: s.minLevel || s.reorderPoint || 5,
          category: s.category,
          status: s.quantity <= 0 ? 'OUT_OF_STOCK' : 'LOW',
        }));
    } catch {
      return [];
    }
  },

  // ── Post Depreciation (monthly) ─────────────────────────────────────
  postDepreciation: (company: Company, month: string): { posted: number; skipped: number } => {
    try {
      const assets: any[] = safeParse('assets');
      const companyAssets = assets.filter((a: any) => a.company === company && a.status === 'Active');
      let posted = 0, skipped = 0;
      const all = FinanceService.getLedger();

      for (const asset of companyAssets) {
        const depAmount = (asset.purchaseValue || 0) / ((asset.usefulLifeYears || 5) * 12);
        if (depAmount <= 0) { skipped++; continue; }

        // Check if already posted for this month
        const existingId = `DEP-${asset.id}-${month}`;
        if (all.some(t => t.id === existingId)) { skipped++; continue; }

        const tx: LedgerTransaction = {
          id: existingId,
          company,
          docType: 'JV',
          docDate: `${month}-28`,
          date: `${month}-28`,
          description: `DEPRECIATION — ${asset.description || asset.name} — ${month}`.toUpperCase(),
          referenceId: asset.id,
          status: 'Posted',
          details: [
            { accountId: `${company}-53911`, debit: Math.round(depAmount), credit: 0, text: `Dep: ${asset.name}` },
            { accountId: `${company}-12121`, debit: 0, credit: Math.round(depAmount), text: `Accum Dep: ${asset.name}` },
          ]
        };
        all.push(tx);
        posted++;
      }

      FinanceService.saveLedger(all);
      return { posted, skipped };
    } catch (e) {
      console.error('[FinanceService] Depreciation posting error:', e);
      return { posted: 0, skipped: 0 };
    }
  },

  // ── Post Recurring Expenses ─────────────────────────────────────────
  postRecurringExpenses: (company: Company): { posted: number; skipped: number } => {
    try {
      const templates = FinanceService.getRecurringExpenses().filter(r => r.company === company);
      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
      let posted = 0, skipped = 0;
      const all = FinanceService.getLedger();
      const updatedTemplates = [...FinanceService.getRecurringExpenses()];

      for (const template of templates) {
        if (template.lastPostedMonth === currentMonth) { skipped++; continue; }

        const txId = `RE-${template.id}-${currentMonth}`;
        if (all.some(t => t.id === txId)) { skipped++; continue; }

        const tx: LedgerTransaction = {
          id: txId,
          company,
          docType: 'SA',
          docDate: `${currentMonth}-${String(template.dayOfMonth).padStart(2,'0')}`,
          date: `${currentMonth}-${String(template.dayOfMonth).padStart(2,'0')}`,
          description: `[AUTO] RECURRING: ${template.name}`.toUpperCase(),
          referenceId: template.id,
          status: 'Posted',
          details: [
            { accountId: template.debitAccountId, debit: template.amount, credit: 0, text: 'AUTO POST', costCenterId: template.costCenterId },
            { accountId: template.creditAccountId, debit: 0, credit: template.amount, text: 'AUTO OFFSET' }
          ]
        };
        all.push(tx);

        // Update lastPostedMonth
        const tIdx = updatedTemplates.findIndex(t => t.id === template.id);
        if (tIdx !== -1) updatedTemplates[tIdx] = { ...updatedTemplates[tIdx], lastPostedMonth: currentMonth };
        posted++;
      }

      FinanceService.saveLedger(all);
      FinanceService.saveRecurringExpenses(updatedTemplates);
      return { posted, skipped };
    } catch (e) {
      console.error('[FinanceService] Recurring expense posting error:', e);
      return { posted: 0, skipped: 0 };
    }
  },

};
