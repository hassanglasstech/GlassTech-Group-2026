-- ══════════════════════════════════════════════════════════════════════
-- Migration 028 — Stock Locations registry
--
-- Warehouse position registry for glass sheet storage tracking.
-- Locations are reusable codes (A-01, B-03, RACK-7) with descriptions.
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS stock_locations (
  id          TEXT PRIMARY KEY,
  company     TEXT NOT NULL,
  code        TEXT NOT NULL,
  description TEXT,
  zone        TEXT,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_loc_company_code
  ON stock_locations(company, code);

-- Add location_code to grn_sheet_entries
ALTER TABLE grn_sheet_entries
  ADD COLUMN IF NOT EXISTS location_code TEXT;

-- RLS
ALTER TABLE stock_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_rls" ON stock_locations;
CREATE POLICY "company_rls" ON stock_locations
  FOR ALL TO authenticated
  USING (
    company IS NULL
    OR company = COALESCE(
      (SELECT company FROM user_profiles WHERE id = auth.uid()),
      company
    )
  );

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
