-- ═══════════════════════════════════════════════════════════════════════
-- 099 — SECURITY batch 4 (audit 2026-07-11): stop cross-company leaks via views + dispatches
--   (v2 — idempotent; the first version failed because it tried to CREATE a
--    dispatches_company_scoped policy that already existed, and the Supabase editor
--    runs the whole script in ONE transaction, so that error rolled back Part A too.)
--
-- Part A (H4): 14 views were SECURITY DEFINER (run as creator → bypass caller RLS),
--   leaking every company's data — incl. financial views v_ar_aging / v_gl_pnl /
--   v_sales_analysis / v_project_profitability / v_stock_aging / v_ledger_imbalance_audit.
--   Switch each to security_invoker (super_admin still sees all via role check).
--
-- Part B (H5): `dispatches` ALREADY had a correct `company_isolation` policy (and a
--   `dispatches_company_scoped` one). The bug was an EXTRA always-true policy
--   `dispatches_auth_rw` (qual/with_check = true) that OR-ed past them, letting any
--   authenticated user read/write every company's dispatches. Just DROP it. (The two
--   remaining scoped policies are a redundant pair — Batch 5 dedupes them.)
--   The other 14 flagged always-true tables have NO company column (append-only logs /
--   system / dead tables) → nothing to scope; left as-is (see audit doc).
--
-- Idempotent. Run in Supabase SQL editor.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Part A — 14 SECURITY DEFINER views → security_invoker ──
DO $$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY ARRAY[
    'bypass_log_overdue','erp_snapshot_index','erp_snapshot_summary','v_alert_unread',
    'v_ar_aging','v_fbr_pending','v_gl_pnl','v_golive_latest','v_golive_summary',
    'v_ledger_imbalance_audit','v_perf_last24h','v_project_profitability',
    'v_sales_analysis','v_stock_aging'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname='public' AND c.relname=v AND c.relkind='v'
    ) THEN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true);', v);
      RAISE NOTICE 'security_invoker=true on view %', v;
    END IF;
  END LOOP;
END $$;

-- ── Part B — dispatches: drop ONLY the always-true policy (scoped policies already exist) ──
DROP POLICY IF EXISTS dispatches_auth_rw ON public.dispatches;

-- ── Verify (optional) ──
-- SELECT c.relname, (SELECT option_value FROM pg_options_to_table(c.reloptions)
--   WHERE option_name='security_invoker') AS invoker
--   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
--   WHERE n.nspname='public' AND c.relkind='v' AND c.relname LIKE 'v\_%' ESCAPE '\';  -- expect 'true'
-- SELECT policyname, qual FROM pg_policies WHERE tablename='dispatches';  -- no more 'true' policy
