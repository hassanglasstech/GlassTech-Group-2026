-- ═══════════════════════════════════════════════════════════════════════
-- Migration 068 — Phase 0 (God Mode audit fix): RLS Tighten — Inventory
--
-- The God Mode pre-go-live audit (Nippon week) found that migrations
-- 20260432_procurement_gaps.sql / 20260433_stock_ledger_ledger_cols.sql /
-- 20260434_opening_balance_persistence_fix.sql / 20260421_products_missing_columns.sql
-- 20260429_comprehensive_schema_fixes.sql had re-opened anon write
-- access to inventory tables — the same `GRANT ALL ... TO anon` /
-- `FOR ALL TO anon USING (true)` pattern that migration 064 closed on
-- financial tables.
--
-- Plain English: anyone with the anon key (which ships in the public
-- JS bundle) could DELETE every Nippon product, wipe the stock ledger,
-- forge GRN rows, etc. via a direct REST call.
--
-- This migration closes that attack surface on PROCUREMENT / INVENTORY
-- tables. Operational tables that the realtime cross-device sync
-- requires (production_pieces, gate_passes, vehicle_trips) are
-- deliberately NOT touched — they're handled elsewhere.
--
-- Strategy (mirrors migration 064):
--   1. Drop every `*_anon_rw`, `*_anon`, `anon_*`, `*_open`, `*_anon_all`,
--      `*_allow_all` policy on the target tables (idempotent — IF EXISTS).
--   2. REVOKE INSERT/UPDATE/DELETE FROM anon on those tables.
--   3. Re-grant SELECT to anon ONLY on `vendors_public` /
--      `v_alert_unread` style views if the UI needs them pre-login
--      (none currently for inventory — anon SELECT not re-granted).
--
-- After this migration, an attacker with just the anon key cannot:
--   • DELETE the 152 Nippon products
--   • INSERT phantom stock_ledger rows (fake inventory)
--   • Tamper with vendor master (re-route AP)
--   • Forge GRN sheet entries
--   • Modify requisitions / purchase orders
--   • Modify the ledger (already closed by 064, kept here belt-and-braces)
--
-- A LOGGED-IN user (authenticated role) is unaffected because the
-- `*_rw` (authenticated FOR ALL USING (true)) policies are preserved.
-- Single-user go-live continues to work unchanged.
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  t TEXT;
  tables_to_lock TEXT[] := ARRAY[
    -- Master data
    'products', 'vendors',
    -- Stock state
    'store_items', 'stock_ledger', 'material_ledger',
    'stock_locations', 'pallet_rates',
    -- Procurement transactions
    'requisitions', 'purchase_orders', 'purchase_returns',
    'grn', 'goods_receipts', 'grn_sheet_entries',
    'inspection_lots',
    -- Opening balance / cutover support
    'opening_balances',
    -- Weight & tools (Glassco-specific but same anon-write hole)
    'weight_master', 'tool_register',
    -- Reserved stock / RPCs use these
    'stock_reservations',
    -- Belt-and-braces (covered by 064 but harmless to repeat)
    'ledger'
  ];
BEGIN
  FOREACH t IN ARRAY tables_to_lock LOOP
    -- Skip if table doesn't exist (some are optional / future)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      RAISE NOTICE 'Skipping %: table does not exist', t;
      CONTINUE;
    END IF;

    -- Drop every known anon FOR ALL policy naming pattern
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_anon_rw',    t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_anon',       t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'anon_' || t,       t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_open',       t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_anon_all',   t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_allow_all',  t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'allow_all',        t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'allow_all_' || t,  t);

    -- Belt-and-braces: revoke write privileges from anon role
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON %I FROM anon', t);

    -- Sequence revoke — only if a BIGSERIAL exists for the table
    IF EXISTS (
      SELECT 1 FROM pg_class
      WHERE relkind = 'S' AND relname = t || '_id_seq'
    ) THEN
      EXECUTE format('REVOKE USAGE, UPDATE ON SEQUENCE %I FROM anon', t || '_id_seq');
    END IF;

    RAISE NOTICE '✓ Locked anon writes on %', t;
  END LOOP;
END$$;

-- ── Ensure authenticated still has a working RW policy on each table ──
-- (Defensive: if the original anon policy WAS the only one, dropping it
--  would lock everyone out. Re-create the authenticated RW policy if
--  none exists.)
DO $$
DECLARE
  t TEXT;
  pol_count INT;
  tables_to_verify TEXT[] := ARRAY[
    'products', 'vendors', 'store_items', 'stock_ledger',
    'requisitions', 'purchase_orders', 'grn_sheet_entries', 'ledger'
  ];
BEGIN
  FOREACH t IN ARRAY tables_to_verify LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      CONTINUE;
    END IF;

    SELECT COUNT(*) INTO pol_count
    FROM pg_policies
    WHERE tablename = t AND schemaname = 'public'
      AND 'authenticated' = ANY(roles);

    IF pol_count = 0 THEN
      RAISE NOTICE 'Re-creating authenticated RW policy on % (was missing)', t;
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        t || '_rw', t
      );
    END IF;
  END LOOP;
END$$;

-- ── Final sanity warning ──
-- If any verification table is left with ZERO policies, authenticated
-- users will be locked out. Log a warning so Hassan can review.
DO $$
DECLARE
  t TEXT;
  pol_count INT;
  tables_to_warn TEXT[] := ARRAY[
    'products', 'vendors', 'store_items', 'stock_ledger',
    'requisitions', 'purchase_orders', 'grn_sheet_entries'
  ];
BEGIN
  FOREACH t IN ARRAY tables_to_warn LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t) THEN
      CONTINUE;
    END IF;
    SELECT COUNT(*) INTO pol_count
    FROM pg_policies WHERE tablename = t AND schemaname = 'public';
    IF pol_count = 0 THEN
      RAISE WARNING 'Table % has ZERO policies after RLS tighten — users locked out!', t;
    END IF;
  END LOOP;
END$$;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES — run in Supabase SQL editor after migration:
--
-- 1. Confirm anon has NO write privileges on inventory tables:
-- SELECT table_name, privilege_type
--   FROM information_schema.role_table_grants
--  WHERE grantee = 'anon'
--    AND table_name IN (
--      'products', 'vendors', 'store_items', 'stock_ledger',
--      'requisitions', 'purchase_orders', 'grn_sheet_entries',
--      'inspection_lots', 'ledger', 'opening_balances'
--    )
--    AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
--  ORDER BY table_name, privilege_type;
-- → expected: 0 rows
--
-- 2. Confirm anon FOR ALL policies are gone:
-- SELECT tablename, policyname, cmd, roles
--   FROM pg_policies
--  WHERE schemaname = 'public'
--    AND 'anon' = ANY(roles)
--    AND tablename IN (
--      'products', 'vendors', 'store_items', 'stock_ledger',
--      'requisitions', 'purchase_orders', 'grn_sheet_entries'
--    )
--    AND cmd = 'ALL';
-- → expected: 0 rows
--
-- 3. Confirm authenticated still has RW policies:
-- SELECT tablename, COUNT(*) AS pol_count
--   FROM pg_policies
--  WHERE schemaname = 'public'
--    AND 'authenticated' = ANY(roles)
--    AND tablename IN (
--      'products', 'vendors', 'store_items', 'stock_ledger',
--      'requisitions', 'purchase_orders', 'grn_sheet_entries'
--    )
--  GROUP BY tablename
--  ORDER BY tablename;
-- → expected: every table has at least 1 row
--
-- 4. End-to-end smoke test (Hassan in browser as authenticated user):
--    • Open Nippon → Inventory → Material Master → load page (SELECT works)
--    • Add a new product via NipponProductMaster (INSERT works)
--    • Edit a product (UPDATE works)
--    If any step fails with "row violates row-level security policy"
--    → check pg_policies for that table, ensure authenticated policy exists.
-- ═══════════════════════════════════════════════════════════════════════
