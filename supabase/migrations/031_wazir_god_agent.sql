-- ═══════════════════════════════════════════════════════════════════════
-- 031_wazir_god_agent.sql
--
-- WAZIR — The Digital Shadow Self
-- Persistent AI counselor that learns the owner's decision patterns,
-- speaks in their voice, and acts as a second brain across all 5 companies.
--
-- Six tables:
--   1. wazir_decisions       — every major decision captured with context + outcome
--   2. wazir_lessons         — distilled patterns learned over time (semantic memory)
--   3. wazir_voice_samples   — few-shot examples of the owner's writing style
--   4. wazir_weekly_reports  — Sunday board meeting archives
--   5. wazir_conversations   — persistent chat history across sessions
--   6. owner_presence_state  — vacation / leave / handled-messages log
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. wazir_decisions ─────────────────────────────────────────────────
-- Every major decision made by the owner — captured for pattern learning.
-- Outcome is evaluated at 30/60/90 days to learn what worked.
CREATE TABLE IF NOT EXISTS wazir_decisions (
  id                TEXT PRIMARY KEY,
  company           TEXT,
  decision_type     TEXT NOT NULL,  -- 'quotation_approve' | 'credit_extend' | 'vendor_payment' | 'hire' | 'purchase' | 'pricing' | 'other'
  subject           TEXT NOT NULL,  -- one-line title
  context           JSONB DEFAULT '{}', -- full context: client, amount, rationale, alternatives considered
  decision_text     TEXT,           -- owner's reasoning (from chat or capture form)
  decided_by        TEXT,           -- user_id or 'wazir-auto' if delegated
  decided_at        TIMESTAMPTZ DEFAULT now(),
  amount            NUMERIC(14,2),  -- ₨ impact if measurable
  related_docs      JSONB DEFAULT '[]', -- [{type:'quotation', id:'QT-GLS-04-0123'}]

  -- Outcome tracking (filled in later by wazir-outcome-tracker cron)
  outcome_status    TEXT,            -- 'pending' | 'success' | 'partial' | 'failed' | 'mixed'
  outcome_evaluated_at TIMESTAMPTZ,
  outcome_notes     TEXT,
  outcome_numeric   NUMERIC(14,2),   -- actual measured impact
  lessons_extracted BOOLEAN DEFAULT false,

  tags              TEXT[] DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wazir_decisions_type      ON wazir_decisions(decision_type);
CREATE INDEX IF NOT EXISTS idx_wazir_decisions_decided   ON wazir_decisions(decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_wazir_decisions_company   ON wazir_decisions(company);
CREATE INDEX IF NOT EXISTS idx_wazir_decisions_pending   ON wazir_decisions(outcome_status)
  WHERE outcome_status IS NULL OR outcome_status = 'pending';

-- ── 2. wazir_lessons ───────────────────────────────────────────────────
-- Distilled patterns: "when X happens, I tend to Y, and the outcome is Z"
-- These become the agent's long-term personality. Retrieved by embedding
-- similarity OR by tag match when similar decisions come up.
CREATE TABLE IF NOT EXISTS wazir_lessons (
  id              TEXT PRIMARY KEY,
  category        TEXT,           -- 'pricing' | 'credit' | 'hiring' | 'vendor' | 'operations' | 'general'
  pattern         TEXT NOT NULL,  -- "When client is new (<6 months) and credit > ₨1M, owner approves 33% of the time with 2:1 bad-debt ratio"
  evidence_count  INTEGER DEFAULT 1, -- how many decisions support this
  confidence      NUMERIC(3,2) DEFAULT 0.5, -- 0-1
  source_decisions TEXT[] DEFAULT '{}', -- IDs from wazir_decisions
  first_observed  TIMESTAMPTZ DEFAULT now(),
  last_reinforced TIMESTAMPTZ DEFAULT now(),
  is_active       BOOLEAN DEFAULT true,
  tags            TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wazir_lessons_category ON wazir_lessons(category);
CREATE INDEX IF NOT EXISTS idx_wazir_lessons_active   ON wazir_lessons(is_active) WHERE is_active;

-- ── 3. wazir_voice_samples ─────────────────────────────────────────────
-- Few-shot examples of the owner's communication style, ingested from past
-- WhatsApp replies, emails, etc. Used when Wazir drafts messages in Owner
-- Presence Mode.
CREATE TABLE IF NOT EXISTS wazir_voice_samples (
  id            TEXT PRIMARY KEY,
  channel       TEXT,           -- 'whatsapp' | 'email' | 'internal_chat'
  recipient_type TEXT,          -- 'client' | 'vendor' | 'employee' | 'partner'
  context       TEXT,           -- what the message was about
  message       TEXT NOT NULL,  -- the actual text the owner wrote
  tone_tags     TEXT[] DEFAULT '{}', -- 'warm' | 'firm' | 'formal' | 'casual' | 'urdu-english-mix'
  language      TEXT DEFAULT 'ur-en', -- 'ur' | 'en' | 'ur-en'
  captured_at   TIMESTAMPTZ DEFAULT now(),
  is_approved   BOOLEAN DEFAULT false, -- owner reviews & approves samples
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wazir_voice_channel ON wazir_voice_samples(channel, recipient_type);
CREATE INDEX IF NOT EXISTS idx_wazir_voice_approved ON wazir_voice_samples(is_approved) WHERE is_approved;

-- ── 4. wazir_weekly_reports ───────────────────────────────────────────
-- Sunday 10pm PKT board meetings, archived. Owner can scroll back to any week.
CREATE TABLE IF NOT EXISTS wazir_weekly_reports (
  id                TEXT PRIMARY KEY,
  report_date       DATE NOT NULL,     -- Sunday of the report
  week_number       INTEGER,           -- ISO week number
  year              INTEGER,
  companies_covered TEXT[] DEFAULT '{}',

  -- The core narrative (Claude Sonnet output)
  headline          TEXT,              -- "Gross margin this week: 16.8% (-2.1%)"
  body              TEXT NOT NULL,     -- full markdown report
  top_concerns      JSONB DEFAULT '[]', -- [{concern:'...', severity:'high', data:{...}}]
  top_opportunities JSONB DEFAULT '[]',
  big_question      TEXT,              -- the one strategic question

  -- Key metrics snapshot (for quick charts)
  metrics_snapshot  JSONB DEFAULT '{}', -- {gross_margin, revenue, ar_outstanding, ...}

  -- Delivery tracking
  whatsapp_sent_at  TIMESTAMPTZ,
  owner_replied     BOOLEAN DEFAULT false,
  owner_reply       TEXT,

  -- Token usage
  input_tokens      INTEGER,
  output_tokens     INTEGER,
  cost_pkr          NUMERIC(10,2),

  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wazir_reports_date ON wazir_weekly_reports(report_date DESC);

-- ── 5. wazir_conversations ─────────────────────────────────────────────
-- Persistent chat history — every message the owner exchanges with Wazir.
-- Unlike agent_sessions (which resets daily), Wazir conversations span forever.
CREATE TABLE IF NOT EXISTS wazir_conversations (
  id              TEXT PRIMARY KEY,
  thread_id       TEXT,           -- conversations can be grouped into threads
  role            TEXT NOT NULL,  -- 'user' | 'assistant' | 'system'
  content         TEXT NOT NULL,
  tool_calls      JSONB DEFAULT '[]', -- which tools Wazir used
  tool_results    JSONB DEFAULT '[]',
  mood_tag        TEXT,           -- 'normal' | 'stressed' | 'celebratory' | 'strategic' | 'late-night'
  related_decision_id TEXT,       -- if this conversation led to a decision
  channel         TEXT DEFAULT 'app', -- 'app' | 'whatsapp' | 'telegram'
  timestamp       TIMESTAMPTZ DEFAULT now(),
  tokens_used     INTEGER,
  model_used      TEXT
);

CREATE INDEX IF NOT EXISTS idx_wazir_conv_thread ON wazir_conversations(thread_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_wazir_conv_time   ON wazir_conversations(timestamp DESC);

-- ── 6. owner_presence_state ───────────────────────────────────────────
-- Tracks when the owner is on leave / unavailable. In presence mode, Wazir
-- auto-replies to routine messages in the owner's voice and escalates the
-- rest in a batched summary.
CREATE TABLE IF NOT EXISTS owner_presence_state (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  is_present      BOOLEAN DEFAULT true,
  mode            TEXT DEFAULT 'active', -- 'active' | 'leave' | 'sick' | 'travel' | 'do-not-disturb'
  mode_since      TIMESTAMPTZ,
  mode_until      TIMESTAMPTZ,
  auto_reply_enabled BOOLEAN DEFAULT false,
  escalation_threshold TEXT DEFAULT 'high', -- 'low' | 'medium' | 'high' — only escalate at or above

  -- Messages Wazir handled while owner was away
  handled_count       INTEGER DEFAULT 0,
  escalated_count     INTEGER DEFAULT 0,
  pending_review      JSONB DEFAULT '[]', -- [{from, message, suggested_reply, urgency}]

  last_sync_at    TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Seed a single row (singleton pattern — always one state row)
INSERT INTO owner_presence_state (id, is_present, mode)
  VALUES ('singleton', true, 'active')
  ON CONFLICT (id) DO NOTHING;

-- ── RLS Policies ───────────────────────────────────────────────────────
ALTER TABLE wazir_decisions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE wazir_lessons         ENABLE ROW LEVEL SECURITY;
ALTER TABLE wazir_voice_samples   ENABLE ROW LEVEL SECURITY;
ALTER TABLE wazir_weekly_reports  ENABLE ROW LEVEL SECURITY;
ALTER TABLE wazir_conversations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_presence_state  ENABLE ROW LEVEL SECURITY;

-- Owner-only access: authenticated users can read/write everything
-- (In a real multi-tenant setup, restrict to specific user_id — but for
-- a single-owner SME context this is appropriate)
CREATE POLICY "wazir_owner_rw" ON wazir_decisions      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "wazir_owner_rw" ON wazir_lessons        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "wazir_owner_rw" ON wazir_voice_samples  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "wazir_owner_rw" ON wazir_weekly_reports FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "wazir_owner_rw" ON wazir_conversations  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "wazir_owner_rw" ON owner_presence_state FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Anon also allowed (matches existing pattern for pre-session access)
CREATE POLICY "wazir_anon_rw" ON wazir_decisions      FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "wazir_anon_rw" ON wazir_lessons        FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "wazir_anon_rw" ON wazir_voice_samples  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "wazir_anon_rw" ON wazir_weekly_reports FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "wazir_anon_rw" ON wazir_conversations  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "wazir_anon_rw" ON owner_presence_state FOR ALL TO anon USING (true) WITH CHECK (true);
