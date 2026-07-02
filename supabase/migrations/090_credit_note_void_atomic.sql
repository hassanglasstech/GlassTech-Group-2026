-- ═══════════════════════════════════════════════════════════════════════
-- 090 — Atomic Credit-Note & Invoice-Void RPCs (God-mode audit #9)
-- ═══════════════════════════════════════════════════════════════════════
-- ⚠️  NOT YET APPLIED — HIGHEST BLAST RADIUS OF THE DEEP-5 SET.
--     Apply ONLY after: (1) founder sign-off, (2) two-browser concurrency
--     test on a staging project. Depends on 042 (assert_ledger_balance +
--     _insert_ledger_row helpers) and 032 (credit_notes/invoices/quotations
--     flat columns). Idempotent: CREATE OR REPLACE, safe to re-run.
--
-- WHY (audit #9, P0): approveCreditNote() and voidInvoice() each perform a
--   multi-step financial mutation on the client WITHOUT a transaction:
--     approve:  post reversing GL → reduce invoice balance → flip CN status
--     void:     post reversing GL → mark invoice Voided → revert quotation
--   A crash / lost connection mid-sequence leaves the books half-corrected —
--   e.g. GL reversal posted but the CN still "Pending Approval", so a re-approve
--   double-reverses; or invoice marked Voided while revenue stays recognised.
--   Two approvers clicking at once can BOTH post the reversal.
--
-- FIX: collapse each flow into ONE Postgres transaction with:
--   • FOR UPDATE row lock + status re-assert  → serialises concurrent callers
--   • deterministic GL-tx-id idempotency guard → a second post hits
--     `gl_already_posted` (tx id = GL-<cnId> / VOID-<invId> is deterministic)
--   • assert_ledger_balance()                  → never commit an unbalanced JV
--
-- OUT OF SCOPE (stays best-effort on the client, unchanged): the COGS wind-back
--   (reverseDeliveryCOGS) — it touches inventory/store_items via a separate
--   service and is already flagged as `cogsReversalPending` when it fails.
--
-- PRE-APPLY: the live DB has diverged from migration files before — these RPCs
--   reference only columns created in 032, and use the 042 helpers. Verify both
--   exist (see VERIFY block at the bottom) before applying.
-- ═══════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════
-- RPC #1 — credit_note_atomic
--
-- Posts a Pending-Approval credit note: reversing GL + invoice-balance
-- reduction + CN → Posted, all-or-nothing.
--
-- Payload (built client-side by approveCreditNote):
-- {
--   "company":              "Glassco",
--   "cn_id":                "CN-GLS-2026-0001",
--   "reversal_ledger_row":  <ledgerToRow output — Dr Revenue/GST, Cr AR>,
--   "invoice_id":           "INV-...",
--   "invoice_new_balance":  12345.67,
--   "invoice_new_status":   "Paid" | null,   -- null = leave status unchanged
--   "cn_data":              <full approved CreditNote object → data blob>
-- }
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION credit_note_atomic(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_company    TEXT    := p_payload->>'company';
  v_cn_id      TEXT    := p_payload->>'cn_id';
  v_ledger     JSONB   := p_payload->'reversal_ledger_row';
  v_inv_id     TEXT    := p_payload->>'invoice_id';
  v_new_bal    NUMERIC := NULLIF(p_payload->>'invoice_new_balance','')::NUMERIC;
  v_new_status TEXT    := NULLIF(p_payload->>'invoice_new_status','');
  v_cn_data    JSONB   := p_payload->'cn_data';
  v_gl_id      TEXT    := v_ledger->>'id';
  v_cn_status  TEXT;
  v_dummy      INT;
BEGIN
  IF v_company IS NULL OR v_cn_id IS NULL OR v_ledger IS NULL
     OR v_ledger = 'null'::JSONB OR v_inv_id IS NULL THEN
    RAISE EXCEPTION 'invalid_payload: company, cn_id, reversal_ledger_row, invoice_id required';
  END IF;
  IF v_gl_id IS NULL THEN
    RAISE EXCEPTION 'invalid_payload: reversal_ledger_row.id required';
  END IF;

  -- ── Maker-Checker guard: lock the CN and re-assert Pending Approval ──
  -- FOR UPDATE serialises two approvers. If the pending CN has not yet
  -- reached the cloud (issue → approve raced faster than the async push),
  -- v_cn_status is NULL and we proceed to INSERT it as Posted below — the
  -- GL idempotency guard is the real double-post protection.
  SELECT status INTO v_cn_status FROM credit_notes WHERE id = v_cn_id FOR UPDATE;
  IF FOUND AND v_cn_status IS DISTINCT FROM 'Pending Approval' THEN
    RAISE EXCEPTION 'cn_not_pending: % is "%%" — only Pending Approval CNs can be posted',
      v_cn_id, v_cn_status;
  END IF;

  -- ── Idempotency: the deterministic reversal GL tx must not exist yet ──
  SELECT 1 INTO v_dummy FROM ledger WHERE id = v_gl_id;
  IF FOUND THEN
    RAISE EXCEPTION 'gl_already_posted: %', v_gl_id;
  END IF;

  -- ── Pre-flight balance check ──
  PERFORM assert_ledger_balance(v_ledger->'details');

  -- 1. Reversing GL (Dr Revenue/GST, Cr AR)
  PERFORM _insert_ledger_row(v_ledger);

  -- 2. Reduce invoice balance (+ optional status change)
  UPDATE invoices
     SET balance    = COALESCE(v_new_bal, balance),
         status     = COALESCE(v_new_status, status),
         updated_at = now()
   WHERE id = v_inv_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found: %', v_inv_id;
  END IF;

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

-- ═══════════════════════════════════════════════════════════════════════
-- RPC #2 — void_invoice_atomic
--
-- Voids an unpaid invoice: reversing GL (optional) + invoice → Voided +
-- quotation → Approved, all-or-nothing.
--
-- Payload (built client-side by voidInvoice):
-- {
--   "company":              "Glassco",
--   "invoice_id":           "INV-...",
--   "reversal_ledger_row":  <ledgerToRow output — swapped Dr/Cr> | null,
--   "quotation_id":         "Q-..." | null,
--   "voided_by":            "user@x",
--   "voided_at":            "2026-07-02"
-- }
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION void_invoice_atomic(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_company   TEXT  := p_payload->>'company';
  v_inv_id    TEXT  := p_payload->>'invoice_id';
  v_ledger    JSONB := p_payload->'reversal_ledger_row';
  v_quote_id  TEXT  := NULLIF(p_payload->>'quotation_id','');
  v_voided_by TEXT  := p_payload->>'voided_by';
  v_voided_at TEXT  := p_payload->>'voided_at';
  v_gl_id     TEXT  := v_ledger->>'id';
  v_inv       RECORD;
  v_dummy     INT;
  v_has_rev   BOOLEAN := (v_ledger IS NOT NULL AND v_ledger <> 'null'::JSONB);
BEGIN
  IF v_company IS NULL OR v_inv_id IS NULL THEN
    RAISE EXCEPTION 'invalid_payload: company + invoice_id required';
  END IF;

  -- ── Lock invoice + re-assert void-eligibility (double-void guard) ──
  SELECT * INTO v_inv FROM invoices WHERE id = v_inv_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found: %', v_inv_id;
  END IF;
  IF v_inv.status = 'Voided' THEN
    RAISE EXCEPTION 'invoice_already_voided: %', v_inv_id;
  END IF;
  IF v_inv.status = 'Paid' THEN
    RAISE EXCEPTION 'invoice_paid_cannot_void: %', v_inv_id;
  END IF;
  IF COALESCE(v_inv.received_amount, 0) > 0 THEN
    RAISE EXCEPTION 'invoice_has_payments: % has PKR % received — issue a credit note',
      v_inv_id, v_inv.received_amount;
  END IF;

  -- ── Reversing GL (optional — original GL may be missing) ──
  IF v_has_rev THEN
    IF v_gl_id IS NOT NULL THEN
      SELECT 1 INTO v_dummy FROM ledger WHERE id = v_gl_id;
      IF FOUND THEN
        RAISE EXCEPTION 'gl_already_posted: %', v_gl_id;
      END IF;
    END IF;
    PERFORM assert_ledger_balance(v_ledger->'details');
    PERFORM _insert_ledger_row(v_ledger);
  END IF;

  -- ── Mark invoice Voided (preserve prior status for restore) ──
  UPDATE invoices
     SET reverted_status = COALESCE(reverted_status, status),
         status          = 'Voided',
         balance         = 0,
         voided_by       = v_voided_by,
         voided_at       = NULLIF(v_voided_at,'')::DATE,
         updated_at      = now()
   WHERE id = v_inv_id;

  -- ── Revert the source quotation to Approved (drop invoiceNo) ──
  IF v_quote_id IS NOT NULL THEN
    UPDATE quotations
       SET status     = 'Approved',
           data       = COALESCE(data, '{}'::JSONB) || jsonb_build_object('invoiceNo', NULL),
           updated_at = now()
     WHERE id = v_quote_id;
  END IF;

  RETURN jsonb_build_object(
    'invoice_id', v_inv_id,
    'gl_tx_id',   v_gl_id,
    'reversed',   v_has_rev
  );
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- Grants — mirror 042 (RLS on the underlying tables is the real gate;
-- these are INVOKER-rights functions, not SECURITY DEFINER, so they cannot
-- escalate past the caller's row-level policies).
-- ─────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION credit_note_atomic(JSONB)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION void_invoice_atomic(JSONB) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- VERIFY dependencies BEFORE applying:
--   SELECT proname FROM pg_proc WHERE proname IN
--     ('assert_ledger_balance','_insert_ledger_row');           -- from 042
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='credit_notes' AND column_name='status'; -- from 032
--
-- VERIFY after applying:
--   SELECT proname FROM pg_proc WHERE proname IN
--     ('credit_note_atomic','void_invoice_atomic');             -- expect 2 rows
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS credit_note_atomic(JSONB);
--   DROP FUNCTION IF EXISTS void_invoice_atomic(JSONB);
-- ---------------------------------------------------------------------------
