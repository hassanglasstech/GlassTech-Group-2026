-- ═══════════════════════════════════════════════════════════════════════
-- Migration 064 — Phase 0 (Brutal Report fix #2): RLS Tighten
--
-- The brutal pre-go-live audit found 35 of 140 RLS policies were
-- `USING (true) WITH CHECK (true)` for the `anon` role on financial
-- tables — meaning anyone with the anon key (which ships in the public
-- JS bundle) could DELETE invoices, payment_receipts, audit logs, etc.
-- via direct REST calls.
--
-- This migration closes that attack surface for FINANCIAL + AUDIT
-- tables only. Operational tables (production_pieces, vehicle_trips,
-- gate_passes, etc.) are deliberately untouched because:
--   • Public driver-POD page (#/driver/:tripId) needs anon read+write
--   • Realtime cross-device sync of production state needs anon access
--     until proper auth handoff is implemented
--
-- Strategy:
--   1. Drop every `*_anon_rw` and any `FOR ALL TO anon` policy on the
--      target tables (idempotent — uses IF EXISTS).
--   2. REVOKE INSERT/UPDATE/DELETE FROM anon on those tables.
--   3. For tables that legitimately need anon SELECT (e.g.
--      v_alert_unread bell-badge counter), GRANT SELECT only.
--
-- After this migration, an attacker with just the anon key cannot:
--   • Delete an invoice
--   • Forge a payment receipt
--   • Wipe the audit log
--   • Modify period locks
--   • Tamper with go-live readiness check history
--
-- A LOGGED-IN user (authenticated role with valid JWT) is unaffected
-- because all `*_rw` (authenticated FOR ALL USING (true)) policies are
-- preserved. Single-user mode continues to work.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Target tables: financial / audit / config ────────────────────────
-- Each row: drop anon policy + revoke writes + (optional) grant anon select
DO $$
DECLARE
  t TEXT;
  tables_to_lock TEXT[] := ARRAY[
    -- Financial source-of-truth
    'invoices', 'sales_invoices', 'payment_receipts', 'credit_notes',
    'ledger', 'accounts', 'cost_centers', 'petty_cash',
    'recurring_expenses', 'financial_events', 'quotations',
    -- HR / Payroll
    'payroll', 'loans', 'employees', 'attendance', 'employee_docs',
    -- Audit / compliance
    'activity_logs', 'audit_log',
    -- Period control
    'period_locks',
    -- Sprint 33-36 admin tables
    'company_branding', 'alert_thresholds', 'erp_alerts',
    'golive_checks', 'perf_telemetry'
  ];
BEGIN
  FOREACH t IN ARRAY tables_to_lock LOOP
    -- Skip if table doesn't exist (some tables are optional / future)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      RAISE NOTICE 'Skipping %: table does not exist', t;
      CONTINUE;
    END IF;

    -- Drop every policy on this table that mentions anon FOR ALL
    -- (Hassan's naming conventions: <table>_anon_rw, <table>_anon, anon_<table>)
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_anon_rw',  t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_anon',     t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'anon_' || t,     t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_open',     t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_anon_all', t);

    -- Belt-and-braces: revoke write privileges from anon role
    -- (RLS policies removed = default deny, but explicit REVOKE is safer
    -- in case a future migration adds a permissive policy by mistake)
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON %I FROM anon', t);
    -- Sequence updates would also fail without GRANT, but no harm reaffirming
    BEGIN
      EXECUTE format('REVOKE USAGE, UPDATE ON SEQUENCE %I FROM anon', t || '_id_seq');
    EXCEPTION WHEN undefined_object THEN
      NULL; -- table uses TEXT primary key, no sequence
    END;

    RAISE NOTICE '✓ Locked anon writes on %', t;
  END LOOP;
END$$;

-- ── Re-grant anon SELECT only on tables the UI needs to read pre-login ──
-- v_alert_unread is the bell-badge counter — used by NotificationCenter
-- which polls every 15s. It's a derived view; safe to expose.
GRANT SELECT ON v_alert_unread TO anon;

-- erp_alerts: the bell badge needs to read counts. The TABLE itself (not
-- just the view) is queried by AlertService.getAlerts(). Allow SELECT only
-- — keep INSERT/UPDATE/DELETE restricted to authenticated users.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'erp_alerts') THEN
    GRANT SELECT ON erp_alerts TO anon;
    -- Re-create a SELECT-only policy for anon (RLS-level)
    DROP POLICY IF EXISTS "erp_alerts_anon_read" ON erp_alerts;
    CREATE POLICY "erp_alerts_anon_read" ON erp_alerts FOR SELECT TO anon USING (true);
  END IF;
END$$;

-- ── Sanity check policy: must have AT LEAST ONE policy left for authenticated ──
-- This catches the case where a legitimate `<table>_rw` policy was missing.
-- We don't fail — just log so Hassan can review.
DO $$
DECLARE
  t TEXT;
  pol_count INT;
  tables_to_verify TEXT[] := ARRAY[
    'invoices', 'payment_receipts', 'ledger', 'accounts', 'quotations',
    'erp_alerts', 'golive_checks'
  ];
BEGIN
  FOREACH t IN ARRAY tables_to_verify LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t) THEN
      CONTINUE;
    END IF;
    SELECT COUNT(*) INTO pol_count
    FROM   pg_policies
    WHERE  tablename = t AND schemaname = 'public';
    IF pol_count = 0 THEN
      RAISE WARNING 'Table % has ZERO policies after RLS tighten — authenticated users locked out!', t;
    END IF;
  END LOOP;
END$$;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────
-- VERIFICATION QUERIES (run in Supabase SQL editor after migration)
--
-- 1. Confirm no anon FOR ALL policies remain on financial tables:
-- SELECT tablename, polname, polcmd, polroles
--   FROM pg_policies
--   JOIN pg_roles ON pg_roles.oid = ANY(polroles)
--  WHERE pg_roles.rolname = 'anon'
--    AND tablename IN ('invoices','payment_receipts','ledger','quotations','payroll')
--    AND polcmd = 'ALL';
-- → expected: 0 rows
--
-- 2. Confirm anon CANNOT write to invoices:
-- (run as anon role)
-- INSERT INTO invoices (id, company) VALUES ('TEST', 'Glassco');
-- → expected: error "new row violates row-level security policy"
--
-- 3. Confirm authenticated user CAN still write:
-- (run as authenticated)
-- INSERT INTO invoices (id, company) VALUES ('TEST-AUTH', 'Glassco');
-- → expected: success
-- ═══════════════════════════════════════════════════════════════════════
