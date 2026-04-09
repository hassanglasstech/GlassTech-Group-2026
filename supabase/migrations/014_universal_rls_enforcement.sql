-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 014 — Universal RLS Enforcement (P0 Security)
-- Addresses: SEC-1, SEC-2, SEC-3, SEC-4
-- Every table with a `company` column receives a strict RLS policy so that
-- the database itself enforces tenant isolation — never application-layer JS.
-- Policy: a row is visible / writable only to users whose profile.company
-- matches the row's company column.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Helper: drop a policy if it already exists (idempotent re-run) ──────
-- We drop by name before re-creating so this migration is safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────
-- FINANCE TABLES (SEC-1)
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE accounts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger             ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_centers       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_rls" ON accounts;
DROP POLICY IF EXISTS "company_rls" ON ledger;
DROP POLICY IF EXISTS "company_rls" ON cost_centers;

CREATE POLICY "company_rls" ON accounts
  FOR ALL
  USING (
    company = (
      SELECT company FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "company_rls" ON ledger
  FOR ALL
  USING (
    company = (
      SELECT company FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "company_rls" ON cost_centers
  FOR ALL
  USING (
    company = (
      SELECT company FROM user_profiles WHERE id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- HR TABLES (SEC-2)
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE employees          ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_rls" ON employees;
DROP POLICY IF EXISTS "company_rls" ON attendance;

CREATE POLICY "company_rls" ON employees
  FOR ALL
  USING (
    company = (
      SELECT company FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "company_rls" ON attendance
  FOR ALL
  USING (
    company = (
      SELECT company FROM user_profiles WHERE id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- SALES TABLES (SEC-3)
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE clients            ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices           ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_rls" ON clients;
DROP POLICY IF EXISTS "company_rls" ON quotations;
DROP POLICY IF EXISTS "company_rls" ON invoices;

CREATE POLICY "company_rls" ON clients
  FOR ALL
  USING (
    company = (
      SELECT company FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "company_rls" ON quotations
  FOR ALL
  USING (
    company = (
      SELECT company FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "company_rls" ON invoices
  FOR ALL
  USING (
    company = (
      SELECT company FROM user_profiles WHERE id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- INVENTORY / PROCUREMENT TABLES (SEC-4)
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE store_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_ledger       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_rls" ON store_items;
DROP POLICY IF EXISTS "company_rls" ON stock_ledger;

CREATE POLICY "company_rls" ON store_items
  FOR ALL
  USING (
    company = (
      SELECT company FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "company_rls" ON stock_ledger
  FOR ALL
  USING (
    company = (
      SELECT company FROM user_profiles WHERE id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- PERFORMANCE: one index per table so the subquery hits a PK lookup, not a
-- seq-scan, on every RLS evaluation.
-- user_profiles.id is already the PK so this is essentially free.
-- ─────────────────────────────────────────────────────────────────────────

-- Confirm user_profiles has an index on id (should already be PK):
-- CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_id_idx ON user_profiles(id);

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES (run manually to confirm after migration)
-- ═══════════════════════════════════════════════════════════════════════════
-- SELECT tablename, policyname, cmd, qual
-- FROM pg_policies
-- WHERE policyname = 'company_rls'
-- ORDER BY tablename;
--
-- Expected: 10 rows — accounts, ledger, cost_centers, employees, attendance,
--           clients, quotations, invoices, store_items, stock_ledger
-- ═══════════════════════════════════════════════════════════════════════════
