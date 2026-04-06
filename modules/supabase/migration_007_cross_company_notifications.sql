-- ============================================================
-- Migration 007: cross_company_notifications
-- C-03 Fix: Cross-company requisition approval notifications
-- to Supabase so approvals are visible on all devices.
-- Run once in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS cross_company_notifications (
  id             TEXT PRIMARY KEY,
  target_company TEXT NOT NULL,
  from_company   TEXT NOT NULL DEFAULT '',
  title          TEXT NOT NULL,
  message        TEXT NOT NULL DEFAULT '',
  is_read        BOOLEAN NOT NULL DEFAULT false,
  type           TEXT NOT NULL DEFAULT 'general',
  reference_id   TEXT,
  link           TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast company-filtered queries
CREATE INDEX IF NOT EXISTS idx_ccn_target_company
  ON cross_company_notifications (target_company, is_read, created_at DESC);

-- Auto-delete notifications older than 90 days (keep table lean)
-- Run manually monthly or set up a Supabase cron:
-- DELETE FROM cross_company_notifications WHERE created_at < NOW() - INTERVAL '90 days';

ALTER TABLE cross_company_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ccn_authenticated"
  ON cross_company_notifications FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Verify
-- SELECT * FROM cross_company_notifications ORDER BY created_at DESC LIMIT 10;
