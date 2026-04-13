-- ═══════════════════════════════════════════════════════════════════
-- Migration: Agent Permissions + Rate Limiting
-- Date: 2026-04-14
-- Purpose: Scope agent capabilities, enable per-user rate limiting
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Rate Limiting Table ───────────────────────────────────────────
-- Stores one row per Claude API call for sliding-window rate checks.
-- claude-proxy queries this to enforce 100/hr and 10/min limits.
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

-- Cleanup: delete rows older than 2 hours (run via pg_cron or manually)
-- SELECT cron.schedule('cleanup-rate-limits', '0 * * * *',
--   $$DELETE FROM agent_rate_limits WHERE created_at < now() - interval '2 hours'$$);

-- ── 2. Agent Permissions Table ───────────────────────────────────────
-- Defines what each agent ID is allowed to do.
-- Read-only agents cannot invoke write tools (enforced at application layer).
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

-- ── 3. Seed Default Permissions ──────────────────────────────────────
-- erp-chat is the only agent with write permission (creates quotations, reqs, etc.)
-- All other agents are read-only analysis agents.
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

-- ── 4. Multi-Tenant RLS Design Reference ─────────────────────────────
-- For future SaaS multi-tenancy, every table needs:
--   ALTER TABLE <table> ADD COLUMN client_id TEXT DEFAULT 'glasstech-internal';
--   CREATE POLICY "tenant_isolation" ON <table>
--     FOR ALL USING (client_id = auth.jwt()->>'client_id');
-- This is documented here as the pattern. Applying to 58+ unprotected
-- tables is a separate migration effort.
COMMENT ON TABLE agent_permissions IS
  'Multi-tenant pattern: add client_id TEXT + RLS policy USING (client_id = auth.jwt()->>client_id) to each table. Default: glasstech-internal';
