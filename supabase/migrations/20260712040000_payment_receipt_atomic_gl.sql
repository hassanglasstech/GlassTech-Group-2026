-- ============================================================================
-- Payment-receipt TRUE atomicity: fold the GL leg into the receipt RPC
-- God-mode audit P0 #9 (part 2 of 2) — 2026-07-12
-- ============================================================================
-- Part 1 (already shipped, app-side): SalesOrders posts the receipt + invoice
-- balance (via process_payment_receipt) BEFORE the GL leg, so the worst-case
-- failure is a GL leg queued for retry instead of a ledger/invoice mismatch.
--
-- Part 2 (this migration): a NEW function process_payment_receipt_v2 that also
-- inserts the balanced GL row in the SAME serialisable transaction as the
-- receipt insert + invoice-balance update — so the three can never tear apart.
-- It reuses the exact helpers post_invoice_atomic uses (assert_ledger_balance +
-- _insert_ledger_row), and is a superset of process_payment_receipt.
--
-- SAFE TO APPLY ANYTIME: this only ADDS a function. Nothing calls it yet, so it
-- is inert. The paired app change — SalesOrders calls process_payment_receipt_v2
-- with the GL row (ledgerToRow(glTx)) and STOPS the separate FinanceService
-- .saveLedger — MUST ship together with (or after) this migration, otherwise the
-- GL would double-post. Do NOT wire the app until this is applied.
-- ============================================================================

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
  v_caller_company      TEXT;
  v_gl_tx_id            TEXT;
  v_has_gl              BOOLEAN := (p_gl_row IS NOT NULL AND p_gl_row <> 'null'::jsonb);
BEGIN
  -- Resolve caller's company (NULL when user_profiles empty / single-user)
  BEGIN
    SELECT company INTO v_caller_company
    FROM   user_profiles
    WHERE  id = auth.uid()
    LIMIT  1;
  EXCEPTION WHEN OTHERS THEN
    v_caller_company := NULL;
  END;

  -- Lock invoice row to serialise concurrent receipts
  SELECT * INTO v_invoice
  FROM   invoices
  WHERE  id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SAL-4: Invoice "%" not found', p_invoice_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Cross-company guard ONLY when caller company is known
  IF v_caller_company IS NOT NULL
     AND v_invoice.company IS DISTINCT FROM v_caller_company THEN
    RAISE EXCEPTION 'SAL-4: Cross-company receipt denied — invoice company "%" != caller company "%"',
      v_invoice.company, v_caller_company
      USING ERRCODE = 'P0003';
  END IF;

  v_receipt_amount      := (receipt_data->>'amount')::NUMERIC(15,2);
  v_new_received_amount := COALESCE(v_invoice.received_amount, 0) + v_receipt_amount;
  v_new_balance         := COALESCE(v_invoice.total_amount, 0) - v_new_received_amount;

  -- Reject over-payment beyond PKR 1 tolerance
  IF v_new_balance < -1 THEN
    RAISE EXCEPTION 'SAL-4: Receipt PKR % would over-pay invoice "%" (balance: PKR %, overpay: PKR %)',
      v_receipt_amount, p_invoice_id,
      COALESCE(v_invoice.total_amount, 0) - COALESCE(v_invoice.received_amount, 0),
      ABS(v_new_balance)
      USING ERRCODE = 'P0004';
  END IF;

  -- Pre-flight balance gate on the GL leg (same guard post_invoice_atomic uses),
  -- BEFORE any write, so an imbalanced GL aborts the whole receipt cleanly.
  IF v_has_gl THEN
    PERFORM assert_ledger_balance(p_gl_row->'details');
    v_gl_tx_id := p_gl_row->>'id';
  END IF;

  v_receipt_id := COALESCE(receipt_data->>'id', gen_random_uuid()::TEXT);

  INSERT INTO payment_receipts (
    id, invoice_id, company,
    date, amount, method, reference, gl_tx_id,
    created_by, updated_at
  ) VALUES (
    v_receipt_id,
    p_invoice_id,
    v_invoice.company,
    NULLIF(receipt_data->>'date','')::DATE,
    v_receipt_amount,
    receipt_data->>'method',
    receipt_data->>'reference',
    COALESCE(NULLIF(receipt_data->>'gl_tx_id',''), v_gl_tx_id),
    receipt_data->>'created_by',
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    amount     = EXCLUDED.amount,
    method     = EXCLUDED.method,
    reference  = EXCLUDED.reference,
    updated_at = now();

  -- Atomic invoice balance/status update in the SAME transaction
  UPDATE invoices
  SET
    received_amount = v_new_received_amount,
    balance         = GREATEST(0, v_new_balance),
    status          = CASE
                        WHEN v_new_balance <= 0        THEN 'Paid'
                        WHEN v_new_received_amount > 0  THEN 'Partial'
                        ELSE COALESCE(v_invoice.status,'Outstanding')
                      END,
    updated_at      = now()
  WHERE id = p_invoice_id;

  -- Insert the balanced GL row LAST — still the SAME transaction, so receipt +
  -- invoice-balance + ledger are all-or-nothing. ON CONFLICT DO NOTHING inside
  -- _insert_ledger_row keeps this idempotent on retry.
  IF v_has_gl THEN
    PERFORM _insert_ledger_row(p_gl_row);
  END IF;

  RETURN jsonb_build_object(
    'receipt_id',          v_receipt_id,
    'invoice_id',          p_invoice_id,
    'gl_tx_id',            v_gl_tx_id,
    'new_received_amount', v_new_received_amount,
    'new_balance',         GREATEST(0, v_new_balance),
    'status',              CASE WHEN v_new_balance <= 0       THEN 'Paid'
                                WHEN v_new_received_amount > 0 THEN 'Partial'
                                ELSE COALESCE(v_invoice.status, 'Outstanding') END
  );
END;
$function$;

-- Grants: authenticated may call; anon must not (mirror the 096 lockdown posture).
REVOKE ALL    ON FUNCTION public.process_payment_receipt_v2(jsonb, text, jsonb) FROM PUBLIC;
REVOKE ALL    ON FUNCTION public.process_payment_receipt_v2(jsonb, text, jsonb) FROM anon;
GRANT  EXECUTE ON FUNCTION public.process_payment_receipt_v2(jsonb, text, jsonb) TO authenticated;

-- ── Verify after applying ────────────────────────────────────────────────────
-- SELECT proname, pg_get_function_identity_arguments(oid)
-- FROM pg_proc WHERE proname = 'process_payment_receipt_v2';
-- (should return one row; anon must NOT have EXECUTE)
