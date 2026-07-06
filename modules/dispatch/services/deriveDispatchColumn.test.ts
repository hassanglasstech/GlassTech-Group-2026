import { describe, it, expect } from 'vitest';
import {
  deriveDispatchColumn,
  deriveTripColumn,
  signalsFromDispatch,
  type DispatchSignals,
} from './deriveDispatchColumn';

const base: DispatchSignals = {
  status: 'Draft',
  pieceCount: 0,
  receivedCount: 0,
  hasGatePass: false,
  hasVendorInvoice: false,
  podCompleted: false,
};

describe('deriveDispatchColumn', () => {
  it('draft with no pieces → Ready', () => {
    expect(deriveDispatchColumn({ ...base }).column).toBe('Ready');
  });

  it('scheduled with pieces → Loading', () => {
    expect(deriveDispatchColumn({ ...base, status: 'Scheduled', pieceCount: 5 }).column).toBe('Loading');
  });

  it('ready-to-dispatch with gate pass → At-Gate', () => {
    const r = deriveDispatchColumn({ ...base, status: 'Ready to Dispatch', pieceCount: 5, hasGatePass: true });
    expect(r.column).toBe('At-Gate');
    expect(r.conflict).toBe(false);
  });

  it('dispatched with gate pass → In-Transit (no conflict)', () => {
    const r = deriveDispatchColumn({ ...base, status: 'Dispatched', pieceCount: 5, hasGatePass: true });
    expect(r.column).toBe('In-Transit');
    expect(r.conflict).toBe(false);
  });

  it('dispatched WITHOUT gate pass → conflict flagged', () => {
    const r = deriveDispatchColumn({ ...base, status: 'Dispatched', pieceCount: 5, hasGatePass: false });
    expect(r.conflict).toBe(true);
    expect(r.conflictReason).toMatch(/gate pass/i);
  });

  it('POD complete → Delivered', () => {
    expect(
      deriveDispatchColumn({ ...base, status: 'Dispatched', hasGatePass: true, podCompleted: true }).column,
    ).toBe('Delivered');
  });

  it('received status → Delivered', () => {
    expect(deriveDispatchColumn({ ...base, status: 'Received', receivedCount: 3 }).column).toBe('Delivered');
  });

  it('vendor invoice recorded → Invoiced', () => {
    expect(
      deriveDispatchColumn({ ...base, status: 'Received', receivedCount: 3, hasVendorInvoice: true }).column,
    ).toBe('Invoiced');
  });

  it('a more-advanced event overrides a stale status', () => {
    expect(
      deriveDispatchColumn({ ...base, status: 'Scheduled', pieceCount: 2, latestEvent: 'IN_TRANSIT' }).column,
    ).toBe('In-Transit');
  });

  it('POD complete but status stale → conflict', () => {
    const r = deriveDispatchColumn({ ...base, status: 'Scheduled', podCompleted: true });
    expect(r.conflict).toBe(true);
  });
});

describe('deriveTripColumn', () => {
  it('trip column = least-advanced leg', () => {
    const delivered = deriveDispatchColumn({ ...base, status: 'Received', receivedCount: 1 });
    const loading = deriveDispatchColumn({ ...base, status: 'Scheduled', pieceCount: 2 });
    expect(deriveTripColumn([delivered, loading]).column).toBe('Loading');
  });

  it('conflict on any leg propagates to the trip', () => {
    const clean = deriveDispatchColumn({ ...base, status: 'Scheduled', pieceCount: 2 });
    const bad = deriveDispatchColumn({ ...base, status: 'Dispatched', hasGatePass: false });
    expect(deriveTripColumn([clean, bad]).conflict).toBe(true);
  });

  it('empty group → Ready, no conflict', () => {
    expect(deriveTripColumn([])).toEqual({ column: 'Ready', conflict: false });
  });
});

describe('signalsFromDispatch', () => {
  it('reads pod_completed_at + counts off the raw row', () => {
    const s = signalsFromDispatch({
      pieceIds: ['p1', 'p2'],
      status: 'Dispatched',
      gatePassId: 'g1',
      pod_completed_at: '2026-07-01',
    } as never);
    expect(s.podCompleted).toBe(true);
    expect(s.pieceCount).toBe(2);
    expect(s.hasGatePass).toBe(true);
  });
});
