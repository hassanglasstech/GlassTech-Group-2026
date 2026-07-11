-- ═══════════════════════════════════════════════════════════════════
-- Migration 025: Agent API Calls — Token & Cost Tracking
-- Tracks Claude API token consumption per agent, per call
-- Cost stored in both USD (API billing) and PKR (owner reporting)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agent_api_calls (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name     TEXT NOT NULL DEFAULT 'default',
  model          TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  input_tokens   INTEGER NOT NULL DEFAULT 0,
  output_tokens  INTEGER NOT NULL DEFAULT 0,
  tokens_used    INTEGER NOT NULL DEFAULT 0,
  cost_usd       NUMERIC(12, 6) NOT NULL DEFAULT 0,
  cost_pkr       NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying by agent and date range
CREATE INDEX IF NOT EXISTS idx_api_calls_agent_date
  ON agent_api_calls (agent_name, created_at DESC);

-- Index for cost analysis
CREATE INDEX IF NOT EXISTS idx_api_calls_created
  ON agent_api_calls (created_at DESC);

-- RLS: allow authenticated users to read/insert
ALTER TABLE agent_api_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read" ON agent_api_calls
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert" ON agent_api_calls
  FOR INSERT TO authenticated WITH CHECK (true);

-- Service role can always access (for Edge Functions)
CREATE POLICY "Allow service role" ON agent_api_calls
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── View: daily cost summary per agent ───────────────────────────
CREATE OR REPLACE VIEW agent_cost_daily AS
SELECT
  agent_name,
  model,
  DATE(created_at)     AS usage_date,
  COUNT(*)             AS call_count,
  SUM(input_tokens)    AS total_input,
  SUM(output_tokens)   AS total_output,
  SUM(tokens_used)     AS total_tokens,
  SUM(cost_usd)        AS total_usd,
  SUM(cost_pkr)        AS total_pkr
FROM agent_api_calls
GROUP BY agent_name, model, DATE(created_at)
ORDER BY usage_date DESC, agent_name;
