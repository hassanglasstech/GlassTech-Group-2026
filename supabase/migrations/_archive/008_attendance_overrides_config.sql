-- ============================================================
-- Migration 008 — Attendance Overrides + Config Table
-- Run in Supabase SQL Editor
-- ============================================================

-- ── Attendance Overrides (replaces localStorage summary_overrides) ────
CREATE TABLE IF NOT EXISTS attendance_overrides (
  id           TEXT PRIMARY KEY,   -- {company}_{employeeId}_{month}
  company      TEXT NOT NULL,
  employee_id  TEXT NOT NULL,
  month        TEXT NOT NULL,      -- YYYY-MM
  absent       NUMERIC DEFAULT 0,
  allowed_absent NUMERIC DEFAULT 0,
  lates        NUMERIC DEFAULT 0,
  sunday       NUMERIC DEFAULT 0,
  ot           NUMERIC DEFAULT 0,
  manual_loan_deduction NUMERIC DEFAULT -1,
  req_ref      TEXT,
  updated_by   TEXT,
  updated_at   TIMESTAMPTZ DEFAULT now(),
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_att_overrides_company    ON attendance_overrides(company);
CREATE INDEX IF NOT EXISTS idx_att_overrides_employee   ON attendance_overrides(employee_id);
CREATE INDEX IF NOT EXISTS idx_att_overrides_month      ON attendance_overrides(month);
CREATE UNIQUE INDEX IF NOT EXISTS idx_att_overrides_unique
  ON attendance_overrides(company, employee_id, month);

ALTER TABLE attendance_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access_attendance_overrides" ON attendance_overrides;
CREATE POLICY "authenticated_access_attendance_overrides" ON attendance_overrides
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Config table (replaces localStorage custom_sub_categories etc.) ───
CREATE TABLE IF NOT EXISTS erp_config (
  id         TEXT PRIMARY KEY,   -- {company}_{key}
  company    TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erp_config_company ON erp_config(company);
CREATE INDEX IF NOT EXISTS idx_erp_config_key     ON erp_config(key);

ALTER TABLE erp_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access_erp_config" ON erp_config;
CREATE POLICY "authenticated_access_erp_config" ON erp_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Verify
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('attendance_overrides', 'erp_config');
