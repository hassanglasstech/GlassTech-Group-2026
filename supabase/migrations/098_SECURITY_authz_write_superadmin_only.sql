-- ═══════════════════════════════════════════════════════════════════════
-- 098 — SECURITY batch 3 (audit 2026-07-11): lock authz-table WRITES to super-admins
--   Finding: permissions / role_permissions / employee_roles had INSERT/UPDATE/DELETE
--   policies with `WITH CHECK (true)` / `USING (true)` for the `authenticated` role —
--   so ANY signed-in user could rewrite the RBAC config and self-escalate to admin.
--
-- Option A (chosen): restrict writes to the system "super" set — super_admin / owner /
-- hassan — via public.auth_user_is_super() (STABLE SECURITY DEFINER, reads user_profiles).
-- SELECT stays open to `authenticated` so the app can still read roles/permissions.
-- The helper is wrapped in (select …) so it's evaluated once per query (initplan),
-- not per row.
--
-- ⚠ Effect: users NOT in {super_admin, owner, hassan} (e.g. admin_officer) can no
-- longer INSERT/UPDATE/DELETE these tables. RLS must already be enabled (migration 096).
-- Run in Supabase SQL editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════

-- ── permissions ──
DROP POLICY IF EXISTS permissions_insert ON public.permissions;
DROP POLICY IF EXISTS permissions_update ON public.permissions;
DROP POLICY IF EXISTS permissions_delete ON public.permissions;
CREATE POLICY permissions_insert ON public.permissions FOR INSERT TO authenticated
  WITH CHECK ((select public.auth_user_is_super()));
CREATE POLICY permissions_update ON public.permissions FOR UPDATE TO authenticated
  USING ((select public.auth_user_is_super())) WITH CHECK ((select public.auth_user_is_super()));
CREATE POLICY permissions_delete ON public.permissions FOR DELETE TO authenticated
  USING ((select public.auth_user_is_super()));

-- ── role_permissions ──
DROP POLICY IF EXISTS role_permissions_insert ON public.role_permissions;
DROP POLICY IF EXISTS role_permissions_update ON public.role_permissions;
DROP POLICY IF EXISTS role_permissions_delete ON public.role_permissions;
CREATE POLICY role_permissions_insert ON public.role_permissions FOR INSERT TO authenticated
  WITH CHECK ((select public.auth_user_is_super()));
CREATE POLICY role_permissions_update ON public.role_permissions FOR UPDATE TO authenticated
  USING ((select public.auth_user_is_super())) WITH CHECK ((select public.auth_user_is_super()));
CREATE POLICY role_permissions_delete ON public.role_permissions FOR DELETE TO authenticated
  USING ((select public.auth_user_is_super()));

-- ── employee_roles ──
DROP POLICY IF EXISTS employee_roles_insert ON public.employee_roles;
DROP POLICY IF EXISTS employee_roles_update ON public.employee_roles;
DROP POLICY IF EXISTS employee_roles_delete ON public.employee_roles;
CREATE POLICY employee_roles_insert ON public.employee_roles FOR INSERT TO authenticated
  WITH CHECK ((select public.auth_user_is_super()));
CREATE POLICY employee_roles_update ON public.employee_roles FOR UPDATE TO authenticated
  USING ((select public.auth_user_is_super())) WITH CHECK ((select public.auth_user_is_super()));
CREATE POLICY employee_roles_delete ON public.employee_roles FOR DELETE TO authenticated
  USING ((select public.auth_user_is_super()));

-- ── Verify (optional) ──
-- SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies
--   WHERE schemaname='public' AND tablename IN ('permissions','role_permissions','employee_roles')
--   ORDER BY tablename, cmd;
--   -- write policies should now show auth_user_is_super(); SELECT should still be `true`.
