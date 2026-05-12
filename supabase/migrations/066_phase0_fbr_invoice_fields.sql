-- ═══════════════════════════════════════════════════════════════════════
-- Migration 066 — Phase 0 (Brutal Report fix #3):
-- FBR / Pakistan Sales Tax compliance schema
--
-- Problem identified by the consulting team (Faisal Rehman, ex-FBR):
--   Current invoice schema does not capture mandatory fields for the
--   FBR IRIS e-invoicing system (SRO 1006(I)/2021 + SRO 1525(I)/2023).
--   Tier-1 manufacturers/retailers above the threshold MUST register
--   each sales tax invoice with FBR in real time and print:
--     • FBR Invoice Number (assigned by IRIS)
--     • QR code (encodes invoice URL for buyer verification)
--     • Buyer's STRN (registration number for input tax claim)
--
-- This migration adds the schema fields. The actual integration with
-- Haball / Trax / PRAL is a separate workstream (~2-4 weeks). Adding
-- the schema now means:
--   • Front-end can start collecting buyer STRN at sale time
--   • Print template already shows the QR slot (Sprint 33 placeholder)
--   • When FBR integration ships, no schema migration is needed
--   • `fbr_status` column lets the operator see what's pending submission
--
-- Tables touched:
--   • invoices            (primary)
--   • sales_invoices      (legacy alias, if exists)
--   • clients             (buyer_strn capture)
--
-- Plus a v_fbr_pending view + index for the daily reconciliation report.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Buyer-side fields on clients table ──────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'clients') THEN
    ALTER TABLE clients
      ADD COLUMN IF NOT EXISTS strn               TEXT,    -- Sales Tax Reg #
      ADD COLUMN IF NOT EXISTS ntn                TEXT,    -- National Tax #
      ADD COLUMN IF NOT EXISTS cnic               TEXT,    -- For unregistered buyers
      ADD COLUMN IF NOT EXISTS fbr_buyer_type     TEXT
        CHECK (fbr_buyer_type IS NULL OR fbr_buyer_type IN
          ('registered', 'unregistered', 'export', 'exempt', 'consumer')),
      ADD COLUMN IF NOT EXISTS province           TEXT,    -- Required for PRA/SRB/KPRA invoices
      ADD COLUMN IF NOT EXISTS fbr_business_name  TEXT;    -- Name as registered with FBR

    CREATE INDEX IF NOT EXISTS idx_clients_strn ON clients(strn) WHERE strn IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_clients_ntn  ON clients(ntn)  WHERE ntn IS NOT NULL;
    RAISE NOTICE '✓ Added FBR buyer fields to clients';
  END IF;
END$$;

-- ── 2. Invoice-side fields on invoices table ───────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'invoices') THEN
    ALTER TABLE invoices
      -- Snapshot buyer info at invoice time (denormalised — buyer details
      -- can change post-invoice but the invoice itself must be immutable)
      ADD COLUMN IF NOT EXISTS buyer_strn         TEXT,
      ADD COLUMN IF NOT EXISTS buyer_ntn          TEXT,
      ADD COLUMN IF NOT EXISTS buyer_cnic         TEXT,
      ADD COLUMN IF NOT EXISTS buyer_type         TEXT
        CHECK (buyer_type IS NULL OR buyer_type IN
          ('registered', 'unregistered', 'export', 'exempt', 'consumer')),
      ADD COLUMN IF NOT EXISTS buyer_province     TEXT,

      -- FBR submission lifecycle
      ADD COLUMN IF NOT EXISTS fbr_invoice_no     TEXT,    -- IRIS-assigned UUID/number
      ADD COLUMN IF NOT EXISTS fbr_qr_code        TEXT,    -- Base64 PNG or URL string
      ADD COLUMN IF NOT EXISTS fbr_status         TEXT     DEFAULT 'pending'
        CHECK (fbr_status IN
          ('pending', 'submitted', 'verified', 'rejected', 'exempt', 'na')),
      ADD COLUMN IF NOT EXISTS fbr_submitted_at   TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS fbr_verified_at    TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS fbr_response       JSONB,   -- Raw IRIS response for debugging
      ADD COLUMN IF NOT EXISTS fbr_retry_count    INT      DEFAULT 0,
      ADD COLUMN IF NOT EXISTS fbr_last_error     TEXT;

    -- Index for the operator's "what's pending FBR submission?" query
    CREATE INDEX IF NOT EXISTS idx_invoices_fbr_status
      ON invoices(fbr_status, created_at DESC)
      WHERE fbr_status IN ('pending', 'rejected');

    -- Index for the buyer-side reconciliation (find all invoices for a STRN)
    CREATE INDEX IF NOT EXISTS idx_invoices_buyer_strn
      ON invoices(buyer_strn, invoice_date DESC)
      WHERE buyer_strn IS NOT NULL;

    RAISE NOTICE '✓ Added FBR fields to invoices';
  END IF;
END$$;

-- ── 3. Same for sales_invoices (legacy/alias table, if it exists) ───
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'sales_invoices') THEN
    ALTER TABLE sales_invoices
      ADD COLUMN IF NOT EXISTS buyer_strn         TEXT,
      ADD COLUMN IF NOT EXISTS buyer_ntn          TEXT,
      ADD COLUMN IF NOT EXISTS buyer_cnic         TEXT,
      ADD COLUMN IF NOT EXISTS fbr_invoice_no     TEXT,
      ADD COLUMN IF NOT EXISTS fbr_qr_code        TEXT,
      ADD COLUMN IF NOT EXISTS fbr_status         TEXT     DEFAULT 'pending'
        CHECK (fbr_status IN
          ('pending', 'submitted', 'verified', 'rejected', 'exempt', 'na')),
      ADD COLUMN IF NOT EXISTS fbr_submitted_at   TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS fbr_response       JSONB;
    RAISE NOTICE '✓ Added FBR fields to sales_invoices';
  END IF;
END$$;

-- ── 4. Operator dashboard view: pending FBR submissions ─────────────
CREATE OR REPLACE VIEW v_fbr_pending AS
SELECT
  company,
  fbr_status,
  COUNT(*)                                            AS invoice_count,
  COALESCE(SUM(total_amount), 0)                      AS total_amount_pkr,
  MIN(invoice_date)                                   AS oldest_invoice_date,
  MAX(invoice_date)                                   AS newest_invoice_date,
  COUNT(*) FILTER (WHERE fbr_retry_count > 0)         AS retried_count,
  MAX(fbr_last_error)                                 AS sample_error
FROM invoices
WHERE fbr_status IN ('pending', 'rejected')
GROUP BY company, fbr_status
ORDER BY company, fbr_status;

GRANT SELECT ON v_fbr_pending TO authenticated, anon;

-- ── 5. FBR config table — per-company FBR API credentials ──────────
-- Stored separately from alert_thresholds so secrets can be rotated
-- independently. Hassan should set these via TaxSettings UI later.
CREATE TABLE IF NOT EXISTS fbr_config (
  id                          TEXT PRIMARY KEY,         -- = company name
  company                     TEXT NOT NULL UNIQUE,
  fbr_enabled                 BOOLEAN NOT NULL DEFAULT false,  -- master switch
  fbr_environment             TEXT    NOT NULL DEFAULT 'sandbox'
                                      CHECK (fbr_environment IN ('sandbox','production')),
  fbr_seller_strn             TEXT,                     -- Glassco's own STRN
  fbr_seller_ntn              TEXT,                     -- Glassco's own NTN
  fbr_pos_id                  TEXT,                     -- POS registration ID with FBR
  fbr_api_endpoint            TEXT,                     -- Haball/Trax/PRAL endpoint URL
  fbr_api_token               TEXT,                     -- Bearer token (encrypted at rest by Supabase)
  fbr_token_expires_at        TIMESTAMPTZ,
  fbr_auto_submit             BOOLEAN NOT NULL DEFAULT false,  -- auto-fire on invoice post
  fbr_retry_max               INT     NOT NULL DEFAULT 3,
  fbr_retry_backoff_seconds   INT     NOT NULL DEFAULT 60,
  data                        JSONB   DEFAULT '{}',
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE fbr_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fbr_config_rw" ON fbr_config;
CREATE POLICY "fbr_config_rw" ON fbr_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- Deliberately NO anon access — secrets live here
GRANT SELECT, INSERT, UPDATE, DELETE ON fbr_config TO authenticated;

-- Seed empty config rows for the 5 companies (so TaxSettings UI can read+update)
INSERT INTO fbr_config (id, company) VALUES
  ('Glassco', 'Glassco'),
  ('GTK',     'GTK'),
  ('GTI',     'GTI'),
  ('Nippon',  'Nippon'),
  ('Factory', 'Factory')
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- 1. Confirm columns exist:
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'invoices' AND column_name LIKE 'fbr_%';
-- → expected: fbr_invoice_no, fbr_qr_code, fbr_status, fbr_submitted_at,
--             fbr_verified_at, fbr_response, fbr_retry_count, fbr_last_error
--
-- 2. Confirm pending dashboard works:
-- SELECT * FROM v_fbr_pending;
-- → expected: rows showing how many invoices haven't been submitted to FBR
--
-- 3. Confirm fbr_config has 5 seed rows:
-- SELECT id, fbr_enabled, fbr_environment FROM fbr_config;
-- → expected: 5 rows, all fbr_enabled=false (off until integrated)
--
-- ═══════════════════════════════════════════════════════════════════════
