-- ============================================================================
-- RBAC FIX: revert `accounts` write-gate to company-only. (2026-07-12)
-- Founder applies in the Supabase SQL editor (MCP is read-only).
-- ============================================================================
-- Slice 2 (090000) gated accounts writes on {accounts, hr}. A LIVE in-app
-- smoke-test (logged in as a sales-only user) proved this is TOO STRICT and
-- breaks real flows: the shared helper FinanceService.ensureAccount() lazily
-- creates COA sub-accounts (a new client's AR control, a payment method's
-- cash/bank node, GRN payables, salary sub-accounts, etc.) and is called from
-- EVERY posting module — sales (SalesOrders receipt/AR, delivery-invoice,
-- credit-note), procurement (GRN AP), production, hr (salary), finance (COA
-- seed). Each call runs as the acting user, so a sales user posting a receipt
-- for a new client got `new row violates row-level security policy for table
-- "accounts"` and the AR sub-account was never created — a real GL gap.
--
-- accounts is therefore a ledger-archetype table (written cross-module via a
-- shared lazy-COA helper), not a finance-owned one. Gating it by module is
-- unsafe. Direct COA EDITING (the ChartOfAccounts screen) is already gated
-- client-side by the finance-module nav; the DB keeps company scope as the
-- boundary. Revert to the plain company-only strict policies.
-- ============================================================================

DROP POLICY IF EXISTS accounts_strict_insert ON public.accounts;
CREATE POLICY accounts_strict_insert ON public.accounts
  FOR INSERT
  WITH CHECK (auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies()))));

DROP POLICY IF EXISTS accounts_strict_update ON public.accounts;
CREATE POLICY accounts_strict_update ON public.accounts
  FOR UPDATE
  USING (auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies()))))
  WITH CHECK (auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies()))));

DROP POLICY IF EXISTS accounts_strict_delete ON public.accounts;
CREATE POLICY accounts_strict_delete ON public.accounts
  FOR DELETE
  USING (auth_user_is_super() OR ((auth_user_companies() IS NOT NULL) AND (company = ANY (auth_user_companies()))));

-- NOTE: store_items / vendors / purchase_orders / production_pieces /
-- cutting_sessions / invoices / credit_notes / payment_receipts / clients /
-- employees / attendance module gates are UNCHANGED — their writer sets do not
-- go through a shared cross-module lazy-create helper the way accounts does.
