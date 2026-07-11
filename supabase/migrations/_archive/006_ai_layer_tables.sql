-- ============================================================
-- Migration 006 — Phase 8: AI Layer Tables
-- Run in Supabase SQL Editor BEFORE deploying edge functions
-- ============================================================

-- ── Morning Briefings ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS morning_briefings (
  briefing_date  TEXT PRIMARY KEY,          -- YYYY-MM-DD (one per day)
  briefing_text  TEXT,
  raw_data       JSONB DEFAULT '{}',
  kpis           JSONB DEFAULT '{}',
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- ── Predictive Alerts ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS predictive_alerts (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  alert_type     TEXT NOT NULL,
  title          TEXT,
  message        TEXT,
  severity       TEXT DEFAULT 'Medium',
  confidence     INTEGER DEFAULT 70,
  entity_type    TEXT,
  entity_id      TEXT,
  entity_label   TEXT,
  data_snapshot  JSONB DEFAULT '{}',
  actioned       BOOLEAN DEFAULT false,
  dismissed      BOOLEAN DEFAULT false,
  action_note    TEXT,
  actioned_by    TEXT,
  actioned_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pred_alerts_severity  ON predictive_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_pred_alerts_actioned  ON predictive_alerts(actioned);
CREATE INDEX IF NOT EXISTS idx_pred_alerts_dismissed ON predictive_alerts(dismissed);
CREATE INDEX IF NOT EXISTS idx_pred_alerts_created   ON predictive_alerts(created_at DESC);

-- ── Agent Tasks ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_tasks (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title       TEXT NOT NULL,
  description TEXT,
  priority    TEXT DEFAULT 'Medium',
  status      TEXT DEFAULT 'Open',
  due_date    TEXT,
  assigned_to TEXT,
  created_by  TEXT DEFAULT 'AI Agent',
  source      TEXT,                       -- which agent created it
  reference   TEXT,                       -- linked entity ID
  completed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_status   ON agent_tasks(status);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_priority ON agent_tasks(priority);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_due      ON agent_tasks(due_date);

-- ── Agent Alert History (read status) ────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_alert_history (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  alert_type TEXT,
  title      TEXT,
  message    TEXT,
  severity   TEXT,
  read       BOOLEAN DEFAULT false,
  source     TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_alert_read ON agent_alert_history(read);

-- ── Agent Memories (semantic / strategic) ────────────────────────────
CREATE TABLE IF NOT EXISTS agent_memories (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  category   TEXT,                        -- 'decision', 'observation', 'instruction'
  content    TEXT,
  tags       JSONB DEFAULT '[]',
  relevance  REAL DEFAULT 1.0,
  source     TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── WhatsApp Log ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_log (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  direction  TEXT DEFAULT 'outbound',     -- 'inbound' | 'outbound'
  from_num   TEXT,
  to_num     TEXT,
  message    TEXT,
  status     TEXT DEFAULT 'sent',
  wa_msg_id  TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Factory Events (if not exists) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS factory_events (
  id          TEXT PRIMARY KEY,
  sector      TEXT,
  event_type  TEXT,
  detail      TEXT,
  priority    TEXT DEFAULT 'Medium',
  status      TEXT DEFAULT 'Open',
  logged_by   TEXT,
  req_id      TEXT,
  resolved_at TIMESTAMPTZ,
  notes       TEXT,
  data        JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_factory_events_status   ON factory_events(status);
CREATE INDEX IF NOT EXISTS idx_factory_events_priority ON factory_events(priority);

-- ── Factory Escalation Alerts ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS factory_escalation_alerts (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  event_id     TEXT,
  event_type   TEXT,
  sector       TEXT,
  hours_overdue REAL DEFAULT 0,
  resolved     BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ── Business Scenarios (for PredictiveIntelligence) ───────────────────
CREATE TABLE IF NOT EXISTS business_scenarios (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  type        TEXT,
  title       TEXT,
  description TEXT,
  probability REAL DEFAULT 0.5,
  impact      TEXT,
  status      TEXT DEFAULT 'active',
  data        JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── Vendor SLA ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_sla (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  vendor_name      TEXT NOT NULL,
  company          TEXT,
  active           BOOLEAN DEFAULT true,
  total_orders     INTEGER DEFAULT 0,
  breach_count     INTEGER DEFAULT 0,
  next_rate_review TEXT,
  reminded         BOOLEAN DEFAULT false,
  data             JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- ── HSE Incidents ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hse_incidents (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  type       TEXT,
  severity   TEXT DEFAULT 'Minor',
  description TEXT,
  location   TEXT,
  reported_by TEXT,
  closed     BOOLEAN DEFAULT false,
  closed_at  TIMESTAMPTZ,
  data       JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── ERP Backups ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp_backups (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  backup_date TEXT,
  file_name   TEXT,
  file_size   INTEGER,
  status      TEXT DEFAULT 'complete',
  created_at  TIMESTAMPTZ DEFAULT now()
);
