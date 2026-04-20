-- ============================================================
-- GlassTech ERP — FRESH START: Truncate ALL tables
-- WARNING: This deletes ALL data permanently
-- Table structure is preserved
-- ============================================================

TRUNCATE TABLE
  -- HR
  employees, attendance, loans, payroll, departments,
  employee_docs, employee_tags, employee_roles, tag_master,
  leave_applications, attendance_overrides, public_holidays,

  -- Finance
  accounts, ledger, cost_centers, petty_cash,
  recurring_expenses, financial_events, mapping_rules,
  gl_config, gl_posting_rules, gl_posting_rules_v2,
  gl_entries_pending_approval, budget_lines, fiscal_periods,
  bank_recon_sessions, asset_registry, audit_log, bypass_log,
  intercompany_transfers, intercompany_settlements,
  intercompany_transaction_log, elimination_log,

  -- Sales
  clients, quotations, invoices, payment_receipts, projects,

  -- Procurement / Inventory
  vendors, vendor_rates, vendor_reviews, vendor_defect_reports,
  vendor_sla, store_items, stock_ledger, stock_locations,
  requisitions, purchase_orders, grn_sheet_entries,
  inspection_lots, handling_units, remnants, scrap_disposals,
  manual_count_sheets, pallet_rates, weight_master,
  assets, products, erp_config, erp_backups,

  -- Production
  production_pieces, job_orders, cutting_sessions,
  cutter_daily_logs, generator_logs, tempering_dispatches,
  tempering_oven_config, ncr_events, ncr_claims,
  ncr_remnants, ncr_reproductions, hse_incidents,
  bom_items, bom_templates,

  -- Logistics
  vehicles, vehicle_trips, vehicle_expenses,
  gate_passes, warehouse_spots, dispatch_vehicles,

  -- AI / Wazir
  agent_memories, agent_sessions, agent_decisions,
  agent_episodic_memory, agent_semantic_memory,
  agent_procedural_memory, agent_execution_log,
  agent_audit_log, agent_alert_history, agent_api_calls,
  agent_rate_limits, agent_table_access, agent_permissions,
  agent_rate_config, anomaly_log, anomaly_thresholds,
  predictive_alerts, morning_briefings, pattern_library,
  event_history, learning_log, unknown_log, gap_log,
  business_manual, business_scenarios, owner_presence_state,
  factory_events, factory_escalation_alerts,
  wazir_conversations, wazir_decisions, wazir_lessons,
  wazir_weekly_reports, wazir_voice_samples, whatsapp_log,

  -- Misc
  roles, permissions, role_permissions,
  saas_clients, expenses

RESTART IDENTITY CASCADE;

-- Keep user_profiles intact (login wala data rehna chahiye)
-- If you want to reset users too, uncomment below:
-- TRUNCATE TABLE user_profiles RESTART IDENTITY CASCADE;

SELECT 'All tables truncated. Fresh start ready.' AS status;
