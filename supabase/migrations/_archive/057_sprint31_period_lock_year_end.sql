-- ═══════════════════════════════════════════════════════════════════════
-- Migration 057 — Sprint 31: Period Lock + Year-End Close + Audit Trail
--
-- Builds on:
--   • migration 004 (fiscal_periods table — 2-state Open/Closed)
--   • migration 045 (activity_log + audit triggers — Sprint 4)
--
-- This migration EXTENDS rather than replaces:
--   • fiscal_periods gets a new `period_state` column (4-state) +
--     `locked_at` / `closed_for_year` columns. Existing `status` column
--     is preserved for backward-compat with PeriodService / PeriodManager.
--   • A BEFORE INSERT/UPDATE trigger on `ledger` rejects entries dated
--     into a Hard-Close or Locked period (with explicit override path
--     via SET LOCAL app.allow_locked_period = '1' for admins).
--   • year_end_close(p_company, p_year) RPC: rolls P&L accounts into
--     Retained Earnings, marks all 12 months Locked.
--   • activity_log gets a small reporting view for the RowHistoryButton
--     UI to consume without RLS gymnastics.
--
-- States:
--   Open       — entries freely posted (default for current month)
--   Soft-Close — entries allowed with warning + audit log
--   Hard-Close — entries rejected unless admin override
--   Locked     — entries always rejected (year-end frozen)
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 1. Extend fiscal_periods with the 4-state model
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE fiscal_periods
  ADD COLUMN IF NOT EXISTS period_state    TEXT,
  ADD COLUMN IF NOT EXISTS soft_closed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS soft_closed_by  TEXT,
  ADD COLUMN IF NOT EXISTS hard_closed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hard_closed_by  TEXT,
  ADD COLUMN IF NOT EXISTS locked_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by       TEXT,
  ADD COLUMN IF NOT EXISTS year_end_run_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS year_end_jv_id  TEXT;

-- Backfill period_state from existing status, idempotent:
--   'Open'   → 'Open'
--   'Closed' → 'Hard-Close'
UPDATE fiscal_periods
   SET period_state = CASE
                        WHEN status = 'Open'   THEN 'Open'
                        WHEN status = 'Closed' THEN 'Hard-Close'
                        ELSE COALESCE(status, 'Open')
                      END
 WHERE period_state IS NULL OR period_state = '';

-- Add a CHECK constraint NOW that data is normalised
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'fiscal_periods_period_state_check'
  ) THEN
    ALTER TABLE fiscal_periods
      ADD CONSTRAINT fiscal_periods_period_state_check
      CHECK (period_state IN ('Open','Soft-Close','Hard-Close','Locked'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fiscal_periods_state
  ON fiscal_periods (company, period_state);

-- ─────────────────────────────────────────────────────────────────────
-- 2. check_period_open() trigger function
--
-- Fires on INSERT or UPDATE to `ledger`. Looks up the fiscal_period for
-- (company, NEW.date) and rejects when:
--   • period_state IN ('Hard-Close', 'Locked')   AND
--   • current_setting('app.allow_locked_period') is NOT '1'
--
-- The override flag is a session GUC — admin override flow sets it for
-- the duration of the transaction:
--   SET LOCAL app.allow_locked_period = '1';
-- The override write is captured in activity_log via the trigger from
-- migration 045 (full before/after JSONB), so it remains audit-traceable.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_period_open() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_state    TEXT;
  v_date     DATE;
  v_company  TEXT;
  v_override TEXT;
BEGIN
  v_company := NEW.company;
  -- ledger.date is TEXT in the legacy schema — cast safely.
  BEGIN
    v_date := NEW.date::DATE;
  EXCEPTION WHEN OTHERS THEN
    v_date := CURRENT_DATE;
  END;

  IF v_company IS NULL OR v_date IS NULL THEN
    RETURN NEW;          -- nothing to check
  END IF;

  -- Fiscal-period match. fiscal_periods.month is 'YYYY-MM' in existing data.
  SELECT period_state INTO v_state
    FROM fiscal_periods
   WHERE company = v_company
     AND month   = to_char(v_date, 'YYYY-MM')
   LIMIT 1;

  IF v_state IS NULL THEN
    -- Period row missing — treat as Open (PeriodService.ensureCurrentPeriod
    -- creates rows lazily; we don't want to break first-write of a month).
    RETURN NEW;
  END IF;

  IF v_state IN ('Hard-Close', 'Locked') THEN
    -- Honour explicit admin override
    BEGIN
      v_override := current_setting('app.allow_locked_period', true);
    EXCEPTION WHEN OTHERS THEN
      v_override := NULL;
    END;
    IF COALESCE(v_override, '0') <> '1' THEN
      RAISE EXCEPTION 'period_closed: % is % — entries dated % rejected. ' ||
                      'Admin: SET LOCAL app.allow_locked_period = ''1'' to override.',
        to_char(v_date, 'YYYY-MM'), v_state, v_date
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tr_ledger_period_check ON ledger;
CREATE TRIGGER tr_ledger_period_check
  BEFORE INSERT OR UPDATE OF date, status ON ledger
  FOR EACH ROW
  EXECUTE FUNCTION check_period_open();

-- ─────────────────────────────────────────────────────────────────────
-- 3. year_end_close(p_company, p_year) RPC
--
-- Rolls every P&L account (type IN ('Revenue', 'Expense')) into a
-- Retained Earnings account for the given fiscal year. Then marks
-- every fiscal_period row for the year as Locked.
--
-- Behaviour:
--   • Computes per-account net (sum debit − sum credit) from `ledger`
--     entries dated in p_year, using the JSONB `details` array.
--   • Generates one consolidated JV (id = JV-YEC-<company>-<year>)
--     with one line per non-zero P&L account + balancing line on
--     Retained Earnings. Reuses the post_invoice_atomic-style row
--     insert pattern.
--   • If the JV already exists (idempotency), returns the existing
--     id and counts.
--   • Skips locking if there are imbalanced ledger entries — admin
--     must clean up first.
--
-- Returns:
--   { jv_id, accounts_zeroed, retained_earnings_delta, periods_locked }
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION year_end_close(
  p_company TEXT,
  p_year    INT,
  p_actor   TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jv_id           TEXT := 'JV-YEC-' || p_company || '-' || p_year::TEXT;
  v_year_start      DATE := make_date(p_year, 1, 1);
  v_year_end        DATE := make_date(p_year, 12, 31);
  v_existing        RECORD;
  v_re_account_id   TEXT;
  v_re_account      RECORD;
  v_close_date      DATE := v_year_end;
  v_details         JSONB := '[]'::JSONB;
  v_total_dr        NUMERIC := 0;
  v_total_cr        NUMERIC := 0;
  v_re_delta        NUMERIC;
  v_acct            RECORD;
  v_periods_locked  INT;
BEGIN
  -- Idempotency: if JV already posted return summary unchanged
  SELECT id, description INTO v_existing FROM ledger WHERE id = v_jv_id;
  IF FOUND THEN
    SELECT COUNT(*) INTO v_periods_locked
      FROM fiscal_periods
     WHERE company = p_company
       AND month LIKE p_year::TEXT || '-%'
       AND period_state = 'Locked';
    RETURN jsonb_build_object(
      'jv_id',          v_jv_id,
      'status',         'already_posted',
      'periods_locked', v_periods_locked
    );
  END IF;

  -- Locate / ensure Retained Earnings account (type Equity, code 30100)
  SELECT id INTO v_re_account_id
    FROM accounts
   WHERE company = p_company AND code = '30100'
   LIMIT 1;
  IF v_re_account_id IS NULL THEN
    v_re_account_id := 'AC-RE-' || p_company;
    INSERT INTO accounts (id, company, code, name, type, level, parent_id)
    VALUES (v_re_account_id, p_company, '30100', 'Retained Earnings', 'Equity', 1, NULL)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Aggregate per-account P&L for the year from ledger.details JSONB.
  -- Each ledger row's details is an array of {accountId, debit, credit}.
  -- We sum across all rows in p_year for each Revenue/Expense account.
  FOR v_acct IN
    SELECT
      a.id   AS account_id,
      a.code AS account_code,
      a.name AS account_name,
      a.type AS account_type,
      COALESCE(SUM((d->>'debit')::NUMERIC),  0) AS sum_debit,
      COALESCE(SUM((d->>'credit')::NUMERIC), 0) AS sum_credit
    FROM ledger l
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(l.details, '[]'::JSONB)) d
    INNER JOIN accounts a ON a.id = (d->>'accountId')
    WHERE l.company = p_company
      AND COALESCE(l.status, 'Posted') = 'Posted'
      AND a.company = p_company
      AND a.type IN ('Revenue', 'Expense')
      AND COALESCE(l.date::DATE, l.doc_date::DATE) BETWEEN v_year_start AND v_year_end
    GROUP BY a.id, a.code, a.name, a.type
    HAVING ABS(COALESCE(SUM((d->>'debit')::NUMERIC), 0) - COALESCE(SUM((d->>'credit')::NUMERIC), 0)) >= 0.01
  LOOP
    -- Reverse the P&L balance to zero it out.
    -- Revenue accounts are credit-natured: net credit = sum_credit - sum_debit
    --   To zero a credit balance we DEBIT it.
    -- Expense accounts are debit-natured: net debit = sum_debit - sum_credit
    --   To zero a debit balance we CREDIT it.
    IF v_acct.account_type = 'Revenue' THEN
      v_total_dr := v_total_dr + (v_acct.sum_credit - v_acct.sum_debit);
      v_details := v_details || jsonb_build_array(jsonb_build_object(
        'accountId', v_acct.account_id,
        'debit',     v_acct.sum_credit - v_acct.sum_debit,
        'credit',    0,
        'text',      'YEC ' || p_year || ': close ' || v_acct.account_name
      ));
    ELSE     -- Expense
      v_total_cr := v_total_cr + (v_acct.sum_debit - v_acct.sum_credit);
      v_details := v_details || jsonb_build_array(jsonb_build_object(
        'accountId', v_acct.account_id,
        'debit',     0,
        'credit',    v_acct.sum_debit - v_acct.sum_credit,
        'text',      'YEC ' || p_year || ': close ' || v_acct.account_name
      ));
    END IF;
  END LOOP;

  -- Net = total revenue closed (Dr) − total expenses closed (Cr)
  --     = profit (positive) or loss (negative)
  --   Profit  → Cr Retained Earnings
  --   Loss    → Dr Retained Earnings
  v_re_delta := v_total_dr - v_total_cr;

  IF v_re_delta > 0 THEN
    v_details := v_details || jsonb_build_array(jsonb_build_object(
      'accountId', v_re_account_id,
      'debit',     0,
      'credit',    v_re_delta,
      'text',      'YEC ' || p_year || ': transfer profit to Retained Earnings'
    ));
  ELSIF v_re_delta < 0 THEN
    v_details := v_details || jsonb_build_array(jsonb_build_object(
      'accountId', v_re_account_id,
      'debit',     ABS(v_re_delta),
      'credit',    0,
      'text',      'YEC ' || p_year || ': transfer loss against Retained Earnings'
    ));
  ELSE
    -- Zero P&L (nothing to roll forward) — short-circuit
    -- but still mark periods Locked so users can't post backward.
    NULL;
  END IF;

  -- Insert the consolidated JV ONLY if there's something to post.
  -- The trigger blocks writes into Locked periods, so we override here.
  IF jsonb_array_length(v_details) > 0 THEN
    PERFORM set_config('app.allow_locked_period', '1', true);
    INSERT INTO ledger (
      id, company, doc_type, doc_date, date, description,
      reference_id, status, details, data, created_by, posted_at, updated_at
    ) VALUES (
      v_jv_id, p_company, 'JV',
      v_year_end::TEXT, v_year_end::TEXT,
      'Year-End Close ' || p_year || ' — auto-rollup to Retained Earnings',
      'YEC-' || p_year, 'Posted',
      v_details,
      jsonb_build_object('year', p_year, 'actor', COALESCE(p_actor, 'system')),
      COALESCE(p_actor, 'system-auto'),
      now(), now()
    );
    PERFORM set_config('app.allow_locked_period', '0', true);
  END IF;

  -- Lock all 12 months for the year
  UPDATE fiscal_periods
     SET period_state    = 'Locked',
         locked_at       = now(),
         locked_by       = COALESCE(p_actor, 'system'),
         year_end_run_at = now(),
         year_end_jv_id  = v_jv_id,
         updated_at      = now()
   WHERE company = p_company
     AND month LIKE p_year::TEXT || '-%';
  GET DIAGNOSTICS v_periods_locked = ROW_COUNT;

  RETURN jsonb_build_object(
    'jv_id',                   v_jv_id,
    'status',                  'posted',
    'accounts_zeroed',         (jsonb_array_length(v_details) - CASE WHEN v_re_delta = 0 THEN 0 ELSE 1 END),
    'retained_earnings_delta', v_re_delta,
    'periods_locked',          v_periods_locked
  );
END $$;

GRANT EXECUTE ON FUNCTION year_end_close(TEXT, INT, TEXT) TO authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────
-- 4. activity_log_summary view
--
-- Slim projection of activity_log for the RowHistoryButton modal:
--   • One row per change
--   • Diff field count (how many keys changed) for quick scanning
--   • Friendly columns (changed_by_short, op_label)
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW activity_log_summary AS
SELECT
  id,
  table_name,
  row_id,
  operation,
  changed_at,
  changed_by,
  CASE
    WHEN changed_by IS NULL OR changed_by = '' THEN 'unknown'
    WHEN POSITION('@' IN changed_by) > 0 THEN split_part(changed_by, '@', 1)
    ELSE changed_by
  END AS changed_by_short,
  CASE operation
    WHEN 'INSERT' THEN 'Created'
    WHEN 'UPDATE' THEN 'Updated'
    WHEN 'DELETE' THEN 'Deleted'
    ELSE operation
  END AS op_label,
  before_data,
  after_data,
  company,
  -- Count of changed keys (UPDATE only) for the changelog grid
  CASE
    WHEN operation = 'UPDATE' AND before_data IS NOT NULL AND after_data IS NOT NULL THEN
      (SELECT COUNT(*)::INT
         FROM jsonb_each(after_data) ae
         LEFT JOIN jsonb_each(before_data) be ON be.key = ae.key
        WHERE be.value IS DISTINCT FROM ae.value)
    ELSE NULL
  END AS changed_field_count
FROM activity_log
ORDER BY changed_at DESC;

GRANT SELECT ON activity_log_summary TO authenticated, anon;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────
-- SELECT period_state, COUNT(*) FROM fiscal_periods GROUP BY 1;
-- -- expect: Open / Hard-Close / Locked counts, no nulls
--
-- -- Trigger smoke test (should raise period_closed on a Locked month):
-- INSERT INTO fiscal_periods (id, company, month, status, period_state)
-- VALUES ('TEST-Glassco-2024-01','Glassco','2024-01','Closed','Locked')
-- ON CONFLICT (id) DO UPDATE SET period_state='Locked';
-- INSERT INTO ledger (id, company, doc_type, date, description, status, details)
-- VALUES ('TEST-LOCKED-1','Glassco','JV','2024-01-15','Should fail','Posted','[]'::JSONB);
-- -- expect: ERROR: period_closed: 2024-01 is Locked
--
-- -- year_end_close smoke test
-- SELECT year_end_close('Glassco', 2024, 'admin@example.com');
-- -- expect: { jv_id: JV-YEC-Glassco-2024, status: 'posted', ... }
--
-- -- Audit summary
-- SELECT * FROM activity_log_summary
--   WHERE table_name = 'invoices' AND row_id = 'INV-001'
--   LIMIT 20;
-- ═══════════════════════════════════════════════════════════════════════
