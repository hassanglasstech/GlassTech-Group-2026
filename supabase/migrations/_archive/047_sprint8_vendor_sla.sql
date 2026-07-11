-- ═══════════════════════════════════════════════════════════════════════
-- Migration 047 — Sprint 8: Vendor SLA tracking on tempering dispatches
--
-- Adds two date columns to `tempering_dispatches`:
--   • expected_return_date — promised by vendor at dispatch creation
--   • actual_return_date   — set when the inward audit completes
--
-- Plus a partial index that gives an O(1) "vendors overdue right now"
-- lookup for the Vendor SLA dashboard tile on /#/production/aging.
--
-- Pure additive — no behaviour change for existing dispatches that
-- predate this migration (both columns default NULL → vendor counted
-- as "no SLA set" in the dashboard).
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE tempering_dispatches
  ADD COLUMN IF NOT EXISTS expected_return_date DATE,
  ADD COLUMN IF NOT EXISTS actual_return_date   DATE;

-- Partial index for the "currently overdue" query:
--   SELECT … FROM tempering_dispatches
--    WHERE actual_return_date IS NULL
--      AND expected_return_date < CURRENT_DATE
CREATE INDEX IF NOT EXISTS idx_tempering_overdue
  ON tempering_dispatches (expected_return_date)
  WHERE actual_return_date IS NULL;

-- Helpful for the historical SLA % calculation per vendor:
--   on_time = COUNT(actual <= expected) / COUNT(actual NOT NULL)
CREATE INDEX IF NOT EXISTS idx_tempering_returned_dates
  ON tempering_dispatches (actual_return_date)
  WHERE actual_return_date IS NOT NULL;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'tempering_dispatches'
--     AND column_name IN ('expected_return_date','actual_return_date');
-- SELECT indexname FROM pg_indexes WHERE tablename = 'tempering_dispatches';
-- ═══════════════════════════════════════════════════════════════════════
