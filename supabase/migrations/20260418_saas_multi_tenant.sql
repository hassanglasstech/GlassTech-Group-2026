-- ═══════════════════════════════════════════════════════════════════
-- Migration: SaaS Multi-Tenant Foundation
-- Date: 2026-04-18
-- Purpose: Add client_id to agent/EventOS tables for tenant isolation.
-- Scope: Agent tables only (Phase 8). Full 96-table migration = Phase 9.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Client Registry ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saas_clients (
  client_id      TEXT PRIMARY KEY,
  company_name   TEXT NOT NULL,
  industry       TEXT NOT NULL,
  tier           TEXT NOT NULL DEFAULT 'starter' CHECK (tier IN ('starter', 'professional', 'enterprise')),
  max_users      INTEGER NOT NULL DEFAULT 25,
  max_companies  INTEGER NOT NULL DEFAULT 1,
  max_api_calls  INTEGER NOT NULL DEFAULT 500,
  owner_name     TEXT NOT NULL,
  owner_email    TEXT NOT NULL,
  owner_phone    TEXT,
  active         BOOLEAN NOT NULL DEFAULT true,
  onboarded_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE saas_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_clients" ON saas_clients
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read_own" ON saas_clients
  FOR SELECT TO authenticated
  USING (client_id = COALESCE(current_setting('app.client_id', true), 'glasstech-internal'));

-- ── 2. Add client_id to agent tables (safe — DEFAULT for existing) ──

-- Pattern library
ALTER TABLE pattern_library
  ADD COLUMN IF NOT EXISTS client_id TEXT NOT NULL DEFAULT 'glasstech-internal';
CREATE INDEX IF NOT EXISTS idx_pattern_client ON pattern_library (client_id);

-- Business manual
ALTER TABLE business_manual
  ADD COLUMN IF NOT EXISTS client_id TEXT NOT NULL DEFAULT 'glasstech-internal';
CREATE INDEX IF NOT EXISTS idx_manual_client ON business_manual (client_id);

-- Event history
ALTER TABLE event_history
  ADD COLUMN IF NOT EXISTS client_id TEXT NOT NULL DEFAULT 'glasstech-internal';
CREATE INDEX IF NOT EXISTS idx_event_history_client ON event_history (client_id);

-- Learning log
ALTER TABLE learning_log
  ADD COLUMN IF NOT EXISTS client_id TEXT NOT NULL DEFAULT 'glasstech-internal';
CREATE INDEX IF NOT EXISTS idx_learning_client ON learning_log (client_id);

-- Gap log
ALTER TABLE gap_log
  ADD COLUMN IF NOT EXISTS client_id TEXT NOT NULL DEFAULT 'glasstech-internal';
CREATE INDEX IF NOT EXISTS idx_gap_client ON gap_log (client_id);

-- Episodic memory
ALTER TABLE agent_episodic_memory
  ADD COLUMN IF NOT EXISTS client_id TEXT NOT NULL DEFAULT 'glasstech-internal';
CREATE INDEX IF NOT EXISTS idx_episodic_client ON agent_episodic_memory (client_id);

-- Semantic memory
ALTER TABLE agent_semantic_memory
  ADD COLUMN IF NOT EXISTS client_id TEXT NOT NULL DEFAULT 'glasstech-internal';
CREATE INDEX IF NOT EXISTS idx_semantic_client ON agent_semantic_memory (client_id);

-- Procedural memory
ALTER TABLE agent_procedural_memory
  ADD COLUMN IF NOT EXISTS client_id TEXT NOT NULL DEFAULT 'glasstech-internal';
CREATE INDEX IF NOT EXISTS idx_procedural_client ON agent_procedural_memory (client_id);

-- Agent API calls
ALTER TABLE agent_api_calls
  ADD COLUMN IF NOT EXISTS client_id TEXT NOT NULL DEFAULT 'glasstech-internal';
CREATE INDEX IF NOT EXISTS idx_api_calls_client ON agent_api_calls (client_id);

-- ── 3. Seed GlassTech as first client ────────────────────────────────
INSERT INTO saas_clients (client_id, company_name, industry, tier, max_users, max_companies, max_api_calls, owner_name, owner_email)
VALUES ('glasstech-internal', 'GlassTech Group', 'glass', 'enterprise', 999, 99, 99999, 'Hassan', 'hassan@glasstech.pk')
ON CONFLICT (client_id) DO NOTHING;

-- ── Note ─────────────────────────────────────────────────────────────
-- This migration adds client_id to 9 agent/EventOS tables only.
-- The remaining 87 core tables (accounts, ledger, quotations, etc.)
-- already use 'company' column for isolation.
-- Full client_id migration for all tables is planned for Phase 9
-- (pre-SaaS launch, documented in /docs/MULTI_TENANT_SCHEMA_DESIGN.md).
