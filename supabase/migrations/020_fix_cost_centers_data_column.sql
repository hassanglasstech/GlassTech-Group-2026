-- ══════════════════════════════════════════════════════════════════════
-- Migration 020 — Fix cost_centers missing `data` JSONB column
--
-- Problem : financeService.ts → saveCostCenters() upserts a `data` JSONB
--           field (budget_monthly, budget_yearly, alert_threshold) but the
--           live Supabase table is missing this column (was defined in 001
--           but either never applied or dropped manually).
-- Error   : "Could not find the 'data' column of 'cost_centers' in the
--            schema cache" → 400 on every cost_centers upsert.
-- Fix     : Restore the column idempotently; backfill existing rows with
--           empty object so rowToCostCenter() reads defaults cleanly.
-- ══════════════════════════════════════════════════════════════════════

-- 1. Add the missing column (safe — IF NOT EXISTS guard)
ALTER TABLE cost_centers
  ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}';

-- 2. Backfill existing rows: any row without budget data gets an empty obj
UPDATE cost_centers
   SET data = '{}'::jsonb
 WHERE data IS NULL;

-- 3. Notify PostgREST to reload its schema cache immediately
--    (prevents stale 400s until the next auto-reload cycle)
NOTIFY pgrst, 'reload schema';
