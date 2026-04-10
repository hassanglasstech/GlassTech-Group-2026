-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 019 — Phase 9: JV Maker-Checker, BOM Architecture, Barcode Prep
-- Tasks covered:
--   Task 1 — Maker-Checker for Journal Vouchers (ledger table)
--   Task 3 — Bill of Materials (bom_templates + bom_items)
--   Task 4 — Barcode / QR field prep (store_items, production_pieces)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── TASK 1: JV Maker-Checker columns ─────────────────────────────────────────
--
-- A Manual JV (doc_type = 'JV') must pass through a two-person approval chain:
--   1. Maker  → creates Draft JV   → drafted_by = maker email
--   2. Checker → approves JV       → approved_by = checker email (≠ drafted_by)
--
-- The application layer enforces:
--   • Maker cannot approve their own JV (4-eyes principle)
--   • Only finance_manager / super_admin / owner roles can be Checkers
--   • _assertGLBalance() runs at approval time, not at draft time
--   • System-auto JVs (recurring expenses, depreciation) bypass Maker-Checker
--     by setting created_by = 'system-auto'

ALTER TABLE ledger
  ADD COLUMN IF NOT EXISTS drafted_by     TEXT,
  ADD COLUMN IF NOT EXISTS approved_by    TEXT,
  ADD COLUMN IF NOT EXISTS jv_approved_at TIMESTAMPTZ;

COMMENT ON COLUMN ledger.drafted_by
  IS 'Email of the user who created this JV in Draft status (the Maker).';
COMMENT ON COLUMN ledger.approved_by
  IS 'Email of the authorized user who approved and posted this JV (the Checker). Must differ from drafted_by — 4-eyes principle.';
COMMENT ON COLUMN ledger.jv_approved_at
  IS 'UTC timestamp when this JV was approved and its status flipped to Posted.';

-- Partial index: fast lookup of Draft JVs awaiting approval
CREATE INDEX IF NOT EXISTS idx_ledger_jv_pending_approval
  ON ledger (company, drafted_by, status)
  WHERE doc_type = 'JV' AND status = 'Draft';

-- Audit index: all approved JVs by approver
CREATE INDEX IF NOT EXISTS idx_ledger_jv_approved_by
  ON ledger (company, approved_by, jv_approved_at)
  WHERE approved_by IS NOT NULL;


-- ── TASK 3: Bill of Materials — Schema ───────────────────────────────────────
--
-- bom_templates  → one header row per product / SKU / thickness combination
-- bom_items      → raw material / component lines under each template
--
-- MRP explosion (Phase 10+):
--   gross_requirement = demand_sqft × (bom_items.qty_per_unit × (1 + wastage_pct / 100))

CREATE TABLE IF NOT EXISTS bom_templates (
  id            TEXT          PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  company       TEXT          NOT NULL,
  product_code  TEXT          NOT NULL,        -- SKU / product code (matches store product catalogue)
  description   TEXT          NOT NULL,        -- e.g. "6mm Clear Float Glass — Standard Sheet"
  glass_type    TEXT,                           -- Clear, Tinted, Tempered, Reflective, etc.
  thickness_mm  NUMERIC(6,2),                  -- glass thickness in millimetres
  sheet_size_w  NUMERIC(8,2),                  -- standard sheet width in mm
  sheet_size_h  NUMERIC(8,2),                  -- standard sheet height in mm
  uom           TEXT          NOT NULL DEFAULT 'SqFt',
  yield_pct     NUMERIC(5,2)  NOT NULL DEFAULT 100, -- expected yield % (100 = no loss)
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  notes         TEXT,
  created_by    TEXT,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (company, product_code)
);

COMMENT ON TABLE bom_templates IS
  'Bill of Materials header: one row per standard product/SKU per company. '
  'Provides the MRP explosion anchor and landed cost allocation baseline.';

CREATE TABLE IF NOT EXISTS bom_items (
  id              TEXT          PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  bom_template_id TEXT          NOT NULL REFERENCES bom_templates(id) ON DELETE CASCADE,
  company         TEXT          NOT NULL,
  line_no         INT           NOT NULL DEFAULT 1,         -- line display order
  material_id     TEXT,                                      -- FK → store_items.id (nullable for new/unmapped items)
  material_desc   TEXT          NOT NULL,                   -- human-readable: "Silicon Tube 300ml"
  category        TEXT,                                      -- Raw / Hardware / Consumable / Profile / Service
  qty_per_unit    NUMERIC(12,4) NOT NULL DEFAULT 1,          -- quantity required per 1 finished unit
  uom             TEXT          NOT NULL DEFAULT 'Nos',
  wastage_pct     NUMERIC(5,2)  NOT NULL DEFAULT 0,          -- planned process wastage %
  is_optional     BOOLEAN       NOT NULL DEFAULT FALSE,      -- TRUE = advisory, not hard requirement
  cost_per_unit   NUMERIC(14,4) GENERATED ALWAYS AS (NULL) STORED, -- placeholder: computed via MAP in Phase 10
  notes           TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE bom_items IS
  'BOM line items: raw materials and sub-components required to produce one unit '
  'of the parent bom_template product. qty_per_unit × (1 + wastage_pct/100) = '
  'gross material requirement for MRP explosion.';

-- RLS — company-scoped read/write
ALTER TABLE bom_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom_items     ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'company_rls' AND tablename = 'bom_templates'
  ) THEN
    CREATE POLICY "company_rls" ON bom_templates
      FOR ALL USING (company = (SELECT company FROM user_profiles WHERE id = auth.uid()));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'company_rls' AND tablename = 'bom_items'
  ) THEN
    CREATE POLICY "company_rls" ON bom_items
      FOR ALL USING (company = (SELECT company FROM user_profiles WHERE id = auth.uid()));
  END IF;
END$$;

-- Performance indexes for MRP explosion and cost roll-up queries
CREATE INDEX IF NOT EXISTS idx_bom_templates_company_product ON bom_templates (company, product_code);
CREATE INDEX IF NOT EXISTS idx_bom_templates_glass_type      ON bom_templates (company, glass_type, thickness_mm);
CREATE INDEX IF NOT EXISTS idx_bom_items_template            ON bom_items     (bom_template_id);
CREATE INDEX IF NOT EXISTS idx_bom_items_material            ON bom_items     (material_id) WHERE material_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bom_items_company             ON bom_items     (company);


-- ── TASK 4: Barcode / QR preparation ─────────────────────────────────────────
--
-- store_items  → barcode on shelf bin label / QR sticker; scanned at goods receipt
-- production_pieces → barcode on job card and physical glass sticker;
--                     scanned at each shop-floor stage to update piece status

ALTER TABLE store_items
  ADD COLUMN IF NOT EXISTS barcode TEXT;

COMMENT ON COLUMN store_items.barcode IS
  'Barcode or QR string for mobile scanner integration. '
  'Unique per company. Format convention: <COMPANY>-<CATEGORY>-<SEQUENCE>. '
  'Printed on shelf bin label; scanned at GRN and goods issue.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_store_items_barcode_company
  ON store_items (company, barcode)
  WHERE barcode IS NOT NULL;

ALTER TABLE production_pieces
  ADD COLUMN IF NOT EXISTS barcode TEXT;

COMMENT ON COLUMN production_pieces.barcode IS
  'Barcode / QR string printed on the physical job card and attached as a '
  'sticker to the cut glass piece. Scanned at each production stage '
  '(Cut → Edging → Tempering → QA → Warehouse) to update status without '
  'manual data entry on the shop floor.';

CREATE INDEX IF NOT EXISTS idx_production_pieces_barcode
  ON production_pieces (barcode)
  WHERE barcode IS NOT NULL;
