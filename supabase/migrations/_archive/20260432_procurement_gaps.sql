-- ============================================================
-- Procurement Schema Gaps — 20260432
-- Missing: remnant_history, erp_config grants, JSONB data col
-- checks for all procurement tables
-- ============================================================

-- ── remnant_history: used in inventoryService but never created ──
CREATE TABLE IF NOT EXISTS remnant_history (
  id TEXT PRIMARY KEY,
  company TEXT,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── erp_config: ensure it has the right schema for Requisitions.tsx ──
-- (already exists from migration 008 but may be missing columns)
ALTER TABLE erp_config ADD COLUMN IF NOT EXISTS key TEXT;
ALTER TABLE erp_config ADD COLUMN IF NOT EXISTS value JSONB DEFAULT '{}';
ALTER TABLE erp_config ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ── Ensure ALL procurement _sbSync tables have data JSONB column ──
-- (some may have been created without it by earlier migrations)
ALTER TABLE requisitions          ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}';
ALTER TABLE purchase_orders       ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}';
ALTER TABLE grn_sheet_entries     ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}';
ALTER TABLE vendor_defect_reports ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}';
ALTER TABLE cutting_sessions      ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}';
ALTER TABLE manual_count_sheets   ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}';
ALTER TABLE scrap_disposals       ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}';
ALTER TABLE vendor_reviews        ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}';
ALTER TABLE pallet_rates          ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}';
ALTER TABLE weight_master         ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}';
ALTER TABLE stock_locations       ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}';
ALTER TABLE handling_units        ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}';
ALTER TABLE remnants              ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}';
ALTER TABLE vehicles              ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}';
ALTER TABLE vehicle_trips         ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}';
ALTER TABLE vehicle_expenses      ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}';
ALTER TABLE inspection_lots       ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}';

-- ── updated_at column on all procurement tables (needed by upsert) ──
ALTER TABLE requisitions          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE purchase_orders       ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE remnant_history       ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE grn_sheet_entries     ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE vendor_defect_reports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE cutting_sessions      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE manual_count_sheets   ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE scrap_disposals       ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ── GRANT access to all procurement tables ──
GRANT ALL ON remnant_history       TO anon, authenticated;
GRANT ALL ON erp_config            TO anon, authenticated;
GRANT ALL ON requisitions          TO anon, authenticated;
GRANT ALL ON purchase_orders       TO anon, authenticated;
GRANT ALL ON grn_sheet_entries     TO anon, authenticated;
GRANT ALL ON vendor_defect_reports TO anon, authenticated;
GRANT ALL ON cutting_sessions      TO anon, authenticated;
GRANT ALL ON manual_count_sheets   TO anon, authenticated;
GRANT ALL ON scrap_disposals       TO anon, authenticated;
GRANT ALL ON vendor_reviews        TO anon, authenticated;
GRANT ALL ON pallet_rates          TO anon, authenticated;
GRANT ALL ON weight_master         TO anon, authenticated;
GRANT ALL ON stock_locations       TO anon, authenticated;
GRANT ALL ON handling_units        TO anon, authenticated;
GRANT ALL ON remnants              TO anon, authenticated;
GRANT ALL ON vehicles              TO anon, authenticated;
GRANT ALL ON vehicle_trips         TO anon, authenticated;
GRANT ALL ON vehicle_expenses      TO anon, authenticated;
GRANT ALL ON inspection_lots       TO anon, authenticated;

SELECT 'Procurement schema gaps filled.' AS status;
