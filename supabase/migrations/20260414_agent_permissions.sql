-- ═══════════════════════════════════════════════════════════════════
-- Migration: Agent Permissions + Rate Limiting + Rate Config
-- Date: 2026-04-14
-- Purpose: Scope agent capabilities, enable configurable rate limiting
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Rate Limiting Table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_rate_limits (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_user_time
  ON agent_rate_limits (user_id, created_at DESC);

ALTER TABLE agent_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only" ON agent_rate_limits
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 2. Rate Config Table (configurable, not hardcoded) ───────────────
CREATE TABLE IF NOT EXISTS agent_rate_config (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key      TEXT NOT NULL UNIQUE,
  max_per_minute  INTEGER NOT NULL DEFAULT 10,
  max_per_hour    INTEGER NOT NULL DEFAULT 100,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE agent_rate_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_config" ON agent_rate_config
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_role_all_config" ON agent_rate_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO agent_rate_config (config_key, max_per_minute, max_per_hour) VALUES
  ('claude_proxy', 10, 100)
ON CONFLICT (config_key) DO NOTHING;

-- ── 3. Agent Permissions Table ───────────────────────────────────────
-- Two-level permission model:
-- (a) agent_permissions: which agents exist, their default model/token limits
-- (b) agent_table_access: per-agent, per-table CRUD scoping
CREATE TABLE IF NOT EXISTS agent_permissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      TEXT NOT NULL UNIQUE,
  agent_label   TEXT NOT NULL,
  permission    TEXT NOT NULL DEFAULT 'read' CHECK (permission IN ('read', 'write', 'admin')),
  allowed_tools TEXT[] NOT NULL DEFAULT '{}',
  max_tokens    INTEGER NOT NULL DEFAULT 1000,
  model         TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE agent_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read" ON agent_permissions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_role_all" ON agent_permissions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 4. Agent Table Access (per-agent, per-table CRUD) ────────────────
-- Maps which agent can read/write/delete from which Supabase table.
CREATE TABLE IF NOT EXISTS agent_table_access (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name  TEXT NOT NULL,
  table_name  TEXT NOT NULL,
  can_read    BOOLEAN NOT NULL DEFAULT true,
  can_write   BOOLEAN NOT NULL DEFAULT false,
  can_delete  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(agent_name, table_name)
);

ALTER TABLE agent_table_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_access" ON agent_table_access
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_role_all_access" ON agent_table_access
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 5. Seed Agent Permissions ────────────────────────────────────────
INSERT INTO agent_permissions (agent_id, agent_label, permission, allowed_tools, max_tokens, model) VALUES
  ('erp-chat',          'ERP Chat Agent',       'write',
    ARRAY['find_order','search_client','get_glass_rate','petty_cash_report','outstanding_payments',
          'expense_summary','get_client_balance','floor_status','ncr_report','cutting_report',
          'stuck_jobs','stock_status','purchase_order_status','vendor_summary','delivery_status',
          'requisition_overview','ops_snapshot','create_quotation','create_requisition',
          'update_order_status','create_task','draft_payment_voucher','log_factory_event',
          'print_document','send_whatsapp'],
    1000, 'claude-haiku-4-5-20251001'),
  ('multi-factory',     'Multi-Agent Factory',  'read', '{}', 200, 'claude-haiku-4-5-20251001'),
  ('multi-finance',     'Multi-Agent Finance',  'read', '{}', 200, 'claude-haiku-4-5-20251001'),
  ('multi-vendor',      'Multi-Agent Vendor',   'read', '{}', 200, 'claude-haiku-4-5-20251001'),
  ('multi-hr',          'Multi-Agent HR',       'read', '{}', 200, 'claude-haiku-4-5-20251001'),
  ('multi-sales',       'Multi-Agent Sales',    'read', '{}', 200, 'claude-haiku-4-5-20251001'),
  ('multi-master',      'Multi-Agent Master',   'read', '{}', 400, 'claude-sonnet-4-6'),
  ('scenario-engine',   'Scenario Engine',      'read', '{}', 1200, 'claude-sonnet-4-6'),
  ('semantic-narrative', 'Semantic Narrative',   'read', '{}', 200, 'claude-haiku-4-5-20251001'),
  ('morning-briefing',  'Morning Briefing',     'read', '{}', 600, 'claude-haiku-4-5-20251001'),
  ('voice-classifier',  'Voice Classifier',     'read', '{}', 200, 'claude-haiku-4-5-20251001'),
  ('adversarial',       'Adversarial Intel',    'read', '{}', 500, 'claude-sonnet-4-6')
ON CONFLICT (agent_id) DO NOTHING;

-- ── 6. Seed Agent Table Access (write agents) ────────────────────────
-- erp-chat is the only agent that writes to Supabase tables.
-- Identified from agentTools.ts executeTool():
INSERT INTO agent_table_access (agent_name, table_name, can_read, can_write, can_delete) VALUES
  -- erp-chat: write access
  ('erp-chat', 'quotations',        true, true, false),
  ('erp-chat', 'requisitions',      true, true, false),
  ('erp-chat', 'requisition_items', true, true, false),
  ('erp-chat', 'agent_tasks',       true, true, false),
  ('erp-chat', 'factory_events',    true, true, false),
  ('erp-chat', 'agent_actions',     true, true, false),
  -- Read-only agents (no Supabase writes)
  ('scenario-engine',   'business_scenarios',     true, false, false),
  ('scenario-engine',   'vendor_sla',             true, false, false),
  ('semantic-narrative', 'transaction_semantics',  true, false, false),
  ('semantic-narrative', 'market_intelligence',    true, false, false),
  ('morning-briefing',  'quotations',             true, false, false),
  ('morning-briefing',  'requisitions',           true, false, false),
  ('morning-briefing',  'factory_events',         true, false, false),
  ('morning-briefing',  'morning_briefings',      true, true,  false)
ON CONFLICT (agent_name, table_name) DO NOTHING;

-- ── 7. Multi-Tenant RLS Design Reference ─────────────────────────────
-- See /docs/MULTI_TENANT_SCHEMA_DESIGN.md for full design.
-- Pattern: ALTER TABLE <t> ADD COLUMN client_id TEXT DEFAULT 'glasstech-internal';
-- Policy: CREATE POLICY "tenant" ON <t> FOR ALL USING (client_id = auth.jwt()->>'client_id');
-- NOT EXECUTED HERE — documented only. Phase 8 pre-SaaS launch.
COMMENT ON TABLE agent_permissions IS
  'Multi-tenant: see /docs/MULTI_TENANT_SCHEMA_DESIGN.md. Phase 8 migration.';
