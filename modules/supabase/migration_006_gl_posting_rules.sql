-- ============================================================
-- Migration 006: gl_posting_rules
-- Phase 3 Fix: FC-04 — Remove hardcoded GL account maps
-- Run once in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS gl_posting_rules (
  id           TEXT PRIMARY KEY,
  company      TEXT NOT NULL,
  rule_key     TEXT NOT NULL,
  description  TEXT DEFAULT '',
  debit_code   TEXT NOT NULL,
  debit_name   TEXT DEFAULT '',
  credit_code  TEXT NOT NULL,
  credit_name  TEXT DEFAULT '',
  doc_type     TEXT NOT NULL DEFAULT 'JV',
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gl_posting_rules_key
  ON gl_posting_rules (company, rule_key);

ALTER TABLE gl_posting_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gl_rules_authenticated"
  ON gl_posting_rules FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Seed default rules for GTK
INSERT INTO gl_posting_rules (id, company, rule_key, description, debit_code, debit_name, credit_code, credit_name, doc_type)
VALUES
  ('PR-GRN_INVENTORY-GTK',  'GTK',     'GRN_INVENTORY',  'GRN Post — Stock receipt',         '11511','Inventory — Raw Materials',          '21151','GR/IR Clearing — Materials', 'KR'),
  ('PR-SALARY-GTK',         'GTK',     'SALARY_POSTING', 'Monthly payroll salary expense',     '51111','Salaries & Wages',                  '22111','Salaries Payable',           'PV'),
  ('PR-SALES_INVOICE-GTK',  'GTK',     'SALES_INVOICE',  'Sales invoice AR + Revenue',         '12210','Trade Receivables — Customers',      '41110','Sales Revenue',              'DR'),
  ('PR-CREDIT_NOTE-GTK',    'GTK',     'CREDIT_NOTE',    'Credit note revenue reversal',       '41110','Sales Revenue',                      '12210','Trade Receivables',          'RV'),
  ('PR-GRN_GLASS-GCO',      'Glassco', 'GRN_GLASS',      'GlassCo GRN float glass inward',    '11511','Glass Inventory — Raw',              '21151','GR/IR Clearing — Glass',     'KR'),
  ('PR-NCR_BREAKAGE-GCO',   'Glassco', 'NCR_BREAKAGE',   'NCR glass breakage write-off',       '56113','Glass Breakage & Write-off',         '11511','Glass Inventory — Raw',      'JV'),
  ('PR-SALES_INVOICE-GCO',  'Glassco', 'SALES_INVOICE',  'Sales invoice AR + Revenue',         '12210','Trade Receivables — Customers',      '41110','Sales Revenue',              'DR')
ON CONFLICT (company, rule_key) DO NOTHING;

-- SELECT * FROM gl_posting_rules ORDER BY company, rule_key;
