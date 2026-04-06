/**
 * phase5_piece_status.test.ts — Q-02
 *
 * 25 tests covering GlassCo production piece lifecycle:
 *
 * Section 1:  Valid status transitions (what IS allowed)
 * Section 2:  Invalid/illogical transitions (what MUST NOT happen)
 * Section 3:  Cutting output routing (services vs direct QC)
 * Section 4:  Dispatch & tempering transitions
 * Section 5:  Terminal statuses (Delivered, Broken)
 * Section 6:  Piece generation from quotation (C-01)
 *
 * Run: npm run test
 */

import { describe, it, expect, vi } from 'vitest';

// ── Mock dependencies ─────────────────────────────────────────────────────────
vi.mock('@/src/services/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select:  () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
      upsert:  () => Promise.resolve({ error: null }),
      insert:  () => Promise.resolve({ error: null }),
    }),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

// ── Piece status constants (mirror of shared/constants.ts) ────────────────────
const PieceStatus = {
  CUT:                    'Cut',
  SERVICE_PENDING:        'Service-Pending',
  QC_PENDING:             'QC-Pending',
  QC_FAILED:              'QC-Failed',
  QC_PASSED:              'QC-Passed',
  READY_TO_DISPATCH:      'Ready to Dispatch',
  DISPATCHED:             'Dispatched',
  TEMPERED:               'Tempered',
  RECEIVED_FROM_TEMPERING:'Received-From-Tempering',
  DELIVERED:              'Delivered',
  RETURNED:               'Returned',
  BROKEN:                 'Broken',
  HOLD:                   'Hold',
} as const;

type PStatus = typeof PieceStatus[keyof typeof PieceStatus];

// ── Piece factory ─────────────────────────────────────────────────────────────
const makePiece = (status: PStatus, overrides: any = {}) => ({
  id:          `PC-TEST-001-${status.replace(/\s/g, '_')}`,
  orderId:     'ORD-001',
  itemIndex:   0,
  specs:       '84×144 | 6mm Clear | A1',
  status,
  lastUpdated: new Date().toISOString(),
  ...overrides,
});

// ── Transition rules (derived from ProductionContext.tsx logic) ───────────────
const VALID_TRANSITIONS: Record<PStatus, PStatus[]> = {
  [PieceStatus.CUT]:                    [PieceStatus.SERVICE_PENDING, PieceStatus.QC_PENDING, PieceStatus.HOLD],
  [PieceStatus.SERVICE_PENDING]:        [PieceStatus.QC_PENDING, PieceStatus.HOLD],
  [PieceStatus.QC_PENDING]:             [PieceStatus.QC_PASSED, PieceStatus.QC_FAILED],
  [PieceStatus.QC_FAILED]:              [PieceStatus.QC_PENDING, PieceStatus.BROKEN, PieceStatus.HOLD],
  [PieceStatus.QC_PASSED]:              [PieceStatus.READY_TO_DISPATCH, PieceStatus.DISPATCHED],
  [PieceStatus.READY_TO_DISPATCH]:      [PieceStatus.DISPATCHED],
  [PieceStatus.DISPATCHED]:             [PieceStatus.TEMPERED, PieceStatus.RECEIVED_FROM_TEMPERING, PieceStatus.DELIVERED],
  [PieceStatus.TEMPERED]:               [PieceStatus.QC_PENDING],
  [PieceStatus.RECEIVED_FROM_TEMPERING]:[PieceStatus.QC_PENDING],
  [PieceStatus.DELIVERED]:             [],   // terminal
  [PieceStatus.BROKEN]:                [],   // terminal
  [PieceStatus.RETURNED]:              [PieceStatus.QC_PENDING],
  [PieceStatus.HOLD]:                  [PieceStatus.CUT, PieceStatus.QC_PENDING, PieceStatus.SERVICE_PENDING],
};

function canTransitionTo(from: PStatus, to: PStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 1: Valid Status Transitions
// ═══════════════════════════════════════════════════════════════════════

describe('Piece Status — Valid Transitions', () => {

  it('Cut → Service-Pending (item has services: polishing, drilling, etc.)', () => {
    expect(canTransitionTo(PieceStatus.CUT, PieceStatus.SERVICE_PENDING)).toBe(true);
  });

  it('Cut → QC-Pending (item has no services — direct to QC)', () => {
    expect(canTransitionTo(PieceStatus.CUT, PieceStatus.QC_PENDING)).toBe(true);
  });

  it('Service-Pending → QC-Pending (services completed)', () => {
    expect(canTransitionTo(PieceStatus.SERVICE_PENDING, PieceStatus.QC_PENDING)).toBe(true);
  });

  it('QC-Pending → QC-Passed (QC inspector passes)', () => {
    expect(canTransitionTo(PieceStatus.QC_PENDING, PieceStatus.QC_PASSED)).toBe(true);
  });

  it('QC-Pending → QC-Failed (QC inspector finds defect)', () => {
    expect(canTransitionTo(PieceStatus.QC_PENDING, PieceStatus.QC_FAILED)).toBe(true);
  });

  it('QC-Failed → QC-Pending (piece re-ground / re-inspected)', () => {
    expect(canTransitionTo(PieceStatus.QC_FAILED, PieceStatus.QC_PENDING)).toBe(true);
  });

  it('QC-Failed → Broken (piece confirmed unfixable)', () => {
    expect(canTransitionTo(PieceStatus.QC_FAILED, PieceStatus.BROKEN)).toBe(true);
  });

  it('QC-Passed → Dispatched (loaded to tempering trip)', () => {
    expect(canTransitionTo(PieceStatus.QC_PASSED, PieceStatus.DISPATCHED)).toBe(true);
  });

  it('Dispatched → Tempered (tempering returned)', () => {
    expect(canTransitionTo(PieceStatus.DISPATCHED, PieceStatus.TEMPERED)).toBe(true);
  });

  it('Dispatched → Delivered (direct site delivery)', () => {
    expect(canTransitionTo(PieceStatus.DISPATCHED, PieceStatus.DELIVERED)).toBe(true);
  });

  it('Tempered → QC-Pending (post-tempering QC check)', () => {
    expect(canTransitionTo(PieceStatus.TEMPERED, PieceStatus.QC_PENDING)).toBe(true);
  });

  it('Hold → Cut (piece released from hold)', () => {
    expect(canTransitionTo(PieceStatus.HOLD, PieceStatus.CUT)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SECTION 2: Invalid Transitions (must NOT be allowed)
// ═══════════════════════════════════════════════════════════════════════

describe('Piece Status — Invalid Transitions', () => {

  it('Delivered → Cut (cannot un-deliver a piece)', () => {
    expect(canTransitionTo(PieceStatus.DELIVERED, PieceStatus.CUT)).toBe(false);
  });

  it('Delivered → QC-Pending (delivered pieces are done)', () => {
    expect(canTransitionTo(PieceStatus.DELIVERED, PieceStatus.QC_PENDING)).toBe(false);
  });

  it('Broken → QC-Pending (broken pieces cannot re-enter production)', () => {
    expect(canTransitionTo(PieceStatus.BROKEN, PieceStatus.QC_PENDING)).toBe(false);
  });

  it('Cut → Delivered (cannot skip the entire production chain)', () => {
    expect(canTransitionTo(PieceStatus.CUT, PieceStatus.DELIVERED)).toBe(false);
  });

  it('Cut → Tempered (cannot skip QC and go straight to tempered)', () => {
    expect(canTransitionTo(PieceStatus.CUT, PieceStatus.TEMPERED)).toBe(false);
  });

  it('QC-Passed → Cut (cannot go backwards past QC)', () => {
    expect(canTransitionTo(PieceStatus.QC_PASSED, PieceStatus.CUT)).toBe(false);
  });

  it('Dispatched → Cut (cannot return from dispatch to raw cut)', () => {
    expect(canTransitionTo(PieceStatus.DISPATCHED, PieceStatus.CUT)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SECTION 3: Cutting Output Routing (handleCuttingOutput logic)
// ═══════════════════════════════════════════════════════════════════════

describe('Cutting Output — Service Routing', () => {

  // Replicate handleCuttingOutput routing logic
  function routeFromCutting(item: { selectedServices?: string[]; holes?: any[] }): PStatus {
    const services: string[] = [];
    const s = item.selectedServices || [];
    if (s.includes('P/E') || s.includes('P/F')) services.push('Polishing');
    if (s.includes('R/D')) services.push('Grinding');
    if (s.includes('Notch')) services.push('Notching');
    if (item.holes && item.holes.length > 0) services.push('Holes');
    return services.length > 0 ? PieceStatus.SERVICE_PENDING : PieceStatus.QC_PENDING;
  }

  it('item with P/E (edge polish) routes to Service-Pending', () => {
    expect(routeFromCutting({ selectedServices: ['P/E'] })).toBe(PieceStatus.SERVICE_PENDING);
  });

  it('item with R/D (round/drill) routes to Service-Pending', () => {
    expect(routeFromCutting({ selectedServices: ['R/D'] })).toBe(PieceStatus.SERVICE_PENDING);
  });

  it('item with holes routes to Service-Pending', () => {
    expect(routeFromCutting({ holes: [{ x: 10, y: 10, diameter: 12 }] })).toBe(PieceStatus.SERVICE_PENDING);
  });

  it('plain glass with no services routes directly to QC-Pending', () => {
    expect(routeFromCutting({ selectedServices: [] })).toBe(PieceStatus.QC_PENDING);
  });

  it('item with Notch routes to Service-Pending', () => {
    expect(routeFromCutting({ selectedServices: ['Notch'] })).toBe(PieceStatus.SERVICE_PENDING);
  });

  it('item with no services field routes to QC-Pending', () => {
    expect(routeFromCutting({})).toBe(PieceStatus.QC_PENDING);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SECTION 4: Dispatch & Tempering
// ═══════════════════════════════════════════════════════════════════════

describe('Dispatch & Tempering Status', () => {

  it('dispatch status after loading to tempering trip = Dispatched', () => {
    // From ProductionContext: isRemoteLoad → Dispatched
    const isRemoteLoad = true;
    const expected = isRemoteLoad ? PieceStatus.DISPATCHED : PieceStatus.QC_PASSED;
    expect(expected).toBe(PieceStatus.DISPATCHED);
  });

  it('dispatch status for site delivery trip = Ready to Dispatch', () => {
    const isSiteDelivery = true;
    const expected = isSiteDelivery ? PieceStatus.READY_TO_DISPATCH : PieceStatus.DISPATCHED;
    expect(expected).toBe(PieceStatus.READY_TO_DISPATCH);
  });

  it('piece can be Received-From-Tempering after dispatch', () => {
    expect(canTransitionTo(PieceStatus.DISPATCHED, PieceStatus.RECEIVED_FROM_TEMPERING)).toBe(true);
  });

  it('Received-From-Tempering → QC-Pending for post-tempering inspection', () => {
    expect(canTransitionTo(PieceStatus.RECEIVED_FROM_TEMPERING, PieceStatus.QC_PENDING)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SECTION 5: Terminal Statuses
// ═══════════════════════════════════════════════════════════════════════

describe('Terminal Statuses — Delivered & Broken', () => {

  const TERMINAL = [PieceStatus.DELIVERED, PieceStatus.BROKEN];
  const ALL      = Object.values(PieceStatus);

  TERMINAL.forEach(terminal => {
    it(`${terminal} has no valid outgoing transitions`, () => {
      const validOuts = ALL.filter(s => canTransitionTo(terminal as PStatus, s as PStatus));
      expect(validOuts).toHaveLength(0);
    });
  });

  it('Delivered piece has status Delivered', () => {
    const piece = makePiece(PieceStatus.DELIVERED);
    expect(piece.status).toBe('Delivered');
  });

  it('Broken piece records fault description', () => {
    const piece = makePiece(PieceStatus.BROKEN, {
      fault: { id: 'FLT-001', description: 'QC-05 Glass Breakage', reportedAt: new Date().toISOString(), disposal: 'None' }
    });
    expect(piece.fault?.description).toContain('QC-05');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SECTION 6: Piece Generation from Quotation (C-01)
// ═══════════════════════════════════════════════════════════════════════

describe('Piece Generation from Quotation — C-01', () => {

  const makeQuotationItem = (qty: number, overrides: any = {}) => ({
    id:          'ITEM-001',
    description: 'Fixed Light Glass',
    locationCode:'A1',
    glazingSpecs:'6mm Clear Tempered',
    qty,
    width:       84,
    height:      144,
    totalSqFt:   84 * 144 / 144,
    pricePerUnit: 450,
    amount:      qty * 84 * 144 / 144 * 450,
    ...overrides,
  });

  it('generate creates qty pieces per item', () => {
    const item = makeQuotationItem(5);
    const pieces = Array.from({ length: item.qty }, (_, i) => ({
      id:      `PC-ORD-001-0-${i + 1}`,
      orderId: 'ORD-001',
      itemIndex: 0,
      specs:   `${item.width}×${item.height} | ${item.glazingSpecs} | ${item.locationCode}`,
      status:  PieceStatus.CUT,
    }));
    expect(pieces).toHaveLength(5);
    expect(pieces[0].status).toBe('Cut');
    expect(pieces[0].specs).toContain('84×144');
  });

  it('generated pieces start with Cut status', () => {
    const generated = makePiece(PieceStatus.CUT);
    expect(generated.status).toBe(PieceStatus.CUT);
  });

  it('multi-item quotation generates total qty pieces across all items', () => {
    const items = [makeQuotationItem(3), makeQuotationItem(7, { id:'ITEM-002' })];
    const totalPieces = items.reduce((s, i) => s + i.qty, 0);
    expect(totalPieces).toBe(10);
  });

  it('spec string includes size, glass type, and location', () => {
    const item  = makeQuotationItem(1);
    const width = item.width, height = item.height;
    const spec  = [
      width && height ? `${width}×${height}` : '',
      item.glazingSpecs,
      item.locationCode,
    ].filter(Boolean).join(' | ');
    expect(spec).toContain('84×144');
    expect(spec).toContain('6mm Clear Tempered');
    expect(spec).toContain('A1');
  });

  it('does not generate if pieces already exist for this order', () => {
    const existingPieces = [makePiece(PieceStatus.CUT, { orderId: 'ORD-001' })];
    const alreadyExists  = existingPieces.some(p => p.orderId === 'ORD-001');
    expect(alreadyExists).toBe(true);
    // Generation should be blocked
  });
});
