-- ============================================================
-- Glassco: Seed Notch + R/D (Rough Dhar) + APT service products
--
-- Run in Supabase SQL Editor.
-- Idempotent — safe to run multiple times.
--
-- Columns match asyncSalesService.ts saveProducts() mapping.
-- No data/updated_at/created_at — those don't exist on live table.
-- ============================================================

-- ── Notch (per-count charge — NOT per sqft) ──
INSERT INTO products (id, company, category, description, service_nick, thickness, unit, base_price, cost_price)
VALUES ('PRD-GLS-SVC-NOTCH', 'Glassco', 'Service',
        'Per-notch charge (count placed on 2D drawing tab)',
        'Notch', 'all', 'per count', 500, 0)
ON CONFLICT (id) DO UPDATE SET
  company      = EXCLUDED.company,
  category     = EXCLUDED.category,
  description  = EXCLUDED.description,
  service_nick = EXCLUDED.service_nick,
  thickness    = EXCLUDED.thickness,
  unit         = EXCLUDED.unit,
  base_price   = EXCLUDED.base_price;

-- ── R/D (Rough Dhar — per sqft charge) ──
INSERT INTO products (id, company, category, description, service_nick, thickness, unit, base_price, cost_price)
VALUES ('PRD-GLS-SVC-RD', 'Glassco', 'Service',
        'Rough edge finish — per sqft, disabled for tempered glass',
        'R/D', 'all', 'per sqft', 80, 0)
ON CONFLICT (id) DO UPDATE SET
  company      = EXCLUDED.company,
  category     = EXCLUDED.category,
  description  = EXCLUDED.description,
  service_nick = EXCLUDED.service_nick,
  thickness    = EXCLUDED.thickness,
  unit         = EXCLUDED.unit,
  base_price   = EXCLUDED.base_price;

-- ── APT (Anti-Piercing Treatment) ──
INSERT INTO products (id, company, category, description, service_nick, thickness, unit, base_price, cost_price)
VALUES ('PRD-GLS-SVC-APT', 'Glassco', 'Service',
        'APT: per sqft on normal glass; Mirror = Rs 1000 per piece flat',
        'APT', 'all', 'per sqft', 150, 0)
ON CONFLICT (id) DO UPDATE SET
  company      = EXCLUDED.company,
  category     = EXCLUDED.category,
  description  = EXCLUDED.description,
  service_nick = EXCLUDED.service_nick,
  thickness    = EXCLUDED.thickness,
  unit         = EXCLUDED.unit,
  base_price   = EXCLUDED.base_price;

-- ── Verify ──
SELECT id, service_nick, unit, base_price AS rate_pkr
FROM products
WHERE company = 'Glassco' AND category = 'Service'
  AND service_nick IN ('Notch', 'R/D', 'APT')
ORDER BY service_nick;

-- ============================================================
-- TO UPDATE RATES LATER:
-- UPDATE products SET base_price = 600 WHERE id = 'PRD-GLS-SVC-NOTCH';
-- UPDATE products SET base_price = 100 WHERE id = 'PRD-GLS-SVC-RD';
-- UPDATE products SET base_price = 175 WHERE id = 'PRD-GLS-SVC-APT';
-- ============================================================
