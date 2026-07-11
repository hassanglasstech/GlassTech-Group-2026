-- ═══════════════════════════════════════════════════════════════════
-- Migration: Predictive Alerts Upgrade — add horizon + impact columns
-- Date: 2026-04-26
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE predictive_alerts
  ADD COLUMN IF NOT EXISTS horizon_days INTEGER DEFAULT 7,
  ADD COLUMN IF NOT EXISTS impact_pkr   NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prediction   TEXT,
  ADD COLUMN IF NOT EXISTS alert_source TEXT DEFAULT 'system';
