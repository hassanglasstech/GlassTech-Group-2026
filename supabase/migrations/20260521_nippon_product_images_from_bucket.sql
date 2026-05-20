-- ═══════════════════════════════════════════════════════════════════
-- 20260521_nippon_product_images_from_bucket.sql
-- Route already-uploaded images in the 'product-images' Supabase bucket
-- to Nippon products by matching item codes from Quotation-20250402.pdf
-- (KIN LONG hardware catalogue) against products.profile_code / model_no / id.
--
-- Naming convention discovered: NIP-{ITEM_CODE}{_variant_suffix}.{ext}
--   e.g. NIP-CZS133_Black.png, NIP-LCZS631_L.png
--
-- Two-pass strategy:
--   Pass 1 — variant-aware: filenames with _Black / _White / _L / _R match
--            products whose description/finish_color contains the variant token.
--   Pass 2 — fallback: any product still missing an image gets the default
--            (alphabetically first) file for that code.
--
-- Idempotent: only writes when image_url is NULL or empty. Re-running is safe.
-- ═══════════════════════════════════════════════════════════════════

DO $nippon_images$
DECLARE
  base_url TEXT := 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/';
  rec      RECORD;
  pass1_n  INT := 0;
  pass2_n  INT := 0;
  rc       INT;
BEGIN
  -- ── Image catalogue: (code, variant_tokens, filename, priority) ────
  -- variant_tokens is a space-separated lowercase list; an empty string
  -- means "no variant constraint". Priority is used to pick the default
  -- file in pass 2 (lower = preferred).
  CREATE TEMP TABLE _nip_img (
    code     TEXT,
    variants TEXT,
    fname    TEXT,
    pri      INT
  ) ON COMMIT DROP;

  INSERT INTO _nip_img(code, variants, fname, pri) VALUES
    ('AQS10',         '',             'NIP-AQS10.png',                1),
    ('CDG2370-05',    '',             'NIP-CDG2370-05G23.jpeg',       1),
    ('CDG2370-06',    '',             'NIP-CDG2370-06G19_5.jpeg',     1),
    ('CML35G19',      '',             'NIP-CML35G19K19_2A.png',       1),
    ('K19.2A',        '',             'NIP-CML35G19K19_2A.png',       1),
    ('CZS100-06C-34', '',             'NIP-CZS100-06C-34.png',        1),
    ('CZS116AS',      'black',        'NIP-CZS116AS_Black.png',       1),
    ('CZS120AL55',    '',             'NIP-CZS120AL55.png',           1),
    ('CZS133',        'black',        'NIP-CZS133_Black.png',         1),
    ('CZS133',        'white',        'NIP-CZS133_White.png',         2),
    ('CZS160A',       'black',        'NIP-CZS160A_Black.png',        1),
    ('CZS160A',       'white',        'NIP-CZS160A_White.png',        2),
    ('CZS332',        'black',        'NIP-CZS332_Black.png',         1),
    ('CZS631-06-34',  '',             'NIP-CZS631-06-34.png',         1),
    ('FSG-01',        '',             'NIP-FSG-01.png',               1),
    ('FSP10',         '',             'NIP-FSP10.png',                1),
    ('FWG10A',        '',             'NIP-FWG10A.png',               1),
    ('H52-10-100',    '',             'NIP-H52-10-100.png',           1),
    ('J5C',           'black right',  'NIP-J5C_Black_R.jpeg',         1),
    ('KIL2857',       '',             'NIP-KIL2857.jpeg',             1),
    ('KIL2857/T',     '',             'NIP-KIL2857.jpeg',             1),
    ('LCDG41',        '',             'NIP-LCDG41.png',               1),
    ('LCJ13',         'black',        'NIP-LCJ13_Black.png',          1),
    ('LCZS38-L24',    '',             'NIP-LCZS38-L24.png',           1),
    ('LCZS631',       'black right',  'NIP-LCZS631_Black_R.png',      1),
    ('LCZS631',       'left',         'NIP-LCZS631_L.png',            2),
    ('LDG-194',       '',             'NIP-LDG-194_HW_.png',          1),
    ('LN56',          '',             'NIP-LN56.jpeg',                1),
    ('LN57',          '',             'NIP-LN57.png',                 1),
    ('LPX14A-16',     '',             'NIP-LPX14A-16.png',            1),
    ('LPX30A',        '',             'NIP-LPX30A.png',               1),
    ('LYHDX40B',      'right',        'NIP-LYHDX40B-R.png',           1),
    ('LZA4',          '',             'NIP-LZA4.png',                 1),
    ('LZB5',          '',             'NIP-LZB5.png',                 1),
    ('LZCK05',        '',             'NIP-LZCK05.jpeg',              1),
    ('N31',           '',             'NIP-N31.png',                  1),
    ('N33A',          '',             'NIP-N33A.png',                 1),
    ('N37A',          '',             'NIP-N37A.png',                 1),
    ('N39',           '',             'NIP-N39.png',                  1),
    ('N50',           '',             'NIP-N50.png',                  1),
    ('NDHB10BR',      '',             'NIP-NDHB10BR.png',             1),
    ('SK29',          '',             'NIP-SK29.png',                 1),
    ('T-MJ35',        'white left',   'NIP-T-MJ35_White_L.jpeg',      1),
    ('T-MJ35',        'white right',  'NIP-T-MJ35_White_R.jpeg',      2),
    ('TLS12-6',       '',             'NIP-TLS12-6.png',              1),
    ('TLS21HS',       'black',        'NIP-TLS21HS_Black.png',        1),
    ('TLS22HS',       'black',        'NIP-TLS22HS_Black.png',        1),
    ('Z201',          'black',        'NIP-Z201_Black.png',           1),
    ('ZA1-6A',        '',             'NIP-ZA1-6A.png',               1),
    ('ZA1',           '',             'NIP-ZA1.png',                  1),
    ('ZCD-08X54.5',   '',             'NIP-ZCD-08X54_5.png',          1),
    ('ZCD75X25',      '',             'NIP-ZCD75X25.png',             1),
    ('ZCD75X40',      '',             'NIP-ZCD75X40.png',             1),
    ('ZTS218',        'black',        'NIP-ZTS218_Black.png',         1);

  -- ── PASS 1: variant-aware match ─────────────────────────────────────
  -- Match products whose description / finish_color contains every variant
  -- token AND whose code matches in id/profile_code/model_no.
  FOR rec IN SELECT * FROM _nip_img WHERE variants <> '' LOOP
    UPDATE products p
    SET image_url  = base_url || rec.fname,
        updated_at = now()
    WHERE p.company = 'Nippon'
      AND (p.image_url IS NULL OR p.image_url = '')
      AND (
        LOWER(p.id)            = LOWER(rec.code)
        OR LOWER(p.profile_code) = LOWER(rec.code)
        OR LOWER(p.model_no)     = LOWER(rec.code)
        OR LOWER(p.id)            LIKE '%' || LOWER(rec.code) || '%'
        OR LOWER(p.description)   LIKE '%' || LOWER(rec.code) || '%'
      )
      AND (
        SELECT bool_and(
          LOWER(COALESCE(p.description,'') || ' ' || COALESCE(p.finish_color,'') || ' ' || COALESCE(p.direction,''))
          LIKE '%' || tok || '%'
        )
        FROM unnest(string_to_array(rec.variants, ' ')) tok
        WHERE tok <> ''
      );
    GET DIAGNOSTICS rc = ROW_COUNT;
    pass1_n := pass1_n + rc;
  END LOOP;

  -- ── PASS 2: fallback — any remaining Nippon product matching by code ──
  FOR rec IN
    SELECT DISTINCT ON (code) code, fname
    FROM _nip_img
    ORDER BY code, pri
  LOOP
    UPDATE products p
    SET image_url  = base_url || rec.fname,
        updated_at = now()
    WHERE p.company = 'Nippon'
      AND (p.image_url IS NULL OR p.image_url = '')
      AND (
        LOWER(p.id)            = LOWER(rec.code)
        OR LOWER(p.profile_code) = LOWER(rec.code)
        OR LOWER(p.model_no)     = LOWER(rec.code)
        OR LOWER(p.id)            LIKE '%' || LOWER(rec.code) || '%'
        OR LOWER(p.description)   LIKE '%' || LOWER(rec.code) || '%'
      );
    GET DIAGNOSTICS rc = ROW_COUNT;
    pass2_n := pass2_n + rc;
  END LOOP;

  RAISE NOTICE 'Nippon image routing: pass1 (variant-aware) updated %, pass2 (fallback) updated %, total %',
    pass1_n, pass2_n, pass1_n + pass2_n;
END
$nippon_images$;

-- Schema cache nudge so the frontend picks the new image_url values immediately.
NOTIFY pgrst, 'reload schema';

-- ── Verification queries (uncomment to inspect) ─────────────────────
-- SELECT id, profile_code, model_no, description, image_url
--   FROM products
--  WHERE company = 'Nippon' AND image_url IS NOT NULL
--  ORDER BY profile_code;
--
-- SELECT COUNT(*) FILTER (WHERE image_url IS NOT NULL) AS with_img,
--        COUNT(*) FILTER (WHERE image_url IS NULL)     AS missing,
--        COUNT(*)                                       AS total
--   FROM products WHERE company = 'Nippon';
