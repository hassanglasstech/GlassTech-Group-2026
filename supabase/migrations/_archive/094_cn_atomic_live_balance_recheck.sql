-- 094_cn_atomic_live_balance_recheck.sql
-- ============================================================================
-- P1-14: credit_note_atomic must re-check amount <= the invoice's LIVE balance
-- under a row lock, and derive the new balance SERVER-SIDE (not trust the
-- client-supplied invoice_new_balance).
-- ============================================================================
-- Bug (090 as shipped): approveCreditNote's amount<=balance invariant is checked
-- only client-side at ISSUE time. Between issue and approve — or with a receipt
-- posted on another device that shrank the balance — the CN amount can exceed the
-- live balance. The 090 RPC locks the CREDIT NOTE row but NOT the invoice, and
-- writes `balance = COALESCE(v_new_bal, balance)` from the stale CLIENT value —
-- so it over-credits AR past zero and overwrites the fresher receipt-reduced
-- balance (double-counting the receipt).
--
-- Fix: CREATE OR REPLACE credit_note_atomic (faithful copy of 090's body) with:
--   1. SELECT balance ... FROM invoices WHERE id = v_inv_id FOR UPDATE  (lock + live read)
--   2. RAISE if the CN amount > live balance (+0.5 epsilon for GST-split rounding)
--   3. SET balance = GREATEST(0, live_balance - cn_amount)  (server-derived, not client)
-- Same rows/behaviour otherwise. void_invoice_atomic is unchanged (it already
-- FOR-UPDATE-locks the invoice). Depends on 042 (assert_ledger_balance,
-- _insert_ledger_row) + 090. Idempotent (CREATE OR REPLACE). Staging-first.
-- ============================================================================

CREATE OR REPLACE FUNCTION credit_note_atomic(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_company    TEXT    := p_payload->>'company';
  v_cn_id      TEXT    := p_payload->>'cn_id';
  v_ledger     JSONB   := p_payload->'reversal_ledger_row';
  v_inv_id     TEXT    := p_payload->>'invoice_id';
  v_new_status TEXT    := NULLIF(p_payload->>'invoice_new_status','');
  v_cn_data    JSONB   := p_payload->'cn_data';
  v_gl_id      TEXT    := v_ledger->>'id';
  v_cn_status  TEXT;
  v_dummy      INT;
  v_cur_bal    NUMERIC;   -- 094: live invoice balance under row lock
  v_cn_amt     NUMERIC;   -- 094: the CN amount being approved
BEGIN
  IF v_company IS NULL OR v_cn_id IS NULL OR v_ledger IS NULL
     OR v_ledger = 'null'::JSONB OR v_inv_id IS NULL THEN
    RAISE EXCEPTION 'invalid_payload: company, cn_id, reversal_ledger_row, invoice_id required';
  END IF;
  IF v_gl_id IS NULL THEN
    RAISE EXCEPTION 'invalid_payload: reversal_ledger_row.id required';
  END IF;

  -- ── Maker-Checker guard: lock the CN and re-assert Pending Approval ──
  SELECT status INTO v_cn_status FROM credit_notes WHERE id = v_cn_id FOR UPDATE;
  IF FOUND AND v_cn_status IS DISTINCT FROM 'Pending Approval' THEN
    RAISE EXCEPTION 'cn_not_pending: % is "%" — only Pending Approval CNs can be posted',
      v_cn_id, v_cn_status;
  END IF;

  -- ── Idempotency: the deterministic reversal GL tx must not exist yet ──
  SELECT 1 INTO v_dummy FROM ledger WHERE id = v_gl_id;
  IF FOUND THEN
    RAISE EXCEPTION 'gl_already_posted: %', v_gl_id;
  END IF;

  -- ── Pre-flight balance check ──
  PERFORM assert_ledger_balance(v_ledger->'details');

  -- ── 094 (P1-14): lock the invoice, re-read the LIVE balance, re-assert the
  --    amount<=balance invariant SERVER-SIDE, and derive the new balance from
  --    the server value — never the (possibly stale) client invoice_new_balance.
  SELECT balance INTO v_cur_bal FROM invoices WHERE id = v_inv_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found: %', v_inv_id;
  END IF;
  v_cn_amt := COALESCE(NULLIF(v_cn_data->>'amount','')::NUMERIC, 0);
  IF v_cn_amt > v_cur_bal + 0.5 THEN
    RAISE EXCEPTION 'cn_exceeds_live_balance: credit note % (%) exceeds invoice % live balance % — a receipt may have posted since issue; re-issue for the current balance',
      v_cn_id, v_cn_amt, v_inv_id, v_cur_bal;
  END IF;

  -- 1. Reversing GL (Dr Revenue/GST, Cr AR)
  PERFORM _insert_ledger_row(v_ledger);

  -- 2. Reduce invoice balance server-side (+ optional status change)
  UPDATE invoices
     SET balance    = GREATEST(0, v_cur_bal - v_cn_amt),
         status     = COALESCE(v_new_status, status),
         updated_at = now()
   WHERE id = v_inv_id;

  -- 3. Flip CN → Posted (INSERT if the pending row never synced, else UPDATE)
  INSERT INTO credit_notes (
    id, company, invoice_id, invoice_no, client_id, client_name,
    date, reason, amount, gl_tx_id, status, created_by, created_at, updated_at, data
  )
  VALUES (
    v_cn_id, v_company,
    v_cn_data->>'invoiceId', v_cn_data->>'invoiceNo',
    v_cn_data->>'clientId',  v_cn_data->>'clientName',
    NULLIF(v_cn_data->>'date','')::DATE,
    v_cn_data->>'reason',
    COALESCE(NULLIF(v_cn_data->>'amount','')::NUMERIC, 0),
    v_gl_id, 'Posted',
    v_cn_data->>'createdBy',
    COALESCE(NULLIF(v_cn_data->>'createdAt','')::TIMESTAMPTZ, now()),
    now(),
    COALESCE(v_cn_data, '{}'::JSONB)
  )
  ON CONFLICT (id) DO UPDATE
    SET status     = 'Posted',
        gl_tx_id   = v_gl_id,
        data       = COALESCE(EXCLUDED.data, credit_notes.data),
        updated_at = now();

  RETURN jsonb_build_object(
    'cn_id', v_cn_id, 'gl_tx_id', v_gl_id, 'invoice_id', v_inv_id
  );
END $$;

NOTIFY pgrst, 'reload schema';

-- VERIFY (staging): issue a CN for the full balance, post a receipt on the same
-- invoice (balance -> lower), then approve the CN → must RAISE
-- 'cn_exceeds_live_balance'. A CN within the live balance still posts, and the
-- invoice balance ends at GREATEST(0, live - amount).
