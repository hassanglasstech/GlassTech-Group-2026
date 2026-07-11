-- ═══════════════════════════════════════════════════════════════════════
-- 096 — SECURITY batch 1 (audit 2026-07-11): close the anon/unauthenticated holes
--   Findings addressed: C1 (30 SECURITY DEFINER funcs anon-callable) + C2/H3
--   (RLS disabled on tables that already have policies).
--
-- SAFE TO RUN: the app authenticates every real user, so revoking `anon`/`PUBLIC`
-- EXECUTE and enabling RLS (whose policies are `authenticated`-scoped) does NOT
-- break the app — it only blocks the anonymous key. Driver-portal RPCs
-- (get_dispatch_for_driver, verify_delivery_otp, complete_pod, add_pod_photo,
-- add_signature, ensure_driver_token, check_geofence_arrival,
-- record_vehicle_location) and RLS-helper funcs (auth_user_companies, etc.) are
-- intentionally NOT touched so the no-login driver portal + policy evaluation
-- keep working.
--
-- Run in Supabase SQL editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Part A (C1) — revoke anon/PUBLIC EXECUTE on privileged admin/finance RPCs ──
-- Loop over the exact overloads so no signature is mistyped. `authenticated`
-- keeps EXECUTE (the app calls these signed-in).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN (
      'disable_strict_company_rls','enable_strict_company_rls','enable_strict_rls_recommended',
      'process_payment_receipt','record_three_way_match',
      'erp_trial_balance','trial_balance','ar_aging','erp_snapshot','attendance_summary',
      'authorize_dispatch','load_pieces_to_dispatch_atomic','update_piece_status_atomic',
      'user_profiles_block_self_escalation','protect_hassan_from_delete',
      'log_sla_breach','allocate_serial','append_dispatch_event'
    )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, PUBLIC;', r.sig);
    RAISE NOTICE 'revoked anon/PUBLIC EXECUTE on %', r.sig;
  END LOOP;
END $$;

-- ── Part B (C2/H3) — enable RLS on the 4 tables that already have policies ──
-- These have full authenticated CRUD policies today but RLS was OFF, so the
-- policies were inert and anon had full access. Enabling activates the existing
-- policies and blocks anon. (Any-authenticated WRITE on the authz tables —
-- permissions/role_permissions/employee_roles — is a separate escalation risk
-- tightened in 097.)
ALTER TABLE public.employee_docs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_roles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- ── Verify (optional — run separately, expect the noted results) ──
-- SELECT proname, has_function_privilege('anon', oid, 'EXECUTE') AS anon_can
--   FROM pg_proc WHERE proname IN ('process_payment_receipt','disable_strict_company_rls','erp_trial_balance');
--   -- expect anon_can = false for all
-- SELECT relname, relrowsecurity FROM pg_class
--   WHERE relname IN ('employee_docs','employee_roles','permissions','role_permissions');
--   -- expect relrowsecurity = true for all
