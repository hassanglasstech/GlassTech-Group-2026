-- ════════════════════════════════════════════════════════════════════
-- Nippon Product Image URL Fix — Final
-- Generated: 2026-05-20T21:02:40.281Z
--
-- Root cause of "images not showing":
--   1. Previous SQL set image_url to RELATIVE paths (products/CZS133.png)
--      → browser resolves against Vercel host → 404 broken image
--   2. Wrong bucket name in path — actual files live in 'product-images'
--      bucket at root (no products/ subfolder)
--   3. Some products had image_url for a non-existent bucket
--      ('nippon-products')
--
-- This script:
--   Step 1 — Clears every Nippon product's image_url (clean slate)
--   Step 2 — Sets full Supabase Storage URLs for 51 matched
--             product codes against the real 'product-images' bucket
--   Step 3 — Verification query at the end
--
-- Run in Supabase SQL Editor. Idempotent.
-- ════════════════════════════════════════════════════════════════════

-- Step 1: Reset all Nippon image_urls to NULL
UPDATE products
   SET image_url = NULL,
       updated_at = now()
 WHERE company = 'Nippon';

-- Step 2: Apply correct full URLs (51 codes)
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/A250A1.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-A250A1%'
     OR UPPER(profile_code) = 'A250A1'
     OR UPPER(model_no)     = 'A250A1'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/A250A2.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-A250A2%'
     OR UPPER(profile_code) = 'A250A2'
     OR UPPER(model_no)     = 'A250A2'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/A250A4.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-A250A4%'
     OR UPPER(profile_code) = 'A250A4'
     OR UPPER(model_no)     = 'A250A4'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/ATF11X.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-ATF11X%'
     OR UPPER(profile_code) = 'ATF11X'
     OR UPPER(model_no)     = 'ATF11X'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/BUTT-HINGE.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-BUTT-HINGE%'
     OR UPPER(profile_code) = 'BUTT-HINGE'
     OR UPPER(model_no)     = 'BUTT-HINGE'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/CDG2370-05.jpg',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-CDG2370-05%'
     OR UPPER(profile_code) = 'CDG2370-05'
     OR UPPER(model_no)     = 'CDG2370-05'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/CDG2370-06.jpg',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-CDG2370-06%'
     OR UPPER(profile_code) = 'CDG2370-06'
     OR UPPER(model_no)     = 'CDG2370-06'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/CDG2370A.jpg',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-CDG2370A%'
     OR UPPER(profile_code) = 'CDG2370A'
     OR UPPER(model_no)     = 'CDG2370A'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/CML35G19K19-2A.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-CML35G19K19-2A%'
     OR UPPER(profile_code) = 'CML35G19K19-2A'
     OR UPPER(model_no)     = 'CML35G19K19-2A'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/CZS116AS.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-CZS116AS%'
     OR UPPER(profile_code) = 'CZS116AS'
     OR UPPER(model_no)     = 'CZS116AS'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/CZS133.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-CZS133%'
     OR UPPER(profile_code) = 'CZS133'
     OR UPPER(model_no)     = 'CZS133'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/CZS160A.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-CZS160A%'
     OR UPPER(profile_code) = 'CZS160A'
     OR UPPER(model_no)     = 'CZS160A'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/CZS332.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-CZS332%'
     OR UPPER(profile_code) = 'CZS332'
     OR UPPER(model_no)     = 'CZS332'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/H50-20.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-H50-20%'
     OR UPPER(profile_code) = 'H50-20'
     OR UPPER(model_no)     = 'H50-20'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/H50B.jpg',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-H50B%'
     OR UPPER(profile_code) = 'H50B'
     OR UPPER(model_no)     = 'H50B'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/H52-10-100.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-H52-10-100%'
     OR UPPER(profile_code) = 'H52-10-100'
     OR UPPER(model_no)     = 'H52-10-100'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/H52-12.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-H52-12%'
     OR UPPER(profile_code) = 'H52-12'
     OR UPPER(model_no)     = 'H52-12'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/H52-13.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-H52-13%'
     OR UPPER(profile_code) = 'H52-13'
     OR UPPER(model_no)     = 'H52-13'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/H52A.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-H52A%'
     OR UPPER(profile_code) = 'H52A'
     OR UPPER(model_no)     = 'H52A'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/HC320-16.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-HC320-16%'
     OR UPPER(profile_code) = 'HC320-16'
     OR UPPER(model_no)     = 'HC320-16'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/HC320-18.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-HC320-18%'
     OR UPPER(profile_code) = 'HC320-18'
     OR UPPER(model_no)     = 'HC320-18'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/HCC40A-12.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-HCC40A-12%'
     OR UPPER(profile_code) = 'HCC40A-12'
     OR UPPER(model_no)     = 'HCC40A-12'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/HCC40A-14.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-HCC40A-14%'
     OR UPPER(profile_code) = 'HCC40A-14'
     OR UPPER(model_no)     = 'HCC40A-14'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/HCC40A-16.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-HCC40A-16%'
     OR UPPER(profile_code) = 'HCC40A-16'
     OR UPPER(model_no)     = 'HCC40A-16'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/HDS8.jpg',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-HDS8%'
     OR UPPER(profile_code) = 'HDS8'
     OR UPPER(model_no)     = 'HDS8'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/J5C.jpg',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-J5C%'
     OR UPPER(profile_code) = 'J5C'
     OR UPPER(model_no)     = 'J5C'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/KIL2857-T.jpg',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-KIL2857-T%'
     OR UPPER(profile_code) = 'KIL2857-T'
     OR UPPER(model_no)     = 'KIL2857-T'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/LCJ13.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-LCJ13%'
     OR UPPER(profile_code) = 'LCJ13'
     OR UPPER(model_no)     = 'LCJ13'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/LCZS631.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-LCZS631%'
     OR UPPER(profile_code) = 'LCZS631'
     OR UPPER(model_no)     = 'LCZS631'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/LCZS770.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-LCZS770%'
     OR UPPER(profile_code) = 'LCZS770'
     OR UPPER(model_no)     = 'LCZS770'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/LDG-194.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-LDG-194%'
     OR UPPER(profile_code) = 'LDG-194'
     OR UPPER(model_no)     = 'LDG-194'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/LYHPS40B-R.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-LYHPS40B-R%'
     OR UPPER(profile_code) = 'LYHPS40B-R'
     OR UPPER(model_no)     = 'LYHPS40B-R'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/MCX320A.jpg',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-MCX320A%'
     OR UPPER(profile_code) = 'MCX320A'
     OR UPPER(model_no)     = 'MCX320A'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/N37A.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-N37A%'
     OR UPPER(profile_code) = 'N37A'
     OR UPPER(model_no)     = 'N37A'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/NDHA10BR.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-NDHA10BR%'
     OR UPPER(profile_code) = 'NDHA10BR'
     OR UPPER(model_no)     = 'NDHA10BR'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/SET-MZS208C.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-SET-MZS208C%'
     OR UPPER(profile_code) = 'SET-MZS208C'
     OR UPPER(model_no)     = 'SET-MZS208C'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/SET-MZS220C.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-SET-MZS220C%'
     OR UPPER(profile_code) = 'SET-MZS220C'
     OR UPPER(model_no)     = 'SET-MZS220C'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/SK51.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-SK51%'
     OR UPPER(profile_code) = 'SK51'
     OR UPPER(model_no)     = 'SK51'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/T-FK-D.jpg',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-T-FK-D%'
     OR UPPER(profile_code) = 'T-FK-D'
     OR UPPER(model_no)     = 'T-FK-D'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/T-MJ35.jpg',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-T-MJ35%'
     OR UPPER(profile_code) = 'T-MJ35'
     OR UPPER(model_no)     = 'T-MJ35'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/TLS21HS.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-TLS21HS%'
     OR UPPER(profile_code) = 'TLS21HS'
     OR UPPER(model_no)     = 'TLS21HS'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/TLS22HS.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-TLS22HS%'
     OR UPPER(profile_code) = 'TLS22HS'
     OR UPPER(model_no)     = 'TLS22HS'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/TLS32.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-TLS32%'
     OR UPPER(profile_code) = 'TLS32'
     OR UPPER(model_no)     = 'TLS32'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/Z201.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-Z201%'
     OR UPPER(profile_code) = 'Z201'
     OR UPPER(model_no)     = 'Z201'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/ZA1.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-ZA1%'
     OR UPPER(profile_code) = 'ZA1'
     OR UPPER(model_no)     = 'ZA1'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/ZA1-6A.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-ZA1-6A%'
     OR UPPER(profile_code) = 'ZA1-6A'
     OR UPPER(model_no)     = 'ZA1-6A'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/ZCD-08X54-5.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-ZCD-08X54-5%'
     OR UPPER(profile_code) = 'ZCD-08X54-5'
     OR UPPER(model_no)     = 'ZCD-08X54-5'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/ZCD75X25.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-ZCD75X25%'
     OR UPPER(profile_code) = 'ZCD75X25'
     OR UPPER(model_no)     = 'ZCD75X25'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/ZCD75X40.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-ZCD75X40%'
     OR UPPER(profile_code) = 'ZCD75X40'
     OR UPPER(model_no)     = 'ZCD75X40'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/ZHY622.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-ZHY622%'
     OR UPPER(profile_code) = 'ZHY622'
     OR UPPER(model_no)     = 'ZHY622'
   );
UPDATE products
   SET image_url = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/ZTS218.png',
       updated_at = now()
 WHERE company = 'Nippon'
   AND (
     UPPER(id)           LIKE 'NIP-ZTS218%'
     OR UPPER(profile_code) = 'ZTS218'
     OR UPPER(model_no)     = 'ZTS218'
   );

-- Step 3: Verification
SELECT
  COUNT(*) FILTER (WHERE image_url IS NOT NULL) AS with_image,
  COUNT(*) FILTER (WHERE image_url IS NULL)     AS without_image,
  COUNT(*)                                       AS total
FROM products
WHERE company = 'Nippon';

-- Spot-check: which codes got linked
SELECT id, image_url
  FROM products
 WHERE company = 'Nippon' AND image_url IS NOT NULL
 ORDER BY id
 LIMIT 20;
