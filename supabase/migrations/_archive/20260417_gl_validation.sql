-- ═══════════════════════════════════════════════════════════════════
-- Migration: GL Validation & Intercompany Settlement
-- Date: 2026-04-17
-- Purpose: GL posting rules, pending approvals, intercompany tracking,
--          elimination log for IFRS 10 consolidation
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. GL Posting Rules (IAS/IFRS-referenced) ───────────────────────
CREATE TABLE IF NOT EXISTS gl_posting_rules_v2 (
  rule_id              TEXT PRIMARY KEY,
  rule_name            TEXT NOT NULL,
  trigger_event        TEXT NOT NULL,
  debit_account_code   TEXT NOT NULL,
  debit_account_name   TEXT NOT NULL,
  credit_account_code  TEXT NOT NULL,
  credit_account_name  TEXT NOT NULL,
  amount_formula       TEXT NOT NULL,
  ias_reference        TEXT NOT NULL,
  requires_approval    BOOLEAN NOT NULL DEFAULT false,
  approval_threshold   NUMERIC(14,2),
  period_lock_check    BOOLEAN NOT NULL DEFAULT true,
  agent_authority      TEXT[] NOT NULL DEFAULT '{}',
  validation_rules     JSONB NOT NULL DEFAULT '[]',
  active               BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE gl_posting_rules_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_glr" ON gl_posting_rules_v2
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed 12 GL touch point rules
INSERT INTO gl_posting_rules_v2 (rule_id, rule_name, trigger_event, debit_account_code, debit_account_name, credit_account_code, credit_account_name, amount_formula, ias_reference, requires_approval, approval_threshold, agent_authority) VALUES
  ('GLR-001', 'WIP Transfer on Cutting', 'production.cutting_assigned', '1310', 'Work in Progress', '1210', 'Raw Material Inventory', 'pieces.sum(sheet_cost_map)', 'IAS 2 - Inventory to WIP', false, NULL, ARRAY['ProductionAgent']),
  ('GLR-002', 'Labor Absorption', 'production.cutting_complete', '1310', 'Work in Progress', '2310', 'Wages Payable', 'pieces.count * labor_rate_per_piece', 'IAS 2 - Labor in inventory cost', false, NULL, ARRAY['ProductionAgent']),
  ('GLR-003', 'NCR Breakage Write-off', 'production.ncr_dispose', '5110', 'Glass Breakage Loss', '1310', 'WIP Glass', 'ncr.estimated_value', 'IAS 2 - Abnormal wastage', false, NULL, ARRAY['ProductionAgent', 'QCAgent']),
  ('GLR-004', 'Vendor Defect Debit Note', 'production.ncr_vendor_claim', '1150', 'Vendor Receivable', '5110', 'Production Loss Reversal', 'claim.amount', 'IAS 37 - Provisions', false, NULL, ARRAY['QCAgent']),
  ('GLR-005', 'Remnant Creation', 'production.remnant_created', '1320', 'Remnant Inventory', '1310', 'WIP', 'remnant.sqft * map_rate', 'IAS 2 - Inventory classification', false, NULL, ARRAY['ProductionAgent']),
  ('GLR-006', 'Remnant NRV Write-down', 'finance.nrv_writedown', '5410', 'Inventory Write-Down', '1320', 'Remnant Inventory', 'map_cost - nrv', 'IAS 2 - NRV adjustment', true, 50000, ARRAY['FinanceAgent']),
  ('GLR-007', 'Revenue Recognition', 'sales.delivery_signed', '1310', 'Accounts Receivable', '4110', 'Sales Revenue', 'invoice.total_amount', 'IFRS 15 - Performance obligation', true, NULL, ARRAY['SalesAgent']),
  ('GLR-008', 'COGS Recognition', 'sales.delivery_signed', '5010', 'Cost of Goods Sold', '1350', 'Finished Goods', 'job.total_cost', 'IAS 2 - COGS matching', false, NULL, ARRAY['FinanceAgent']),
  ('GLR-009', 'Petty Cash Expense', 'ops.petty_cash', '5XXX', 'Expense (by category)', '1050', 'Petty Cash', 'entry.amount', 'IAS 1 - Expense recognition', false, 5000, ARRAY['OpsAgent']),
  ('GLR-010', 'GRN Material Receipt', 'procurement.grn_posted', '1210', 'Raw Material', '2120', 'GRN Payable', 'grn.landed_cost', 'IAS 2 - Inventory at cost', false, NULL, ARRAY['PurchaseAgent']),
  ('GLR-011', 'Supplier Payment', 'finance.vendor_payment', '2120', 'GRN Payable', '1111', 'Bank Account', 'payment.amount', 'IAS 1 - Liability settlement', true, NULL, ARRAY['FinanceAgent']),
  ('GLR-012', 'Intercompany Transfer', 'intercompany.transfer', '1220', 'ICO Receivable', '4510', 'ICO Sales', 'transfer.amount', 'IAS 24 - Related party', true, NULL, ARRAY['FinanceAgent'])
ON CONFLICT (rule_id) DO NOTHING;

-- ── 2. GL Entries Pending Approval ───────────────────────────────────
CREATE TABLE IF NOT EXISTS gl_entries_pending_approval (
  entry_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name      TEXT NOT NULL,
  gl_rule_id      TEXT,
  entry_details   JSONB NOT NULL DEFAULT '{}',
  amount_pkr      NUMERIC(14,2) NOT NULL,
  company         TEXT NOT NULL,
  period          TEXT NOT NULL,
  reason          TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by     TEXT,
  approved_at     TIMESTAMPTZ,
  rejection_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_gl_pending_status ON gl_entries_pending_approval (status, company);

ALTER TABLE gl_entries_pending_approval ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_gl_pending" ON gl_entries_pending_approval
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 3. Intercompany Transaction Log ──────────────────────────────────
CREATE TABLE IF NOT EXISTS intercompany_transaction_log (
  txn_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_company       TEXT NOT NULL,
  to_company         TEXT NOT NULL,
  amount             NUMERIC(14,2) NOT NULL,
  description        TEXT,
  transaction_type   TEXT NOT NULL CHECK (transaction_type IN ('sale', 'purchase', 'transfer', 'settlement')),
  gl_entry_id_from   TEXT,
  gl_entry_id_to     TEXT,
  eliminated         BOOLEAN NOT NULL DEFAULT false,
  elimination_period TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_company <> to_company)
);

CREATE INDEX IF NOT EXISTS idx_ico_txn_period ON intercompany_transaction_log (elimination_period, eliminated);

ALTER TABLE intercompany_transaction_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_ico_txn" ON intercompany_transaction_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 4. Elimination Log (IFRS 10 Consolidation) ──────────────────────
CREATE TABLE IF NOT EXISTS elimination_log (
  elim_id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period                 TEXT NOT NULL,
  company_pair           TEXT NOT NULL,
  revenue_eliminated     NUMERIC(14,2) NOT NULL DEFAULT 0,
  cogs_eliminated        NUMERIC(14,2) NOT NULL DEFAULT 0,
  receivable_eliminated  NUMERIC(14,2) NOT NULL DEFAULT 0,
  payable_eliminated     NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_adjustment         NUMERIC(14,2) NOT NULL DEFAULT 0,
  elimination_entries    JSONB NOT NULL DEFAULT '[]',
  created_by             TEXT NOT NULL DEFAULT 'system',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE elimination_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_elim" ON elimination_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 5. GL Audit Trail Extension ──────────────────────────────────────
-- Tag agent-posted entries with journal type 'AGENT' for audit separation
-- (This is a design recommendation — actual ledger table already has doc_type)
COMMENT ON TABLE gl_posting_rules_v2 IS
  'Agent GL entries should use doc_type = AGT-JV for audit trail separation from manual JVs.';
