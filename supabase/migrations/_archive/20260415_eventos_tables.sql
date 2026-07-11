-- ═══════════════════════════════════════════════════════════════════
-- Migration: EventOS v1 Tables
-- Date: 2026-04-15
-- Purpose: Pattern library, business manual, gap tracking, learning log
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Pattern Library ───────────────────────────────────────────────
-- Stores event patterns with trigger keywords and workflow steps.
-- Editable by owner. times_used and confidence auto-update.
CREATE TABLE IF NOT EXISTS pattern_library (
  event_id          TEXT PRIMARY KEY,
  trigger_keywords  TEXT[] NOT NULL DEFAULT '{}',
  category          TEXT NOT NULL,
  label             TEXT NOT NULL,
  color             TEXT NOT NULL DEFAULT '#3B82F6',
  modules_involved  TEXT[] NOT NULL DEFAULT '{}',
  workflow_steps    JSONB NOT NULL DEFAULT '[]',
  times_used        INTEGER NOT NULL DEFAULT 0,
  confidence        NUMERIC(4,2) NOT NULL DEFAULT 0.90,
  defined_by        TEXT NOT NULL DEFAULT 'system',
  active            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pattern_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_patterns" ON pattern_library
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 2. Business Manual ───────────────────────────────────────────────
-- Human-readable disposal steps per event type.
-- Defines who does what, GL entries, approvals required.
CREATE TABLE IF NOT EXISTS business_manual (
  event_type         TEXT PRIMARY KEY,
  description        TEXT NOT NULL,
  trigger_examples   TEXT[] NOT NULL DEFAULT '{}',
  forms_required     TEXT[] NOT NULL DEFAULT '{}',
  modules_involved   TEXT[] NOT NULL DEFAULT '{}',
  disposal_steps     JSONB NOT NULL DEFAULT '[]',
  gl_entries         JSONB NOT NULL DEFAULT '[]',
  approvals_required TEXT[] NOT NULL DEFAULT '{}',
  exceptions         TEXT[] NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE business_manual ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_manual" ON business_manual
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 3. Gap Log ───────────────────────────────────────────────────────
-- Tracks gaps detected by owner during workflow execution.
-- Dev prompt generated automatically for each gap.
CREATE TABLE IF NOT EXISTS gap_log (
  gap_id             TEXT PRIMARY KEY,
  event_type         TEXT,
  gap_description    TEXT NOT NULL,
  current_behavior   TEXT,
  expected_behavior  TEXT,
  dev_prompt         JSONB NOT NULL DEFAULT '{}',
  status             TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'In Progress', 'Resolved', 'Wont Fix')),
  priority           TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High', 'Critical')),
  reported_by        TEXT,
  resolved_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE gap_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_gaps" ON gap_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_gap_log_status ON gap_log (status);
CREATE INDEX IF NOT EXISTS idx_gap_log_event ON gap_log (event_type);

-- ── 4. Learning Log ──────────────────────────────────────────────────
-- Captures owner feedback after workflow execution.
-- Used to refine confidence and pattern matching over time.
CREATE TABLE IF NOT EXISTS learning_log (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id           TEXT,
  staff_message      TEXT,
  classified_as      TEXT,
  owner_feedback     TEXT CHECK (owner_feedback IN ('correct', 'wrong_pattern', 'wrong_steps', 'missing_steps', 'rejected')),
  pattern_update     JSONB,
  confidence_delta   NUMERIC(4,2) DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE learning_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_learning" ON learning_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_learning_event ON learning_log (event_id);

-- ── 5. Event History ─────────────────────────────────────────────────
-- Full audit trail: message → classification → workflow → outcome.
CREATE TABLE IF NOT EXISTS event_history (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_message      TEXT NOT NULL,
  message_source     TEXT NOT NULL DEFAULT 'text' CHECK (message_source IN ('text', 'voice', 'whatsapp')),
  classified_as      TEXT,
  matched_pattern    TEXT,
  confidence         NUMERIC(4,2),
  workflow_steps     JSONB DEFAULT '[]',
  execution_result   JSONB DEFAULT '{}',
  outcome            TEXT CHECK (outcome IN ('approved', 'rejected', 'edited_approved', 'auto_executed', 'failed')),
  executed_by        TEXT,
  execution_time_ms  INTEGER,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE event_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_events" ON event_history
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_event_history_pattern ON event_history (matched_pattern);
CREATE INDEX IF NOT EXISTS idx_event_history_date ON event_history (created_at DESC);
