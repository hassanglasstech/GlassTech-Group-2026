-- ═══════════════════════════════════════════════════════════════════════
-- Migration 063 — Sprint 36: Go-Live Readiness Dashboard
--
-- Single table: golive_checks — audit log of every readiness check run
-- by /admin/go-live. One row per (company, check_key, ran_at).
-- Lets owner / consultant compare readiness over time and prove to
-- auditors / stakeholders that pre-go-live verification was done.
--
-- Companion view: v_golive_latest — most-recent result per
-- (company, check_key) — used by the dashboard to render current state
-- without scanning history.
--
-- Also: pg_cron daily job to purge logs older than 90 days.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS golive_checks (
  id          BIGSERIAL PRIMARY KEY,
  company     TEXT        NOT NULL,
  check_key   TEXT        NOT NULL,   -- e.g. 'db_sales_invoices', 'cfg_branding'
  category    TEXT        NOT NULL,   -- 'database' | 'data' | 'config' | 'operations' | 'security'
  status      TEXT        NOT NULL CHECK (status IN ('pass', 'warning', 'fail', 'skipped')),
  message     TEXT,
  details     JSONB       DEFAULT '{}',
  ran_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ran_by      TEXT
);

CREATE INDEX IF NOT EXISTS idx_golive_company_key_ran
  ON golive_checks(company, check_key, ran_at DESC);

CREATE INDEX IF NOT EXISTS idx_golive_status
  ON golive_checks(status, ran_at DESC)
  WHERE status IN ('warning', 'fail');

ALTER TABLE golive_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "golive_checks_rw"      ON golive_checks;
DROP POLICY IF EXISTS "golive_checks_anon_rw" ON golive_checks;
CREATE POLICY "golive_checks_rw"      ON golive_checks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "golive_checks_anon_rw" ON golive_checks FOR ALL TO anon          USING (true) WITH CHECK (true);
GRANT ALL ON golive_checks TO authenticated, anon;
GRANT USAGE, SELECT ON SEQUENCE golive_checks_id_seq TO authenticated, anon;

-- ── Latest-status view (used by dashboard to render current state) ──
CREATE OR REPLACE VIEW v_golive_latest AS
SELECT DISTINCT ON (company, check_key)
  company,
  check_key,
  category,
  status,
  message,
  details,
  ran_at,
  ran_by
FROM golive_checks
ORDER BY company, check_key, ran_at DESC;

GRANT SELECT ON v_golive_latest TO authenticated, anon;

-- ── Aggregate view (per-company readiness score) ────────────────────
CREATE OR REPLACE VIEW v_golive_summary AS
SELECT
  company,
  COUNT(*) FILTER (WHERE status = 'pass')     AS pass_count,
  COUNT(*) FILTER (WHERE status = 'warning')  AS warning_count,
  COUNT(*) FILTER (WHERE status = 'fail')     AS fail_count,
  COUNT(*) FILTER (WHERE status = 'skipped')  AS skipped_count,
  COUNT(*)                                    AS total_count,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE status = 'pass') / NULLIF(COUNT(*), 0),
    1
  )                                           AS readiness_pct,
  MAX(ran_at)                                 AS last_ran_at
FROM v_golive_latest
GROUP BY company;

GRANT SELECT ON v_golive_summary TO authenticated, anon;

-- ── pg_cron: purge logs older than 90 days at 03:45 daily ───────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('golive_checks_purge') WHERE EXISTS
      (SELECT 1 FROM cron.job WHERE jobname = 'golive_checks_purge');
    PERFORM cron.schedule(
      'golive_checks_purge',
      '45 3 * * *',
      $cron$
        DELETE FROM golive_checks
         WHERE ran_at < now() - INTERVAL '90 days';
      $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron schedule skipped: %', SQLERRM;
END$$;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- SELECT * FROM v_golive_summary;
-- SELECT * FROM v_golive_latest WHERE company = 'Glassco' ORDER BY status, check_key;
-- SELECT check_key, status, COUNT(*) FROM golive_checks GROUP BY check_key, status ORDER BY check_key;
-- ═══════════════════════════════════════════════════════════════════════
