-- ═══════════════════════════════════════════════════════════════════
-- Migration: Agent Decisions — pre-execution recommendations
-- Date: 2026-04-23
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agent_decisions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department     TEXT NOT NULL DEFAULT 'general',
  decision_type  TEXT NOT NULL,
  context        JSONB NOT NULL DEFAULT '{}',
  decision       TEXT NOT NULL,
  reasoning      TEXT NOT NULL,
  conditions     TEXT[] NOT NULL DEFAULT '{}',
  confidence     NUMERIC(4,3) NOT NULL DEFAULT 0.500,
  outcome        TEXT CHECK (outcome IN ('correct','wrong','partial','pending')),
  outcome_date   TIMESTAMPTZ,
  outcome_notes  TEXT,
  feedback       TEXT CHECK (feedback IN ('followed','overridden','dismissed')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_decisions_dept ON agent_decisions (department, decision_type);
CREATE INDEX IF NOT EXISTS idx_decisions_date ON agent_decisions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_decisions_outcome ON agent_decisions (outcome) WHERE outcome IS NOT NULL;

ALTER TABLE agent_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all_decisions" ON agent_decisions;
CREATE POLICY "authenticated_all_decisions" ON agent_decisions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
