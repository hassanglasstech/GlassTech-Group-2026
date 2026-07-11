-- ═══════════════════════════════════════════════════════════════════════
-- Migration 060 — Sprint 33: Print Document Compliance — branding store
--
-- One row per company holds the regulatory + branding fields every
-- customer-facing print needs:
--
--   • legal_name, address, city, country
--   • phone, email, website
--   • NTN  (National Tax Number)              — required on Pakistani
--                                                tax invoices
--   • strn (Sales Tax Registration No)        — required on tax invoices
--   • cnic (single-proprietor) — optional
--   • logo_data_url            — base64 PNG/SVG, ~50-100 KB
--   • signature_block          — multi-line "Authorised Signatory" text
--   • bank_name / bank_branch / bank_iban / bank_account_no / bank_swift
--   • terms_quotation, terms_invoice, terms_delivery_challan, terms_so —
--     per-document T&C blocks (Markdown allowed in UI; rendered
--     as plain text on prints)
--   • show_logo, show_bank_on_invoice, show_qr_on_invoice — toggles
--
-- Single source of truth: PrintHeader / PrintFooter components read
-- through the brandingService cache so all 19 existing print files can
-- share one letterhead/footer the moment they import the components.
--
-- RLS-wide on Supabase (single-user/owner mode like Phase 1+2).
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS company_branding (
  id                     TEXT PRIMARY KEY,             -- uses company name as PK ('Glassco', 'GTK', …)
  company                TEXT NOT NULL UNIQUE,
  legal_name             TEXT,
  address_line1          TEXT,
  address_line2          TEXT,
  city                   TEXT,
  country                TEXT DEFAULT 'Pakistan',
  phone                  TEXT,
  email                  TEXT,
  website                TEXT,
  ntn                    TEXT,                          -- Pakistani National Tax Number
  strn                   TEXT,                          -- Sales Tax Registration Number
  cnic                   TEXT,
  logo_data_url          TEXT,                          -- base64 PNG/SVG (cap ~150 KB at upload time)
  signature_block        TEXT,                          -- multi-line authorised signatory text
  bank_name              TEXT,
  bank_branch            TEXT,
  bank_iban              TEXT,
  bank_account_title     TEXT,
  bank_account_no        TEXT,
  bank_swift             TEXT,
  terms_quotation        TEXT,
  terms_invoice          TEXT,
  terms_delivery_challan TEXT,
  terms_service_order    TEXT,
  terms_credit_note      TEXT,
  terms_grn              TEXT,
  show_logo              BOOLEAN DEFAULT TRUE,
  show_bank_on_invoice   BOOLEAN DEFAULT TRUE,
  show_qr_on_invoice     BOOLEAN DEFAULT FALSE,         -- future: tax-invoice QR per FBR PRAL spec
  created_by             TEXT,
  created_at             TIMESTAMPTZ DEFAULT now(),
  updated_at             TIMESTAMPTZ DEFAULT now(),
  data                   JSONB DEFAULT '{}'             -- forward-compat blob
);

CREATE INDEX IF NOT EXISTS idx_company_branding_company ON company_branding(company);

-- Single-user mode: keep RLS open (matches Phase 1+2 conventions).
ALTER TABLE company_branding ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_branding_rw"      ON company_branding;
DROP POLICY IF EXISTS "company_branding_anon_rw" ON company_branding;
CREATE POLICY "company_branding_rw"      ON company_branding FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "company_branding_anon_rw" ON company_branding FOR ALL TO anon          USING (true) WITH CHECK (true);
GRANT ALL ON company_branding TO authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────
-- Seed minimal rows for the five active companies. Operators flesh
-- these out via the BrandingSettings UI; no defaults are forced so
-- empty fields render nothing on prints (no fake addresses).
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO company_branding (id, company, legal_name, country, show_logo, show_bank_on_invoice)
VALUES
  ('Glassco', 'Glassco', 'GlassTech Group — Glassco', 'Pakistan', TRUE, TRUE),
  ('GTK',     'GTK',     'GlassTech Group — GTK',     'Pakistan', TRUE, TRUE),
  ('GTI',     'GTI',     'GlassTech Group — GTI',     'Pakistan', TRUE, TRUE),
  ('Nippon',  'Nippon',  'GlassTech Group — Nippon',  'Pakistan', TRUE, TRUE),
  ('Factory', 'Factory', 'GlassTech Group — Factory', 'Pakistan', TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────
-- SELECT id, company, ntn, strn, show_logo
--   FROM company_branding ORDER BY company;
-- ═══════════════════════════════════════════════════════════════════════
