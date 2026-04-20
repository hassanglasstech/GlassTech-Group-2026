-- ============================================================
-- GlassTech ERP — Single User Setup (Hassan Latif)
-- RLS DISABLED — Single super_admin user only
-- Run this FIRST before all other migrations
-- ============================================================

DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'accounts','agent_alert_history','agent_api_calls','agent_audit_log',
    'agent_decisions','agent_episodic_memory','agent_execution_log',
    'agent_memories','agent_permissions','agent_procedural_memory',
    'agent_rate_config','agent_rate_limits','agent_semantic_memory',
    'agent_sessions','agent_table_access','anomaly_log','anomaly_thresholds',
    'asset_registry','assets','attendance','attendance_overrides','audit_log',
    'bank_recon_sessions','bom_items','bom_templates','budget_lines',
    'business_manual','business_scenarios','bypass_log','clients','cost_centers',
    'cutter_daily_logs','cutting_sessions','departments','dispatch_vehicles',
    'elimination_log','employee_docs','employee_roles','employee_tags',
    'employees','erp_backups','erp_config','event_history','expenses',
    'factory_escalation_alerts','factory_events','financial_events',
    'fiscal_periods','gap_log','gate_passes','generator_logs','gl_config',
    'gl_entries_pending_approval','gl_posting_rules','gl_posting_rules_v2',
    'grn_sheet_entries','handling_units','hse_incidents','inspection_lots',
    'intercompany_settlements','intercompany_transaction_log',
    'intercompany_transfers','invoices','job_orders','learning_log',
    'leave_applications','ledger','loans','manual_count_sheets','mapping_rules',
    'morning_briefings','ncr_claims','ncr_events','ncr_remnants',
    'ncr_reproductions','owner_presence_state','pallet_rates','pattern_library',
    'payment_receipts','payroll','permissions','petty_cash','predictive_alerts',
    'production_pieces','products','projects','public_holidays','purchase_orders',
    'quotations','recurring_expenses','remnants','requisitions','role_permissions',
    'roles','saas_clients','scrap_disposals','stock_ledger','stock_locations',
    'store_items','tag_master','tempering_dispatches','tempering_oven_config',
    'unknown_log','user_profiles','vendor_defect_reports','vendor_rates',
    'vendor_reviews','vendor_sla','vehicles','vehicle_expenses','vehicle_trips',
    'warehouse_spots','wazir_conversations','wazir_decisions','wazir_lessons',
    'wazir_voice_samples','wazir_weekly_reports','weight_master','whatsapp_log'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- Only process tables that actually exist
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      -- Disable RLS completely
      EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', tbl);

      -- Drop all existing policies
      EXECUTE format(
        'DO $inner$ DECLARE pol TEXT; BEGIN ' ||
        'FOR pol IN SELECT policyname FROM pg_policies ' ||
        'WHERE schemaname = ''public'' AND tablename = %L ' ||
        'LOOP EXECUTE ''DROP POLICY IF EXISTS "'' || pol || ''" ON public.%I''; ' ||
        'END LOOP; END $inner$',
        tbl, tbl
      );

      -- Grant full access to anon and authenticated roles
      EXECUTE format('GRANT ALL ON public.%I TO anon, authenticated', tbl);
    END IF;
  END LOOP;
END $$;

-- Also grant sequence access (for any serial/identity columns)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

SELECT 'RLS disabled on all tables. Single user setup complete.' AS status;
