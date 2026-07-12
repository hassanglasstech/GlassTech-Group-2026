-- ============================================================================
-- RBAC WRITE-LAYER, slice 1: owner → company-scoped + HR-table module gate
-- (2026-07-12). Founder applies in the Supabase SQL editor (MCP is read-only).
-- ============================================================================
-- Two live holes this closes (both verified via read-only MCP against prod):
--
--   ISSUE 1 — `owner` was a GLOBAL super. auth_user_is_super() returned true for
--   role IN ('super_admin','owner','hassan'), and every core table's RLS is
--   `is_super OR company-match`. So a Nippon-only owner (ammarsheikh569) could
--   INSERT/UPDATE/DELETE GTK & Glassco financial rows. FIX: owner leaves the
--   super set; it stays only super_admin/hassan (the true global bypass). Owners
--   keep FULL write inside their allowed_companies (they satisfy company-match),
--   they just can no longer cross the company boundary.
--
--   ISSUE 2 — no module/role gate below company: any authenticated user could
--   write any table in their company regardless of allowed_modules. FIX (this
--   slice): gate the HR-EXCLUSIVE tables (employees, attendance) on the 'hr'
--   module. These tables have a single writer module, so a module gate is safe
--   (no cross-module writer to break). Shared financial tables (ledger,
--   invoices, payment_receipts, accounts, quotations, store_items,
--   purchase_orders) are written by MULTIPLE modules (ledger ← sales/hr/
--   inventory/production) and are INTENTIONALLY left on company+super here; a
--   module gate on them needs a table→module mapping decision (follow-up).
--
-- LOCKOUT SAFETY (verified before writing):
--   * The only `is_super`-alone (no company fallback) policies are on 3 ORPHANED
--     legacy tables (employee_roles=0 rows, permissions/role_permissions seed
--     data not linked to any user). Owners losing write there is harmless.
--   * Founder hassanlatif1302 = super_admin (allowed_modules is EMPTY) → the
--     is_super() short-circuit keeps him fully unaffected.
--   * All 7 SECURITY DEFINER fns that call is_super (ar_aging, attendance_summary,
--     trial_balance, process_payment_receipt(_v2), update_piece_status_atomic,
--     enable_strict_company_rls) use is_super only to WIDEN scope, so owners keep
--     same-company behaviour and merely lose cross-company reach.
--
-- Idempotent: functions via CREATE OR REPLACE; policies via DROP IF EXISTS +
-- CREATE. A rollback block is at the bottom (commented).
-- ============================================================================

-- ── 1. auth_user_is_super(): drop 'owner' from the global bypass ─────────────
CREATE OR REPLACE FUNCTION public.auth_user_is_super()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role
    FROM user_profiles
   WHERE id = auth.uid();
  -- 'owner' REMOVED (2026-07-12): owner is a COMPANY admin (all modules within
  -- its allowed_companies), NOT a cross-company/global super. Only super_admin
  -- and hassan are the global bypass.
  RETURN v_role IN ('super_admin', 'hassan');
END $function$;

-- ── 2a. auth_user_is_company_admin(): owner = admin of its own company/ies ────
-- Used to let an owner write module-gated tables in its allowed_companies even
-- when its allowed_modules list does not include that module (owners administer
-- everything inside their company; super still short-circuits ahead of this).
CREATE OR REPLACE FUNCTION public.auth_user_is_company_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role
    FROM user_profiles
   WHERE id = auth.uid();
  RETURN v_role = 'owner';
END $function$;

-- ── 2b. auth_user_has_module(text): does the caller hold this module? ─────────
-- Normalises allowed_modules to jsonb regardless of stored type (text[] or
-- jsonb) — mirrors auth_user_companies(). Anon/service-role → false (they bypass
-- RLS anyway; a NULL uid must never satisfy a module claim).
CREATE OR REPLACE FUNCTION public.auth_user_has_module(p_module text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_json jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;
  SELECT to_jsonb(allowed_modules) INTO v_json
    FROM user_profiles
   WHERE id = v_uid;
  IF v_json IS NOT NULL AND jsonb_typeof(v_json) = 'array' THEN
    RETURN v_json ? p_module;   -- true if the array contains the module string
  END IF;
  RETURN false;
END $function$;

GRANT EXECUTE ON FUNCTION public.auth_user_is_company_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.auth_user_has_module(text)   TO authenticated, anon;

-- ── 3. Module-gate the HR-exclusive tables' WRITE policies ───────────────────
-- Pattern: is_super OR (company-match AND (company-admin OR has 'hr' module)).
-- SELECT policies are deliberately left unchanged (company+super) so read-only
-- dashboards that count staff cross-module keep working.

-- employees ------------------------------------------------------------------
DROP POLICY IF EXISTS employees_strict_insert ON public.employees;
CREATE POLICY employees_strict_insert ON public.employees
  FOR INSERT
  WITH CHECK (
    auth_user_is_super()
    OR (
      auth_user_companies() IS NOT NULL
      AND company = ANY (auth_user_companies())
      AND (auth_user_is_company_admin() OR auth_user_has_module('hr'))
    )
  );

DROP POLICY IF EXISTS employees_strict_update ON public.employees;
CREATE POLICY employees_strict_update ON public.employees
  FOR UPDATE
  USING (
    auth_user_is_super()
    OR (
      auth_user_companies() IS NOT NULL
      AND company = ANY (auth_user_companies())
      AND (auth_user_is_company_admin() OR auth_user_has_module('hr'))
    )
  )
  WITH CHECK (
    auth_user_is_super()
    OR (
      auth_user_companies() IS NOT NULL
      AND company = ANY (auth_user_companies())
      AND (auth_user_is_company_admin() OR auth_user_has_module('hr'))
    )
  );

DROP POLICY IF EXISTS employees_strict_delete ON public.employees;
CREATE POLICY employees_strict_delete ON public.employees
  FOR DELETE
  USING (
    auth_user_is_super()
    OR (
      auth_user_companies() IS NOT NULL
      AND company = ANY (auth_user_companies())
      AND (auth_user_is_company_admin() OR auth_user_has_module('hr'))
    )
  );

-- attendance -----------------------------------------------------------------
DROP POLICY IF EXISTS attendance_strict_insert ON public.attendance;
CREATE POLICY attendance_strict_insert ON public.attendance
  FOR INSERT
  WITH CHECK (
    auth_user_is_super()
    OR (
      auth_user_companies() IS NOT NULL
      AND company = ANY (auth_user_companies())
      AND (auth_user_is_company_admin() OR auth_user_has_module('hr'))
    )
  );

DROP POLICY IF EXISTS attendance_strict_update ON public.attendance;
CREATE POLICY attendance_strict_update ON public.attendance
  FOR UPDATE
  USING (
    auth_user_is_super()
    OR (
      auth_user_companies() IS NOT NULL
      AND company = ANY (auth_user_companies())
      AND (auth_user_is_company_admin() OR auth_user_has_module('hr'))
    )
  )
  WITH CHECK (
    auth_user_is_super()
    OR (
      auth_user_companies() IS NOT NULL
      AND company = ANY (auth_user_companies())
      AND (auth_user_is_company_admin() OR auth_user_has_module('hr'))
    )
  );

DROP POLICY IF EXISTS attendance_strict_delete ON public.attendance;
CREATE POLICY attendance_strict_delete ON public.attendance
  FOR DELETE
  USING (
    auth_user_is_super()
    OR (
      auth_user_companies() IS NOT NULL
      AND company = ANY (auth_user_companies())
      AND (auth_user_is_company_admin() OR auth_user_has_module('hr'))
    )
  );

-- ============================================================================
-- ROLLBACK (run only to revert this migration):
--
--   CREATE OR REPLACE FUNCTION public.auth_user_is_super() RETURNS boolean
--     LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
--   AS $$ DECLARE v_role TEXT; BEGIN
--     SELECT role INTO v_role FROM user_profiles WHERE id = auth.uid();
--     RETURN v_role IN ('super_admin','owner','hassan');
--   END $$;
--
--   -- then restore employees/attendance write policies to the plain
--   -- `is_super OR (company IS NOT NULL AND company = ANY(auth_user_companies()))`
--   -- form (drop the module AND-clause), and DROP the two new helper functions.
-- ============================================================================
