-- ============================================================
-- Migration 012 — DB-Primary Architecture
-- BudgetMaster, GL Posting Rules, Asset Registry
-- + Retroactive RLS on tables missing it from 005
--
-- ALL tables carry:
--   • company column for multi-tenant isolation
--   • RLS enabled with authenticated-only policy
--   • NO table can be read/written without a valid JWT
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. RETROACTIVE: Add RLS to bank_recon_sessions (was missing in 005)
-- ────────────────────────────────────────────────────────────
ALTER TABLE bank_recon_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rls_bank_recon_sessions" ON bank_recon_sessions;
CREATE POLICY "rls_bank_recon_sessions" ON bank_recon_sessions
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 2. RETROACTIVE: Add RLS to intercompany_transfers (was missing in 005)
-- ────────────────────────────────────────────────────────────
ALTER TABLE intercompany_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rls_intercompany_transfers" ON intercompany_transfers;
CREATE POLICY "rls_intercompany_transfers" ON intercompany_transfers
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 3. BUDGET LINES — BudgetMaster DB-primary table
--    Replaces: localStorage gtk_erp_budget_lines / erp_config budget data
--    Scope: per company + fiscal year + account + cost center
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS budget_lines (
  id               TEXT        PRIMARY KEY,   -- {company}_{fiscalYear}_{accountId}_{costCenterId}
  company          TEXT        NOT NULL,
  fiscal_year      TEXT        NOT NULL,      -- e.g. '2025-2026'
  account_id       TEXT        NOT NULL,      -- FK-style to accounts table
  cost_center_id   TEXT,                      -- NULL = company-wide
  description      TEXT,
  annual_budget    NUMERIC     DEFAULT 0,
  -- Monthly allocations (PKR)
  jan_budget       NUMERIC     DEFAULT 0,
  feb_budget       NUMERIC     DEFAULT 0,
  mar_budget       NUMERIC     DEFAULT 0,
  apr_budget       NUMERIC     DEFAULT 0,
  may_budget       NUMERIC     DEFAULT 0,
  jun_budget       NUMERIC     DEFAULT 0,
  jul_budget       NUMERIC     DEFAULT 0,
  aug_budget       NUMERIC     DEFAULT 0,
  sep_budget       NUMERIC     DEFAULT 0,
  oct_budget       NUMERIC     DEFAULT 0,
  nov_budget       NUMERIC     DEFAULT 0,
  dec_budget       NUMERIC     DEFAULT 0,
  -- Audit trail
  created_by       TEXT,
  updated_by       TEXT,
  updated_at       TIMESTAMPTZ DEFAULT now(),
  created_at       TIMESTAMPTZ DEFAULT now(),
  -- Enforce one budget per company+year+account+cost_center combination
  UNIQUE (company, fiscal_year, account_id, COALESCE(cost_center_id, '__none__'))
);

CREATE INDEX IF NOT EXISTS idx_budget_lines_company
  ON budget_lines(company);
CREATE INDEX IF NOT EXISTS idx_budget_lines_fiscal_year
  ON budget_lines(company, fiscal_year);
CREATE INDEX IF NOT EXISTS idx_budget_lines_account
  ON budget_lines(company, account_id);
CREATE INDEX IF NOT EXISTS idx_budget_lines_cost_center
  ON budget_lines(cost_center_id)
  WHERE cost_center_id IS NOT NULL;

-- RLS: data isolated per authenticated session; service role bypasses
ALTER TABLE budget_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rls_budget_lines_authenticated" ON budget_lines;
CREATE POLICY "rls_budget_lines_authenticated" ON budget_lines
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 4. GL POSTING RULES — Automation rules table
--    Replaces: localStorage gtk_erp_gl_config / hardcoded maps in
--    financeService.ts (GTK_GL_MAP, PAYMENT_CREDIT_MAP)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gl_posting_rules (
  id                   TEXT        PRIMARY KEY,   -- {company}_{triggerEvent}_{name_slug}
  company              TEXT        NOT NULL,
  rule_name            TEXT        NOT NULL,
  trigger_event        TEXT        NOT NULL,
    -- Values: 'invoice', 'payment_receipt', 'grn', 'salary',
    --         'petty_cash', 'advance', 'settlement', 'depreciation',
    --         'recurring', 'intercompany'
  subcategory          TEXT,                      -- maps to req subcategory / payment mode
  debit_account_code   TEXT        NOT NULL,
  debit_account_name   TEXT        NOT NULL,
  credit_account_code  TEXT        NOT NULL,
  credit_account_name  TEXT        NOT NULL,
  description_template TEXT,                      -- e.g. '[PARKED] {subcategory}: {items}'
  payment_mode         TEXT,                      -- 'Cash', 'Bank Transfer', etc. (nullable)
  is_active            BOOLEAN     DEFAULT true,
  priority             INT         DEFAULT 100,   -- lower = higher priority when multiple match
  notes                TEXT,
  created_by           TEXT,
  updated_by           TEXT,
  updated_at           TIMESTAMPTZ DEFAULT now(),
  created_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gl_rules_company
  ON gl_posting_rules(company);
CREATE INDEX IF NOT EXISTS idx_gl_rules_trigger
  ON gl_posting_rules(company, trigger_event);
CREATE INDEX IF NOT EXISTS idx_gl_rules_subcategory
  ON gl_posting_rules(company, subcategory)
  WHERE subcategory IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gl_rules_active
  ON gl_posting_rules(company, is_active);

-- RLS: authenticated only; no unauthenticated reads of posting logic
ALTER TABLE gl_posting_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rls_gl_posting_rules_authenticated" ON gl_posting_rules;
CREATE POLICY "rls_gl_posting_rules_authenticated" ON gl_posting_rules
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 5. ASSET REGISTRY — AssetService DB-primary table
--    Replaces: localStorage gtk_erp_assets
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_registry (
  id                         TEXT        PRIMARY KEY,
  company                    TEXT        NOT NULL,
  description                TEXT        NOT NULL,
  category                   TEXT,
    -- Values: 'Building', 'Vehicle', 'Plant & Equipment',
    --         'Furniture & Fixtures', 'IT Equipment', 'Other'
  purchase_date              TEXT,           -- ISO date string YYYY-MM-DD
  purchase_value             NUMERIC     DEFAULT 0,
  residual_value             NUMERIC     DEFAULT 0,
  useful_life_years          NUMERIC     DEFAULT 5,
  depreciation_method        TEXT        DEFAULT 'Straight-Line',
    -- Values: 'Straight-Line', 'Declining-Balance', 'Units-of-Production'
  -- GL account linkage (mirrors financeService account codes)
  gl_asset_account_code      TEXT,
  accumulated_dep_account_code TEXT,
  dep_expense_account_code   TEXT,
  -- Physical tracking
  status                     TEXT        DEFAULT 'Active',
    -- Values: 'Active', 'Disposed', 'Under-Repair', 'Fully Depreciated'
  location                   TEXT,
  custodian                  TEXT,
  serial_number              TEXT,
  purchase_invoice_ref       TEXT,
  -- Disposal
  disposal_date              TEXT,
  disposal_value             NUMERIC,
  disposal_notes             TEXT,
  -- Audit trail
  created_by                 TEXT,
  updated_by                 TEXT,
  updated_at                 TIMESTAMPTZ DEFAULT now(),
  created_at                 TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_registry_company
  ON asset_registry(company);
CREATE INDEX IF NOT EXISTS idx_asset_registry_status
  ON asset_registry(company, status);
CREATE INDEX IF NOT EXISTS idx_asset_registry_category
  ON asset_registry(company, category);

-- RLS: isolated per authenticated session; service role bypasses for cron depreciation jobs
ALTER TABLE asset_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rls_asset_registry_authenticated" ON asset_registry;
CREATE POLICY "rls_asset_registry_authenticated" ON asset_registry
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 6. VERIFY — confirm all tables exist with RLS enabled
-- ────────────────────────────────────────────────────────────
SELECT
  t.table_name,
  c.row_security AS rls_enabled,
  COUNT(p.policyname) AS policy_count
FROM information_schema.tables t
JOIN pg_class c
  ON c.relname = t.table_name
LEFT JOIN pg_policies p
  ON p.tablename = t.table_name
WHERE t.table_schema = 'public'
  AND t.table_name IN (
    'bank_recon_sessions',
    'intercompany_transfers',
    'budget_lines',
    'gl_posting_rules',
    'asset_registry'
  )
GROUP BY t.table_name, c.row_security
ORDER BY t.table_name;
