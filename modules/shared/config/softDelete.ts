/**
 * Soft-delete tombstone feature flag (God-mode audit #5).
 *
 * PROBLEM (P0): SyncService push is upsert-only and pull re-hydrates the whole
 * table, so a row deleted locally (e.g. a VOIDED ledger entry) is resurrected on
 * the next pull. For the ledger this reintroduces voided financial entries — the
 * books silently un-correct themselves.
 *
 * FIX: a `deleted_at` tombstone that (a) rides through the push mapper and
 * (b) is filtered out on pull, so a tombstoned row is never re-hydrated. No hard
 * DELETE — the row is retained for audit but treated as gone by the app.
 *
 * WHY A FLAG: the code is INERT until the DB column exists. While this flag is
 * FALSE, sync behavior is byte-identical to before — no `deleted_at` is read or
 * written anywhere, so this is safe to ship BEFORE migration 089 is applied.
 *
 * GO-LIVE SEQUENCE (founder):
 *   1. Apply supabase/migrations/089_soft_delete_tombstones.sql to Supabase.
 *   2. Verify the column exists on every table in SOFT_DELETE_TABLES.
 *   3. Flip SOFT_DELETE_ENABLED to `true` and redeploy.
 * Flipping this to true BEFORE the migration is applied would make the
 * `.is('deleted_at', null)` pull filter throw (column does not exist).
 */
export const SOFT_DELETE_ENABLED = true;

/**
 * Financial-critical tables that carry a `deleted_at` tombstone column.
 * MUST stay in lockstep with migration 089_soft_delete_tombstones.sql.
 * These are the tables where a resurrected row corrupts the books / AR.
 */
export const SOFT_DELETE_TABLES: ReadonlySet<string> = new Set([
  'ledger',
  'petty_cash',
  'invoices',
  'payment_receipts',
  'credit_notes',
  'quotations',
]);
