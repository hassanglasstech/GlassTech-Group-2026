-- ═══════════════════════════════════════════════════════════════════════
-- 103 — PERF batch 5 (audit 2026-07-11): fix H6 (per-row auth.uid) + H7 (double policies)
--   in ONE safe move.
--
-- 84 tables carry TWO overlapping permissive FOR ALL policies:
--   • `company_isolation`  — EXISTS(SELECT 1 FROM user_profiles WHERE id = auth.uid() ...)
--       → calls auth.uid() DIRECTLY, re-evaluated PER ROW  ← the H6 culprit
--   • `<table>_company_scoped` — current_user_is_group_admin() OR (company = ANY(current_user_companies()))
--       → uses the STABLE helper functions; equivalent scoping (super OR company-match)
-- Postgres evaluates BOTH on every query (H7 = double cost).
--
-- Verified live: (a) all 84 have BOTH policies, (b) 0 tables have company_isolation
-- ALONE (so dropping it can never remove access), (c) both policies are FOR ALL on
-- every one of the 84 (so no command loses coverage). The two policies scope
-- identically, so the app sees the SAME rows — only the redundant per-row auth.uid()
-- policy is removed.
--
-- Fix: DROP the redundant `company_isolation` policy wherever a `*_company_scoped`
-- sibling exists. DROP-only → cannot break access. Clears both the H6 and H7 lints
-- for these 84 tables at once.
--
-- (One unrelated table still uses auth.uid() directly — user_profiles self-update —
--  left untouched here; it's a legitimate self-check and RLS on the profile table is
--  auth-critical.)
--
-- Idempotent. Run in Supabase SQL editor.
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT ci.tablename
    FROM pg_policies ci
    WHERE ci.schemaname = 'public' AND ci.policyname = 'company_isolation'
      AND EXISTS (
        SELECT 1 FROM pg_policies sc
        WHERE sc.schemaname = 'public' AND sc.tablename = ci.tablename
          AND sc.policyname LIKE '%\_company\_scoped'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS company_isolation ON public.%I;', r.tablename);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'dropped redundant company_isolation on % table(s)', n;
END $$;

-- ── Verify (optional) ──
-- SELECT count(*) AS remaining_company_isolation
--   FROM pg_policies WHERE schemaname='public' AND policyname='company_isolation';
--   -- expect only tables WITHOUT a *_company_scoped sibling (if any); the 84 are gone.
-- Then spot-check the app: open Sales (clients/quotations) as a signed-in user —
-- rows still load (the *_company_scoped policy scopes identically).
