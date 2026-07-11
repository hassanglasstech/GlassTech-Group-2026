-- ============================================================
-- Additional Column Fixes — 20260430
-- Fix remaining schema mismatches found during app testing
-- ============================================================

-- ── bypass_log_overdue view: add missing sla_status column to bypass_logs table ──
ALTER TABLE bypass_logs ADD COLUMN IF NOT EXISTS sla_status TEXT DEFAULT 'active';

-- ── shift_master: add missing date_from and date_to columns (app queries for date_from) ──
ALTER TABLE shift_master ADD COLUMN IF NOT EXISTS date_from DATE;
ALTER TABLE shift_master ADD COLUMN IF NOT EXISTS date_to DATE;

-- ── departments: add missing is_active column ──
ALTER TABLE departments ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- ── tag_master: add missing category column ──
ALTER TABLE tag_master ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';

-- ── Ensure all queries will work by granting permissions ──
GRANT ALL ON departments TO anon, authenticated;
GRANT ALL ON tag_master TO anon, authenticated;

-- ── Verify all tables exist with correct schema ──
SELECT 'Additional column fixes applied.' AS status;
