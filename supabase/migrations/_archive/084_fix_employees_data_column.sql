-- ============================================================================
-- 084 — Fix employee persistence: ensure JSONB `data` column + relax NOT NULL
-- ============================================================================
-- Symptom: saving a new HR employee showed NO console error, but the record
-- vanished on refresh. Root cause: the live `employees` table is JSONB-style
-- (id, company, personal jsonb, work jsonb, salary jsonb, updated_at) with NO
-- `department_id` / `status` flat columns and (originally) no `data` column,
-- but the Sync push wrote those columns → every upsert 400'd and was skipped,
-- so the employee never reached Supabase. The app now reads/writes employees
-- through the JSONB `data` column (SyncService TABLE_PUSH/PULL.employees +
-- HRService.rowToEmployee).
--
-- ALREADY APPLIED to the live shared Supabase (run manually 2026-06-29). This
-- file exists for repo rebuildability. Idempotent — safe to run again.
-- ============================================================================

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS data       jsonb       DEFAULT '{}'::jsonb;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS company    text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Relax NOT NULL on any legacy flat columns so the data-centric upsert
-- (id, company, personal/work/salary/data, updated_at) can never be blocked.
DO $$
DECLARE col text;
BEGIN
  FOR col IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'employees'
      AND is_nullable  = 'NO'
      AND column_name <> 'id'
  LOOP
    EXECUTE format('ALTER TABLE public.employees ALTER COLUMN %I DROP NOT NULL', col);
  END LOOP;
END $$;
