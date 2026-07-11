-- ══════════════════════════════════════════════════════════════════════
-- Migration 027 — Replacement Order fields on quotations
--
-- Adds columns to track post-delivery replacement orders linked to
-- original orders. Used when customer reports breakage after DC.
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS order_type          TEXT DEFAULT 'Standard',
  ADD COLUMN IF NOT EXISTS original_order_ref  TEXT,
  ADD COLUMN IF NOT EXISTS replacement_reason  TEXT,
  ADD COLUMN IF NOT EXISTS cost_bearer         TEXT;

-- Index for quick lookup of replacement orders
CREATE INDEX IF NOT EXISTS idx_quotations_order_type
  ON quotations(order_type) WHERE order_type != 'Standard';

CREATE INDEX IF NOT EXISTS idx_quotations_original_ref
  ON quotations(original_order_ref) WHERE original_order_ref IS NOT NULL;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
