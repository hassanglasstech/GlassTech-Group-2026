-- ═══════════════════════════════════════════════════════════════════════
-- Migration 059 — HOTFIX for migration 058
--
-- Symptom (reported by Hassan, 2026-05-11):
--   ERROR: 42883: operator does not exist: timestamp with time zone - text
--   LINE 149: EXTRACT(EPOCH FROM (now() - last_snapshot_at))::BIGINT / 3600
--
-- Root cause:
--   `erp_backups.backup_date` was declared inconsistently across the
--   project history:
--     migration 002:                 TIMESTAMPTZ DEFAULT now()
--     migration 006:                 TEXT
--     MISSING_TABLES.sql:            TEXT
--     PHASE1_MASTER_MIGRATION.sql:   both (line 710 + 1070)
--   The deployed instance ended up with `backup_date TEXT`, so the view
--   in 058 — which uses `MAX(backup_date)` — produced a TEXT column,
--   and `now() - text` is undefined.
--
-- Fix:
--   1. Cast the column itself to TIMESTAMPTZ once and for all. Idempotent
--      via `pg_typeof` check so re-running is safe.
--   2. Recreate the erp_snapshot_summary view (DROP + CREATE — view
--      replacement of underlying column type can't use CREATE OR REPLACE).
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 1. Migrate column to TIMESTAMPTZ (idempotent)
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_type TEXT;
BEGIN
  SELECT data_type INTO v_type
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'erp_backups'
     AND column_name  = 'backup_date';

  IF v_type IS NULL THEN
    -- Column missing entirely — recreate as TIMESTAMPTZ
    ALTER TABLE erp_backups ADD COLUMN backup_date TIMESTAMPTZ DEFAULT now();
    RAISE NOTICE 'erp_backups.backup_date created as TIMESTAMPTZ.';
  ELSIF v_type = 'text' OR v_type = 'character varying' THEN
    -- Existing TEXT column → cast to TIMESTAMPTZ. Drop + recreate any
    -- view that depends on it first (CASCADE on the ALTER would do
    -- this implicitly, but explicit is safer).
    DROP VIEW IF EXISTS erp_snapshot_summary;
    DROP VIEW IF EXISTS erp_snapshot_index;

    ALTER TABLE erp_backups
      ALTER COLUMN backup_date TYPE TIMESTAMPTZ
      USING NULLIF(backup_date, '')::TIMESTAMPTZ;
    ALTER TABLE erp_backups
      ALTER COLUMN backup_date SET DEFAULT now();
    RAISE NOTICE 'erp_backups.backup_date converted from TEXT → TIMESTAMPTZ.';
  ELSIF v_type = 'timestamp with time zone' THEN
    RAISE NOTICE 'erp_backups.backup_date is already TIMESTAMPTZ — no change.';
  ELSE
    RAISE WARNING 'erp_backups.backup_date is type % — leaving alone.', v_type;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Recreate erp_snapshot_index (was dropped above if column was text)
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW erp_snapshot_index AS
  SELECT
    id,
    backup_date,
    meta->>'company'                   AS company,
    meta->>'label'                     AS label,
    record_count,
    table_count,
    meta->'counts'                     AS counts
  FROM erp_backups
  WHERE backup_type = 'phase5_snapshot'
  ORDER BY backup_date DESC;

GRANT SELECT ON erp_snapshot_index TO authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────
-- 3. Recreate erp_snapshot_summary (now that backup_date is TIMESTAMPTZ)
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW erp_snapshot_summary AS
WITH per_co AS (
  SELECT
    COALESCE(meta->>'company', 'ALL') AS company,
    COUNT(*)                          AS snapshot_count,
    MAX(backup_date)                  AS last_snapshot_at,
    SUM(record_count)                 AS total_records,
    SUM(pg_column_size(meta))         AS total_payload_bytes
  FROM erp_backups
  WHERE backup_type = 'phase5_snapshot'
  GROUP BY 1
)
SELECT
  company,
  snapshot_count,
  last_snapshot_at,
  EXTRACT(EPOCH FROM (now() - last_snapshot_at))::BIGINT / 3600 AS hours_since_last,
  total_records,
  total_payload_bytes,
  CASE
    WHEN now() - last_snapshot_at <= INTERVAL '26 hours' THEN 'healthy'
    WHEN now() - last_snapshot_at <= INTERVAL '48 hours' THEN 'warn'
    ELSE 'stale'
  END AS health
FROM per_co
ORDER BY company;

GRANT SELECT ON erp_snapshot_summary TO authenticated, anon;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────
-- -- Confirm column is now TIMESTAMPTZ
-- SELECT column_name, data_type
--   FROM information_schema.columns
--  WHERE table_name = 'erp_backups' AND column_name = 'backup_date';
-- -- expect: timestamp with time zone
--
-- -- View should resolve cleanly
-- SELECT * FROM erp_snapshot_summary;
-- ═══════════════════════════════════════════════════════════════════════
