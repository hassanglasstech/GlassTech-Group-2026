-- ============================================================================
-- FIX: process_payment_receipt_v2 double-counted partial-receipt retries (2026-07-13)
-- Founder applies in the Supabase SQL editor (MCP is read-only).
-- ============================================================================
-- The re-grade's #1 CONFIRMED money bug. The receipt row upsert was idempotent
-- (INSERT ... ON CONFLICT (id) DO UPDATE) but the invoice mutation was NOT:
--   v_new_received_amount := invoice.received_amount + receipt_amount   -- unconditional
-- and the over-pay guard only tripped on a FULL-payment retry. So re-submitting
-- the SAME partial receipt id (double-click / offline replay) re-added the
-- amount: a 40k receipt on a 100k invoice, retried, drove received_amount to 80k
-- and understated the balance to 20k. Reproduced live.
--
-- FIX:
--   1. Upsert the receipt row FIRST, then recompute received_amount as
--      SUM(payment_receipts) for the invoice — idempotent by construction, so a
--      retry of the same id can never double-count. Over-pay guard now checks the
--      true SUM (raising rolls back the upsert in the same transaction).
--   2. Skip the receipt GL insert when that GL id is already in the ledger, so a
--      retry does not PK-conflict / double-post the GL.
-- Body is otherwise verbatim from live (company guard, GL balance assert, etc.).
-- Idempotent (CREATE OR REPLACE).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_payment_receipt_v2(receipt_data jsonb, p_invoice_id text, p_gl_row jsonb DEFAULT NULL::jsonb)
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
  v_status              TEXT;
BEGIN
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SAL-4: Invoice "%" not found', p_invoice_id USING ERRCODE = 'P0002';
  END IF;

  -- Company guard: array-aware, super bypass, no NULL-skip (God-mode P0 #10-D).
  IF auth.uid() IS NOT NULL
     AND NOT auth_user_is_super()
     AND NOT (v_invoice.company = ANY(COALESCE(auth_user_companies(), ARRAY[]::text[]))) THEN
    RAISE EXCEPTION 'SAL-4: Cross-company receipt denied — invoice company "%" not in caller allowed companies',
      v_invoice.company USING ERRCODE = 'P0003';
  END IF;

  v_receipt_amount := (receipt_data->>'amount')::NUMERIC(15,2);

  IF v_has_gl THEN
    PERFORM assert_ledger_balance(p_gl_row->'details');
    v_gl_tx_id := p_gl_row->>'id';
  END IF;

  v_receipt_id := COALESCE(receipt_data->>'id', gen_random_uuid()::TEXT);

  -- (1) Upsert the receipt row FIRST — idempotent on retry / double-click.
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

  -- (2) Recompute received_amount from the SUM of all receipts (idempotent).
  SELECT COALESCE(SUM(amount), 0) INTO v_new_received_amount
    FROM payment_receipts WHERE invoice_id = p_invoice_id;
  v_new_balance := COALESCE(v_invoice.total_amount, 0) - v_new_received_amount;

  -- Over-pay guard on the TRUE sum (raising here rolls back the upsert too).
  IF v_new_balance < -1 THEN
    RAISE EXCEPTION 'SAL-4: Receipt PKR % would over-pay invoice "%" (total: PKR %, already: PKR %)',
      v_receipt_amount, p_invoice_id, COALESCE(v_invoice.total_amount, 0),
      v_new_received_amount - v_receipt_amount USING ERRCODE = 'P0004';
  END IF;

  v_status := CASE WHEN v_new_balance <= 0       THEN 'Paid'
                   WHEN v_new_received_amount > 0 THEN 'Partial'
                   ELSE COALESCE(v_invoice.status, 'Outstanding') END;

  UPDATE invoices SET
    received_amount = v_new_received_amount,
    balance         = GREATEST(0, v_new_balance),
    status          = v_status,
    updated_at      = now()
  WHERE id = p_invoice_id;

  -- (3) Post the receipt GL once — skip if this GL id is already posted.
  IF v_has_gl AND NOT EXISTS (SELECT 1 FROM ledger WHERE id = v_gl_tx_id) THEN
    PERFORM _insert_ledger_row(p_gl_row);
  END IF;

  RETURN jsonb_build_object(
    'receipt_id', v_receipt_id, 'invoice_id', p_invoice_id, 'gl_tx_id', v_gl_tx_id,
    'new_received_amount', v_new_received_amount, 'new_balance', GREATEST(0, v_new_balance),
    'status', v_status
  );
END;
$function$;
