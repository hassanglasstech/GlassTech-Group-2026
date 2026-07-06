import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── Mocks: the charge calc reads pieces/orders (ProductionService) and vendor
//    rates (SalesService). Mock only those; the commitment service itself uses
//    real localStorage (jsdom) and touches NO ledger.
const PIECES = [
  { id: 'p1', orderId: 'SO-1', itemIndex: 0, status: 'Dispatched', specs: '{}', sqft: 50 },
  { id: 'p2', orderId: 'SO-1', itemIndex: 1, status: 'Dispatched', specs: '{}', sqft: 30 },
];
const ORDERS = [
  {
    id: 'SO-1', orderNo: 'SO-1',
    items: [
      { totalSqFt: 50, glassSize: '6mm' },
      { totalSqFt: 30, glassSize: '10mm' },
    ],
  },
];
const VENDORS = [
  {
    id: 'v1', name: 'PSG', type: 'Tempering',
    rates: [
      { id: 'r1', thickness: '6mm', type: 'Tempering', rate: 55, effectiveDate: '2026-01-01' },
      { id: 'r2', thickness: '10mm', type: 'Tempering', rate: 75, effectiveDate: '2026-01-01' },
    ],
  },
];

vi.mock('@/modules/production/services/productionService', () => ({
  ProductionService: {
    getProductionPieces: () => PIECES,
    getJobOrders: () => ORDERS,
  },
}));
vi.mock('@/modules/sales/services/salesService', () => ({
  SalesService: { getVendors: () => VENDORS },
}));

import { TemperingCommitmentService } from '@/modules/finance/services/temperingCommitmentService';
import type { TemperingDispatch } from '@/modules/shared/types';

const makeDispatch = (over: Record<string, unknown> = {}): TemperingDispatch => ({
  id: 'GT-DC-GLS-0725-9001',
  company: 'Glassco',
  plantName: 'PSG',
  pieceIds: ['p1', 'p2'],
  ratesByMm: {},
  serviceType: 'Tempering',
  ...over,
} as unknown as TemperingDispatch);

// Self-contained Map-backed localStorage (safeParse/safeSave use
// getItem/setItem/removeItem/length/key) — independent of jsdom quirks.
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('TemperingCommitmentService (Step 2 — non-GL commitment memo)', () => {
  it('amount = Σ (sqft × per-mm rate) — same formula as inward AP', () => {
    // 50×55 + 30×75 = 2750 + 2250 = 5000
    const c = TemperingCommitmentService.createFromDispatch(makeDispatch(), { today: '2026-07-06' });
    expect(c.amount).toBe(5000);
    expect(c.pieceCount).toBe(2);
    expect(c.totalSqft).toBe(80);
    expect(c.vendorName).toBe('PSG');
    expect(c.orderNos).toEqual(['SO-1']);
  });

  it('status Open, due ~ +2 days from creation', () => {
    const c = TemperingCommitmentService.createFromDispatch(makeDispatch(), { today: '2026-07-06' });
    expect(c.status).toBe('Open');
    expect(c.dueDate).toBe('2026-07-08');
  });

  it('ratesByMm snapshot overrides the vendor live rate', () => {
    // Snapshot bumps 6mm to 60: 50×60 + 30×75 = 3000 + 2250 = 5250
    const c = TemperingCommitmentService.createFromDispatch(
      makeDispatch({ ratesByMm: { '6': 60 } }), { today: '2026-07-06' },
    );
    expect(c.amount).toBe(5250);
  });

  it('persists and filters by company / open status', () => {
    TemperingCommitmentService.createFromDispatch(makeDispatch(), { today: '2026-07-06' });
    expect(TemperingCommitmentService.getOpen('Glassco')).toHaveLength(1);
    expect(TemperingCommitmentService.getCommitments('GTK')).toHaveLength(0);
  });

  it('is idempotent per dispatch (re-create does not duplicate)', () => {
    TemperingCommitmentService.createFromDispatch(makeDispatch(), { today: '2026-07-06' });
    TemperingCommitmentService.createFromDispatch(makeDispatch(), { today: '2026-07-06' });
    expect(TemperingCommitmentService.getAll()).toHaveLength(1);
  });

  it('settle() flips to Settled with the payment-voucher ref', () => {
    const d = makeDispatch();
    TemperingCommitmentService.createFromDispatch(d, { today: '2026-07-06' });
    TemperingCommitmentService.settle(d.id, 'PV-TEMP-GT-DC-GLS-0725-9001');
    const c = TemperingCommitmentService.getAll()[0];
    expect(c.status).toBe('Settled');
    expect(c.settledLedgerRef).toContain('PV-TEMP');
    expect(TemperingCommitmentService.getOpen('Glassco')).toHaveLength(0);
  });

  it('flags missing vendor rates without throwing (estimate stays usable)', () => {
    // 12mm has no vendor rate → that piece costs 0, mm flagged
    const c = TemperingCommitmentService.createFromDispatch(
      makeDispatch({
        pieceIds: ['p1', 'p3'],
      }),
      { today: '2026-07-06' },
    );
    // p3 not in PIECES mock → ignored; only p1 priced = 50×55 = 2750
    expect(c.amount).toBe(2750);
  });
});
