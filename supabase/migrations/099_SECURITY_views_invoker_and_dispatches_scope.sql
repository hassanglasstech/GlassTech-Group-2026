-- ═══════════════════════════════════════════════════════════════════════
-- 099 — SECURITY batch 4 (audit 2026-07-11): stop cross-company leaks via views + dispatches
--
-- Part A (H4): 14 views were SECURITY DEFINER (run as creator → bypass the querying
--   user's RLS), so any user who could read them saw EVERY company's data — including
--   financial views v_ar_aging / v_gl_pnl / v_sales_analysis / v_project_profitability /
--   v_stock_aging / v_ledger_imbalance_audit. Switch each to security_invoker so they
--   run under the caller's RLS (super_admin still sees all via auth_user_is_super()).
--
-- Part B (H5): of the 15 "WITH CHECK (true)" write policies flagged, only `dispatches`
--   has a real `company` column — the other 14 (access_logs, purchase_orders [company
--   lives in jsonb], gl_posting_rules_v2 [dead/empty], and the *_log / system tables)
--   have NO company column, so there is nothing to scope and they are left as-is (logs
--   are append-only, low-risk; see the audit doc). Company-scope `dispatches` using the
--   exact idiom already proven on `accounts`.
--
-- Requires the RLS array helpers (auth_user_is_super / auth_user_companies) — present.
-- Run in Supabase SQL editor. Idempotent.
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

-- ── Part B — dispatches: replace the always-true ALL policy with a company-scoped one ──
-- (Same expression as the working accounts policies. super_admin/owner/hassan keep full
--  access; everyone else is scoped to their allowed_companies for BOTH read and write.)
DROP POLICY IF EXISTS dispatches_auth_rw ON public.dispatches;
CREATE POLICY dispatches_company_scoped ON public.dispatches FOR ALL TO authenticated
  USING (
    auth_user_is_super()
    OR (auth_user_companies() IS NOT NULL AND company = ANY (auth_user_companies()))
  )
  WITH CHECK (
    auth_user_is_super()
    OR (auth_user_companies() IS NOT NULL AND company = ANY (auth_user_companies()))
  );

-- ── Verify (optional) ──
-- SELECT c.relname, (SELECT option_value FROM pg_options_to_table(c.reloptions)
--   WHERE option_name='security_invoker') AS invoker
--   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
--   WHERE n.nspname='public' AND c.relname LIKE 'v\_%' ESCAPE '\';   -- expect 'true'
-- SELECT policyname, cmd, qual FROM pg_policies WHERE tablename='dispatches';
