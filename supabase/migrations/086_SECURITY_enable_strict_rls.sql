-- ============================================================================
-- 086 — SECURITY P0 #2: actually ENABLE strict per-company RLS
-- ============================================================================
-- ⚠️  NOT YET APPLIED. Apply manually in the Supabase SQL editor AFTER 085
--     (anon-write revoke) is in and the app has been smoke-tested logged-in.
--
-- WHY: the strict-RLS machinery was WRITTEN in migrations 044 + 054
--      (auth_user_companies() reads user_profiles.allowed_companies jsonb —
--      multitenant-correct; super_admin/owner/hassan bypass) but was NEVER
--      CALLED. The live DB still runs permissive USING(true) policies, so any
--      authenticated user can read every company's rows. This migration flips
--      the switch.
--
-- PREREQUISITE: migration 054 must be applied (functions
--   enable_strict_company_rls / enable_strict_rls_recommended / rls_status_summary
--   must exist). The DO-block below fails loudly with instructions if not.
--
-- WHAT THIS DOES:
--   1. Verifies the 054 machinery exists.
--   2. Bulk-enables strict company RLS on the 23 recommended business tables
--      (clients, quotations, invoices, ledger, accounts, store_items, …).
--   3. ALSO enables it on the HR-sensitive tables the recommended list missed:
--      employees, attendance, payroll, loans, leave_applications
--      (payroll/HR data is exactly what must never leak cross-company).
--
-- AFTER APPLYING — VERIFY (run each):
--   SELECT * FROM rls_status_summary();          -- strict_count > 0 on targets
--   -- Pen-test as a single-company (NON-super) user in the app:
--   --   switch company → other company's clients/ledger must show 0 rows.
--
-- ROLLBACK (per table, if something breaks):
--   SELECT disable_strict_company_rls('<table>');
-- ============================================================================

-- 1. Guard: 054 machinery must exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'enable_strict_rls_recommended'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'enable_strict_company_rls'
  ) THEN
    RAISE EXCEPTION
      'Missing strict-RLS functions. Apply migration 054_sprint27_strict_rls.sql (and 044) FIRST, then re-run this file.';
  END IF;
END $$;

-- 2. Bulk-enable on the recommended business tables (23 tables)
SELECT * FROM enable_strict_rls_recommended();

-- 3. HR-sensitive tables missing from the recommended list
SELECT enable_strict_company_rls('employees');
SELECT enable_strict_company_rls('attendance');
SELECT enable_strict_company_rls('payroll');
SELECT enable_strict_company_rls('loans');
SELECT enable_strict_company_rls('leave_applications');

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- VERIFY: strict policies present, permissive gone, on every target table
-- ---------------------------------------------------------------------------
SELECT * FROM rls_status_summary()
WHERE tbl_name IN (
  'clients','quotations','invoices','credit_notes','payment_receipts',
  'customer_complaints','production_pieces','job_orders','tempering_dispatches',
  'requisitions','purchase_orders','vendors','store_items','stock_ledger',
  'ledger','accounts','employees','attendance','payroll','loans','leave_applications'
);
