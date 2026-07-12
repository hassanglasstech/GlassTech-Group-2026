/**
 * statusColors.test.ts — the central status → semantic-tone map (the single
 * source of truth every StatusBadge / dot / pill reads). Guards the mapping,
 * the case/separator-insensitive normalization, and the keyword fallback.
 */
import { describe, it, expect } from 'vitest';
import {
  statusTone, statusBadgeClass, statusDotClass, statusTextClass, registerStatusTone,
} from '@/modules/shared/utils/statusColors';

describe('statusTone — explicit domain vocabulary', () => {
  it('maps known ERP statuses to the right tone', () => {
    expect(statusTone('QC-Passed')).toBe('success');
    expect(statusTone('QC-Failed')).toBe('danger');
    expect(statusTone('Ready to Dispatch')).toBe('info');
    expect(statusTone('Partial')).toBe('warning');
    expect(statusTone('Draft')).toBe('neutral');
    expect(statusTone('Paid')).toBe('success');
    expect(statusTone('Overdue')).toBe('danger');
    expect(statusTone('Delivered')).toBe('success');
  });

  it('is case- and separator-insensitive', () => {
    for (const s of ['QC-Passed', 'qc passed', 'QC_PASSED', '  Qc/Passed  ']) {
      expect(statusTone(s), s).toBe('success');
    }
  });
});

describe('statusTone — fallbacks', () => {
  it('uses the keyword fallback for unmapped-but-suggestive statuses', () => {
    expect(statusTone('auto-rejected-2026')).toBe('danger');
    expect(statusTone('payment-pending-review')).toBe('warning');
    expect(statusTone('fully-approved')).toBe('success');
  });

  it('returns neutral for empty / non-string / truly unknown', () => {
    expect(statusTone('')).toBe('neutral');
    expect(statusTone('   ')).toBe('neutral');
    expect(statusTone(null)).toBe('neutral');
    expect(statusTone(123)).toBe('neutral');
    expect(statusTone('totally-unknown')).toBe('neutral');
  });
});

describe('class helpers', () => {
  it('badge / dot / text classes follow the tone', () => {
    expect(statusBadgeClass('Paid')).toContain('bg-success-subtle');
    expect(statusDotClass('Paid')).toBe('bg-success');
    expect(statusTextClass('Overdue')).toBe('text-danger');
    expect(statusTextClass('unknown')).toBe('text-neutral');
  });
});

describe('registerStatusTone', () => {
  it('registers/overrides a status at runtime', () => {
    registerStatusTone('ITEST-Custom', 'danger');
    expect(statusTone('itest custom')).toBe('danger');   // normalized lookup
  });
});
