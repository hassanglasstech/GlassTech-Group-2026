-- ═══════════════════════════════════════════════════════════════════
-- Migration: Agent Execution Log — tracks all writes for reversal
-- Date: 2026-04-22
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agent_execution_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        TEXT,
  pattern_id        TEXT,
  event_label       TEXT,
  steps_executed    JSONB NOT NULL DEFAULT '[]',
  supabase_writes   JSONB NOT NULL DEFAULT '[]',
  executed_by       TEXT,
  executed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  reversed_at       TIMESTAMPTZ,
  reversed_by       TEXT,
  reversal_result   JSONB
);

CREATE INDEX IF NOT EXISTS idx_exec_log_date ON agent_execution_log (executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_exec_log_pattern ON agent_execution_log (pattern_id);

ALTER TABLE agent_execution_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all_exec_log" ON agent_execution_log;
CREATE POLICY "authenticated_all_exec_log" ON agent_execution_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
