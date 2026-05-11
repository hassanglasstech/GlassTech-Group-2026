-- ═══════════════════════════════════════════════════════════════════════
-- Migration 061 — Sprint 34: Performance at Scale — index catch-up
--
-- 6-month projection: 36k invoices, 10k pieces in flight, 5GB DB.
-- This migration adds the indexes the system *will* need on the WHERE
-- columns we filter/order by most. Idempotent — IF NOT EXISTS everywhere.
--
-- Strategy:
--   • Composite indexes for (company, status, date) — every list view
--   • Partial indexes on un-deleted/active rows — narrows the planner
--   • CONCURRENTLY where safe; this migration assumes a maintenance
--     window (we run via CLI, not in a transaction)
--
-- WHAT WE INDEX:
--   sales_invoices         — (company, status, invoice_date)
--   sales_orders           — (company, status, order_date)
--   production_pieces      — (company, status, updated_at)
--   ledger                 — (company, posting_date)  + (company, account_id, posting_date)
--   payments               — (company, payment_date)
--   purchase_orders        — (company, status, po_date)
--   grn_headers            — (company, grn_date)
--   stock_ledger           — (company, item_id, posting_date)
--   activity_log           — (entity_table, entity_id, created_at)
--   notifications          — (user_id, is_read, created_at)
--
-- Tables that don't exist on a given install are skipped (DO block guard).
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  t TEXT;
  c TEXT;
  ix RECORD;
  -- (table, index_name, column_list)
  defs CONSTANT TEXT[][] := ARRAY[
    ['sales_invoices',     'idx_sales_invoices_co_status_date',    '(company, status, invoice_date DESC)'],
    ['sales_invoices',     'idx_sales_invoices_client',            '(client_id)'],
    ['sales_invoices',     'idx_sales_invoices_due',               '(due_date) WHERE status <> ''Paid'''],
    ['sales_orders',       'idx_sales_orders_co_status_date',      '(company, status, order_date DESC)'],
    ['sales_orders',       'idx_sales_orders_client',              '(client_id)'],
    ['production_pieces',  'idx_production_pieces_co_status',      '(company, status, updated_at DESC)'],
    ['production_pieces',  'idx_production_pieces_order',          '(order_id)'],
    ['production_pieces',  'idx_production_pieces_active',         '(updated_at DESC) WHERE status NOT IN (''dispatched'',''cancelled'',''ncr'')'],
    ['ledger',             'idx_ledger_co_date',                   '(company, posting_date DESC)'],
    ['ledger',             'idx_ledger_co_account_date',           '(company, account_id, posting_date DESC)'],
    ['ledger',             'idx_ledger_ref',                       '(reference_id) WHERE reference_id IS NOT NULL'],
    ['payments',           'idx_payments_co_date',                 '(company, payment_date DESC)'],
    ['payments',           'idx_payments_invoice',                 '(invoice_id) WHERE invoice_id IS NOT NULL'],
    ['purchase_orders',    'idx_purchase_orders_co_status_date',   '(company, status, po_date DESC)'],
    ['purchase_orders',    'idx_purchase_orders_vendor',           '(vendor_id)'],
    ['grn_headers',        'idx_grn_headers_co_date',              '(company, grn_date DESC)'],
    ['grn_headers',        'idx_grn_headers_po',                   '(po_id) WHERE po_id IS NOT NULL'],
    ['stock_ledger',       'idx_stock_ledger_co_item_date',        '(company, item_id, posting_date DESC)'],
    ['stock_ledger',       'idx_stock_ledger_ref',                 '(reference_id) WHERE reference_id IS NOT NULL'],
    ['activity_log',       'idx_activity_log_entity',              '(entity_table, entity_id, created_at DESC)'],
    ['activity_log',       'idx_activity_log_actor',               '(actor_id, created_at DESC)'],
    ['notifications',      'idx_notifications_user_unread',        '(user_id, is_read, created_at DESC)']
  ];
  i INT;
BEGIN
  FOR i IN 1 .. array_length(defs, 1) LOOP
    t := defs[i][1];
    -- skip tables that don't exist on this install
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t) THEN
      RAISE NOTICE 'skip: table % not present', t;
      CONTINUE;
    END IF;
    -- skip if all referenced columns aren't there (cheap parse — split on commas/spaces, check each token if it looks like a column)
    -- For idempotency we just try CREATE INDEX IF NOT EXISTS and swallow errors per-statement.
    BEGIN
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I %s', defs[i][2], t, defs[i][3]);
      RAISE NOTICE 'index ok: %.%', t, defs[i][2];
    EXCEPTION WHEN undefined_column THEN
      RAISE NOTICE 'skip (missing col): %.% — %', t, defs[i][2], SQLERRM;
    WHEN duplicate_table THEN
      RAISE NOTICE 'skip (already exists): %.%', t, defs[i][2];
    WHEN OTHERS THEN
      RAISE NOTICE 'skip (error): %.% — %', t, defs[i][2], SQLERRM;
    END;
  END LOOP;
END$$;

-- ─────────────────────────────────────────────────────────────────────
-- Sprint 34: helper table for client-side perf telemetry uploads
-- (lightweight; client posts batches, we keep last 30 days)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS perf_telemetry (
  id          BIGSERIAL PRIMARY KEY,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id     TEXT,
  company     TEXT,
  metric      TEXT NOT NULL,            -- 'boot' | 'query' | 'localStorage' | 'route'
  label       TEXT NOT NULL,            -- 'init' | 'sales_invoices' | '/finance/billing' | etc.
  ms          NUMERIC,                  -- duration if applicable
  bytes       BIGINT,                   -- size if applicable
  rows        INT,                      -- row count if applicable
  payload     JSONB DEFAULT '{}'        -- extra context
);

CREATE INDEX IF NOT EXISTS idx_perf_telemetry_metric_time ON perf_telemetry(metric, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_perf_telemetry_label_time  ON perf_telemetry(label, recorded_at DESC);

ALTER TABLE perf_telemetry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "perf_telemetry_rw"      ON perf_telemetry;
DROP POLICY IF EXISTS "perf_telemetry_anon_rw" ON perf_telemetry;
CREATE POLICY "perf_telemetry_rw"      ON perf_telemetry FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "perf_telemetry_anon_rw" ON perf_telemetry FOR ALL TO anon          USING (true) WITH CHECK (true);
GRANT ALL ON perf_telemetry TO authenticated, anon;
GRANT USAGE, SELECT ON SEQUENCE perf_telemetry_id_seq TO authenticated, anon;

-- nightly purge — keep 30 days (re-uses pg_cron from Sprint 32 if present)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('perf_telemetry_purge') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='perf_telemetry_purge');
    PERFORM cron.schedule(
      'perf_telemetry_purge',
      '15 3 * * *',
      $cron$ DELETE FROM perf_telemetry WHERE recorded_at < now() - INTERVAL '30 days'; $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron purge schedule skipped: %', SQLERRM;
END$$;

-- ─────────────────────────────────────────────────────────────────────
-- Roll-up view — last 24h aggregates for the HealthMetrics dashboard
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_perf_last24h AS
SELECT
  metric,
  label,
  COUNT(*)                            AS samples,
  ROUND(AVG(ms)::NUMERIC, 2)          AS avg_ms,
  ROUND((PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY ms))::NUMERIC, 2) AS p50_ms,
  ROUND((PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ms))::NUMERIC, 2) AS p95_ms,
  MAX(ms)                             AS max_ms,
  MAX(recorded_at)                    AS last_seen_at
FROM perf_telemetry
WHERE recorded_at >= now() - INTERVAL '24 hours'
  AND ms IS NOT NULL
GROUP BY metric, label
ORDER BY p95_ms DESC NULLS LAST;

GRANT SELECT ON v_perf_last24h TO authenticated, anon;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────
-- SELECT schemaname, tablename, indexname FROM pg_indexes
--   WHERE indexname LIKE 'idx_%' ORDER BY tablename, indexname;
-- SELECT * FROM v_perf_last24h LIMIT 20;
-- ═══════════════════════════════════════════════════════════════════════
