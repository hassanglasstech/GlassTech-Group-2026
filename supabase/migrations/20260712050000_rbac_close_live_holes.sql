-- ============================================================================
-- Close live cross-company / privilege-escalation holes (God-mode audit P0 #10)
-- 2026-07-12 — prerequisite hardening BEFORE any role-based write layer.
-- ============================================================================
-- Discovery (RBAC workflow) found 3 live holes + 1 flaw that make table-level
-- RLS moot until closed. All fixes below ADD guards / remove backdoors — no
-- legitimate user is newly restricted, so lockout risk is ~zero.
--
--   A) disable_strict_company_rls / enable_* : SECURITY DEFINER admin helpers
--      were EXECUTE-able by ANY authenticated user. disable_strict_company_rls
--      drops a table's strict policies and installs a permissive USING(true) one
--      — a one-call RLS kill-switch usable by the lowest-privileged account.
--      The app never calls these (grep: 0 hits), so REVOKE EXECUTE from
--      anon+authenticated. Admins run them from the SQL editor / service role
--      (which connect as postgres and bypass these grants).
--   B) purchase_orders had a single policy purchase_orders_rw = USING(true)
--      WITH CHECK(true): every authenticated user could CRUD every company's POs.
--      Its company column is `from_company` (not `company`), which is why
--      enable_strict_company_rls silently SKIPs it. Install explicit strict
--      policies keyed on from_company.
--   C) update_piece_status_atomic (SECURITY DEFINER) had NO company/role guard —
--      any authenticated user could change ANY company's piece status, bypassing
--      the production_pieces strict policy. Add an in-function company guard.
--   D) process_payment_receipt_v2 / process_payment_receipt resolved caller
--      company via the singular user_profiles.company column and SKIPPED the
--      cross-company check when it was NULL (true for multi-company users).
--      Replace with the array-aware auth_user_companies() + auth_user_is_super()
--      check used everywhere else (no NULL-skip hole).
--
-- SAFE TO APPLY. Idempotent (REVOKE / CREATE OR REPLACE / DROP POLICY IF EXISTS).
-- ============================================================================


-- ── A) Lock down the RLS admin / kill-switch helpers ────────────────────────
REVOKE EXECUTE ON FUNCTION public.disable_strict_company_rls(text)      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enable_strict_company_rls(text)       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enable_strict_rls_recommended()       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enable_permissive_rls()               FROM PUBLIC, anon, authenticated;


-- ── B) purchase_orders — strict company isolation on from_company ───────────
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS purchase_orders_rw            ON public.purchase_orders;
DROP POLICY IF EXISTS purchase_orders_strict_select ON public.purchase_orders;
DROP POLICY IF EXISTS purchase_orders_strict_insert ON public.purchase_orders;
DROP POLICY IF EXISTS purchase_orders_strict_update ON public.purchase_orders;
DROP POLICY IF EXISTS purchase_orders_strict_delete ON public.purchase_orders;

CREATE POLICY purchase_orders_strict_select ON public.purchase_orders FOR SELECT
  USING (
    (SELECT auth_user_is_super())
    OR ((SELECT auth_user_companies()) IS NOT NULL
        AND from_company = ANY((SELECT auth_user_companies())))
  );
CREATE POLICY purchase_orders_strict_insert ON public.purchase_orders FOR INSERT
  WITH CHECK (
    (SELECT auth_user_is_super())
    OR ((SELECT auth_user_companies()) IS NOT NULL
        AND from_company = ANY((SELECT auth_user_companies())))
  );
CREATE POLICY purchase_orders_strict_update ON public.purchase_orders FOR UPDATE
  USING (
    (SELECT auth_user_is_super())
    OR ((SELECT auth_user_companies()) IS NOT NULL
        AND from_company = ANY((SELECT auth_user_companies())))
  )
  WITH CHECK (
    (SELECT auth_user_is_super())
    OR ((SELECT auth_user_companies()) IS NOT NULL
        AND from_company = ANY((SELECT auth_user_companies())))
  );
CREATE POLICY purchase_orders_strict_delete ON public.purchase_orders FOR DELETE
  USING (
    (SELECT auth_user_is_super())
    OR ((SELECT auth_user_companies()) IS NOT NULL
        AND from_company = ANY((SELECT auth_user_companies())))
  );


-- ── C) update_piece_status_atomic — add in-function company guard ───────────
-- (SECURITY DEFINER bypasses the production_pieces table policy, so the scope
--  check must live inside the function. Body reproduced verbatim + the guard +
--  `company` added to the locking SELECT; search_path also pinned to pg_temp.)
CREATE OR REPLACE FUNCTION public.update_piece_status_atomic(
  p_piece_id text, p_new_status text,
  p_changed_by text DEFAULT NULL::text, p_reason text DEFAULT NULL::text,
  p_extra jsonb DEFAULT '{}'::jsonb
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row         RECORD;
  v_data        JSONB;
  v_current     TEXT;
  v_hold_from   TEXT;
  v_new_data    JSONB;
  v_now         TIMESTAMPTZ := now();
  v_now_iso     TEXT := to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_version     INT;
BEGIN
  IF p_piece_id IS NULL OR p_new_status IS NULL THEN
    RAISE EXCEPTION 'invalid_payload: piece_id + new_status required';
  END IF;

  -- Pessimistic lock — second concurrent caller waits here
  SELECT id, status, data, company INTO v_row
    FROM production_pieces
    WHERE id = p_piece_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'piece_not_found: %', p_piece_id;
  END IF;

  -- Company guard (God-mode P0 #10-C): block a real logged-in user (auth.uid()
  -- set) that is not super and whose allowed companies exclude this piece's
  -- stamped company. NULL-company (legacy) rows and trusted backend contexts
  -- (auth.uid() NULL) are allowed through.
  IF auth.uid() IS NOT NULL
     AND NOT (SELECT auth_user_is_super())
     AND v_row.company IS NOT NULL
     AND NOT (v_row.company = ANY(COALESCE((SELECT auth_user_companies()), ARRAY[]::text[]))) THEN
    RAISE EXCEPTION 'not_authorized: piece % (company %) is outside caller allowed companies',
      p_piece_id, v_row.company
      USING ERRCODE = '42501';
  END IF;

  v_data    := COALESCE(v_row.data, '{}'::JSONB);
  v_current := COALESCE(v_row.status, v_data->>'status', 'Cut');
  v_hold_from := v_data->>'holdFrom';
  v_version := COALESCE((v_data->>'version')::INT, 1);

  -- Hold asymmetry guard (defect #5)
  IF v_current = 'Hold'
     AND p_new_status NOT IN ('Hold','Broken','Returned')
     AND v_hold_from IS NOT NULL
     AND p_new_status <> v_hold_from THEN
    RAISE EXCEPTION
      'invalid_hold_exit: piece % was held from "%" — can only exit back to "%", got "%"',
      p_piece_id, v_hold_from, v_hold_from, p_new_status;
  END IF;

  -- General transition guard (defect #3 & #5)
  IF v_current <> 'Hold' THEN
    IF NOT _piece_transition_allowed(v_current, p_new_status) THEN
      RAISE EXCEPTION
        'invalid_transition: % cannot move from "%" to "%"',
        p_piece_id, v_current, p_new_status;
    END IF;
  END IF;

  -- Compose new data: optimistic version + lastUpdated + status + extra
  v_new_data := v_data
              || COALESCE(p_extra, '{}'::JSONB)
              || jsonb_build_object(
                   'status',       p_new_status,
                   'lastUpdated',  v_now_iso,
                   'version',      v_version + 1
                 );

  -- holdFrom bookkeeping
  IF p_new_status = 'Hold' AND v_current <> 'Hold' THEN
    v_new_data := v_new_data || jsonb_build_object('holdFrom', v_current);
  ELSIF v_current = 'Hold' AND p_new_status <> 'Hold' THEN
    v_new_data := v_new_data - 'holdFrom';
  END IF;

  IF p_changed_by IS NOT NULL THEN
    PERFORM set_config('app.current_user', p_changed_by, true);
  END IF;
  IF p_reason IS NOT NULL THEN
    v_new_data := v_new_data || jsonb_build_object('lastChangeReason', p_reason);
  END IF;

  UPDATE production_pieces
     SET data         = v_new_data,
         status       = p_new_status,
         updated_at   = v_now,
         last_updated = v_now
   WHERE id = p_piece_id;

  RETURN jsonb_build_object(
    'piece_id',  p_piece_id,
    'old_status', v_current,
    'new_status', p_new_status,
    'version',   v_version + 1,
    'hold_from', v_new_data->>'holdFrom'
  );
EXCEPTION
  WHEN undefined_column OR datatype_mismatch THEN
    UPDATE production_pieces
       SET data       = v_new_data,
           status     = p_new_status,
           updated_at = v_now
     WHERE id = p_piece_id;
    RETURN jsonb_build_object(
      'piece_id',  p_piece_id,
      'old_status', v_current,
      'new_status', p_new_status,
      'version',   v_version + 1,
      'hold_from', v_new_data->>'holdFrom'
    );
END $function$;


-- ── D) Payment-receipt RPCs — array-aware company guard (no NULL-skip) ───────
CREATE OR REPLACE FUNCTION public.process_payment_receipt_v2(
  receipt_data jsonb,
  p_invoice_id text,
  p_gl_row     jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_invoice             RECORD;
  v_new_received_amount NUMERIC(15,2);
  v_new_balance         NUMERIC(15,2);
  v_receipt_id          TEXT;
  v_receipt_amount      NUMERIC(15,2);
  v_gl_tx_id            TEXT;
  v_has_gl              BOOLEAN := (p_gl_row IS NOT NULL AND p_gl_row <> 'null'::jsonb);
BEGIN
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SAL-4: Invoice "%" not found', p_invoice_id USING ERRCODE = 'P0002';
  END IF;

  -- Company guard: array-aware, super bypass, no NULL-skip (God-mode P0 #10-D).
  IF auth.uid() IS NOT NULL
     AND NOT (SELECT auth_user_is_super())
     AND NOT (v_invoice.company = ANY(COALESCE((SELECT auth_user_companies()), ARRAY[]::text[]))) THEN
    RAISE EXCEPTION 'SAL-4: Cross-company receipt denied — invoice company "%" not in caller allowed companies',
      v_invoice.company USING ERRCODE = 'P0003';
  END IF;

  v_receipt_amount      := (receipt_data->>'amount')::NUMERIC(15,2);
  v_new_received_amount := COALESCE(v_invoice.received_amount, 0) + v_receipt_amount;
  v_new_balance         := COALESCE(v_invoice.total_amount, 0) - v_new_received_amount;

  IF v_new_balance < -1 THEN
    RAISE EXCEPTION 'SAL-4: Receipt PKR % would over-pay invoice "%" (balance: PKR %, overpay: PKR %)',
      v_receipt_amount, p_invoice_id,
      COALESCE(v_invoice.total_amount, 0) - COALESCE(v_invoice.received_amount, 0),
      ABS(v_new_balance) USING ERRCODE = 'P0004';
  END IF;

  IF v_has_gl THEN
    PERFORM assert_ledger_balance(p_gl_row->'details');
    v_gl_tx_id := p_gl_row->>'id';
  END IF;

  v_receipt_id := COALESCE(receipt_data->>'id', gen_random_uuid()::TEXT);

  INSERT INTO payment_receipts (
    id, invoice_id, company, date, amount, method, reference, gl_tx_id, created_by, updated_at
  ) VALUES (
    v_receipt_id, p_invoice_id, v_invoice.company,
    NULLIF(receipt_data->>'date','')::DATE, v_receipt_amount,
    receipt_data->>'method', receipt_data->>'reference',
    COALESCE(NULLIF(receipt_data->>'gl_tx_id',''), v_gl_tx_id),
    receipt_data->>'created_by', now()
  )
  ON CONFLICT (id) DO UPDATE SET
    amount = EXCLUDED.amount, method = EXCLUDED.method,
    reference = EXCLUDED.reference, updated_at = now();

  UPDATE invoices SET
    received_amount = v_new_received_amount,
    balance         = GREATEST(0, v_new_balance),
    status          = CASE WHEN v_new_balance <= 0       THEN 'Paid'
                           WHEN v_new_received_amount > 0 THEN 'Partial'
                           ELSE COALESCE(v_invoice.status,'Outstanding') END,
    updated_at      = now()
  WHERE id = p_invoice_id;

  IF v_has_gl THEN
    PERFORM _insert_ledger_row(p_gl_row);
  END IF;

  RETURN jsonb_build_object(
    'receipt_id', v_receipt_id, 'invoice_id', p_invoice_id, 'gl_tx_id', v_gl_tx_id,
    'new_received_amount', v_new_received_amount, 'new_balance', GREATEST(0, v_new_balance),
    'status', CASE WHEN v_new_balance <= 0 THEN 'Paid'
                   WHEN v_new_received_amount > 0 THEN 'Partial'
                   ELSE COALESCE(v_invoice.status, 'Outstanding') END
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.process_payment_receipt_v2(jsonb, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_payment_receipt_v2(jsonb, text, jsonb) TO authenticated;

-- Legacy v1 (still the no-GL fallback path) — same company-guard fix.
CREATE OR REPLACE FUNCTION public.process_payment_receipt(
  receipt_data jsonb,
  p_invoice_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_invoice             RECORD;
  v_new_received_amount NUMERIC(15,2);
  v_new_balance         NUMERIC(15,2);
  v_receipt_id          TEXT;
  v_receipt_amount      NUMERIC(15,2);
BEGIN
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SAL-4: Invoice "%" not found', p_invoice_id USING ERRCODE = 'P0002';
  END IF;

  IF auth.uid() IS NOT NULL
     AND NOT (SELECT auth_user_is_super())
     AND NOT (v_invoice.company = ANY(COALESCE((SELECT auth_user_companies()), ARRAY[]::text[]))) THEN
    RAISE EXCEPTION 'SAL-4: Cross-company receipt denied — invoice company "%" not in caller allowed companies',
      v_invoice.company USING ERRCODE = 'P0003';
  END IF;

  v_receipt_amount      := (receipt_data->>'amount')::NUMERIC(15,2);
  v_new_received_amount := COALESCE(v_invoice.received_amount, 0) + v_receipt_amount;
  v_new_balance         := COALESCE(v_invoice.total_amount, 0) - v_new_received_amount;

  IF v_new_balance < -1 THEN
    RAISE EXCEPTION 'SAL-4: Receipt PKR % would over-pay invoice "%" (balance: PKR %, overpay: PKR %)',
      v_receipt_amount, p_invoice_id,
      COALESCE(v_invoice.total_amount, 0) - COALESCE(v_invoice.received_amount, 0),
      ABS(v_new_balance) USING ERRCODE = 'P0004';
  END IF;

  v_receipt_id := COALESCE(receipt_data->>'id', gen_random_uuid()::TEXT);

  INSERT INTO payment_receipts (
    id, invoice_id, company, date, amount, method, reference, gl_tx_id, created_by, updated_at
  ) VALUES (
    v_receipt_id, p_invoice_id, v_invoice.company,
    NULLIF(receipt_data->>'date','')::DATE, v_receipt_amount,
    receipt_data->>'method', receipt_data->>'reference', receipt_data->>'gl_tx_id',
    receipt_data->>'created_by', now()
  )
  ON CONFLICT (id) DO UPDATE SET
    amount = EXCLUDED.amount, method = EXCLUDED.method,
    reference = EXCLUDED.reference, updated_at = now();

  UPDATE invoices SET
    received_amount = v_new_received_amount,
    balance         = GREATEST(0, v_new_balance),
    status          = CASE WHEN v_new_balance <= 0       THEN 'Paid'
                           WHEN v_new_received_amount > 0 THEN 'Partial'
                           ELSE COALESCE(v_invoice.status,'Outstanding') END,
    updated_at      = now()
  WHERE id = p_invoice_id;

  RETURN jsonb_build_object(
    'receipt_id', v_receipt_id, 'invoice_id', p_invoice_id,
    'new_received_amount', v_new_received_amount, 'new_balance', GREATEST(0, v_new_balance),
    'status', CASE WHEN v_new_balance <= 0 THEN 'Paid'
                   WHEN v_new_received_amount > 0 THEN 'Partial'
                   ELSE COALESCE(v_invoice.status, 'Outstanding') END
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.process_payment_receipt(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_payment_receipt(jsonb, text) TO authenticated;


-- ── Verify after applying ───────────────────────────────────────────────────
-- A) both should be false:
--   SELECT has_function_privilege('authenticated', 'public.disable_strict_company_rls(text)', 'EXECUTE');
-- B) 4 strict policies, no _rw:
--   SELECT policyname, cmd FROM pg_policies WHERE tablename='purchase_orders' ORDER BY cmd;
-- C/D) guards present:
--   SELECT pg_get_functiondef('public.update_piece_status_atomic'::regproc) ILIKE '%auth_user_companies%';
--   SELECT pg_get_functiondef('public.process_payment_receipt_v2'::regproc)  ILIKE '%auth_user_companies%';
