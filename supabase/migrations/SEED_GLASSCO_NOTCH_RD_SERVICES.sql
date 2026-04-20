-- ============================================================
-- Glassco: Seed Notch + R/D (Rough Dhar) + APT service products
--
-- Run in Supabase SQL Editor.
-- Idempotent — safe to run multiple times.
--
-- Rates below are PLACEHOLDERS. Update via UPDATE statements at bottom.
--
-- NOTE: products table uses flat snake_case columns (not data JSONB).
-- Matches asyncSalesService.ts mapping.
-- ============================================================

-- ── Notch (per-count charge — NOT per sqft) ──
-- Logic: holes.length × base_price × qty, applied at line item
INSERT INTO products (
  id, company, category, description, service_nick,
  thickness, unit, base_price, cost_price
)
VALUES (
  'PRD-GLS-SVC-NOTCH', 'Glassco', 'Service',
  'Per-notch charge (charged based on count placed on 2D drawing tab)',
  'Notch', 'all', 'per count', 500, 0
)
ON CONFLICT (id) DO UPDATE SET
  category      = EXCLUDED.category,
  description   = EXCLUDED.description,
  service_nick  = EXCLUDED.service_nick,
  thickness     = EXCLUDED.thickness,
  unit          = EXCLUDED.unit,
  base_price    = EXCLUDED.base_price,
  updated_at    = now();

-- ── R/D (Rough Dhar — per sqft charge) ──
-- Logic: included in pricePerUnit via calculateAutoRate → sqft × rate
INSERT INTO products (
  id, company, category, description, service_nick,
  thickness, unit, base_price, cost_price
)
VALUES (
  'PRD-GLS-SVC-RD', 'Glassco', 'Service',
  'Rough edge finish — per sqft, disabled for tempered glass',
  'R/D', 'all', 'per sqft', 80, 0
)
ON CONFLICT (id) DO UPDATE SET
  category      = EXCLUDED.category,
  description   = EXCLUDED.description,
  service_nick  = EXCLUDED.service_nick,
  thickness     = EXCLUDED.thickness,
  unit          = EXCLUDED.unit,
  base_price    = EXCLUDED.base_price,
  updated_at    = now();

-- ── APT (Anti-Piercing Treatment) ──
-- Logic: per sqft for non-Mirror glass; Mirror glass = Rs 1000/piece flat (handled in GlasscoUtils.ts)
INSERT INTO products (
  id, company, category, description, service_nick,
  thickness, unit, base_price, cost_price
)
VALUES (
  'PRD-GLS-SVC-APT', 'Glassco', 'Service',
  'APT: per sqft on normal glass; Mirror = Rs 1000 per piece flat (overrides per-sqft rate)',
  'APT', 'all', 'per sqft (Mirror: Rs 1000/piece flat)', 150, 0
)
ON CONFLICT (id) DO UPDATE SET
  category      = EXCLUDED.category,
  description   = EXCLUDED.description,
  service_nick  = EXCLUDED.service_nick,
  thickness     = EXCLUDED.thickness,
  unit          = EXCLUDED.unit,
  base_price    = EXCLUDED.base_price,
  updated_at    = now();

-- ── Verify ──
SELECT
  id,
  service_nick,
  category,
  unit,
  base_price AS rate_pkr,
  description
FROM products
WHERE company = 'Glassco'
  AND category = 'Service'
  AND service_nick IN ('Notch', 'R/D', 'APT')
ORDER BY service_nick;

-- ============================================================
-- TO UPDATE RATES LATER (examples):
-- ============================================================
-- UPDATE products SET base_price = 600 WHERE id = 'PRD-GLS-SVC-NOTCH';
-- UPDATE products SET base_price = 100 WHERE id = 'PRD-GLS-SVC-RD';
-- UPDATE products SET base_price = 175 WHERE id = 'PRD-GLS-SVC-APT';
