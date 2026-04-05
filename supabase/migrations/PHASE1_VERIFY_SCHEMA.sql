-- ============================================================
-- GLASSTECH ERP — PHASE 1 SCHEMA VERIFICATION
-- Run this AFTER PHASE1_MASTER_MIGRATION.sql
-- All results should show tables exist
-- ============================================================

-- 1. Check all critical tables exist
SELECT table_name, 'EXISTS ✓' AS status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'employees', 'attendance', 'loans', 'payroll',
    'accounts', 'ledger', 'petty_cash', 'fiscal_periods',
    'clients', 'quotations', 'invoices', 'payment_receipts',
    'vendors', 'requisitions', 'purchase_orders',
    'grn_sheet_entries', 'production_pieces', 'job_orders',
    'ncr_events', 'ncr_claims',
    'intercompany_transfers', 'bank_recon_sessions',
    'morning_briefings', 'predictive_alerts', 'agent_tasks',
    'leave_applications', 'projects',
    'erp_backups'
  )
ORDER BY table_name;

-- 2. Check fiscal periods seeded for current month
SELECT company, month, status FROM fiscal_periods ORDER BY company;

-- 3. Check RLS is enabled on ledger (most critical)
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('ledger', 'employees', 'accounts', 'invoices')
ORDER BY tablename;

-- 4. Check ledger columns (Phase 3 adds doc_type natively)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'ledger'
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- 5. Quick record count across key tables
SELECT 'employees'         AS tbl, COUNT(*) AS records FROM employees
UNION ALL
SELECT 'ledger'            AS tbl, COUNT(*) AS records FROM ledger
UNION ALL
SELECT 'accounts'          AS tbl, COUNT(*) AS records FROM accounts
UNION ALL
SELECT 'fiscal_periods'    AS tbl, COUNT(*) AS records FROM fiscal_periods
UNION ALL
SELECT 'clients'           AS tbl, COUNT(*) AS records FROM clients
UNION ALL
SELECT 'invoices'          AS tbl, COUNT(*) AS records FROM invoices
ORDER BY tbl;
