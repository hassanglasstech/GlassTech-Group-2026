-- ═══════════════════════════════════════════════════════════════════════
-- 100 — SECURITY batch 6b (audit 2026-07-11): pin search_path on all mutable functions
--   Finding M3: 46 public functions have a mutable search_path. For the 14
--   SECURITY DEFINER ones (incl. finance: _insert_ledger_row, post_invoice_atomic,
--   void_invoice_atomic, credit_note_atomic, post_grn_atomic; RLS helpers:
--   auth_user_companies, auth_user_is_super; and enable/disable_strict_company_rls),
--   a caller can set search_path before calling to shadow objects the function
--   references unqualified → search-path injection / privilege escalation.
--
-- Fix: pin every mutable public function to `search_path = public, pg_temp`.
--   • The live default is "$user", public → so `public` PRESERVES resolution of
--     the unqualified table refs these functions already use (pg_catalog is always
--     implicit for built-ins; auth.uid() etc. are fully qualified in the bodies).
--   • pg_temp listed LAST closes the temp-table-shadow vector.
--   • Caller can no longer influence the path.
-- Verified the RLS helpers only reference public.user_profiles + qualified auth.uid(),
-- so pinning them does not break policy evaluation.
--
-- Idempotent: skips functions that already have a search_path set (e.g. 094's
-- update_piece_status_atomic). Run in Supabase SQL editor.
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public'
      AND p.prokind = 'f'                                   -- normal + trigger functions
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) c
        WHERE c LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp;', r.sig);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'pinned search_path on % function(s)', n;
END $$;

-- ── Verify (optional) ──
-- SELECT count(*) AS still_mutable FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public' AND p.prokind='f'
--     AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}'::text[])) c WHERE c LIKE 'search_path=%');
--   -- expect 0
-- After applying, do ONE normal signed-in read in the app (e.g. open Sales) to confirm
-- RLS still resolves. If anything breaks, revert instantly:
--   ALTER FUNCTION public.auth_user_companies() RESET search_path;  -- (per function)
