-- ============================================================
-- Migration 009 — Audit Trail (Phase C)
-- Adds created_by, updated_by, posted_at columns to all
-- financial tables so every transaction is traceable.
-- Run in Supabase SQL Editor.
-- ============================================================

-- ── ledger ────────────────────────────────────────────────────────────
ALTER TABLE ledger
  ADD COLUMN IF NOT EXISTS created_by  TEXT,
  ADD COLUMN IF NOT EXISTS updated_by  TEXT,
  ADD COLUMN IF NOT EXISTS posted_at   TIMESTAMPTZ;

-- ── invoices ──────────────────────────────────────────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS created_by  TEXT,
  ADD COLUMN IF NOT EXISTS updated_by  TEXT;

-- ── payment_receipts ──────────────────────────────────────────────────
ALTER TABLE payment_receipts
  ADD COLUMN IF NOT EXISTS created_by  TEXT,
  ADD COLUMN IF NOT EXISTS updated_by  TEXT,
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ DEFAULT now();

-- ── petty_cash ────────────────────────────────────────────────────────
-- petty_cash already has recorded_by in data jsonb.
-- We add updated_by as a proper column for query-ability.
ALTER TABLE petty_cash
  ADD COLUMN IF NOT EXISTS updated_by  TEXT;

-- ── Indexes for audit queries ─────────────────────────────────────────
-- "Show me all transactions posted by user X"
CREATE INDEX IF NOT EXISTS idx_ledger_created_by  ON ledger(created_by);
CREATE INDEX IF NOT EXISTS idx_ledger_posted_at   ON ledger(posted_at);
CREATE INDEX IF NOT EXISTS idx_invoices_created_by ON invoices(created_by);

-- ── Verify ────────────────────────────────────────────────────────────
-- Run this SELECT after migration to confirm columns exist:
--
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name IN ('ledger','invoices','payment_receipts','petty_cash')
--   AND column_name IN ('created_by','updated_by','posted_at')
-- ORDER BY table_name, column_name;
