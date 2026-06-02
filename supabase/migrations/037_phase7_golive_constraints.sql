-- ═══════════════════════════════════════════════════════════════════════
-- Migration 037 — Phase 7 Go-Live Constraints
--
-- Hardens schema before Glassco single-user data entry begins.
-- Idempotent — safe to re-run.
-- Prevents:
--   • duplicate invoice / quotation / SO numbers (UNIQUE)
--   • orphaned credit notes / receipts / complaints (FK)
--   • bad status enum values (CHECK)
--   • slow FK lookups (indexes)
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 1. UNIQUE document numbers (B7) — last line of defence vs duplicate IDs
--
-- NOTE: invoices.id IS the invoice number (e.g. GT-INV-GLS-0101-0001).
-- It is already the PRIMARY KEY → already UNIQUE → no separate UNIQUE
-- constraint needed. A composite index (company, id) is added in section
-- 4 instead for company-scoped query performance.
--
-- quotations.order_no IS a separate TEXT column (added in migration 032)
-- and is NOT the PK — UNIQUE constraint here is meaningful.
-- ─────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uk_quotations_company_order_no') THEN
    IF NOT EXISTS (
      SELECT 1 FROM (
        SELECT company, order_no FROM quotations
        WHERE order_no IS NOT NULL
        GROUP BY company, order_no HAVING count(*) > 1
      ) d
    ) THEN
      ALTER TABLE quotations
        ADD CONSTRAINT uk_quotations_company_order_no UNIQUE (company, order_no);
    ELSE
      RAISE NOTICE 'Skipping uk_quotations_company_order_no — duplicates already in quotations. Clean up first.';
    END IF;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. FK constraints (P2-6) — block orphaned children
-- ─────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_credit_notes_invoice') THEN
    ALTER TABLE credit_notes
      ADD CONSTRAINT fk_credit_notes_invoice
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_payment_receipts_invoice') THEN
    ALTER TABLE payment_receipts
      ADD CONSTRAINT fk_payment_receipts_invoice
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_customer_complaints_client') THEN
    ALTER TABLE customer_complaints
      ADD CONSTRAINT fk_customer_complaints_client
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_customer_complaints_invoice') THEN
    ALTER TABLE customer_complaints
      ADD CONSTRAINT fk_customer_complaints_invoice
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 3. CHECK constraints on enum-like status columns (P2-7)
-- ─────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_invoices_status') THEN
    -- 'Voided' (not 'Void') — matches deliveryInvoiceService + creditNoteService
    ALTER TABLE invoices ADD CONSTRAINT ck_invoices_status
      CHECK (status IS NULL OR status IN ('Outstanding','Paid','Partial','Voided','Draft','Cancelled'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_credit_notes_status') THEN
    ALTER TABLE credit_notes ADD CONSTRAINT ck_credit_notes_status
      CHECK (status IS NULL OR status IN ('Posted','Void','Draft'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_customer_complaints_status') THEN
    ALTER TABLE customer_complaints ADD CONSTRAINT ck_customer_complaints_status
      CHECK (status IS NULL OR status IN ('Open','In Progress','Resolved','Closed','Rejected'));
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 4. Performance indexes — FK columns + (company, date) composites
-- ─────────────────────────────────────────────────────────────────────
-- invoices(company, id) — company-scoped lookups by invoice number (id IS the invoice number)
CREATE INDEX IF NOT EXISTS idx_invoices_company_id            ON invoices(company, id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice_id        ON credit_notes(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_invoice_id    ON payment_receipts(invoice_id);
CREATE INDEX IF NOT EXISTS idx_customer_complaints_client_id  ON customer_complaints(client_id);
CREATE INDEX IF NOT EXISTS idx_customer_complaints_invoice_id ON customer_complaints(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_company_date          ON invoices(company, date);
CREATE INDEX IF NOT EXISTS idx_quotations_company_date        ON quotations(company, date);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_company_date  ON payment_receipts(company, date);

-- gl_tx_id index — only if column exists (some envs don't have it)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'gl_tx_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_invoices_gl_tx_id ON invoices(gl_tx_id);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 5. Timestamp precision — voided_at should be TIMESTAMPTZ for audit
-- ─────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'voided_at' AND data_type = 'date'
  ) THEN
    ALTER TABLE invoices ALTER COLUMN voided_at TYPE TIMESTAMPTZ USING voided_at::TIMESTAMPTZ;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 6. Reload PostgREST schema cache so new constraints/indexes are visible
-- ─────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────
-- 7. Verification (run manually after migration applies)
-- ─────────────────────────────────────────────────────────────────────
-- SELECT conname, contype FROM pg_constraint
--   WHERE conname IN (
--     'uk_quotations_company_order_no',
--     'fk_credit_notes_invoice','fk_payment_receipts_invoice',
--     'fk_customer_complaints_client','fk_customer_complaints_invoice',
--     'ck_invoices_status','ck_credit_notes_status','ck_customer_complaints_status'
--   );
--
-- SELECT indexname FROM pg_indexes
--   WHERE indexname LIKE 'idx_invoices_%'
--      OR indexname LIKE 'idx_quotations_%'
--      OR indexname LIKE 'idx_credit_notes_%'
--      OR indexname LIKE 'idx_payment_receipts_%'
--      OR indexname LIKE 'idx_customer_complaints_%';
-- ═══════════════════════════════════════════════════════════════════════
