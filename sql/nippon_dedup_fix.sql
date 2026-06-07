-- ============================================================
-- NIPPON: Product Master ↔ Stock Sync + Dedup Fix
-- Run in Supabase SQL Editor (Dashboard → SQL Editor)
-- Safe to run multiple times (idempotent)
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- STEP 0: AUDIT — run these first to see what's wrong
-- ──────────────────────────────────────────────────────────

-- 0-A: Total Nippon products
SELECT COUNT(*) AS total_products FROM products WHERE company = 'Nippon';

-- 0-B: Total Nippon stock entries
SELECT COUNT(*) AS total_store_items FROM store_items WHERE company = 'Nippon';

-- 0-C: Duplicate products — same model_no appearing more than once
SELECT
  model_no,
  COUNT(*) AS duplicates,
  array_agg(id ORDER BY created_at DESC) AS ids,
  array_agg(image_url ORDER BY created_at DESC) AS image_urls
FROM products
WHERE company = 'Nippon'
  AND model_no IS NOT NULL
  AND model_no <> ''
GROUP BY model_no
HAVING COUNT(*) > 1
ORDER BY duplicates DESC;

-- 0-D: Products with NO stock entry (in products but not in store_items)
SELECT p.id, p.model_no, p.description, p.brand
FROM products p
LEFT JOIN store_items s ON s.id = p.id AND s.company = 'Nippon'
WHERE p.company = 'Nippon'
  AND s.id IS NULL
ORDER BY p.brand, p.model_no;

-- 0-E: Orphaned stock entries (in store_items but no product)
SELECT s.id, s.name, s.quantity, s.moving_average_price
FROM store_items s
LEFT JOIN products p ON p.id = s.id AND p.company = 'Nippon'
WHERE s.company = 'Nippon'
  AND p.id IS NULL
  AND s.id NOT LIKE '%-SUB-%'   -- exclude set sub-components
ORDER BY s.name;


-- ──────────────────────────────────────────────────────────
-- STEP 1: FIX DUPLICATES
-- Keep the newest row per model_no (latest created_at).
-- If one has an image_url and the other doesn't, keep the
-- one with the image regardless of age.
-- ──────────────────────────────────────────────────────────

-- 1-A: Find the "keeper" id per model_no
-- Priority: has image_url > most recent created_at
WITH ranked AS (
  SELECT
    id,
    model_no,
    image_url,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY model_no
      ORDER BY
        CASE WHEN image_url IS NOT NULL AND image_url <> '' THEN 0 ELSE 1 END,
        created_at DESC
    ) AS rn
  FROM products
  WHERE company = 'Nippon'
    AND model_no IS NOT NULL
    AND model_no <> ''
),
keepers AS (
  SELECT id FROM ranked WHERE rn = 1
),
dupes AS (
  SELECT id FROM ranked WHERE rn > 1
)

-- Preview what will be deleted (run this SELECT before the DELETE below):
SELECT
  p.id,
  p.model_no,
  p.description,
  p.created_at,
  CASE WHEN p.image_url <> '' THEN 'has-image' ELSE 'no-image' END AS img_status,
  'WILL DELETE' AS action
FROM products p
JOIN dupes d ON d.id = p.id
ORDER BY p.model_no, p.created_at;

-- 1-B: Move stock qty from duplicate to keeper before deletion
-- (so we don't lose any received stock)
-- Run AFTER reviewing the preview above.
WITH ranked AS (
  SELECT
    id, model_no,
    ROW_NUMBER() OVER (
      PARTITION BY model_no
      ORDER BY
        CASE WHEN image_url IS NOT NULL AND image_url <> '' THEN 0 ELSE 1 END,
        created_at DESC
    ) AS rn
  FROM products WHERE company = 'Nippon' AND model_no IS NOT NULL AND model_no <> ''
),
keepers AS (SELECT id, model_no FROM ranked WHERE rn = 1),
dupes   AS (SELECT id, model_no FROM ranked WHERE rn > 1)

UPDATE store_items si_dupe
SET
  -- add the dupe's qty onto the keeper's entry
  quantity          = si_keeper.quantity          + COALESCE(si_dupe.quantity, 0),
  unrestricted_qty  = si_keeper.unrestricted_qty  + COALESCE(si_dupe.unrestricted_qty, 0),
  total_value       = si_keeper.total_value       + COALESCE(si_dupe.total_value, 0)
FROM dupes d
JOIN keepers k ON k.model_no = d.model_no
JOIN store_items si_keeper ON si_keeper.id = k.id AND si_keeper.company = 'Nippon'
WHERE si_dupe.id = d.id
  AND si_dupe.company = 'Nippon';

-- 1-C: Delete duplicate store_items (the non-keepers)
WITH ranked AS (
  SELECT
    id, model_no,
    ROW_NUMBER() OVER (
      PARTITION BY model_no
      ORDER BY
        CASE WHEN image_url IS NOT NULL AND image_url <> '' THEN 0 ELSE 1 END,
        created_at DESC
    ) AS rn
  FROM products WHERE company = 'Nippon' AND model_no IS NOT NULL AND model_no <> ''
),
dupes AS (SELECT id FROM ranked WHERE rn > 1)

DELETE FROM store_items
WHERE id IN (SELECT id FROM dupes)
  AND company = 'Nippon';

-- 1-D: Delete duplicate products (the non-keepers)
WITH ranked AS (
  SELECT
    id, model_no,
    ROW_NUMBER() OVER (
      PARTITION BY model_no
      ORDER BY
        CASE WHEN image_url IS NOT NULL AND image_url <> '' THEN 0 ELSE 1 END,
        created_at DESC
    ) AS rn
  FROM products WHERE company = 'Nippon' AND model_no IS NOT NULL AND model_no <> ''
),
dupes AS (SELECT id FROM ranked WHERE rn > 1)

DELETE FROM products
WHERE id IN (SELECT id FROM dupes)
  AND company = 'Nippon';


-- ──────────────────────────────────────────────────────────
-- STEP 2: CREATE MISSING STOCK ENTRIES
-- Products in Product Master that have no store_items row
-- (common after bulk Excel import — import only saves to
-- products table, not store_items)
-- ──────────────────────────────────────────────────────────

INSERT INTO store_items (
  id, company, name, category, quantity, unrestricted_qty,
  qi_qty, blocked_qty, reserved_qty,
  unit, moving_average_price, total_value,
  storage_bin, last_movement_date, min_level, reorder_point,
  per_sheet_weight_kg, per_sqft_weight_kg
)
SELECT
  p.id,
  'Nippon',
  p.description,
  p.category,
  0,   -- quantity
  0,   -- unrestricted_qty
  0,   -- qi_qty
  0,   -- blocked_qty
  0,   -- reserved_qty
  COALESCE(NULLIF(p.unit, ''), 'PCS'),
  COALESCE(p.cost_price, 0),  -- moving_average_price = cost price
  0,   -- total_value
  'Main Warehouse',
  NOW(),
  10,  -- min_level
  5,   -- reorder_point
  0,
  0
FROM products p
LEFT JOIN store_items s ON s.id = p.id AND s.company = 'Nippon'
WHERE p.company = 'Nippon'
  AND s.id IS NULL
ON CONFLICT (id) DO NOTHING;


-- ──────────────────────────────────────────────────────────
-- STEP 3: CLEAN UP ORPHANED STORE ITEMS
-- Store entries with no matching product AND zero stock.
-- (If qty > 0 we keep them — they have received goods.)
-- ──────────────────────────────────────────────────────────

-- Preview first:
SELECT s.id, s.name, s.quantity, s.moving_average_price
FROM store_items s
LEFT JOIN products p ON p.id = s.id AND p.company = 'Nippon'
WHERE s.company = 'Nippon'
  AND p.id IS NULL
  AND s.id NOT LIKE '%-SUB-%'
  AND (s.quantity = 0 OR s.quantity IS NULL);

-- Delete zero-stock orphans:
DELETE FROM store_items
WHERE company = 'Nippon'
  AND id NOT LIKE '%-SUB-%'
  AND (quantity = 0 OR quantity IS NULL)
  AND id NOT IN (SELECT id FROM products WHERE company = 'Nippon');


-- ──────────────────────────────────────────────────────────
-- STEP 4: VERIFY — counts should match after fix
-- ──────────────────────────────────────────────────────────

SELECT
  (SELECT COUNT(*) FROM products    WHERE company = 'Nippon') AS products_count,
  (SELECT COUNT(*) FROM store_items WHERE company = 'Nippon'
     AND id NOT LIKE '%-SUB-%')                               AS store_items_count,
  (SELECT COUNT(*) FROM products p
   LEFT JOIN store_items s ON s.id = p.id AND s.company = 'Nippon'
   WHERE p.company = 'Nippon' AND s.id IS NULL)               AS products_missing_stock,
  (SELECT COUNT(*) FROM store_items s
   LEFT JOIN products p ON p.id = s.id AND p.company = 'Nippon'
   WHERE s.company = 'Nippon' AND p.id IS NULL
     AND s.id NOT LIKE '%-SUB-%')                             AS orphaned_store_items;
