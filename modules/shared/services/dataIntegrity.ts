/**
 * GLASSTECH ERP — Data Integrity Service (EH-Phase 5)
 *
 * Features:
 * 1. Schema validation — detect corrupted/mismatched records
 * 2. Auto-repair — fix common data issues
 * 3. Orphan detection — records referencing deleted parents
 * 4. Data health report — full integrity scan
 */

import { toast } from 'sonner';
import { safeParse, safeSave } from './utils';

// ── localStorage keys ─────────────────────────────────────────────────
const ALL_KEYS = {
  employees:          'gtk_erp_employees',
  attendance:         'gtk_erp_attendance',
  loans:              'gtk_erp_loans',
  payroll:            'gtk_erp_payroll',
  accounts:           'gtk_erp_accounts',
  cost_centers:       'gtk_erp_cost_centers',
  ledger:             'gtk_erp_ledger',
  petty_cash:         'gtk_erp_petty_cash',
  recurring_expenses: 'gtk_erp_recurring_expenses',
  financial_events:   'gtk_erp_financial_events',
  mapping_rules:      'gtk_erp_mapping_rules',
  gl_config:          'gtk_erp_gl_config',
  clients:            'gtk_erp_clients',
  quotations:         'gtk_erp_quotations',
  projects:           'gtk_erp_projects',
  products:           'gtk_erp_products',
  vendors:            'gtk_erp_vendors',
  store_items:        'gtk_erp_store',
  stock_ledger:       'gtk_erp_stock_ledger',
  inspection_lots:    'gtk_erp_inspection_lots',
  remnants:           'gtk_erp_remnants',
  handling_units:     'gtk_erp_handling_units',
  requisitions:       'gtk_erp_requisitions',
  purchase_orders:    'gtk_erp_purchase_orders',
  production_pieces:  'gtk_erp_production_pieces',
  job_orders:         'gtk_erp_job_orders',
  gate_passes:        'gtk_erp_gate_pass',
  warehouse_spots:    'gtk_erp_warehouse_spots',
  activity_logs:      'gtk_erp_activity_logs',
};

// ── Minimum required fields per collection ────────────────────────────
const REQUIRED_FIELDS: Record<string, string[]> = {
  employees:         ['id', 'company', 'personal', 'work', 'salary'],
  attendance:        ['id', 'employeeId', 'date', 'status'],
  loans:             ['id', 'employeeId', 'amount', 'type'],
  payroll:           ['id', 'employeeId', 'month', 'netSalary'],
  accounts:          ['id', 'company', 'code', 'name'],
  ledger:            ['id', 'company', 'docType', 'docDate'],
  clients:           ['id', 'company', 'name'],
  quotations:        ['id', 'company', 'date', 'clientId'],
  products:          ['id', 'company', 'description', 'basePrice'],
  store_items:       ['id', 'company', 'name', 'quantity'],
  requisitions:      ['id', 'company', 'date', 'requisitioner'],
  purchase_orders:   ['id', 'fromCompany'],
  job_orders:        ['id', 'company'],
  vendors:           ['id', 'name'],
};

// ── Default values for auto-repair ───────────────────────────────────
const DEFAULTS: Record<string, Record<string, any>> = {
  products:    { unit: 'PCS', basePrice: 0, variants: [], isSet: false },
  store_items: { quantity: 0, unit: 'PCS', minLevel: 0 },
  employees:   { personal: {}, work: {}, salary: {} },
  quotations:  { items: [], status: 'Draft', discountPercent: 0 },
  accounts:    { balance: 0, normalBalance: 'Dr' },
  ledger:      { lineItems: [], status: 'Parked' },
};

export interface IntegrityIssue {
  collection: string;
  recordId:   string;
  type:       'missing_field' | 'null_id' | 'wrong_type' | 'orphan' | 'duplicate_id';
  field?:     string;
  message:    string;
  repaired:   boolean;
}

export interface IntegrityReport {
  timestamp:    string;
  totalRecords: number;
  issues:       IntegrityIssue[];
  repaired:     number;
  collections:  Record<string, { count: number; issues: number }>;
}

// ── Core validation ───────────────────────────────────────────────────
const validateCollection = (
  name: string,
  records: any[],
  repair: boolean
): { issues: IntegrityIssue[]; cleaned: any[] } => {
  const issues: IntegrityIssue[] = [];
  const seenIds = new Set<string>();
  const cleaned: any[] = [];
  const required = REQUIRED_FIELDS[name] || ['id'];
  const defaults = DEFAULTS[name] || {};

  for (let rec of records) {
    // Skip non-objects
    if (!rec || typeof rec !== 'object') {
      issues.push({
        collection: name, recordId: '?',
        type: 'wrong_type', message: 'Non-object record found',
        repaired: repair
      });
      if (!repair) cleaned.push(rec);
      continue;
    }

    let fixed = { ...rec };
    let hasIssue = false;

    // Check null/missing id
    if (!fixed.id) {
      if (repair) {
        fixed.id = `${name}_repaired_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
      }
      issues.push({
        collection: name, recordId: fixed.id || '?',
        type: 'null_id', message: 'Missing or null ID',
        repaired: repair
      });
      hasIssue = true;
    }

    // Check duplicate IDs
    if (fixed.id && seenIds.has(fixed.id)) {
      issues.push({
        collection: name, recordId: fixed.id,
        type: 'duplicate_id', message: `Duplicate ID: ${fixed.id}`,
        repaired: false
      });
      if (repair) continue; // skip duplicate
    }
    if (fixed.id) seenIds.add(fixed.id);

    // Check required fields
    for (const field of required) {
      if (fixed[field] === undefined || fixed[field] === null) {
        if (repair && defaults[field] !== undefined) {
          fixed[field] = defaults[field];
        }
        issues.push({
          collection: name, recordId: fixed.id,
          type: 'missing_field', field,
          message: `Missing required field: ${field}`,
          repaired: repair && defaults[field] !== undefined
        });
        hasIssue = true;
      }
    }

    // Type checks
    if (fixed.basePrice !== undefined && isNaN(Number(fixed.basePrice))) {
      if (repair) fixed.basePrice = 0;
      issues.push({
        collection: name, recordId: fixed.id,
        type: 'wrong_type', field: 'basePrice',
        message: 'basePrice is not a number',
        repaired: repair
      });
    }

    if (fixed.quantity !== undefined && isNaN(Number(fixed.quantity))) {
      if (repair) fixed.quantity = 0;
      issues.push({
        collection: name, recordId: fixed.id,
        type: 'wrong_type', field: 'quantity',
        message: 'quantity is not a number',
        repaired: repair
      });
    }

    // Array fields that should be arrays
    for (const arrField of ['items', 'variants', 'lineItems', 'setComponents']) {
      if (fixed[arrField] !== undefined && !Array.isArray(fixed[arrField])) {
        if (repair) fixed[arrField] = [];
        issues.push({
          collection: name, recordId: fixed.id,
          type: 'wrong_type', field: arrField,
          message: `${arrField} should be an array`,
          repaired: repair
        });
      }
    }

    cleaned.push(fixed);
  }

  return { issues, cleaned };
};

// ── Orphan detection ──────────────────────────────────────────────────
const detectOrphans = (): IntegrityIssue[] => {
  const issues: IntegrityIssue[] = [];

  const employees  = safeParse(ALL_KEYS.employees)  as any[];
  const clients    = safeParse(ALL_KEYS.clients)     as any[];
  const products   = safeParse(ALL_KEYS.products)    as any[];

  const employeeIds = new Set(employees.map((e: any) => e.id));
  const clientIds   = new Set(clients.map((c: any) => c.id));
  const productIds  = new Set(products.map((p: any) => p.id));

  // Attendance referencing deleted employees
  const attendance = safeParse(ALL_KEYS.attendance) as any[];
  for (const rec of attendance) {
    if (rec.employeeId && !employeeIds.has(rec.employeeId)) {
      issues.push({
        collection: 'attendance', recordId: rec.id,
        type: 'orphan',
        message: `References deleted employee: ${rec.employeeId}`,
        repaired: false
      });
    }
  }

  // Payroll referencing deleted employees
  const payroll = safeParse(ALL_KEYS.payroll) as any[];
  for (const rec of payroll) {
    if (rec.employeeId && !employeeIds.has(rec.employeeId)) {
      issues.push({
        collection: 'payroll', recordId: rec.id,
        type: 'orphan',
        message: `References deleted employee: ${rec.employeeId}`,
        repaired: false
      });
    }
  }

  // Quotations referencing deleted clients
  const quotations = safeParse(ALL_KEYS.quotations) as any[];
  for (const rec of quotations) {
    if (rec.clientId && !clientIds.has(rec.clientId)) {
      issues.push({
        collection: 'quotations', recordId: rec.id,
        type: 'orphan',
        message: `References deleted client: ${rec.clientId}`,
        repaired: false
      });
    }
  }

  return issues;
};

// ── Main integrity scanner ────────────────────────────────────────────
export const DataIntegrity = {

  // Full scan — detect issues without repairing
  scan: (): IntegrityReport => {
    const report: IntegrityReport = {
      timestamp:    new Date().toISOString(),
      totalRecords: 0,
      issues:       [],
      repaired:     0,
      collections:  {},
    };

    for (const [name, key] of Object.entries(ALL_KEYS)) {
      const records = safeParse(key) as any[];
      if (!Array.isArray(records)) continue;

      report.totalRecords += records.length;
      const { issues } = validateCollection(name, records, false);
      report.issues.push(...issues);
      report.collections[name] = { count: records.length, issues: issues.length };
    }

    // Add orphan issues
    report.issues.push(...detectOrphans());

    return report;
  },

  // Full repair — fix all auto-repairable issues
  repair: (): { fixed: number; skipped: number } => {
    let fixed = 0, skipped = 0;

    for (const [name, key] of Object.entries(ALL_KEYS)) {
      const records = safeParse(key) as any[];
      if (!Array.isArray(records) || records.length === 0) continue;

      const { issues, cleaned } = validateCollection(name, records, true);
      const repairedCount = issues.filter(i => i.repaired).length;

      if (repairedCount > 0) {
        safeSave(key, cleaned);
        fixed += repairedCount;
        console.log(`[DataIntegrity] Repaired ${repairedCount} issues in ${name}`);
      }
      skipped += issues.filter(i => !i.repaired).length;
    }

    return { fixed, skipped };
  },

  // Quick health check — just counts
  quickCheck: (): { healthy: boolean; issues: number; collections: number } => {
    let totalIssues = 0;
    let collectionsWithIssues = 0;

    for (const [name, key] of Object.entries(ALL_KEYS)) {
      const records = safeParse(key) as any[];
      if (!Array.isArray(records) || records.length === 0) continue;
      const { issues } = validateCollection(name, records, false);
      if (issues.length > 0) {
        totalIssues += issues.length;
        collectionsWithIssues++;
      }
    }

    return {
      healthy: totalIssues === 0,
      issues:  totalIssues,
      collections: collectionsWithIssues,
    };
  },

  // Run on app startup — silent auto-repair of critical issues
  autoRepairOnStartup: (): void => {
    try {
      const { fixed, skipped } = DataIntegrity.repair();
      if (fixed > 0) {
        console.log(`[DataIntegrity] Startup repair: ${fixed} issues fixed, ${skipped} skipped`);
      }
    } catch (err) {
      console.warn('[DataIntegrity] Startup repair failed:', err);
    }
  },

  // Export full report as JSON
  exportReport: (): void => {
    const report = DataIntegrity.scan();
    const blob = new Blob(
      [JSON.stringify(report, null, 2)],
      { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = `integrity_report_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Integrity report exported.', { duration: 2000 });
  },
};
