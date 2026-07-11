-- ═══════════════════════════════════════════════════════════════════════
-- Migration 032 — Phase 1: Sales Data Layer (GO-LIVE BLOCKER FIX)
--
-- Audit findings addressed:
--   D1  Invoice table missing flat columns (order_id, total_amount,
--       received_amount, balance, status, payments, items …)
--       → every Glassco invoice cloud-write was silently failing.
--   D2  Client table missing flat columns (contact_person, email, phone,
--       ntn, credit_limit, status) → client cloud sync broken.
--   D3  No `credit_notes` Supabase table — refunds invisible across
--       devices (localStorage-only).
--   D4  process_payment_receipt RPC depends on D1 columns + needs
--       single-user fallback (no user_profiles row).
--   D7  `quotations` 3-writer conflict: asyncSalesService writes JSONB
--       `data`; SyncService TABLE_PUSH writes flat columns; pull from
--       flat columns lost JSONB-only fields.  Solution: provide BOTH
--       (flat for indexable querying + JSONB for full preservation).
--
-- Run in Supabase SQL Editor.  Idempotent (uses IF NOT EXISTS / OR REPLACE).
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- D1: invoices flat columns
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS order_id          TEXT,
  ADD COLUMN IF NOT EXISTS order_no          TEXT,
  ADD COLUMN IF NOT EXISTS client_id         TEXT,
  ADD COLUMN IF NOT EXISTS client_name       TEXT,
  ADD COLUMN IF NOT EXISTS date              DATE,
  ADD COLUMN IF NOT EXISTS due_date          DATE,
  ADD COLUMN IF NOT EXISTS total_amount      NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS received_amount   NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance           NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status            TEXT DEFAULT 'Outstanding',
  ADD COLUMN IF NOT EXISTS gl_tx_id          TEXT,
  ADD COLUMN IF NOT EXISTS payments          JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS items             JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS service_charges   JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS project_name      TEXT,
  ADD COLUMN IF NOT EXISTS discount_amount   NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_percent       NUMERIC(5,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_amount        NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS voided_by         TEXT,
  ADD COLUMN IF NOT EXISTS voided_at         DATE,
  ADD COLUMN IF NOT EXISTS reverted_status   TEXT;       -- BA-01: preserved status before void

CREATE INDEX IF NOT EXISTS idx_invoices_client_status ON invoices(client_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_order_id     ON invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_date         ON invoices(date);

-- ─────────────────────────────────────────────────────────────────────
-- D2: clients flat columns
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS contact_person TEXT,
  ADD COLUMN IF NOT EXISTS email          TEXT,
  ADD COLUMN IF NOT EXISTS phone          TEXT,
  ADD COLUMN IF NOT EXISTS address        TEXT,
  ADD COLUMN IF NOT EXISTS ntn            TEXT,
  ADD COLUMN IF NOT EXISTS credit_limit   NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status         TEXT DEFAULT 'Active';

CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(company, status);

-- ─────────────────────────────────────────────────────────────────────
-- D7: quotations flat columns (keep JSONB `data` for backward compat)
--     Resolves the 3-writer conflict by giving BOTH writers the columns
--     they expect.  asyncSalesService now writes `data` JSONB AND flat
--     columns; SyncService TABLE_PUSH writes flat columns; pulls merge
--     JSONB → object so no fields are lost.
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS date                  DATE,
  ADD COLUMN IF NOT EXISTS due_date              DATE,
  ADD COLUMN IF NOT EXISTS client_id             TEXT,
  ADD COLUMN IF NOT EXISTS project_name          TEXT,
  ADD COLUMN IF NOT EXISTS subject               TEXT,
  ADD COLUMN IF NOT EXISTS items                 JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS status                TEXT DEFAULT 'Draft',
  ADD COLUMN IF NOT EXISTS is_already_dispatched BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS discount_percent      NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount       NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_serial         TEXT,
  ADD COLUMN IF NOT EXISTS order_no              TEXT,
  ADD COLUMN IF NOT EXISTS revised_fields        JSONB,
  ADD COLUMN IF NOT EXISTS received_amount       NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_delivery_date  DATE,
  ADD COLUMN IF NOT EXISTS service_charges       JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS manual_ref            TEXT;

CREATE INDEX IF NOT EXISTS idx_quotations_status   ON quotations(company, status);
CREATE INDEX IF NOT EXISTS idx_quotations_client   ON quotations(company, client_id);
CREATE INDEX IF NOT EXISTS idx_quotations_order_no ON quotations(order_no);
CREATE INDEX IF NOT EXISTS idx_quotations_date     ON quotations(date);

-- ─────────────────────────────────────────────────────────────────────
-- D3: credit_notes table (NEW)
--     Mirrors the in-app `CreditNote` interface from
--     modules/sales/services/creditNoteService.ts so refunds become
--     queryable, exportable, and survive cache clears.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS credit_notes (
  id           TEXT PRIMARY KEY,
  company      TEXT NOT NULL,
  invoice_id   TEXT,
  invoice_no   TEXT,
  client_id    TEXT,
  client_name  TEXT,
  date         DATE,
  reason       TEXT,
  amount       NUMERIC(15,2) DEFAULT 0,
  gl_tx_id     TEXT,
  status       TEXT DEFAULT 'Posted',         -- 'Posted' | 'Void'
  created_by   TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  data         JSONB DEFAULT '{}'              -- forward-compat blob
);

CREATE INDEX IF NOT EXISTS idx_credit_notes_company ON credit_notes(company);
CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice ON credit_notes(invoice_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_date    ON credit_notes(date);

-- Single-user mode: keep RLS permissive (user requested no role gating).
ALTER TABLE credit_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "credit_notes_rw"       ON credit_notes;
DROP POLICY IF EXISTS "credit_notes_anon_rw"  ON credit_notes;
CREATE POLICY "credit_notes_rw" ON credit_notes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "credit_notes_anon_rw" ON credit_notes
  FOR ALL TO anon          USING (true) WITH CHECK (true);

GRANT ALL ON credit_notes TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- D4: process_payment_receipt — single-user friendly rewrite
--     Original RPC raised "Cross-company receipt denied" when
--     user_profiles was empty (NULL company).  Single-user setup has no
--     user_profiles row, so the cross-company guard now skips when the
--     caller's company cannot be resolved.  Behaviour for multi-company
--     setups is unchanged.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION process_payment_receipt(
  receipt_data  JSONB,
  p_invoice_id  TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice             RECORD;
  v_new_received_amount NUMERIC(15,2);
  v_new_balance         NUMERIC(15,2);
  v_receipt_id          TEXT;
  v_receipt_amount      NUMERIC(15,2);
  v_caller_company      TEXT;
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
    RAISE EXCEPTION 'SAL-4: Cross-company receipt denied — invoice company "%" ≠ caller company "%"',
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
    receipt_data->>'gl_tx_id',
    receipt_data->>'created_by',
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    amount     = EXCLUDED.amount,
    method     = EXCLUDED.method,
    reference  = EXCLUDED.reference,
    updated_at = now();

  -- Atomic invoice update in same transaction
  UPDATE invoices
  SET
    received_amount = v_new_received_amount,
    balance         = GREATEST(0, v_new_balance),
    status          = CASE
                        WHEN v_new_balance <= 0          THEN 'Paid'
                        WHEN v_new_received_amount > 0   THEN 'Partial'
                        ELSE COALESCE(v_invoice.status,'Outstanding')
                      END,
    updated_at      = now()
  WHERE id = p_invoice_id;

  RETURN jsonb_build_object(
    'receipt_id',          v_receipt_id,
    'invoice_id',          p_invoice_id,
    'new_received_amount', v_new_received_amount,
    'new_balance',         GREATEST(0, v_new_balance),
    'status',              CASE WHEN v_new_balance <= 0        THEN 'Paid'
                                WHEN v_new_received_amount > 0 THEN 'Partial'
                                ELSE COALESCE(v_invoice.status, 'Outstanding') END
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION process_payment_receipt(JSONB, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION process_payment_receipt(JSONB, TEXT) TO authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────
-- Reload PostgREST schema cache so new columns are immediately visible
-- ─────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────
-- VERIFICATION (run separately to confirm)
-- ─────────────────────────────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'invoices' AND column_name IN
--   ('order_id','total_amount','received_amount','balance','status','payments');
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'clients' AND column_name IN
--   ('contact_person','email','phone','ntn','credit_limit','status');
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'quotations' AND column_name IN
--   ('client_id','status','order_no','items');
-- SELECT * FROM credit_notes LIMIT 1;
-- SELECT proname FROM pg_proc WHERE proname = 'process_payment_receipt';
-- ═══════════════════════════════════════════════════════════════════════
