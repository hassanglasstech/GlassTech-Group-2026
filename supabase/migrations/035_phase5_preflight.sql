-- ═══════════════════════════════════════════════════════════════════════
-- Migration 035 — Phase 5: Pre-flight verification + JSON backup helper
--
-- This migration is READ-MOSTLY. It does TWO things:
--
-- 1. Pre-flight verification:
--    SELECT-style queries that confirm migrations 032 / 033 / 034 are
--    fully applied and the schema additions Phases 1-3 depend on are in
--    place. Run this in Supabase SQL Editor before going live.
--
-- 2. erp_snapshot helper:
--    A SECURITY DEFINER function that grabs a JSONB snapshot of the
--    Sales / Production critical tables (clients, quotations, invoices,
--    payment_receipts, credit_notes, customer_complaints,
--    production_pieces, doc_serials) and stores it in `erp_backups`.
--    Cheap, in-database, lossless — call before any risky migration or
--    on a daily cron in addition to Supabase's PITR.
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 1. PRE-FLIGHT — confirm Phase-1/2/3 migrations are applied
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_missing TEXT := '';
BEGIN
  -- Phase-1 (032) — invoices flat columns
  PERFORM 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'total_amount';
  IF NOT FOUND THEN v_missing := v_missing || 'invoices.total_amount, '; END IF;

  PERFORM 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'reverted_status';
  IF NOT FOUND THEN v_missing := v_missing || 'invoices.reverted_status, '; END IF;

  -- Phase-1 (032) — clients flat columns
  PERFORM 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'credit_limit';
  IF NOT FOUND THEN v_missing := v_missing || 'clients.credit_limit, '; END IF;

  -- Phase-1 (032) — quotations flat columns
  PERFORM 1 FROM information_schema.columns
    WHERE table_name = 'quotations' AND column_name = 'order_no';
  IF NOT FOUND THEN v_missing := v_missing || 'quotations.order_no, '; END IF;

  -- Phase-1 (032) — credit_notes table
  PERFORM 1 FROM information_schema.tables
    WHERE table_name = 'credit_notes';
  IF NOT FOUND THEN v_missing := v_missing || 'credit_notes(table), '; END IF;

  -- Phase-2 (033) — doc_serials table + RPC
  PERFORM 1 FROM information_schema.tables
    WHERE table_name = 'doc_serials';
  IF NOT FOUND THEN v_missing := v_missing || 'doc_serials(table), '; END IF;

  PERFORM 1 FROM pg_proc WHERE proname = 'allocate_serial';
  IF NOT FOUND THEN v_missing := v_missing || 'allocate_serial(rpc), '; END IF;

  -- Phase-2 (032) — process_payment_receipt RPC (single-user friendly version)
  PERFORM 1 FROM pg_proc WHERE proname = 'process_payment_receipt';
  IF NOT FOUND THEN v_missing := v_missing || 'process_payment_receipt(rpc), '; END IF;

  -- Phase-3 (034) — customer_complaints table
  PERFORM 1 FROM information_schema.tables
    WHERE table_name = 'customer_complaints';
  IF NOT FOUND THEN v_missing := v_missing || 'customer_complaints(table), '; END IF;

  IF v_missing <> '' THEN
    RAISE EXCEPTION 'PRE-FLIGHT FAILED — missing schema objects: %. Apply migrations 032, 033, 034 first.',
      rtrim(v_missing, ', ');
  END IF;

  RAISE NOTICE 'PRE-FLIGHT OK — Phase-1/2/3 migrations confirmed applied.';
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. erp_snapshot — in-DB JSONB snapshot helper for Sales-critical tables
--
-- Usage:
--   SELECT erp_snapshot('Glassco', 'before_phase5_golive');
--
-- Returns:
--   JSONB { backup_id, table_counts, captured_at }
--
-- Stores:
--   1 row in erp_backups with a JSONB payload of all rows from the
--   snapshotted tables for the given company. Restorable by
--   erp_snapshot_restore() (manual write — see runbook).
-- ─────────────────────────────────────────────────────────────────────
-- ─────────────────────────────────────────────────────────────────────
-- 1b. Ensure erp_backups has all required columns (table may pre-date them)
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE erp_backups ADD COLUMN IF NOT EXISTS backup_type  TEXT;
ALTER TABLE erp_backups ADD COLUMN IF NOT EXISTS table_count  INTEGER DEFAULT 0;
ALTER TABLE erp_backups ADD COLUMN IF NOT EXISTS record_count INTEGER DEFAULT 0;
ALTER TABLE erp_backups ADD COLUMN IF NOT EXISTS source       TEXT;
ALTER TABLE erp_backups ADD COLUMN IF NOT EXISTS meta         JSONB DEFAULT '{}';

CREATE OR REPLACE FUNCTION erp_snapshot(
  p_company TEXT DEFAULT NULL,    -- NULL = all companies
  p_label   TEXT DEFAULT 'manual'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id      TEXT := 'SNAP-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || COALESCE(p_company, 'ALL');
  v_payload JSONB := '{}'::JSONB;
  v_counts  JSONB := '{}'::JSONB;
  v_count   BIGINT;
  v_table   TEXT;
  v_rows    JSONB;
  -- Sales / Production critical tables Phases 1-4 mutate
  v_tables  TEXT[] := ARRAY[
    'clients', 'quotations', 'invoices', 'payment_receipts',
    'credit_notes', 'customer_complaints', 'production_pieces',
    'doc_serials'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF p_company IS NULL OR v_table = 'doc_serials' THEN
      EXECUTE format('SELECT to_jsonb(array_agg(t)) FROM %I t', v_table) INTO v_rows;
      EXECUTE format('SELECT count(*) FROM %I', v_table) INTO v_count;
    ELSE
      EXECUTE format('SELECT to_jsonb(array_agg(t)) FROM %I t WHERE company = $1', v_table)
        USING p_company INTO v_rows;
      EXECUTE format('SELECT count(*) FROM %I WHERE company = $1', v_table)
        USING p_company INTO v_count;
    END IF;
    v_payload := v_payload || jsonb_build_object(v_table, COALESCE(v_rows, '[]'::JSONB));
    v_counts  := v_counts  || jsonb_build_object(v_table, v_count);
  END LOOP;

  INSERT INTO erp_backups (id, backup_date, backup_type, table_count, record_count, source, meta)
  VALUES (
    v_id, now(), 'phase5_snapshot',
    array_length(v_tables, 1),
    (SELECT COALESCE(SUM(value::BIGINT), 0) FROM jsonb_each_text(v_counts)),
    'erp_snapshot()',
    jsonb_build_object(
      'company',     COALESCE(p_company, 'ALL'),
      'label',       p_label,
      'counts',      v_counts,
      'tables',      to_jsonb(v_tables),
      'payload',     v_payload
    )
  );

  RETURN jsonb_build_object(
    'backup_id',    v_id,
    'company',      COALESCE(p_company, 'ALL'),
    'label',        p_label,
    'table_counts', v_counts,
    'captured_at',  now()
  );
END $$;

REVOKE EXECUTE ON FUNCTION erp_snapshot(TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION erp_snapshot(TEXT, TEXT) TO authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────
-- 3. erp_snapshot_inspect — read snapshot counts without rehydrating data
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

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────
-- 4. PRE-FLIGHT REPORT (read-only — paste in SQL Editor before go-live)
-- ─────────────────────────────────────────────────────────────────────
-- -- Phase-1 invoice columns sanity:
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'invoices'
--     AND column_name IN ('order_id','total_amount','received_amount','balance',
--                         'status','payments','items','reverted_status')
--   ORDER BY column_name;
--
-- -- Phase-1 client columns:
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'clients'
--     AND column_name IN ('contact_person','email','phone','ntn','credit_limit','status')
--   ORDER BY column_name;
--
-- -- Phase-1 credit_notes shape:
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'credit_notes' ORDER BY ordinal_position;
--
-- -- Phase-2 serial allocator smoke test:
-- SELECT allocate_serial('PRE-FLIGHT', 'TEST', extract(year from now())::INT, 1);
-- SELECT allocate_serial('PRE-FLIGHT', 'TEST', extract(year from now())::INT, 1);
-- -- Expect: returns 1, then 2
--
-- -- Phase-3 customer_complaints shape:
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'customer_complaints'
--   ORDER BY ordinal_position;
--
-- -- Snapshot before go-live:
-- SELECT erp_snapshot('Glassco', 'before_phase5_golive');
-- SELECT * FROM erp_snapshot_index LIMIT 5;
-- ═══════════════════════════════════════════════════════════════════════
