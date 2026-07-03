-- ============================================================================
-- 092 — HOTFIX: authorize the 088 finance aggregation RPCs (P1-7)
-- ============================================================================
-- 🔴 APPLY after 088. Closes a cross-company / anonymous data leak.
--
-- PROBLEM (audit P1-7): trial_balance(), ar_aging() and attendance_summary()
-- from migration 088 are SECURITY DEFINER (so they bypass RLS on ledger /
-- invoices / attendance) and were GRANTed to BOTH `authenticated` AND `anon`,
-- with NO check that the caller is allowed to see p_company. Because the anon
-- key ships in the frontend bundle, ANYONE could call
--     select * from trial_balance('Glassco');
--     select * from ar_aging('Nippon');
-- and read any company's financial aggregates without logging in — and any
-- logged-in single-company user could read every OTHER company's totals.
--
-- FIX:
--   1. REVOKE execute from anon (authenticated only).
--   2. Add a company-authorization gate to each function's WHERE clause:
--        auth_user_is_super() OR p_company = ANY(auth_user_companies())
--      These SQL functions can't use IF/RAISE, so the gate is a WHERE predicate
--      that is independent of the row — when false it filters ALL rows, so an
--      unauthorized (or anon → auth.uid() NULL → auth_user_companies() NULL)
--      caller gets an EMPTY result instead of another company's data. The app
--      already falls back to its JS-reduce path if an RPC returns nothing, so
--      legitimate callers (activeCompany ∈ their allowed companies, or super)
--      are unaffected.
--
-- DEPENDS ON: auth_user_is_super() (086) and auth_user_companies() (086 + 091
--   text[]-safe hotfix). Both are SECURITY DEFINER helpers already live.
--
-- ROLLBACK: re-run migration 088 (restores the un-gated definitions + anon grant).
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.trial_balance(text)              FROM anon;
REVOKE EXECUTE ON FUNCTION public.ar_aging(text)                   FROM anon;
REVOKE EXECUTE ON FUNCTION public.attendance_summary(text, text)   FROM anon;

-- ── 1. trial_balance(p_company) — authorized ────────────────────────────────
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
    AND (auth_user_is_super() OR p_company = ANY(auth_user_companies()))  -- P1-7 authz gate
  GROUP BY d->>'accountId';
$$;

GRANT EXECUTE ON FUNCTION public.trial_balance(text) TO authenticated;

-- ── 2. ar_aging(p_company) — authorized ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ar_aging(p_company text)
RETURNS TABLE(
  bucket_current numeric,
  bucket_30      numeric,
  bucket_60      numeric,
  bucket_90plus  numeric,
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
      (CURRENT_DATE - COALESCE(NULLIF(i.date::text, '')::date, CURRENT_DATE)) AS age_days
    FROM invoices i
    WHERE i.company = p_company
      AND COALESCE(i.status, '') <> 'Voided'
      AND (auth_user_is_super() OR p_company = ANY(auth_user_companies()))  -- P1-7 authz gate
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

GRANT EXECUTE ON FUNCTION public.ar_aging(text) TO authenticated;

-- ── 3. attendance_summary(p_company, p_month) — authorized ──────────────────
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
    AND substring(a.date::text from 1 for 7) = p_month
    AND (auth_user_is_super() OR p_company = ANY(auth_user_companies()))  -- P1-7 authz gate
  GROUP BY a.employee_id;
$$;

GRANT EXECUTE ON FUNCTION public.attendance_summary(text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- VERIFY after applying (run while logged in via the app):
--   SELECT * FROM trial_balance('<your company>');      -- returns your rows
--   SELECT * FROM trial_balance('<a company you can''t see>');  -- returns EMPTY
--   -- anon (no JWT) should get: permission denied for function trial_balance
-- ---------------------------------------------------------------------------
