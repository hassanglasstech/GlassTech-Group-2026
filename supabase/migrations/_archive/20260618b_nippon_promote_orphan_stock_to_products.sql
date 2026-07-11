-- ════════════════════════════════════════════════════════════════════
-- Nippon: promote ORPHAN stock rows into the product master
-- Generated: 2026-06-18
--
-- Problem: some store_items have no matching product (orphans). They show in
-- Stock as "No product link" but can't be opened in Material Master, so they
-- can't be edited or categorised.
--
-- This creates a product for every such orphan (same id, so they link up), under
-- main_category 'Uncategorized'. After running, open Material Master → filter by
-- "Uncategorized" → set the real Material Group on the ones you keep, and delete
-- the junk. Their stock balances stay intact and are now properly linked.
--
-- Non-destructive: only INSERTs products that don't already exist. Re-runnable.
-- Run in Supabase SQL Editor.
-- ════════════════════════════════════════════════════════════════════

-- OPTIONAL — preview what will be promoted before inserting:
--   SELECT s.id, s.name, s.unit, s.quantity, s.moving_average_price
--   FROM store_items s
--   WHERE s.company = 'Nippon'
--     AND NOT EXISTS (SELECT 1 FROM products p WHERE p.id = s.id);

INSERT INTO products (
  id, company, description, model_no, profile_code,
  category, main_category, sub_category,
  unit, cost_price, base_price, image_url, active
)
SELECT
  s.id,
  'Nippon',
  COALESCE(NULLIF(TRIM(s.name), ''), s.id),          -- description
  s.id,                                              -- model_no (orphan id = its code)
  '',                                                -- profile_code
  COALESCE(NULLIF(TRIM(s.category), ''), 'Hardware'),-- category
  -- Best-effort Material Group from the item name (8 v3 groups). Whatever doesn't
  -- match a keyword falls to 'Uncategorized' so it still appears in the list.
  CASE
    WHEN s.name ~* '\yhandle\y'                                              THEN 'Handles'
    WHEN s.name ~* '\y(hinge|pivot|friction|stay|pegstay)\y'                 THEN 'Hinges & Stays'
    WHEN s.name ~* '\y(floor spring|door closer|closer)\y'                   THEN 'Door Closing'
    WHEN s.name ~* '\y(silicone|silicon|sealant|butyl|weatherstrip|gasket)\y' THEN 'Sealants'
    WHEN s.name ~* '\y(roller|wheel|sliding|slide|lift)\y'                   THEN 'Sliding & Lift System'
    WHEN s.name ~* '\y(lock|cylinder|latch|strike|crescent|cockspur|bolt)\y' THEN 'Locking System'
    WHEN s.name ~* '\y(screw|fastener|mesh|jali|tape|strip)\y'               THEN 'Fasteners & Consumables'
    WHEN s.name ~* '\y(profile|spider|routel|rod|transmission|bar|connector|block|cap|pin|socket)\y' THEN 'Profiles & Point-Fixing'
    ELSE 'Uncategorized'
  END,                                               -- main_category (best-effort)
  '',                                                -- sub_category
  COALESCE(NULLIF(TRIM(s.unit), ''), 'PCS'),         -- unit
  COALESCE(s.moving_average_price, 0),               -- cost_price
  COALESCE(s.moving_average_price, 0),               -- base_price
  '',                                                -- image_url
  true                                               -- active
FROM store_items s
WHERE s.company = 'Nippon'
  AND NOT EXISTS (SELECT 1 FROM products p WHERE p.id = s.id);

NOTIFY pgrst, 'reload schema';

-- Verify:  SELECT count(*) FROM products WHERE company='Nippon' AND main_category='Uncategorized';
