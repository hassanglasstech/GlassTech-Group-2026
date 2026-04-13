-- ═══════════════════════════════════════════════════════════════════
-- Migration 025: Agent Token Usage Tracking
-- Tracks Claude API token consumption per agent, per call
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agent_token_usage (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id       TEXT NOT NULL DEFAULT 'default',
  model          TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  input_tokens   INTEGER NOT NULL DEFAULT 0,
  output_tokens  INTEGER NOT NULL DEFAULT 0,
  total_tokens   INTEGER NOT NULL DEFAULT 0,
  estimated_cost NUMERIC(12, 6) NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying by agent and date range
CREATE INDEX IF NOT EXISTS idx_token_usage_agent_date
  ON agent_token_usage (agent_id, created_at DESC);

-- Index for cost analysis
CREATE INDEX IF NOT EXISTS idx_token_usage_created
  ON agent_token_usage (created_at DESC);

-- RLS: allow authenticated users to read/insert
ALTER TABLE agent_token_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read" ON agent_token_usage
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert" ON agent_token_usage
  FOR INSERT TO authenticated WITH CHECK (true);

-- Service role can always access (for Edge Functions)
CREATE POLICY "Allow service role" ON agent_token_usage
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Handy view: daily cost summary per agent ─────────────────────
CREATE OR REPLACE VIEW agent_token_daily_summary AS
SELECT
  agent_id,
  model,
  DATE(created_at) AS usage_date,
  COUNT(*)         AS call_count,
  SUM(input_tokens)  AS total_input_tokens,
  SUM(output_tokens) AS total_output_tokens,
  SUM(total_tokens)  AS total_tokens,
  SUM(estimated_cost) AS total_cost
FROM agent_token_usage
GROUP BY agent_id, model, DATE(created_at)
ORDER BY usage_date DESC, agent_id;
