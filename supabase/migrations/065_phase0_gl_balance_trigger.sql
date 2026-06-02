-- ═══════════════════════════════════════════════════════════════════════
-- Migration 065 — Phase 0 (Brutal Report fix #4):
-- Enforce GL balance at the database layer
--
-- Problem identified by the consulting team:
--   Today, GL imbalance is DETECTED via alertService (Sprint 35) only
--   AFTER imbalanced rows are already in the ledger. There is no
--   PREVENTION at the database layer. An attacker (or a buggy client)
--   that calls Supabase REST directly can post:
--     INSERT INTO ledger (..., status='Posted', details=[{debit:1000, credit:0}])
--   and the trial balance silently breaks.
--
--   FinanceService.assertGLBalance() exists in the client code (BillingHub
--   uses it) but it's bypassable. This migration adds the belt-and-braces
--   server-side guard that no client can avoid.
--
-- What this trigger does:
--   • Fires BEFORE INSERT or UPDATE on `ledger`
--   • If status = 'Posted', sums DR and CR from the `details` JSONB array
--     (with `data->'details'` as fallback for legacy rows)
--   • Rejects the write if |DR - CR| > 0.01 PKR (1 paisa tolerance)
--   • Draft / Parked / Reversed entries are exempt — work in progress is OK
--
-- Migration order: must run AFTER 003 (which adds doc_type, details, etc.)
-- ═══════════════════════════════════════════════════════════════════════

-- ── Helper: compute the imbalance amount for a ledger row ───────────
CREATE OR REPLACE FUNCTION ledger_row_imbalance(
  p_status  TEXT,
  p_details JSONB,
  p_data    JSONB
) RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  d        JSONB;
  total_dr NUMERIC := 0;
  total_cr NUMERIC := 0;
  line     JSONB;
BEGIN
  -- Only enforce on Posted; Draft/Parked/Reversed are exempt
  IF p_status IS NULL OR p_status NOT IN ('Posted', 'posted') THEN
    RETURN 0;
  END IF;

  -- Prefer the top-level `details` column, fall back to data->'details'
  -- for older rows that stored everything in JSONB
  d := COALESCE(p_details, p_data -> 'details');

  IF d IS NULL OR jsonb_typeof(d) <> 'array' THEN
    -- No lines at all on a Posted entry is an error in itself, but we
    -- treat that case as "not balanced" by returning a sentinel value
    -- the trigger will reject.
    RETURN 999999999;
  END IF;

  FOR line IN SELECT * FROM jsonb_array_elements(d) LOOP
    total_dr := total_dr + COALESCE((line ->> 'debit') ::NUMERIC, 0);
    total_cr := total_cr + COALESCE((line ->> 'credit')::NUMERIC, 0);
  END LOOP;

  RETURN total_dr - total_cr;
END;
$$;

-- ── Trigger function: enforce balance on every Posted write ─────────
CREATE OR REPLACE FUNCTION enforce_ledger_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  imbalance NUMERIC;
  tolerance NUMERIC := 0.01;  -- 1 paisa — strict
  total_dr  NUMERIC := 0;
  total_cr  NUMERIC := 0;
  line      JSONB;
  d         JSONB;
BEGIN
  imbalance := ledger_row_imbalance(NEW.status, NEW.details, NEW.data);

  -- Sentinel: missing details on Posted entry
  IF imbalance = 999999999 THEN
    RAISE EXCEPTION
      'Ledger entry % cannot be Posted without a details array (DR/CR lines)',
      NEW.id
      USING ERRCODE = '23514'; -- check_violation
  END IF;

  IF ABS(imbalance) > tolerance THEN
    -- Recompute totals for the error message (cheap, only runs on error)
    d := COALESCE(NEW.details, NEW.data -> 'details');
    FOR line IN SELECT * FROM jsonb_array_elements(d) LOOP
      total_dr := total_dr + COALESCE((line ->> 'debit') ::NUMERIC, 0);
      total_cr := total_cr + COALESCE((line ->> 'credit')::NUMERIC, 0);
    END LOOP;
    RAISE EXCEPTION
      'GL imbalance on voucher % — DR=% CR=% diff=% PKR (tolerance=0.01)',
      NEW.id, total_dr, total_cr, imbalance
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

-- ── Wire up the trigger ──────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_enforce_ledger_balance ON ledger;
CREATE TRIGGER trg_enforce_ledger_balance
  BEFORE INSERT OR UPDATE
  ON ledger
  FOR EACH ROW
  EXECUTE FUNCTION enforce_ledger_balance();

-- ── Audit existing rows so Hassan knows the current state ───────────
-- This view shows any historical imbalance the trigger would have caught.
-- It does NOT modify data — just exposes the gap.
--
-- Note: built dynamically because the ledger table's metadata columns
-- (created_at, posted_at, updated_at) vary across deployments depending
-- on migration history. We pick whichever timestamp column exists, in
-- preference order.
DO $$
DECLARE
  ts_col TEXT;
BEGIN
  -- Pick the best available timestamp column for the audit view
  SELECT column_name INTO ts_col
  FROM   information_schema.columns
  WHERE  table_schema = 'public'
    AND  table_name   = 'ledger'
    AND  column_name IN ('posted_at', 'created_at', 'updated_at', 'doc_date')
  ORDER BY CASE column_name
    WHEN 'posted_at'  THEN 1
    WHEN 'created_at' THEN 2
    WHEN 'updated_at' THEN 3
    WHEN 'doc_date'   THEN 4
  END
  LIMIT 1;

  IF ts_col IS NULL THEN
    ts_col := 'NULL::timestamp';  -- view still works, just no timestamp
  END IF;

  EXECUTE format($view$
    CREATE OR REPLACE VIEW v_ledger_imbalance_audit AS
    SELECT
      id,
      company,
      doc_type,
      doc_date,
      description,
      reference_id,
      status,
      ledger_row_imbalance(status, details, data) AS imbalance_pkr,
      %s AS audit_at
    FROM ledger
    WHERE status IN ('Posted', 'posted')
      AND ABS(ledger_row_imbalance(status, details, data)) > 0.01
  $view$, ts_col);

  RAISE NOTICE '✓ Built v_ledger_imbalance_audit using % as audit_at column', ts_col;
END$$;

GRANT SELECT ON v_ledger_imbalance_audit TO authenticated, anon;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- 1. Audit historical data — how many existing Posted entries are bad?
-- SELECT COUNT(*), SUM(imbalance_pkr) FROM v_ledger_imbalance_audit;
--
-- 2. Try to post an unbalanced JV (should fail):
-- INSERT INTO ledger (id, company, status, details)
-- VALUES (
--   'TEST-IMBALANCE',
--   'Glassco',
--   'Posted',
--   '[{"accountId":"1","debit":1000,"credit":0},{"accountId":"2","debit":0,"credit":500}]'::jsonb
-- );
-- → expected: ERROR "GL imbalance on voucher TEST-IMBALANCE — DR=1000 CR=500 diff=500 PKR"
--
-- 3. Try to post a balanced JV (should succeed):
-- INSERT INTO ledger (id, company, status, details)
-- VALUES (
--   'TEST-BALANCED',
--   'Glassco',
--   'Posted',
--   '[{"accountId":"1","debit":1000,"credit":0},{"accountId":"2","debit":0,"credit":1000}]'::jsonb
-- );
-- → expected: success
--
-- 4. Try to save a Draft (should always succeed regardless of balance):
-- INSERT INTO ledger (id, company, status, details)
-- VALUES ('TEST-DRAFT', 'Glassco', 'Draft', '[]'::jsonb);
-- → expected: success (Draft exempt)
-- ═══════════════════════════════════════════════════════════════════════
