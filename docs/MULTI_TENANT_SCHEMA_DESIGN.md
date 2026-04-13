# Multi-Tenant RLS Schema Design

**Status:** Design document only. NOT executed. Planned for Phase 8 (pre-SaaS launch).
**Date:** 2026-04-14

---

## Current State

- 88 total tables in Supabase
- 30 have RLS enabled (34%)
- 58 have NO RLS protection
- Company isolation via `company` column (not tenant-scoped)
- All Edge Functions use `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS)

---

## Target Architecture

Every table gets a `client_id` column for tenant isolation:

```sql
-- Template (DO NOT EXECUTE — reference only)
ALTER TABLE <table_name>
  ADD COLUMN IF NOT EXISTS client_id TEXT NOT NULL DEFAULT 'glasstech-internal';

ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_select" ON <table_name>
  FOR SELECT TO authenticated
  USING (client_id = auth.jwt()->>'client_id');

CREATE POLICY "tenant_isolation_insert" ON <table_name>
  FOR INSERT TO authenticated
  WITH CHECK (client_id = auth.jwt()->>'client_id');

CREATE POLICY "tenant_isolation_update" ON <table_name>
  FOR UPDATE TO authenticated
  USING (client_id = auth.jwt()->>'client_id');

CREATE POLICY "service_role_bypass" ON <table_name>
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
```

---

## JWT Claim Structure

```json
{
  "sub": "user-uuid",
  "email": "hassan@glasstech.pk",
  "client_id": "glasstech-internal",
  "role": "super_admin",
  "company": "GlassCo"
}
```

`client_id` set during user signup via Supabase custom claims or auth hook.

---

## Migration Plan

### Phase A: Add columns (zero downtime)
```sql
-- Run for each of 58 unprotected tables
ALTER TABLE <table> ADD COLUMN IF NOT EXISTS client_id TEXT DEFAULT 'glasstech-internal';
CREATE INDEX IF NOT EXISTS idx_<table>_client ON <table> (client_id);
```

### Phase B: Backfill existing data
```sql
UPDATE <table> SET client_id = 'glasstech-internal' WHERE client_id IS NULL;
```

### Phase C: Enable RLS + policies
```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
-- Create tenant_isolation policies (see template above)
```

### Phase D: Update Edge Functions
Replace `SUPABASE_SERVICE_ROLE_KEY` with user-scoped JWT where possible. Keep service_role only for cron jobs.

---

## Tables Requiring Migration (58)

| Category | Tables |
|----------|--------|
| Agent/AI | agent_alert_history, agent_memories, agent_tasks |
| Finance | loans, payroll, recurring_expenses, petty_cash, financial_events |
| HR | departments, employee_docs, employee_roles, employee_tags, leave_applications |
| Sales | job_orders, projects, purchase_orders, requisitions, payment_receipts |
| Inventory | products, remnants, scrap_disposals, warehouse_spots, weight_master |
| Production | cutter_daily_logs, cutting_sessions, handling_units, inspection_lots |
| Masters | tag_master, pallet_rates, vendor_rates, vendor_reviews, vendor_sla, vendors |
| Logistics | gate_passes, tempering_dispatches, vehicle_expenses, vehicle_trips, vehicles |
| Reporting | mapping_rules, manual_count_sheets, grn_sheet_entries |
| Special | business_scenarios, fiscal_periods, morning_briefings, predictive_alerts, roles, permissions, role_permissions |
| Other | assets, factory_escalation_alerts, factory_events, gl_config, vendor_defect_reports, whatsapp_log, ncr_claims, ncr_events, ncr_remnants, ncr_reproductions |

---

## Queries That May Break

1. **Joins without client_id filter** — Any cross-table join that doesn't include `client_id` will return empty results after RLS.
2. **Aggregate queries** — COUNT(*), SUM() will be scoped to tenant.
3. **Edge Functions using service_role** — Will continue working (service_role bypasses RLS).
4. **localStorage data** — Not affected (client-side cache, no RLS).

---

## Rollback Procedure

```sql
-- Per table:
DROP POLICY IF EXISTS "tenant_isolation_select" ON <table>;
DROP POLICY IF EXISTS "tenant_isolation_insert" ON <table>;
DROP POLICY IF EXISTS "tenant_isolation_update" ON <table>;
ALTER TABLE <table> DISABLE ROW LEVEL SECURITY;
ALTER TABLE <table> DROP COLUMN IF EXISTS client_id;
```

---

## Testing Strategy

1. Create test tenant: `client_id = 'test-tenant-001'`
2. Insert test data with that client_id
3. Login as test-tenant user (JWT with matching client_id)
4. Verify: can see own data, cannot see `glasstech-internal` data
5. Verify: Edge Function cron jobs still work (service_role bypass)
6. Verify: agent tools still function (uses supabase client from auth)
