-- ═══════════════════════════════════════════════════════════════════════
-- Migration 067 — Phase 0 (Brutal Report fix #5):
-- Enable RLS + add authenticated policy on tables that had 0 policies
--
-- Found by manual Query A audit (2026-05-12):
--   93 tables in public schema had zero RLS policies.
--   With RLS disabled AND no policies, these tables are readable/writable
--   via the anon key (which ships in the public JS bundle).
--
-- This migration:
--   1. Enables RLS on all critical financial/HR/audit tables
--   2. Adds a permissive authenticated-only policy (single-user mode)
--   3. Leaves agent_* / wazir_* / config reference tables for later
--      (lower risk: internal app-only access, no PII or financial data)
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  t TEXT;
  critical_tables TEXT[] := ARRAY[
    -- Financial
    'ledger', 'expenses', 'fiscal_periods', 'budget_lines',
    'gl_entries_pending_approval', 'gl_posting_rules', 'gl_posting_rules_v2',
    'gratuity_balances', 'intercompany_settlements',
    'intercompany_transaction_log', 'intercompany_transfers',
    'material_ledger_entries', 'advance_salaries',
    -- HR / sensitive
    'attendance_overrides', 'leave_applications', 'leave_types',
    'disciplinary_actions', 'exit_interviews', 'performance_reviews',
    'employee_documents', 'employee_licenses', 'employee_qualifications',
    'employee_tags',
    -- Operational / audit
    'activity_log', 'anomaly_log', 'bypass_log', 'bypass_logs',
    'gap_log', 'elimination_log', 'learning_log',
    'hse_incidents', 'erp_backups', 'erp_config',
    'factory_escalation_alerts', 'factory_events',
    'generator_logs', 'vehicle_expenses',
    'asset_registry', 'assets',
    'bank_recon_sessions', 'csv_import_logs',
    'morning_briefings', 'predictive_alerts',
    'cutover_snapshot'
  ];
BEGIN
  FOREACH t IN ARRAY critical_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      RAISE NOTICE 'Skipping % — does not exist', t;
      CONTINUE;
    END IF;

    -- Enable RLS
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    -- Add authenticated policy only if none exists yet
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = t AND schemaname = 'public'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        t || '_auth_rw', t
      );
      RAISE NOTICE '✓ RLS enabled + policy added: %', t;
    ELSE
      RAISE NOTICE '✓ RLS enabled (policy already existed): %', t;
    END IF;
  END LOOP;
END$$;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- SELECT t.tablename, COUNT(p.policyname) AS policy_count
-- FROM pg_tables t
-- LEFT JOIN pg_policies p ON p.tablename = t.tablename
-- WHERE t.schemaname = 'public'
--   AND t.tablename IN (
--     'ledger','expenses','fiscal_periods','budget_lines',
--     'attendance_overrides','leave_applications','intercompany_transfers'
--   )
-- GROUP BY t.tablename
-- HAVING COUNT(p.policyname) = 0;
-- → expected: 0 rows
-- ═══════════════════════════════════════════════════════════════════════
