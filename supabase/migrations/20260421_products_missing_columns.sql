-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 20260421_products_missing_columns.sql
-- Purpose:   Add all columns that asyncSalesService.saveProducts() writes
--            but are missing from the products table → fixes 400 Bad Request
-- Safe:      All ADD COLUMN IF NOT EXISTS — idempotent, safe to re-run
-- ═══════════════════════════════════════════════════════════════════════════

-- Glass-specific columns
ALTER TABLE products ADD COLUMN IF NOT EXISTS glass_type          TEXT         DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS sub_category        TEXT         DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS tempering_price     NUMERIC      DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS finish_color        TEXT         DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS sheet_size          TEXT         DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS thickness           TEXT         DEFAULT '';

-- Aluminium profile / window-door columns
ALTER TABLE products ADD COLUMN IF NOT EXISTS profile_code        TEXT         DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS main_category       TEXT         DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS direction           TEXT         DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS tongue_length       TEXT         DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS spindle_length      TEXT         DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS frame_color         TEXT         DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS mesh_color          TEXT         DEFAULT '';

-- General item columns
ALTER TABLE products ADD COLUMN IF NOT EXISTS service_nick        TEXT         DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS model_no            TEXT         DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand               TEXT         DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS material            TEXT         DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url           TEXT         DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS width               NUMERIC      DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS height              NUMERIC      DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price          NUMERIC      DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS base_price          NUMERIC      DEFAULT 0;

-- Boolean / JSONB columns
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_set              BOOLEAN      DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS set_components      JSONB        DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS technical_specs     JSONB        DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS variants            JSONB        DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_history       JSONB        DEFAULT '[]';

-- Trade / compliance
ALTER TABLE products ADD COLUMN IF NOT EXISTS hs_code             TEXT         DEFAULT '';

-- Timestamps
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ  DEFAULT now();
ALTER TABLE products ADD COLUMN IF NOT EXISTS created_at          TIMESTAMPTZ  DEFAULT now();

-- ── Grants ────────────────────────────────────────────────────────────────
GRANT ALL ON products TO anon, authenticated;

-- ── Reload PostgREST schema cache ────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
