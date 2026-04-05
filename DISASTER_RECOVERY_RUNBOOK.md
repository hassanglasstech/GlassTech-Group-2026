# GlassTech Group ERP — Disaster Recovery Runbook
# Version: April 2026 | Owner: Hassan (GlassTech Group)
# Keep this document updated after every major schema change.

## ════════════════════════════════════════════════════════════
## 1. BACKUP VERIFICATION (Run Every Monday)
## ════════════════════════════════════════════════════════════

### Supabase Backup Check
1. Login: supabase.com → GlassTech project
2. Settings → Backups
3. Confirm: last backup was within 24 hours
4. Confirm: plan is Pro or higher (free plan has NO backups)

### Manual Backup (Run Monthly or Before Major Changes)
Run this in Supabase SQL Editor — exports row counts per table:

```sql
SELECT
  relname AS table_name,
  n_live_tup AS row_count
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_live_tup DESC;
```

Save the output. If any critical table (ledger, employees, invoices)
shows 0 rows after a known data entry — investigate immediately.


## ════════════════════════════════════════════════════════════
## 2. POINT-IN-TIME RESTORE (Supabase Pro)
## ════════════════════════════════════════════════════════════

Available on Supabase Pro plan. Steps:

1. supabase.com → Project → Settings → Backups
2. Click "Restore" on the backup date you want
3. Choose target: restore to NEW project (safer than overwriting)
4. Wait 10-30 minutes for restore to complete
5. Update .env / Vercel environment variables to point to restored project
6. Test one report in ReportsHub to confirm data integrity
7. If OK — switch DNS/URL to restored project

WARNING: Restoring to existing project OVERWRITES current data.
Always restore to a new project first and verify.


## ════════════════════════════════════════════════════════════
## 3. CRITICAL TABLE RECOVERY SQL
## ════════════════════════════════════════════════════════════
-- If a specific table is corrupted or accidentally deleted,
-- run the matching migration to recreate it with correct schema.

-- Recreate ledger table (if dropped):
CREATE TABLE IF NOT EXISTS ledger (
  id            TEXT PRIMARY KEY,
  company       TEXT,
  doc_type      TEXT DEFAULT 'JV',
  doc_date      TEXT,
  description   TEXT,
  reference_id  TEXT,
  status        TEXT DEFAULT 'Posted',
  data          JSONB DEFAULT '{}',
  req_id        TEXT,
  created_by    TEXT,
  updated_at    TIMESTAMPTZ DEFAULT now(),
  created_at    TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access_ledger" ON ledger;
CREATE POLICY "authenticated_access_ledger" ON ledger
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Recreate employees table (if dropped):
CREATE TABLE IF NOT EXISTS employees (
  id         TEXT PRIMARY KEY,
  company    TEXT,
  data       JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access_employees" ON employees;
CREATE POLICY "authenticated_access_employees" ON employees
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


## ════════════════════════════════════════════════════════════
## 4. VERCEL ENVIRONMENT RECOVERY
## ════════════════════════════════════════════════════════════

If app stops working after restore, update Vercel environment:

1. vercel.com → GlassTech project → Settings → Environment Variables
2. Update these two variables:
   - VITE_SUPABASE_URL     = https://[new-project-ref].supabase.co
   - VITE_SUPABASE_ANON_KEY = [new-project-anon-key]
3. Redeploy: vercel.com → Deployments → Redeploy latest

Supabase keys found at:
supabase.com → Project → Settings → API → Project URL + anon key


## ════════════════════════════════════════════════════════════
## 5. DATA CORRUPTION CHECKLIST
## ════════════════════════════════════════════════════════════

Run in SQL Editor to detect common issues:

```sql
-- 1. Check GL balance (should be 0 for all companies)
SELECT
  company,
  SUM(CASE WHEN d->>'debit'  IS NOT NULL THEN (d->>'debit')::numeric  ELSE 0 END) AS total_debit,
  SUM(CASE WHEN d->>'credit' IS NOT NULL THEN (d->>'credit')::numeric ELSE 0 END) AS total_credit,
  SUM(CASE WHEN d->>'debit'  IS NOT NULL THEN (d->>'debit')::numeric  ELSE 0 END) -
  SUM(CASE WHEN d->>'credit' IS NOT NULL THEN (d->>'credit')::numeric ELSE 0 END) AS difference
FROM ledger, jsonb_array_elements(data->'details') AS d
WHERE status = 'Posted'
GROUP BY company;

-- 2. Check for null company entries (data leaks)
SELECT 'ledger'    AS tbl, COUNT(*) FROM ledger    WHERE company IS NULL
UNION ALL
SELECT 'employees' AS tbl, COUNT(*) FROM employees WHERE company IS NULL
UNION ALL
SELECT 'invoices'  AS tbl, COUNT(*) FROM invoices  WHERE company IS NULL;

-- 3. Check fiscal periods are seeded
SELECT company, month, status FROM fiscal_periods ORDER BY company, month;

-- 4. Recent ledger entries (last 10)
SELECT id, company, doc_type, doc_date, description, status
FROM ledger
ORDER BY created_at DESC
LIMIT 10;
```

If `difference` in query 1 is not 0 — there are unbalanced GL entries.
Investigate immediately before any new postings.


## ════════════════════════════════════════════════════════════
## 6. EMERGENCY CONTACTS & ESCALATION
## ════════════════════════════════════════════════════════════

System Owner:  Hassan (GlassTech Group)
Supabase:      support.supabase.com (Pro plan has priority support)
Vercel:        vercel.com/help
AI Assistance: Claude (claude.ai) — share this runbook for context

Emergency data recovery order:
1. Stop all users from logging in (change Supabase anon key in Vercel)
2. Take immediate snapshot (Supabase Dashboard → Backups → Manual)
3. Assess damage (run queries in Section 5)
4. Restore to new project (Section 2)
5. Verify data integrity
6. Switch environment variables (Section 4)
7. Notify users


## ════════════════════════════════════════════════════════════
## 7. MIGRATIONS LOG
## ════════════════════════════════════════════════════════════

Keep this updated:

| Migration File                     | Date Applied | Tables Affected              |
|------------------------------------|--------------|------------------------------|
| 001_create_all_tables.sql          | Apr 2026     | All 58 tables                |
| 002_add_missing_columns.sql        | Apr 2026     | accounts, ledger, employees  |
| 003_phase1_data_layer.sql          | Apr 2026     | ledger, accounts, cost_centers|
| 004_fiscal_periods.sql             | Apr 2026     | fiscal_periods, job_orders   |
| 005_phase6_intercompany.sql        | Apr 2026     | intercompany_transfers, bank |
| 006_ai_layer_tables.sql            | Apr 2026     | morning_briefings, agent_tasks|
| 007_phase9_leave_projects.sql      | Apr 2026     | leave_applications, projects |
| STOCK_LEDGER_FIX.sql               | Apr 2026     | stock_ledger (35 columns)    |
| Phase 1 OB fix (ledger data col)   | Apr 2026     | ledger                       |
