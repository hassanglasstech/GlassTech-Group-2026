-- ════════════════════════════════════════════════════════════════════════
-- NIPPON GO-LIVE — RLS Pre-Flight Verification
-- Run BEFORE seeding opening balances. Every row must report `OK`.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. RLS enabled + at least one policy on every Nippon-touched table ──
WITH targets AS (
  SELECT unnest(ARRAY[
    'clients',
    'products',
    'quotations',
    'invoices',
    'payment_receipts',
    'credit_notes',
    'store_items',
    'stock_ledger',
    'ledger',
    'accounts',
    'activity_logs'
  ]) AS tablename
)
SELECT
  t.tablename,
  COALESCE(c.rls_enabled, false)                                AS rls_enabled,
  COALESCE(p.policy_count, 0)                                   AS policy_count,
  CASE
    WHEN COALESCE(c.rls_enabled, false) = false           THEN 'FAIL — RLS off'
    WHEN COALESCE(p.policy_count, 0)    = 0               THEN 'FAIL — no policy'
    ELSE 'OK'
  END AS status
FROM targets t
LEFT JOIN (
  SELECT pc.relname AS tablename, pc.relrowsecurity AS rls_enabled
  FROM pg_class pc
  JOIN pg_namespace pn ON pc.relnamespace = pn.oid
  WHERE pn.nspname = 'public'
) c ON c.tablename = t.tablename
LEFT JOIN (
  SELECT tablename, COUNT(*) AS policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
  GROUP BY tablename
) p ON p.tablename = t.tablename
ORDER BY status, t.tablename;

-- ── 2. Cross-company leak check ─────────────────────────────────────────
-- Confirm a Nippon-tagged login can only see Nippon rows. Run while
-- impersonating a Nippon-only authenticated user (set local role first).
--
-- Expected: 0 rows from any company OTHER than Nippon.
/*
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"company":"Nippon","sub":"<nippon_user_uuid>"}';

SELECT 'quotations'   AS tbl, company, COUNT(*) AS visible FROM quotations    GROUP BY company
UNION ALL
SELECT 'invoices',          company, COUNT(*) FROM invoices         GROUP BY company
UNION ALL
SELECT 'clients',           company, COUNT(*) FROM clients          GROUP BY company
UNION ALL
SELECT 'store_items',       company, COUNT(*) FROM store_items      GROUP BY company
UNION ALL
SELECT 'ledger',            company, COUNT(*) FROM ledger           GROUP BY company
UNION ALL
SELECT 'payment_receipts',  company, COUNT(*) FROM payment_receipts GROUP BY company
ORDER BY tbl, company;

RESET role;
*/

-- ── 3. Spot-check Nippon COA exists (required by deliveryInvoiceService) ─
-- The accounts get JIT-created when the first invoice runs, but verify
-- that prior runs created the trading chain (codes 4120 + 5114 + 11514).
SELECT code, name, type
FROM accounts
WHERE company = 'Nippon'
  AND code IN ('4120', '5114', '11514', '12210', '21211')
ORDER BY code;
-- If empty, that's fine pre-go-live — they will be created on first invoice.
-- After go-live, all 5 codes should exist.

-- ── 4. Confirm GL balance trigger is active (migration 065) ─────────────
SELECT tgname, tgrelid::regclass AS table_name, tgenabled
FROM pg_trigger
WHERE tgname ILIKE '%gl_balance%'
   OR tgname ILIKE '%ledger_balance%'
ORDER BY tgname;
-- Expected: at least one trigger reports `tgenabled = 'O'` (enabled).
