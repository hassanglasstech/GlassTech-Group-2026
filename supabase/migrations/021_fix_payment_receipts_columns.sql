-- ══════════════════════════════════════════════════════════════════════
-- Migration 021 — Fix payment_receipts missing flat columns
--
-- Problem : Table created in 001 with only (id, company, data JSONB).
--           asyncSalesService + migration 017 RPC both expect flat cols:
--           invoice_id, date, amount, method, reference, gl_tx_id.
--           SELECT * with company filter → 400 from PostgREST schema cache.
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE payment_receipts
  ADD COLUMN IF NOT EXISTS invoice_id  TEXT,
  ADD COLUMN IF NOT EXISTS date        DATE,
  ADD COLUMN IF NOT EXISTS amount      NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS method      TEXT,
  ADD COLUMN IF NOT EXISTS reference   TEXT,
  ADD COLUMN IF NOT EXISTS gl_tx_id    TEXT,
  ADD COLUMN IF NOT EXISTS created_by  TEXT,
  ADD COLUMN IF NOT EXISTS updated_by  TEXT;

-- Index for the common join pattern (invoice_id lookup)
CREATE INDEX IF NOT EXISTS idx_payment_receipts_invoice
  ON payment_receipts (invoice_id);

CREATE INDEX IF NOT EXISTS idx_payment_receipts_company
  ON payment_receipts (company);

-- Reload PostgREST schema cache immediately
NOTIFY pgrst, 'reload schema';
