-- ═══════════════════════════════════════════════════════════════════════
-- Migration 044 — Sprint 4: Strict company-isolation RLS (OPT-IN)
--
-- ⚠ DO NOT APPLY THIS MIGRATION DURING SINGLE-USER GO-LIVE.
--
-- The current production setup uses migration 026's permissive RLS
-- (COALESCE fallback) so a missing user_profiles row doesn't lock
-- Hassan out of his own data. Hassan's CLAUDE.md explicitly says:
--   "RLS and RBAC are done — don't audit them."
--
-- This migration is provided for the future multi-user rollout
-- (Sprint 27). To enable, run the function `enable_strict_rls()` once
-- you have:
--   1. Verified every active user has a user_profiles row with
--      `allowed_companies` populated.
--   2. Acceptance-tested cross-company queries (must return 0 rows).
--   3. A rollback plan: `enable_permissive_rls()` reverts to migration 026.
--
-- Both functions are idempotent and safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════

-- Tables that should be company-isolated under strict RLS.
-- Kept in one place so the enable / revert functions stay in sync.
CREATE OR REPLACE FUNCTION _strict_rls_tables() RETURNS TEXT[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT ARRAY[
    'clients','quotations','invoices','payment_receipts','credit_notes',
    'customer_complaints','production_pieces','store_items',
    'requisitions','purchase_orders','vendors'
  ];
$$;

-- ─────────────────────────────────────────────────────────────────────
-- enable_strict_rls — replace permissive policies with strict ones.
--
-- Behaviour:
--   - For every table in `_strict_rls_tables()` that exists:
--     - Drop any existing `permissive_rw` / `company_rls` / `rls_single_owner_*`
--       policies created by migrations 011 / 014 / 026
--     - Create a single `company_strict` policy that requires the row's
--       company to be in the caller's `user_profiles.allowed_companies`
--   - No COALESCE fallback. Missing user_profiles row = no rows visible.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enable_strict_rls() RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  t TEXT;
  existed INT := 0;
BEGIN
  FOREACH t IN ARRAY _strict_rls_tables()
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema='public' AND table_name=t
    ) THEN CONTINUE; END IF;

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    -- Drop legacy permissive policies (idempotent)
    EXECUTE format('DROP POLICY IF EXISTS "permissive_rw" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "company_rls" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "rls_single_owner_%I" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "authenticated_access_%I" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "authenticated_read" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "company_strict" ON %I', t);

    EXECUTE format($f$
      CREATE POLICY "company_strict" ON %I FOR ALL TO authenticated
        USING (company = ANY(
          SELECT unnest(COALESCE(allowed_companies, ARRAY[]::TEXT[]))
            FROM user_profiles WHERE id = auth.uid()
        ))
        WITH CHECK (company = ANY(
          SELECT unnest(COALESCE(allowed_companies, ARRAY[]::TEXT[]))
            FROM user_profiles WHERE id = auth.uid()
        ))
    $f$, t);

    existed := existed + 1;
  END LOOP;

  RETURN format('Strict RLS enabled on %s tables. Verify cross-company isolation before continuing.', existed);
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- enable_permissive_rls — rollback. Restores migration 026 behaviour.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enable_permissive_rls() RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  t TEXT;
  reverted INT := 0;
BEGIN
  FOREACH t IN ARRAY _strict_rls_tables()
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema='public' AND table_name=t
    ) THEN CONTINUE; END IF;

    EXECUTE format('DROP POLICY IF EXISTS "company_strict" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "company_rls" ON %I', t);

    EXECUTE format($f$
      CREATE POLICY "company_rls" ON %I FOR ALL TO authenticated
        USING (
          company IS NULL
          OR company = COALESCE(
            (SELECT company FROM user_profiles WHERE id = auth.uid()),
            company
          )
        )
    $f$, t);

    reverted := reverted + 1;
  END LOOP;

  RETURN format('Permissive RLS restored on %s tables (migration 026 behaviour).', reverted);
END $$;

GRANT EXECUTE ON FUNCTION enable_strict_rls()     TO authenticated;
GRANT EXECUTE ON FUNCTION enable_permissive_rls() TO authenticated;

-- This file deliberately does NOT call enable_strict_rls() at apply
-- time. Run `SELECT enable_strict_rls()` from a Supabase SQL editor
-- when you're ready to flip the switch (Sprint 27 multi-user rollout).

NOTIFY pgrst, 'reload schema';
