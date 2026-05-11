-- 056_sprint30_cutover_snapshot.sql
-- Sprint 30: Cutover / Go-Live Wizard support
--   * cutover_snapshot table tracks go-live date per company + lock state
--   * csv_import_logs records every bulk import (audit trail + idempotency)
-- Safe to re-run.

-- ── 1. Cutover snapshot per company ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cutover_snapshot (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company         TEXT NOT NULL UNIQUE,
  cutover_date    DATE,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'in_progress', 'completed', 'locked')),
  -- Checklist booleans
  masters_loaded     BOOLEAN DEFAULT false,   -- clients + products imported
  stock_ob_done      BOOLEAN DEFAULT false,   -- stock opening balance saved
  gl_ob_done         BOOLEAN DEFAULT false,   -- GL chart-of-accounts opening JV posted
  ar_ob_done         BOOLEAN DEFAULT false,   -- outstanding AR invoices loaded
  ap_ob_done         BOOLEAN DEFAULT false,   -- outstanding AP bills loaded
  notes              TEXT,
  locked_at          TIMESTAMPTZ,
  locked_by          TEXT,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cutover_snapshot_company ON cutover_snapshot(company);

-- ── 2. CSV import audit log ──────────────────────────────────────────────────
-- Every bulk import logs here: who, what, how many rows, success/fail breakdown.
CREATE TABLE IF NOT EXISTS csv_import_logs (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company         TEXT NOT NULL,
  import_type     TEXT NOT NULL,    -- 'clients' | 'products' | 'ar_opening' | 'ap_opening'
  file_name       TEXT,
  rows_attempted  INTEGER DEFAULT 0,
  rows_succeeded  INTEGER DEFAULT 0,
  rows_failed     INTEGER DEFAULT 0,
  error_details   JSONB DEFAULT '[]'::jsonb,   -- [{row, error}]
  imported_by     TEXT,
  imported_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_csv_import_logs_company_type
  ON csv_import_logs(company, import_type);
CREATE INDEX IF NOT EXISTS idx_csv_import_logs_imported_at
  ON csv_import_logs(imported_at DESC);

-- ── 3. Helper: assert_cutover_open ───────────────────────────────────────────
-- Raises if a company's cutover is locked — used by services that should
-- refuse to back-date entries before the locked cutover date.
CREATE OR REPLACE FUNCTION assert_cutover_open(p_company TEXT, p_entry_date DATE)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_status        TEXT;
  v_cutover_date  DATE;
BEGIN
  SELECT status, cutover_date INTO v_status, v_cutover_date
  FROM cutover_snapshot WHERE company = p_company;

  -- No snapshot yet → allow (pre-cutover state)
  IF NOT FOUND OR v_status IS NULL THEN
    RETURN;
  END IF;

  -- Locked + entry date is on/before cutover → block
  IF v_status = 'locked' AND v_cutover_date IS NOT NULL AND p_entry_date <= v_cutover_date THEN
    RAISE EXCEPTION 'Cutover locked for % on %. Cannot back-date entries to %.',
      p_company, v_cutover_date, p_entry_date
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

-- ── 4. Grants ────────────────────────────────────────────────────────────────
GRANT ALL ON cutover_snapshot TO anon, authenticated;
GRANT ALL ON csv_import_logs  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION assert_cutover_open(TEXT, DATE) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

SELECT 'Sprint 30 cutover snapshot ready.' AS status;
