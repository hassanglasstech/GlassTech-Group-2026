-- ═══════════════════════════════════════════════════════════════════════
-- Migration 062 — Sprint 35: Notifications + Alerts
--
-- Two new tables:
--
--   erp_alerts         — one row per fired alert (overdue invoice, GL
--                        imbalance, low stock, etc.). Supabase-backed so
--                        alerts survive page refresh and are visible
--                        across devices / browser tabs.
--
--   alert_thresholds   — per-company config for what triggers each alert
--                        type (30-day invoice overdue, 7-day tempering,
--                        sync queue >50, etc.) + digest email +
--                        WhatsApp webhook URL for critical alerts.
--
-- Also: pg_cron daily job to expire old dismissed alerts (30-day TTL).
-- ═══════════════════════════════════════════════════════════════════════

-- ── ERP Alerts ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp_alerts (
  id             BIGSERIAL PRIMARY KEY,
  company        TEXT        NOT NULL,
  type           TEXT        NOT NULL,  -- 'overdue_invoice' | 'low_stock' | 'gl_imbalance'
                                        -- | 'sync_queue' | 'tempering_overdue' | 'pr_pending'
                                        -- | 'cutter_target' | 'custom'
  severity       TEXT        NOT NULL DEFAULT 'info'
                             CHECK (severity IN ('info', 'warning', 'critical')),
  title          TEXT        NOT NULL,
  body           TEXT,
  link           TEXT,                  -- hash route: '#/finance/billing'
  reference_id   TEXT,                  -- e.g. invoice id, item id
  is_read        BOOLEAN     NOT NULL DEFAULT false,
  is_dismissed   BOOLEAN     NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ,           -- auto-clear after this timestamp
  data           JSONB       DEFAULT '{}'  -- forward-compat payload
);

CREATE INDEX IF NOT EXISTS idx_erp_alerts_company_unread
  ON erp_alerts(company, is_read, is_dismissed, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_erp_alerts_type_ref
  ON erp_alerts(type, reference_id)
  WHERE is_dismissed = false;

-- IMMUTABLE wrapper so we can use the date in a unique index.
-- Plain `created_at::date` is STABLE (depends on session timezone) and
-- Postgres rejects it in index expressions. UTC is a fixed offset so
-- this conversion is effectively immutable in practice.
CREATE OR REPLACE FUNCTION erp_alerts_dedup_date(ts TIMESTAMPTZ)
RETURNS DATE
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$ SELECT (ts AT TIME ZONE 'UTC')::date $$;

-- unique partial index — prevents duplicate alerts for same entity on same day
CREATE UNIQUE INDEX IF NOT EXISTS idx_erp_alerts_daily_dedup
  ON erp_alerts(company, type, reference_id, erp_alerts_dedup_date(created_at))
  WHERE reference_id IS NOT NULL AND is_dismissed = false;

ALTER TABLE erp_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "erp_alerts_rw"      ON erp_alerts;
DROP POLICY IF EXISTS "erp_alerts_anon_rw" ON erp_alerts;
CREATE POLICY "erp_alerts_rw"      ON erp_alerts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "erp_alerts_anon_rw" ON erp_alerts FOR ALL TO anon          USING (true) WITH CHECK (true);
GRANT ALL ON erp_alerts TO authenticated, anon;
GRANT USAGE, SELECT ON SEQUENCE erp_alerts_id_seq TO authenticated, anon;

-- ── Alert Thresholds (per-company config) ─────────────────────────────
CREATE TABLE IF NOT EXISTS alert_thresholds (
  id                          TEXT PRIMARY KEY,  -- = company name
  company                     TEXT NOT NULL UNIQUE,
  -- Invoice
  invoice_overdue_days        INT         NOT NULL DEFAULT 30,
  -- Tempering vendor SLA
  tempering_overdue_days      INT         NOT NULL DEFAULT 7,
  -- Purchase requisition approval wait
  pr_approval_overdue_days    INT         NOT NULL DEFAULT 3,
  -- Sync queue
  sync_queue_threshold        INT         NOT NULL DEFAULT 50,
  -- GL imbalance tolerance (PKR — anything above this fires alert)
  gl_imbalance_tolerance      NUMERIC     NOT NULL DEFAULT 0.01,
  -- Stock below reorder — 0 = disabled, N = fire when qty < N
  low_stock_threshold         INT         NOT NULL DEFAULT 0,
  -- Daily digest
  daily_digest_enabled        BOOLEAN     NOT NULL DEFAULT false,
  digest_email                TEXT,
  digest_time                 TEXT        NOT NULL DEFAULT '08:00',  -- 'HH:MM' PKT
  -- WhatsApp webhook for critical alerts (POST JSON {title, body, severity})
  whatsapp_webhook_url        TEXT,
  -- Pause all alerts during off-hours (true = suppress outside 08:00–22:00 PKT)
  suppress_offhours           BOOLEAN     NOT NULL DEFAULT false,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  data                        JSONB       DEFAULT '{}'
);

ALTER TABLE alert_thresholds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "alert_thresholds_rw"      ON alert_thresholds;
DROP POLICY IF EXISTS "alert_thresholds_anon_rw" ON alert_thresholds;
CREATE POLICY "alert_thresholds_rw"      ON alert_thresholds FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "alert_thresholds_anon_rw" ON alert_thresholds FOR ALL TO anon          USING (true) WITH CHECK (true);
GRANT ALL ON alert_thresholds TO authenticated, anon;

-- seed default thresholds for active companies
INSERT INTO alert_thresholds (id, company) VALUES
  ('Glassco', 'Glassco'),
  ('GTK',     'GTK'),
  ('GTI',     'GTI'),
  ('Nippon',  'Nippon'),
  ('Factory', 'Factory')
ON CONFLICT (id) DO NOTHING;

-- ── Unread count view (used by bell badge) ───────────────────────────
CREATE OR REPLACE VIEW v_alert_unread AS
SELECT
  company,
  COUNT(*)                                         AS total_unread,
  COUNT(*) FILTER (WHERE severity = 'critical')    AS critical_count,
  COUNT(*) FILTER (WHERE severity = 'warning')     AS warning_count,
  COUNT(*) FILTER (WHERE severity = 'info')        AS info_count,
  MAX(created_at)                                  AS latest_at
FROM erp_alerts
WHERE is_read = false AND is_dismissed = false
GROUP BY company;

GRANT SELECT ON v_alert_unread TO authenticated, anon;

-- ── pg_cron: expire dismissed + old alerts daily at 02:30 ───────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('erp_alerts_expire') WHERE EXISTS
      (SELECT 1 FROM cron.job WHERE jobname = 'erp_alerts_expire');
    PERFORM cron.schedule(
      'erp_alerts_expire',
      '30 2 * * *',
      $cron$
        DELETE FROM erp_alerts
         WHERE (is_dismissed = true AND created_at < now() - INTERVAL '7 days')
            OR (created_at < now() - INTERVAL '30 days');
      $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron schedule skipped: %', SQLERRM;
END$$;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- SELECT id, company, severity, title, created_at FROM erp_alerts ORDER BY created_at DESC LIMIT 10;
-- SELECT * FROM v_alert_unread;
-- SELECT * FROM alert_thresholds;
-- ═══════════════════════════════════════════════════════════════════════
