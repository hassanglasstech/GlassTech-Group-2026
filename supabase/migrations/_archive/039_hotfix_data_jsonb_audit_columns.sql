-- ═══════════════════════════════════════════════════════════════════════
-- Migration 039 — Hotfix Round 2: missing data JSONB + audit columns
--
-- After 038 was applied and the live-readiness battery resumed, the
-- Supabase logs revealed a second wave of missing columns:
--
--   • invoices.created_by    — from migration 009 (audit_trail)
--   • invoices.updated_by    — from migration 009
--   • clients.data           — from migration 001 (JSONB dual-write)
--   • quotations.data        — from migration 001
--   • all other Sales tables — `data JSONB` dual-write requires this column
--
-- The dual-write pattern in AsyncSalesService writes BOTH the flat columns
-- AND a `data` JSONB blob (zero data loss for ad-hoc fields). If `data`
-- is missing, every save throws "Could not find the 'data' column".
--
-- Migrations 001 + 009 appear to have not been fully applied — we
-- catch-up here. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 1. invoices — audit columns (migration 009)
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS created_by   TEXT,
  ADD COLUMN IF NOT EXISTS updated_by   TEXT,
  ADD COLUMN IF NOT EXISTS data         JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_invoices_created_by ON invoices(created_by);

-- ─────────────────────────────────────────────────────────────────────
-- 2. ledger — audit columns (migration 009)
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE ledger
  ADD COLUMN IF NOT EXISTS created_by   TEXT,
  ADD COLUMN IF NOT EXISTS updated_by   TEXT,
  ADD COLUMN IF NOT EXISTS posted_at    TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ledger_created_by  ON ledger(created_by);
CREATE INDEX IF NOT EXISTS idx_ledger_posted_at   ON ledger(posted_at);

-- ─────────────────────────────────────────────────────────────────────
-- 3. payment_receipts — audit columns (migration 009)
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE payment_receipts
  ADD COLUMN IF NOT EXISTS created_by   TEXT,
  ADD COLUMN IF NOT EXISTS updated_by   TEXT,
  ADD COLUMN IF NOT EXISTS data         JSONB DEFAULT '{}';

-- ─────────────────────────────────────────────────────────────────────
-- 4. JSONB `data` column — dual-write requires this on every Sales table
--    (migration 001 originally; defensive re-add in case table was
--    recreated without it.)
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE clients               ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}';
ALTER TABLE quotations            ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}';
ALTER TABLE credit_notes          ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}';
ALTER TABLE customer_complaints   ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}';
ALTER TABLE production_pieces     ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}';
ALTER TABLE job_orders            ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}';
ALTER TABLE vendors               ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}';
ALTER TABLE store_items           ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}';
ALTER TABLE stock_ledger          ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}';
ALTER TABLE requisitions          ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}';
ALTER TABLE purchase_orders       ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}';

-- ─────────────────────────────────────────────────────────────────────
-- 5. petty_cash — updated_by (migration 009)
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE petty_cash
  ADD COLUMN IF NOT EXISTS updated_by   TEXT;

-- ─────────────────────────────────────────────────────────────────────
-- 6. Reload PostgREST schema cache
-- ─────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────
-- 7. Verification — run after migration applies
-- ─────────────────────────────────────────────────────────────────────
-- SELECT table_name, column_name FROM information_schema.columns
--   WHERE table_name IN ('clients','quotations','invoices','credit_notes',
--                        'customer_complaints','production_pieces','vendors',
--                        'payment_receipts','store_items','requisitions',
--                        'purchase_orders','ledger','job_orders','stock_ledger')
--     AND column_name IN ('data','created_by','updated_by','posted_at')
--   ORDER BY table_name, column_name;
--
-- (Should return at least 18 rows — every Sales-cluster table has 'data'
--  column, and every audit-needed table has 'created_by'.)
-- ═══════════════════════════════════════════════════════════════════════
