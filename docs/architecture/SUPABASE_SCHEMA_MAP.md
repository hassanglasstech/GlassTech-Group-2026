# Supabase Schema Map — GlassTech ERP

**Generated from:** 28 migration files in `/supabase/migrations/`
**Date:** 2026-04-14

## Summary

| Metric | Count |
|---|---|
| Total Tables | 96 |
| Views | 5 |
| RPC Functions | 5 (SECURITY DEFINER) |
| Trigger Functions | 1 |
| Tables with RLS | 95 (99%) |
| CHECK Constraints | 18 |
| UNIQUE Constraints | 9 |
| Indexes | 150+ |
| Explicit Foreign Keys | 1 (bom_items → bom_templates) |
| Companies | 5 (GTK, GTI, GlassCo, Nippon, Factory) |

## Table-to-Module Map

| Module | Tables | Count |
|---|---|---|
| Finance | accounts, ledger, cost_centers, petty_cash, recurring_expenses, financial_events, mapping_rules, gl_config, fiscal_periods, budget_lines, gl_posting_rules, asset_registry, intercompany_transfers, intercompany_settlements, bank_recon_sessions, erp_config | 16 |
| Sales | clients, quotations, projects, invoices, payment_receipts | 5 |
| Procurement | products, vendors, vendor_rates, store_items, stock_ledger, inspection_lots, remnants, handling_units, requisitions, purchase_orders, bom_templates, bom_items | 12 |
| Production | production_pieces, job_orders, cutting_sessions, cutter_daily_logs, generator_logs | 5 |
| GlassCo Ops | grn_sheet_entries, vendor_defect_reports, manual_count_sheets, scrap_disposals, vendor_reviews, pallet_rates, weight_master | 7 |
| NCR/QC | ncr_events, ncr_reproductions, ncr_claims, ncr_remnants | 4 |
| Logistics | gate_passes, warehouse_spots, vehicles, vehicle_trips, vehicle_expenses, tempering_dispatches, dispatch_vehicles | 7 |
| HR | employees, attendance, loans, payroll, departments, tag_master, employee_tags, employee_docs, attendance_overrides, leave_applications, public_holidays | 11 |
| RBAC | roles, permissions, role_permissions, employee_roles | 4 |
| HSE | hse_incidents | 1 |
| Agent/AI | morning_briefings, predictive_alerts, agent_tasks, agent_alert_history, agent_memories, whatsapp_log, factory_events, factory_escalation_alerts, business_scenarios, vendor_sla, agent_api_calls, agent_permissions, agent_table_access, agent_rate_limits, agent_rate_config | 15 |
| GRC | audit_log, bypass_log, erp_backups | 3 |

## RLS Policy Coverage

### Pattern A: Company-scoped (88 tables)
```sql
USING (company = (SELECT company FROM user_profiles WHERE id = auth.uid()))
```
All core business tables.

### Pattern B: Authenticated-only (7 tables)
```sql
FOR ALL TO authenticated USING (true) WITH CHECK (true)
```
Agent/system tables: morning_briefings, predictive_alerts, agent_tasks, agent_alert_history, agent_memories, whatsapp_log, factory_events, factory_escalation_alerts, business_scenarios, vendor_sla.

### Pattern C: Service-role + authenticated mixed (1 table)
agent_api_calls — authenticated can read/insert, service_role can do all.

## Foreign Key Dependency Graph

```
accounts ← ledger, gl_posting_rules, budget_lines, asset_registry
cost_centers ← budget_lines, production_pieces
clients ← quotations, projects, invoices, payment_receipts
vendors ← vendor_rates, vendor_defect_reports, vendor_reviews
products ← vendor_rates, store_items, bom_templates
quotations ↔ purchase_orders (linked_po_id ↔ linked_internal_id)
invoices ← payment_receipts (invoice_id)
bom_templates ← bom_items (FK: ON DELETE CASCADE)
dispatch_vehicles ← tempering_dispatches (dispatch_vehicle_id)
factory_events ← factory_escalation_alerts (event_id)
```

## RPC Functions

| RPC | Purpose | Tables Touched |
|---|---|---|
| process_payment_receipt | Atomic payment + invoice balance update | payment_receipts, invoices |
| post_intercompany_settlement | Dual-company GL posting | intercompany_settlements, ledger, accounts |
| reverse_intercompany_settlement | Reversal of ICO settlement | intercompany_settlements, ledger |
| generate_intercompany_order | Create linked PO + SO | purchase_orders, quotations |
| validate_vehicle_payload | Check dispatch weight limit | dispatch_vehicles |

## Critical Validation Constraints

| Code | Table | Constraint | Purpose |
|---|---|---|---|
| SCM-3 | store_items | qty >= 0, unrestricted_qty >= 0 | Prevent negative stock |
| ICO-1 | intercompany_settlements | from_company <> to_company | No self-settlements |
| ICO-2 | intercompany_settlements | amount > 0 | Positive amounts only |
| MFG-6 | generator_logs | company_rls | Generator data isolation |
| GRC-1 | bypass_log | module IN (Finance,HR,...) | Valid module scope |
