-- ═══════════════════════════════════════════════════════════════════
-- Migration: Confidence Scoring — historical accuracy tracking
-- Date: 2026-04-25
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE agent_decisions
  ADD COLUMN IF NOT EXISTS similar_cases_count  INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS historical_accuracy  NUMERIC(4,3) DEFAULT 0.500,
  ADD COLUMN IF NOT EXISTS outcome_due_date     TIMESTAMPTZ;

-- Pending outcomes view (decisions needing follow-up after 7 days)
CREATE OR REPLACE VIEW decisions_pending_outcome AS
SELECT id, department, decision_type, decision, reasoning, confidence,
       context, created_at, outcome_due_date
FROM agent_decisions
WHERE outcome IS NULL
  AND feedback = 'followed'
  AND created_at < now() - interval '7 days'
ORDER BY created_at ASC;
