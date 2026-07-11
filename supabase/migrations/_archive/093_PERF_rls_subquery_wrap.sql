-- 093_PERF_rls_subquery_wrap.sql
-- ============================================================================
-- Fix the statement-timeout that 086 (strict RLS) introduced on read-heavy
-- tables (quotations, accounts, …) — which left the Sales Orders tab empty.
-- ============================================================================
-- Symptom (2026-07-04, after 086 applied): the app console shows
--   [Sync:quotations] canceling statement due to statement timeout
-- and `gtk_erp_quotations` never populates, so SalesOrders (and any full-table
-- read) is empty. `accounts` similarly deadlocks/times out.
--
-- Root cause: enable_strict_company_rls() (054) builds every policy's USING /
-- WITH CHECK clause calling the helpers DIRECTLY:
--     auth_user_is_super()
--     OR (auth_user_companies() IS NOT NULL AND company = ANY(auth_user_companies()))
-- Both helpers are STABLE, but in an RLS row-filter context Postgres re-invokes
-- them ONCE PER ROW (each call is a SELECT on user_profiles). The boot sync pull
-- does `select('*')` with no company filter, so for a super-admin the planner
-- scans the whole table and runs O(rows) subqueries → exceeds statement_timeout.
--
-- FIX: wrap each helper call in a scalar subquery — (SELECT auth_user_is_super())
-- and (SELECT auth_user_companies()). Postgres then evaluates each ONCE per query
-- as an InitPlan instead of per row. Identical rows are visible (no security or
-- behaviour change); only the query plan changes. This is the documented Supabase
-- RLS performance pattern. Plus company indexes so the non-super per-company
-- filter (and the app's .eq('company', …) reads) are index-driven.
--
-- Idempotent: CREATE OR REPLACE + re-apply; safe to run more than once.
-- ============================================================================

-- 1. Redefine the policy builder with subquery-wrapped (evaluate-once) auth calls
CREATE OR REPLACE FUNCTION enable_strict_company_rls(p_table TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_company_col TEXT;
  v_pol TEXT;
BEGIN
  SELECT column_name INTO v_company_col
    FROM information_schema.columns
   WHERE table_name = p_table AND column_name = 'company' LIMIT 1;
  IF v_company_col IS NULL THEN
    RETURN format('SKIP: %s has no company column', p_table);
  END IF;

  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', p_table);

  -- Drop any existing policies (permissive or prior strict) before re-creating
  FOR v_pol IN
    SELECT polname FROM pg_policy WHERE polrelid = format('public.%I', p_table)::regclass
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', v_pol, p_table);
  END LOOP;

  -- Strict SELECT — evaluate-once auth (InitPlan), not per row
  EXECUTE format($f$
    CREATE POLICY %I ON %I FOR SELECT
      USING (
        (SELECT auth_user_is_super())
        OR ((SELECT auth_user_companies()) IS NOT NULL
            AND company = ANY((SELECT auth_user_companies())))
      )
  $f$, p_table || '_strict_select', p_table);

  -- Strict INSERT
  EXECUTE format($f$
    CREATE POLICY %I ON %I FOR INSERT
      WITH CHECK (
        (SELECT auth_user_is_super())
        OR ((SELECT auth_user_companies()) IS NOT NULL
            AND company = ANY((SELECT auth_user_companies())))
      )
  $f$, p_table || '_strict_insert', p_table);

  -- Strict UPDATE (old + new row both in allowed list)
  EXECUTE format($f$
    CREATE POLICY %I ON %I FOR UPDATE
      USING (
        (SELECT auth_user_is_super())
        OR ((SELECT auth_user_companies()) IS NOT NULL
            AND company = ANY((SELECT auth_user_companies())))
      )
      WITH CHECK (
        (SELECT auth_user_is_super())
        OR ((SELECT auth_user_companies()) IS NOT NULL
            AND company = ANY((SELECT auth_user_companies())))
      )
  $f$, p_table || '_strict_update', p_table);

  -- Strict DELETE
  EXECUTE format($f$
    CREATE POLICY %I ON %I FOR DELETE
      USING (
        (SELECT auth_user_is_super())
        OR ((SELECT auth_user_companies()) IS NOT NULL
            AND company = ANY((SELECT auth_user_companies())))
      )
  $f$, p_table || '_strict_delete', p_table);

  RETURN format('OK: %s now strict + perf-optimized (4 policies)', p_table);
END $$;

GRANT EXECUTE ON FUNCTION enable_strict_company_rls(TEXT) TO authenticated, service_role;

-- 2. Re-apply to every table 086 covered (explicit list — guarantees the
--    optimized builder is used, independent of enable_strict_rls_recommended).
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clients','quotations','invoices','credit_notes','payment_receipts',
    'customer_complaints','production_pieces','job_orders','tempering_dispatches',
    'requisitions','purchase_orders','vendors','store_items','stock_ledger',
    'ledger','accounts','employees','attendance','payroll','loans','leave_applications'
  ] LOOP
    BEGIN
      PERFORM enable_strict_company_rls(t);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'skip % (%).', t, SQLERRM;
    END;
  END LOOP;
END $$;

-- 3. Company indexes — index-drive the per-company filter + the app's
--    .eq('company', …) reads (harmless if a table is missing; guarded).
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'quotations','clients','invoices','credit_notes','payment_receipts',
    'ledger','accounts','store_items','stock_ledger','production_pieces',
    'requisitions','purchase_orders','vendors','tempering_dispatches'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = t AND column_name = 'company') THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (company)',
                     'idx_' || t || '_company', t);
    END IF;
  END LOOP;
END $$;

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFY (after apply):
--   • App console: NO more "[Sync:quotations] canceling statement due to
--     statement timeout"; gtk_erp_quotations populates; SO tab shows orders.
--   • Cross-company isolation unchanged — a non-super user still sees only
--     their allowed_companies rows (the visible set is identical; only the plan
--     changed). Optional spot check:
--       EXPLAIN ANALYZE SELECT count(*) FROM quotations;   -- should be fast
-- ============================================================================
