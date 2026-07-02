// Contract test for the soft-delete tombstone flag (audit #5).
// Dependency-free: guards the flag default + the table set that MUST stay in
// lockstep with supabase/migrations/089_soft_delete_tombstones.sql. If the two
// drift, a tombstoned row on a table missing from one side gets resurrected.
import { describe, it, expect } from 'vitest';
import { SOFT_DELETE_ENABLED, SOFT_DELETE_TABLES } from '@/modules/shared/config/softDelete';

describe('softDelete config (audit #5)', () => {
  it('ships OFF by default — inert until migration 089 is applied', () => {
    // MUST be false at rest: flipping true before the DB column exists makes the
    // pull filter `.is(deleted_at, null)` throw. Founder flips this post-089.
    expect(SOFT_DELETE_ENABLED).toBe(false);
  });

  it('covers exactly the six financial-critical tables from migration 089', () => {
    const expected = [
      'credit_notes', 'invoices', 'ledger',
      'payment_receipts', 'petty_cash', 'quotations',
    ];
    expect([...SOFT_DELETE_TABLES].sort()).toEqual(expected);
  });

  it('includes the ledger — the table where resurrection corrupts the books', () => {
    expect(SOFT_DELETE_TABLES.has('ledger')).toBe(true);
  });
});
