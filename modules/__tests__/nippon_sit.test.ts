/**
 * nippon_sit.test.ts — Phase 2 SIT for Nippon (trading) go-live
 *
 * Verifies the trading-specific GL paths added in Phase 1:
 *   N-01 .. N-06  — generateDeliveryInvoice posts the correct trading
 *                   revenue chain, the COGS-at-delivery ledger from
 *                   qty × MAP, and stays balanced across every leg.
 *
 * Why these tests exist:
 *   Nippon's invoice flow had three blockers — wrong revenue account
 *   (P1-1), zero COGS (P1-2), and a production-pieces gate that did
 *   not apply to trading (P1-3). The fixes branch on `company ===
 *   'Nippon'`. This file is the regression net so those branches stay
 *   correct as deliveryInvoiceService evolves.
 *
 * The mock setup mirrors phase2_sit.test.ts — same supabase, same
 * authStore, same FinanceService.assertGLBalance enforced on every
 * GL transaction.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ══════════════════════════════════════════════════════════════════════
// GLOBAL MOCK SETUP — copied from phase2_sit so this file is self-contained
// ══════════════════════════════════════════════════════════════════════

const _store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem:    (k: string) => _store[k] ?? null,
  setItem:    (k: string, v: string) => { _store[k] = v; },
  removeItem: (k: string) => { delete _store[k]; },
  clear:      () => { Object.keys(_store).forEach(k => delete _store[k]); },
  get length() { return Object.keys(_store).length; },
  key:        (i: number) => Object.keys(_store)[i] ?? null,
});

const _rpcCalls: Array<{ name: string; payload: unknown }> = [];

vi.mock('@/src/services/supabaseClient', () => {
  const makeChain = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    const resolve = () => Promise.resolve({ data: null, error: null });
    c.select      = vi.fn(() => makeChain());
    c.eq          = vi.fn(() => makeChain());
    c.in          = vi.fn(() => makeChain());
    c.order       = vi.fn(() => makeChain());
    c.limit       = vi.fn(resolve);
    c.single      = vi.fn(resolve);
    c.maybeSingle = vi.fn(resolve);
    c.upsert      = vi.fn(() => makeChain());
    c.insert      = vi.fn(() => makeChain());
    c.update      = vi.fn(() => makeChain());
    c.delete      = vi.fn(() => makeChain());
    c.then        = vi.fn((cb: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(cb));
    return c;
  };
  return {
    supabase: {
      from: vi.fn(() => makeChain()),
      rpc:  vi.fn((name: string, payload: unknown) => {
        _rpcCalls.push({ name, payload });
        return Promise.resolve({ data: { ok: true }, error: null });
      }),
      auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })) },
    },
  };
});

vi.mock('@/modules/auth/authStore', () => ({
  useAuthStore: {
    getState: () => ({ user: { email: 'sit@glasstech.pk', fullName: 'SIT Tester' }, role: 'owner' }),
  },
}));

vi.mock('@/modules/shared/services/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), action: vi.fn(), success: vi.fn() },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

// GST tests (N-02, N-06) exercise the GST-ON path, so the admin Tax Settings
// toggle is mocked enabled. The service now gates GST on isTaxEnabled(company);
// with this true, gstPercent flows through as before.
vi.mock('@/modules/admin/services/taxSettingsService', () => ({
  isTaxEnabled: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('@/modules/sales/services/asyncSalesService', () => ({
  AsyncSalesService: {
    saveClients:         vi.fn(() => Promise.resolve()),
    saveQuotations:      vi.fn(() => Promise.resolve()),
    saveInvoices:        vi.fn(() => Promise.resolve()),
    savePaymentReceipts: vi.fn(() => Promise.resolve()),
    saveCreditNotes:     vi.fn(() => Promise.resolve()),
    saveVendors:         vi.fn(() => Promise.resolve()),
    saveProducts:        vi.fn(() => Promise.resolve()),
    saveProjects:        vi.fn(() => Promise.resolve()),
  },
}));

let _serialCounter = 0;
vi.mock('@/modules/sales/services/serialAllocator', () => ({
  allocateSerial: vi.fn(() => Promise.resolve(++_serialCounter)),
}));

vi.mock('@/modules/finance/services/periodService', () => ({
  PeriodService: { isPeriodOpen: vi.fn(() => true) },
}));

vi.mock('@/modules/finance/constants/coa.index', () => ({ COMPANY_COA: {} }));

// InventoryService — per-test override for the COGS lookup. The Nippon
// trading COGS plan reads movingAveragePrice from here.
const _mockGetStore = vi.fn(() => [] as unknown[]);
vi.mock('@/modules/procurement/services/inventoryService', () => ({
  InventoryService: { getStore: _mockGetStore, saveStore: vi.fn() },
}));

vi.mock('@/modules/production/services/labourService', () => ({
  LabourService: { getEntries: vi.fn(() => []) },
}));

// ProductionService — Nippon never has production pieces. We assert
// the gate is bypassed even with an empty array.
const _mockGetProductionPieces = vi.fn(() => [] as unknown[]);
vi.mock('@/modules/production/services/productionService', () => ({
  ProductionService: {
    getProductionPieces: _mockGetProductionPieces,
    getPieces:           _mockGetProductionPieces,
    getJobOrders:        vi.fn(() => []),
  },
}));

vi.mock('@/modules/procurement/services/glasscoGLService', () => ({
  postDeliveryCOGS:              vi.fn(() => Promise.resolve()),
  buildDeliveryCOGSPlan:         vi.fn(() => null),
  applyDeliveryCOGSStoreUpdates: vi.fn(),
  reverseDeliveryCOGS:           vi.fn(),
  isCOGSPosted:                  vi.fn(() => false),
}));

const _mockGetLedger = vi.fn(() => [] as unknown[]);

vi.mock('@/modules/finance/services/financeService', async () => {
  // audit #13: assert against the REAL extracted GL-balance logic (single
  // source of truth in ./glBalance — dependency-free, so it imports cleanly
  // inside this mock), NOT an inline copy that can silently drift from prod.
  const { LedgerImbalanceError, assertGLBalance } = await import('@/modules/finance/services/glBalance');
  return {
    LedgerImbalanceError,
    ledgerToRow: vi.fn((tx: { id: string; company: string }) => ({ id: tx.id, company: tx.company, data: tx })),
    FinanceService: {
      getLedger:           _mockGetLedger,
      saveLedger:          vi.fn(),
      recordTransaction:   vi.fn(),
      assertGLBalance,
      // ensureAccount returns `${company}-${code}` so tests can identify
      // which COA chain was hit just by inspecting the accountId.
      ensureAccount: vi.fn((c: string, n: string, _l: number, _p: unknown, t: string, code: string) => ({
        id: `${c}-${code}`, name: n, type: t, code,
      })),
      getAccounts:         vi.fn(() => []),
      saveAccounts:        vi.fn(),
      getFinancialEvents:  vi.fn(() => []),
      saveFinancialEvents: vi.fn(),
      getCostCenters:      vi.fn(() => []),
    },
  };
});

// ══════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════

const sumDebit  = (details: Array<{ debit?: number; credit?: number }>) =>
  details.reduce((s, d) => s + (d.debit  || 0), 0);
const sumCredit = (details: Array<{ debit?: number; credit?: number }>) =>
  details.reduce((s, d) => s + (d.credit || 0), 0);

const makeNipponQuote = (overrides: Record<string, unknown> = {}) => ({
  id: 'QT-0525-0001',
  orderNo: 'SO-0525-0001',
  company: 'Nippon',
  date: '2026-05-19',
  clientId: 'cli-nippon-001',
  projectName: 'Nippon SIT',
  status: 'Approved',
  // Hardware lines — qty in PCS, no sqft (this is the key trading signal)
  items: [
    {
      id: 'item-1',
      description: 'Kin Long Hinge — KL-H123',
      locationCode: 'STK-KL-H123',
      glassSize: 'PCS',
      qty: 10,
      totalSqFt: 0,
      pricePerUnit: 1500,
      amount: 15000,
    },
    {
      id: 'item-2',
      description: 'Aluminium Lock — AL-L456',
      locationCode: 'STK-AL-L456',
      glassSize: 'PCS',
      qty: 5,
      totalSqFt: 0,
      pricePerUnit: 2000,
      amount: 10000,
    },
  ],
  serviceCharges: [],
  discountPercent: 0,
  discountAmount: 0,
  ...overrides,
});

const seedClient = () => {
  _store['gtk_erp_clients'] = JSON.stringify([{
    id: 'cli-nippon-001', name: 'Nippon SIT Client', company: 'Nippon',
    creditLimit: 0,
  }]);
};

const seedQuotation = (quote: unknown) => {
  _store['gtk_erp_quotations'] = JSON.stringify([quote]);
};

// Plant store items with known MAPs so the COGS test math is predictable.
const seedStoreItems = () => {
  _mockGetStore.mockReturnValue([
    { id: 'STK-KL-H123', company: 'Nippon', name: 'Kin Long Hinge',
      movingAveragePrice: 800, quantity: 100, unrestrictedQty: 100 },
    { id: 'STK-AL-L456', company: 'Nippon', name: 'Aluminium Lock',
      movingAveragePrice: 1200, quantity: 50, unrestrictedQty: 50 },
  ]);
};

const resetState = () => {
  Object.keys(_store).forEach(k => delete _store[k]);
  _rpcCalls.length = 0;
  _serialCounter = 0;
  _mockGetLedger.mockReturnValue([]);
  _mockGetProductionPieces.mockReturnValue([]);
  _mockGetStore.mockReturnValue([]);
};

// ══════════════════════════════════════════════════════════════════════
// N-01 .. N-03 · Revenue chain + GST + pieces-gate bypass
// ══════════════════════════════════════════════════════════════════════

describe('Nippon SIT · generateDeliveryInvoice — trading revenue', () => {

  beforeEach(resetState);

  it('N-01 · revenue posts to HARDWARE SALES INCOME (not GLASS PROCESSING)', async () => {
    seedClient();
    const order = makeNipponQuote();
    seedQuotation(order);
    seedStoreItems();

    const { generateDeliveryInvoice } = await import('@/modules/sales/services/deliveryInvoiceService');
    const result = await generateDeliveryInvoice(order as never, 'Nippon', 0);

    expect(result.alreadyInvoiced).toBe(false);
    expect(result.grandTotal).toBe(25000);

    expect(_rpcCalls).toHaveLength(1);
    const payload = _rpcCalls[0].payload as { p_payload: { main_ledger_row: { data: { details: Array<{ accountId: string; debit: number; credit: number }> } } } };
    const details = payload.p_payload.main_ledger_row.data.details;

    // 2 lines — AR debit + Revenue credit (no GST)
    expect(details).toHaveLength(2);
    expect(sumDebit(details)).toBe(25000);
    expect(sumCredit(details)).toBe(25000);

    // Revenue MUST hit the REAL seeded trading leaf — 41124 = Wholesale Sales —
    // General Hardware (external customer). NOT the phantom 4120 (which never
    // existed in the seeded Nippon chart) and NOT the Glassco service chain.
    const revLine = details.find(d => d.credit > 0);
    expect(revLine?.accountId).toBe('Nippon-41124');

    // AR debit must hit the REAL external-wholesale receivable 11213 (not phantom 12210).
    const arLine = details.find(d => d.debit > 0);
    expect(arLine?.accountId).toBe('Nippon-11213');

    // And must NOT hit any phantom/glass account.
    const hitPhantom = details.some(d => ['Nippon-4120', 'Nippon-12210', 'Nippon-41110'].includes(d.accountId));
    expect(hitPhantom).toBe(false);
  });

  it('N-02 · 17% GST produces 3-line balanced GL on Nippon', async () => {
    seedClient();
    const order = makeNipponQuote();
    seedQuotation(order);
    seedStoreItems();

    const { generateDeliveryInvoice } = await import('@/modules/sales/services/deliveryInvoiceService');
    const result = await generateDeliveryInvoice(order as never, 'Nippon', 17);

    expect(result.gstAmount).toBe(4250);
    expect(result.grandTotal).toBe(29250);

    const details = ((_rpcCalls[0].payload as { p_payload: { main_ledger_row: { data: { details: Array<{ debit: number; credit: number }> } } } }).p_payload.main_ledger_row.data.details);
    expect(details).toHaveLength(3);
    expect(sumDebit(details)).toBe(29250);
    expect(sumCredit(details)).toBe(29250);
  });

  it('N-03 · invoice succeeds with ZERO production pieces (trading bypass)', async () => {
    seedClient();
    const order = makeNipponQuote();
    seedQuotation(order);
    seedStoreItems();
    // Explicitly assert we are NOT seeding production pieces — Nippon
    // should sail straight through the gate that blocks Glassco invoices.
    _mockGetProductionPieces.mockReturnValue([]);

    const { generateDeliveryInvoice } = await import('@/modules/sales/services/deliveryInvoiceService');
    const result = await generateDeliveryInvoice(order as never, 'Nippon', 0);

    expect(result.alreadyInvoiced).toBe(false);
    expect(result.grandTotal).toBe(25000);
    expect(_rpcCalls).toHaveLength(1); // GL was written — gate did not block
  });

});

// ══════════════════════════════════════════════════════════════════════
// N-04 .. N-06 · COGS-at-delivery + cross-cutting invariants
// ══════════════════════════════════════════════════════════════════════

describe('Nippon SIT · COGS-at-delivery from inventory', () => {

  beforeEach(resetState);

  it('N-04 · COGS = Σ(qty × movingAveragePrice), balanced Dr COGS / Cr Inventory', async () => {
    seedClient();
    const order = makeNipponQuote();
    seedQuotation(order);
    seedStoreItems();
    // Item 1: 10 × 800 = 8000  ; Item 2: 5 × 1200 = 6000  ; Total: 14000

    const { generateDeliveryInvoice } = await import('@/modules/sales/services/deliveryInvoiceService');
    await generateDeliveryInvoice(order as never, 'Nippon', 0);

    const payload = _rpcCalls[0].payload as { p_payload: { cogs_ledger_row: { data: { details: Array<{ accountId: string; debit: number; credit: number }> } } | null } };
    const cogsRow = payload.p_payload.cogs_ledger_row;
    expect(cogsRow).not.toBeNull();
    const details = cogsRow!.data.details;

    expect(details).toHaveLength(2);
    expect(sumDebit(details)).toBe(14000);
    expect(sumCredit(details)).toBe(14000);

    const cogsLine = details.find(d => d.debit > 0);
    const invLine  = details.find(d => d.credit > 0);
    expect(cogsLine?.accountId).toBe('Nippon-51114');  // GENERAL HARDWARE — COGS (COA leaf)
    expect(invLine?.accountId).toBe('Nippon-11514');  // GENERAL HARDWARE — STOCK
  });

  it('N-05 · COGS plan is null when no store item exists for any line', async () => {
    seedClient();
    const order = makeNipponQuote();
    seedQuotation(order);
    // Empty store — every locationCode lookup will miss, no COGS to post
    _mockGetStore.mockReturnValue([]);

    const { generateDeliveryInvoice } = await import('@/modules/sales/services/deliveryInvoiceService');
    await generateDeliveryInvoice(order as never, 'Nippon', 0);

    const payload = _rpcCalls[0].payload as { p_payload: { cogs_ledger_row: { data: { details: Array<{ debit: number; credit: number }> } } | null } };
    // The plan still returns a row shell, but ledgerTx is null when total
    // COGS is zero — that becomes a null cogs_ledger_row in the RPC payload.
    expect(payload.p_payload.cogs_ledger_row).toBeNull();
  });

  it('N-06 · full Nippon cycle: revenue + COGS combined trial balance = 0', async () => {
    seedClient();
    const order = makeNipponQuote();
    seedQuotation(order);
    seedStoreItems();

    const { generateDeliveryInvoice } = await import('@/modules/sales/services/deliveryInvoiceService');
    await generateDeliveryInvoice(order as never, 'Nippon', 17);

    const payload = _rpcCalls[0].payload as { p_payload: {
      main_ledger_row: { data: { details: Array<{ debit: number; credit: number }> } };
      cogs_ledger_row: { data: { details: Array<{ debit: number; credit: number }> } } | null;
    } };

    const allDetails = [
      ...payload.p_payload.main_ledger_row.data.details,
      ...(payload.p_payload.cogs_ledger_row?.data.details ?? []),
    ];

    // Trial-balance invariant — combined postings net to zero
    const totalDr = sumDebit(allDetails);
    const totalCr = sumCredit(allDetails);
    expect(totalDr).toBe(totalCr);

    // Revenue side: AR 29250 + COGS 14000 = 43250 debits
    // Credit side: Revenue 25000 + GST 4250 + Inventory 14000 = 43250
    expect(totalDr).toBe(43250);
  });

});
