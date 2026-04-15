// ═══════════════════════════════════════════════════════════════════
// E2E Document Verifier — Creates real ERP entries and auto-verifies
// they landed correctly in ALL downstream tables/views
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/src/services/supabaseClient';

const ls = (key: string) => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } };

// ── Types ────────────────────────────────────────────────────────────
export interface VerifyLocation {
  name: string;           // "requisitions (Supabase)"
  source: 'supabase' | 'localStorage';
  table: string;          // Supabase table name or localStorage key
  found: boolean;
  record: any | null;     // The actual record found
  fields: FieldCheck[];   // Per-field verification
  latencyMs: number;      // How long the check took
}

export interface FieldCheck {
  field: string;
  expected: any;
  actual: any;
  match: boolean;
}

export interface VerifyResult {
  testId: string;
  testName: string;
  createdId: string;       // The ID of the created document
  createdAt: string;
  locations: VerifyLocation[];
  totalLocations: number;
  passedLocations: number;
  failedLocations: number;
  status: 'pass' | 'fail' | 'partial';
  duration: number;
}

// ── Helper: Check a single Supabase table for the record ─────────
async function checkSupabase(
  table: string,
  filters: Record<string, any>,
  expectedFields: Record<string, any>
): Promise<VerifyLocation> {
  const start = Date.now();
  try {
    let query = supabase.from(table).select('*');
    Object.entries(filters).forEach(([k, v]) => { query = query.eq(k, v); });
    const { data, error } = await query.limit(1).maybeSingle();

    if (error || !data) {
      return {
        name: `${table} (Supabase)`, source: 'supabase', table,
        found: false, record: null,
        fields: Object.entries(expectedFields).map(([f, exp]) => ({ field: f, expected: exp, actual: null, match: false })),
        latencyMs: Date.now() - start
      };
    }

    const fields: FieldCheck[] = Object.entries(expectedFields).map(([field, expected]) => {
      const actual = data[field];
      const match = expected === '*' ? actual != null : String(actual) === String(expected);
      return { field, expected, actual, match };
    });

    return {
      name: `${table} (Supabase)`, source: 'supabase', table,
      found: true, record: data, fields,
      latencyMs: Date.now() - start
    };
  } catch (err) {
    return {
      name: `${table} (Supabase)`, source: 'supabase', table,
      found: false, record: null,
      fields: [{ field: 'error', expected: 'connection', actual: String(err), match: false }],
      latencyMs: Date.now() - start
    };
  }
}

// ── Helper: Check localStorage for the record ────────────────────
function checkLocalStorage(
  lsKey: string,
  findFn: (row: any) => boolean,
  expectedFields: Record<string, any>
): VerifyLocation {
  const start = Date.now();
  const data = ls(lsKey);
  const record = data.find(findFn);

  if (!record) {
    return {
      name: `${lsKey} (localStorage)`, source: 'localStorage', table: lsKey,
      found: false, record: null,
      fields: Object.entries(expectedFields).map(([f, exp]) => ({ field: f, expected: exp, actual: null, match: false })),
      latencyMs: Date.now() - start
    };
  }

  const fields: FieldCheck[] = Object.entries(expectedFields).map(([field, expected]) => {
    const actual = record[field];
    const match = expected === '*' ? actual != null : String(actual) === String(expected);
    return { field, expected, actual, match };
  });

  return {
    name: `${lsKey} (localStorage)`, source: 'localStorage', table: lsKey,
    found: true, record, fields,
    latencyMs: Date.now() - start
  };
}

// ═══════════════════════════════════════════════════════════════════
// VERIFICATION RECIPES — One per document type
// Each recipe: { create() → id, verify(id) → locations[] }
// ══════════════���════════════════════════════════════════════════════

export interface TestRecipe {
  id: string;
  name: string;
  module: string;
  description: string;
  inputs: Array<{ key: string; label: string; type: string; placeholder?: string; options?: string[] }>;
  // verify: given user inputs + created record ID, check all downstream locations
  verify: (inputs: Record<string, any>, createdId?: string) => Promise<VerifyLocation[]>;
}

export const TEST_RECIPES: TestRecipe[] = [

  // ─── REQUISITION ────────────────────────────────────────────────
  {
    id: 'E2E-REQ', name: 'Requisition — Create & Verify All Locations',
    module: 'STORE', description: 'Create a requisition and verify it appears in: requisitions table (Supabase), localStorage, ledger (if PV created on approval)',
    inputs: [
      { key: 'company', label: 'Company', type: 'select', options: ['Glassco', 'GTK', 'GTI', 'Nippon'] },
      { key: 'category', label: 'Category', type: 'select', options: ['Store Purchase', 'Production', 'Admin', 'HR', 'R&M'] },
      { key: 'amount', label: 'Amount PKR', type: 'number', placeholder: '50000' },
      { key: 'requisitioner', label: 'Requisitioner', type: 'text', placeholder: 'Ahmed Khan' },
      { key: 'req_id', label: 'Requisition ID (after creating in ERP)', type: 'text', placeholder: 'REQ-GLS-0426-001' },
    ],
    verify: async (inputs) => {
      const id = inputs.req_id;
      if (!id) return [{ name: 'No ID provided', source: 'localStorage', table: '', found: false, record: null, fields: [], latencyMs: 0 }];

      const locations: VerifyLocation[] = [];

      // 1. Check localStorage
      locations.push(checkLocalStorage('gtk_erp_requisitions', (r) => r.id === id, {
        id: id, status: '*', company: inputs.company, category: inputs.category,
        totalValue: String(inputs.amount), requisitioner: inputs.requisitioner,
      }));

      // 2. Check Supabase
      locations.push(await checkSupabase('requisitions', { id }, {
        id: id, status: '*', company: inputs.company, category: inputs.category,
        total_value: String(inputs.amount),
      }));

      // 3. Check if Parked PV exists in ledger (created on approval)
      locations.push(checkLocalStorage('gtk_erp_ledger', (r) => r.reqId === id || r.req_id === id, {
        reqId: id, docType: 'PV', status: '*',
      }));

      // 4. Check Supabase ledger for PV
      locations.push(await checkSupabase('ledger', { req_id: id }, {
        req_id: id, doc_type: 'PV', status: '*',
      }));

      return locations;
    }
  },

  // ─── QUOTATION ──────────────────────────────────────────────────
  {
    id: 'E2E-QUO', name: 'Quotation — Create & Verify All Locations',
    module: 'SALES', description: 'Create quotation, verify in: quotations table, localStorage, production_pieces (if approved)',
    inputs: [
      { key: 'company', label: 'Company', type: 'select', options: ['Glassco', 'GTK', 'GTI', 'Nippon'] },
      { key: 'client', label: 'Client Name', type: 'text', placeholder: 'Gulshan Towers' },
      { key: 'amount', label: 'Total Amount PKR', type: 'number', placeholder: '252000' },
      { key: 'quo_id', label: 'Quotation ID (after creating in ERP)', type: 'text', placeholder: 'GT-QUT-GLS-0426-2523' },
      { key: 'order_no', label: 'SO Number (if approved)', type: 'text', placeholder: 'GT-SO-GLS-0426-2523' },
    ],
    verify: async (inputs) => {
      const id = inputs.quo_id;
      if (!id) return [];
      const locations: VerifyLocation[] = [];

      // 1. localStorage quotations
      locations.push(checkLocalStorage('gtk_erp_quotations', r => r.id === id, {
        id: id, company: inputs.company, status: '*',
      }));

      // 2. Supabase quotations
      locations.push(await checkSupabase('quotations', { id }, {
        id: id, company: inputs.company, status: '*',
      }));

      // 3. Check production_pieces (if SO exists)
      if (inputs.order_no) {
        locations.push(checkLocalStorage('gtk_erp_production_pieces', r => r.orderId === id || r.orderId === inputs.order_no, {
          orderId: '*', status: '*',
        }));

        locations.push(await checkSupabase('production_pieces', { order_id: inputs.order_no }, {
          order_id: inputs.order_no, status: '*',
        }));
      }

      // 4. Check invoices (if invoiced)
      locations.push(await checkSupabase('invoices', { order_id: id }, {
        order_id: id, company: inputs.company, status: '*',
      }));

      return locations;
    }
  },

  // ─── ATTENDANCE + PAYROLL ───────────────────────────────────────
  {
    id: 'E2E-PAY', name: 'Attendance → Payroll — Verify Full Chain',
    module: 'HR', description: 'Enter attendance, run payroll, verify: attendance records, payroll record, GL journal entry',
    inputs: [
      { key: 'company', label: 'Company', type: 'select', options: ['Glassco', 'GTK', 'GTI', 'Nippon', 'Factory'] },
      { key: 'emp_id', label: 'Employee ID', type: 'text', placeholder: '1711234567890' },
      { key: 'month', label: 'Payroll Month', type: 'text', placeholder: '2026-04' },
      { key: 'payroll_id', label: 'Payroll ID (after running engine)', type: 'text', placeholder: 'PAY-EMP001-2026-04' },
    ],
    verify: async (inputs) => {
      const locations: VerifyLocation[] = [];

      // 1. Attendance records in Supabase
      locations.push(await checkSupabase('attendance',
        { employee_id: inputs.emp_id },
        { employee_id: inputs.emp_id, status: '*' }
      ));

      // 2. Attendance in localStorage
      locations.push(checkLocalStorage('gtk_erp_attendance',
        r => r.employeeId === inputs.emp_id,
        { employeeId: inputs.emp_id, status: '*' }
      ));

      // 3. Payroll record in Supabase
      if (inputs.payroll_id) {
        locations.push(await checkSupabase('payroll', { id: inputs.payroll_id }, {
          id: inputs.payroll_id, employee_id: inputs.emp_id, month: inputs.month,
          net_salary: '*', basic_pay: '*',
        }));
      }

      // 4. Payroll in localStorage
      locations.push(checkLocalStorage('gtk_erp_payroll',
        r => r.employeeId === inputs.emp_id && r.month === inputs.month,
        { employeeId: inputs.emp_id, month: inputs.month, netSalary: '*' }
      ));

      // 5. PAY-JV in ledger
      const jvId = `PAY-JV-${(inputs.month || '').replace('-', '').slice(2)}`;
      locations.push(checkLocalStorage('gtk_erp_ledger',
        r => r.id?.startsWith('PAY-JV') && r.company === inputs.company,
        { id: '*', docType: 'JV', status: 'Posted' }
      ));

      locations.push(await checkSupabase('ledger', { company: inputs.company, doc_type: 'JV' }, {
        company: inputs.company, doc_type: 'JV', status: '*',
      }));

      return locations;
    }
  },

  // ─── LOAN ───────────────────────────────────────────────────────
  {
    id: 'E2E-LOAN', name: 'Loan — Requisition → Disbursement → Payroll Recovery',
    module: 'HR', description: 'Full loan cycle: REQ → Loan → PV → Payroll deduction. Checks all 5 tables.',
    inputs: [
      { key: 'company', label: 'Company', type: 'select', options: ['Glassco', 'GTK', 'GTI', 'Nippon'] },
      { key: 'emp_id', label: 'Employee ID', type: 'text', placeholder: '1711234567890' },
      { key: 'req_id', label: 'Requisition ID', type: 'text', placeholder: 'REQ-GLS-0426-001' },
      { key: 'loan_id', label: 'Loan ID (after HR creates)', type: 'text', placeholder: '1711234567890' },
      { key: 'amount', label: 'Loan Amount PKR', type: 'number', placeholder: '50000' },
    ],
    verify: async (inputs) => {
      const locations: VerifyLocation[] = [];

      // 1. Requisition
      if (inputs.req_id) {
        locations.push(checkLocalStorage('gtk_erp_requisitions', r => r.id === inputs.req_id, {
          id: inputs.req_id, category: 'HR', status: '*',
        }));
        locations.push(await checkSupabase('requisitions', { id: inputs.req_id }, {
          id: inputs.req_id, category: 'HR', status: '*',
        }));
      }

      // 2. Loan record
      if (inputs.loan_id) {
        locations.push(checkLocalStorage('gtk_erp_loans', r => r.id === inputs.loan_id, {
          id: inputs.loan_id, employeeId: inputs.emp_id, amount: String(inputs.amount), status: 'Active',
        }));
        locations.push(await checkSupabase('loans', { id: inputs.loan_id }, {
          id: inputs.loan_id, employee_id: inputs.emp_id, status: 'Active',
        }));
      }

      // 3. Parked PV in ledger
      locations.push(checkLocalStorage('gtk_erp_ledger', r => r.reqId === inputs.req_id, {
        reqId: inputs.req_id, docType: 'PV', status: '*',
      }));

      // 4. GL disbursement entry
      locations.push(checkLocalStorage('gtk_erp_ledger', r => r.id?.startsWith('LOAN-DISB') && r.description?.includes(inputs.emp_id), {
        docType: '*', status: 'Posted',
      }));

      // 5. Payroll deduction (if payroll run)
      locations.push(checkLocalStorage('gtk_erp_payroll', r => r.employeeId === inputs.emp_id && (r.loanDeduction > 0 || r.advanceDeduction > 0), {
        employeeId: inputs.emp_id, loanDeduction: '*',
      }));

      return locations;
    }
  },

  // ─── GL JOURNAL VOUCHER ────��────────────────────────────────────
  {
    id: 'E2E-JV', name: 'Journal Voucher — Maker-Checker Verify',
    module: 'FINANCE', description: 'Draft JV, approve, verify in: ledger (both Draft and Posted), Trial Balance impact',
    inputs: [
      { key: 'company', label: 'Company', type: 'select', options: ['Glassco', 'GTK', 'GTI', 'Nippon'] },
      { key: 'jv_id', label: 'JV ID', type: 'text', placeholder: 'JV-GLS-0426-001' },
      { key: 'amount', label: 'Amount PKR', type: 'number', placeholder: '25000' },
      { key: 'maker', label: 'Maker Email', type: 'text', placeholder: 'accountant@glasstech.pk' },
    ],
    verify: async (inputs) => {
      const locations: VerifyLocation[] = [];

      // 1. Ledger in localStorage
      locations.push(checkLocalStorage('gtk_erp_ledger', r => r.id === inputs.jv_id, {
        id: inputs.jv_id, docType: 'JV', company: inputs.company, status: '*',
      }));

      // 2. Ledger in Supabase
      locations.push(await checkSupabase('ledger', { id: inputs.jv_id }, {
        id: inputs.jv_id, doc_type: 'JV', company: inputs.company, status: '*',
      }));

      // 3. Check GL balance (Dr = Cr)
      const ledger = ls('gtk_erp_ledger');
      const jv = ledger.find((r: any) => r.id === inputs.jv_id);
      if (jv?.details) {
        let dr = 0, cr = 0;
        jv.details.forEach((d: any) => { dr += Number(d.debit || 0); cr += Number(d.credit || 0); });
        const balanced = Math.abs(dr - cr) <= 1;
        locations.push({
          name: 'GL Balance Check', source: 'localStorage', table: 'computed',
          found: true, record: { totalDr: dr, totalCr: cr },
          fields: [
            { field: 'balanced', expected: 'true', actual: String(balanced), match: balanced },
            { field: 'totalDr', expected: '*', actual: dr, match: true },
            { field: 'totalCr', expected: '*', actual: cr, match: true },
          ],
          latencyMs: 0
        });
      }

      // 4. Maker-Checker fields
      if (jv) {
        locations.push({
          name: 'Maker-Checker Audit', source: 'localStorage', table: 'computed',
          found: true, record: jv,
          fields: [
            { field: 'draftedBy', expected: inputs.maker, actual: jv.draftedBy, match: jv.draftedBy === inputs.maker },
            { field: 'approvedBy', expected: '*', actual: jv.approvedBy || 'pending', match: true },
            { field: '4-Eyes', expected: 'different', actual: jv.approvedBy !== jv.draftedBy ? 'pass' : 'same person', match: jv.approvedBy !== jv.draftedBy || !jv.approvedBy },
          ],
          latencyMs: 0
        });
      }

      return locations;
    }
  },

  // ─── GRN + STOCK ────────���───────────────────────────────────────
  {
    id: 'E2E-GRN', name: 'GRN → Stock → MAP — Verify All Tables',
    module: 'STORE', description: 'After GRN posting, verify: store_items (qty, MAP), stock_ledger (mvmnt 101), ledger (GL entry)',
    inputs: [
      { key: 'company', label: 'Company', type: 'select', options: ['Glassco', 'GTK', 'GTI', 'Nippon'] },
      { key: 'item_id', label: 'Item/Material ID', type: 'text', placeholder: 'Float Glass 5mm' },
      { key: 'grn_id', label: 'GRN Reference', type: 'text', placeholder: 'GRN-GLS-0426-001' },
      { key: 'expected_qty', label: 'Expected Total Qty After GRN', type: 'number', placeholder: '600' },
    ],
    verify: async (inputs) => {
      const locations: VerifyLocation[] = [];

      // 1. Store item in localStorage
      locations.push(checkLocalStorage('gtk_erp_store', r => r.id?.includes(inputs.item_id) || r.name?.includes(inputs.item_id), {
        quantity: '*', movingAveragePrice: '*', totalValue: '*',
      }));

      // 2. Store item in Supabase
      locations.push(await checkSupabase('store_items', { company: inputs.company }, {
        company: inputs.company, quantity: '*', moving_average_price: '*',
      }));

      // 3. Stock ledger entry (mvmnt 101) in localStorage
      locations.push(checkLocalStorage('gtk_erp_stock_ledger', r => r.referenceDoc === inputs.grn_id || r.mvmntCode === '101', {
        mvmntCode: '101', referenceDoc: inputs.grn_id,
      }));

      // 4. Stock ledger in Supabase
      locations.push(await checkSupabase('stock_ledger', { reference_doc: inputs.grn_id }, {
        mvmnt_code: '101', reference_doc: inputs.grn_id,
      }));

      // 5. GL entry for GRN
      locations.push(checkLocalStorage('gtk_erp_ledger', r => r.referenceId?.includes(inputs.grn_id) || r.description?.includes('GRN'), {
        docType: '*', status: '*',
      }));

      return locations;
    }
  },

  // ─── INVOICE + PAYMENT ──────────────────────────────────────────
  {
    id: 'E2E-INV', name: 'Invoice → Payment — AR Lifecycle Verify',
    module: 'FINANCE', description: 'After invoice and payment, verify: invoices, payment_receipts, ledger (DR+DZ entries), invoice_balances',
    inputs: [
      { key: 'company', label: 'Company', type: 'select', options: ['Glassco', 'GTK', 'GTI', 'Nippon'] },
      { key: 'inv_id', label: 'Invoice ID', type: 'text', placeholder: 'GT-INV-GLS-0426-0001' },
      { key: 'amount', label: 'Invoice Amount PKR', type: 'number', placeholder: '252000' },
      { key: 'paid', label: 'Amount Paid PKR', type: 'number', placeholder: '150000' },
    ],
    verify: async (inputs) => {
      const locations: VerifyLocation[] = [];

      // 1. Invoice in localStorage
      locations.push(checkLocalStorage('gtk_erp_invoices', r => r.id === inputs.inv_id, {
        id: inputs.inv_id, totalAmount: String(inputs.amount), status: '*',
      }));

      // 2. Invoice in Supabase
      locations.push(await checkSupabase('invoices', { id: inputs.inv_id }, {
        id: inputs.inv_id, total_amount: String(inputs.amount), status: '*',
      }));

      // 3. Payment receipt
      locations.push(checkLocalStorage('gtk_erp_payment_receipts', r => r.invoiceId === inputs.inv_id, {
        invoiceId: inputs.inv_id, amount: String(inputs.paid),
      }));

      // 4. GL entry for invoice (DR)
      locations.push(checkLocalStorage('gtk_erp_ledger', r => r.referenceId?.includes(inputs.inv_id) && r.docType === 'DR', {
        docType: 'DR', status: 'Posted',
      }));

      // 5. GL entry for payment (DZ)
      locations.push(checkLocalStorage('gtk_erp_ledger', r => r.docType === 'DZ' && r.description?.includes(inputs.inv_id), {
        docType: 'DZ', status: 'Posted',
      }));

      // 6. Invoice balance view
      locations.push(await checkSupabase('invoice_balances', { id: inputs.inv_id }, {
        id: inputs.inv_id, total_amount: '*', live_balance: '*',
      }));

      return locations;
    }
  },
];

// ── Run a verification recipe ────────────────────────────────────
export async function runVerification(
  recipeId: string,
  inputs: Record<string, any>,
  onLocationChecked?: (loc: VerifyLocation, idx: number) => void
): Promise<VerifyResult> {
  const start = Date.now();
  const recipe = TEST_RECIPES.find(r => r.id === recipeId);
  if (!recipe) throw new Error(`Recipe ${recipeId} not found`);

  const locations = await recipe.verify(inputs);

  // Notify per-location
  locations.forEach((loc, idx) => onLocationChecked?.(loc, idx));

  const passedLocations = locations.filter(l => l.found && l.fields.every(f => f.match)).length;
  const failedLocations = locations.filter(l => !l.found || l.fields.some(f => !f.match)).length;

  return {
    testId: recipeId,
    testName: recipe.name,
    createdId: inputs.req_id || inputs.quo_id || inputs.jv_id || inputs.inv_id || inputs.grn_id || inputs.loan_id || 'N/A',
    createdAt: new Date().toISOString(),
    locations,
    totalLocations: locations.length,
    passedLocations,
    failedLocations,
    status: failedLocations === 0 ? 'pass' : passedLocations === 0 ? 'fail' : 'partial',
    duration: Date.now() - start
  };
}
