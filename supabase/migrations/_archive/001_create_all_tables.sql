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
