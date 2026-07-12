/**
 * ledgerGuards.test.ts — REAL tests for the maker-checker (4-eyes) posting
 * gate that saveLedger enforces. Imports the ACTUAL predicate the service
 * calls, so a change to the gate condition is caught here.
 *
 * Rule: a manual Journal Voucher (docType 'JV') may NEVER be written as
 * 'Posted' without an approvedBy — EXCEPT system-auto entries, which are
 * pre-audited (recurring expense, depreciation, intercompany GL).
 */
import { describe, it, expect } from 'vitest';
import { assertMakerCheckerApproval, MakerCheckerError } from '@/modules/finance/services/glBalance';

describe('assertMakerCheckerApproval — the 4-eyes gate', () => {
  it('BLOCKS a manual JV posted without approval', () => {
    expect(() => assertMakerCheckerApproval({
      id: 'JV-1', status: 'Posted', docType: 'JV', createdBy: 'maker@glasstech.pk',
    })).toThrow(MakerCheckerError);
  });

  it('names the offending txId on the error', () => {
    try {
      assertMakerCheckerApproval({ id: 'JV-9', status: 'Posted', docType: 'JV' });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(MakerCheckerError);
      expect((e as MakerCheckerError).txId).toBe('JV-9');
    }
  });

  it('ALLOWS a manual JV that carries an approvedBy (went through approveJV)', () => {
    expect(() => assertMakerCheckerApproval({
      id: 'JV-2', status: 'Posted', docType: 'JV', approvedBy: 'checker@glasstech.pk',
    })).not.toThrow();
  });

  it('ALLOWS a system-auto JV (pre-audited background posting)', () => {
    expect(() => assertMakerCheckerApproval({
      id: 'JV-3', status: 'Posted', docType: 'JV', createdBy: 'system-auto',
    })).not.toThrow();
  });

  it('does NOT gate non-JV documents (invoices, receipts, PV)', () => {
    for (const docType of ['INV', 'RV', 'PV', 'CN', 'WE']) {
      expect(() => assertMakerCheckerApproval({
        id: `${docType}-1`, status: 'Posted', docType, createdBy: 'sales@glasstech.pk',
      }), `${docType} should not be gated`).not.toThrow();
    }
  });

  it('does NOT gate a JV still in Draft/Parked (only Posted is gated)', () => {
    expect(() => assertMakerCheckerApproval({ id: 'JV-4', status: 'Draft',  docType: 'JV' })).not.toThrow();
    expect(() => assertMakerCheckerApproval({ id: 'JV-5', status: 'Parked', docType: 'JV' })).not.toThrow();
  });

  it('falls back to UNKNOWN txId when id is omitted', () => {
    try {
      assertMakerCheckerApproval({ status: 'Posted', docType: 'JV' });
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as MakerCheckerError).txId).toBe('UNKNOWN');
    }
  });
});
