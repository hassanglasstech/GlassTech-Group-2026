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
