-- ============================================================================
-- 089 — Soft-delete tombstones (God-mode audit #5)
-- ============================================================================
-- ⚠️  NOT YET APPLIED. Additive + reversible (DROP COLUMN). Apply manually in
--     the Supabase SQL editor. Pairs with the code change that (a) passes
--     `deleted_at` through the push mappers and (b) adds `.is('deleted_at', null)`
--     to pullTable so tombstoned rows are NOT re-hydrated.
--
-- WHY (audit #5, P0): SyncService push is upsert-only and pull re-hydrates the
--   whole table, so a row deleted locally (e.g. a VOIDED ledger entry) is
--   resurrected on the next pull. For the ledger this reintroduces voided
--   financial entries. A `deleted_at` tombstone that propagates through sync and
--   is filtered out on pull fixes this without a hard DELETE.
--
-- SCOPE THIS PASS: financial-critical tables only (the ones where resurrection
--   corrupts the books / AR). Column is NULLABLE, no default — every existing
--   row stays live (deleted_at IS NULL). The partial index keeps the new
--   `.is('deleted_at', null)` pull filter cheap.
--
-- RLS: unaffected — deleted_at is just another column; existing policies
--   (USING(true) / company-isolation from 000/011/014, or strict RLS from 086)
--   continue to apply. No data backfill needed.
--
-- PRE-APPLY: the live DB has diverged from migration files before — every
--   statement is IF NOT EXISTS / information_schema-guarded, safe to re-run.
-- ============================================================================

DO $$
DECLARE
  t text;
  financial_tables text[] := ARRAY[
    'ledger', 'petty_cash', 'invoices', 'payment_receipts',
    'credit_notes', 'quotations'
  ];
BEGIN
  FOREACH t IN ARRAY financial_tables LOOP
    -- only touch tables that actually exist in this (possibly diverged) instance
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_at timestamptz', t);
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS idx_%s_deleted_at ON public.%I (deleted_at) WHERE deleted_at IS NULL',
        t, t
      );
    ELSE
      RAISE NOTICE 'skip: table % not present in this instance', t;
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- VERIFY after applying: every listed table should now have a deleted_at column.
--   SELECT table_name FROM information_schema.columns
--   WHERE table_schema='public' AND column_name='deleted_at' ORDER BY table_name;
--
-- ROLLBACK (per table): ALTER TABLE public.<t> DROP COLUMN deleted_at;
-- ---------------------------------------------------------------------------
