-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 017 — Phase 5: SAL-4 atomic payment receipt + SCM-5 3-way match
-- Addresses:
--   SAL-4  — Atomic invoice balance update via SECURITY DEFINER RPC
--   SCM-5  — DB-level helper view for Three-Way Match validation
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- SAL-4: process_payment_receipt
-- Atomically inserts a payment receipt AND updates the parent invoice's
-- received_amount, balance, and status within a single serialisable
-- transaction. Prevents the TOCTOU race where two concurrent receipts
-- both read the same invoice balance and under-credit the invoice.
--
-- Parameters:
--   receipt_data  JSONB  — all receipt fields (id, date, amount, method …)
--   p_invoice_id  TEXT   — invoice to credit
--
-- Returns:
--   JSONB { receipt_id, invoice_id, new_received_amount, new_balance, status }
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION process_payment_receipt(
  receipt_data  JSONB,
  p_invoice_id  TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER          -- runs as the definer (service role) — bypasses RLS
                          -- but enforces company isolation manually below
SET search_path = public  -- pin schema to prevent search_path injection
AS $$
DECLARE
  v_invoice             RECORD;
  v_new_received_amount NUMERIC(15,2);
  v_new_balance         NUMERIC(15,2);
  v_receipt_id          TEXT;
  v_receipt_amount      NUMERIC(15,2);
  v_caller_company      TEXT;
BEGIN
  -- Resolve the calling user's company from user_profiles (JWT-based)
  SELECT company INTO v_caller_company
  FROM   user_profiles
  WHERE  id = auth.uid();

  -- Lock the invoice row for update to prevent concurrent modifications
  SELECT * INTO v_invoice
  FROM   invoices
  WHERE  id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SAL-4: Invoice "%" not found', p_invoice_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Company isolation: caller must belong to the invoice's company
  IF v_invoice.company IS DISTINCT FROM v_caller_company THEN
    RAISE EXCEPTION 'SAL-4: Cross-company receipt denied — invoice company "%" ≠ caller company "%"',
      v_invoice.company, v_caller_company
      USING ERRCODE = 'P0003';
  END IF;

  v_receipt_amount      := (receipt_data->>'amount')::NUMERIC(15,2);
  v_new_received_amount := COALESCE(v_invoice.received_amount, 0) + v_receipt_amount;
  v_new_balance         := v_invoice.total_amount - v_new_received_amount;

  -- Reject if receipt would over-pay the invoice beyond PKR 1 tolerance
  IF v_new_balance < -1 THEN
    RAISE EXCEPTION 'SAL-4: Receipt PKR % would over-pay invoice "%" (balance: PKR %, overpay: PKR %)',
      v_receipt_amount, p_invoice_id,
      v_invoice.total_amount - COALESCE(v_invoice.received_amount, 0),
      ABS(v_new_balance)
      USING ERRCODE = 'P0004';
  END IF;

  v_receipt_id := COALESCE(receipt_data->>'id', gen_random_uuid()::TEXT);

  -- Insert the payment receipt
  INSERT INTO payment_receipts (
    id, invoice_id, company,
    date, amount, method, reference, gl_tx_id,
    created_by, updated_at
  ) VALUES (
    v_receipt_id,
    p_invoice_id,
    v_invoice.company,
    (receipt_data->>'date')::DATE,
    v_receipt_amount,
    receipt_data->>'method',
    receipt_data->>'reference',
    receipt_data->>'gl_tx_id',
    receipt_data->>'created_by',
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    amount     = EXCLUDED.amount,
    method     = EXCLUDED.method,
    reference  = EXCLUDED.reference,
    updated_at = now();

  -- Update the invoice atomically in the same transaction
  UPDATE invoices
  SET
    received_amount = v_new_received_amount,
    balance         = GREATEST(0, v_new_balance),
    status          = CASE
                        WHEN v_new_balance <= 0 THEN 'Paid'
                        WHEN v_new_received_amount > 0 THEN 'Partial'
                        ELSE status
                      END,
    updated_at      = now()
  WHERE id = p_invoice_id;

  RETURN jsonb_build_object(
    'receipt_id',          v_receipt_id,
    'invoice_id',          p_invoice_id,
    'new_received_amount', v_new_received_amount,
    'new_balance',         GREATEST(0, v_new_balance),
    'status',              CASE WHEN v_new_balance <= 0 THEN 'Paid'
                                WHEN v_new_received_amount > 0 THEN 'Partial'
                                ELSE v_invoice.status END
  );
END;
$$;

-- Grant EXECUTE to authenticated users only (not anon)
REVOKE EXECUTE ON FUNCTION process_payment_receipt(JSONB, TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION process_payment_receipt(JSONB, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- SCM-5: grn_po_invoice_match — helper view for Three-Way Match validation
-- Joins purchase_orders + grn_entries + invoices so the app can query
-- whether PO/GRN/Invoice values are within tolerance in a single round-trip.
--
-- The application-level assertThreeWayMatch() in grnService.ts uses this
-- view for pre-payment checks. The DB view exists as a single source of
-- truth and avoids multi-query race conditions.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW grn_po_invoice_match AS
  SELECT
    g.id                                                    AS grn_id,
    g.company,
    g.po_id,
    po.status                                               AS po_status,
    po.total_amount                                         AS po_total,
    COALESCE(g.total_ok_value, 0) + COALESCE(g.total_defective_value, 0)
                                                            AS grn_received_value,
    i.id                                                    AS invoice_id,
    i.total_amount                                          AS invoice_total,
    -- Tolerance flags (true = within PKR 1)
    ABS((COALESCE(g.total_ok_value,0)+COALESCE(g.total_defective_value,0)) - po.total_amount) <= 1
                                                            AS grn_matches_po,
    ABS(i.total_amount - (COALESCE(g.total_ok_value,0)+COALESCE(g.total_defective_value,0))) <= 1
                                                            AS invoice_matches_grn
  FROM  grn_entries     g
  JOIN  purchase_orders po ON po.id = g.po_id
  LEFT JOIN invoices    i  ON i.order_id = g.id   -- vendor invoice references GRN id
  WHERE po.status = 'Approved';

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICATION QUERIES
-- ─────────────────────────────────────────────────────────────────────────
-- -- Confirm RPC exists:
-- SELECT proname FROM pg_proc WHERE proname = 'process_payment_receipt';
-- -- Expected: process_payment_receipt
--
-- -- Test atomic receipt insert (replace IDs as needed):
-- SELECT process_payment_receipt(
--   '{"id":"REC-TEST-001","date":"2026-04-10","amount":1000,"method":"Bank","reference":"CHQ-001"}'::jsonb,
--   'INV-TEST-001'
-- );
-- ═══════════════════════════════════════════════════════════════════════════
