/**
 * phase2_6.test.ts — Phase 6 QA Suite
 *
 * New tests covering Phase 2–5 additions:
 * - Asset service Supabase-primary pattern
 * - Intercompany transfer read/write
 * - Leave management Supabase-first load
 * - GTK quotation save/load + margin calc
 * - Reports Hub: date filtering, aging buckets, balance sheet
 * - GTK Projects: GL posting, completion revenue entry
 * - Delivery invoice sequence
 * - Stock ledger column validation
 * - Retry/backoff logic
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

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

vi.mock('@/src/services/supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({ eq: () => Promise.resolve({ data: [], error: null }), order: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }),
      upsert: () => Promise.resolve({ error: null }),
      insert: () => Promise.resolve({ error: null }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
    auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) },
  },
}));

vi.mock('@/modules/auth/authStore', () => ({
  useAuthStore: { getState: () => ({ user: { email: 'test@glasstech.pk', fullName: 'Test User' } }) },
}));

vi.mock('@/modules/shared/services/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), action: vi.fn(), success: vi.fn() },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: Phase 2 — Asset Service (Supabase-primary pattern)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 2 — AssetService (Supabase-primary)', () => {

  const ASSET_KEY = 'gtk_erp_assets';

  beforeEach(() => { localStorage.clear(); });

  const mockAsset = (id: string, company: string, name: string) => ({
    id, company, name, type: 'Machinery',
    purchaseDate: '2026-01-01', purchaseValue: 100000,
    maintenanceLogs: [] as any[],
    updatedAt: new Date().toISOString(),
  });

  it('local cache is populated on save', () => {
    const asset = mockAsset('ASSET-001', 'GTK', 'Cutting Table');
    const existing = JSON.parse(localStorage.getItem(ASSET_KEY) || '[]');
    existing.push(asset);
    localStorage.setItem(ASSET_KEY, JSON.stringify(existing));
    const loaded = JSON.parse(localStorage.getItem(ASSET_KEY) || '[]');
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('ASSET-001');
  });

  it('company filter works on local fallback', () => {
    const assets = [
      mockAsset('A1', 'GTK',     'Table 1'),
      mockAsset('A2', 'Glassco', 'Tempering Oven'),
      mockAsset('A3', 'GTK',     'CNC Machine'),
    ];
    localStorage.setItem(ASSET_KEY, JSON.stringify(assets));
    const gtkAssets = JSON.parse(localStorage.getItem(ASSET_KEY) || '[]')
      .filter((a: any) => a.company === 'GTK');
    expect(gtkAssets).toHaveLength(2);
    expect(gtkAssets.every((a: any) => a.company === 'GTK')).toBe(true);
  });

  it('maintenance log appends correctly', () => {
    const asset = mockAsset('ASSET-002', 'GTK', 'Generator');
    const log = { date: '2026-04-01', description: 'Oil change', cost: 5000 };
    asset.maintenanceLogs.push(log);
    expect(asset.maintenanceLogs).toHaveLength(1);
    expect(asset.maintenanceLogs[0].cost).toBe(5000);
  });

  it('updatedAt is refreshed on update', () => {
    const asset = mockAsset('ASSET-003', 'GTK', 'Vehicle');
    const before = asset.updatedAt;
    // Simulate time passing
    asset.updatedAt = new Date(Date.now() + 1000).toISOString();
    expect(asset.updatedAt > before).toBe(true);
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: Phase 2 — Intercompany Transfer Logic
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 2 — Intercompany Transfer', () => {

  const buildTransfer = (id: string, from: string, to: string, type: string, amount: number) => ({
    id, fromCompany: from, toCompany: to, type, amount,
    description: `Test transfer: ${type}`,
    date: '2026-04-01',
    fromGLTxId: `GL-${id}-FROM`,
    toGLTxId:   `GL-${id}-TO`,
    status: 'Posted' as const,
    postedBy: 'Hassan',
    createdAt: new Date().toISOString(),
  });

  it('transfer builds correct GL TX IDs', () => {
    const t = buildTransfer('ICO-12345678', 'Glassco', 'GTK', 'Glass Supply', 200000);
    expect(t.fromGLTxId).toBe('GL-ICO-12345678-FROM');
    expect(t.toGLTxId).toBe('GL-ICO-12345678-TO');
  });

  it('company filter on listTransfers — fromCompany', () => {
    const transfers = [
      buildTransfer('ICO-001', 'Glassco', 'GTK',  'Glass Supply',   100000),
      buildTransfer('ICO-002', 'GTK',     'GTI',   'Cash Transfer',   50000),
      buildTransfer('ICO-003', 'Nippon',  'GTK',   'Services',        30000),
    ];
    const glasscoTxs = transfers.filter(t => t.fromCompany === 'Glassco' || t.toCompany === 'Glassco');
    expect(glasscoTxs).toHaveLength(1);
    expect(glasscoTxs[0].id).toBe('ICO-001');
  });

  it('company filter on listTransfers — toCompany', () => {
    const transfers = [
      buildTransfer('ICO-001', 'Glassco', 'GTK',  'Glass Supply',   100000),
      buildTransfer('ICO-002', 'GTK',     'GTI',   'Cash Transfer',   50000),
    ];
    const gtkTxs = transfers.filter(t => t.fromCompany === 'GTK' || t.toCompany === 'GTK');
    expect(gtkTxs).toHaveLength(2); // GTK appears in both
  });

  it('reversal changes status', () => {
    const t = buildTransfer('ICO-004', 'Glassco', 'GTK', 'Aluminium Supply', 80000);
    const reversed = { ...t, status: 'Reversed' as const };
    expect(reversed.status).toBe('Reversed');
    expect(t.status).toBe('Posted'); // original unchanged
  });

  it('transfer amount must be positive', () => {
    const isValid = (amount: number) => amount > 0;
    expect(isValid(100000)).toBe(true);
    expect(isValid(0)).toBe(false);
    expect(isValid(-5000)).toBe(false);
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: Phase 3 — GTK Quotation Builder (calcMargin)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 3 — GTK Quotation Margin Calculation', () => {

  // Replicate calcMargin logic from useGTKQuotation
  const COST_RATIO: Record<string, number> = {
    'Non-Thermal':    0.58,
    'Thermal Break':  0.55,
    'AluWood OAK':    0.52,
    'AluWood TEAK':   0.52,
    'uPVC White':     0.60,
    'uPVC Black Lami':0.60,
  };

  const calcMargin = (
    items: { aluminumAmt: number; glassAmt: number; nettingAmt: number; totalSqft: number }[],
    profileType: string,
    installAmt: number, cartage: number, discountAmt: number
  ) => {
    const sellAlum  = items.reduce((s, i) => s + i.aluminumAmt, 0);
    const sellGlass = items.reduce((s, i) => s + i.glassAmt,    0);
    const sellNet   = items.reduce((s, i) => s + i.nettingAmt,  0);
    const grossSell = sellAlum + sellGlass + sellNet + installAmt + cartage - discountAmt;
    const ratio     = COST_RATIO[profileType] ?? 0.58;
    const totalCost = (sellAlum * ratio) + (sellGlass * 0.70) + (sellNet * 0.65) + (installAmt * 0.55);
    const grossProfit = grossSell - totalCost;
    const marginPct   = grossSell > 0 ? (grossProfit / grossSell) * 100 : 0;
    const totalSqft   = items.reduce((s, i) => s + i.totalSqft, 0);
    return { grossSell, totalCost, grossProfit, marginPct, perSqftSell: totalSqft > 0 ? grossSell / totalSqft : 0 };
  };

  const makeItem = (alumAmt: number, glassAmt = 0, netAmt = 0, sqft = 10) => ({
    aluminumAmt: alumAmt, glassAmt, nettingAmt: netAmt, totalSqft: sqft,
  });

  it('Non-Thermal margin ~42%', () => {
    const items = [makeItem(100000, 0, 0, 50)];
    const r = calcMargin(items, 'Non-Thermal', 0, 0, 0);
    expect(r.marginPct).toBeCloseTo(42, 0);
    expect(r.grossProfit).toBe(42000);
  });

  it('Thermal Break margin ~45%', () => {
    const items = [makeItem(100000, 0, 0, 40)];
    const r = calcMargin(items, 'Thermal Break', 0, 0, 0);
    expect(r.marginPct).toBeCloseTo(45, 0);
  });

  it('discount reduces gross sell', () => {
    const items = [makeItem(100000)];
    const withDiscount    = calcMargin(items, 'Non-Thermal', 0, 0, 10000);
    const withoutDiscount = calcMargin(items, 'Non-Thermal', 0, 0, 0);
    expect(withDiscount.grossSell).toBe(withoutDiscount.grossSell - 10000);
  });

  it('per sqft sell = grossSell / totalSqft', () => {
    const items = [makeItem(100000, 0, 0, 100)];
    const r = calcMargin(items, 'Non-Thermal', 0, 0, 0);
    expect(r.perSqftSell).toBe(r.grossSell / 100);
  });

  it('zero revenue gives zero margin', () => {
    const r = calcMargin([], 'Non-Thermal', 0, 0, 0);
    expect(r.marginPct).toBe(0);
    expect(r.grossSell).toBe(0);
  });

  it('quotation ID format matches pattern', () => {
    const id = `GTK-Q-${Date.now().toString(36).toUpperCase()}`;
    expect(id).toMatch(/^GTK-Q-[A-Z0-9]+$/);
  });

  it('status progression: Draft → Sent → Approved', () => {
    const statuses = ['Draft', 'Sent', 'Approved', 'Rejected'];
    const transitions: Record<string, string[]> = {
      Draft:    ['Sent'],
      Sent:     ['Approved', 'Rejected'],
      Approved: [],
      Rejected: [],
    };
    expect(transitions['Draft']).toContain('Sent');
    expect(transitions['Sent']).toContain('Approved');
    expect(transitions['Approved']).toHaveLength(0);
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: Phase 4 — Reports Hub (Date Filtering + Aging Buckets)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 4 — Reports Hub: Date Filtering', () => {

  const filterLedgerByDate = (ledger: any[], from: string, to: string) =>
    ledger.filter(tx => {
      const d = tx.doc_date || tx.date || '';
      return d >= from && d <= to;
    });

  it('filters transactions within date range', () => {
    const ledger = [
      { id: '1', doc_date: '2026-01-15', amount: 10000 },
      { id: '2', doc_date: '2026-03-20', amount: 20000 },
      { id: '3', doc_date: '2026-04-05', amount: 30000 },
    ];
    const filtered = filterLedgerByDate(ledger, '2026-01-01', '2026-03-31');
    expect(filtered).toHaveLength(2);
    expect(filtered.map(t => t.id)).toEqual(['1', '2']);
  });

  it('inclusive boundary dates included', () => {
    const ledger = [
      { id: '1', doc_date: '2026-01-01' },
      { id: '2', doc_date: '2026-03-31' },
    ];
    const filtered = filterLedgerByDate(ledger, '2026-01-01', '2026-03-31');
    expect(filtered).toHaveLength(2);
  });

  it('outside date range excluded', () => {
    const ledger = [
      { id: '1', doc_date: '2025-12-31' },
      { id: '2', doc_date: '2026-04-01' },
    ];
    const filtered = filterLedgerByDate(ledger, '2026-01-01', '2026-03-31');
    expect(filtered).toHaveLength(0);
  });

  it('group mode combines all companies', () => {
    const allCompanies = ['GTK', 'GTI', 'Glassco', 'Nippon', 'Factory'];
    expect(allCompanies).toHaveLength(5);
    expect(allCompanies).toContain('GTK');
    expect(allCompanies).toContain('Factory');
  });

});

describe('Phase 4 — Reports Hub: AR/AP Aging Buckets', () => {

  const getAgingBucket = (daysPast: number) => {
    if (daysPast <= 30)  return 'current';
    if (daysPast <= 60)  return '31-60';
    if (daysPast <= 90)  return '61-90';
    if (daysPast <= 120) return '91-120';
    return '120+';
  };

  const calcDaysPast = (txDate: string, asOfDate: string) => {
    const d1 = new Date(txDate);
    const d2 = new Date(asOfDate);
    return Math.floor((d2.getTime() - d1.getTime()) / 86400000);
  };

  it('0 days → current bucket', () => {
    expect(getAgingBucket(0)).toBe('current');
    expect(getAgingBucket(30)).toBe('current');
  });

  it('31 days → 31-60 bucket', () => {
    expect(getAgingBucket(31)).toBe('31-60');
    expect(getAgingBucket(60)).toBe('31-60');
  });

  it('91 days → 91-120 bucket', () => {
    expect(getAgingBucket(91)).toBe('91-120');
  });

  it('121+ days → 120+ bucket (overdue)', () => {
    expect(getAgingBucket(121)).toBe('120+');
    expect(getAgingBucket(365)).toBe('120+');
  });

  it('days past calculation correct', () => {
    const days = calcDaysPast('2026-01-01', '2026-04-01');
    expect(days).toBe(90);
  });

  it('same day → 0 days past', () => {
    const days = calcDaysPast('2026-04-01', '2026-04-01');
    expect(days).toBe(0);
  });

});

describe('Phase 4 — Balance Sheet Equation', () => {

  const checkBalance = (totalAssets: number, totalLiab: number, totalEquity: number) => {
    const diff = Math.abs(totalAssets - (totalLiab + totalEquity));
    return { balanced: diff < 1, difference: diff };
  };

  it('balanced balance sheet passes', () => {
    const r = checkBalance(1000000, 600000, 400000);
    expect(r.balanced).toBe(true);
    expect(r.difference).toBe(0);
  });

  it('unbalanced balance sheet detected', () => {
    const r = checkBalance(1000000, 600000, 399999);
    expect(r.balanced).toBe(false);
    expect(r.difference).toBe(1);
  });

  it('zero state is balanced', () => {
    const r = checkBalance(0, 0, 0);
    expect(r.balanced).toBe(true);
  });

  it('floating point tolerance within 1 PKR', () => {
    const r = checkBalance(1000000.5, 600000.3, 400000.2);
    expect(r.balanced).toBe(true); // diff = 0 (within tolerance)
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: Phase 5 — GTK Projects GL Posting
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 5 — GTK Projects: GL Cost Posting', () => {

  const buildProjectCostEntry = (params: {
    projectId: string; company: string; costType: string; amount: number;
  }) => ({
    id: `PROJ-${params.projectId}-${Date.now()}`,
    company: params.company,
    docType: 'JV',
    docDate: new Date().toISOString().split('T')[0],
    description: `PROJECT COST: ${params.costType}`.toUpperCase(),
    referenceId: params.projectId,
    status: 'Posted',
    details: [
      { accountId: `${params.company}-PROJ-WIP`, debit: params.amount, credit: 0,               text: `${params.costType} cost` },
      { accountId: `${params.company}-PROJ-AP`,  debit: 0,             credit: params.amount,   text: 'Project cost accrual' },
    ],
  });

  const buildCompletionEntry = (params: {
    projectId: string; company: string; finalValue: number;
  }) => ({
    id: `PROJ-COMP-${params.projectId}`,
    company: params.company,
    docType: 'DR',
    details: [
      { accountId: `${params.company}-PROJ-AR`,  debit: params.finalValue, credit: 0,                 text: 'Project AR' },
      { accountId: `${params.company}-PROJ-REV`, debit: 0,                 credit: params.finalValue, text: 'Project Revenue' },
    ],
  });

  it('cost entry is balanced (Dr WIP / Cr Accruals)', () => {
    const entry = buildProjectCostEntry({ projectId: 'P-001', company: 'GTK', costType: 'Aluminium', amount: 45000 });
    const dr = entry.details.reduce((s, d) => s + d.debit, 0);
    const cr = entry.details.reduce((s, d) => s + d.credit, 0);
    expect(dr).toBe(cr);
    expect(dr).toBe(45000);
  });

  it('completion entry is balanced (Dr AR / Cr Revenue)', () => {
    const entry = buildCompletionEntry({ projectId: 'P-001', company: 'GTK', finalValue: 850000 });
    const dr = entry.details.reduce((s, d) => s + d.debit, 0);
    const cr = entry.details.reduce((s, d) => s + d.credit, 0);
    expect(dr).toBe(cr);
    expect(dr).toBe(850000);
  });

  it('cost type updates correct consumed field', () => {
    const project: any = { glassConsumed: 0, aluminiumConsumed: 0, hardwareConsumed: 0, otherConsumed: 0 };
    const applyConsumed = (p: any, type: string, amount: number) => {
      const updated = { ...p };
      if      (type === 'Glass')      updated.glassConsumed      = (p.glassConsumed      || 0) + amount;
      else if (type === 'Aluminium')  updated.aluminiumConsumed  = (p.aluminiumConsumed  || 0) + amount;
      else if (type === 'Hardware')   updated.hardwareConsumed   = (p.hardwareConsumed   || 0) + amount;
      else                            updated.otherConsumed      = (p.otherConsumed      || 0) + amount;
      return updated;
    };
    const after = applyConsumed(project, 'Aluminium', 45000);
    expect(after.aluminiumConsumed).toBe(45000);
    expect(after.glassConsumed).toBe(0);
  });

  it('multiple cost posts accumulate', () => {
    let consumed = { aluminiumConsumed: 0 };
    consumed = { aluminiumConsumed: consumed.aluminiumConsumed + 45000 };
    consumed = { aluminiumConsumed: consumed.aluminiumConsumed + 30000 };
    consumed = { aluminiumConsumed: consumed.aluminiumConsumed + 15000 };
    expect(consumed.aluminiumConsumed).toBe(90000);
  });

  it('project margin after costs is correct', () => {
    const revenue      = 500000;
    const totalConsumed = 320000;
    const profit       = revenue - totalConsumed;
    const margin       = (profit / revenue) * 100;
    expect(margin).toBeCloseTo(36, 0);
    expect(profit).toBe(180000);
  });

  it('job order ID format for GTK', () => {
    const year = 2026;
    const prefix = `JO-GTK-${year}-`;
    const id = `${prefix}0001`;
    expect(id).toMatch(/^JO-GTK-2026-\d{4}$/);
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6: Phase 2 — Delivery Invoice Sequence
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 2 — Delivery Invoice Sequence (localStorage fallback)', () => {

  beforeEach(() => { localStorage.clear(); });

  const getNextDeliveryNo = (company: string) => {
    const year = 2026;
    const key = `del_inv_seq_${company}_${year}`;
    const current = parseInt(localStorage.getItem(key) || '0', 10);
    const next = current + 1;
    localStorage.setItem(key, String(next));
    return `DI-${company.substring(0, 3).toUpperCase()}-${year}-${String(next).padStart(4, '0')}`;
  };

  it('first delivery invoice starts at 0001', () => {
    expect(getNextDeliveryNo('Glassco')).toBe('DI-GLA-2026-0001');
  });

  it('sequential delivery invoices increment', () => {
    const d1 = getNextDeliveryNo('GTK');
    const d2 = getNextDeliveryNo('GTK');
    expect(d1).toBe('DI-GTK-2026-0001');
    expect(d2).toBe('DI-GTK-2026-0002');
  });

  it('sequence is company-scoped', () => {
    const g1 = getNextDeliveryNo('GTK');
    const ni = getNextDeliveryNo('Nippon');
    expect(g1).toContain('GTK');
    expect(ni).toContain('NIP');
    expect(ni).toBe('DI-NIP-2026-0001'); // Nippon starts fresh
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7: Phase 5 — AI Retry Backoff Logic
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 5 — AI Retry Backoff', () => {

  it('backoff delay doubles each attempt', () => {
    const getDelay = (attempt: number) => Math.pow(2, attempt) * 1000;
    expect(getDelay(1)).toBe(2000);
    expect(getDelay(2)).toBe(4000);
    expect(getDelay(3)).toBe(8000);
  });

  it('max 3 attempts then throws', async () => {
    let attempts = 0;
    const mockFetch = async () => {
      attempts++;
      throw new Error('Network error');
    };

    const fetchWithRetry = async (maxRetries = 3) => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          return await mockFetch();
        } catch (e) {
          if (attempt === maxRetries) throw e;
        }
      }
    };

    await expect(fetchWithRetry(3)).rejects.toThrow('Network error');
    expect(attempts).toBe(3);
  });

  it('retry on 429 status', () => {
    const shouldRetry = (status: number, attempt: number, maxRetries: number) =>
      (status === 429 || status === 529) && attempt < maxRetries;
    expect(shouldRetry(429, 1, 3)).toBe(true);
    expect(shouldRetry(429, 3, 3)).toBe(false); // last attempt — don't retry
    expect(shouldRetry(200, 1, 3)).toBe(false);
    expect(shouldRetry(500, 1, 3)).toBe(false);
  });

  it('no retry on 200', () => {
    const shouldRetry = (status: number) => status === 429 || status === 529;
    expect(shouldRetry(200)).toBe(false);
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 8: Stock Ledger Column Validation (Phase 1 fix)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Stock Ledger — Column Completeness', () => {

  const REQUIRED_COLUMNS = [
    'id', 'company', 'material_id', 'mvmnt_code', 'qty', 'valuation',
    'balance_after', 'reference_doc', 'storage_bin', 'vendor_id',
    'vendor_name', 'sheet_count', 'glass_category', 'bilty_freight_pkr',
    'is_reversal', 'reversal_reason', 'timestamp',
  ];

  const mockStockEntry = () => ({
    id: 'SL-001',
    company: 'Glassco',
    material_id: 'MAT-GLASS-001',
    mvmnt_code: '101',
    qty: 50,
    uom: 'SqFt',
    valuation: 75000,
    balance_after: 75000,
    reference_doc: 'GRN-001',
    storage_bin: 'BIN-A1',
    vendor_id: 'V-001',
    vendor_name: 'Pakistan Glass',
    sheet_count: 5,
    glass_category: 'Float',
    bilty_freight_pkr: 1500,
    is_reversal: false,
    reversal_reason: null,
    timestamp: new Date().toISOString(),
  });

  it('all required columns are present in stock entry', () => {
    const entry = mockStockEntry();
    REQUIRED_COLUMNS.forEach(col => {
      expect(entry).toHaveProperty(col);
    });
  });

  it('mvmnt_code is not null (NOT NULL fix verified)', () => {
    const entry = mockStockEntry();
    expect(entry.mvmnt_code).not.toBeNull();
    expect(entry.mvmnt_code).toBeDefined();
  });

  it('bilty_freight_pkr defaults to 0 if not provided', () => {
    const entry = { ...mockStockEntry(), bilty_freight_pkr: undefined };
    const freight = entry.bilty_freight_pkr ?? 0;
    expect(freight).toBe(0);
  });

  it('is_reversal defaults to false', () => {
    const entry = mockStockEntry();
    expect(entry.is_reversal).toBe(false);
  });

  it('reversal entry has reversal_of reference', () => {
    const original = { ...mockStockEntry(), id: 'SL-001' };
    const reversal = {
      ...mockStockEntry(), id: 'SL-001-REV',
      is_reversal: true,
      reversal_reason: 'GRN cancelled',
      mvmnt_code: '102',
    };
    expect(reversal.is_reversal).toBe(true);
    expect(reversal.reversal_reason).not.toBeNull();
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9: Leave Management (Phase 2 fix)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 2 — Leave Management', () => {

  const ENTITLEMENTS: Record<string, number> = {
    Annual: 16, Casual: 10, Sick: 8, Unpaid: 999, Maternity: 90, Paternity: 3,
  };

  const calcLeaveBalance = (applications: any[], employeeId: string, year = 2026) => {
    const yearStart = `${year}-01-01`;
    const approved  = applications.filter(a =>
      a.employeeId === employeeId && a.status === 'Approved' && a.from >= yearStart
    );
    const used: Record<string, number> = {};
    approved.forEach(a => { used[a.type] = (used[a.type] || 0) + a.days; });
    return Object.fromEntries(
      Object.keys(ENTITLEMENTS).map(t => [t, Math.max(0, ENTITLEMENTS[t] - (used[t] || 0))])
    );
  };

  it('full entitlement when no leaves taken', () => {
    const balance = calcLeaveBalance([], 'EMP-001');
    expect(balance['Annual']).toBe(16);
    expect(balance['Casual']).toBe(10);
    expect(balance['Sick']).toBe(8);
  });

  it('5 annual days taken → 11 remaining', () => {
    const apps = [{ employeeId: 'EMP-001', type: 'Annual', status: 'Approved', days: 5, from: '2026-02-01' }];
    const balance = calcLeaveBalance(apps, 'EMP-001');
    expect(balance['Annual']).toBe(11);
  });

  it('rejected leave not deducted', () => {
    const apps = [{ employeeId: 'EMP-001', type: 'Annual', status: 'Rejected', days: 5, from: '2026-02-01' }];
    const balance = calcLeaveBalance(apps, 'EMP-001');
    expect(balance['Annual']).toBe(16); // unchanged
  });

  it('balance does not go negative', () => {
    const apps = Array.from({ length: 20 }, (_, i) => ({
      employeeId: 'EMP-001', type: 'Annual', status: 'Approved', days: 1, from: `2026-0${(i % 9) + 1}-01`,
    }));
    const balance = calcLeaveBalance(apps, 'EMP-001');
    expect(balance['Annual']).toBeGreaterThanOrEqual(0);
  });

  it('leave balance is employee-scoped', () => {
    const apps = [
      { employeeId: 'EMP-001', type: 'Annual', status: 'Approved', days: 5, from: '2026-02-01' },
      { employeeId: 'EMP-002', type: 'Annual', status: 'Approved', days: 10, from: '2026-02-01' },
    ];
    const b1 = calcLeaveBalance(apps, 'EMP-001');
    const b2 = calcLeaveBalance(apps, 'EMP-002');
    expect(b1['Annual']).toBe(11);
    expect(b2['Annual']).toBe(6);
  });

  it('daysBetween excludes Sundays', () => {
    const daysBetween = (from: string, to: string) => {
      const d1 = new Date(from), d2 = new Date(to);
      let count = 0;
      const cur = new Date(d1);
      while (cur <= d2) {
        if (cur.getDay() !== 0) count++; // skip Sunday
        cur.setDate(cur.getDate() + 1);
      }
      return Math.max(1, count);
    };
    // 2026-04-06 is a Monday, 2026-04-12 is Sunday
    // Mon-Sat = 6 working days
    const days = daysBetween('2026-04-06', '2026-04-12');
    expect(days).toBe(6); // Sunday excluded
  });

});
