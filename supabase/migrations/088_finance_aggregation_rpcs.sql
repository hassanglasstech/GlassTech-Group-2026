-- ═══════════════════════════════════════════════════════════════════════
-- 088_finance_aggregation_rpcs.sql
-- Audit item #6 "Layer 1" — Scale via server-side aggregation
--
-- ⚠️ NOT YET APPLIED — read-only STABLE functions, additive, reversible
--    (DROP FUNCTION); verify live table shape first (DB has diverged before).
--
-- WHY: Trial Balance, AR Aging and Attendance Summary currently pull the
--      ENTIRE ledger / invoices / attendance table to the browser and reduce
--      in JS. That is O(rows) memory + bandwidth per report render. These
--      STABLE functions push the aggregation into Postgres so the client
--      receives only grouped totals. The application keeps its in-memory JS
--      reduce as an automatic FALLBACK (see financeService.get*Async), so
--      behaviour is UNCHANGED until this migration is applied — nothing
--      breaks before the founder runs it.
--
-- SAFETY:
--   • Every function is STABLE + read-only (no writes, no side effects).
--   • CREATE OR REPLACE — idempotent, safe to re-run.
--   • Additive — introduces NEW function names (trial_balance, ar_aging,
--     attendance_summary). Does NOT touch the existing erp_trial_balance
--     (single-value imbalance probe used by alertService) — different name,
--     different return shape, no collision.
--   • Fully reversible:  DROP FUNCTION public.trial_balance(text);
--                        DROP FUNCTION public.ar_aging(text);
--                        DROP FUNCTION public.attendance_summary(text, text);
--   • Indexes use CREATE INDEX IF NOT EXISTS — no lock risk on re-run.
--
-- VERIFY LIVE SHAPE BEFORE APPLYING (the DB has diverged from 001 before):
--   -- ledger.details must be a JSONB array of {accountId, debit, credit}:
--   SELECT id, jsonb_typeof(details), details FROM ledger LIMIT 3;
--   -- invoices must have flat columns (migration 032):
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='invoices'
--       AND column_name IN ('total_amount','received_amount','balance','status','date','company');
--   -- attendance must have flat columns (migration 20260429):
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='attendance'
--       AND column_name IN ('employee_id','date','status','company');
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. trial_balance(p_company) ──────────────────────────────────────────
-- Per-account Dr/Cr totals summed over the ledger.details JSONB array.
-- ledger.details shape (confirmed via financeService.rowToLedger + migration
-- 010):  [{ "accountId": "GTK-11112", "debit": 1000, "credit": 0 }, ...]
-- Only 'Posted' entries count (Parked/Draft are unreviewed drafts — they must
-- never inflate the trial balance, matching the JS getLedger().reduce path).
CREATE OR REPLACE FUNCTION public.trial_balance(p_company text)
RETURNS TABLE(account_id text, debit numeric, credit numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '10s'
AS $$
  SELECT
    d->>'accountId'                        AS account_id,
    COALESCE(SUM((d->>'debit')::numeric), 0)  AS debit,
    COALESCE(SUM((d->>'credit')::numeric), 0) AS credit
  FROM ledger l
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(l.details) = 'array' THEN l.details ELSE '[]'::jsonb END
  ) AS d
  WHERE l.company = p_company
    AND l.status  = 'Posted'
    AND COALESCE(d->>'accountId', '') <> ''
  GROUP BY d->>'accountId';
$$;

GRANT EXECUTE ON FUNCTION public.trial_balance(text) TO authenticated, anon;


-- ── 2. ar_aging(p_company) ───────────────────────────────────────────────
-- Accounts-Receivable aging buckets from the invoices table (flat columns,
-- migration 032). Outstanding per invoice = COALESCE(balance, total_amount -
-- received_amount). Days overdue measured from invoice.date to CURRENT_DATE.
-- Only invoices with a positive outstanding balance are bucketed. Voided
-- invoices (status='Void') are excluded.
-- Buckets mirror the app's AgingReport vocabulary: current (0-30), 30 (31-60),
-- 60 (61-90), 90+ (over 90 days).
CREATE OR REPLACE FUNCTION public.ar_aging(p_company text)
RETURNS TABLE(
  bucket_current numeric,   -- 0–30 days
  bucket_30      numeric,   -- 31–60 days
  bucket_60      numeric,   -- 61–90 days
  bucket_90plus  numeric,   -- 90+ days
  total          numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '10s'
AS $$
  WITH outstanding AS (
    SELECT
      GREATEST(
        COALESCE(i.balance, COALESCE(i.total_amount, 0) - COALESCE(i.received_amount, 0)),
        0
      ) AS bal,
      (CURRENT_DATE - COALESCE(i.date, CURRENT_DATE)) AS age_days
    FROM invoices i
    WHERE i.company = p_company
      AND COALESCE(i.status, '') <> 'Void'
  )
  SELECT
    COALESCE(SUM(bal) FILTER (WHERE age_days <= 30), 0)                 AS bucket_current,
    COALESCE(SUM(bal) FILTER (WHERE age_days > 30 AND age_days <= 60), 0) AS bucket_30,
    COALESCE(SUM(bal) FILTER (WHERE age_days > 60 AND age_days <= 90), 0) AS bucket_60,
    COALESCE(SUM(bal) FILTER (WHERE age_days > 90), 0)                  AS bucket_90plus,
    COALESCE(SUM(bal), 0)                                              AS total
  FROM outstanding
  WHERE bal > 0;
$$;

GRANT EXECUTE ON FUNCTION public.ar_aging(text) TO authenticated, anon;


-- ── 3. attendance_summary(p_company, p_month) ────────────────────────────
-- Per-employee present / absent / leave counts for one month.
-- p_month is 'YYYY-MM' (matches the app's month picker). attendance flat
-- columns come from migration 20260429 (employee_id UUID, date DATE, status
-- TEXT, company). Status values seen in the app: present / absent /
-- half-day / leave — grouped case-insensitively; 'half-day' counts toward
-- present (a half day is still an attended day for headcount summaries).
CREATE OR REPLACE FUNCTION public.attendance_summary(p_company text, p_month text)
RETURNS TABLE(
  employee_id  text,
  present      bigint,
  absent       bigint,
  leave        bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '10s'
AS $$
  SELECT
    a.employee_id::text                                                        AS employee_id,
    COUNT(*) FILTER (WHERE lower(COALESCE(a.status, '')) IN ('present', 'half-day')) AS present,
    COUNT(*) FILTER (WHERE lower(COALESCE(a.status, '')) = 'absent')            AS absent,
    COUNT(*) FILTER (WHERE lower(COALESCE(a.status, '')) = 'leave')             AS leave
  FROM attendance a
  WHERE a.company = p_company
    AND a.employee_id IS NOT NULL
    AND to_char(a.date, 'YYYY-MM') = p_month
  GROUP BY a.employee_id;
$$;

GRANT EXECUTE ON FUNCTION public.attendance_summary(text, text) TO authenticated, anon;


-- ── 4. Supporting indexes ────────────────────────────────────────────────
-- Speed up the company+date scans the aggregations perform. Partial index on
-- Posted ledger keeps the trial_balance scan tight (Parked/Draft excluded).
CREATE INDEX IF NOT EXISTS idx_ledger_company_date
  ON ledger (company, date) WHERE status = 'Posted';

CREATE INDEX IF NOT EXISTS idx_attendance_company_date
  ON attendance (company, date);


-- ── Reload PostgREST schema cache so the new RPCs are callable at once ────
NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════
-- VERIFY (run after applying):
--   SELECT * FROM trial_balance('Nippon') LIMIT 5;
--   SELECT * FROM ar_aging('Nippon');
--   SELECT * FROM attendance_summary('Nippon', to_char(CURRENT_DATE,'YYYY-MM')) LIMIT 5;
--   SELECT indexname FROM pg_indexes
--     WHERE indexname IN ('idx_ledger_company_date','idx_attendance_company_date');
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.trial_balance(text);
--   DROP FUNCTION IF EXISTS public.ar_aging(text);
--   DROP FUNCTION IF EXISTS public.attendance_summary(text, text);
--   DROP INDEX  IF EXISTS public.idx_ledger_company_date;
--   DROP INDEX  IF EXISTS public.idx_attendance_company_date;
-- ═══════════════════════════════════════════════════════════════════════
