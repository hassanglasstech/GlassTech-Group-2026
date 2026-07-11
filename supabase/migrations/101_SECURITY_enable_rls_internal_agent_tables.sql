-- ═══════════════════════════════════════════════════════════════════════
-- 101 — SECURITY batch 6a (audit 2026-07-11): enable RLS on the 26 remaining
--   RLS-off tables (agent_* / wazir_* / whatsapp_log / saas_clients / business_* /
--   event_history / pattern_library / unknown_log / anomaly_thresholds /
--   owner_presence_state) — all exposed to the anon key.
--
-- Triage (grep of modules/*): these are single-tenant INTERNAL AI/agent tables
-- (Wazir assistant, Factory EventOS, WhatsApp, predictive intelligence), read AND
-- written directly by the BROWSER client, and NONE has a `company` column. So:
--   • enabling RLS with no policy would break the AI features (browser blocked);
--   • company-scoping is impossible (no company column).
-- Correct fix: enable RLS + an `authenticated`-only USING/CHECK(true) policy. This
-- closes the ANON exposure (the finding) while keeping logged-in AI features
-- working. service_role (edge functions / cron) bypasses RLS regardless.
--
-- NOTE: `true` here is CORRECT (not the flagged "always-true bypasses company
-- isolation" pattern) because these tables are NOT company-partitioned — there is
-- no tenant boundary to enforce, only the anon→authenticated boundary. A later
-- pass may tighten the few non-browser sensitive ones (saas_clients,
-- wazir_voice_samples, agent_permissions/rate_config) to super-admin.
--
-- Idempotent. Run in Supabase SQL editor.
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agent_alert_history','agent_api_calls','agent_audit_log','agent_decisions',
    'agent_episodic_memory','agent_execution_log','agent_memories','agent_permissions',
    'agent_procedural_memory','agent_rate_config','agent_rate_limits','agent_semantic_memory',
    'agent_table_access','anomaly_thresholds','business_manual','business_scenarios',
    'event_history','owner_presence_state','pattern_library','saas_clients','unknown_log',
    'wazir_conversations','wazir_lessons','wazir_voice_samples','wazir_weekly_reports','whatsapp_log'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=t AND c.relkind='r'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t) THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true);',
          t || '_authenticated_all', t
        );
        RAISE NOTICE 'RLS on + authenticated policy: %', t;
      ELSE
        RAISE NOTICE 'RLS on (policy already exists): %', t;
      END IF;
    END IF;
  END LOOP;
END $$;

-- ── Verify (optional) ──
-- SELECT count(*) AS still_rls_off FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
--   WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity=false;   -- expect 0
-- After applying: open the Wazir chat + a Factory dashboard as a logged-in user —
-- they should still load (authenticated read/write works; only anon is now blocked).
