-- ============================================================================
-- SECURITY: close the worst always-true RLS policies (2026-07-13)
-- Founder applies in the Supabase SQL editor (MCP is read-only).
-- ============================================================================
-- The re-grade flagged ~44 `authenticated USING(true)` policies. This migration
-- closes the four highest-value, lowest-lockout-risk ones. Each was a blanket
-- authenticated read/write that leaked or exposed cross-tenant / sensitive data.
--
-- Deliberately DEFERRED (need a call first, not blind-closed):
--   * vehicle_locations anon SELECT true — LiveDispatchMap.tsx reads it directly;
--     must first confirm whether that map is a public (anon) tracking page or an
--     internal authenticated monitor before removing anon read (else break it).
--   * the ~40 other always-true policies on lower-value tables (whatsapp_log,
--     saas_clients, agent_* memory, etc.) — a separate sweep.
--
-- Idempotent (DROP IF EXISTS + CREATE).
-- ============================================================================

-- ── 1. user_profiles: stop every authenticated user reading ALL profiles ─────
-- up_select_all USING(true) leaked every user's email + role + allowed_companies
-- + allowed_modules across all companies (the entire authorization map + PII).
-- A user needs their OWN profile (login/session); admins + super see all. (Note:
-- for a future multi-user rollout add a "same-company users" clause; for the
-- single-user go-live self+admin+super is correct.)
DROP POLICY IF EXISTS up_select_all ON public.user_profiles;
CREATE POLICY up_select_self_or_admin ON public.user_profiles
  FOR SELECT
  USING (id = auth.uid() OR current_user_is_group_admin() OR auth_user_is_super());

-- ── 2. erp_backups: full DB backups → super_admin only ───────────────────────
-- erp_backups_auth_rw = authenticated ALL true let any user read/write backup
-- metadata (a DR/admin surface). Restrict to super.
DROP POLICY IF EXISTS erp_backups_auth_rw ON public.erp_backups;
CREATE POLICY erp_backups_super_only ON public.erp_backups
  FOR ALL
  USING (auth_user_is_super())
  WITH CHECK (auth_user_is_super());

-- ── 3. gl_posting_rules_v2: reads stay open (GL posting needs them), writes → super
-- gl_posting_rules_v2_auth_rw = authenticated ALL true let any user rewrite the
-- GL posting-rule engine. Keep SELECT open (every module's posting reads the
-- rules) but lock writes to super.
DROP POLICY IF EXISTS gl_posting_rules_v2_auth_rw ON public.gl_posting_rules_v2;
CREATE POLICY gl_posting_rules_v2_select ON public.gl_posting_rules_v2
  FOR SELECT USING (true);
CREATE POLICY gl_posting_rules_v2_write_insert ON public.gl_posting_rules_v2
  FOR INSERT WITH CHECK (auth_user_is_super());
CREATE POLICY gl_posting_rules_v2_write_update ON public.gl_posting_rules_v2
  FOR UPDATE USING (auth_user_is_super()) WITH CHECK (auth_user_is_super());
CREATE POLICY gl_posting_rules_v2_write_delete ON public.gl_posting_rules_v2
  FOR DELETE USING (auth_user_is_super());

-- ── 4. employee_docs: scope to the employee's company (has no company column) ─
-- All four "Allow authenticated" policies were USING/CHECK true → any user could
-- read/update/DELETE any employee's HR documents across tenants. Scope via the
-- parent employees.company. Use a SECURITY DEFINER helper so the employees
-- lookup bypasses employees' OWN RLS (a nested-RLS subquery inside a policy can
-- return empty even for a legitimately-visible row); the caller's company set is
-- still evaluated via auth_user_companies() (auth.uid()-based).
CREATE OR REPLACE FUNCTION public.auth_can_access_employee(p_employee_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT auth_user_is_super()
      OR EXISTS (
        SELECT 1 FROM employees e
        WHERE e.id = p_employee_id
          AND auth_user_companies() IS NOT NULL
          AND e.company = ANY (auth_user_companies())
      );
$function$;

GRANT EXECUTE ON FUNCTION public.auth_can_access_employee(text) TO authenticated, anon;

DROP POLICY IF EXISTS "Allow authenticated read"   ON public.employee_docs;
DROP POLICY IF EXISTS "Allow authenticated insert" ON public.employee_docs;
DROP POLICY IF EXISTS "Allow authenticated update" ON public.employee_docs;
DROP POLICY IF EXISTS "Allow authenticated delete" ON public.employee_docs;

CREATE POLICY employee_docs_company_select ON public.employee_docs
  FOR SELECT USING (auth_can_access_employee(employee_id));
CREATE POLICY employee_docs_company_insert ON public.employee_docs
  FOR INSERT WITH CHECK (auth_can_access_employee(employee_id));
CREATE POLICY employee_docs_company_update ON public.employee_docs
  FOR UPDATE USING (auth_can_access_employee(employee_id)) WITH CHECK (auth_can_access_employee(employee_id));
CREATE POLICY employee_docs_company_delete ON public.employee_docs
  FOR DELETE USING (auth_can_access_employee(employee_id));
