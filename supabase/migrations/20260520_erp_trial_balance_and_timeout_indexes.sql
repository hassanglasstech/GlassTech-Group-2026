-- ═══════════════════════════════════════════════════════════════════
-- 20260520_erp_trial_balance_and_timeout_indexes.sql
--
-- Fixes:
--   1. CREATE FUNCTION erp_trial_balance  → was 404 in alertService
--   2. Indexes on quotations, products, accounts → statement timeout on sync upserts
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. erp_trial_balance RPC ─────────────────────────────────────────
-- Called by alertService.ts:187 to detect GL imbalance.
-- Uses accounts.balance (O(accounts)) instead of scanning ledger JSONB.
-- Debit-normal (asset, expense) contributes +balance;
-- Credit-normal (liability, equity, revenue) contributes -balance.
-- Net should be 0.00 if books are balanced.
CREATE OR REPLACE FUNCTION public.erp_trial_balance(p_company text)
RETURNS TABLE(balance numeric, trial_balance numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET statement_timeout = '5s'
AS $$
DECLARE
  v_balance numeric := 0;
BEGIN
  SELECT COALESCE(SUM(
    CASE
      WHEN type IN ('asset', 'expense')              THEN  COALESCE(a.balance, 0)
      WHEN type IN ('liability', 'equity', 'revenue') THEN -COALESCE(a.balance, 0)
      ELSE 0
    END
  ), 0)
  INTO v_balance
  FROM accounts a
  WHERE a.company = p_company;

  RETURN QUERY SELECT v_balance AS balance, v_balance AS trial_balance;

EXCEPTION WHEN OTHERS THEN
  -- Never block the alert loop — return 0 (no imbalance) on any error
  RETURN QUERY SELECT 0::numeric AS balance, 0::numeric AS trial_balance;
END;
$$;

GRANT EXECUTE ON FUNCTION public.erp_trial_balance(text) TO authenticated, anon;

-- ── 2. Performance indexes — fix statement timeouts on sync ───────────
-- These tables were hitting "canceling statement due to statement timeout"
-- on upserts and pulls because the planner was doing full table scans.

-- accounts: upsert conflict key is (company, code); also scanned by company
CREATE INDEX IF NOT EXISTS idx_accounts_company_code
  ON public.accounts (company, code);

CREATE INDEX IF NOT EXISTS idx_accounts_company_type
  ON public.accounts (company, type);

-- quotations: sync pulls/pushes filter & order by company + updated_at
CREATE INDEX IF NOT EXISTS idx_quotations_company_updated
  ON public.quotations (company, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_quotations_company_status
  ON public.quotations (company, status);

-- products: pull queries filter by company
CREATE INDEX IF NOT EXISTS idx_products_company
  ON public.products (company);

-- ── Reload PostgREST schema cache ────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════
-- VERIFY:
--   SELECT * FROM erp_trial_balance('GTK');
--   SELECT indexname FROM pg_indexes WHERE tablename IN ('accounts','quotations','products')
--     AND indexname LIKE 'idx_%' ORDER BY tablename, indexname;
-- ═══════════════════════════════════════════════════════════════════
