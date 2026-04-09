-- ============================================================
-- Migration 011 — Single-Owner RLS Across ALL Tables
-- GlassTech ERP: GTK, GTI, GlassCo, Nippon, Factory
--
-- Strategy:
--   - Enable RLS on every table (idempotent)
--   - Single policy per table: authenticated users get full CRUD
--   - Service role key bypasses RLS automatically (Supabase default)
--   - No multi-tenant row filtering — single-owner ERP
--
-- Run in Supabase SQL Editor or via supabase db push
-- ============================================================

-- Master list of ALL tables across every migration (001–010 + modules)
DO $$
DECLARE
  tbl TEXT;
  pol_name TEXT;
  all_tables TEXT[] := ARRAY[
    -- ── Migration 001: Core ERP (58 tables) ──────────────────────
    -- HR & Payroll
    'employees', 'attendance', 'loans', 'payroll',
    'tag_master', 'employee_tags', 'departments', 'employee_docs',
    -- Finance
    'accounts', 'cost_centers', 'ledger', 'petty_cash',
    'recurring_expenses', 'financial_events', 'mapping_rules', 'gl_config',
    -- Sales
    'clients', 'quotations', 'projects', 'invoices', 'payment_receipts',
    -- Procurement & Inventory
    'products', 'vendors', 'vendor_rates', 'store_items', 'assets',
    'stock_ledger', 'inspection_lots', 'remnants', 'handling_units',
    'requisitions', 'purchase_orders',
    -- GlassCo Procurement
    'grn_sheet_entries', 'vendor_defect_reports', 'cutting_sessions',
    'manual_count_sheets', 'scrap_disposals', 'vendor_reviews',
    'pallet_rates', 'weight_master',
    -- Production
    'production_pieces', 'job_orders', 'cutter_daily_logs', 'generator_logs',
    -- Logistics
    'gate_passes', 'warehouse_spots', 'vehicles', 'vehicle_trips',
    'vehicle_expenses', 'tempering_dispatches',
    -- NCR
    'ncr_events', 'ncr_reproductions', 'ncr_claims', 'ncr_remnants',
    -- RBAC
    'roles', 'permissions', 'role_permissions', 'employee_roles',

    -- ── Migration 002: Backups ───────────────────────────────────
    'erp_backups',

    -- ── Migration 004: Financial Controls ────────────────────────
    'fiscal_periods',

    -- ── Migration 005: Intercompany + Bank Recon ─────────────────
    'intercompany_transfers', 'bank_recon_sessions',

    -- ── Migration 006: AI Layer ──────────────────────────────────
    'morning_briefings', 'predictive_alerts', 'agent_tasks',
    'agent_alert_history', 'agent_memories', 'whatsapp_log',
    'factory_events', 'factory_escalation_alerts',
    'business_scenarios', 'vendor_sla', 'hse_incidents',

    -- ── Migration 007: Leave Management ──────────────────────────
    'leave_applications',

    -- ── Migration 008: Attendance Overrides + Config ─────────────
    'attendance_overrides', 'erp_config',

    -- ── Module Migrations: GL Posting Rules + Notifications ──────
    'gl_posting_rules', 'cross_company_notifications'
  ];
BEGIN
  FOREACH tbl IN ARRAY all_tables LOOP
    -- Skip if table doesn't exist (safe for partial deployments)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      RAISE NOTICE 'Skipping % — table does not exist', tbl;
      CONTINUE;
    END IF;

    -- 1. Enable RLS (idempotent — no error if already enabled)
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

    -- 2. Drop any existing policies to avoid conflicts
    --    Covers naming from 001 ("authenticated_access_X") and module migrations
    pol_name := 'authenticated_access_' || tbl;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol_name, tbl);

    -- Also drop module-style policy names if they exist
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'ccn_authenticated', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'gl_rules_authenticated', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'bank_recon_authenticated', tbl);

    -- 3. Create unified single-owner policy
    --    Authenticated users get full access (SELECT, INSERT, UPDATE, DELETE)
    --    USING (true)      → can read all rows
    --    WITH CHECK (true)  → can write all rows
    --    Service role key bypasses RLS entirely (Supabase built-in)
    EXECUTE format(
      'CREATE POLICY "rls_single_owner_%s" ON public.%I
       FOR ALL
       TO authenticated
       USING (true)
       WITH CHECK (true)',
      tbl, tbl
    );

    RAISE NOTICE 'RLS policy applied to %', tbl;
  END LOOP;
END $$;

-- ============================================================
-- Verify: count tables with RLS enabled
-- ============================================================
DO $$
DECLARE
  rls_count INTEGER;
  total_count INTEGER;
BEGIN
  SELECT count(*) INTO rls_count
  FROM pg_tables
  WHERE schemaname = 'public' AND rowsecurity = true;

  SELECT count(*) INTO total_count
  FROM pg_tables
  WHERE schemaname = 'public';

  RAISE NOTICE 'RLS Status: % of % public tables have RLS enabled', rls_count, total_count;
END $$;

-- ============================================================
-- DONE. Single-owner RLS applied to all 76 tables.
--
-- How it works:
--   anon key  → blocked (no policies for anon role)
--   auth key  → full CRUD on all rows (authenticated policy)
--   service key → bypasses RLS entirely (Supabase default)
--
-- To tighten later for multi-tenant:
--   Replace USING (true) with USING (company = current_setting('app.company'))
--   or use auth.uid() for per-user filtering
-- ============================================================
