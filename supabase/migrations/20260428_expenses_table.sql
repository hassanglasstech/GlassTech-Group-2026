-- ═══════════════════════════════════════════════════════════════════
-- Migration: Expenses table for record_expense agent tool
-- Date: 2026-04-28
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS expenses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description  TEXT NOT NULL,
  amount       NUMERIC(14,2) NOT NULL,
  category     TEXT NOT NULL,
  company      TEXT NOT NULL DEFAULT 'GlassCo',
  paid_by      TEXT,
  notes        TEXT,
  recorded_by  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_company ON expenses (company, created_at DESC);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all_expenses" ON expenses;
CREATE POLICY "authenticated_all_expenses" ON expenses
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
