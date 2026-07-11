-- ============================================================================
-- Close live cross-company / privilege-escalation holes (God-mode audit P0 #10)
-- 2026-07-12 — prerequisite hardening BEFORE any role-based write layer.
-- ============================================================================
-- Discovery (RBAC workflow) found 3 live holes + 1 flaw that make table-level
-- RLS moot until closed. All fixes below ADD guards / remove backdoors — no
-- legitimate user is newly restricted, so lockout risk is ~zero.
--
--   A) disable_strict_company_rls / enable_* : SECURITY DEFINER admin helpers
--      were EXECUTE-able by ANY authenticated user. disable_strict_company_rls
--      drops a table's strict policies and installs a permissive USING(true) one
--      — a one-call RLS kill-switch usable by the lowest-privileged account.
--      The app never calls these (grep: 0 hits), so REVOKE EXECUTE from
--      anon+authenticated. Admins run them from the SQL editor / service role
--      (which connect as postgres and bypass these grants).
--   B) purchase_orders had a single policy purchase_orders_rw = USING(true)
--      WITH CHECK(true): every authenticated user could CRUD every company's POs.
--      Its company column is `from_company` (not `company`), which is why
--      enable_strict_company_rls silently SKIPs it. Install explicit strict
--      policies keyed on from_company.
--   C) update_piece_status_atomic (SECURITY DEFINER) had NO company/role guard —
--      any authenticated user could change ANY company's piece status, bypassing
--      the production_pieces strict policy. Add an in-function company guard.
--   D) process_payment_receipt_v2 / process_payment_receipt resolved caller
--      company via the singular user_profiles.company column and SKIPPED the
--      cross-company check when it was NULL (true for multi-company users).
--      Replace with the array-aware auth_user_companies() + auth_user_is_super()
--      check used everywhere else (no NULL-skip hole).
--
-- SAFE TO APPLY. Idempotent (REVOKE / CREATE OR REPLACE / DROP POLICY IF EXISTS).
-- ============================================================================


-- ── A) Lock down the RLS admin / kill-switch helpers ────────────────────────
REVOKE EXECUTE ON FUNCTION public.disable_strict_company_rls(text)      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enable_strict_company_rls(text)       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enable_strict_rls_recommended()       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enable_permissive_rls()               FROM PUBLIC, anon, authenticated;


-- ── B) purchase_orders — strict company isolation on from_company ───────────
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS purchase_orders_rw            ON public.purchase_orders;
DROP POLICY IF EXISTS purchase_orders_strict_select ON public.purchase_orders;
DROP POLICY IF EXISTS purchase_orders_strict_insert ON public.purchase_orders;
DROP POLICY IF EXISTS purchase_orders_strict_update ON public.purchase_orders;
DROP POLICY IF EXISTS purchase_orders_strict_delete ON public.purchase_orders;

CREATE POLICY purchase_orders_strict_select ON public.purchase_orders FOR SELECT
  USING (
    auth_user_is_super()
    OR (auth_user_companies() IS NOT NULL
        AND from_company = ANY(auth_user_companies()))
  );
CREATE POLICY purchase_orders_strict_insert ON public.purchase_orders FOR INSERT
  WITH CHECK (
    auth_user_is_super()
    OR (auth_user_companies() IS NOT NULL
        AND from_company = ANY(auth_user_companies()))
  );
CREATE POLICY purchase_orders_strict_update ON public.purchase_orders FOR UPDATE
  USING (
    auth_user_is_super()
    OR (auth_user_companies() IS NOT NULL
        AND from_company = ANY(auth_user_companies()))
  )
  WITH CHECK (
    auth_user_is_super()
    OR (auth_user_companies() IS NOT NULL
        AND from_company = ANY(auth_user_companies()))
  );
CREATE POLICY purchase_orders_strict_delete ON public.purchase_orders FOR DELETE
  USING (
    auth_user_is_super()
    OR (auth_user_companies() IS NOT NULL
        AND from_company = ANY(auth_user_companies()))
  );

