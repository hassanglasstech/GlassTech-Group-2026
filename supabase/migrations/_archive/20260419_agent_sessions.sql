-- ═══════════════════════════════════════════════════════════════════
-- Migration: Agent Sessions — Persistent conversation context
-- Date: 2026-04-19
-- Purpose: Store chat history per user per day for context continuity
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agent_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL,
  company       TEXT NOT NULL DEFAULT 'GlassCo',
  session_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  messages      JSONB NOT NULL DEFAULT '[]',
  message_count INTEGER NOT NULL DEFAULT 0,
  summary       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, company, session_date)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_date
  ON agent_sessions (user_id, session_date DESC);

ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_sessions" ON agent_sessions
  FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "service_role_all_sessions" ON agent_sessions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
