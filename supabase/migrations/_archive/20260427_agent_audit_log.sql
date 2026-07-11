-- ═══════════════════════════════════════════════════════════════════
-- Migration: Agent Audit Log — silent audit trail for all agent actions
-- Date: 2026-04-27
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agent_audit_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type       TEXT NOT NULL,
  module            TEXT NOT NULL DEFAULT 'general',
  user_id           TEXT,
  agent_id          TEXT,
  tool_name         TEXT,
  data_before       JSONB DEFAULT '{}',
  data_after        JSONB DEFAULT '{}',
  gl_entries_created JSONB DEFAULT '[]',
  approval_chain    JSONB DEFAULT '[]',
  risk_score        INTEGER NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 10),
  flags             TEXT[] NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_risk ON agent_audit_log (risk_score DESC) WHERE risk_score >= 7;
CREATE INDEX IF NOT EXISTS idx_audit_date ON agent_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_flags ON agent_audit_log USING GIN (flags);

ALTER TABLE agent_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read_audit" ON agent_audit_log;
CREATE POLICY "authenticated_read_audit" ON agent_audit_log
  FOR SELECT TO authenticated USING (true);
-- Insert allowed for system, no update/delete (immutable)
DROP POLICY IF EXISTS "authenticated_insert_audit" ON agent_audit_log;
CREATE POLICY "authenticated_insert_audit" ON agent_audit_log
  FOR INSERT TO authenticated WITH CHECK (true);
