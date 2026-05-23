-- ═══════════════════════════════════════════════════════════════════════
-- QUEUED FIXES — Nippon Go-Live (Phase 5 prep)
--
-- Three fixes discovered during the 2026-05-23 KIN LONG IMART verification
-- of product CZS133. Run in order. Each block is independently safe and
-- idempotent — re-running yields the same final state.
--
-- See RESUME_HERE.md ("TODAY'S FINDINGS") for the discovery context.
-- ═══════════════════════════════════════════════════════════════════════


-- ── 1. AUDIT (run first — non-destructive) ─────────────────────────────
-- Confirms how many rows are affected before applying the fixes below.

-- 1a. How many products have the wrong image_url prefix?
SELECT 'image_url_wrong_prefix' AS issue, COUNT(*) AS rows
FROM products
WHERE company = 'Nippon'
  AND image_url LIKE '%/product-images/products/%';
-- Expected: > 0 if the bug exists; 0 means already correct.

-- 1b. How many duplicate profile_codes exist?
SELECT 'duplicate_profile_codes' AS issue, COUNT(*) AS rows
FROM (
  SELECT profile_code
  FROM products
  WHERE company = 'Nippon' AND profile_code IS NOT NULL AND profile_code <> ''
  GROUP BY profile_code
  HAVING COUNT(*) > 1
) AS dupes;
-- > 0 means dedup work pending.

-- 1c. Show duplicate detail (which rows collide?)
SELECT
  profile_code,
  COUNT(*) AS row_count,
  ARRAY_AGG(id) AS ids,
  ARRAY_AGG(DISTINCT model_no) AS distinct_model_nos,
  ARRAY_AGG(DISTINCT material) AS distinct_materials,
  ARRAY_AGG(DISTINCT base_price) AS distinct_prices
FROM products
WHERE company = 'Nippon' AND profile_code IS NOT NULL AND profile_code <> ''
GROUP BY profile_code
HAVING COUNT(*) > 1
ORDER BY row_count DESC, profile_code
LIMIT 50;


-- ── 2. P2 FIX — strip 'products/' prefix from image URLs ───────────────
-- Safe to run multiple times: the WHERE clause matches only rows that
-- still have the wrong prefix.

UPDATE products
SET image_url = REPLACE(image_url, '/product-images/products/', '/product-images/'),
    updated_at = now()
WHERE company = 'Nippon'
  AND image_url LIKE '%/product-images/products/%';

-- Verify after update — should return 0:
SELECT COUNT(*) AS still_wrong
FROM products
WHERE company = 'Nippon'
  AND image_url LIKE '%/product-images/products/%';


-- ── 3. P3 — Material spec enrichment for KIN LONG CZS133 handles ──────
-- Example fix for the single product discovered. The catalogue accuracy
-- backlog is bigger — recommend running a bulk scrape against KIN LONG
-- IMART (Claude in Chrome) for top-50 handles to refresh `material`
-- column. This UPDATE is documented as a pattern.

UPDATE products
SET material = 'Aluminium alloy & Zinc alloy',
    updated_at = now()
WHERE company = 'Nippon'
  AND profile_code IN ('CZS133', 'CZS133-L55')
  AND brand = 'KIN LONG'
  AND (material IS NULL OR material = 'Aluminium alloy');


-- ── 4. P3 — Duplicate detection (DO NOT auto-delete) ──────────────────
-- This block is INTENTIONALLY a SELECT only. Decide on the dedup rule
-- with Hassan before deleting:
--   - Keep the row that has model_no = profile_code (canonical)
--   - Merge other rows' stock + ledger into the canonical row
--   - Delete the duplicates AFTER the merge
-- The merge step is non-trivial — there may be store_items and
-- stock_ledger rows referencing the soon-to-be-deleted ids.

-- Find duplicates that share both profile_code AND base_price (likely
-- true duplicates from the master-update migration, not variants):
SELECT
  profile_code,
  base_price,
  ARRAY_AGG(id ORDER BY id) AS ids,
  ARRAY_AGG(model_no ORDER BY id) AS model_nos
FROM products
WHERE company = 'Nippon' AND profile_code IS NOT NULL
GROUP BY profile_code, base_price
HAVING COUNT(*) > 1
ORDER BY profile_code;

-- For each id slated for deletion, FIRST check downstream references:
-- SELECT id FROM store_items WHERE id IN ('<duplicate-id>');
-- SELECT COUNT(*) FROM stock_ledger WHERE material_id IN ('<duplicate-id>');
-- Then either re-point them to the canonical id, or skip deletion.
