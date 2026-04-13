-- ═══════════════════════════════════════════════════════════════════
-- Migration: Decision Intelligence — Three-Layer Agent Memory
-- Date: 2026-04-16
-- Purpose: Episodic (what happened), Semantic (what it means),
--          Procedural (what to do) memory for decision agents
-- ═══════════════════════════════════════════════════════════════════

-- ── Layer 1: Episodic Memory (What happened) ─────────────────────────
-- Every decision an agent makes, with full context snapshot.
-- Outcome tracked after 30-60 days. Owner feedback stored.
CREATE TABLE IF NOT EXISTS agent_episodic_memory (
  decision_id       TEXT PRIMARY KEY,
  agent_type        TEXT NOT NULL CHECK (agent_type IN ('finance', 'production', 'ops')),
  decision_type     TEXT NOT NULL,
  context_snapshot  JSONB NOT NULL DEFAULT '{}',
  decision_made     TEXT NOT NULL CHECK (decision_made IN ('APPROVE', 'REJECT', 'APPROVE_WITH_CONDITIONS', 'ESCALATE', 'DEFER')),
  reasoning         TEXT NOT NULL,
  conditions        JSONB DEFAULT '[]',
  confidence_score  NUMERIC(4,3) NOT NULL DEFAULT 0.500,
  outcome           TEXT CHECK (outcome IN ('success', 'failure', 'partial', 'paid', 'defaulted', 'delayed', 'cancelled', 'pending')),
  outcome_value     NUMERIC(14,2),
  outcome_date      TIMESTAMPTZ,
  owner_feedback    TEXT CHECK (owner_feedback IN ('confirmed', 'overridden', 'amended')),
  override_reason   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_episodic_agent_type ON agent_episodic_memory (agent_type, decision_type);
CREATE INDEX IF NOT EXISTS idx_episodic_outcome ON agent_episodic_memory (outcome) WHERE outcome IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_episodic_created ON agent_episodic_memory (created_at DESC);

ALTER TABLE agent_episodic_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_episodic" ON agent_episodic_memory
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Layer 2: Semantic Memory (What it means) ─────────────────────────
-- Extracted facts from repeated decision patterns.
-- Example: "Saad Builders pays 35 days late but always pays"
CREATE TABLE IF NOT EXISTS agent_semantic_memory (
  fact_id              TEXT PRIMARY KEY,
  agent_type           TEXT NOT NULL,
  fact_category        TEXT NOT NULL CHECK (fact_category IN (
    'client_behavior', 'vendor_reliability', 'product_performance',
    'seasonal_pattern', 'cost_trend', 'quality_pattern', 'operational'
  )),
  fact_statement       TEXT NOT NULL,
  confidence           NUMERIC(4,3) NOT NULL DEFAULT 0.500,
  supporting_decisions TEXT[] NOT NULL DEFAULT '{}',
  evidence_count       INTEGER NOT NULL DEFAULT 0,
  invalidated          BOOLEAN NOT NULL DEFAULT false,
  invalidated_reason   TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_semantic_agent ON agent_semantic_memory (agent_type, fact_category);
CREATE INDEX IF NOT EXISTS idx_semantic_valid ON agent_semantic_memory (invalidated) WHERE invalidated = false;

ALTER TABLE agent_semantic_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_semantic" ON agent_semantic_memory
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Layer 3: Procedural Memory (What to do) ──────────────────────────
-- Rules that guide agent decisions. Hard rules cannot be overridden.
-- Soft rules adjust based on outcomes. Guidelines are suggestions.
CREATE TABLE IF NOT EXISTS agent_procedural_memory (
  rule_id          TEXT PRIMARY KEY,
  agent_type       TEXT NOT NULL,
  rule_type        TEXT NOT NULL CHECK (rule_type IN ('hard_rule', 'soft_rule', 'guideline')),
  condition_text   TEXT NOT NULL,
  action_text      TEXT NOT NULL,
  priority         INTEGER NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  override_count   INTEGER NOT NULL DEFAULT 0,
  follow_count     INTEGER NOT NULL DEFAULT 0,
  success_rate     NUMERIC(4,3) NOT NULL DEFAULT 0.500,
  created_by       TEXT NOT NULL DEFAULT 'system' CHECK (created_by IN ('owner', 'system', 'learned')),
  active           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_procedural_agent ON agent_procedural_memory (agent_type, rule_type);
CREATE INDEX IF NOT EXISTS idx_procedural_active ON agent_procedural_memory (active) WHERE active = true;

ALTER TABLE agent_procedural_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_procedural" ON agent_procedural_memory
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Seed Hard Rules (Never Auto-Override) ────────────────────────────
INSERT INTO agent_procedural_memory (rule_id, agent_type, rule_type, condition_text, action_text, priority, created_by) VALUES
  ('HR-FIN-001', 'finance', 'hard_rule', 'Client overdue > 90 days on any invoice', 'REJECT new credit. Require 100% advance.', 10, 'owner'),
  ('HR-FIN-002', 'finance', 'hard_rule', 'GL posting date outside open fiscal period', 'BLOCK posting. Period must be reopened first.', 10, 'owner'),
  ('HR-FIN-003', 'finance', 'hard_rule', 'Payment voucher > PKR 50,000 without signed PO', 'ESCALATE to owner. Do not process.', 10, 'owner'),
  ('HR-FIN-004', 'finance', 'hard_rule', 'Bad debt write-off < PKR 10,000 without legal notice', 'BLOCK. Legal notice must be sent first.', 10, 'owner'),
  ('HR-PROD-001', 'production', 'hard_rule', 'Dispatch order with pieces NOT in QC-Passed/Ready status', 'BLOCK dispatch. All pieces must pass QC.', 10, 'owner'),
  ('HR-PROD-002', 'production', 'hard_rule', 'Production without approved sales order', 'BLOCK. MFG-1 ghost order prevention.', 10, 'owner'),
  ('HR-OPS-001', 'ops', 'hard_rule', 'Purchase from vendor not in vendor master', 'REJECT. Add vendor first, then create PO.', 10, 'owner'),
  ('HR-OPS-002', 'ops', 'hard_rule', 'Stock issue exceeds available unrestricted quantity', 'BLOCK. SCM-3 insufficient stock.', 10, 'owner')
ON CONFLICT (rule_id) DO NOTHING;

-- ── Seed Soft Rules (Learn Over Time) ────────────────────────────────
INSERT INTO agent_procedural_memory (rule_id, agent_type, rule_type, condition_text, action_text, priority, created_by) VALUES
  ('SR-FIN-001', 'finance', 'soft_rule', 'Client overdue 30-90 days', 'Require 50% advance on new orders.', 7, 'owner'),
  ('SR-FIN-002', 'finance', 'soft_rule', 'Vendor offers early payment discount', 'Prioritize payment if cash available.', 6, 'owner'),
  ('SR-FIN-003', 'finance', 'soft_rule', 'Client lifetime revenue > PKR 5M', 'Allow 15% more credit tolerance than standard.', 5, 'owner'),
  ('SR-PROD-001', 'production', 'soft_rule', 'Piece value < PKR 5,000 and breakage at cutting', 'Auto-approve recut without escalation.', 6, 'owner'),
  ('SR-PROD-002', 'production', 'soft_rule', 'Tempering batch below 70% capacity', 'Wait up to 4 hours for more pieces.', 5, 'owner'),
  ('SR-PROD-003', 'production', 'soft_rule', 'Remnant age > 45 days and no size match', 'Recommend scrap disposal.', 5, 'system'),
  ('SR-OPS-001', 'ops', 'soft_rule', 'Stock below 20% of monthly average usage', 'Auto-generate requisition for reorder.', 6, 'owner'),
  ('SR-OPS-002', 'ops', 'soft_rule', 'Vendor breach rate > 30%', 'Flag for review. Suggest alternative vendor.', 7, 'system')
ON CONFLICT (rule_id) DO NOTHING;
