/**
 * format.test.ts — shared display formatters (the single source of truth for
 * money + dates across list / editor / print). Date tests use local-component
 * Date objects so they are timezone-independent.
 */
import { describe, it, expect } from 'vitest';
import { formatNumber, formatPKR, formatDate, formatDateTime, formatMonthYear } from '@/modules/shared/utils/format';

describe('formatNumber / formatPKR', () => {
  it('groups thousands', () => {
    expect(formatNumber(145000)).toBe('145,000');
    expect(formatNumber(1234.5)).toBe('1,234.5');
  });

  it('returns "0" for non-finite input', () => {
    expect(formatNumber(NaN)).toBe('0');
    expect(formatNumber('')).toBe('0');
    expect(formatNumber('abc')).toBe('0');
  });

  it('prefixes PKR', () => {
    expect(formatPKR(145000)).toBe('PKR 145,000');
  });
});

describe('formatDate', () => {
  it('renders day-first en-GB "14 Jun 2026"', () => {
    expect(formatDate(new Date(2026, 5, 14))).toBe('14 Jun 2026');
  });

  it('returns "—" for empty / null / undefined', () => {
    expect(formatDate('')).toBe('—');
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
  });

  it('echoes an unparseable string back rather than crashing', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });
});

describe('formatDateTime', () => {
  it('appends HH:MM to the date', () => {
    expect(formatDateTime(new Date(2026, 5, 14, 15, 4))).toBe('14 Jun 2026, 15:04');
  });

  it('returns "—" for empty', () => {
    expect(formatDateTime('')).toBe('—');
  });
});

describe('formatMonthYear', () => {
  it('renders "June 2026" from a bare YYYY-MM', () => {
    expect(formatMonthYear('2026-06')).toBe('June 2026');
  });

  it('renders "June 2026" from a local Date', () => {
    expect(formatMonthYear(new Date(2026, 5, 1))).toBe('June 2026');
  });

  it('returns "—" for empty', () => {
    expect(formatMonthYear('')).toBe('—');
  });
});
