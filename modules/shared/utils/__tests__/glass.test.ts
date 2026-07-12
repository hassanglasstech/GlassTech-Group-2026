/**
 * glass.test.ts — the canonical sqftOf (consolidated from 5 drifted copies).
 * Sheet size "WxH" inches → square feet (÷144), 3 dp, null-safe.
 */
import { describe, it, expect } from 'vitest';
import { sqftOf } from '@/modules/shared/utils/glass';

describe('sqftOf', () => {
  it('converts a standard sheet size to sqft', () => {
    expect(sqftOf('84x144')).toBe(84);     // 84*144/144
    expect(sqftOf('12x12')).toBe(1);       // 144/144
  });

  it('rounds to 3 decimal places', () => {
    expect(sqftOf('10x15')).toBe(1.042);   // 150/144 = 1.04166…
  });

  it('returns 0 for blank / malformed / zero-dimension input', () => {
    expect(sqftOf('')).toBe(0);
    expect(sqftOf('84')).toBe(0);          // missing height
    expect(sqftOf('84x0')).toBe(0);        // zero dimension
    expect(sqftOf('axb')).toBe(0);         // non-numeric
    // @ts-expect-error — null-safety guard is part of the contract
    expect(sqftOf(null)).toBe(0);
  });
});
