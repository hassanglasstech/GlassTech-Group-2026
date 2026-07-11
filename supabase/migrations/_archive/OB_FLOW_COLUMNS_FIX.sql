-- ============================================================
-- OB Flow Fix — Add missing columns for Opening Balance
-- Run this in Supabase SQL Editor
-- ============================================================

-- ── ledger table: missing columns that financeService.ts writes ──
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS date         TEXT;
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS status       TEXT DEFAULT 'Posted';
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS details      JSONB DEFAULT '[]';
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS data         JSONB DEFAULT '{}';
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS drafted_by   TEXT;
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS approved_by  TEXT;
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS jv_approved_at TIMESTAMPTZ;
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS updated_by   TEXT;
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS posted_at    TIMESTAMPTZ;
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ DEFAULT now();

-- ── accounts table: is_active missing (ensureAccount may create null) ──
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS is_active      BOOLEAN DEFAULT true;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS balance        NUMERIC DEFAULT 0;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS normal_balance TEXT DEFAULT 'Debit';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ DEFAULT now();

-- Set is_active = true for all existing accounts
UPDATE accounts SET is_active = true WHERE is_active IS NULL;

-- ── stock_ledger table: code uses different column names than old schema ──
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS timestamp        TIMESTAMPTZ DEFAULT now();
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS mvmnt_code       TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS qty              NUMERIC DEFAULT 0;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS valuation        NUMERIC DEFAULT 0;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS balance_after    NUMERIC DEFAULT 0;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS reference_doc    TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS "user"           TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS remarks          TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS storage_bin      TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS batch_no         TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS hu_id            TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS project_id       TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS dc_no            TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS bilty_no         TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS bilty_freight_pkr   NUMERIC DEFAULT 0;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS vendor_so_no     TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS vehicle_no       TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS driver_name      TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS driver_phone     TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS freight_type     TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS freight_pkr      NUMERIC DEFAULT 0;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS other_charges_pkr  NUMERIC DEFAULT 0;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS other_charges_desc TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS line_weight_kg   NUMERIC DEFAULT 0;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS bilty_weight_kg  NUMERIC DEFAULT 0;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS per_sheet_weight_kg NUMERIC DEFAULT 0;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS per_sqft_weight_kg  NUMERIC DEFAULT 0;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS vendor_id        TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS vendor_name      TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS po_id            TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS sheet_count      INTEGER DEFAULT 0;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS glass_category   TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS sheet_tags       JSONB DEFAULT '[]';
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS sheet_tag_meta   JSONB DEFAULT '{}';
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS reversal_of      TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS is_reversal      BOOLEAN DEFAULT false;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS reversal_reason  TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ DEFAULT now();

-- ── Grant access (RLS disabled but grants needed for anon key) ──
GRANT ALL ON ledger      TO anon, authenticated;
GRANT ALL ON accounts    TO anon, authenticated;
GRANT ALL ON stock_ledger TO anon, authenticated;
GRANT ALL ON store_items  TO anon, authenticated;

SELECT 'OB flow columns added. Ready for data entry.' AS status;
