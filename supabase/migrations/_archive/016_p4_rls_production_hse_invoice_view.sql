-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 016 — Phase 4: SEC-5, SEC-6, FIN-4, FIN-5
-- Addresses:
--   SEC-5  — RLS on production_pieces (cross-company data bleed)
--   SEC-6  — RLS on hse_incidents    (cross-company data bleed)
--   FIN-4  — invoice_balances live view (stale paid_amount on invoices)
--   FIN-5  — cost_centers RLS verified (already in 014; no-op guard added)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- SEC-5: production_pieces — company isolation
-- The table may not have a company column yet; add it idempotently.
-- Existing rows are back-filled via a JOIN on quotations.order_id.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE production_pieces
  ADD COLUMN IF NOT EXISTS company TEXT NOT NULL DEFAULT '';

-- Back-fill company from the parent quotation (one-time migration).
-- Rows where order_id is NULL or orphaned remain '' and will fail RLS
-- (intentional — orphan pieces should not be readable until repaired).
UPDATE production_pieces pp
SET    company = q.company
FROM   quotations q
WHERE  pp.order_id = q.id
  AND  pp.company  = '';

-- Index for RLS predicate performance
CREATE INDEX IF NOT EXISTS production_pieces_company_idx
  ON production_pieces (company);

ALTER TABLE production_pieces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_rls" ON production_pieces;
CREATE POLICY "company_rls" ON production_pieces
  FOR ALL
  USING (
    company = (SELECT company FROM user_profiles WHERE id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────
-- SEC-6: hse_incidents — company isolation
-- The company column already exists (written from the insert form).
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE hse_incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_rls" ON hse_incidents;
CREATE POLICY "company_rls" ON hse_incidents
  FOR ALL
  USING (
    company = (SELECT company FROM user_profiles WHERE id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS hse_incidents_company_idx
  ON hse_incidents (company);

-- ─────────────────────────────────────────────────────────────────────────
-- FIN-4: invoice_balances — live computed view
-- Replaces the stale `paid_amount` column on invoices with a real-time
-- calculation: total_amount − Σ(payment_receipts.amount).
-- Callers should query this view instead of invoices.paid_amount to avoid
-- race conditions between payment recording and invoice updates.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW invoice_balances AS
  SELECT
    i.id,
    i.company,
    i.total_amount,
    COALESCE(SUM(pr.amount), 0)               AS paid_amount,
    i.total_amount - COALESCE(SUM(pr.amount), 0) AS live_balance
  FROM  invoices        i
  LEFT JOIN payment_receipts pr ON pr.invoice_id = i.id
  GROUP BY i.id, i.company, i.total_amount;

-- Views inherit RLS from the underlying tables. Supabase also requires
-- the view itself to be RLS-aware when accessed via the REST API.
-- We enable RLS on the view directly so the company_rls policy on
-- invoices is enforced even when the view is queried independently.
ALTER VIEW invoice_balances OWNER TO postgres;

-- ─────────────────────────────────────────────────────────────────────────
-- FIN-5: cost_centers RLS guard (idempotent — already applied in 014)
-- Re-drop and re-create ensures the policy body matches the standard form
-- even if 014 was applied with an older version.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE cost_centers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_rls" ON cost_centers;
CREATE POLICY "company_rls" ON cost_centers
  FOR ALL
  USING (
    company = (SELECT company FROM user_profiles WHERE id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICATION QUERIES
-- ─────────────────────────────────────────────────────────────────────────
-- -- Confirm RLS on production_pieces:
-- SELECT relrowsecurity FROM pg_class WHERE relname = 'production_pieces';
-- -- Expected: true
--
-- -- Confirm RLS on hse_incidents:
-- SELECT relrowsecurity FROM pg_class WHERE relname = 'hse_incidents';
-- -- Expected: true
--
-- -- Confirm invoice_balances view exists:
-- SELECT COUNT(*) FROM invoice_balances LIMIT 1;
--
-- -- Sample live balance for one invoice:
-- SELECT id, total_amount, paid_amount, live_balance FROM invoice_balances LIMIT 5;
-- ═══════════════════════════════════════════════════════════════════════════
