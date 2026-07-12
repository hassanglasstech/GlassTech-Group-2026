/**
 * money.test.ts — NaN-safe money coercion + commit-boundary validation.
 * Guards the real toNum/validateMoney the forms use before values reach the GL.
 */
import { describe, it, expect } from 'vitest';
import { toNum, validateMoney } from '@/modules/shared/utils/money';

describe('toNum', () => {
  it('passes finite numbers through', () => {
    expect(toNum(1234)).toBe(1234);
    expect(toNum(0)).toBe(0);
    expect(toNum(-5.5)).toBe(-5.5);
  });

  it('strips thousands separators from strings', () => {
    expect(toNum('1,234')).toBe(1234);
    expect(toNum('1,234,567.5')).toBe(1234567.5);
  });

  it('falls back on blank / garbage / non-finite input', () => {
    expect(toNum('')).toBe(0);
    expect(toNum(null)).toBe(0);
    expect(toNum(undefined)).toBe(0);
    expect(toNum('abc')).toBe(0);
    expect(toNum(Infinity)).toBe(0);
    expect(toNum(NaN)).toBe(0);
  });

  it('honours a custom fallback', () => {
    expect(toNum('', 100)).toBe(100);
    expect(toNum('x', -1)).toBe(-1);
  });
});

describe('validateMoney', () => {
  it('accepts a positive amount', () => {
    expect(validateMoney(5000)).toEqual({ valid: true, value: 5000 });
  });

  it('rejects zero by default (must exceed min)', () => {
    const r = validateMoney(0);
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/greater than/i);
  });

  it('accepts zero (min) when allowZero is set', () => {
    expect(validateMoney(0, { allowZero: true })).toEqual({ valid: true, value: 0 });
  });

  it('rejects a negative amount', () => {
    expect(validateMoney(-10).valid).toBe(false);
  });

  it('rejects NaN / blank as "must be a valid number"', () => {
    expect(validateMoney('').error).toMatch(/valid number/i);
    expect(validateMoney('abc').error).toMatch(/valid number/i);
  });

  it('enforces an upper bound (max, e.g. invoice balance)', () => {
    const r = validateMoney(150000, { max: 100000 });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/cannot exceed/i);
    expect(validateMoney(80000, { max: 100000 }).valid).toBe(true);
  });

  it('parses comma-grouped string input', () => {
    expect(validateMoney('1,000')).toEqual({ valid: true, value: 1000 });
  });

  it('uses the supplied label in the error', () => {
    expect(validateMoney(0, { label: 'Receipt' }).error).toMatch(/^Receipt/);
  });
});
