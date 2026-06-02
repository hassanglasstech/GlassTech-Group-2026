-- ============================================================
-- Migration 003 — Phase 1: Data Layer Hardening
-- Run this in Supabase SQL Editor BEFORE deploying the new code
-- ============================================================

-- ── ledger: add req_id column (used by financeService PV linking) ──
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS req_id TEXT;

-- ── ledger: add doc_type column (was missing as native column) ───────
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS doc_type TEXT DEFAULT 'JV';
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS doc_date TEXT;
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS reference_id TEXT;

-- ── accounts: ensure all native columns exist ─────────────────────────
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS parent_id TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'Asset';

-- ── cost_centers: ensure native columns ──────────────────────────────
ALTER TABLE cost_centers ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE cost_centers ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE cost_centers ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE cost_centers ADD COLUMN IF NOT EXISTS manager TEXT;
ALTER TABLE cost_centers ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'H';
ALTER TABLE cost_centers ADD COLUMN IF NOT EXISTS hierarchy_area TEXT;

-- ── petty_cash: ensure native columns ────────────────────────────────
ALTER TABLE petty_cash ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE petty_cash ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Posted';
ALTER TABLE petty_cash ADD COLUMN IF NOT EXISTS reference_doc TEXT;

-- ── financial_events: ensure native columns ───────────────────────────
ALTER TABLE financial_events ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE financial_events ADD COLUMN IF NOT EXISTS amount NUMERIC DEFAULT 0;
ALTER TABLE financial_events ADD COLUMN IF NOT EXISTS date TEXT;
ALTER TABLE financial_events ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Pending';
ALTER TABLE financial_events ADD COLUMN IF NOT EXISTS reference TEXT;

-- ── recurring_expenses: ensure native columns ─────────────────────────
ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS amount NUMERIC DEFAULT 0;

-- ── Performance: GIN indexes on JSONB data column (Phase 1) ──────────
-- These prevent full table scans when filtering by status/company
CREATE INDEX IF NOT EXISTS idx_ledger_company     ON ledger(company);
CREATE INDEX IF NOT EXISTS idx_ledger_status      ON ledger(status);
CREATE INDEX IF NOT EXISTS idx_ledger_date        ON ledger(date);
CREATE INDEX IF NOT EXISTS idx_ledger_req_id      ON ledger(req_id);
CREATE INDEX IF NOT EXISTS idx_accounts_company   ON accounts(company);
CREATE INDEX IF NOT EXISTS idx_accounts_code      ON accounts(code);
CREATE INDEX IF NOT EXISTS idx_petty_cash_company ON petty_cash(company);
CREATE INDEX IF NOT EXISTS idx_petty_cash_date    ON petty_cash(date);
CREATE INDEX IF NOT EXISTS idx_cost_centers_co    ON cost_centers(company);

-- ── Audit columns: who posted this GL entry ───────────────────────────
-- NOTE: populate with auth.uid() from application layer on new entries
ALTER TABLE ledger      ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE petty_cash  ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE accounts    ADD COLUMN IF NOT EXISTS created_by TEXT;
