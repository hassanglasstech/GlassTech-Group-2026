-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 20260421_products_missing_columns.sql
-- Purpose:   Add all columns that asyncSalesService.saveProducts() writes.
--            Columns are grouped by which company actually uses them.
--            Safe: ADD COLUMN IF NOT EXISTS — idempotent, re-runnable.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Core columns (every company) ─────────────────────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS base_price      NUMERIC  DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price      NUMERIC  DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sub_category    TEXT     DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS model_no        TEXT     DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand           TEXT     DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url       TEXT     DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS variants        JSONB    DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_history   JSONB    DEFAULT '[]';

-- ── Glass / Glassco columns ───────────────────────────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS glass_type      TEXT     DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS thickness       TEXT     DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS sheet_size      TEXT     DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS finish_color    TEXT     DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS tempering_price NUMERIC  DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS width           NUMERIC  DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS height          NUMERIC  DEFAULT 0;

-- ── Service nick (Glassco services) ──────────────────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS service_nick    TEXT     DEFAULT '';

-- ── Aluminium profile columns (GTK / GTI) ────────────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS profile_code    TEXT     DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS main_category   TEXT     DEFAULT '';

-- ── Nippon-only hardware columns ──────────────────────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS material        TEXT     DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS direction       TEXT     DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS tongue_length   TEXT     DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS spindle_length  TEXT     DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS frame_color     TEXT     DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS mesh_color      TEXT     DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS hs_code         TEXT     DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_set          BOOLEAN  DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS set_components  JSONB    DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS technical_specs JSONB    DEFAULT '{}';

-- ── Timestamps ────────────────────────────────────────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS created_at      TIMESTAMPTZ DEFAULT now();
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT now();

-- ── Grants + schema cache reload ─────────────────────────────────────────
GRANT ALL ON products TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
