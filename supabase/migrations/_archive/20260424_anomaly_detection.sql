-- ═══════════════════════════════════════════════════════════════════
-- Migration: Anomaly Detection — alert log + configurable thresholds
-- Date: 2026-04-24
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS anomaly_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anomaly_type     TEXT NOT NULL,
  severity         TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  department       TEXT NOT NULL DEFAULT 'general',
  description      TEXT NOT NULL,
  data_snapshot    JSONB NOT NULL DEFAULT '{}',
  acknowledged_at  TIMESTAMPTZ,
  acknowledged_by  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anomaly_sev ON anomaly_log (severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anomaly_ack ON anomaly_log (acknowledged_at) WHERE acknowledged_at IS NULL;

ALTER TABLE anomaly_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all_anomaly" ON anomaly_log;
CREATE POLICY "authenticated_all_anomaly" ON anomaly_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Configurable thresholds (editable by owner)
CREATE TABLE IF NOT EXISTS anomaly_thresholds (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key    TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  department  TEXT NOT NULL,
  threshold   NUMERIC NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE anomaly_thresholds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all_thresholds" ON anomaly_thresholds;
CREATE POLICY "authenticated_all_thresholds" ON anomaly_thresholds
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO anomaly_thresholds (rule_key, label, department, threshold) VALUES
  ('invoice_overdue_days',    'Invoice overdue days',          'finance',    30),
  ('cash_drop_pct',           'Cash balance drop %',           'finance',    30),
  ('expense_multiplier',      'Expense vs avg multiplier',     'finance',    2),
  ('table_idle_hours',        'Cutting table idle hours',      'production', 2),
  ('ncr_rate_pct',            'NCR rate % (24hr)',             'production', 5),
  ('remnant_age_days',        'Remnant age without match',     'production', 20),
  ('absent_count_month',      'Absences per employee/month',   'hr',         3),
  ('overtime_pct',            'Overtime % of shift',           'hr',         20)
ON CONFLICT (rule_key) DO NOTHING;
