-- ============================================================
-- GLASSTECH ERP — PHASE 1 MASTER MIGRATION
-- Run this ONCE in Supabase SQL Editor (production)
-- All statements use IF NOT EXISTS / IF EXISTS — safe to re-run
-- Order: 001 → 007
-- ============================================================

-- ════════════════════════════════════════════════════════
-- MIGRATION: 001_create_all_tables.sql
-- ════════════════════════════════════════════════════════
-- ============================================================
-- GlassTech ERP — Supabase Table Migration
-- Run this in Supabase SQL Editor
-- Strategy: Each table stores structured data.
-- All tables use JSONB for flexible schema (no column migrations needed).
-- ============================================================

-- Helper: create a standard ERP table if it doesn't exist
-- Pattern: id (text PK) + company (text) + data (jsonb) + timestamps
-- All your existing data fields go inside the 'data' jsonb column
-- OR you can use individual columns — both approaches work.

-- For GlassTech ERP we use a HYBRID approach:
--   - Common fields as real columns (id, company, updated_at, created_at)
--   - All other fields as JSONB (zero migration headaches as schema evolves)

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loans (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payroll (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tag_master (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employee_tags (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employee_docs (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Finance ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cost_centers (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ledger (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS petty_cash (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recurring_expenses (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS financial_events (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mapping_rules (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gl_config (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Sales ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  company TEXT,
  name TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quotations (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_receipts (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Procurement & Inventory ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  company TEXT,
  name TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vendor_rates (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS store_items (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_ledger (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inspection_lots (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS remnants (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS handling_units (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS requisitions (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── GlassCo Procurement ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS grn_sheet_entries (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vendor_defect_reports (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cutting_sessions (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS manual_count_sheets (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scrap_disposals (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vendor_reviews (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pallet_rates (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS weight_master (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Production ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS production_pieces (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_orders (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cutter_daily_logs (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS generator_logs (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Logistics ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gate_passes (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS warehouse_spots (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vehicle_trips (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vehicle_expenses (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tempering_dispatches (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── NCR ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ncr_events (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ncr_reproductions (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ncr_claims (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ncr_remnants (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── RBAC ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employee_roles (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) — Prevent cross-company data leaks
-- Run this AFTER creating tables
-- ============================================================

-- Enable RLS on all tables
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'employees','attendance','loans','payroll','tag_master','employee_tags',
    'departments','employee_docs','accounts','cost_centers','ledger',
    'petty_cash','recurring_expenses','financial_events','mapping_rules',
    'gl_config','clients','quotations','projects','invoices','payment_receipts',
    'products','vendors','vendor_rates','store_items','assets','stock_ledger',
    'inspection_lots','remnants','handling_units','requisitions','purchase_orders',
    'grn_sheet_entries','vendor_defect_reports','cutting_sessions',
    'manual_count_sheets','scrap_disposals','vendor_reviews','pallet_rates',
    'weight_master','production_pieces','job_orders','cutter_daily_logs',
    'generator_logs','gate_passes','warehouse_spots','vehicles','vehicle_trips',
    'vehicle_expenses','tempering_dispatches','ncr_events','ncr_reproductions',
    'ncr_claims','ncr_remnants','roles','permissions','role_permissions','employee_roles'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    -- Allow authenticated users to read/write (your app auth handles company filtering)
    -- For now: allow all authenticated users (tighten per-company later)
    -- Drop existing policy if present, then recreate
    EXECUTE format(
      'DROP POLICY IF EXISTS "authenticated_access_%s" ON %I',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE POLICY "authenticated_access_%s" ON %I
       FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      tbl, tbl
    );
  END LOOP;
END $$;

-- ============================================================
-- INDEXES — For fast queries on large tables
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_ledger_company ON ledger(company);
CREATE INDEX IF NOT EXISTS idx_employees_company ON employees(company);
CREATE INDEX IF NOT EXISTS idx_attendance_company ON attendance(company);
CREATE INDEX IF NOT EXISTS idx_requisitions_company ON requisitions(company);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_company ON stock_ledger(company);
CREATE INDEX IF NOT EXISTS idx_grn_sheet_entries_company ON grn_sheet_entries(company);
CREATE INDEX IF NOT EXISTS idx_production_pieces_company ON production_pieces(company);
CREATE INDEX IF NOT EXISTS idx_clients_company ON clients(company);
CREATE INDEX IF NOT EXISTS idx_invoices_company ON invoices(company);

-- ============================================================
-- DONE. 58 tables created with RLS enabled.
-- ============================================================

-- ════════════════════════════════════════════════════════
-- MIGRATION: 002_add_missing_columns.sql
-- ════════════════════════════════════════════════════════
-- Migration 002: Add columns for tables that were created with minimal schema
-- Run this AFTER 001_create_all_tables.sql

-- accounts
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS level INTEGER;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS parent_id TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS type TEXT;

-- cost_centers
ALTER TABLE cost_centers ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE cost_centers ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE cost_centers ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE cost_centers ADD COLUMN IF NOT EXISTS manager TEXT;
ALTER TABLE cost_centers ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE cost_centers ADD COLUMN IF NOT EXISTS hierarchy_area TEXT;

-- petty_cash (already has columns from 001, but ensure)
ALTER TABLE petty_cash ADD COLUMN IF NOT EXISTS date TEXT;
ALTER TABLE petty_cash ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE petty_cash ADD COLUMN IF NOT EXISTS amount NUMERIC DEFAULT 0;
ALTER TABLE petty_cash ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE petty_cash ADD COLUMN IF NOT EXISTS reference_doc TEXT;

-- recurring_expenses
ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS amount NUMERIC DEFAULT 0;
ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS frequency TEXT;
ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS next_due TEXT;
ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS gl_account TEXT;
ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS cost_center TEXT;
ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- financial_events
ALTER TABLE financial_events ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE financial_events ADD COLUMN IF NOT EXISTS amount NUMERIC DEFAULT 0;
ALTER TABLE financial_events ADD COLUMN IF NOT EXISTS date TEXT;
ALTER TABLE financial_events ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE financial_events ADD COLUMN IF NOT EXISTS reference TEXT;

-- mapping_rules
ALTER TABLE mapping_rules ADD COLUMN IF NOT EXISTS subcategory TEXT;
ALTER TABLE mapping_rules ADD COLUMN IF NOT EXISTS debit_code TEXT;
ALTER TABLE mapping_rules ADD COLUMN IF NOT EXISTS debit_name TEXT;
ALTER TABLE mapping_rules ADD COLUMN IF NOT EXISTS credit_code TEXT;
ALTER TABLE mapping_rules ADD COLUMN IF NOT EXISTS credit_name TEXT;

-- gl_config
ALTER TABLE gl_config ADD COLUMN IF NOT EXISTS key TEXT;
ALTER TABLE gl_config ADD COLUMN IF NOT EXISTS value TEXT;
ALTER TABLE gl_config ADD COLUMN IF NOT EXISTS description TEXT;

-- inspection_lots
ALTER TABLE inspection_lots ADD COLUMN IF NOT EXISTS grn_id TEXT;
ALTER TABLE inspection_lots ADD COLUMN IF NOT EXISTS vendor_id TEXT;
ALTER TABLE inspection_lots ADD COLUMN IF NOT EXISTS product_id TEXT;
ALTER TABLE inspection_lots ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Pending';
ALTER TABLE inspection_lots ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]';

-- handling_units
ALTER TABLE handling_units ADD COLUMN IF NOT EXISTS grn_id TEXT;
ALTER TABLE handling_units ADD COLUMN IF NOT EXISTS hu_number TEXT;
ALTER TABLE handling_units ADD COLUMN IF NOT EXISTS material TEXT;
ALTER TABLE handling_units ADD COLUMN IF NOT EXISTS quantity NUMERIC DEFAULT 0;
ALTER TABLE handling_units ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE handling_units ADD COLUMN IF NOT EXISTS storage_bin TEXT;
ALTER TABLE handling_units ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active';

-- remnants
ALTER TABLE remnants ADD COLUMN IF NOT EXISTS glass_type TEXT;
ALTER TABLE remnants ADD COLUMN IF NOT EXISTS thickness TEXT;
ALTER TABLE remnants ADD COLUMN IF NOT EXISTS length NUMERIC DEFAULT 0;
ALTER TABLE remnants ADD COLUMN IF NOT EXISTS width NUMERIC DEFAULT 0;
ALTER TABLE remnants ADD COLUMN IF NOT EXISTS area_sqft NUMERIC DEFAULT 0;
ALTER TABLE remnants ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE remnants ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Available';
ALTER TABLE remnants ADD COLUMN IF NOT EXISTS source_grn TEXT;

-- stock_ledger
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS material_id TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS movement_type TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS quantity NUMERIC DEFAULT 0;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS uom TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS posting_date TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS document_no TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS plant TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS storage_loc TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS value NUMERIC DEFAULT 0;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS moving_avg_price NUMERIC DEFAULT 0;

-- job_orders
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS order_no TEXT;
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS client_id TEXT;
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS project_name TEXT;
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Open';
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]';
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS created_date TEXT;

-- projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_id TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS start_date TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS end_date TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS total_value NUMERIC DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS notes TEXT;

-- employee_docs
ALTER TABLE employee_docs ADD COLUMN IF NOT EXISTS employee_id TEXT;
ALTER TABLE employee_docs ADD COLUMN IF NOT EXISTS doc_type TEXT;
ALTER TABLE employee_docs ADD COLUMN IF NOT EXISTS doc_name TEXT;
ALTER TABLE employee_docs ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE employee_docs ADD COLUMN IF NOT EXISTS expiry_date TEXT;
ALTER TABLE employee_docs ADD COLUMN IF NOT EXISTS notes TEXT;

-- vehicles (referenced in TABLE_MAP but no columns defined yet)
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS reg_no TEXT;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active';

-- vendor_rates
ALTER TABLE vendor_rates ADD COLUMN IF NOT EXISTS vendor_id TEXT;
ALTER TABLE vendor_rates ADD COLUMN IF NOT EXISTS product_id TEXT;
ALTER TABLE vendor_rates ADD COLUMN IF NOT EXISTS rate NUMERIC DEFAULT 0;
ALTER TABLE vendor_rates ADD COLUMN IF NOT EXISTS effective_date TEXT;
ALTER TABLE vendor_rates ADD COLUMN IF NOT EXISTS notes TEXT;

-- DONE

-- ── Backup audit log table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp_backups (
  id TEXT PRIMARY KEY,
  backup_date TIMESTAMPTZ DEFAULT now(),
  backup_type TEXT,
  table_count INTEGER DEFAULT 0,
  record_count INTEGER DEFAULT 0,
  source TEXT,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE erp_backups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access_erp_backups" ON erp_backups;
CREATE POLICY "authenticated_access_erp_backups" ON erp_backups
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════
-- MIGRATION: 003_phase1_data_layer.sql
-- ════════════════════════════════════════════════════════
-- ============================================================
-- Migration 003 — Phase 1: Data Layer Hardening
-- Run this in Supabase SQL Editor BEFORE deploying the new code
-- ============================================================

-- ── ledger: add req_id column (used by financeService PV linking) ──
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS req_id TEXT;

-- ── ledger: add doc_type column (was missing as native column) ───────
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS doc_type TEXT DEFAULT 'JV';
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS doc_date TEXT;
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS reference_id TEXT;

-- ── accounts: ensure all native columns exist ─────────────────────────
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS parent_id TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'Asset';

-- ── cost_centers: ensure native columns ──────────────────────────────
ALTER TABLE cost_centers ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE cost_centers ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE cost_centers ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE cost_centers ADD COLUMN IF NOT EXISTS manager TEXT;
ALTER TABLE cost_centers ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'H';
ALTER TABLE cost_centers ADD COLUMN IF NOT EXISTS hierarchy_area TEXT;

-- ── petty_cash: ensure native columns ────────────────────────────────
ALTER TABLE petty_cash ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE petty_cash ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Posted';
ALTER TABLE petty_cash ADD COLUMN IF NOT EXISTS reference_doc TEXT;

-- ── financial_events: ensure native columns ───────────────────────────
ALTER TABLE financial_events ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE financial_events ADD COLUMN IF NOT EXISTS amount NUMERIC DEFAULT 0;
ALTER TABLE financial_events ADD COLUMN IF NOT EXISTS date TEXT;
ALTER TABLE financial_events ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Pending';
ALTER TABLE financial_events ADD COLUMN IF NOT EXISTS reference TEXT;

-- ── recurring_expenses: ensure native columns ─────────────────────────
ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS amount NUMERIC DEFAULT 0;

-- ── Performance: GIN indexes on JSONB data column (Phase 1) ──────────
-- These prevent full table scans when filtering by status/company
CREATE INDEX IF NOT EXISTS idx_ledger_company     ON ledger(company);
CREATE INDEX IF NOT EXISTS idx_ledger_status      ON ledger(status);
CREATE INDEX IF NOT EXISTS idx_ledger_date        ON ledger(date);
CREATE INDEX IF NOT EXISTS idx_ledger_req_id      ON ledger(req_id);
CREATE INDEX IF NOT EXISTS idx_accounts_company   ON accounts(company);
CREATE INDEX IF NOT EXISTS idx_accounts_code      ON accounts(code);
CREATE INDEX IF NOT EXISTS idx_petty_cash_company ON petty_cash(company);
CREATE INDEX IF NOT EXISTS idx_petty_cash_date    ON petty_cash(date);
CREATE INDEX IF NOT EXISTS idx_cost_centers_co    ON cost_centers(company);

-- ── Audit columns: who posted this GL entry ───────────────────────────
-- NOTE: populate with auth.uid() from application layer on new entries
ALTER TABLE ledger      ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE petty_cash  ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE accounts    ADD COLUMN IF NOT EXISTS created_by TEXT;

-- ════════════════════════════════════════════════════════
-- MIGRATION: 004_fiscal_periods.sql
-- ════════════════════════════════════════════════════════
-- ============================================================
-- Migration 004 — Phase 4: Financial Controls
-- Run in Supabase SQL Editor
-- ============================================================

-- ── Fiscal Periods table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fiscal_periods (
  id          TEXT PRIMARY KEY,
  company     TEXT NOT NULL,
  month       TEXT NOT NULL,
  status      TEXT DEFAULT 'Open',
  opened_by   TEXT,
  opened_at   TIMESTAMPTZ,
  closed_by   TEXT,
  closed_at   TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fiscal_periods_company ON fiscal_periods(company);
CREATE INDEX IF NOT EXISTS idx_fiscal_periods_month   ON fiscal_periods(month);
CREATE INDEX IF NOT EXISTS idx_fiscal_periods_status  ON fiscal_periods(status);

-- ── Add created_by to ledger (audit trail) ────────────────────────────
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS created_by TEXT;

-- ── Add created_by to petty_cash ──────────────────────────────────────
ALTER TABLE petty_cash ADD COLUMN IF NOT EXISTS created_by TEXT;

-- ── Seed current month as Open for all companies ──────────────────────
INSERT INTO fiscal_periods (id, company, month, status, opened_by, opened_at)
VALUES
  ('GTK-' || to_char(now(), 'YYYY-MM'),     'GTK',     to_char(now(), 'YYYY-MM'), 'Open', 'System', now()),
  ('GTI-' || to_char(now(), 'YYYY-MM'),     'GTI',     to_char(now(), 'YYYY-MM'), 'Open', 'System', now()),
  ('Glassco-' || to_char(now(), 'YYYY-MM'), 'Glassco', to_char(now(), 'YYYY-MM'), 'Open', 'System', now()),
  ('Nippon-' || to_char(now(), 'YYYY-MM'),  'Nippon',  to_char(now(), 'YYYY-MM'), 'Open', 'System', now()),
  ('Factory-' || to_char(now(), 'YYYY-MM'), 'Factory', to_char(now(), 'YYYY-MM'), 'Open', 'System', now())
ON CONFLICT (id) DO NOTHING;

-- ── Phase 5: GTK Job Orders table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_orders (
  id          TEXT PRIMARY KEY,
  company     TEXT,
  data        JSONB DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT now(),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_orders_company ON job_orders(company);

-- ════════════════════════════════════════════════════════
-- MIGRATION: 005_phase6_intercompany_bankrecon.sql
-- ════════════════════════════════════════════════════════
-- ============================================================
-- Migration 005 — Phase 6: Intercompany + Bank Reconciliation
-- Run in Supabase SQL Editor
-- ============================================================

-- ── Intercompany Transfers ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS intercompany_transfers (
  id              TEXT PRIMARY KEY,
  from_company    TEXT NOT NULL,
  to_company      TEXT NOT NULL,
  type            TEXT NOT NULL,
  amount          NUMERIC DEFAULT 0,
  description     TEXT,
  date            TEXT,
  from_gl_tx_id   TEXT,
  to_gl_tx_id     TEXT,
  status          TEXT DEFAULT 'Posted',
  posted_by       TEXT,
  reference_doc   TEXT,
  updated_at      TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ico_from_company ON intercompany_transfers(from_company);
CREATE INDEX IF NOT EXISTS idx_ico_to_company   ON intercompany_transfers(to_company);
CREATE INDEX IF NOT EXISTS idx_ico_date         ON intercompany_transfers(date);
CREATE INDEX IF NOT EXISTS idx_ico_status       ON intercompany_transfers(status);

-- ── Bank Reconciliation Sessions ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_recon_sessions (
  id            TEXT PRIMARY KEY,
  company       TEXT NOT NULL,
  bank_account  TEXT NOT NULL,
  month         TEXT NOT NULL,
  status        TEXT DEFAULT 'In Progress',
  bank_balance  NUMERIC DEFAULT 0,
  gl_balance    NUMERIC DEFAULT 0,
  difference    NUMERIC DEFAULT 0,
  data          JSONB DEFAULT '{}',
  updated_at    TIMESTAMPTZ DEFAULT now(),
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_recon_company ON bank_recon_sessions(company);
CREATE INDEX IF NOT EXISTS idx_bank_recon_month   ON bank_recon_sessions(month);

-- ════════════════════════════════════════════════════════
-- MIGRATION: 006_ai_layer_tables.sql
-- ════════════════════════════════════════════════════════
-- ============================================================
-- Migration 006 — Phase 8: AI Layer Tables
-- Run in Supabase SQL Editor BEFORE deploying edge functions
-- ============================================================

-- ── Morning Briefings ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS morning_briefings (
  briefing_date  TEXT PRIMARY KEY,          -- YYYY-MM-DD (one per day)
  briefing_text  TEXT,
  raw_data       JSONB DEFAULT '{}',
  kpis           JSONB DEFAULT '{}',
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- ── Predictive Alerts ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS predictive_alerts (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  alert_type     TEXT NOT NULL,
  title          TEXT,
  message        TEXT,
  severity       TEXT DEFAULT 'Medium',
  confidence     INTEGER DEFAULT 70,
  entity_type    TEXT,
  entity_id      TEXT,
  entity_label   TEXT,
  data_snapshot  JSONB DEFAULT '{}',
  actioned       BOOLEAN DEFAULT false,
  dismissed      BOOLEAN DEFAULT false,
  action_note    TEXT,
  actioned_by    TEXT,
  actioned_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pred_alerts_severity  ON predictive_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_pred_alerts_actioned  ON predictive_alerts(actioned);
CREATE INDEX IF NOT EXISTS idx_pred_alerts_dismissed ON predictive_alerts(dismissed);
CREATE INDEX IF NOT EXISTS idx_pred_alerts_created   ON predictive_alerts(created_at DESC);

-- ── Agent Tasks ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_tasks (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title       TEXT NOT NULL,
  description TEXT,
  priority    TEXT DEFAULT 'Medium',
  status      TEXT DEFAULT 'Open',
  due_date    TEXT,
  assigned_to TEXT,
  created_by  TEXT DEFAULT 'AI Agent',
  source      TEXT,                       -- which agent created it
  reference   TEXT,                       -- linked entity ID
  completed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_status   ON agent_tasks(status);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_priority ON agent_tasks(priority);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_due      ON agent_tasks(due_date);

-- ── Agent Alert History (read status) ────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_alert_history (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  alert_type TEXT,
  title      TEXT,
  message    TEXT,
  severity   TEXT,
  read       BOOLEAN DEFAULT false,
  source     TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_alert_read ON agent_alert_history(read);

-- ── Agent Memories (semantic / strategic) ────────────────────────────
CREATE TABLE IF NOT EXISTS agent_memories (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  category   TEXT,                        -- 'decision', 'observation', 'instruction'
  content    TEXT,
  tags       JSONB DEFAULT '[]',
  relevance  REAL DEFAULT 1.0,
  source     TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── WhatsApp Log ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_log (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  direction  TEXT DEFAULT 'outbound',     -- 'inbound' | 'outbound'
  from_num   TEXT,
  to_num     TEXT,
  message    TEXT,
  status     TEXT DEFAULT 'sent',
  wa_msg_id  TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Factory Events (if not exists) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS factory_events (
  id          TEXT PRIMARY KEY,
  sector      TEXT,
  event_type  TEXT,
  detail      TEXT,
  priority    TEXT DEFAULT 'Medium',
  status      TEXT DEFAULT 'Open',
  logged_by   TEXT,
  req_id      TEXT,
  resolved_at TIMESTAMPTZ,
  notes       TEXT,
  data        JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_factory_events_status   ON factory_events(status);
CREATE INDEX IF NOT EXISTS idx_factory_events_priority ON factory_events(priority);

-- ── Factory Escalation Alerts ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS factory_escalation_alerts (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  event_id     TEXT,
  event_type   TEXT,
  sector       TEXT,
  hours_overdue REAL DEFAULT 0,
  resolved     BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ── Business Scenarios (for PredictiveIntelligence) ───────────────────
CREATE TABLE IF NOT EXISTS business_scenarios (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  type        TEXT,
  title       TEXT,
  description TEXT,
  probability REAL DEFAULT 0.5,
  impact      TEXT,
  status      TEXT DEFAULT 'active',
  data        JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── Vendor SLA ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_sla (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  vendor_name      TEXT NOT NULL,
  company          TEXT,
  active           BOOLEAN DEFAULT true,
  total_orders     INTEGER DEFAULT 0,
  breach_count     INTEGER DEFAULT 0,
  next_rate_review TEXT,
  reminded         BOOLEAN DEFAULT false,
  data             JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- ── HSE Incidents ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hse_incidents (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  type       TEXT,
  severity   TEXT DEFAULT 'Minor',
  description TEXT,
  location   TEXT,
  reported_by TEXT,
  closed     BOOLEAN DEFAULT false,
  closed_at  TIMESTAMPTZ,
  data       JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── ERP Backups ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp_backups (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  backup_date TEXT,
  file_name   TEXT,
  file_size   INTEGER,
  status      TEXT DEFAULT 'complete',
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ════════════════════════════════════════════════════════
-- MIGRATION: 007_phase9_leave_projects.sql
-- ════════════════════════════════════════════════════════
-- ============================================================
-- Migration 007 — Phase 9: Leave Management + Projects
-- Run in Supabase SQL Editor
-- ============================================================

-- ── Leave Applications ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_applications (
  id            TEXT PRIMARY KEY,
  company       TEXT NOT NULL,
  employee_id   TEXT NOT NULL,
  employee_name TEXT,
  type          TEXT NOT NULL,              -- Annual | Casual | Sick | Unpaid | Maternity | Paternity
  from_date     TEXT NOT NULL,             -- YYYY-MM-DD
  to_date       TEXT NOT NULL,
  days          INTEGER DEFAULT 1,
  reason        TEXT,
  status        TEXT DEFAULT 'Pending',    -- Pending | Approved | Rejected | Cancelled
  applied_at    TIMESTAMPTZ DEFAULT now(),
  reviewed_by   TEXT,
  reviewed_at   TIMESTAMPTZ,
  review_note   TEXT,
  updated_at    TIMESTAMPTZ DEFAULT now(),
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leave_company     ON leave_applications(company);
CREATE INDEX IF NOT EXISTS idx_leave_employee    ON leave_applications(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_status      ON leave_applications(status);
CREATE INDEX IF NOT EXISTS idx_leave_from_date   ON leave_applications(from_date);

-- ── Projects (if not exists — was localStorage only) ──────────────────
CREATE TABLE IF NOT EXISTS projects (
  id         TEXT PRIMARY KEY,
  company    TEXT,
  data       JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_company ON projects(company);

