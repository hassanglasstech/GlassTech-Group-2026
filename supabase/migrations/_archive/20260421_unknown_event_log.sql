-- ═══════════════════════════════════════════════════════════════════
-- Migration: Unknown Event Log — tracks unrecognized staff messages
-- Date: 2026-04-21
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS unknown_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_message    TEXT NOT NULL,
  extracted_info      JSONB NOT NULL DEFAULT '{}',
  suggested_category  TEXT,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'defined', 'dismissed')),
  pattern_created_id  TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_unknown_log_status ON unknown_log (status);

ALTER TABLE unknown_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all_unknown" ON unknown_log;
CREATE POLICY "authenticated_all_unknown" ON unknown_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
