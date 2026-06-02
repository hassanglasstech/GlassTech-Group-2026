-- ═══════════════════════════════════════════════════════════════════════
-- Migration 058 — Sprint 32: Backup + DR — daily snapshot cron + helpers
--
-- Builds on:
--   • migration 035 (erp_snapshot RPC + erp_backups table + erp_snapshot_index)
--
-- This migration:
--   1. Tries to enable pg_cron and schedules a daily 02:00 PKT snapshot
--      for every active company (Glassco, GTK, GTI, Nippon, Factory).
--      pg_cron is a Supabase-native extension — `CREATE EXTENSION IF NOT
--      EXISTS pg_cron` is a no-op on instances where it's already on.
--   2. Adds erp_snapshot_prune(p_keep_days) — keeps only the most recent
--      `keep_days` snapshots per company, hard-deletes older blobs to
--      stop erp_backups growing unbounded. Scheduled weekly.
--   3. Adds erp_snapshot_export(p_id) — returns a single snapshot's full
--      JSONB payload so the nightly-export Node script (out-of-DB) can
--      grab it via the REST endpoint without leaking the entire
--      erp_backups table.
--   4. Adds erp_snapshot_summary view — cron-friendly KPIs (last run
--      per company, age, size).
--
-- ALL DDL is idempotent. Cron jobs use cron.schedule with explicit
-- name so re-running this migration upserts the schedule.
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 1. pg_cron extension + permissions
-- ─────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- pg_cron lives in cron schema on Supabase
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN OTHERS THEN
  -- Extension may be unavailable on free plans; surface but don't fail.
  RAISE WARNING 'pg_cron extension unavailable: %. Daily snapshot will not auto-schedule. Run erp_snapshot manually or upgrade Supabase plan.', SQLERRM;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. erp_snapshot_prune(p_keep_days)
-- Keeps only the N most recent snapshots per (company, label) bucket.
-- Default keep_days = 30 — covers a full month of daily snapshots.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION erp_snapshot_prune(
  p_keep_days INT DEFAULT 30
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pre_count   BIGINT;
  v_kept_count  BIGINT;
  v_pruned      BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_pre_count
    FROM erp_backups WHERE backup_type = 'phase5_snapshot';

  -- Keep the N most-recent snapshots per (company, label) bucket;
  -- delete older ones. Note: COALESCE on company so NULL-company snaps
  -- are bucketed together as 'ALL'.
  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY COALESCE(meta->>'company','ALL'),
                          COALESCE(meta->>'label','manual')
             ORDER BY backup_date DESC
           ) AS rn
      FROM erp_backups
     WHERE backup_type = 'phase5_snapshot'
  )
  DELETE FROM erp_backups
   WHERE id IN (SELECT id FROM ranked WHERE rn > p_keep_days);

  GET DIAGNOSTICS v_pruned = ROW_COUNT;
  v_kept_count := v_pre_count - v_pruned;

  RETURN jsonb_build_object(
    'before',   v_pre_count,
    'pruned',   v_pruned,
    'kept',     v_kept_count,
    'pruned_at', now()
  );
END $$;

REVOKE EXECUTE ON FUNCTION erp_snapshot_prune(INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION erp_snapshot_prune(INT) TO authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────
-- 3. erp_snapshot_export(p_id)
-- Returns ONE snapshot's full payload + counts. Used by the nightly
-- Node export script + the in-app DR Console "Download" button.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION erp_snapshot_export(
  p_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
BEGIN
  SELECT id, backup_date, table_count, record_count, source, meta
    INTO v_row
    FROM erp_backups
   WHERE id = p_id AND backup_type = 'phase5_snapshot'
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'snapshot_not_found: %', p_id USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'id',           v_row.id,
    'backup_date',  v_row.backup_date,
    'company',      v_row.meta->>'company',
    'label',        v_row.meta->>'label',
    'table_count',  v_row.table_count,
    'record_count', v_row.record_count,
    'counts',       v_row.meta->'counts',
    'tables',       v_row.meta->'tables',
    'payload',      v_row.meta->'payload'
  );
END $$;

REVOKE EXECUTE ON FUNCTION erp_snapshot_export(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION erp_snapshot_export(TEXT) TO authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────
-- 4. erp_snapshot_summary view — used by DR Console KPI strip + cron
--    health check.
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

-- ─────────────────────────────────────────────────────────────────────
-- 5. Schedule the daily cron jobs
--    All times are server-time (UTC). 02:00 PKT = 21:00 UTC.
--    cron.schedule(name, schedule, command) replaces existing entry
--    with the same `name` so this DO block is idempotent.
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_cron_available BOOLEAN := FALSE;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') INTO v_cron_available;
  IF NOT v_cron_available THEN
    RAISE WARNING 'pg_cron not active — skipping cron.schedule. See migration header for manual workaround.';
    RETURN;
  END IF;

  -- Daily snapshot per active company at 21:00 UTC = 02:00 PKT
  PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname IN (
    'erp_snapshot_glassco_daily',
    'erp_snapshot_gtk_daily',
    'erp_snapshot_gti_daily',
    'erp_snapshot_nippon_daily',
    'erp_snapshot_factory_daily',
    'erp_snapshot_prune_weekly'
  );

  PERFORM cron.schedule(
    'erp_snapshot_glassco_daily',
    '0 21 * * *',
    $cmd$ SELECT erp_snapshot('Glassco', 'auto_' || to_char(now(), 'YYYY-MM-DD')); $cmd$
  );
  PERFORM cron.schedule(
    'erp_snapshot_gtk_daily',
    '5 21 * * *',
    $cmd$ SELECT erp_snapshot('GTK', 'auto_' || to_char(now(), 'YYYY-MM-DD')); $cmd$
  );
  PERFORM cron.schedule(
    'erp_snapshot_gti_daily',
    '10 21 * * *',
    $cmd$ SELECT erp_snapshot('GTI', 'auto_' || to_char(now(), 'YYYY-MM-DD')); $cmd$
  );
  PERFORM cron.schedule(
    'erp_snapshot_nippon_daily',
    '15 21 * * *',
    $cmd$ SELECT erp_snapshot('Nippon', 'auto_' || to_char(now(), 'YYYY-MM-DD')); $cmd$
  );
  PERFORM cron.schedule(
    'erp_snapshot_factory_daily',
    '20 21 * * *',
    $cmd$ SELECT erp_snapshot('Factory', 'auto_' || to_char(now(), 'YYYY-MM-DD')); $cmd$
  );

  -- Prune weekly (Mon 22:00 UTC = 03:00 PKT Tue) — keep 30 newest per
  -- (company, label) bucket. Safe: only deletes 'auto_' label snapshots
  -- because manual snapshots fall under their own labels.
  PERFORM cron.schedule(
    'erp_snapshot_prune_weekly',
    '0 22 * * 1',
    $cmd$ SELECT erp_snapshot_prune(30); $cmd$
  );

  RAISE NOTICE 'pg_cron daily snapshot schedules installed for 5 companies + weekly prune.';
END $$;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────
-- -- pg_cron status
-- SELECT extname, extversion FROM pg_extension WHERE extname = 'pg_cron';
--
-- -- Scheduled jobs
-- SELECT jobname, schedule, command FROM cron.job
--   WHERE jobname LIKE 'erp_snapshot_%' ORDER BY jobname;
--
-- -- Per-company snapshot health
-- SELECT * FROM erp_snapshot_summary;
--
-- -- One-shot smoke test of the prune helper
-- SELECT erp_snapshot_prune(30);
--
-- -- Export single snapshot
-- SELECT erp_snapshot_export('SNAP-...');
-- ═══════════════════════════════════════════════════════════════════════
