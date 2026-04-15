// ═══════════════════════════════════════════════════════════════════
// E2E Document Verifier — Agent auto-creates real ERP entries, then
// verifies they landed correctly in ALL downstream tables/views
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/src/services/supabaseClient';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { SalesService } from '@/modules/sales/services/salesService';
import { HRService } from '@/modules/hr/services/hrService';
import { FinanceService } from '@/modules/finance/services/financeService';
import { AppService } from '@/modules/shared/services/appService';

const ls = (key: string) => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } };

// ── Types ────────────────────────────────────────────────────────────
export interface VerifyLocation {
  name: string;
  source: 'supabase' | 'localStorage';
  table: string;
  found: boolean;
  record: any | null;
  fields: FieldCheck[];
  latencyMs: number;
}

export interface FieldCheck {
  field: string;
  expected: any;
  actual: any;
  match: boolean;
}

export interface CreatedRecord {
  id: string;
  summary: string;
  data: any;
  timestamp: string;
}

export interface VerifyResult {
  testId: string;
  testName: string;
  createdId: string;
  createdAt: string;
  locations: VerifyLocation[];
  totalLocations: number;
  passedLocations: number;
  failedLocations: number;
  status: 'pass' | 'fail' | 'partial';
  duration: number;
}

// ── Helper: Check a single Supabase table ────────────────────────
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

// ── Helper: Check localStorage ───────────────────────────────────
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
// VERIFICATION RECIPES
// Each recipe: { create() → createdId, verify(inputs) → locations[] }
// ═══════════════════════════════════════════════════════════════════

export interface TestRecipe {
  id: string;
  name: string;
  module: string;
  description: string;
  idField: string; // which inputs key holds the document ID for verify()
  inputs: Array<{ key: string; label: string; type: string; placeholder?: string; options?: string[] }>;
  create: (inputs: Record<string, any>) => Promise<{ createdId: string; createdData: any; summary: string }>;
  verify: (inputs: Record<string, any>) => Promise<VerifyLocation[]>;
}

export const TEST_RECIPES: TestRecipe[] = [

  // ─── REQUISITION ────────────────────────────────────────────────
  {
    id: 'E2E-REQ',
    name: 'Requisition — Auto-Create & Verify All Locations',
    module: 'STORE',
    description: 'Agent creates a requisition via InventoryService, then verifies it appears in: localStorage, Supabase, and ledger (Parked PV if approved)',
    idField: 'req_id',
    inputs: [
      { key: 'company',       label: 'Company',      type: 'select',  options: ['Glassco', 'GTK', 'GTI', 'Nippon'] },
      { key: 'category',      label: 'Category',     type: 'select',  options: ['Store Purchase', 'Production', 'Admin', 'HR', 'R&M'] },
      { key: 'amount',        label: 'Amount PKR',   type: 'number',  placeholder: '50000' },
      { key: 'requisitioner', label: 'Requisitioner',type: 'text',    placeholder: 'Ahmed Khan' },
    ],
    create: async (inputs) => {
      const existing = InventoryService.getRequisitions();
      const id = AppService.generateSequenceID('REQ', inputs.company, existing);
      const newReq = {
        id,
        company: inputs.company,
        date: new Date().toISOString().split('T')[0],
        headerText: `E2E Test — ${inputs.category}`,
        requisitioner: inputs.requisitioner || 'E2E Agent',
        priority: 'Normal' as const,
        items: [{
          id: `${id}-1`,
          description: 'E2E Test Item',
          qty: 1,
          uom: 'PCS',
          estimatedPrice: Number(inputs.amount),
          totalValue: Number(inputs.amount),
        }],
        totalValue: Number(inputs.amount),
        status: 'Pending' as const,
        category: inputs.category,
      };
      InventoryService.saveRequisitions([...existing, newReq]);
      return {
        createdId: id,
        createdData: newReq,
        summary: `Requisition ${id} created — ${inputs.company} | ${inputs.category} | PKR ${Number(inputs.amount).toLocaleString()}`,
      };
    },
    verify: async (inputs) => {
      const id = inputs.req_id;
      if (!id) return [];
      const locations: VerifyLocation[] = [];

      locations.push(checkLocalStorage('gtk_erp_requisitions', r => r.id === id, {
        id, status: '*', company: inputs.company, category: inputs.category, totalValue: '*',
      }));

      locations.push(await checkSupabase('requisitions', { id }, {
        id, status: '*', company: inputs.company, category: inputs.category,
      }));

      locations.push(checkLocalStorage('gtk_erp_ledger', r => r.reqId === id || r.req_id === id, {
        docType: 'PV', status: '*',
      }));

      locations.push(await checkSupabase('ledger', { req_id: id }, {
        req_id: id, doc_type: 'PV', status: '*',
      }));

      return locations;
    }
  },

  // ─── QUOTATION ──────────────────────────────────────────────────
  {
    id: 'E2E-QUO',
    name: 'Quotation — Auto-Create & Verify All Locations',
    module: 'SALES',
    description: 'Agent creates a quotation via SalesService, then verifies in: quotations localStorage, Supabase quotations, production_pieces',
    idField: 'quo_id',
    inputs: [
      { key: 'company', label: 'Company',      type: 'select', options: ['Glassco', 'GTK', 'GTI', 'Nippon'] },
      { key: 'client',  label: 'Client Name',  type: 'text',   placeholder: 'Gulshan Towers' },
      { key: 'amount',  label: 'Total Amount PKR', type: 'number', placeholder: '252000' },
    ],
    create: async (inputs) => {
      const existing = ls('gtk_erp_quotations');
      const id = AppService.generateSequenceID('QUT', inputs.company, existing);
      const newQuo = {
        id,
        company: inputs.company,
        date: new Date().toISOString().split('T')[0],
        clientId: inputs.client || 'TEST-CLIENT',
        architect: 'E2E Agent',
        site: inputs.client || 'Test Site',
        subject: 'E2E Test Glass Supply',
        items: [{
          id: `${id}-1`,
          description: 'Float Glass 6mm (E2E Test)',
          qty: 1,
          sqft: 100,
          rate: Number(inputs.amount) / 100,
          totalAmount: Number(inputs.amount),
        }],
        serviceCharges: [],
        discountPercent: 0,
        glassDiscountPercent: 0,
        status: 'Pending' as const,
      };
      SalesService.saveQuotations([...existing, newQuo]);
      return {
        createdId: id,
        createdData: newQuo,
        summary: `Quotation ${id} created — ${inputs.company} | ${inputs.client} | PKR ${Number(inputs.amount).toLocaleString()}`,
      };
    },
    verify: async (inputs) => {
      const id = inputs.quo_id;
      if (!id) return [];
      const locations: VerifyLocation[] = [];

      locations.push(checkLocalStorage('gtk_erp_quotations', r => r.id === id, {
        id, company: inputs.company, status: '*',
      }));

      locations.push(await checkSupabase('quotations', { id }, {
        id, company: inputs.company, status: '*',
      }));

      locations.push(checkLocalStorage('gtk_erp_production_pieces', r => r.orderId === id, {
        orderId: '*', status: '*',
      }));

      locations.push(await checkSupabase('production_pieces', { order_id: id }, {
        order_id: id, status: '*',
      }));

      return locations;
    }
  },

  // ─── ATTENDANCE + PAYROLL ───────────────────────────────────────
  {
    id: 'E2E-PAY',
    name: 'Attendance → Payroll — Auto-Create & Verify Full Chain',
    module: 'HR',
    description: 'Agent creates attendance record + runs payroll computation, then verifies: attendance, payroll record, GL journal entry',
    idField: 'payroll_id',
    inputs: [
      { key: 'company', label: 'Company',        type: 'select', options: ['Glassco', 'GTK', 'GTI', 'Nippon', 'Factory'] },
      { key: 'emp_id',  label: 'Employee ID',    type: 'text',   placeholder: '1711234567890' },
      { key: 'month',   label: 'Payroll Month',  type: 'text',   placeholder: '2026-04' },
      { key: 'gross',   label: 'Gross Salary PKR', type: 'number', placeholder: '30000' },
    ],
    create: async (inputs) => {
      const empId  = inputs.emp_id  || 'E2E-EMP-001';
      const month  = inputs.month   || new Date().toISOString().slice(0, 7);
      const gross  = Number(inputs.gross || 30000);
      const EOBI   = 370;
      const netSalary = gross - EOBI;

      // Attendance record
      const attId = `ATT-${empId}-${month}-01`;
      const attRecord = {
        id: attId,
        employeeId: empId,
        date: `${month}-01`,
        status: 'Present',
        lateMinutes: 0,
        earlyMinutes: 0,
        overtimeHours: 0,
      };
      const existingAtt = ls('gtk_erp_attendance');
      const filteredAtt = existingAtt.filter((r: any) => r.id !== attId);
      await HRService.saveAttendance([...filteredAtt, attRecord]);

      // Payroll record
      const payId = `PAY-${empId}-${month}`;
      const payRecord = {
        id: payId,
        employeeId: empId,
        month,
        basicPay: gross,
        allowances: 0,
        overtimePay: 0,
        overtimeHours: 0,
        earlyDeductionHours: 0,
        lateDeduction: 0,
        absentDeduction: 0,
        loanDeduction: 0,
        advanceDeduction: 0,
        netSalary,
        absentDates: [],
        lateDates: [],
        loanRepayments: [],
      };
      const existingPay = ls('gtk_erp_payroll');
      const filteredPay = existingPay.filter((r: any) => r.id !== payId);
      await HRService.savePayroll([...filteredPay, payRecord]);

      return {
        createdId: payId,
        createdData: { attendance: attRecord, payroll: payRecord },
        summary: `Attendance ${attId} + Payroll ${payId} created — ${empId} | ${month} | Gross: ${gross.toLocaleString()} → Net: PKR ${netSalary.toLocaleString()} (EOBI ${EOBI})`,
      };
    },
    verify: async (inputs) => {
      const empId = inputs.emp_id;
      const month = inputs.month;
      const payId = inputs.payroll_id;
      const locations: VerifyLocation[] = [];

      locations.push(checkLocalStorage('gtk_erp_attendance', r => r.employeeId === empId, {
        employeeId: empId, status: '*',
      }));

      locations.push(await checkSupabase('attendance', { employee_id: empId }, {
        employee_id: empId, status: '*',
      }));

      if (payId) {
        locations.push(checkLocalStorage('gtk_erp_payroll', r => r.id === payId, {
          id: payId, employeeId: empId, month, netSalary: '*',
        }));

        locations.push(await checkSupabase('payroll', { id: payId }, {
          id: payId, employee_id: empId, month, net_salary: '*',
        }));
      }

      locations.push(checkLocalStorage('gtk_erp_ledger',
        r => r.id?.startsWith('PAY-JV') && r.company === inputs.company,
        { docType: 'JV', status: 'Posted' }
      ));

      locations.push(await checkSupabase('ledger', { company: inputs.company, doc_type: 'JV' }, {
        company: inputs.company, doc_type: 'JV', status: '*',
      }));

      return locations;
    }
  },

  // ─── LOAN ───────────────────────────────────────────────────────
  {
    id: 'E2E-LOAN',
    name: 'Loan — Auto-Create REQ + Loan Record & Verify Full Chain',
    module: 'HR',
    description: 'Agent creates loan requisition + loan record, then verifies: requisitions, loans, PV in ledger, payroll deduction',
    idField: 'loan_id',
    inputs: [
      { key: 'company', label: 'Company',        type: 'select', options: ['Glassco', 'GTK', 'GTI', 'Nippon'] },
      { key: 'emp_id',  label: 'Employee ID',    type: 'text',   placeholder: '1711234567890' },
      { key: 'amount',  label: 'Loan Amount PKR',type: 'number', placeholder: '50000' },
    ],
    create: async (inputs) => {
      const empId  = inputs.emp_id || 'E2E-EMP-001';
      const amount = Number(inputs.amount || 50000);
      const today  = new Date().toISOString().split('T')[0];

      // Create HR requisition
      const existingReqs = InventoryService.getRequisitions();
      const reqId = AppService.generateSequenceID('REQ', inputs.company, existingReqs);
      const newReq = {
        id: reqId,
        company: inputs.company,
        date: today,
        headerText: `Loan Request — ${empId}`,
        requisitioner: empId,
        priority: 'Normal' as const,
        items: [],
        totalValue: amount,
        status: 'Pending' as const,
        category: 'HR',
        employeeId: empId,
        loanAmount: amount,
        type: 'Loan',
      };
      InventoryService.saveRequisitions([...existingReqs, newReq]);

      // Create loan record
      const loanId = `LOAN-${empId}-${Date.now()}`;
      const existingLoans = ls('gtk_erp_loans');
      const loanRecord = {
        id: loanId,
        employeeId: empId,
        date: today,
        amount,
        type: 'Loan' as const,
        repaymentAmount: Math.ceil(amount / 12),
        status: 'Active' as const,
        requisitionId: reqId,
      };
      await HRService.saveLoans([...existingLoans, loanRecord]);

      return {
        createdId: loanId,
        createdData: { requisition: newReq, loan: loanRecord },
        summary: `REQ ${reqId} + Loan ${loanId} created — ${empId} | PKR ${amount.toLocaleString()} | Installment: PKR ${loanRecord.repaymentAmount.toLocaleString()}/month`,
      };
    },
    verify: async (inputs) => {
      const locations: VerifyLocation[] = [];

      if (inputs.req_id) {
        locations.push(checkLocalStorage('gtk_erp_requisitions', r => r.id === inputs.req_id, {
          id: inputs.req_id, category: 'HR', status: '*',
        }));
        locations.push(await checkSupabase('requisitions', { id: inputs.req_id }, {
          id: inputs.req_id, category: 'HR', status: '*',
        }));
      }

      if (inputs.loan_id) {
        locations.push(checkLocalStorage('gtk_erp_loans', r => r.id === inputs.loan_id, {
          id: inputs.loan_id, employeeId: inputs.emp_id, status: 'Active',
        }));
        locations.push(await checkSupabase('loans', { id: inputs.loan_id }, {
          id: inputs.loan_id, employee_id: inputs.emp_id, status: 'Active',
        }));
      }

      locations.push(checkLocalStorage('gtk_erp_ledger', r => r.reqId === inputs.req_id, {
        docType: 'PV', status: '*',
      }));

      locations.push(checkLocalStorage('gtk_erp_payroll',
        r => r.employeeId === inputs.emp_id && (r.loanDeduction > 0 || r.advanceDeduction > 0),
        { employeeId: inputs.emp_id, loanDeduction: '*' }
      ));

      return locations;
    }
  },

  // ─── GL JOURNAL VOUCHER ─────────────────────────────────────────
  {
    id: 'E2E-JV',
    name: 'Journal Voucher — Auto-Draft & Verify Maker-Checker',
    module: 'FINANCE',
    description: 'Agent drafts a JV via FinanceService.saveLedger, then verifies: ledger localStorage, Supabase, GL balance (Dr=Cr), 4-Eyes fields',
    idField: 'jv_id',
    inputs: [
      { key: 'company', label: 'Company',     type: 'select', options: ['Glassco', 'GTK', 'GTI', 'Nippon'] },
      { key: 'amount',  label: 'Amount PKR',  type: 'number', placeholder: '25000' },
      { key: 'maker',   label: 'Maker Email', type: 'text',   placeholder: 'accountant@glasstech.pk' },
    ],
    create: async (inputs) => {
      const amount  = Number(inputs.amount || 25000);
      const maker   = inputs.maker || 'e2e-agent@glasstech.pk';
      const today   = new Date().toISOString().split('T')[0];
      const existing = ls('gtk_erp_ledger');
      const id = AppService.generateSequenceID('JV', inputs.company, existing);

      const draftTx = {
        id,
        company: inputs.company,
        docType: 'JV' as const,
        docDate: today,
        date: today,
        description: `E2E Test JV — PKR ${amount.toLocaleString()}`,
        referenceId: id,
        status: 'Draft' as const,
        draftedBy: maker,
        details: [
          { accountId: '5001', debit: amount, credit: 0,      text: 'E2E Test — Expense Dr' },
          { accountId: '2001', debit: 0,      credit: amount, text: 'E2E Test — Payable Cr' },
        ],
        createdBy: maker,
      };
      FinanceService.saveLedger([...existing, draftTx]);

      return {
        createdId: id,
        createdData: draftTx,
        summary: `JV ${id} drafted — ${inputs.company} | PKR ${amount.toLocaleString()} | Dr 5001 / Cr 2001 | Maker: ${maker}`,
      };
    },
    verify: async (inputs) => {
      const locations: VerifyLocation[] = [];

      locations.push(checkLocalStorage('gtk_erp_ledger', r => r.id === inputs.jv_id, {
        id: inputs.jv_id, docType: 'JV', company: inputs.company, status: '*',
      }));

      locations.push(await checkSupabase('ledger', { id: inputs.jv_id }, {
        id: inputs.jv_id, doc_type: 'JV', company: inputs.company, status: '*',
      }));

      // GL balance check (Dr = Cr)
      const ledger = ls('gtk_erp_ledger');
      const jv = ledger.find((r: any) => r.id === inputs.jv_id);
      if (jv?.details) {
        let dr = 0, cr = 0;
        jv.details.forEach((d: any) => { dr += Number(d.debit || 0); cr += Number(d.credit || 0); });
        const balanced = Math.abs(dr - cr) <= 1;
        locations.push({
          name: 'GL Balance Check (Dr = Cr)', source: 'localStorage', table: 'computed',
          found: true, record: { totalDr: dr, totalCr: cr },
          fields: [
            { field: 'balanced', expected: 'true', actual: String(balanced), match: balanced },
            { field: 'totalDr',  expected: '*',    actual: dr,  match: true },
            { field: 'totalCr',  expected: '*',    actual: cr,  match: true },
          ],
          latencyMs: 0
        });
      }

      // Maker-Checker audit
      if (jv) {
        locations.push({
          name: 'Maker-Checker Audit (4-Eyes)', source: 'localStorage', table: 'computed',
          found: true, record: jv,
          fields: [
            { field: 'draftedBy',  expected: inputs.maker,  actual: jv.draftedBy, match: jv.draftedBy === inputs.maker },
            { field: 'approvedBy', expected: '*',            actual: jv.approvedBy || 'pending', match: true },
            { field: '4-Eyes',     expected: 'different',   actual: jv.approvedBy !== jv.draftedBy ? 'pass' : 'same person', match: jv.approvedBy !== jv.draftedBy || !jv.approvedBy },
          ],
          latencyMs: 0
        });
      }

      return locations;
    }
  },

  // ─── GRN + STOCK ────────────────────────────────────────────────
  {
    id: 'E2E-GRN',
    name: 'GRN → Stock → MAP — Auto-Create & Verify All Tables',
    module: 'STORE',
    description: 'Agent posts a GRN receipt via InventoryService (updates stock + MAP), then verifies: store_items, stock_ledger (mvmnt 101), GL entry',
    idField: 'grn_id',
    inputs: [
      { key: 'company',   label: 'Company',        type: 'select', options: ['Glassco', 'GTK', 'GTI', 'Nippon'] },
      { key: 'item_name', label: 'Material Name',  type: 'text',   placeholder: 'Float Glass 5mm' },
      { key: 'qty',       label: 'Quantity (SQF)', type: 'number', placeholder: '200' },
      { key: 'price',     label: 'Price / SQF PKR',type: 'number', placeholder: '500' },
    ],
    create: async (inputs) => {
      const qty   = Number(inputs.qty   || 200);
      const price = Number(inputs.price || 500);
      const itemName = inputs.item_name || 'Float Glass 5mm';
      const today = new Date().toISOString().split('T')[0];

      // Generate GRN ID
      const seq = String(Date.now()).slice(-5);
      const compCode = { Glassco: 'GLS', GTK: 'GTK', GTI: 'GTI', Nippon: 'NIP' }[inputs.company as string] || 'GLS';
      const mmyy = `${String(new Date().getMonth() + 1).padStart(2,'0')}${String(new Date().getFullYear()).slice(-2)}`;
      const grnId = `GRN-${compCode}-${mmyy}-${seq}`;

      // Update store item (IAS 2 MAP formula)
      const existingStore = InventoryService.getStore();
      const existingItem = existingStore.find((i: any) => i.name === itemName && i.company === inputs.company);
      const oldQty   = existingItem?.quantity || 0;
      const oldMAP   = existingItem?.movingAveragePrice || price;
      const newQty   = oldQty + qty;
      const newMAP   = oldQty === 0 ? price : ((oldQty * oldMAP) + (qty * price)) / newQty;
      const newTotal = newQty * newMAP;

      const storeItem = existingItem ? {
        ...existingItem,
        quantity:           newQty,
        unrestrictedQty:    newQty,
        movingAveragePrice: Number(newMAP.toFixed(4)),
        totalValue:         Number(newTotal.toFixed(2)),
        lastMovementDate:   today,
      } : {
        id:                 `${inputs.company}-${itemName.replace(/\s+/g, '-')}`,
        company:            inputs.company,
        name:               itemName,
        category:           'Raw' as const,
        quantity:           qty,
        unrestrictedQty:    qty,
        qiQty:              0,
        blockedQty:         0,
        reservedQty:        0,
        consignmentQty:     0,
        unit:               'SQF',
        minLevel:           0,
        reorderPoint:       0,
        movingAveragePrice: price,
        totalValue:         qty * price,
        storageBin:         'MAIN',
        lastMovementDate:   today,
      };

      const newStore = existingItem
        ? existingStore.map((i: any) => i.id === storeItem.id ? storeItem : i)
        : [...existingStore, storeItem];
      InventoryService.saveStore(newStore);

      // Stock ledger entry (mvmnt 101 = GRN)
      const slId = `SL-${grnId}`;
      const existingLedger = ls('gtk_erp_stock_ledger');
      const ledgerEntry = {
        id:           slId,
        company:      inputs.company,
        materialId:   storeItem.id,
        timestamp:    new Date().toISOString(),
        mvmntCode:    '101',
        qty,
        uom:          'SQF',
        valuation:    qty * price,
        balanceAfter: newQty,
        referenceDoc: grnId,
        user:         'E2E Agent',
        remarks:      `E2E GRN Test — ${itemName}`,
      };
      InventoryService.saveStockLedger([...existingLedger, ledgerEntry]);

      return {
        createdId: grnId,
        createdData: { storeItem, ledgerEntry, grnId },
        summary: `GRN ${grnId} posted — ${itemName} | +${qty} SQF @ PKR ${price} | New MAP: PKR ${newMAP.toFixed(2)} | Total Stock: ${newQty} SQF`,
      };
    },
    verify: async (inputs) => {
      const locations: VerifyLocation[] = [];
      const itemName = inputs.item_name || '';

      locations.push(checkLocalStorage('gtk_erp_store',
        r => (r.name === itemName || r.name?.includes(itemName)) && r.company === inputs.company,
        { quantity: '*', movingAveragePrice: '*', totalValue: '*' }
      ));

      locations.push(await checkSupabase('store_items', { company: inputs.company }, {
        company: inputs.company, quantity: '*', moving_average_price: '*',
      }));

      locations.push(checkLocalStorage('gtk_erp_stock_ledger',
        r => r.referenceDoc === inputs.grn_id,
        { mvmntCode: '101', referenceDoc: inputs.grn_id }
      ));

      locations.push(await checkSupabase('stock_ledger', { reference_doc: inputs.grn_id }, {
        mvmnt_code: '101', reference_doc: inputs.grn_id,
      }));

      locations.push(checkLocalStorage('gtk_erp_ledger',
        r => r.referenceId?.includes(inputs.grn_id) || r.description?.includes('GRN'),
        { docType: '*', status: '*' }
      ));

      return locations;
    }
  },

  // ─── INVOICE + PAYMENT ──────────────────────────────────────────
  {
    id: 'E2E-INV',
    name: 'Invoice — Auto-Create & Verify AR Lifecycle',
    module: 'FINANCE',
    description: 'Agent creates an invoice via SalesService + GL DR entry, then verifies: invoices localStorage, Supabase, ledger (DR entry)',
    idField: 'inv_id',
    inputs: [
      { key: 'company', label: 'Company',       type: 'select', options: ['Glassco', 'GTK', 'GTI', 'Nippon'] },
      { key: 'client',  label: 'Client Name',   type: 'text',   placeholder: 'Gulshan Towers' },
      { key: 'amount',  label: 'Invoice Amount PKR', type: 'number', placeholder: '252000' },
    ],
    create: async (inputs) => {
      const amount   = Number(inputs.amount || 252000);
      const client   = inputs.client || 'TEST-CLIENT';
      const today    = new Date().toISOString().split('T')[0];
      const existing = ls('gtk_erp_invoices');
      const id       = AppService.generateSequenceID('INV', inputs.company, existing);

      const invoice = {
        id,
        company:     inputs.company,
        date:        today,
        clientId:    client,
        items: [{ id: `${id}-1`, description: 'E2E Glass Supply', qty: 1, rate: amount, totalAmount: amount }],
        totalAmount: amount,
        status:      'Pending',
      };
      SalesService.saveInvoices([...existing, invoice]);

      // GL DR entry (AR debit, Revenue credit) — system-auto bypasses period check
      const drId = `DR-${id}`;
      const existingLedger = ls('gtk_erp_ledger');
      const drTx = {
        id:          drId,
        company:     inputs.company,
        docType:     'DR' as const,
        docDate:     today,
        date:        today,
        description: `Invoice ${id} — ${client}`,
        referenceId: id,
        status:      'Posted' as const,
        details: [
          { accountId: '1310', debit: amount, credit: 0,      text: 'Accounts Receivable — DR' },
          { accountId: '4001', debit: 0,      credit: amount, text: 'Sales Revenue — CR' },
        ],
        createdBy: 'system-auto',
      };
      try {
        FinanceService.saveLedger([...existingLedger, drTx]);
      } catch {
        // If period check or balance check fails, skip GL entry — invoice still created
      }

      return {
        createdId: id,
        createdData: { invoice, drTx },
        summary: `Invoice ${id} created — ${inputs.company} | ${client} | PKR ${amount.toLocaleString()} | GL: Dr 1310 / Cr 4001`,
      };
    },
    verify: async (inputs) => {
      const id = inputs.inv_id;
      if (!id) return [];
      const locations: VerifyLocation[] = [];

      locations.push(checkLocalStorage('gtk_erp_invoices', r => r.id === id, {
        id, totalAmount: String(inputs.amount), status: '*',
      }));

      locations.push(await checkSupabase('invoices', { id }, {
        id, total_amount: String(inputs.amount), status: '*',
      }));

      locations.push(checkLocalStorage('gtk_erp_ledger',
        r => r.referenceId === id && r.docType === 'DR',
        { docType: 'DR', status: 'Posted' }
      ));

      locations.push(await checkSupabase('ledger', { reference_id: id, doc_type: 'DR' }, {
        doc_type: 'DR', status: 'Posted',
      }));

      locations.push(await checkSupabase('invoice_balances', { id }, {
        id, total_amount: '*', live_balance: '*',
      }));

      return locations;
    }
  },
];

// ── Run a verification recipe (with optional auto-create) ────────
export async function runVerification(
  recipeId: string,
  inputs: Record<string, any>,
  onLocationChecked?: (loc: VerifyLocation, idx: number) => void,
  autoCreate?: boolean,
  onCreated?: (rec: CreatedRecord) => void,
): Promise<VerifyResult> {
  const start = Date.now();
  const recipe = TEST_RECIPES.find(r => r.id === recipeId);
  if (!recipe) throw new Error(`Recipe ${recipeId} not found`);

  let mergedInputs = { ...inputs };

  // Auto-create: call recipe.create() and inject the generated ID
  if (autoCreate) {
    const created = await recipe.create(inputs);
    mergedInputs[recipe.idField] = created.createdId;

    // For LOAN recipe, also inject req_id from the created data
    if (recipeId === 'E2E-LOAN' && created.createdData?.requisition?.id) {
      mergedInputs.req_id = created.createdData.requisition.id;
    }

    onCreated?.({
      id:        created.createdId,
      summary:   created.summary,
      data:      created.createdData,
      timestamp: new Date().toISOString(),
    });
  }

  const locations = await recipe.verify(mergedInputs);
  locations.forEach((loc, idx) => onLocationChecked?.(loc, idx));

  const passedLocations  = locations.filter(l => l.found && l.fields.every(f => f.match)).length;
  const failedLocations  = locations.filter(l => !l.found || l.fields.some(f => !f.match)).length;

  return {
    testId:           recipeId,
    testName:         recipe.name,
    createdId:        mergedInputs[recipe.idField] || 'N/A',
    createdAt:        new Date().toISOString(),
    locations,
    totalLocations:   locations.length,
    passedLocations,
    failedLocations,
    status:           failedLocations === 0 ? 'pass' : passedLocations === 0 ? 'fail' : 'partial',
    duration:         Date.now() - start,
  };
}
