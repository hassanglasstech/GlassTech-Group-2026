-- ═══════════════════════════════════════════════════════════════════════
-- Migration 036 — Phase 6: Post-launch Enhancements (6.2 / 6.3 / 6.4)
--
-- Adds the schema for the three Phase-6 features that need DB-level
-- support. The other Phase-6 items (6.1 BOM, 6.5 dashboard, 6.6 status
-- machine, 6.7 exports) reuse existing schema or are UI-only.
--
-- Tables created:
--   • price_lists           — header per (company, name)
--   • price_list_items      — overrides per (price_list_id, glass_type, thickness, service)
--   • work_orders           — formal WO entity, distinct id from SO
--   • leads                 — pre-quotation pipeline entries
--
-- All idempotent. Single-user RLS (open) consistent with prior phases.
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 6.4 — Customer-tier price list
--
-- A price list is a named collection of glass-type / thickness / service
-- rate overrides that can be linked to a client. When a quotation is
-- saved for a client with a price_list_id assigned, the line-item rate
-- lookup checks the matching price-list row before falling back to the
-- product-master base rate.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS price_lists (
  id            TEXT PRIMARY KEY,
  company       TEXT NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  effective_from DATE,
  effective_to   DATE,
  is_active     BOOLEAN DEFAULT true,
  created_by    TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  data          JSONB DEFAULT '{}',
  UNIQUE (company, name)
);

CREATE TABLE IF NOT EXISTS price_list_items (
  id            TEXT PRIMARY KEY,
  price_list_id TEXT NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
  company       TEXT NOT NULL,
  glass_type    TEXT,                    -- e.g. Plain / Tinted / Mirror / Reflective / NULL = any
  thickness     TEXT,                    -- e.g. 5mm / 6mm / 8mm / 10mm / 12mm / NULL = any
  sub_category  TEXT,                    -- Standard / D/G / etc.
  service_nick  TEXT,                    -- Polishing / Grinding / Holes / NULL = base sheet rate
  rate          NUMERIC(15,2) NOT NULL,
  uom           TEXT DEFAULT 'sqft',
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_lists_company         ON price_lists(company, is_active);
CREATE INDEX IF NOT EXISTS idx_price_list_items_pl         ON price_list_items(price_list_id);
CREATE INDEX IF NOT EXISTS idx_price_list_items_lookup     ON price_list_items(company, glass_type, thickness, service_nick);

-- Link clients to a price list (nullable; NULL = use base rates).
ALTER TABLE clients ADD COLUMN IF NOT EXISTS price_list_id TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS customer_tier TEXT;            -- e.g. Platinum / Gold / Silver / Default

ALTER TABLE price_lists       ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_list_items  ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS price_lists_rw      ON price_lists;
DROP POLICY IF EXISTS price_lists_anon_rw ON price_lists;
CREATE POLICY price_lists_rw      ON price_lists      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY price_lists_anon_rw ON price_lists      FOR ALL TO anon          USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS price_list_items_rw      ON price_list_items;
DROP POLICY IF EXISTS price_list_items_anon_rw ON price_list_items;
CREATE POLICY price_list_items_rw      ON price_list_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY price_list_items_anon_rw ON price_list_items FOR ALL TO anon          USING (true) WITH CHECK (true);
GRANT ALL ON price_lists, price_list_items TO authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────
-- 6.2 — Work Order entity
--
-- Distinct id from the Sales Order — one SO can spawn multiple WOs (e.g.
-- partial production runs, re-cuts after NCR). The WO carries the
-- production-floor identity and is what the cutter / supervisor actually
-- references. SO# stays the customer-facing identity.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS work_orders (
  id              TEXT PRIMARY KEY,                 -- e.g. WO-GLS-2604-0001
  company         TEXT NOT NULL,
  sales_order_id  TEXT,                              -- FK→ quotations.id (orderNo of the SO)
  client_id       TEXT,
  client_name     TEXT,
  project_name    TEXT,
  description     TEXT,
  status          TEXT DEFAULT 'Open',               -- Open / In-Progress / Completed / Cancelled
  priority        TEXT DEFAULT 'Normal',             -- Low / Normal / Urgent
  planned_start   DATE,
  planned_end     DATE,
  actual_start    DATE,
  actual_end      DATE,
  pieces_total    INT DEFAULT 0,
  pieces_done     INT DEFAULT 0,
  notes           TEXT,
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  data            JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_work_orders_company        ON work_orders(company);
CREATE INDEX IF NOT EXISTS idx_work_orders_sales_order_id ON work_orders(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_status         ON work_orders(company, status);

ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS work_orders_rw      ON work_orders;
DROP POLICY IF EXISTS work_orders_anon_rw ON work_orders;
CREATE POLICY work_orders_rw      ON work_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY work_orders_anon_rw ON work_orders FOR ALL TO anon          USING (true) WITH CHECK (true);
GRANT ALL ON work_orders TO authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────
-- 6.3 — Sales Lead pipeline (CRM Kanban)
--
-- Pre-quotation entry. Once a lead converts to a real quotation, the
-- `converted_quotation_id` column is set and the lead status moves to
-- 'Won'. Lost leads keep `lost_reason` for funnel analysis.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id                      TEXT PRIMARY KEY,           -- e.g. LEAD-GLS-2604-0001
  company                 TEXT NOT NULL,
  name                    TEXT NOT NULL,
  contact_person          TEXT,
  phone                   TEXT,
  email                   TEXT,
  source                  TEXT,                       -- Website / Referral / Walk-in / WhatsApp / etc.
  estimated_value         NUMERIC(15,2) DEFAULT 0,
  stage                   TEXT DEFAULT 'New',         -- New / Contacted / Qualified / Proposal / Negotiation / Won / Lost
  priority                TEXT DEFAULT 'Normal',      -- Low / Normal / High
  next_action             TEXT,
  next_action_date        DATE,
  notes                   TEXT,
  client_id               TEXT,                       -- FK → clients.id once promoted
  converted_quotation_id  TEXT,                       -- FK → quotations.id once a quote is created
  lost_reason             TEXT,
  assigned_to             TEXT,
  created_by              TEXT,
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now(),
  stage_changed_at        TIMESTAMPTZ DEFAULT now(),
  data                    JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_leads_company        ON leads(company);
CREATE INDEX IF NOT EXISTS idx_leads_stage          ON leads(company, stage);
CREATE INDEX IF NOT EXISTS idx_leads_client         ON leads(client_id);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leads_rw      ON leads;
DROP POLICY IF EXISTS leads_anon_rw ON leads;
CREATE POLICY leads_rw      ON leads FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY leads_anon_rw ON leads FOR ALL TO anon          USING (true) WITH CHECK (true);
GRANT ALL ON leads TO authenticated, anon;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────
-- SELECT tablename FROM pg_tables WHERE schemaname='public'
--   AND tablename IN ('price_lists','price_list_items','work_orders','leads');
-- -- expect 4 rows
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name='clients' AND column_name IN ('price_list_id','customer_tier');
-- -- expect 2 rows
-- ═══════════════════════════════════════════════════════════════════════
