-- ═══════════════════════════════════════════════════════════════════════
-- Migration 024: Control Exception Register (GRC)
-- Implements bypass logging, SLA tracking, and override mode for go-live
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Bypass Log table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bypass_log (
  id              TEXT PRIMARY KEY,
  user_id         TEXT,
  user_name       TEXT NOT NULL,
  module          TEXT NOT NULL CHECK (module IN ('Finance','HR','Sales','SCM','Production','HSE','Admin')),
  rule_bypassed   TEXT NOT NULL,
  record_id       TEXT DEFAULT '',
  bypass_reason   TEXT DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','In Progress','Resolved')),
  addressing_date DATE,
  resolved_by     TEXT,
  resolved_at     TIMESTAMPTZ,
  resolution_notes TEXT DEFAULT '',
  company         TEXT DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bypass_status     ON bypass_log(status);
CREATE INDEX IF NOT EXISTS idx_bypass_module     ON bypass_log(module);
CREATE INDEX IF NOT EXISTS idx_bypass_created_at ON bypass_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bypass_overdue    ON bypass_log(status, created_at)
  WHERE status <> 'Resolved';

ALTER TABLE bypass_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY bypass_read   ON bypass_log FOR SELECT USING (true);
CREATE POLICY bypass_insert ON bypass_log FOR INSERT WITH CHECK (true);
CREATE POLICY bypass_update ON bypass_log FOR UPDATE USING (true);

-- ── 2. Override Mode flag on user_profiles ──────────────────────────
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS override_mode_active BOOLEAN DEFAULT false;

-- ── 3. Helper view: overdue bypasses (>3 days, unresolved) ──────────
CREATE OR REPLACE VIEW bypass_log_overdue AS
SELECT
  bl.*,
  EXTRACT(DAY FROM now() - bl.created_at)::int AS days_open,
  CASE
    WHEN EXTRACT(DAY FROM now() - bl.created_at) > 7 THEN 'critical'
    WHEN EXTRACT(DAY FROM now() - bl.created_at) > 3 THEN 'overdue'
    ELSE 'within_sla'
  END AS sla_status
FROM bypass_log bl
WHERE bl.status <> 'Resolved';

GRANT SELECT ON bypass_log_overdue TO authenticated;
