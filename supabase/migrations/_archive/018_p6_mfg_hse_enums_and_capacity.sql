-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 018 — Phase 6: Manufacturing constraints, HSE enum, generator RLS
-- Addresses:
--   MFG-4  — cost_center_id column on production_pieces
--   MFG-5  — tempering_oven_config table with RLS
--   MFG-6  — RLS on generator_logs
--   SEC-7  — incident_severity ENUM on hse_incidents
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- MFG-4: cost_center_id on production_pieces
-- Links each piece to the cost centre that should bear its manufacturing
-- overhead. Without this, all production cost is pooled — impossible to
-- report per-project or per-department P&L at the piece level.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE production_pieces
  ADD COLUMN IF NOT EXISTS cost_center_id TEXT;

COMMENT ON COLUMN production_pieces.cost_center_id IS
  'FK → cost_centers.id. Populated on job card creation. Required for per-job cost analysis (MFG-4).';

CREATE INDEX IF NOT EXISTS production_pieces_cost_center_idx
  ON production_pieces (cost_center_id)
  WHERE cost_center_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- MFG-5: tempering_oven_config — oven capacity registry
-- Stores per-company, per-oven rated capacities.
-- productionService.validateTemperingDispatch() queries this before
-- allowing a batch dispatch to prevent kiln damage and quality defects.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tempering_oven_config (
  id                  TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  company             TEXT        NOT NULL,
  oven_id             TEXT        NOT NULL,      -- e.g. 'OVEN-1', 'OVEN-2'
  oven_name           TEXT        NOT NULL,      -- human-readable label
  max_capacity_kg     NUMERIC(10,2) NOT NULL,    -- maximum batch weight in kg
  max_sqft_per_batch  NUMERIC(10,2) NOT NULL,    -- maximum glass area per cycle
  notes               TEXT,
  is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (id),
  UNIQUE (company, oven_id)
);

ALTER TABLE tempering_oven_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_rls" ON tempering_oven_config;
CREATE POLICY "company_rls" ON tempering_oven_config
  FOR ALL
  USING (company = (SELECT company FROM user_profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS tempering_oven_config_company_idx
  ON tempering_oven_config (company, oven_id);

-- Seed representative oven configs for each company.
-- Values are industry typical for 6mm glass; update per actual nameplate.
INSERT INTO tempering_oven_config (company, oven_id, oven_name, max_capacity_kg, max_sqft_per_batch, notes)
VALUES
  ('GTK',     'OVEN-1', 'GTK Main Tempering Oven',    2000, 800, 'Glaston FC500 — rated 6mm clear'),
  ('GTI',     'OVEN-1', 'GTI Tempering Furnace',       1800, 700, 'Tamglass 1800 — rated 6mm clear'),
  ('Glassco', 'OVEN-1', 'Glassco Tempering Line',      2200, 900, 'North Glass NG-TPNL-2200'),
  ('Factory', 'OVEN-1', 'Factory Tempering Oven',      1500, 600, 'Local build — verify nameplate'),
  ('Nippon',  'OVEN-1', 'Nippon Tempering Furnace',    2000, 800, 'Tamglass equivalent')
ON CONFLICT (company, oven_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- MFG-6: generator_logs — RLS enforcement
-- getLogs() already scopes queries via .eq('company', company) at the
-- application layer. This migration adds DB-level RLS so a compromised
-- session token cannot exfiltrate another company's energy cost data.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE generator_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_rls" ON generator_logs;
CREATE POLICY "company_rls" ON generator_logs
  FOR ALL
  USING (company = (SELECT company FROM user_profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS generator_logs_company_date_idx
  ON generator_logs (company, log_date DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- SEC-7: incident_severity ENUM
-- Replaces the free-text severity column on hse_incidents with a strict
-- PostgreSQL ENUM so no arbitrary strings (e.g. 'CRITICAL', 'critical',
-- SQL fragments) can be injected via the HSE form.
-- Migration is written idempotently: if the type already exists, the
-- ALTER TABLE is the only additional operation.
-- ─────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'incident_severity'
  ) THEN
    CREATE TYPE incident_severity AS ENUM (
      'Near Miss',
      'Minor',
      'Major',
      'Critical'
    );
  END IF;
END$$;

-- Cast the existing TEXT column to the new ENUM.
-- Rows with values outside the four allowed labels will cause this to fail —
-- fix those rows first with:
--   UPDATE hse_incidents SET severity = 'Minor' WHERE severity NOT IN ('Near Miss','Minor','Major','Critical');
ALTER TABLE hse_incidents
  ALTER COLUMN severity TYPE incident_severity
  USING severity::incident_severity;

COMMENT ON COLUMN hse_incidents.severity IS
  'Strict ENUM — allowed values: Near Miss | Minor | Major | Critical (SEC-7).';

-- Also guard hse_escalations table if it exists (from migration 015)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'hse_escalations' AND column_name = 'severity') THEN
    ALTER TABLE hse_escalations
      ALTER COLUMN severity TYPE incident_severity
      USING severity::incident_severity;
  END IF;
END$$;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICATION QUERIES
-- ─────────────────────────────────────────────────────────────────────────
-- -- Confirm cost_center_id column:
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'production_pieces' AND column_name = 'cost_center_id';
--
-- -- Confirm oven config seeds:
-- SELECT company, oven_id, max_capacity_kg, max_sqft_per_batch FROM tempering_oven_config;
--
-- -- Confirm ENUM type:
-- SELECT enumlabel FROM pg_enum
--   JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
--   WHERE typname = 'incident_severity';
-- Expected: Near Miss, Minor, Major, Critical
-- ═══════════════════════════════════════════════════════════════════════════
