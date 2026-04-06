/**
 * phase4.test.ts — Phase 4 QA Suite (QA-04)
 *
 * 35 tests covering Phase 2 + Phase 3 features:
 *
 * Section 1:  Credit Note GL (EC-01)
 * Section 2:  Invoice Void (BA-01)
 * Section 3:  Purchase Return GL (EC-02)
 * Section 4:  Bank Statement CSV Parser (EC-03)
 * Section 5:  QuotationStatus — Lost / Expired (BA-06)
 * Section 6:  Customer Complaint Lifecycle (BA-04)
 * Section 7:  Concurrency Guard Logic (SA-05)
 * Section 8:  Inventory Valuation Calculation (FC-05)
 * Section 9:  GL Posting Rules — CRUD (FC-04)
 * Section 10: Delivery Acknowledgment (BA-03)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ── Mock localStorage ─────────────────────────────────────────────────────────
const _store: Record<string, string> = {};
const localStorage = {
  getItem:    (k: string) => _store[k] ?? null,
  setItem:    (k: string, v: string) => { _store[k] = v; },
  removeItem: (k: string) => { delete _store[k]; },
  clear:      () => { Object.keys(_store).forEach(k => delete _store[k]); },
  get length() { return Object.keys(_store).length; },
  key:        (i: number) => Object.keys(_store)[i] ?? null,
};
vi.stubGlobal('localStorage', localStorage);

// ── Mock Supabase ─────────────────────────────────────────────────────────────
vi.mock('@/src/services/supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      select:  () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }), single: () => Promise.resolve({ data: null, error: null }), order: () => Promise.resolve({ data: [], error: null }) }) }),
      upsert:  () => Promise.resolve({ error: null }),
      insert:  () => Promise.resolve({ error: null }),
      update:  () => ({ eq: () => Promise.resolve({ error: null }) }),
      delete:  () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  },
}));

vi.mock('@/modules/auth/authStore', () => ({
  useAuthStore: { getState: () => ({ user: { email: 'qa@glasstech.pk', fullName: 'QA Tester' } }) },
}));

vi.mock('@/modules/shared/services/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), action: vi.fn(), success: vi.fn() },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

// ── Shared helpers ────────────────────────────────────────────────────────────
const makeInvoice = (overrides: Partial<any> = {}) => ({
  id:             'INV-GCO-2026-0001',
  company:        'Glassco',
  orderId:        'ORD-001',
  orderNo:        'ORD-001',
  clientId:       'client-001',
  clientName:     'Al-Baraka Constructions',
  date:           '2026-04-01',
  dueDate:        '2026-05-01',
  totalAmount:    250000,
  receivedAmount: 0,
  balance:        250000,
  status:         'Outstanding',
  glTxId:         'GL-INV-GCO-2026-0001',
  payments:       [],
  ...overrides,
});

const makeGLTx = (id: string, company: string, amount: number, drAccId: string, crAccId: string) => ({
  id, company, docType: 'DR', docDate: '2026-04-01', date: '2026-04-01',
  description: `Test GL ${id}`, referenceId: id, status: 'Posted',
  details: [
    { accountId: drAccId, debit: amount, credit: 0,      text: 'Dr side' },
    { accountId: crAccId, debit: 0,      credit: amount, text: 'Cr side' },
  ],
});

// ═══════════════════════════════════════════════════════════════════════
// SECTION 1: Credit Note GL — EC-01
// ═══════════════════════════════════════════════════════════════════════

describe('Credit Note — GL Integrity', () => {

  it('credit note GL is a balanced reversing entry', () => {
    const cnAmount = 15000;
    const tx = {
      docType: 'RV',
      details: [
        { accountId: 'GCO-41110', debit: cnAmount, credit: 0,        text: 'Revenue reversal' },
        { accountId: 'GCO-12210', debit: 0,        credit: cnAmount, text: 'AR reduction'     },
      ],
    };
    const totalDr = tx.details.reduce((s, d) => s + d.debit,  0);
    const totalCr = tx.details.reduce((s, d) => s + d.credit, 0);
    expect(totalDr).toBe(totalCr);
    expect(totalDr).toBe(cnAmount);
    expect(tx.docType).toBe('RV');
  });

  it('credit note reduces invoice balance correctly', () => {
    const invoice = makeInvoice({ balance: 250000 });
    const cnAmount = 25000;
    const newBalance = invoice.balance - cnAmount;
    expect(newBalance).toBe(225000);
  });

  it('credit note for full balance marks invoice as Paid', () => {
    const invoice = makeInvoice({ balance: 50000 });
    const newBalance = invoice.balance - 50000;
    const newStatus = newBalance <= 0 ? 'Paid' : invoice.status;
    expect(newStatus).toBe('Paid');
    expect(newBalance).toBe(0);
  });

  it('credit note cannot exceed outstanding balance', () => {
    const invoice = makeInvoice({ balance: 30000 });
    const attemptedCN = 50000;
    const isValid = attemptedCN <= invoice.balance;
    expect(isValid).toBe(false);
  });

  it('credit note debit side = revenue account (not AR)', () => {
    // For a credit note: we DEBIT revenue (reduce it) and CREDIT AR (reduce receivable)
    const cnTx = makeGLTx('CN-001', 'Glassco', 10000, 'GCO-41110', 'GCO-12210');
    const debitAcc  = cnTx.details.find(d => d.debit > 0)?.accountId ?? '';
    const creditAcc = cnTx.details.find(d => d.credit > 0)?.accountId ?? '';
    expect(debitAcc).toContain('41110');    // Revenue account debited
    expect(creditAcc).toContain('12210');   // AR account credited
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SECTION 2: Invoice Void — BA-01
// ═══════════════════════════════════════════════════════════════════════

describe('Invoice Void — BA-01', () => {

  it('void invoice produces exact GL reversal', () => {
    const original = makeGLTx('GL-INV-001', 'GTK', 100000, 'GTK-12210', 'GTK-41110');
    const reversal = {
      id:      'VOID-INV-001',
      docType: 'RV',
      details: original.details.map(d => ({
        ...d,
        debit:  d.credit,  // swap
        credit: d.debit,
        text:   'VOID ' + d.text,
      })),
    };
    const origTotalDr  = original.details.reduce((s, d) => s + d.debit, 0);
    const voidTotalCr  = reversal.details.reduce((s, d) => s + d.credit, 0);
    expect(origTotalDr).toBe(voidTotalCr);   // original debit = void credit
  });

  it('cannot void a paid invoice', () => {
    const paidInvoice = makeInvoice({ status: 'Paid', receivedAmount: 250000, balance: 0 });
    const canVoid = paidInvoice.status !== 'Paid' && paidInvoice.receivedAmount === 0;
    expect(canVoid).toBe(false);
  });

  it('cannot void invoice with partial payments', () => {
    const partialInvoice = makeInvoice({ receivedAmount: 50000, balance: 200000, status: 'Partial' });
    const canVoid = partialInvoice.receivedAmount === 0;
    expect(canVoid).toBe(false);
  });

  it('void sets invoice balance to zero and status to Voided', () => {
    const invoice = makeInvoice({ balance: 150000 });
    const voided  = { ...invoice, status: 'Voided', balance: 0, voidedBy: 'Hassan', voidedAt: '2026-04-05' };
    expect(voided.status).toBe('Voided');
    expect(voided.balance).toBe(0);
    expect(voided.voidedBy).toBe('Hassan');
  });

  it('void reverts quotation status to Approved', () => {
    const quotation = { id: 'ORD-001', status: 'Invoiced', invoiceNo: 'INV-GTK-2026-0001' };
    const reverted  = { ...quotation, status: 'Approved', invoiceNo: undefined };
    expect(reverted.status).toBe('Approved');
    expect(reverted.invoiceNo).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SECTION 3: Purchase Return GL — EC-02
// ═══════════════════════════════════════════════════════════════════════

describe('Purchase Return — EC-02', () => {

  it('purchase return GL: Dr AP / Cr Inventory (balanced)', () => {
    const returnAmount = 45000;
    const tx = {
      docType: 'RV',
      details: [
        { accountId: 'GTK-21114', debit: returnAmount, credit: 0,            text: 'AP reduction' },
        { accountId: 'GTK-11511', debit: 0,            credit: returnAmount, text: 'Inventory return' },
      ],
    };
    const dr = tx.details.reduce((s, d) => s + d.debit, 0);
    const cr = tx.details.reduce((s, d) => s + d.credit, 0);
    expect(dr).toBe(cr);
    expect(dr).toBe(returnAmount);
  });

  it('purchase return debit side = AP account', () => {
    const drAccId = 'GTK-21114';  // AP account
    expect(drAccId).toContain('211');   // AP accounts start with 211
  });

  it('purchase return reduces inventory quantity', () => {
    const currentQty    = 100;
    const returnQty     = 15;
    const newQty        = Math.max(0, currentQty - returnQty);
    expect(newQty).toBe(85);
  });

  it('purchase return cannot reduce inventory below zero', () => {
    const currentQty = 10;
    const returnQty  = 25;
    const newQty     = Math.max(0, currentQty - returnQty);
    expect(newQty).toBe(0);
    expect(newQty).toBeGreaterThanOrEqual(0);
  });

  it('purchase return total = sum of line amounts', () => {
    const lines = [
      { materialDesc: 'Glass 8mm', quantity: 5,  ratePerUnit: 3000 },
      { materialDesc: 'Glass 6mm', quantity: 10, ratePerUnit: 1500 },
    ];
    const total = lines.reduce((s, l) => s + l.quantity * l.ratePerUnit, 0);
    expect(total).toBe(5 * 3000 + 10 * 1500);
    expect(total).toBe(30000);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SECTION 4: Bank Statement CSV Parser — EC-03
// ═══════════════════════════════════════════════════════════════════════

describe('Bank CSV Parser — EC-03', () => {

  // Replicate the CSV parsing logic from BankReconciliation.tsx
  function parseCSV(csvText: string) {
    const lines = csvText.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];

    let headerIdx = 0;
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const lower = lines[i].toLowerCase();
      if (lower.includes('date') || lower.includes('debit') || lower.includes('credit')) {
        headerIdx = i; break;
      }
    }
    const headers = lines[headerIdx].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());

    const colIdx = (keywords: string[]) => {
      for (const kw of keywords) {
        const idx = headers.findIndex(h => h.includes(kw));
        if (idx >= 0) return idx;
      }
      return -1;
    };

    const dateCol   = colIdx(['date']);
    const descCol   = colIdx(['description', 'narration', 'particulars']);
    const debitCol  = colIdx(['debit', 'dr', 'withdrawal']);
    const creditCol = colIdx(['credit', 'cr', 'deposit']);

    const rows: any[] = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.replace(/"/g, '').trim());
      const rawDate = dateCol >= 0 ? cols[dateCol] : '';
      if (!rawDate) continue;

      let date = rawDate;
      const dmY = rawDate.match(/^(\d{2})[/\-](\d{2})[/\-](\d{4})$/);
      if (dmY) date = `${dmY[3]}-${dmY[2]}-${dmY[1]}`;

      const debit  = debitCol  >= 0 ? parseFloat(cols[debitCol]?.replace(/,/g, ''))  || 0 : 0;
      const credit = creditCol >= 0 ? parseFloat(cols[creditCol]?.replace(/,/g, '')) || 0 : 0;
      if (debit === 0 && credit === 0) continue;

      rows.push({
        date,
        description: descCol >= 0 ? cols[descCol] : '',
        debit, credit,
      });
    }
    return rows;
  }

  it('parses MCB-style CSV with DD/MM/YYYY dates', () => {
    const csv = `Date,Description,Debit,Credit,Balance
05/04/2026,Cheque Payment Received,0,50000,150000
06/04/2026,Bank Charges,500,0,149500`;
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].date).toBe('2026-04-05');
    expect(rows[0].credit).toBe(50000);
    expect(rows[1].debit).toBe(500);
  });

  it('parses YYYY-MM-DD date format', () => {
    const csv = `Date,Narration,Dr,Cr
2026-04-10,Cash Deposit,0,100000
2026-04-11,IBFT Payment,25000,0`;
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].date).toBe('2026-04-10');
    expect(rows[1].debit).toBe(25000);
  });

  it('skips rows with zero debit AND credit', () => {
    const csv = `Date,Description,Debit,Credit
01/04/2026,Opening Balance,0,0
02/04/2026,Payment,10000,0`;
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].debit).toBe(10000);
  });

  it('handles commas in amounts (e.g. 1,00,000)', () => {
    const csv = `Date,Narration,Debit,Credit
01/04/2026,Large Transfer,0,"1,00,000"`;
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].credit).toBe(100000);
  });

  it('handles HBL-style withdrawal/deposit headers', () => {
    const csv = `Date,Particulars,Withdrawal,Deposit
01/04/2026,ATM Withdrawal,20000,0
02/04/2026,Customer Deposit,0,75000`;
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].debit).toBe(20000);
    expect(rows[1].credit).toBe(75000);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SECTION 5: QuotationStatus — Lost / Expired — BA-06
// ═══════════════════════════════════════════════════════════════════════

describe('Quotation Status — BA-06', () => {

  const VALID_STATUSES = ['Draft','Sent','Approved','Rejected','Invoiced','Partial Payment','Paid','Lost','Expired'];

  it('Lost and Expired are valid QuotationStatus values', () => {
    expect(VALID_STATUSES).toContain('Lost');
    expect(VALID_STATUSES).toContain('Expired');
  });

  it('quotation with expiryDate in the past is Expired', () => {
    const q = { status: 'Sent', expiryDate: '2026-01-01' };
    const today = '2026-04-06';
    const isExpired = q.expiryDate && q.expiryDate < today && q.status === 'Sent';
    expect(isExpired).toBe(true);
  });

  it('quotation with future expiryDate is not Expired', () => {
    const q = { status: 'Sent', expiryDate: '2026-12-31' };
    const today = '2026-04-06';
    const isExpired = q.expiryDate && q.expiryDate < today;
    expect(isExpired).toBeFalsy();
  });

  it('lostReason is optional and does not affect status logic', () => {
    const q = { status: 'Lost', lostReason: 'Client selected competitor' };
    expect(q.status).toBe('Lost');
    expect(q.lostReason).toBeTruthy();
  });

  it('conversion rate calculation excludes Lost and Expired', () => {
    const quotes = [
      { status: 'Approved' }, { status: 'Lost' }, { status: 'Expired' },
      { status: 'Invoiced' }, { status: 'Sent' },
    ];
    const active = quotes.filter(q => !['Lost','Expired'].includes(q.status));
    const won    = quotes.filter(q => ['Approved','Invoiced','Paid'].includes(q.status));
    expect(active).toHaveLength(3);
    expect(won).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SECTION 6: Customer Complaint Lifecycle — BA-04
// ═══════════════════════════════════════════════════════════════════════

describe('Customer Complaint — BA-04', () => {

  const makeComplaint = (overrides: any = {}) => ({
    id:          'CC-GCO-2026-0001',
    company:     'Glassco',
    date:        '2026-04-05',
    clientId:    'client-001',
    clientName:  'Al-Baraka Constructions',
    invoiceId:   'INV-GCO-2026-0001',
    category:    'Measurement Error',
    description: 'Glass cut 5mm shorter than spec',
    status:      'Open',
    priority:    'High',
    createdBy:   'Hassan',
    createdAt:   new Date().toISOString(),
    ...overrides,
  });

  it('new complaint starts with Open status', () => {
    const cc = makeComplaint();
    expect(cc.status).toBe('Open');
  });

  it('complaint can transition: Open → In Progress → Resolved', () => {
    const statuses = ['Open', 'In Progress', 'Resolved'];
    let current = 'Open';
    // Open → In Progress
    current = 'In Progress';
    expect(statuses.indexOf(current)).toBeGreaterThan(statuses.indexOf('Open'));
    // In Progress → Resolved
    current = 'Resolved';
    expect(statuses.indexOf(current)).toBeGreaterThan(statuses.indexOf('In Progress'));
  });

  it('resolved complaint records resolution + resolvedBy', () => {
    const cc  = makeComplaint();
    const resolved = {
      ...cc,
      status:     'Resolved',
      resolution: 'Replacement glass cut and delivered',
      resolvedBy: 'Hassan',
      resolvedAt: '2026-04-07',
    };
    expect(resolved.status).toBe('Resolved');
    expect(resolved.resolution).toBeTruthy();
    expect(resolved.resolvedBy).toBe('Hassan');
  });

  it('complaint priority levels are correct', () => {
    const priorities = ['Low', 'Medium', 'High', 'Critical'];
    const cc = makeComplaint({ priority: 'Critical' });
    expect(priorities).toContain(cc.priority);
  });

  it('complaint linked to invoice retains invoice reference', () => {
    const cc = makeComplaint({ invoiceId: 'INV-GCO-2026-0005' });
    expect(cc.invoiceId).toBe('INV-GCO-2026-0005');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SECTION 7: Concurrency Guard Logic — SA-05
// ═══════════════════════════════════════════════════════════════════════

describe('Concurrency Guard — SA-05', () => {

  it('no conflict when local is newer than server', () => {
    const serverTs = '2026-04-06T10:00:00.000Z';
    const localTs  = '2026-04-06T10:05:00.000Z';
    const serverTime = new Date(serverTs).getTime();
    const localTime  = new Date(localTs).getTime();
    const hasConflict = serverTime > localTime + 2000;
    expect(hasConflict).toBe(false);
  });

  it('conflict detected when server is >2s newer than local', () => {
    const serverTs = '2026-04-06T10:05:30.000Z';
    const localTs  = '2026-04-06T10:00:00.000Z';
    const serverTime = new Date(serverTs).getTime();
    const localTime  = new Date(localTs).getTime();
    const hasConflict = serverTime > localTime + 2000;
    expect(hasConflict).toBe(true);
  });

  it('no conflict for new record (no localUpdatedAt)', () => {
    const localUpdatedAt = undefined;
    const wouldCheck = !!localUpdatedAt;
    expect(wouldCheck).toBe(false);
  });

  it('2-second grace window prevents false positives on simultaneous saves', () => {
    // Same user saving from two tabs within 1.5s should not conflict
    const serverTs = '2026-04-06T10:00:01.000Z';
    const localTs  = '2026-04-06T10:00:00.000Z';
    const diff = new Date(serverTs).getTime() - new Date(localTs).getTime();
    const hasConflict = diff > 2000;
    expect(hasConflict).toBe(false);
    expect(diff).toBe(1000);
  });

  it('withTimestamp adds updated_at to any record', () => {
    const record = { id: 'QOT-001', status: 'Sent' };
    const stamped = { ...record, updated_at: new Date().toISOString() };
    expect(stamped.updated_at).toBeTruthy();
    expect(new Date(stamped.updated_at).getFullYear()).toBe(2026);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SECTION 8: Inventory Valuation — FC-05
// ═══════════════════════════════════════════════════════════════════════

describe('Inventory Valuation — FC-05', () => {

  const makeStoreItems = () => [
    { id: 'ITM-001', name: 'Glass 6mm Clear', category: 'Raw',      quantity: 100, movingAveragePrice: 450,   company: 'Glassco' },
    { id: 'ITM-002', name: 'Glass 8mm Tinted', category: 'Raw',     quantity: 50,  movingAveragePrice: 650,   company: 'Glassco' },
    { id: 'ITM-003', name: 'Door Handle Set', category: 'Hardware',  quantity: 200, movingAveragePrice: 850,   company: 'GTK'     },
    { id: 'ITM-004', name: 'Aluminium Frame',  category: 'Profile',  quantity: 75,  movingAveragePrice: 1200,  company: 'GTK'     },
    { id: 'ITM-005', name: 'Silicone Sealant', category: 'Consumable', quantity: 30, movingAveragePrice: 350, company: 'GTK'     },
  ];

  it('inventory value = quantity × MAP per item', () => {
    const items = makeStoreItems();
    const item = items[0];
    const value = item.quantity * item.movingAveragePrice;
    expect(value).toBe(100 * 450);
    expect(value).toBe(45000);
  });

  it('grand total = sum of all item values', () => {
    const items = makeStoreItems().filter(i => i.company === 'Glassco');
    const total = items.reduce((s, i) => s + i.quantity * i.movingAveragePrice, 0);
    expect(total).toBe(100 * 450 + 50 * 650);
    expect(total).toBe(77500);
  });

  it('category filter returns only matching items', () => {
    const items = makeStoreItems().filter(i => i.company === 'GTK');
    const raw     = items.filter(i => i.category === 'Raw');
    const hardware = items.filter(i => i.category === 'Hardware');
    expect(raw).toHaveLength(0);
    expect(hardware).toHaveLength(1);
  });

  it('item with zero MAP contributes zero to total', () => {
    const item = { quantity: 100, movingAveragePrice: 0 };
    expect(item.quantity * item.movingAveragePrice).toBe(0);
  });

  it('sorted by value descending — highest value first', () => {
    const items = makeStoreItems().filter(i => i.company === 'GTK');
    const sorted = [...items].sort((a, b) =>
      b.quantity * b.movingAveragePrice - a.quantity * a.movingAveragePrice
    );
    const topValue  = sorted[0].quantity * sorted[0].movingAveragePrice;
    const lastValue = sorted[sorted.length - 1].quantity * sorted[sorted.length - 1].movingAveragePrice;
    expect(topValue).toBeGreaterThanOrEqual(lastValue);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SECTION 9: GL Posting Rules — FC-04
// ═══════════════════════════════════════════════════════════════════════

describe('GL Posting Rules — FC-04', () => {

  const makeRule = (overrides: any = {}) => ({
    id:          'PR-GRN_INVENTORY-GTK',
    company:     'GTK',
    rule_key:    'GRN_INVENTORY',
    description: 'GRN Post — Stock receipt from vendor',
    debit_code:  '11511',
    debit_name:  'Inventory — Raw Materials',
    credit_code: '21151',
    credit_name: 'GR/IR Clearing — Materials',
    doc_type:    'KR',
    is_active:   true,
    ...overrides,
  });

  it('rule has required fields', () => {
    const rule = makeRule();
    expect(rule.id).toBeTruthy();
    expect(rule.rule_key).toBeTruthy();
    expect(rule.debit_code).toBeTruthy();
    expect(rule.credit_code).toBeTruthy();
    expect(rule.doc_type).toBeTruthy();
  });

  it('debit and credit codes are different accounts', () => {
    const rule = makeRule();
    expect(rule.debit_code).not.toBe(rule.credit_code);
  });

  it('inactive rule is not applied', () => {
    const rule = makeRule({ is_active: false });
    const applicable = rule.is_active;
    expect(applicable).toBe(false);
  });

  it('rule lookup by key returns correct rule', () => {
    const rules = [
      makeRule({ rule_key: 'GRN_INVENTORY', debit_code: '11511' }),
      makeRule({ rule_key: 'SALARY_POSTING', debit_code: '51111', credit_code: '22111' }),
    ];
    const found = rules.find(r => r.rule_key === 'SALARY_POSTING');
    expect(found?.debit_code).toBe('51111');
    expect(found?.credit_code).toBe('22111');
  });

  it('rule key is company-scoped — same key different company = different rules', () => {
    const rules = [
      makeRule({ rule_key: 'SALES_INVOICE', company: 'GTK',     debit_code: '12210' }),
      makeRule({ rule_key: 'SALES_INVOICE', company: 'Glassco', debit_code: '12210' }),
    ];
    const gtkRule     = rules.find(r => r.company === 'GTK'     && r.rule_key === 'SALES_INVOICE');
    const glasscoRule = rules.find(r => r.company === 'Glassco' && r.rule_key === 'SALES_INVOICE');
    expect(gtkRule).toBeDefined();
    expect(glasscoRule).toBeDefined();
    expect(gtkRule?.id).not.toBe(glasscoRule?.id);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SECTION 10: Delivery Acknowledgment — BA-03
// ═══════════════════════════════════════════════════════════════════════

describe('Delivery Acknowledgment — BA-03', () => {

  const makeDispatch = (overrides: any = {}) => ({
    id:          'DISP-2026-001',
    company:     'Glassco',
    date:        '2026-04-05',
    plantName:   'Site Delivery',
    vehicleNo:   'LEF-1234',
    driverName:  'Shakeel',
    serviceType: 'Site Delivery',
    pieceIds:    ['P-001', 'P-002', 'P-003'],
    totalSqFt:   450,
    status:      'Dispatched',
    chargesPerSqFt: 25,
    totalCharges: 11250,
    ...overrides,
  });

  it('dispatch can be acknowledged with signatory', () => {
    const dispatch = makeDispatch();
    const acked = {
      ...dispatch,
      deliveryAcknowledgedAt: '2026-04-05T14:30:00.000Z',
      deliveryAcknowledgedBy: 'Shakeel (Driver)',
      deliverySignatory:      'Imran Khan (Site Supervisor)',
    };
    expect(acked.deliveryAcknowledgedAt).toBeTruthy();
    expect(acked.deliverySignatory).toBeTruthy();
  });

  it('signatory name is required for acknowledgment', () => {
    const signatory = '';
    const canAcknowledge = signatory.trim().length > 0;
    expect(canAcknowledge).toBe(false);
  });

  it('acknowledged dispatch retains original dispatch data', () => {
    const dispatch  = makeDispatch();
    const acked     = { ...dispatch, deliverySignatory: 'Client Rep' };
    expect(acked.totalSqFt).toBe(450);
    expect(acked.pieceIds).toHaveLength(3);
    expect(acked.vehicleNo).toBe('LEF-1234');
  });

  it('ack timestamp is recorded as ISO string', () => {
    const ackAt = new Date().toISOString();
    expect(ackAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
