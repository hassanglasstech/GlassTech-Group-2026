-- ═══════════════════════════════════════════════════════════════════════
-- Migration 054 — Sprint 27: Strict Row-Level Security (opt-in switch)
--
-- Closes the cross-company data-bleed risk by providing real RLS
-- policies + a single switch to flip the whole database from
-- permissive (current state) to strict (production-grade).
--
-- This migration installs the infrastructure but does NOT enable strict
-- mode on any table by default. Hassan flips it per-table when:
--   1. Every Supabase query in the codebase has been verified to filter
--      by company (Sprint 21 RG already does this for new code paths)
--   2. user_profiles.allowed_companies is populated for every active user
--   3. Single-user go-live has stabilised (≥2 weeks no incidents)
--
-- ───────────────────────────────────────────────────────────────────────
-- USAGE
-- ───────────────────────────────────────────────────────────────────────
-- After applying this migration, run from SQL Editor:
--
--   -- Inspect what's currently strict vs permissive:
--   SELECT * FROM rls_status_summary();
--
--   -- Enable strict mode on a single table:
--   SELECT enable_strict_company_rls('clients');
--
--   -- Enable strict mode on a curated list (recommended order):
--   SELECT enable_strict_company_rls('clients');
--   SELECT enable_strict_company_rls('quotations');
--   SELECT enable_strict_company_rls('invoices');
--   SELECT enable_strict_company_rls('production_pieces');
--   -- … etc.
--
--   -- Roll back if anything breaks:
--   SELECT disable_strict_company_rls('clients');
--
-- The strict policy reads the caller's allowed_companies via the
-- auth_user_companies() helper. Service-role connections bypass RLS
-- as Postgres always does — Edge Functions stay unaffected.
--
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 1. Helper — return the calling user's allowed companies
--
-- Reads from user_profiles.allowed_companies (jsonb array). Falls back
-- to user_profiles.company (single value) if the array is missing.
-- Returns NULL for anon / service-role / unknown users.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auth_user_companies()
RETURNS TEXT[]
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_arr TEXT[];
  v_single TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;   -- anon / service-role bypasses RLS naturally
  END IF;

  -- Try allowed_companies jsonb array first
  SELECT ARRAY(
           SELECT jsonb_array_elements_text(allowed_companies)
         )
    INTO v_arr
    FROM user_profiles
   WHERE id = v_uid;

  IF v_arr IS NOT NULL AND array_length(v_arr, 1) > 0 THEN
    RETURN v_arr;
  END IF;

  -- Fallback: single company column
  SELECT company INTO v_single FROM user_profiles WHERE id = v_uid;
  IF v_single IS NOT NULL THEN
    RETURN ARRAY[v_single];
  END IF;

  RETURN NULL;
END $$;

GRANT EXECUTE ON FUNCTION auth_user_companies() TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Helper — current user is super-admin / owner / hassan?
--    These roles bypass company filter (cross-company access by design).
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auth_user_is_super()
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role
    FROM user_profiles
   WHERE id = auth.uid();
  RETURN v_role IN ('super_admin', 'owner', 'hassan');
END $$;

GRANT EXECUTE ON FUNCTION auth_user_is_super() TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 3. RPC — enable strict mode for one table (drop permissive, add strict)
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enable_strict_company_rls(p_table TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_company_col TEXT;
  v_pol TEXT;
BEGIN
  -- Verify table exists + has a `company` column
  SELECT column_name INTO v_company_col
    FROM information_schema.columns
   WHERE table_name = p_table AND column_name = 'company' LIMIT 1;

  IF v_company_col IS NULL THEN
    RETURN format('SKIP: %s has no company column', p_table);
  END IF;

  -- Enable RLS (idempotent)
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', p_table);

  -- Drop permissive policies if present (named patterns from migrations 011, 026, 044)
  FOR v_pol IN
    SELECT polname FROM pg_policy WHERE polrelid = format('public.%I', p_table)::regclass
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', v_pol, p_table);
  END LOOP;

  -- Strict SELECT — user's allowed_companies OR super
  EXECUTE format($f$
    CREATE POLICY %I ON %I FOR SELECT
      USING (
        auth_user_is_super()
        OR (auth_user_companies() IS NOT NULL
            AND company = ANY(auth_user_companies()))
      )
  $f$, p_table || '_strict_select', p_table);

  -- Strict INSERT — must insert with company in allowed list
  EXECUTE format($f$
    CREATE POLICY %I ON %I FOR INSERT
      WITH CHECK (
        auth_user_is_super()
        OR (auth_user_companies() IS NOT NULL
            AND company = ANY(auth_user_companies()))
      )
  $f$, p_table || '_strict_insert', p_table);

  -- Strict UPDATE — both old and new row must be in allowed list
  EXECUTE format($f$
    CREATE POLICY %I ON %I FOR UPDATE
      USING (
        auth_user_is_super()
        OR (auth_user_companies() IS NOT NULL
            AND company = ANY(auth_user_companies()))
      )
      WITH CHECK (
        auth_user_is_super()
        OR (auth_user_companies() IS NOT NULL
            AND company = ANY(auth_user_companies()))
      )
  $f$, p_table || '_strict_update', p_table);

  -- Strict DELETE — same as UPDATE USING
  EXECUTE format($f$
    CREATE POLICY %I ON %I FOR DELETE
      USING (
        auth_user_is_super()
        OR (auth_user_companies() IS NOT NULL
            AND company = ANY(auth_user_companies()))
      )
  $f$, p_table || '_strict_delete', p_table);

  RETURN format('OK: %s now strict (4 policies installed)', p_table);
END $$;

GRANT EXECUTE ON FUNCTION enable_strict_company_rls(TEXT) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 4. RPC — rollback to permissive (single table)
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION disable_strict_company_rls(p_table TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_pol TEXT;
BEGIN
  -- Drop our strict policies
  FOR v_pol IN
    SELECT polname FROM pg_policy
     WHERE polrelid = format('public.%I', p_table)::regclass
       AND polname LIKE '%_strict_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', v_pol, p_table);
  END LOOP;

  -- Re-install permissive policy so the table is still readable
  EXECUTE format($f$
    CREATE POLICY %I ON %I FOR ALL USING (true) WITH CHECK (true)
  $f$, p_table || '_permissive_rw', p_table);

  RETURN format('OK: %s reverted to permissive', p_table);
END $$;

GRANT EXECUTE ON FUNCTION disable_strict_company_rls(TEXT) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 5. Audit summary — quickly see what's strict vs permissive
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rls_status_summary()
RETURNS TABLE (
  tbl_name        TEXT,
  has_company_col BOOLEAN,
  rls_enabled     BOOLEAN,
  policy_count    INT,
  strict_count    INT,
  permissive_count INT
) LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.table_name::text                                        AS tbl_name,
    EXISTS (
      SELECT 1 FROM information_schema.columns ic
       WHERE ic.table_name = c.table_name AND ic.column_name = 'company'
    )                                                          AS has_company_col,
    t.relrowsecurity                                           AS rls_enabled,
    (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = t.oid) AS policy_count,
    (SELECT count(*)::int FROM pg_policy p
       WHERE p.polrelid = t.oid AND p.polname LIKE '%_strict_%') AS strict_count,
    (SELECT count(*)::int FROM pg_policy p
       WHERE p.polrelid = t.oid
         AND (p.polname LIKE '%_permissive%' OR p.polname LIKE '%_rw')) AS permissive_count
  FROM information_schema.tables c
  JOIN pg_class t ON t.relname = c.table_name
   AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  WHERE c.table_schema = 'public'
    AND c.table_type   = 'BASE TABLE'
  ORDER BY has_company_col DESC, c.table_name;
END $$;

GRANT EXECUTE ON FUNCTION rls_status_summary() TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 6. Bulk helpers — flip a curated list at once
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enable_strict_rls_recommended()
RETURNS TABLE(tbl_name TEXT, status TEXT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tables TEXT[] := ARRAY[
    'clients', 'quotations', 'invoices', 'credit_notes', 'payment_receipts',
    'customer_complaints', 'production_pieces', 'job_orders',
    'tempering_dispatches', 'dispatch_events', 'dispatch_photos',
    'customer_signatures', 'delivery_otps', 'sla_breaches',
    'driver_licenses', 'vehicle_locations',
    'requisitions', 'purchase_orders', 'vendors', 'store_items',
    'stock_ledger', 'ledger', 'accounts'
  ];
  v_t TEXT;
  v_status TEXT;
BEGIN
  FOREACH v_t IN ARRAY v_tables LOOP
    BEGIN
      v_status := enable_strict_company_rls(v_t);
    EXCEPTION WHEN OTHERS THEN
      v_status := 'ERROR: ' || SQLERRM;
    END;
    tbl_name := v_t; status := v_status; RETURN NEXT;
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION enable_strict_rls_recommended() TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 7. PostgREST schema reload
-- ─────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────
-- 8. Out-of-scope items (Supabase Dashboard config — NOT migration code)
-- ─────────────────────────────────────────────────────────────────────
-- The following Sprint 27 acceptance items live in the Supabase
-- Dashboard, not in SQL. Document them here for the runbook:
--
--   • Password policy:
--     Authentication → Policies → set min length 12 + require digit/upper/special
--   • Rate limiting:
--     Authentication → Rate Limits → 30 attempts / hour / IP (default safe)
--   • Email confirmations:
--     Authentication → Settings → Enable email confirmations
--   • JWT verification on Edge Functions:
--     Already enforced by `requireAuth(req)` in supabase/functions/_shared/auth.ts
--   • service_role key audit:
--     Vite excludes process.env.* server keys from the client bundle by default;
--     verify with: grep -r "service_role" dist/ → must return 0
--
-- ─────────────────────────────────────────────────────────────────────
-- 9. Verification
--
-- -- Inspect status:
-- SELECT * FROM rls_status_summary();
--
-- -- Enable on one table to test:
-- SELECT enable_strict_company_rls('clients');
--
-- -- Pen-test scenario (run as a Glassco-only user):
-- SELECT count(*) FROM clients WHERE company = 'GTI';   -- must return 0
--
-- -- If something breaks, revert:
-- SELECT disable_strict_company_rls('clients');
--
-- -- Bulk-enable when ready:
-- SELECT * FROM enable_strict_rls_recommended();
-- ═══════════════════════════════════════════════════════════════════════
