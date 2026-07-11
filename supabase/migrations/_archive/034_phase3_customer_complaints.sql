-- ═══════════════════════════════════════════════════════════════════════
-- Migration 034 — Phase 3: customer_complaints table (3.8)
--
-- Audit finding I9: CustomerComplaintModule persisted to localStorage only
-- (`gtk_erp_customer_complaints_<co>`). Lost on browser cache clear, no
-- audit trail, no cross-device visibility. New cloud table mirrors the
-- in-app `CustomerComplaint` interface so complaints become queryable,
-- exportable, and survive cache clears.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS customer_complaints (
  id           TEXT PRIMARY KEY,
  company      TEXT NOT NULL,
  date         DATE,
  client_id    TEXT,
  client_name  TEXT,
  invoice_id   TEXT,
  order_no     TEXT,
  category     TEXT,                       -- Measurement Error / Quality Issue / etc.
  description  TEXT,
  status       TEXT DEFAULT 'Open',        -- Open / In Progress / Resolved / Closed / Rejected
  priority     TEXT DEFAULT 'Medium',      -- Low / Medium / High / Critical
  assigned_to  TEXT,
  resolution   TEXT,
  resolved_at  TIMESTAMPTZ,
  resolved_by  TEXT,
  created_by   TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  data         JSONB DEFAULT '{}'           -- forward-compat blob
);

CREATE INDEX IF NOT EXISTS idx_customer_complaints_company  ON customer_complaints(company);
CREATE INDEX IF NOT EXISTS idx_customer_complaints_client   ON customer_complaints(client_id);
CREATE INDEX IF NOT EXISTS idx_customer_complaints_invoice  ON customer_complaints(invoice_id);
CREATE INDEX IF NOT EXISTS idx_customer_complaints_status   ON customer_complaints(company, status);
CREATE INDEX IF NOT EXISTS idx_customer_complaints_date     ON customer_complaints(date);

-- Single-user mode: keep RLS permissive (user requested no role gating).
ALTER TABLE customer_complaints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customer_complaints_rw"      ON customer_complaints;
DROP POLICY IF EXISTS "customer_complaints_anon_rw" ON customer_complaints;
CREATE POLICY "customer_complaints_rw" ON customer_complaints
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "customer_complaints_anon_rw" ON customer_complaints
  FOR ALL TO anon          USING (true) WITH CHECK (true);

GRANT ALL ON customer_complaints TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────
-- SELECT * FROM customer_complaints LIMIT 1;
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'customer_complaints' ORDER BY ordinal_position;
-- ═══════════════════════════════════════════════════════════════════════
