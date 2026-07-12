-- ============================================================================
-- RBAC WRITE-LAYER, slice 2 (SAFE SET): per-RPC caller guards + module gates on
-- the sales/accounts-anchored tables. (2026-07-12). Founder applies in the
-- Supabase SQL editor (MCP is read-only). Commented rollback at the bottom.
-- ============================================================================
-- Builds on slice 1 (080000): owner is company-scoped; employees/attendance are
-- gated on the 'hr' module. This slice adds two things, both verified
-- zero-lockout for the 5 live users (all non-owner users hold 'sales'; owners
-- are company-admins that bypass the module gate; super_admin bypasses all):
--
--   PART 1 — per-RPC caller guards on SECURITY DEFINER functions that BYPASS RLS
--   and were callable by any authenticated user with no caller-company check
--   (a Nippon user could authorize a Glassco dispatch; anyone could purge the
--   audit log). Guard pattern mirrors the live update_piece_status_atomic:
--   enforce only for a real logged-in user (auth.uid() set), skip super, skip
--   trusted backend (auth.uid() NULL = service-role/cron).
--
--   PART 2 — module gates on the sales/accounts single-domain tables. GATES USE
--   THE REAL allowed_modules VOCABULARY (sales / accounts / hr), NOT the code's
--   folder names. ledger / stock_ledger / quotations are deliberately LEFT
--   company-only (written by 5-6 modules; ledger already has balance +
--   maker-checker + period-lock triggers). Procurement master-data and the
--   production floor are DEFERRED (need the requisitions/inventory vocabulary
--   mapping + Glassco-cutter JWT verification).
-- ============================================================================

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ PART 1 — per-RPC caller-company guards                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- 1a. prune_activity_log — deletes audit history. Any authenticated user could
-- purge the audit log. No app call-site (only a cron/service-role caller), so
-- revoke it from end users; service_role keeps it. Revoke from PUBLIC too — the
-- EXECUTE grant can be inherited via PUBLIC, so revoking only `authenticated`
-- leaves it callable; PUBLIC + authenticated + anon closes every path.
REVOKE EXECUTE ON FUNCTION public.prune_activity_log(integer) FROM PUBLIC, authenticated, anon;

-- 1b. allocate_serial — add a caller-company guard on p_company.
CREATE OR REPLACE FUNCTION public.allocate_serial(p_company text, p_doc_type text, p_year integer, p_min_seed integer DEFAULT 1)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_next INT;
BEGIN
  -- caller-company guard (slice 2): a real logged-in non-super user may only
  -- allocate serials for a company in their allowed_companies.
  IF auth.uid() IS NOT NULL AND NOT auth_user_is_super()
     AND NOT (p_company = ANY (COALESCE(auth_user_companies(), ARRAY[]::text[]))) THEN
    RAISE EXCEPTION 'not_authorized: serial for company % is outside caller allowed companies', p_company
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO doc_serials (company, doc_type, year, next_seq)
  VALUES (p_company, p_doc_type, p_year, GREATEST(p_min_seed, 1))
  ON CONFLICT (company, doc_type, year)
  DO UPDATE
    SET next_seq   = GREATEST(doc_serials.next_seq + 1, EXCLUDED.next_seq),
        updated_at = now()
  RETURNING next_seq INTO v_next;
  RETURN v_next;
END;
$function$;

-- 1c. append_dispatch_event — guard on the dispatch's company.
CREATE OR REPLACE FUNCTION public.append_dispatch_event(p_dispatch_id text, p_event_type text, p_event_data jsonb DEFAULT '{}'::jsonb, p_created_by text DEFAULT 'system'::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_company TEXT;
  v_event_id BIGINT;
  v_allowed_types TEXT[] := ARRAY[
    'CREATED','PIECES_LOADED','AUTHORIZED','GATE_OUT','IN_TRANSIT',
    'ARRIVED','RECEIVING','INVOICE_RECORDED','THREE_WAY_MATCHED',
    'CLOSED','CANCELLED'
  ];
BEGIN
  IF p_dispatch_id IS NULL OR p_event_type IS NULL THEN
    RAISE EXCEPTION 'invalid_payload: dispatch_id + event_type required';
  END IF;

  IF NOT (p_event_type = ANY (v_allowed_types)) THEN
    RAISE EXCEPTION 'invalid_event_type: % (allowed: %)', p_event_type, v_allowed_types;
  END IF;

  SELECT COALESCE(company, data->>'company') INTO v_company
    FROM tempering_dispatches WHERE id::text = p_dispatch_id;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'dispatch_not_found: %', p_dispatch_id;
  END IF;

  -- caller-company guard (slice 2)
  IF auth.uid() IS NOT NULL AND NOT auth_user_is_super()
     AND NOT (v_company = ANY (COALESCE(auth_user_companies(), ARRAY[]::text[]))) THEN
    RAISE EXCEPTION 'not_authorized: dispatch % (company %) is outside caller allowed companies', p_dispatch_id, v_company
      USING ERRCODE = '42501';
  END IF;

  EXECUTE 'INSERT INTO dispatch_events (dispatch_id, company, event_type, event_data, created_by)
           VALUES ($1, $2, $3, $4, $5) RETURNING id'
    INTO v_event_id
    USING p_dispatch_id, v_company, p_event_type,
          COALESCE(p_event_data, '{}'::jsonb), COALESCE(p_created_by, 'system');

  RETURN v_event_id;
END $function$;

-- 1d. authorize_dispatch — guard on the dispatch's company.
CREATE OR REPLACE FUNCTION public.authorize_dispatch(p_dispatch_id text, p_gate_pass_id text, p_authorized_by text DEFAULT 'system'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_company TEXT;
  v_existing_gate TEXT;
BEGIN
  IF p_dispatch_id IS NULL OR p_gate_pass_id IS NULL THEN
    RAISE EXCEPTION 'invalid_payload: dispatch_id + gate_pass_id required';
  END IF;

  SELECT COALESCE(company, data->>'company'), gate_pass_id::text
    INTO v_company, v_existing_gate
    FROM tempering_dispatches WHERE id::text = p_dispatch_id
    FOR UPDATE;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'dispatch_not_found: %', p_dispatch_id;
  END IF;

  -- caller-company guard (slice 2)
  IF auth.uid() IS NOT NULL AND NOT auth_user_is_super()
     AND NOT (v_company = ANY (COALESCE(auth_user_companies(), ARRAY[]::text[]))) THEN
    RAISE EXCEPTION 'not_authorized: dispatch % (company %) is outside caller allowed companies', p_dispatch_id, v_company
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM gate_passes
    WHERE id::text = p_gate_pass_id AND COALESCE(company, '') = v_company
  ) THEN
    RAISE EXCEPTION 'gate_pass_not_found_for_company: gate_pass=% company=%', p_gate_pass_id, v_company;
  END IF;

  IF v_existing_gate IS NOT NULL AND v_existing_gate <> p_gate_pass_id THEN
    RAISE EXCEPTION 'already_authorized_with_different_gate_pass: existing=% new=%', v_existing_gate, p_gate_pass_id;
  END IF;

  EXECUTE 'UPDATE tempering_dispatches
              SET gate_pass_id = $1,
                  status       = ''Dispatched'',
                  data         = COALESCE(data, ''{}''::jsonb)
                                 || jsonb_build_object(''gatePassId'', $2, ''status'', ''Dispatched''),
                  updated_at   = now()
            WHERE id::text = $3'
    USING p_gate_pass_id, p_gate_pass_id, p_dispatch_id;

  PERFORM append_dispatch_event(p_dispatch_id, 'AUTHORIZED',
    jsonb_build_object('gatePassId', p_gate_pass_id), p_authorized_by);
END $function$;

-- 1e. load_pieces_to_dispatch_atomic — fetch the dispatch company + guard.
CREATE OR REPLACE FUNCTION public.load_pieces_to_dispatch_atomic(p_dispatch_id text, p_piece_ids text[], p_changed_by text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pid          TEXT;
  v_row          RECORD;
  v_now          TIMESTAMPTZ := now();
  v_now_iso      TEXT := to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_dispatch     RECORD;
  v_existing_ids JSONB;
  v_added        INT := 0;
  v_skipped      INT := 0;
  v_dispatchable TEXT[] := ARRAY[
    'QC-Passed','Ready to Dispatch','Tempered','Received-From-Tempering','Cut'
  ];
BEGIN
  IF p_dispatch_id IS NULL OR p_piece_ids IS NULL OR array_length(p_piece_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'invalid_payload: dispatch_id + non-empty piece_ids required';
  END IF;

  -- Lock the dispatch first so concurrent batches serialise on it.
  SELECT id, data, COALESCE(company, data->>'company') AS company INTO v_dispatch
    FROM tempering_dispatches
    WHERE id = p_dispatch_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'dispatch_not_found: %', p_dispatch_id;
  END IF;

  -- caller-company guard (slice 2)
  IF auth.uid() IS NOT NULL AND NOT auth_user_is_super()
     AND v_dispatch.company IS NOT NULL
     AND NOT (v_dispatch.company = ANY (COALESCE(auth_user_companies(), ARRAY[]::text[]))) THEN
    RAISE EXCEPTION 'not_authorized: dispatch % (company %) is outside caller allowed companies', p_dispatch_id, v_dispatch.company
      USING ERRCODE = '42501';
  END IF;

  IF p_changed_by IS NOT NULL THEN
    PERFORM set_config('app.current_user', p_changed_by, true);
  END IF;

  -- Per-piece validate + update (each piece locked individually).
  FOREACH v_pid IN ARRAY p_piece_ids LOOP
    SELECT id, status, data INTO v_row
      FROM production_pieces
      WHERE id = v_pid
      FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'piece_not_found: %', v_pid;
    END IF;

    -- Already in THIS dispatch? Skip silently (idempotent re-load).
    IF (v_row.data->>'dispatchId') = p_dispatch_id THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Already in ANOTHER active dispatch? Reject the batch.
    IF v_row.data ? 'dispatchId'
       AND COALESCE(v_row.data->>'dispatchId','') <> ''
       AND v_row.data->>'dispatchId' <> p_dispatch_id THEN
      RAISE EXCEPTION
        'piece_already_dispatched: % is in dispatch %, cannot add to %',
        v_pid, v_row.data->>'dispatchId', p_dispatch_id;
    END IF;

    -- Status must be dispatchable
    IF NOT (COALESCE(v_row.status, v_row.data->>'status') = ANY (v_dispatchable)) THEN
      RAISE EXCEPTION
        'piece_not_dispatchable: % is "%" — must be QC-Passed/Ready to Dispatch/Tempered/Received-From-Tempering/Cut',
        v_pid, COALESCE(v_row.status, v_row.data->>'status');
    END IF;

    UPDATE production_pieces
       SET data = COALESCE(data, '{}'::JSONB) || jsonb_build_object(
                    'dispatchId',  p_dispatch_id,
                    'status',      'Dispatched',
                    'lastUpdated', v_now_iso,
                    'version',     COALESCE((data->>'version')::INT, 1) + 1
                  ),
           status     = 'Dispatched',
           updated_at = v_now
     WHERE id = v_pid;

    v_added := v_added + 1;
  END LOOP;

  -- Patch the dispatch with the union of existing + new piece_ids
  v_existing_ids := COALESCE(v_dispatch.data->'pieceIds', '[]'::JSONB);
  UPDATE tempering_dispatches
     SET data = COALESCE(data, '{}'::JSONB) || jsonb_build_object(
                  'pieceIds', (
                    SELECT jsonb_agg(DISTINCT v ORDER BY v)
                    FROM (
                      SELECT jsonb_array_elements_text(v_existing_ids) AS v
                      UNION
                      SELECT unnest(p_piece_ids) AS v
                    ) u
                  ),
                  'lastUpdated', v_now_iso
                ),
         updated_at = v_now
   WHERE id = p_dispatch_id;

  RETURN jsonb_build_object(
    'dispatch_id', p_dispatch_id,
    'added',       v_added,
    'skipped',     v_skipped,
    'total',       array_length(p_piece_ids, 1)
  );
END $function$;

-- 1f. record_three_way_match — look up the dispatch company + guard.
CREATE OR REPLACE FUNCTION public.record_three_way_match(p_dispatch_id text, p_vendor_invoice_no text, p_vendor_invoice_amount numeric, p_computed_ap_amount numeric, p_recorded_by text DEFAULT 'system'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_status    TEXT;
  v_delta_pct NUMERIC;
  v_rows      INT;
  v_company   TEXT;
BEGIN
  IF p_dispatch_id IS NULL OR p_vendor_invoice_amount IS NULL OR p_computed_ap_amount IS NULL THEN
    RAISE EXCEPTION 'invalid_payload: dispatch_id + amounts required';
  END IF;

  -- caller-company guard (slice 2)
  SELECT COALESCE(company, data->>'company') INTO v_company
    FROM tempering_dispatches WHERE id::text = p_dispatch_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'dispatch_not_found: %', p_dispatch_id;
  END IF;
  IF auth.uid() IS NOT NULL AND NOT auth_user_is_super()
     AND NOT (v_company = ANY (COALESCE(auth_user_companies(), ARRAY[]::text[]))) THEN
    RAISE EXCEPTION 'not_authorized: dispatch % (company %) is outside caller allowed companies', p_dispatch_id, v_company
      USING ERRCODE = '42501';
  END IF;

  IF p_computed_ap_amount = 0 THEN
    v_delta_pct := CASE WHEN p_vendor_invoice_amount = 0 THEN 0 ELSE 100 END;
  ELSE
    v_delta_pct := ABS(p_vendor_invoice_amount - p_computed_ap_amount) / p_computed_ap_amount * 100;
  END IF;

  v_status := CASE WHEN v_delta_pct <= 5 THEN 'Match' ELSE 'Mismatch' END;

  EXECUTE 'UPDATE tempering_dispatches
              SET vendor_invoice_no       = $1,
                  vendor_invoice_amount   = $2,
                  three_way_match_status  = $3,
                  updated_at              = now()
            WHERE id::text = $4'
    USING p_vendor_invoice_no, p_vendor_invoice_amount, v_status, p_dispatch_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'dispatch_not_found: %', p_dispatch_id;
  END IF;

  PERFORM append_dispatch_event(p_dispatch_id, 'THREE_WAY_MATCHED',
    jsonb_build_object(
      'vendorInvoiceNo',     p_vendor_invoice_no,
      'vendorInvoiceAmount', p_vendor_invoice_amount,
      'computedApAmount',    p_computed_ap_amount,
      'deltaPct',            ROUND(v_delta_pct, 2),
      'status',              v_status
    ), p_recorded_by);

  RETURN v_status;
END $function$;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ PART 2 — module gates on the sales/accounts single-domain tables           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Reusable write predicate: super OR (company-match AND (company-admin OR holds
-- one of the given modules)). Keeps the 15 policies below DRY + identical.
CREATE OR REPLACE FUNCTION public.auth_can_write(p_row_company text, p_modules text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    auth_user_is_super()
    OR (
      auth_user_companies() IS NOT NULL
      AND p_row_company = ANY (auth_user_companies())
      AND (
        auth_user_is_company_admin()
        OR EXISTS (SELECT 1 FROM unnest(p_modules) m WHERE auth_user_has_module(m))
      )
    );
$function$;

GRANT EXECUTE ON FUNCTION public.auth_can_write(text, text[]) TO authenticated, anon;

-- invoices → {sales, accounts} (sales CRUD + finance AR opening-balance cutover)
DROP POLICY IF EXISTS invoices_strict_insert ON public.invoices;
CREATE POLICY invoices_strict_insert ON public.invoices
  FOR INSERT WITH CHECK (auth_can_write(company, ARRAY['sales','accounts']));
DROP POLICY IF EXISTS invoices_strict_update ON public.invoices;
CREATE POLICY invoices_strict_update ON public.invoices
  FOR UPDATE USING (auth_can_write(company, ARRAY['sales','accounts']))
             WITH CHECK (auth_can_write(company, ARRAY['sales','accounts']));
DROP POLICY IF EXISTS invoices_strict_delete ON public.invoices;
CREATE POLICY invoices_strict_delete ON public.invoices
  FOR DELETE USING (auth_can_write(company, ARRAY['sales','accounts']));

-- credit_notes → {sales, accounts} (sales issues; finance maker/checker UI)
DROP POLICY IF EXISTS credit_notes_strict_insert ON public.credit_notes;
CREATE POLICY credit_notes_strict_insert ON public.credit_notes
  FOR INSERT WITH CHECK (auth_can_write(company, ARRAY['sales','accounts']));
DROP POLICY IF EXISTS credit_notes_strict_update ON public.credit_notes;
CREATE POLICY credit_notes_strict_update ON public.credit_notes
  FOR UPDATE USING (auth_can_write(company, ARRAY['sales','accounts']))
             WITH CHECK (auth_can_write(company, ARRAY['sales','accounts']));
DROP POLICY IF EXISTS credit_notes_strict_delete ON public.credit_notes;
CREATE POLICY credit_notes_strict_delete ON public.credit_notes
  FOR DELETE USING (auth_can_write(company, ARRAY['sales','accounts']));

-- payment_receipts → {sales} (only sales produces receipts)
DROP POLICY IF EXISTS payment_receipts_strict_insert ON public.payment_receipts;
CREATE POLICY payment_receipts_strict_insert ON public.payment_receipts
  FOR INSERT WITH CHECK (auth_can_write(company, ARRAY['sales']));
DROP POLICY IF EXISTS payment_receipts_strict_update ON public.payment_receipts;
CREATE POLICY payment_receipts_strict_update ON public.payment_receipts
  FOR UPDATE USING (auth_can_write(company, ARRAY['sales']))
             WITH CHECK (auth_can_write(company, ARRAY['sales']));
DROP POLICY IF EXISTS payment_receipts_strict_delete ON public.payment_receipts;
CREATE POLICY payment_receipts_strict_delete ON public.payment_receipts
  FOR DELETE USING (auth_can_write(company, ARRAY['sales']));

-- clients → {sales} (sales is the only business writer)
DROP POLICY IF EXISTS clients_strict_insert ON public.clients;
CREATE POLICY clients_strict_insert ON public.clients
  FOR INSERT WITH CHECK (auth_can_write(company, ARRAY['sales']));
DROP POLICY IF EXISTS clients_strict_update ON public.clients;
CREATE POLICY clients_strict_update ON public.clients
  FOR UPDATE USING (auth_can_write(company, ARRAY['sales']))
             WITH CHECK (auth_can_write(company, ARRAY['sales']));
DROP POLICY IF EXISTS clients_strict_delete ON public.clients;
CREATE POLICY clients_strict_delete ON public.clients
  FOR DELETE USING (auth_can_write(company, ARRAY['sales']));

-- accounts → {accounts, hr} (finance COA + HR auto-creates salary sub-account)
DROP POLICY IF EXISTS accounts_strict_insert ON public.accounts;
CREATE POLICY accounts_strict_insert ON public.accounts
  FOR INSERT WITH CHECK (auth_can_write(company, ARRAY['accounts','hr']));
DROP POLICY IF EXISTS accounts_strict_update ON public.accounts;
CREATE POLICY accounts_strict_update ON public.accounts
  FOR UPDATE USING (auth_can_write(company, ARRAY['accounts','hr']))
             WITH CHECK (auth_can_write(company, ARRAY['accounts','hr']));
DROP POLICY IF EXISTS accounts_strict_delete ON public.accounts;
CREATE POLICY accounts_strict_delete ON public.accounts
  FOR DELETE USING (auth_can_write(company, ARRAY['accounts','hr']));

-- ============================================================================
-- ROLLBACK (revert this migration):
--   * GRANT EXECUTE ON FUNCTION public.prune_activity_log(integer) TO authenticated;  -- if desired
--   * Re-CREATE the 5 functions from pg_get_functiondef of the pre-migration
--     versions (drop the "caller-company guard" IF-block from each).
--   * For each of invoices/credit_notes/payment_receipts/clients/accounts, DROP
--     the *_strict_insert/update/delete policies and re-CREATE them with the plain
--     `auth_user_is_super() OR (auth_user_companies() IS NOT NULL AND company =
--     ANY(auth_user_companies()))` form. Then DROP FUNCTION public.auth_can_write(text,text[]).
-- ============================================================================
