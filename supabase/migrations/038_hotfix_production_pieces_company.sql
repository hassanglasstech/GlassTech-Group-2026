-- ═══════════════════════════════════════════════════════════════════════
-- Migration 038 — Pre-Go-Live Schema Hotfix
--
-- Discovered during 2026-05-02 final live-readiness audit:
--   • production_pieces.company column missing → "column does not exist"
--   • quotations.cost_bearer column missing → AsyncSalesService.saveQuotations
--     fails silently, every quotation save fails to persist to Supabase
--   • quotations.order_type / original_order_ref / replacement_reason
--     missing too (same root cause: migration 027 never applied)
--
-- Multiple earlier migrations (016, 027) appear to have not been applied
-- on the live Supabase database. This migration is a comprehensive
-- IDEMPOTENT catch-up so every column the app writes actually exists.
--
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 1. production_pieces — company column + RLS (from migration 016)
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE production_pieces
  ADD COLUMN IF NOT EXISTS company TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS production_pieces_company_idx
  ON production_pieces (company);

ALTER TABLE production_pieces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_rls" ON production_pieces;
DROP POLICY IF EXISTS "production_pieces_company_isolation" ON production_pieces;
DROP POLICY IF EXISTS "production_pieces_rw" ON production_pieces;

CREATE POLICY "production_pieces_rw" ON production_pieces
  FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────
-- 2. job_orders — same as production_pieces
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE job_orders
  ADD COLUMN IF NOT EXISTS company TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS job_orders_company_idx
  ON job_orders (company);

ALTER TABLE job_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_rls" ON job_orders;
DROP POLICY IF EXISTS "job_orders_rw" ON job_orders;

CREATE POLICY "job_orders_rw" ON job_orders
  FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────
-- 3. quotations — replacement-order columns (from migration 027)
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS order_type          TEXT DEFAULT 'Standard',
  ADD COLUMN IF NOT EXISTS original_order_ref  TEXT,
  ADD COLUMN IF NOT EXISTS replacement_reason  TEXT,
  ADD COLUMN IF NOT EXISTS cost_bearer         TEXT;

CREATE INDEX IF NOT EXISTS idx_quotations_order_type
  ON quotations(order_type) WHERE order_type != 'Standard';
CREATE INDEX IF NOT EXISTS idx_quotations_original_order_ref
  ON quotations(original_order_ref) WHERE original_order_ref IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 4. quotations — every other flat column AsyncSalesService writes
--    (defensive — these were added by migration 032 but re-asserting
--    here in case 032 was also partially applied).
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS revised_fields        JSONB,
  ADD COLUMN IF NOT EXISTS received_amount       NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_delivery_date  DATE,
  ADD COLUMN IF NOT EXISTS service_charges       JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS manual_ref            TEXT,
  ADD COLUMN IF NOT EXISTS manual_serial         TEXT;

-- ─────────────────────────────────────────────────────────────────────
-- 5. clients — Phase-6 columns (from migration 036) — defensive
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS price_list_id    TEXT,
  ADD COLUMN IF NOT EXISTS customer_tier    TEXT;

-- ─────────────────────────────────────────────────────────────────────
-- 6. payment_receipts — comprehensive_schema_fixes columns
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE payment_receipts
  ADD COLUMN IF NOT EXISTS receipt_no       TEXT,
  ADD COLUMN IF NOT EXISTS payment_date     DATE,
  ADD COLUMN IF NOT EXISTS amount           NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method   TEXT,
  ADD COLUMN IF NOT EXISTS reference_no     TEXT,
  ADD COLUMN IF NOT EXISTS remarks          TEXT,
  ADD COLUMN IF NOT EXISTS company          TEXT,
  ADD COLUMN IF NOT EXISTS created_at       TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ DEFAULT now();

-- ─────────────────────────────────────────────────────────────────────
-- 7. Reload PostgREST schema cache so new columns are visible immediately
-- ─────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────
-- 8. Verification (paste in SQL Editor after applying):
--
-- SELECT table_name, count(*) AS col_count FROM information_schema.columns
--   WHERE table_name IN ('production_pieces','job_orders','quotations',
--                        'clients','payment_receipts')
--   GROUP BY table_name ORDER BY table_name;
--
-- -- Should be able to insert now:
-- SELECT 'cost_bearer'      AS col, count(*) FROM information_schema.columns
--   WHERE table_name='quotations' AND column_name='cost_bearer'
-- UNION ALL
-- SELECT 'company'          AS col, count(*) FROM information_schema.columns
--   WHERE table_name='production_pieces' AND column_name='company';
-- -- Both should return 1.
-- ═══════════════════════════════════════════════════════════════════════
