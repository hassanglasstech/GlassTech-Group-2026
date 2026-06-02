-- ============================================================
-- Opening Balance Persistence Fix — 20260434
--
-- Root cause: opening balance save partially fails because Supabase
-- rejects rows for missing columns. warmCache() on next login then
-- fetches empty tables and overwrites localStorage → data "disappears".
--
-- This migration ensures every column that ledgerToRow, storeItemToRow,
-- stockLedgerToRow, productToRow write actually exists in Supabase.
-- ============================================================

-- ══════════════════════════════════════════════════════════════
-- LEDGER (GL) — every column ledgerToRow writes
-- ══════════════════════════════════════════════════════════════
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS id            TEXT;
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS company       TEXT;
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS doc_type      TEXT;
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS doc_date      TEXT;
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS date          TEXT;
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS description   TEXT;
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS reference_id  TEXT;
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS status        TEXT;
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS details       JSONB DEFAULT '[]';
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS data          JSONB DEFAULT '{}';
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS drafted_by    TEXT;
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS approved_by   TEXT;
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS jv_approved_at TIMESTAMPTZ;
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS created_by    TEXT;
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS updated_by    TEXT;
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS posted_at     TIMESTAMPTZ;
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ DEFAULT now();

-- ══════════════════════════════════════════════════════════════
-- STORE_ITEMS — every column saveStore writes
-- ══════════════════════════════════════════════════════════════
ALTER TABLE store_items ADD COLUMN IF NOT EXISTS id                   TEXT;
ALTER TABLE store_items ADD COLUMN IF NOT EXISTS company              TEXT;
ALTER TABLE store_items ADD COLUMN IF NOT EXISTS name                 TEXT;
ALTER TABLE store_items ADD COLUMN IF NOT EXISTS category             TEXT;
ALTER TABLE store_items ADD COLUMN IF NOT EXISTS quantity             NUMERIC DEFAULT 0;
ALTER TABLE store_items ADD COLUMN IF NOT EXISTS unrestricted_qty     NUMERIC DEFAULT 0;
ALTER TABLE store_items ADD COLUMN IF NOT EXISTS qi_qty               NUMERIC DEFAULT 0;
ALTER TABLE store_items ADD COLUMN IF NOT EXISTS blocked_qty          NUMERIC DEFAULT 0;
ALTER TABLE store_items ADD COLUMN IF NOT EXISTS reserved_qty         NUMERIC DEFAULT 0;
ALTER TABLE store_items ADD COLUMN IF NOT EXISTS unit                 TEXT;
ALTER TABLE store_items ADD COLUMN IF NOT EXISTS moving_average_price NUMERIC DEFAULT 0;
ALTER TABLE store_items ADD COLUMN IF NOT EXISTS total_value          NUMERIC DEFAULT 0;
ALTER TABLE store_items ADD COLUMN IF NOT EXISTS storage_bin          TEXT;
ALTER TABLE store_items ADD COLUMN IF NOT EXISTS last_movement_date   TEXT;
ALTER TABLE store_items ADD COLUMN IF NOT EXISTS min_level            NUMERIC DEFAULT 0;
ALTER TABLE store_items ADD COLUMN IF NOT EXISTS reorder_point        NUMERIC DEFAULT 0;
ALTER TABLE store_items ADD COLUMN IF NOT EXISTS per_sheet_weight_kg  NUMERIC DEFAULT 0;
ALTER TABLE store_items ADD COLUMN IF NOT EXISTS per_sqft_weight_kg   NUMERIC DEFAULT 0;

-- ══════════════════════════════════════════════════════════════
-- STOCK_LEDGER — every column saveStockLedger writes
-- ══════════════════════════════════════════════════════════════
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS id                  TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS company             TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS material_id         TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS timestamp           TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS mvmnt_code          TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS qty                 NUMERIC DEFAULT 0;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS uom                 TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS valuation           NUMERIC DEFAULT 0;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS balance_after       NUMERIC DEFAULT 0;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS reference_doc       TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS "user"              TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS remarks             TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS storage_bin         TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS batch_no            TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS hu_id               TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS project_id          TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS dc_no               TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS bilty_no            TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS bilty_freight_pkr   NUMERIC DEFAULT 0;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS vendor_so_no        TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS vehicle_no          TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS driver_name         TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS driver_phone        TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS freight_type        TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS freight_pkr         NUMERIC DEFAULT 0;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS other_charges_pkr   NUMERIC DEFAULT 0;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS other_charges_desc  TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS line_weight_kg      NUMERIC DEFAULT 0;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS bilty_weight_kg     NUMERIC DEFAULT 0;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS per_sheet_weight_kg NUMERIC DEFAULT 0;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS per_sqft_weight_kg  NUMERIC DEFAULT 0;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS vendor_id           TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS vendor_name         TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS po_id               TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS sheet_count         NUMERIC DEFAULT 0;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS glass_category      TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS sheet_tags          JSONB DEFAULT '[]';
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS sheet_tag_meta      JSONB;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS reversal_of         TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS is_reversal         BOOLEAN DEFAULT false;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS reversal_reason     TEXT;

-- ══════════════════════════════════════════════════════════════
-- PRODUCTS — every column saveProducts writes
-- ══════════════════════════════════════════════════════════════
ALTER TABLE products ADD COLUMN IF NOT EXISTS id             TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS company        TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS category       TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS description    TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS service_nick   TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS profile_code   TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS thickness      TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sheet_size     TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price     NUMERIC DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS base_price     NUMERIC DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit           TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS variants       JSONB DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS model_no       TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand          TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS main_category  TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sub_category   TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS finish_color   TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS material       TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS direction      TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS tongue_length  TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS spindle_length TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url      TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS hs_code        TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_set         BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS glass_type     TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS system_sub_class TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS profile_role   TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS technical_specs JSONB DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ DEFAULT now();

-- ══════════════════════════════════════════════════════════════
-- GRANTs and schema cache reload
-- ══════════════════════════════════════════════════════════════
GRANT ALL ON ledger       TO anon, authenticated;
GRANT ALL ON store_items  TO anon, authenticated;
GRANT ALL ON stock_ledger TO anon, authenticated;
GRANT ALL ON products     TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

SELECT 'Opening balance persistence columns ready.' AS status;
