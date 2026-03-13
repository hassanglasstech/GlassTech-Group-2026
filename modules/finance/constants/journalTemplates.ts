// ============================================================
// JOURNAL ENTRY TEMPLATES — IFRS for SMEs
// Each template defines correct Dr/Cr sides per business event
// ============================================================

import { Company } from '@/modules/shared/types/core';

export type DocType = 'SA' | 'KR' | 'DR' | 'DZ' | 'KZ' | 'CJ' | 'OB' | 'PV' | 'RV' | 'JV';

export interface JournalLine {
  side: 'Dr' | 'Cr';
  accountTypeHint: string;   // used to auto-find account from COA
  accountCodePrefix?: string; // fallback prefix match
  label: string;
}

export interface BusinessTransaction {
  id: string;
  code: string;            // e.g. "SI-001"
  name: string;            // e.g. "Sales Invoice — Revenue"
  docType: DocType;
  description: string;
  lines: JournalLine[];
  isSystem?: boolean;      // system templates cannot be deleted
  company?: Company | 'ALL'; // ALL = available for all companies
}

// ── System-defined templates ─────────────────────────────────
export const SYSTEM_JOURNAL_TEMPLATES: BusinessTransaction[] = [

  // ── SALES CYCLE ──────────────────────────────────────────
  {
    id: 'SI-001', code: 'SI-001', name: 'Sales Invoice — Revenue Recognition',
    docType: 'DR', description: 'Record revenue on customer invoice (IFRS 15)',
    isSystem: true, company: 'ALL',
    lines: [
      { side: 'Dr', accountTypeHint: 'RECEIVABLE',     accountCodePrefix: '112', label: 'Accounts Receivable (Client)' },
      { side: 'Cr', accountTypeHint: 'REVENUE',        accountCodePrefix: '411', label: 'Sales Revenue' },
      { side: 'Cr', accountTypeHint: 'SALES TAX',      accountCodePrefix: '2131', label: 'Sales Tax Payable (Output)' },
    ]
  },
  {
    id: 'SI-002', code: 'SI-002', name: 'Cash/Bank Receipt — Customer Payment',
    docType: 'DZ', description: 'Record customer payment against receivable',
    isSystem: true, company: 'ALL',
    lines: [
      { side: 'Dr', accountTypeHint: 'CASH OR BANK',   accountCodePrefix: '111', label: 'Cash / Bank Account' },
      { side: 'Cr', accountTypeHint: 'RECEIVABLE',     accountCodePrefix: '112', label: 'Accounts Receivable (Client)' },
    ]
  },
  {
    id: 'SI-003', code: 'SI-003', name: 'Advance Received from Client',
    docType: 'DZ', description: 'Record advance payment before invoice (liability until earned)',
    isSystem: true, company: 'ALL',
    lines: [
      { side: 'Dr', accountTypeHint: 'CASH OR BANK',   accountCodePrefix: '111', label: 'Cash / Bank' },
      { side: 'Cr', accountTypeHint: 'ADVANCE CLIENT', accountCodePrefix: '2113', label: 'Advance from Client (Liability)' },
    ]
  },
  {
    id: 'SI-004', code: 'SI-004', name: 'Advance Applied Against Invoice',
    docType: 'DR', description: 'Apply advance to reduce receivable on invoice',
    isSystem: true, company: 'ALL',
    lines: [
      { side: 'Dr', accountTypeHint: 'ADVANCE CLIENT', accountCodePrefix: '2113', label: 'Advance from Client (Reverse)' },
      { side: 'Cr', accountTypeHint: 'RECEIVABLE',     accountCodePrefix: '112', label: 'Accounts Receivable' },
    ]
  },
  {
    id: 'SI-005', code: 'SI-005', name: 'Bad Debt Write-Off',
    docType: 'SA', description: 'Write off irrecoverable receivable (IAS 39)',
    isSystem: true, company: 'ALL',
    lines: [
      { side: 'Dr', accountTypeHint: 'BAD DEBT',       accountCodePrefix: '5611', label: 'Bad Debt Expense' },
      { side: 'Cr', accountTypeHint: 'RECEIVABLE',     accountCodePrefix: '112', label: 'Accounts Receivable' },
    ]
  },

  // ── PURCHASE CYCLE ───────────────────────────────────────
  {
    id: 'PI-001', code: 'PI-001', name: 'Purchase Invoice — Goods / Materials',
    docType: 'KR', description: 'Record vendor invoice for material purchase',
    isSystem: true, company: 'ALL',
    lines: [
      { side: 'Dr', accountTypeHint: 'INVENTORY OR MATERIAL', accountCodePrefix: '115', label: 'Inventory / Raw Material' },
      { side: 'Dr', accountTypeHint: 'INPUT TAX',       accountCodePrefix: '21312', label: 'Sales Tax — Input (Recoverable)' },
      { side: 'Cr', accountTypeHint: 'PAYABLE',         accountCodePrefix: '211', label: 'Accounts Payable (Vendor)' },
    ]
  },
  {
    id: 'PI-002', code: 'PI-002', name: 'Purchase Invoice — Services / Expenses',
    docType: 'KR', description: 'Record vendor invoice for services (no inventory)',
    isSystem: true, company: 'ALL',
    lines: [
      { side: 'Dr', accountTypeHint: 'EXPENSE',         accountCodePrefix: '53', label: 'Operating Expense' },
      { side: 'Cr', accountTypeHint: 'PAYABLE',         accountCodePrefix: '211', label: 'Accounts Payable (Vendor)' },
    ]
  },
  {
    id: 'PI-003', code: 'PI-003', name: 'Vendor Payment — Bank Transfer',
    docType: 'KZ', description: 'Pay vendor against payable',
    isSystem: true, company: 'ALL',
    lines: [
      { side: 'Dr', accountTypeHint: 'PAYABLE',         accountCodePrefix: '211', label: 'Accounts Payable (Vendor)' },
      { side: 'Cr', accountTypeHint: 'BANK',            accountCodePrefix: '1112', label: 'Bank Account' },
    ]
  },
  {
    id: 'PI-004', code: 'PI-004', name: 'Advance Paid to Vendor',
    docType: 'KZ', description: 'Advance payment before receiving goods',
    isSystem: true, company: 'ALL',
    lines: [
      { side: 'Dr', accountTypeHint: 'VENDOR ADVANCE',  accountCodePrefix: '1141', label: 'Advance to Vendor (Asset)' },
      { side: 'Cr', accountTypeHint: 'CASH OR BANK',    accountCodePrefix: '111', label: 'Cash / Bank' },
    ]
  },
  {
    id: 'PI-005', code: 'PI-005', name: 'Advance Adjusted Against Purchase',
    docType: 'KR', description: 'Set off vendor advance against invoice',
    isSystem: true, company: 'ALL',
    lines: [
      { side: 'Dr', accountTypeHint: 'PAYABLE',         accountCodePrefix: '211', label: 'Accounts Payable' },
      { side: 'Cr', accountTypeHint: 'VENDOR ADVANCE',  accountCodePrefix: '1141', label: 'Vendor Advance (Reverse)' },
    ]
  },

  // ── CASH / PETTY CASH ────────────────────────────────────
  {
    id: 'CJ-001', code: 'CJ-001', name: 'Cash Payment — Petty Expense',
    docType: 'CJ', description: 'Pay small expense from petty cash',
    isSystem: true, company: 'ALL',
    lines: [
      { side: 'Dr', accountTypeHint: 'EXPENSE',         accountCodePrefix: '53', label: 'Operating Expense' },
      { side: 'Cr', accountTypeHint: 'PETTY CASH',      accountCodePrefix: '11111', label: 'Petty Cash' },
    ]
  },
  {
    id: 'CJ-002', code: 'CJ-002', name: 'Petty Cash Replenishment',
    docType: 'CJ', description: 'Top up petty cash from main bank',
    isSystem: true, company: 'ALL',
    lines: [
      { side: 'Dr', accountTypeHint: 'PETTY CASH',      accountCodePrefix: '11111', label: 'Petty Cash' },
      { side: 'Cr', accountTypeHint: 'BANK',            accountCodePrefix: '1112', label: 'Bank Account' },
    ]
  },
  {
    id: 'CJ-003', code: 'CJ-003', name: 'Cash Receipt — Miscellaneous',
    docType: 'RV', description: 'Receive cash for non-invoice income',
    isSystem: true, company: 'ALL',
    lines: [
      { side: 'Dr', accountTypeHint: 'CASH OR BANK',    accountCodePrefix: '111', label: 'Cash / Bank' },
      { side: 'Cr', accountTypeHint: 'OTHER INCOME',    accountCodePrefix: '421', label: 'Other Income' },
    ]
  },

  // ── PAYROLL ──────────────────────────────────────────────
  {
    id: 'HR-001', code: 'HR-001', name: 'Salary Expense — Monthly Accrual',
    docType: 'SA', description: 'Record monthly salary expense before payment',
    isSystem: true, company: 'ALL',
    lines: [
      { side: 'Dr', accountTypeHint: 'SALARY EXPENSE',  accountCodePrefix: '531', label: 'Salaries & Wages' },
      { side: 'Cr', accountTypeHint: 'SALARY PAYABLE',  accountCodePrefix: '2141', label: 'Salary Payable (Accrued)' },
    ]
  },
  {
    id: 'HR-002', code: 'HR-002', name: 'Salary Payment — Bank Transfer',
    docType: 'PV', description: 'Pay salaries from bank, clear payable',
    isSystem: true, company: 'ALL',
    lines: [
      { side: 'Dr', accountTypeHint: 'SALARY PAYABLE',  accountCodePrefix: '2141', label: 'Salary Payable' },
      { side: 'Cr', accountTypeHint: 'BANK',            accountCodePrefix: '1112', label: 'Bank Account' },
    ]
  },
  {
    id: 'HR-003', code: 'HR-003', name: 'Employee Advance',
    docType: 'PV', description: 'Advance given to employee (asset until recovered)',
    isSystem: true, company: 'ALL',
    lines: [
      { side: 'Dr', accountTypeHint: 'EMPLOYEE ADVANCE', accountCodePrefix: '1142', label: 'Employee Advance (Asset)' },
      { side: 'Cr', accountTypeHint: 'CASH OR BANK',     accountCodePrefix: '111', label: 'Cash / Bank' },
    ]
  },
  {
    id: 'HR-004', code: 'HR-004', name: 'Employee Advance Recovery',
    docType: 'SA', description: 'Recover advance via salary deduction',
    isSystem: true, company: 'ALL',
    lines: [
      { side: 'Dr', accountTypeHint: 'SALARY PAYABLE',   accountCodePrefix: '2141', label: 'Salary Payable' },
      { side: 'Cr', accountTypeHint: 'EMPLOYEE ADVANCE', accountCodePrefix: '1142', label: 'Employee Advance (Reverse)' },
    ]
  },
  {
    id: 'HR-005', code: 'HR-005', name: 'Employee Loan Written Off',
    docType: 'SA', description: 'Write off irrecoverable loan (absconded employee)',
    isSystem: true, company: 'ALL',
    lines: [
      { side: 'Dr', accountTypeHint: 'LOAN WRITE OFF',   accountCodePrefix: '5611', label: 'Employee Loan Write-Off (Expense)' },
      { side: 'Cr', accountTypeHint: 'EMPLOYEE LOAN',    accountCodePrefix: '1142', label: 'Employee Loan (Asset)' },
    ]
  },
  {
    id: 'HR-006', code: 'HR-006', name: 'Absent / Late Deduction — Employee Fund',
    docType: 'SA', description: 'Transfer deduction to employee welfare fund',
    isSystem: true, company: 'ALL',
    lines: [
      { side: 'Dr', accountTypeHint: 'SALARY PAYABLE',   accountCodePrefix: '2141', label: 'Salary Payable' },
      { side: 'Cr', accountTypeHint: 'EMPLOYEE FUND',    accountCodePrefix: '21413', label: 'Employee Deduction Fund (Liability)' },
    ]
  },
  {
    id: 'HR-007', code: 'HR-007', name: 'EOBI / PESSI — Employer Contribution',
    docType: 'SA', description: 'Record statutory employer contribution',
    isSystem: true, company: 'ALL',
    lines: [
      { side: 'Dr', accountTypeHint: 'EOBI EXPENSE',     accountCodePrefix: '5122', label: 'EOBI / PESSI Expense' },
      { side: 'Cr', accountTypeHint: 'EOBI PAYABLE',     accountCodePrefix: '2133', label: 'EOBI / PESSI Payable' },
    ]
  },

  // ── TAXES ────────────────────────────────────────────────
  {
    id: 'TX-001', code: 'TX-001', name: 'WHT Deducted from Vendor Payment',
    docType: 'KZ', description: 'Deduct withholding tax at source on vendor payment',
    isSystem: true, company: 'ALL',
    lines: [
      { side: 'Dr', accountTypeHint: 'PAYABLE',          accountCodePrefix: '211', label: 'Accounts Payable' },
      { side: 'Cr', accountTypeHint: 'WHT PAYABLE',      accountCodePrefix: '21321', label: 'WHT Payable — Vendor' },
      { side: 'Cr', accountTypeHint: 'BANK',             accountCodePrefix: '1112', label: 'Bank (Net Payment)' },
    ]
  },
  {
    id: 'TX-002', code: 'TX-002', name: 'FBR Challan / Govt Tax Payment',
    docType: 'PV', description: 'Pay FBR challan, traffic challan, or govt levy',
    isSystem: true, company: 'ALL',
    lines: [
      { side: 'Dr', accountTypeHint: 'GOVT TAX EXPENSE', accountCodePrefix: '53821', label: 'Govt Fees & Taxes' },
      { side: 'Cr', accountTypeHint: 'CASH OR BANK',     accountCodePrefix: '111', label: 'Cash / Bank' },
    ]
  },
  {
    id: 'TX-003', code: 'TX-003', name: 'Facilitation Payment (Unofficial)',
    docType: 'PV', description: 'Record unofficial payment (rishwat) as business expense',
    isSystem: true, company: 'ALL',
    lines: [
      { side: 'Dr', accountTypeHint: 'FACILITATION',     accountCodePrefix: '53823', label: 'Facilitation Payments' },
      { side: 'Cr', accountTypeHint: 'CASH OR BANK',     accountCodePrefix: '111', label: 'Cash / Petty Cash' },
    ]
  },

  // ── FIXED ASSETS ─────────────────────────────────────────
  {
    id: 'FA-001', code: 'FA-001', name: 'Asset Purchase',
    docType: 'KR', description: 'Capitalize a new fixed asset',
    isSystem: true, company: 'ALL',
    lines: [
      { side: 'Dr', accountTypeHint: 'FIXED ASSET',      accountCodePrefix: '121', label: 'PPE — Cost' },
      { side: 'Cr', accountTypeHint: 'PAYABLE OR BANK',  accountCodePrefix: '211', label: 'Vendor Payable / Bank' },
    ]
  },
  {
    id: 'FA-002', code: 'FA-002', name: 'Depreciation — Monthly Charge',
    docType: 'SA', description: 'Record periodic depreciation (straight-line)',
    isSystem: true, company: 'ALL',
    lines: [
      { side: 'Dr', accountTypeHint: 'DEPRECIATION EXP', accountCodePrefix: '539', label: 'Depreciation Expense' },
      { side: 'Cr', accountTypeHint: 'ACCUM DEP',        accountCodePrefix: '1212', label: 'Accumulated Depreciation' },
    ]
  },
  {
    id: 'FA-003', code: 'FA-003', name: 'Asset Repair & Maintenance',
    docType: 'PV', description: 'Expense for repair (not capitalized)',
    isSystem: true, company: 'ALL',
    lines: [
      { side: 'Dr', accountTypeHint: 'REPAIR EXPENSE',   accountCodePrefix: '536', label: 'Repair & Maintenance Expense' },
      { side: 'Cr', accountTypeHint: 'CASH OR BANK',     accountCodePrefix: '111', label: 'Cash / Bank' },
    ]
  },

  // ── FACTORY SPECIFIC ─────────────────────────────────────
  {
    id: 'FC-001', code: 'FC-001', name: 'Factory Shared Cost — Monthly Allocation',
    docType: 'SA', description: 'Allocate factory overheads: GTK 50%, Glassco 30%, Nippon 20%',
    isSystem: true, company: 'ALL',
    lines: [
      { side: 'Dr', accountTypeHint: 'COST ALLOCATED GTK',     accountCodePrefix: '5811', label: 'Cost Allocated — GTK (50%)' },
      { side: 'Dr', accountTypeHint: 'COST ALLOCATED GLASSCO', accountCodePrefix: '5812', label: 'Cost Allocated — Glassco (30%)' },
      { side: 'Dr', accountTypeHint: 'COST ALLOCATED NIPPON',  accountCodePrefix: '5813', label: 'Cost Allocated — Nippon (20%)' },
      { side: 'Cr', accountTypeHint: 'FACTORY OVERHEAD',       accountCodePrefix: '51', label: 'Factory Overhead Pool' },
    ]
  },
  {
    id: 'FC-002', code: 'FC-002', name: 'Shehzore Transport — Charge to Company',
    docType: 'SA', description: 'Bill Shehzore fare to requesting company',
    isSystem: true, company: 'ALL',
    lines: [
      { side: 'Dr', accountTypeHint: 'TRANSPORT EXPENSE', accountCodePrefix: '513', label: 'Transport — Company (Expense)' },
      { side: 'Cr', accountTypeHint: 'TRANSPORT INCOME',  accountCodePrefix: '42112', label: 'Shehzore Charges Recovered (Factory)' },
    ]
  },
  {
    id: 'FC-003', code: 'FC-003', name: 'Generator Fuel — Cash Purchase',
    docType: 'CJ', description: 'Buy diesel/petrol for generator from petty cash',
    isSystem: true, company: 'ALL',
    lines: [
      { side: 'Dr', accountTypeHint: 'GENERATOR FUEL',    accountCodePrefix: '5411', label: 'Generator Fuel Expense' },
      { side: 'Cr', accountTypeHint: 'PETTY CASH',        accountCodePrefix: '11111', label: 'Petty Cash' },
    ]
  },

  // ── INTERCOMPANY ─────────────────────────────────────────
  {
    id: 'IC-001', code: 'IC-001', name: 'Intercompany Loan / Fund Transfer',
    docType: 'SA', description: 'Transfer funds between group companies',
    isSystem: true, company: 'ALL',
    lines: [
      { side: 'Dr', accountTypeHint: 'DUE FROM COMPANY',  accountCodePrefix: '1131', label: 'Due from Sister Company (Asset)' },
      { side: 'Cr', accountTypeHint: 'CASH OR BANK',      accountCodePrefix: '111', label: 'Cash / Bank' },
    ]
  },
  {
    id: 'IC-002', code: 'IC-002', name: 'Intercompany Settlement',
    docType: 'SA', description: 'Settle intercompany balance',
    isSystem: true, company: 'ALL',
    lines: [
      { side: 'Dr', accountTypeHint: 'DUE TO COMPANY',    accountCodePrefix: '2121', label: 'Due to Sister Company (Liability)' },
      { side: 'Cr', accountTypeHint: 'BANK',              accountCodePrefix: '1112', label: 'Bank Account' },
    ]
  },
];

// ── localStorage helpers ─────────────────────────────────────
const CUSTOM_TEMPLATES_KEY = 'glasstech_journal_templates';

export const JournalTemplateService = {
  getAll: (): BusinessTransaction[] => {
    const stored = localStorage.getItem(CUSTOM_TEMPLATES_KEY);
    const custom: BusinessTransaction[] = stored ? JSON.parse(stored) : [];
    return [...SYSTEM_JOURNAL_TEMPLATES, ...custom];
  },
  getCustom: (): BusinessTransaction[] => {
    const stored = localStorage.getItem(CUSTOM_TEMPLATES_KEY);
    return stored ? JSON.parse(stored) : [];
  },
  save: (templates: BusinessTransaction[]) => {
    const custom = templates.filter(t => !t.isSystem);
    localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(custom));
  },
  add: (t: BusinessTransaction) => {
    const custom = JournalTemplateService.getCustom();
    custom.push(t);
    localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(custom));
  },
  delete: (id: string) => {
    const custom = JournalTemplateService.getCustom().filter(t => t.id !== id);
    localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(custom));
  },
};
