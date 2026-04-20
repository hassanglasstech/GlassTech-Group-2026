-- ============================================================
-- Glassco: Seed Notch + R/D (Rough Dhar) service products
--
-- Run in Supabase SQL Editor.
-- Idempotent — safe to run multiple times.
--
-- Rates below are PLACEHOLDERS. Update them to actual Glassco
-- rates before go-live using UPDATE statements at the bottom.
-- ============================================================

-- ── Notch (per-count charge — NOT per sqft) ──
-- Logic: holes.length × basePrice × qty, applied at line item
INSERT INTO products (id, company, data, updated_at, created_at)
VALUES (
  'PRD-GLS-SVC-NOTCH',
  'Glassco',
  jsonb_build_object(
    'id', 'PRD-GLS-SVC-NOTCH',
    'company', 'Glassco',
    'name', 'Notch Cutting',
    'category', 'Service',
    'serviceNick', 'Notch',
    'thickness', 'all',
    'unit', 'per count',
    'basePrice', 500,
    'active', true,
    'description', 'Per-notch charge (charged based on count placed on 2D drawing tab)'
  ),
  now(), now()
)
ON CONFLICT (id) DO UPDATE SET
  data = products.data || EXCLUDED.data,
  updated_at = now();

-- ── R/D (Rough Dhar — per sqft charge) ──
-- Logic: included in pricePerUnit via calculateAutoRate → sqft × rate
INSERT INTO products (id, company, data, updated_at, created_at)
VALUES (
  'PRD-GLS-SVC-RD',
  'Glassco',
  jsonb_build_object(
    'id', 'PRD-GLS-SVC-RD',
    'company', 'Glassco',
    'name', 'Rough Dhar (R/D)',
    'category', 'Service',
    'serviceNick', 'R/D',
    'thickness', 'all',
    'unit', 'per sqft',
    'basePrice', 80,
    'active', true,
    'description', 'Rough edge finish — per sqft, disabled for tempered glass'
  ),
  now(), now()
)
ON CONFLICT (id) DO UPDATE SET
  data = products.data || EXCLUDED.data,
  updated_at = now();

-- ── APT (for reference — verify existing record) ──
-- Logic: per sqft for non-Mirror glass; Mirror glass = Rs 1000/piece flat (handled in code)
INSERT INTO products (id, company, data, updated_at, created_at)
VALUES (
  'PRD-GLS-SVC-APT',
  'Glassco',
  jsonb_build_object(
    'id', 'PRD-GLS-SVC-APT',
    'company', 'Glassco',
    'name', 'Anti-Piercing Treatment (APT)',
    'category', 'Service',
    'serviceNick', 'APT',
    'thickness', 'all',
    'unit', 'per sqft (Mirror: Rs 1000/piece flat)',
    'basePrice', 150,
    'active', true,
    'description', 'APT: per sqft on normal glass; Mirror = Rs 1000 per piece flat (overrides per-sqft rate)'
  ),
  now(), now()
)
ON CONFLICT (id) DO UPDATE SET
  data = products.data || EXCLUDED.data,
  updated_at = now();

-- ── Verify ──
SELECT
  id,
  data->>'name' AS name,
  data->>'serviceNick' AS service_nick,
  data->>'unit' AS unit,
  (data->>'basePrice')::numeric AS rate_pkr,
  data->>'active' AS active
FROM products
WHERE company = 'Glassco'
  AND data->>'category' = 'Service'
  AND data->>'serviceNick' IN ('Notch', 'R/D', 'APT')
ORDER BY data->>'serviceNick';

-- ============================================================
-- TO UPDATE RATES AFTER SEED (example):
-- ============================================================
-- UPDATE products SET data = jsonb_set(data, '{basePrice}', '600'::jsonb)
--   WHERE id = 'PRD-GLS-SVC-NOTCH';
-- UPDATE products SET data = jsonb_set(data, '{basePrice}', '100'::jsonb)
--   WHERE id = 'PRD-GLS-SVC-RD';
