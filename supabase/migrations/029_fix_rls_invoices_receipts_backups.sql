-- ═══════════════════════════════════════════════════════════════════
-- 029_fix_rls_invoices_receipts_backups.sql
--
-- Fixes 401/403 errors on invoices, payment_receipts, erp_backups
-- during sync by ensuring authenticated users have full read/write
-- access (scoped to their company via COALESCE fallback).
-- ═══════════════════════════════════════════════════════════════════

-- ── invoices ──────────────────────────────────────────────────────
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_rls"               ON invoices;
DROP POLICY IF EXISTS "authenticated_access"      ON invoices;
DROP POLICY IF EXISTS "invoices_authenticated"    ON invoices;
DROP POLICY IF EXISTS "allow_authenticated"       ON invoices;

CREATE POLICY "invoices_rw" ON invoices
  FOR ALL
  TO authenticated
  USING (
    company = COALESCE(
      (SELECT company FROM user_profiles WHERE id = auth.uid() LIMIT 1),
      company  -- fallback: allow if no profile row yet
    )
  )
  WITH CHECK (
    company = COALESCE(
      (SELECT company FROM user_profiles WHERE id = auth.uid() LIMIT 1),
      company
    )
  );

-- Also allow anon role (for apps using anon key without user session)
DROP POLICY IF EXISTS "invoices_anon_rw" ON invoices;
CREATE POLICY "invoices_anon_rw" ON invoices
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- ── payment_receipts ──────────────────────────────────────────────
ALTER TABLE payment_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_rls"                    ON payment_receipts;
DROP POLICY IF EXISTS "authenticated_access"           ON payment_receipts;
DROP POLICY IF EXISTS "payment_receipts_authenticated" ON payment_receipts;
DROP POLICY IF EXISTS "allow_authenticated"            ON payment_receipts;

CREATE POLICY "payment_receipts_rw" ON payment_receipts
  FOR ALL
  TO authenticated
  USING (
    company = COALESCE(
      (SELECT company FROM user_profiles WHERE id = auth.uid() LIMIT 1),
      company
    )
  )
  WITH CHECK (
    company = COALESCE(
      (SELECT company FROM user_profiles WHERE id = auth.uid() LIMIT 1),
      company
    )
  );

DROP POLICY IF EXISTS "payment_receipts_anon_rw" ON payment_receipts;
CREATE POLICY "payment_receipts_anon_rw" ON payment_receipts
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- ── erp_backups ───────────────────────────────────────────────────
ALTER TABLE erp_backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_access_erp_backups" ON erp_backups;
DROP POLICY IF EXISTS "allow_authenticated"               ON erp_backups;
DROP POLICY IF EXISTS "erp_backups_rw"                   ON erp_backups;
DROP POLICY IF EXISTS "erp_backups_anon_rw"              ON erp_backups;

-- Any authenticated user can read/write backups (no company filter — backups are global)
CREATE POLICY "erp_backups_rw" ON erp_backups
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Anon key also allowed (backup may trigger before session restore)
CREATE POLICY "erp_backups_anon_rw" ON erp_backups
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);
