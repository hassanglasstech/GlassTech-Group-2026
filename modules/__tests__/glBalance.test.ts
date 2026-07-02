// Direct unit tests for the REAL extracted GL double-entry balance logic
// (audit #13). No mocks — imports production code so any drift is caught.
import { describe, it, expect } from 'vitest';
import { assertGLBalance, LedgerImbalanceError } from '@/modules/finance/services/glBalance';

describe('glBalance.assertGLBalance (real production logic)', () => {
  it('passes a balanced single debit/credit pair', () => {
    expect(() => assertGLBalance({ id: 'T1', details: [
      { debit: 1000, credit: 0 },
      { debit: 0, credit: 1000 },
    ] })).not.toThrow();
  });

  it('passes a balanced multi-line JV', () => {
    expect(() => assertGLBalance({ id: 'T2', details: [
      { debit: 600, credit: 0 },
      { debit: 400, credit: 0 },
      { debit: 0, credit: 1000 },
    ] })).not.toThrow();
  });

  it('throws LedgerImbalanceError when debit != credit', () => {
    expect(() => assertGLBalance({ id: 'BAD', details: [
      { debit: 1000, credit: 0 },
      { debit: 0, credit: 999 },
    ] })).toThrow(LedgerImbalanceError);
  });

  it('reports the correct signed delta on the error', () => {
    try {
      assertGLBalance({ id: 'D1', details: [
        { debit: 1000.50, credit: 0 },
        { debit: 0, credit: 1000.00 },
      ] });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(LedgerImbalanceError);
      const err = e as LedgerImbalanceError;
      expect(err.txId).toBe('D1');
      expect(err.delta).toBeCloseTo(0.50, 2);
    }
  });

  it('uses integer-cent math — no IEEE-754 drift on 0.1 + 0.2', () => {
    // 0.1 + 0.2 === 0.30000000000000004 in float; cents math must treat this as balanced
    expect(() => assertGLBalance({ id: 'CENTS', details: [
      { debit: 0.1, credit: 0 },
      { debit: 0.2, credit: 0 },
      { debit: 0, credit: 0.3 },
    ] })).not.toThrow();
  });

  it('treats empty / missing details as balanced (0 = 0)', () => {
    expect(() => assertGLBalance({ id: 'EMPTY', details: [] })).not.toThrow();
    expect(() => assertGLBalance({ id: 'NONE' })).not.toThrow();
  });

  it('falls back to UNKNOWN txId when id is omitted', () => {
    try {
      assertGLBalance({ details: [{ debit: 5, credit: 0 }] });
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as LedgerImbalanceError).txId).toBe('UNKNOWN');
    }
  });
});
