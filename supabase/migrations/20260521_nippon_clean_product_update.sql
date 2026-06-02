-- ════════════════════════════════════════════════════════════════════
-- Nippon Products — Clean master data UPDATE
-- Source: Nippon_Products_CLEAN (3).xlsx  |  430 rows
-- Generated: 2026-05-21 14:14
--
-- Column mapping:
--   description   ← Item Name (clean human name)
--   profile_code  ← Internal Code (KinLong/vendor code)
--   model_no      ← Original Description (legacy / search index)
--   brand, finish_color, direction, material, category,
--   main_category, sub_category, base_price, unit  ← from Excel
--   image_url     ← only set when Image Path column has a value
--
-- Run in Supabase SQL Editor. Safe to re-run (idempotent UPDATEs).
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- [4] GLAZEON
UPDATE products SET
  description   = 'GLAZEON',
  profile_code  = NULL,
  model_no      = 'GLAZEON BLACK',
  brand         = 'Harris',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Consumable',
  main_category = 'Consumable',
  sub_category  = 'Glazing Compound',
  base_price    = 850,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-97' AND company = 'Nippon';

-- [5] INSULATION STRIP
UPDATE products SET
  description   = 'INSULATION STRIP',
  profile_code  = NULL,
  model_no      = 'POLYAMIDE INSULATION STRIP',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Polyamide',
  category      = 'Consumable',
  main_category = 'Consumable',
  sub_category  = 'Insulation Strip',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-LDG-194-HW-' AND company = 'Nippon';

-- [6] INSULATION STRIP [$internalCode]
UPDATE products SET
  description   = 'INSULATION STRIP',
  profile_code  = 'LDG-194(HW)',
  model_no      = 'LDG-194(HW)',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'PA66GF25',
  category      = 'Consumable',
  main_category = 'Consumable',
  sub_category  = 'Insulation Strip',
  base_price    = 41053,
  unit          = 'PCS'
WHERE id = 'NIP-KL-LDG-194HW' AND company = 'Nippon';

-- [7] SCREW
UPDATE products SET
  description   = 'SCREW',
  profile_code  = NULL,
  model_no      = 'SCREEW',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Consumable',
  main_category = 'Consumable',
  sub_category  = 'Screw Fastener',
  base_price    = 7,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-55' AND company = 'Nippon';

-- [8] SCREW
UPDATE products SET
  description   = 'SCREW',
  profile_code  = NULL,
  model_no      = 'SCREEW',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Consumable',
  main_category = 'Consumable',
  sub_category  = 'Screw Fastener',
  base_price    = 7,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283556-55' AND company = 'Nippon';

-- [9] SQUARE STEEL
UPDATE products SET
  description   = 'SQUARE STEEL',
  profile_code  = NULL,
  model_no      = 'SQUARE STEEL',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Consumable',
  main_category = 'Consumable',
  sub_category  = 'Screw Fastener',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-LMS003-100' AND company = 'Nippon';

-- [10] SILICONE SEALANT
UPDATE products SET
  description   = 'SILICONE SEALANT',
  profile_code  = NULL,
  model_no      = 'SILICON CLEAR',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Consumable',
  main_category = 'Consumable',
  sub_category  = 'Silicone Sealant',
  base_price    = 638,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068180-103' AND company = 'Nippon';

-- [11] SILICONE SEALANT
UPDATE products SET
  description   = 'SILICONE SEALANT',
  profile_code  = NULL,
  model_no      = 'SILICON CLEAR RTV',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Consumable',
  main_category = 'Consumable',
  sub_category  = 'Silicone Sealant',
  base_price    = 375,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-104' AND company = 'Nippon';

-- [12] SILICONE SEALANT
UPDATE products SET
  description   = 'SILICONE SEALANT',
  profile_code  = NULL,
  model_no      = 'SILICON POUCH RTV',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Consumable',
  main_category = 'Consumable',
  sub_category  = 'Silicone Sealant',
  base_price    = 850,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283557-109' AND company = 'Nippon';

-- [13] SILICONE SEALANT
UPDATE products SET
  description   = 'SILICONE SEALANT',
  profile_code  = NULL,
  model_no      = 'SLICON POUCH',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Consumable',
  main_category = 'Consumable',
  sub_category  = 'Silicone Sealant',
  base_price    = 900,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-112' AND company = 'Nippon';

-- [14] SILICONE SEALANT
UPDATE products SET
  description   = 'SILICONE SEALANT',
  profile_code  = NULL,
  model_no      = 'RTV SILICON',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Consumable',
  main_category = 'Consumable',
  sub_category  = 'Silicone Sealant',
  base_price    = 370,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283557-100' AND company = 'Nippon';

-- [15] SILICONE SEALANT
UPDATE products SET
  description   = 'SILICONE SEALANT',
  profile_code  = NULL,
  model_no      = 'WEATHERPROOF  SILICONE',
  brand         = 'SIWAY',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Consumable',
  main_category = 'Consumable',
  sub_category  = 'Silicone Sealant',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-SV888-WHITE' AND company = 'Nippon';

-- [16] SILICONE SEALANT
UPDATE products SET
  description   = 'SILICONE SEALANT',
  profile_code  = NULL,
  model_no      = 'SILICON',
  brand         = NULL,
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Consumable',
  main_category = 'Consumable',
  sub_category  = 'Silicone Sealant',
  base_price    = 892,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283557-101' AND company = 'Nippon';

-- [17] SILICONE SEALANT
UPDATE products SET
  description   = 'SILICONE SEALANT',
  profile_code  = NULL,
  model_no      = 'SILICON BOTTLE',
  brand         = NULL,
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Consumable',
  main_category = 'Consumable',
  sub_category  = 'Silicone Sealant',
  base_price    = 370,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-102' AND company = 'Nippon';

-- [18] SILICONE SEALANT
UPDATE products SET
  description   = 'SILICONE SEALANT',
  profile_code  = NULL,
  model_no      = 'SILICON POUCH',
  brand         = NULL,
  finish_color  = 'Black',
  direction     = NULL,
  material      = 'Metal',
  category      = 'Consumable',
  main_category = 'Consumable',
  sub_category  = 'Silicone Sealant',
  base_price    = 868,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-107' AND company = 'Nippon';

-- [19] SILICONE SEALANT
UPDATE products SET
  description   = 'SILICONE SEALANT',
  profile_code  = NULL,
  model_no      = 'SILICON POUCH BLACK',
  brand         = NULL,
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Consumable',
  main_category = 'Consumable',
  sub_category  = 'Silicone Sealant',
  base_price    = 850,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068180-108' AND company = 'Nippon';

-- [20] SILICONE SEALANT
UPDATE products SET
  description   = 'SILICONE SEALANT',
  profile_code  = NULL,
  model_no      = 'SILICON POUCH',
  brand         = NULL,
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Consumable',
  main_category = 'Consumable',
  sub_category  = 'Silicone Sealant',
  base_price    = 868,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283557-107' AND company = 'Nippon';

-- [21] SILICONE SEALANT
UPDATE products SET
  description   = 'SILICONE SEALANT',
  profile_code  = NULL,
  model_no      = 'SILICON RTV',
  brand         = NULL,
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Consumable',
  main_category = 'Consumable',
  sub_category  = 'Silicone Sealant',
  base_price    = 369,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068180-110' AND company = 'Nippon';

-- [22] SILICONE SEALANT
UPDATE products SET
  description   = 'SILICONE SEALANT',
  profile_code  = NULL,
  model_no      = 'SILICON SAUSAGE',
  brand         = NULL,
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Consumable',
  main_category = 'Consumable',
  sub_category  = 'Silicone Sealant',
  base_price    = 850,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068180-111' AND company = 'Nippon';

-- [23] SILICONE SEALANT
UPDATE products SET
  description   = 'SILICONE SEALANT',
  profile_code  = NULL,
  model_no      = 'NEW SILICON POUCH',
  brand         = NULL,
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Consumable',
  main_category = 'Consumable',
  sub_category  = 'Silicone Sealant',
  base_price    = 850,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283557-99' AND company = 'Nippon';

-- [24] SILICONE SEALANT
UPDATE products SET
  description   = 'SILICONE SEALANT',
  profile_code  = NULL,
  model_no      = 'SILICON IMPORTED',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Consumable',
  main_category = 'Consumable',
  sub_category  = 'Silicone Sealant',
  base_price    = 730,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-105' AND company = 'Nippon';

-- [25] SILICONE SEALANT
UPDATE products SET
  description   = 'SILICONE SEALANT',
  profile_code  = NULL,
  model_no      = 'SILICON PAUCH',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Consumable',
  main_category = 'Consumable',
  sub_category  = 'Silicone Sealant',
  base_price    = 900,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-106' AND company = 'Nippon';

-- [26] SILICONE SEALANT
UPDATE products SET
  description   = 'SILICONE SEALANT',
  profile_code  = NULL,
  model_no      = 'SLICON POUCH BLACK',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Consumable',
  main_category = 'Consumable',
  sub_category  = 'Silicone Sealant',
  base_price    = 900,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068180-113' AND company = 'Nippon';

-- [27] SILICONE SEALANT [$internalCode]
UPDATE products SET
  description   = 'SILICONE SEALANT',
  profile_code  = 'KL-WS601',
  model_no      = '100% Neutral Sealant Sausage Type Weatherproofing Silicone Sealant, Black, 590ml',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = '100% Neutral',
  category      = 'Consumable',
  main_category = 'Consumable',
  sub_category  = 'Silicone Sealant',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-KL-WS601-BLACK' AND company = 'Nippon';

-- [28] BUTYL TAPE
UPDATE products SET
  description   = 'BUTYL TAPE',
  profile_code  = NULL,
  model_no      = 'BUTYL TAPE',
  brand         = 'SOLERON',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Consumable',
  main_category = 'Consumable',
  sub_category  = 'Tape Gasket',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP---4-0-5MM-50M' AND company = 'Nippon';

-- [29] GASKET
UPDATE products SET
  description   = 'GASKET',
  profile_code  = NULL,
  model_no      = 'GASKET',
  brand         = NULL,
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Consumable',
  main_category = 'Consumable',
  sub_category  = 'Tape Gasket',
  base_price    = 350,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283557-114' AND company = 'Nippon';

-- [30] GASKET BUNDLE
UPDATE products SET
  description   = 'GASKET BUNDLE',
  profile_code  = NULL,
  model_no      = 'GASKET BUNDLE',
  brand         = NULL,
  finish_color  = 'White',
  direction     = NULL,
  material      = NULL,
  category      = 'Consumable',
  main_category = 'Consumable',
  sub_category  = 'Tape Gasket',
  base_price    = 350,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-115' AND company = 'Nippon';

-- [31] GASKET M4
UPDATE products SET
  description   = 'GASKET M4',
  profile_code  = NULL,
  model_no      = 'GASKET M4',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Consumable',
  main_category = 'Consumable',
  sub_category  = 'Tape Gasket',
  base_price    = 70,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-116' AND company = 'Nippon';

-- [32] KAPLAR
UPDATE products SET
  description   = 'KAPLAR',
  profile_code  = NULL,
  model_no      = 'KAPLAR',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Consumable',
  main_category = 'Consumable',
  sub_category  = 'Tape Gasket',
  base_price    = 650,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-98' AND company = 'Nippon';

-- [33] DOOR SET
UPDATE products SET
  description   = 'DOOR SET',
  profile_code  = NULL,
  model_no      = 'DOOR SET',
  brand         = NULL,
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Complete Set',
  base_price    = 9500,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-20' AND company = 'Nippon';

-- [34] NON-DIGGING FLOOR SPRING
UPDATE products SET
  description   = 'NON-DIGGING FLOOR SPRING',
  profile_code  = NULL,
  model_no      = 'NON-DIGGING FLOOR SPRING',
  brand         = 'HONGKONG HUANGXING',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Floor Spring',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP--H-102' AND company = 'Nippon';

-- [35] DOOR HANDLE
UPDATE products SET
  description   = 'DOOR HANDLE',
  profile_code  = NULL,
  model_no      = 'DOOR HANDLE BLACK',
  brand         = 'Hopo',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Handle',
  base_price    = 11000,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283556-1' AND company = 'Nippon';

-- [36] DOOR HANDLE
UPDATE products SET
  description   = 'DOOR HANDLE',
  profile_code  = NULL,
  model_no      = 'DOOR HANDLE BLACK',
  brand         = 'Hopo',
  finish_color  = 'Black',
  direction     = NULL,
  material      = 'Metal',
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Handle',
  base_price    = 11000,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068178-1' AND company = 'Nippon';

-- [37] DOOR HANDLE [$internalCode]
UPDATE products SET
  description   = 'DOOR HANDLE',
  profile_code  = 'MZS3208C',
  model_no      = 'DOOR HANDLE (MZS3208C, T-MSD35/I,KIL2857/T)',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Handle',
  base_price    = 9500,
  unit          = 'SET'
WHERE id = 'NIP-MZS3208C' AND company = 'Nippon';

-- [38] DOOR HANDLE
UPDATE products SET
  description   = 'DOOR HANDLE',
  profile_code  = NULL,
  model_no      = 'DOOR HANDLE',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Handle',
  base_price    = 7167,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126404-0' AND company = 'Nippon';

-- [39] DOOR HANDLE SET
UPDATE products SET
  description   = 'DOOR HANDLE SET',
  profile_code  = NULL,
  model_no      = 'DOOR HANDLE SET',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Handle',
  base_price    = 9500,
  unit          = 'SET'
WHERE id = 'NIP-IMPORT-1779225126405-3' AND company = 'Nippon';

-- [40] 2D HINGE
UPDATE products SET
  description   = '2D HINGE',
  profile_code  = NULL,
  model_no      = '2D HINGES',
  brand         = NULL,
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Hinge',
  base_price    = 225,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283559-257' AND company = 'Nippon';

-- [41] 2D HINGE
UPDATE products SET
  description   = '2D HINGE',
  profile_code  = NULL,
  model_no      = '2D HINGES BLACK',
  brand         = NULL,
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Hinge',
  base_price    = 250,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283559-258' AND company = 'Nippon';

-- [42] 2D HINGE
UPDATE products SET
  description   = '2D HINGE',
  profile_code  = NULL,
  model_no      = '2D HINGES WHITE',
  brand         = NULL,
  finish_color  = 'White',
  direction     = NULL,
  material      = NULL,
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Hinge',
  base_price    = 250,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126407-259' AND company = 'Nippon';

-- [43] 2D HINGE
UPDATE products SET
  description   = '2D HINGE',
  profile_code  = NULL,
  model_no      = '2D HINGE',
  brand         = 'KIN LONG',
  finish_color  = 'White',
  direction     = NULL,
  material      = NULL,
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Hinge',
  base_price    = 270,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068182-256' AND company = 'Nippon';

-- [44] BUTT HINGE
UPDATE products SET
  description   = 'BUTT HINGE',
  profile_code  = NULL,
  model_no      = 'BUTT HINGE',
  brand         = NULL,
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Hinge',
  base_price    = 160,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068182-260' AND company = 'Nippon';

-- [45] BUTT HINGE
UPDATE products SET
  description   = 'BUTT HINGE',
  profile_code  = NULL,
  model_no      = 'BUTT HINGES',
  brand         = NULL,
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Hinge',
  base_price    = 160,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283559-262' AND company = 'Nippon';

-- [46] BUTT HINGE 90MM
UPDATE products SET
  description   = 'BUTT HINGE 90MM',
  profile_code  = NULL,
  model_no      = 'BUTT HINGE 90MM',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Hinge',
  base_price    = 160,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126407-261' AND company = 'Nippon';

-- [47] BUTT HINGE 90MM
UPDATE products SET
  description   = 'BUTT HINGE 90MM',
  profile_code  = NULL,
  model_no      = 'BUTT HINGE 90MM',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Hinge',
  base_price    = 160,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283559-261' AND company = 'Nippon';

-- [48] CONCEALED HINGES
UPDATE products SET
  description   = 'CONCEALED HINGES',
  profile_code  = NULL,
  model_no      = 'CONSEALED HINGES',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Hinge',
  base_price    = 2000,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126407-263' AND company = 'Nippon';

-- [49] CONCEALED HINGES
UPDATE products SET
  description   = 'CONCEALED HINGES',
  profile_code  = NULL,
  model_no      = 'CONSEALED HINGES',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Hinge',
  base_price    = 2000,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283559-263' AND company = 'Nippon';

-- [50] CONSEALED DOOR HINGE MAXIMUM LOAD, 1 PAIR ) [$internalCode]
UPDATE products SET
  description   = 'CONSEALED DOOR HINGE MAXIMUM LOAD, 1 PAIR )',
  profile_code  = 'ZHY622',
  model_no      = 'KINLONG CONSEALED DOOR HINGE MAXIMUM LOAD BEARING:120KG (2 PAIR RIGHT, 1 PAIR LEFT)',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = 'L/R',
  material      = NULL,
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Hinge',
  base_price    = 5200,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/ZHY622.png'
WHERE id = 'NIP-ZHY622' AND company = 'Nippon';

-- [51] DOOR HINGE
UPDATE products SET
  description   = 'DOOR HINGE',
  profile_code  = NULL,
  model_no      = 'DOOR HINGE',
  brand         = 'Hopo',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Hinge',
  base_price    = 2375,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-7' AND company = 'Nippon';

-- [52] DOOR HINGE
UPDATE products SET
  description   = 'DOOR HINGE',
  profile_code  = NULL,
  model_no      = 'DOOR HINGES',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Hinge',
  base_price    = 2158,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283556-8' AND company = 'Nippon';

-- [53] DOOR HINGE
UPDATE products SET
  description   = 'DOOR HINGE',
  profile_code  = NULL,
  model_no      = 'DOOR HINGES BLACK',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Hinge',
  base_price    = 2050,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068179-9' AND company = 'Nippon';

-- [54] DOOR HINGE 100MM
UPDATE products SET
  description   = 'DOOR HINGE 100MM',
  profile_code  = NULL,
  model_no      = '100MM HINGES BLACK',
  brand         = NULL,
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Hinge',
  base_price    = 175,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068182-255' AND company = 'Nippon';

-- [55] HINGE
UPDATE products SET
  description   = 'HINGE',
  profile_code  = NULL,
  model_no      = 'HINGE',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Hinge',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-T-MJ35-L' AND company = 'Nippon';

-- [56] NETTING HINGES
UPDATE products SET
  description   = 'NETTING HINGES',
  profile_code  = NULL,
  model_no      = 'NETTING HINGES',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Hinge',
  base_price    = 1150,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283559-270' AND company = 'Nippon';

-- [57] PIVOT HINGE
UPDATE products SET
  description   = 'PIVOT HINGE',
  profile_code  = NULL,
  model_no      = 'PIVOT HINGE',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Hinge',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-J5C-R-BLACK' AND company = 'Nippon';

-- [58] PIVOT HINGE [$internalCode]
UPDATE products SET
  description   = 'PIVOT HINGE',
  profile_code  = 'J5C',
  model_no      = 'J5C',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = 'Right',
  material      = 'Aluminium profile',
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Hinge',
  base_price    = 1700,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/J5C.jpg'
WHERE id = 'NIP-KL-J5C-B-R' AND company = 'Nippon';

-- [59] PIVOT HINGE [$internalCode]
UPDATE products SET
  description   = 'PIVOT HINGE',
  profile_code  = 'T-MJ35',
  model_no      = 'T-MJ35',
  brand         = 'KIN LONG',
  finish_color  = 'White',
  direction     = 'Left',
  material      = 'Aluminium profile',
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Hinge',
  base_price    = 2300,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/T-MJ35.jpg'
WHERE id = 'NIP-KL-T-MJ35-W-L' AND company = 'Nippon';

-- [60] PIVOT HINGE [$internalCode]
UPDATE products SET
  description   = 'PIVOT HINGE',
  profile_code  = 'T-MJ35',
  model_no      = 'T-MJ35',
  brand         = 'KIN LONG',
  finish_color  = 'White',
  direction     = 'Right',
  material      = 'Aluminium profile',
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Hinge',
  base_price    = 2300,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/T-MJ35.jpg'
WHERE id = 'NIP-KL-T-MJ35-W-R' AND company = 'Nippon';

-- [61] PIVOT HINGE & , + BEARINKG [$internalCode]
UPDATE products SET
  description   = 'PIVOT HINGE & , + BEARINKG',
  profile_code  = 'J5C',
  model_no      = 'KIN LONG PIVOT HINGE BLACK & WHITE, ALUMINUM+STAINLESS STEEL BEARING=110KG',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = 'Stainless Steel',
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Hinge',
  base_price    = 1700,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/J5C.jpg'
WHERE id = 'NIP-J5C' AND company = 'Nippon';

-- [62] PIVOT HINGE & , + BEARINKG [$internalCode]
UPDATE products SET
  description   = 'PIVOT HINGE & , + BEARINKG',
  profile_code  = 'T-MJ35',
  model_no      = 'KIN LONG PIVOT HINGE BLACK & WHITE, ALUMINUM+STAINLESS STEEL BEARING=150KG',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = 'Stainless Steel',
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Hinge',
  base_price    = 2300,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/T-MJ35.jpg'
WHERE id = 'NIP-T-MJ35' AND company = 'Nippon';

-- [63] DOOR LOCK
UPDATE products SET
  description   = 'DOOR LOCK',
  profile_code  = NULL,
  model_no      = 'DOOR LOCK',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Lock',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-T-MSD35-II' AND company = 'Nippon';

-- [64] DOOR HANDLE LOCK BODY
UPDATE products SET
  description   = 'DOOR HANDLE LOCK BODY',
  profile_code  = NULL,
  model_no      = 'DOOR HANDLE LOCK BODY',
  brand         = 'Hopo',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Lock Body',
  base_price    = 15000,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-2' AND company = 'Nippon';

-- [65] LOCK BODY
UPDATE products SET
  description   = 'LOCK BODY',
  profile_code  = NULL,
  model_no      = 'DOOR LOCK BODY',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Lock Body',
  base_price    = 7500,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068179-14' AND company = 'Nippon';

-- [66] LOCK BODY
UPDATE products SET
  description   = 'LOCK BODY',
  profile_code  = NULL,
  model_no      = 'LOCK BODY',
  brand         = NULL,
  finish_color  = 'White',
  direction     = NULL,
  material      = NULL,
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Lock Body',
  base_price    = 2600,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068179-24' AND company = 'Nippon';

-- [67] LOCK BODY
UPDATE products SET
  description   = 'LOCK BODY',
  profile_code  = NULL,
  model_no      = 'LOCKBODY',
  brand         = NULL,
  finish_color  = 'White',
  direction     = NULL,
  material      = NULL,
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Lock Body',
  base_price    = 2550,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283556-25' AND company = 'Nippon';

-- [68] LOCK BODY
UPDATE products SET
  description   = 'LOCK BODY',
  profile_code  = NULL,
  model_no      = 'DOOR LOCKBODY',
  brand         = 'KIN LONG',
  finish_color  = 'White',
  direction     = NULL,
  material      = 'Metal',
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Lock Body',
  base_price    = 5860,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-16' AND company = 'Nippon';

-- [69] LOCK BODY
UPDATE products SET
  description   = 'LOCK BODY',
  profile_code  = NULL,
  model_no      = 'DOOR LOCKBODY',
  brand         = 'KIN LONG',
  finish_color  = 'White',
  direction     = NULL,
  material      = NULL,
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Lock Body',
  base_price    = 5860,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283556-16' AND company = 'Nippon';

-- [70] LOCK BODY 35MM
UPDATE products SET
  description   = 'LOCK BODY 35MM',
  profile_code  = NULL,
  model_no      = 'DOOR LOCK BODY 35MM ONLY',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Lock Body',
  base_price    = 3500,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283556-15' AND company = 'Nippon';

-- [71] LOCK BODY 35MM
UPDATE products SET
  description   = 'LOCK BODY 35MM',
  profile_code  = NULL,
  model_no      = 'DOOR LOCK BODY 35MM ONLY',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Lock Body',
  base_price    = 3500,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068179-15' AND company = 'Nippon';

-- [72] LOCK BODY 35MM
UPDATE products SET
  description   = 'LOCK BODY 35MM',
  profile_code  = NULL,
  model_no      = 'LOCKBODY 35MM',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Lock Body',
  base_price    = 2450,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283556-19' AND company = 'Nippon';

-- [73] LOCK BODY SET
UPDATE products SET
  description   = 'LOCK BODY SET',
  profile_code  = NULL,
  model_no      = 'DOOR LOCKBODY SET',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Lock Body',
  base_price    = 9500,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-17' AND company = 'Nippon';

-- [74] LOCK BODY SET
UPDATE products SET
  description   = 'LOCK BODY SET',
  profile_code  = NULL,
  model_no      = 'LOCKBODY SET',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Lock Body',
  base_price    = 7500,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068179-26' AND company = 'Nippon';

-- [75] LOCK BODY SET 35MM
UPDATE products SET
  description   = 'LOCK BODY SET 35MM',
  profile_code  = NULL,
  model_no      = 'DOOR LOCKBODY SET 35MM',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Lock Body',
  base_price    = 5500,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-18' AND company = 'Nippon';

-- [76] ROUTEL
UPDATE products SET
  description   = 'ROUTEL',
  profile_code  = NULL,
  model_no      = 'ROUTEL',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Patch Fitting',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-ATF11X' AND company = 'Nippon';

-- [77] TOP PATCH
UPDATE products SET
  description   = 'TOP PATCH',
  profile_code  = NULL,
  model_no      = 'TOP PATCH',
  brand         = 'HONGKONG HUANGXING',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Patch Fitting',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-KPF-20' AND company = 'Nippon';

-- [78] DOOR SOCKET
UPDATE products SET
  description   = 'DOOR SOCKET',
  profile_code  = NULL,
  model_no      = 'DOOR SCOKET',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Socket',
  base_price    = 900,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068179-22' AND company = 'Nippon';

-- [79] DOOR SOCKET [$internalCode]
UPDATE products SET
  description   = 'DOOR SOCKET',
  profile_code  = 'MCX320A',
  model_no      = 'KIN LONG DOOR SOCKET ZINC ALLOY+STAINLESS STEEL L=300MM',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Stainless Steel',
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Socket',
  base_price    = 950,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/MCX320A.jpg'
WHERE id = 'NIP-MCX320A' AND company = 'Nippon';

-- [80] DOOR SOCKET [$internalCode]
UPDATE products SET
  description   = 'DOOR SOCKET',
  profile_code  = 'SCX500B',
  model_no      = 'KIN LONG Door socket, Aluminium alloy+Stainless steel, L=513mm, Black',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = 'Aluminium Alloy + Stainless Steel',
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Socket',
  base_price    = 1600,
  unit          = 'PCS'
WHERE id = 'NIP-KL-SCX500B' AND company = 'Nippon';

-- [81] TOWER BOLT
UPDATE products SET
  description   = 'TOWER BOLT',
  profile_code  = NULL,
  model_no      = 'TOWER BOLT',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Tower Bolt',
  base_price    = 575,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-53' AND company = 'Nippon';

-- [82] TOWER BOLT
UPDATE products SET
  description   = 'TOWER BOLT',
  profile_code  = NULL,
  model_no      = 'TOWER BOLT',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Tower Bolt',
  base_price    = 575,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283556-53' AND company = 'Nippon';

-- [83] TOWER BOLT
UPDATE products SET
  description   = 'TOWER BOLT',
  profile_code  = NULL,
  model_no      = 'TOWERBOLT',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Door',
  main_category = 'Door',
  sub_category  = 'Tower Bolt',
  base_price    = 1500,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283556-54' AND company = 'Nippon';

-- [84] GEORGIAN BAR
UPDATE products SET
  description   = 'GEORGIAN BAR',
  profile_code  = NULL,
  model_no      = 'GEORGIAN BAR',
  brand         = 'SOLERON',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Glass Fitting',
  main_category = 'Glass Fitting',
  sub_category  = 'Georgian Bar',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP---WHITE-5-8MM-3M-' AND company = 'Nippon';

-- [85] GEORGIAN FLOWER
UPDATE products SET
  description   = 'GEORGIAN FLOWER',
  profile_code  = NULL,
  model_no      = 'GEORGIAN FLOWER',
  brand         = 'SOLERON',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Glass Fitting',
  main_category = 'Glass Fitting',
  sub_category  = 'Georgian Bar',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-P0401-UV-DARK-GOLD-' AND company = 'Nippon';

-- [86] GEORGIAN FLOWER
UPDATE products SET
  description   = 'GEORGIAN FLOWER',
  profile_code  = NULL,
  model_no      = 'GEORGIAN FLOWER',
  brand         = 'SOLERON',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Glass Fitting',
  main_category = 'Glass Fitting',
  sub_category  = 'Georgian Bar',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-P0401-WHITE' AND company = 'Nippon';

-- [87] BI-FOLD COMPLETE SET
UPDATE products SET
  description   = 'BI-FOLD COMPLETE SET',
  profile_code  = NULL,
  model_no      = 'BYFOLD HARDWARE',
  brand         = 'Hopo',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Lift and Slide',
  main_category = 'Lift and Slide',
  sub_category  = 'Complete Set',
  base_price    = 85000,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-117' AND company = 'Nippon';

-- [88] LIFT & SLIDE COMPLETE SET
UPDATE products SET
  description   = 'LIFT & SLIDE COMPLETE SET',
  profile_code  = NULL,
  model_no      = 'LIFT & SLIDE',
  brand         = NULL,
  finish_color  = 'Black',
  direction     = NULL,
  material      = 'Metal',
  category      = 'Lift and Slide',
  main_category = 'Lift and Slide',
  sub_category  = 'Complete Set',
  base_price    = 42500,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068180-119' AND company = 'Nippon';

-- [89] LIFT & SLIDE COMPLETE SET
UPDATE products SET
  description   = 'LIFT & SLIDE COMPLETE SET',
  profile_code  = NULL,
  model_no      = 'LIFT & SLIDE',
  brand         = NULL,
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Lift and Slide',
  main_category = 'Lift and Slide',
  sub_category  = 'Complete Set',
  base_price    = 42500,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283557-119' AND company = 'Nippon';

-- [90] LIFT & SLIDE COMPLETE SET
UPDATE products SET
  description   = 'LIFT & SLIDE COMPLETE SET',
  profile_code  = NULL,
  model_no      = 'LIFT & SLIDE DOOR',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Lift and Slide',
  main_category = 'Lift and Slide',
  sub_category  = 'Complete Set',
  base_price    = 30000,
  unit          = 'SET'
WHERE id = 'NIP-IMPORT-1779224283557-120' AND company = 'Nippon';

-- [91] LIFT & SLIDE COMPLETE SET
UPDATE products SET
  description   = 'LIFT & SLIDE COMPLETE SET',
  profile_code  = NULL,
  model_no      = 'LIFT & SLIDE HANDLE+KEEPS+EAPAG ROD',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Lift and Slide',
  main_category = 'Lift and Slide',
  sub_category  = 'Complete Set',
  base_price    = 20000,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068180-124' AND company = 'Nippon';

-- [92] LIFT & SLIDE COMPLETE SET
UPDATE products SET
  description   = 'LIFT & SLIDE COMPLETE SET',
  profile_code  = NULL,
  model_no      = 'LIFT & SLIDE SET',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Lift and Slide',
  main_category = 'Lift and Slide',
  sub_category  = 'Complete Set',
  base_price    = 20000,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-125' AND company = 'Nippon';

-- [93] LIFT & SLIDE GEAR SET
UPDATE products SET
  description   = 'LIFT & SLIDE GEAR SET',
  profile_code  = NULL,
  model_no      = 'LIFT & SLIDE GEAR SET',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Lift and Slide',
  main_category = 'Lift and Slide',
  sub_category  = 'Gear Set',
  base_price    = 28500,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-121' AND company = 'Nippon';

-- [94] LIFT & SLIDE GEAR SET
UPDATE products SET
  description   = 'LIFT & SLIDE GEAR SET',
  profile_code  = NULL,
  model_no      = 'LIFT & SLIDA GEAR SET',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Lift and Slide',
  main_category = 'Lift and Slide',
  sub_category  = 'Gear Set',
  base_price    = 35000,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283557-118' AND company = 'Nippon';

-- [95] FIBER JALI
UPDATE products SET
  description   = 'FIBER JALI',
  profile_code  = NULL,
  model_no      = 'FIBER JALI',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Mesh Netting',
  main_category = 'Mesh Netting',
  sub_category  = 'Fiber Mesh',
  base_price    = 3200,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-58' AND company = 'Nippon';

-- [96] FIBER JALI
UPDATE products SET
  description   = 'FIBER JALI',
  profile_code  = NULL,
  model_no      = 'FIBER JALI',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Mesh Netting',
  main_category = 'Mesh Netting',
  sub_category  = 'Fiber Mesh',
  base_price    = 3200,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283557-58' AND company = 'Nippon';

-- [97] MESH
UPDATE products SET
  description   = 'MESH',
  profile_code  = NULL,
  model_no      = 'SS 304 MESH BLACK',
  brand         = NULL,
  finish_color  = 'Black',
  direction     = NULL,
  material      = 'SS304',
  category      = 'Mesh Netting',
  main_category = 'Mesh Netting',
  sub_category  = 'SS Mesh',
  base_price    = 200000,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068179-60' AND company = 'Nippon';

-- [98] SS MESH
UPDATE products SET
  description   = 'SS MESH',
  profile_code  = NULL,
  model_no      = 'S.S 304 MESH BLACK',
  brand         = NULL,
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Mesh Netting',
  main_category = 'Mesh Netting',
  sub_category  = 'SS Mesh',
  base_price    = 150000,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283557-59' AND company = 'Nippon';

-- [99] SS MESH [$internalCode]
UPDATE products SET
  description   = 'SS MESH',
  profile_code  = 'GTSSM0.6',
  model_no      = 'STAINLESS STEEL 304 MESH BLACK, HOLE SIZE: 2MM THICKNESS: 0.6MM',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = 'Stainless Steel',
  category      = 'Mesh Netting',
  main_category = 'Mesh Netting',
  sub_category  = 'SS Mesh',
  base_price    = 95000,
  unit          = 'ROLL'
WHERE id = 'NIP-GTSSM0.6' AND company = 'Nippon';

-- [100] SS MESH [$internalCode]
UPDATE products SET
  description   = 'SS MESH',
  profile_code  = 'GTSSM1',
  model_no      = 'STAINLESS STEEL 304 MESH BLACK, HOLE SIZE: 2MM THICKNESS: 1MM',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = 'Stainless Steel',
  category      = 'Mesh Netting',
  main_category = 'Mesh Netting',
  sub_category  = 'SS Mesh',
  base_price    = 142500,
  unit          = 'ROLL'
WHERE id = 'NIP-GTSSM1' AND company = 'Nippon';

-- [101] SS MESH [$internalCode]
UPDATE products SET
  description   = 'SS MESH',
  profile_code  = 'GTSSM1.2',
  model_no      = 'STAINLESS STEEL 304 MESH BLACK, HOLE SIZE: 2MM THICKNESS: 1.2MM',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = 'Stainless Steel',
  category      = 'Mesh Netting',
  main_category = 'Mesh Netting',
  sub_category  = 'SS Mesh',
  base_price    = 190000,
  unit          = 'ROLL'
WHERE id = 'NIP-GTSSM1.2' AND company = 'Nippon';

-- [102] SS MESH [$internalCode]
UPDATE products SET
  description   = 'SS MESH',
  profile_code  = 'GTSSM1.5',
  model_no      = 'STAINLESS STEEL 304 MESH BLACK, HOLE SIZE: 2MM THICKNESS: 1.5MM',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = 'Stainless Steel',
  category      = 'Mesh Netting',
  main_category = 'Mesh Netting',
  sub_category  = 'SS Mesh',
  base_price    = 285000,
  unit          = 'ROLL'
WHERE id = 'NIP-GTSSM1.5' AND company = 'Nippon';

-- [103] SS NETTING 1MM
UPDATE products SET
  description   = 'SS NETTING 1MM',
  profile_code  = NULL,
  model_no      = 'SS NETTING 1.0MM',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Mesh Netting',
  main_category = 'Mesh Netting',
  sub_category  = 'SS Mesh',
  base_price    = 27335,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068179-61' AND company = 'Nippon';

-- [104] SS NETTING 1MM
UPDATE products SET
  description   = 'SS NETTING 1MM',
  profile_code  = NULL,
  model_no      = 'SS NETTING ROLL 1MM',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Mesh Netting',
  main_category = 'Mesh Netting',
  sub_category  = 'SS Mesh',
  base_price    = 130000,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068179-62' AND company = 'Nippon';

-- [105] CONNECTOR ROD
UPDATE products SET
  description   = 'CONNECTOR ROD',
  profile_code  = NULL,
  model_no      = 'WHEEL CONNECTOR ROD',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Connecting Rod',
  base_price    = 650,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283557-146' AND company = 'Nippon';

-- [106] CONNECTOR ROD
UPDATE products SET
  description   = 'CONNECTOR ROD',
  profile_code  = NULL,
  model_no      = 'WHEEL CONNECTOR ROD',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Connecting Rod',
  base_price    = 650,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068180-146' AND company = 'Nippon';

-- [107] INSULATION CONNECTING ROD [$internalCode]
UPDATE products SET
  description   = 'INSULATION CONNECTING ROD',
  profile_code  = 'LDG-194',
  model_no      = 'INSULATION CONNECTING ROD USED WITH ZCD-08 & HDS8 250LM PER ROLL',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Connecting Rod',
  base_price    = 90,
  unit          = 'RFT'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/LDG-194.png'
WHERE id = 'NIP-LDG-194' AND company = 'Nippon';

-- [108] CONNECT PIN [$internalCode]
UPDATE products SET
  description   = 'CONNECT PIN',
  profile_code  = 'ZCD-08X54.5',
  model_no      = 'ZCD-08X54.5',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Stainless steel',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Connector Pin',
  base_price    = 0,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/ZCD-08X54-5.png'
WHERE id = 'NIP-KL-ZCD-08X545' AND company = 'Nippon';

-- [109] CONNECT PIN [$internalCode]
UPDATE products SET
  description   = 'CONNECT PIN',
  profile_code  = 'ZCD-08X54.5',
  model_no      = 'KIN LONG CONNECT PIN 54.5 MEANS 50MM EXPOSED AFTER BEING INSTALLED ON THE ALUMINUM ROD',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Aluminum',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Connector Pin',
  base_price    = 0,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/ZCD-08X54-5.png'
WHERE id = 'NIP-ZCD-08X54.5' AND company = 'Nippon';

-- [110] CONNECT PIN
UPDATE products SET
  description   = 'CONNECT PIN',
  profile_code  = NULL,
  model_no      = 'PIN-ZCD 08',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Connector Pin',
  base_price    = 500,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-68' AND company = 'Nippon';

-- [111] CONNECT PIN
UPDATE products SET
  description   = 'CONNECT PIN',
  profile_code  = NULL,
  model_no      = 'T-PIN',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Connector Pin',
  base_price    = 200,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068179-69' AND company = 'Nippon';

-- [112] CONNECT PIN
UPDATE products SET
  description   = 'CONNECT PIN',
  profile_code  = NULL,
  model_no      = 'T-PIN',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Connector Pin',
  base_price    = 200,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283557-69' AND company = 'Nippon';

-- [113] CONNECTING PIN
UPDATE products SET
  description   = 'CONNECTING PIN',
  profile_code  = NULL,
  model_no      = 'CONNECTING PIN',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Connector Pin',
  base_price    = 650,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068179-67' AND company = 'Nippon';

-- [114] CONNECTING PIN
UPDATE products SET
  description   = 'CONNECTING PIN',
  profile_code  = NULL,
  model_no      = 'CONNECTING PIN',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Connector Pin',
  base_price    = 650,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283557-67' AND company = 'Nippon';

-- [115] CONNECTOR
UPDATE products SET
  description   = 'CONNECTOR',
  profile_code  = NULL,
  model_no      = 'CONNECTOR',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Connector Pin',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-Z15' AND company = 'Nippon';

-- [116] CONNECTOR
UPDATE products SET
  description   = 'CONNECTOR',
  profile_code  = NULL,
  model_no      = 'CONNECTOR',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Connector Pin',
  base_price    = 500,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-71' AND company = 'Nippon';

-- [117] CONNECTOR ACCESSORY [$internalCode]
UPDATE products SET
  description   = 'CONNECTOR ACCESSORY',
  profile_code  = 'AQS10',
  model_no      = 'AQS10',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Connector Pin',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-KL-AQS10' AND company = 'Nippon';

-- [118] CONNECTOR ACCESSORY [$internalCode]
UPDATE products SET
  description   = 'CONNECTOR ACCESSORY',
  profile_code  = 'FSG-01',
  model_no      = 'FSG-01',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Connector Pin',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-KL-FSG-01' AND company = 'Nippon';

-- [119] CONNECTOR ACCESSORY [$internalCode]
UPDATE products SET
  description   = 'CONNECTOR ACCESSORY',
  profile_code  = 'FSP10',
  model_no      = 'FSP10',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Connector Pin',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-KL-FSP10' AND company = 'Nippon';

-- [120] CONNECTOR ACCESSORY [$internalCode]
UPDATE products SET
  description   = 'CONNECTOR ACCESSORY',
  profile_code  = 'FWG10A',
  model_no      = 'FWG10A',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Connector Pin',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-KL-FWG10A' AND company = 'Nippon';

-- [121] CONNECTOR ACCESSORY [$internalCode]
UPDATE products SET
  description   = 'CONNECTOR ACCESSORY',
  profile_code  = 'LCDG41',
  model_no      = 'LCDG41',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Connector Pin',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-KL-LCDG41' AND company = 'Nippon';

-- [122] CONNECTOR ACCESSORY [$internalCode]
UPDATE products SET
  description   = 'CONNECTOR ACCESSORY',
  profile_code  = 'LZA4',
  model_no      = 'LZA4',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Connector Pin',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-KL-LZA4' AND company = 'Nippon';

-- [123] CONNECTOR ACCESSORY [$internalCode]
UPDATE products SET
  description   = 'CONNECTOR ACCESSORY',
  profile_code  = 'LZB5',
  model_no      = 'LZB5',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Connector Pin',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-KL-LZB5' AND company = 'Nippon';

-- [124] CONNECTOR ACCESSORY [$internalCode]
UPDATE products SET
  description   = 'CONNECTOR ACCESSORY',
  profile_code  = 'LZCK05',
  model_no      = 'LZCK05',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Connector Pin',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-KL-LZCK05' AND company = 'Nippon';

-- [125] CONNECTOR ACCESSORY [$internalCode]
UPDATE products SET
  description   = 'CONNECTOR ACCESSORY',
  profile_code  = 'N31',
  model_no      = 'N31',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Connector Pin',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-KL-N31' AND company = 'Nippon';

-- [126] CONNECTOR ACCESSORY [$internalCode]
UPDATE products SET
  description   = 'CONNECTOR ACCESSORY',
  profile_code  = 'N33A',
  model_no      = 'N33A',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Connector Pin',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-KL-N33A' AND company = 'Nippon';

-- [127] CONNECTOR ACCESSORY [$internalCode]
UPDATE products SET
  description   = 'CONNECTOR ACCESSORY',
  profile_code  = 'N50',
  model_no      = 'N50',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Connector Pin',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-KL-N50' AND company = 'Nippon';

-- [128] CONNECTOR ACCESSORY [$internalCode]
UPDATE products SET
  description   = 'CONNECTOR ACCESSORY',
  profile_code  = 'SK29',
  model_no      = 'SK29',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Connector Pin',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-KL-SK29' AND company = 'Nippon';

-- [129] SPIDER CONNECTOR SPACER
UPDATE products SET
  description   = 'SPIDER CONNECTOR SPACER',
  profile_code  = NULL,
  model_no      = 'SPIDER CONNECTOR SPACER',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Connector Pin',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-86' AND company = 'Nippon';

-- [130] SPIDER CONNECTOR SPACER
UPDATE products SET
  description   = 'SPIDER CONNECTOR SPACER',
  profile_code  = NULL,
  model_no      = 'SPIDER CONNECTOR SPACER',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Connector Pin',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283557-86' AND company = 'Nippon';

-- [131] BACK-UP BLOCK
UPDATE products SET
  description   = 'BACK-UP BLOCK',
  profile_code  = NULL,
  model_no      = 'BACK-UP BLOCK',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Cushion Block',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-CDG2370-05G23' AND company = 'Nippon';

-- [132] CUSHION BLOCK
UPDATE products SET
  description   = 'CUSHION BLOCK',
  profile_code  = NULL,
  model_no      = 'CUSHION BLOCK',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Cushion Block',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-H50-20A' AND company = 'Nippon';

-- [133] CUSHION BLOCK
UPDATE products SET
  description   = 'CUSHION BLOCK',
  profile_code  = NULL,
  model_no      = 'COUSION BLOCK',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Cushion Block',
  base_price    = 235,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-131' AND company = 'Nippon';

-- [134] CUSHION BLOCK [$internalCode]
UPDATE products SET
  description   = 'CUSHION BLOCK',
  profile_code  = 'H50-20',
  model_no      = 'KIN LONG CUSHION BLOCK BLACK',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Cushion Block',
  base_price    = 0,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/H50-20.png'
WHERE id = 'NIP-H50-20' AND company = 'Nippon';

-- [135] SLIDING GEAR
UPDATE products SET
  description   = 'SLIDING GEAR',
  profile_code  = NULL,
  model_no      = 'SLIDING GEAR',
  brand         = 'Hopo',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Gear Set',
  base_price    = 2500,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-127' AND company = 'Nippon';

-- [136] SLIDING GEAR
UPDATE products SET
  description   = 'SLIDING GEAR',
  profile_code  = NULL,
  model_no      = 'SLIDING GEAR',
  brand         = 'Hopo',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Gear Set',
  base_price    = 2500,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283557-127' AND company = 'Nippon';

-- [137] SLIDING GEAR SET
UPDATE products SET
  description   = 'SLIDING GEAR SET',
  profile_code  = NULL,
  model_no      = 'SLIDING GEAR SET',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Gear Set',
  base_price    = 1650,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-128' AND company = 'Nippon';

-- [138] SLIDING GEAR SET
UPDATE products SET
  description   = 'SLIDING GEAR SET',
  profile_code  = NULL,
  model_no      = 'SLIDING GEAR SET COMPLETE',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Gear Set',
  base_price    = 2500,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283557-129' AND company = 'Nippon';

-- [139] SLIDING GEAR SET
UPDATE products SET
  description   = 'SLIDING GEAR SET',
  profile_code  = NULL,
  model_no      = 'SLIDING GEAR SET COMPLETE',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = 'Metal',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Gear Set',
  base_price    = 2500,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-129' AND company = 'Nippon';

-- [140] SLIDING LOCK [$internalCode]
UPDATE products SET
  description   = 'SLIDING LOCK',
  profile_code  = 'TLS21HS',
  model_no      = 'TLS21HS',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = 'Zinc alloy',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Lock',
  base_price    = 1950,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/TLS21HS.png'
WHERE id = 'NIP-KL-TLS21HS-B' AND company = 'Nippon';

-- [141] SLIDING LOCK [$internalCode]
UPDATE products SET
  description   = 'SLIDING LOCK',
  profile_code  = 'TLS22HS',
  model_no      = 'TLS22HS',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = 'Zinc alloy',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Lock',
  base_price    = 1400,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/TLS22HS.png'
WHERE id = 'NIP-KL-TLS22HS-B' AND company = 'Nippon';

-- [142] SLIDING LOCK [$internalCode]
UPDATE products SET
  description   = 'SLIDING LOCK',
  profile_code  = 'ZTS218',
  model_no      = 'ZTS218',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = 'Zinc alloy',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Lock',
  base_price    = 0,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/ZTS218.png'
WHERE id = 'NIP-KL-ZTS218-B' AND company = 'Nippon';

-- [143] SLIDING LOCK [$internalCode]
UPDATE products SET
  description   = 'SLIDING LOCK',
  profile_code  = 'TLS12-6',
  model_no      = 'SLIDING LOCK WITH LOCK HOOK TLS12-6,TLS21-HS BLACK ZINC ALLOY+STAINLESS STEEL SCREW: M5*35MM',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = 'Stainless Steel',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Lock',
  base_price    = 1550,
  unit          = 'PCS'
WHERE id = 'NIP-TLS12-6' AND company = 'Nippon';

-- [144] SLIDING LOCK [$internalCode]
UPDATE products SET
  description   = 'SLIDING LOCK',
  profile_code  = 'TLS21HS',
  model_no      = 'SLIDING LOCK WITH LOCK HOOK TLS12-6 BLACK ZINC ALLOY+STAINLESS STEEL SCREW: M5*35MM',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = 'Stainless Steel',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Lock',
  base_price    = 1950,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/TLS21HS.png'
WHERE id = 'NIP-TLS21HS' AND company = 'Nippon';

-- [145] SLIDING LOCK [$internalCode]
UPDATE products SET
  description   = 'SLIDING LOCK',
  profile_code  = 'TLS22HS',
  model_no      = 'SLIDING LOCK WITH LOCK HOOK TLS22-6 BLACK ALUMINIUM ALLOY+STAINLESS STEEL SCREW: M5*35MM',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = 'Stainless Steel',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Lock',
  base_price    = 1400,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/TLS22HS.png'
WHERE id = 'NIP-TLS22HS' AND company = 'Nippon';

-- [146] SLIDING LOCK [$internalCode]
UPDATE products SET
  description   = 'SLIDING LOCK',
  profile_code  = 'TLS32',
  model_no      = 'Sliding lock with lock hook TLS22-6, Black, Aluminium alloy+Stainless steel',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = 'Aluminium Alloy + Stainless Steel',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Lock',
  base_price    = 770,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/TLS32.png'
WHERE id = 'NIP-KL-TLS32' AND company = 'Nippon';

-- [147] SLIDING PUSH LOCK
UPDATE products SET
  description   = 'SLIDING PUSH LOCK',
  profile_code  = NULL,
  model_no      = 'SLIDING PUCH LOCK',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Lock',
  base_price    = 2000,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283557-154' AND company = 'Nippon';

-- [148] SLIDING PUSH LOCK
UPDATE products SET
  description   = 'SLIDING PUSH LOCK',
  profile_code  = NULL,
  model_no      = 'SLIDING PUSH LOCK KEY LOCKING',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Lock',
  base_price    = 2000,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126406-158' AND company = 'Nippon';

-- [149] SLIDING PUSH LOCK
UPDATE products SET
  description   = 'SLIDING PUSH LOCK',
  profile_code  = NULL,
  model_no      = 'SLIDING PUSH LOCK KEY',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = 'Right',
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Lock',
  base_price    = 2000,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068181-157' AND company = 'Nippon';

-- [150] SLIDING PUSH LOCK
UPDATE products SET
  description   = 'SLIDING PUSH LOCK',
  profile_code  = NULL,
  model_no      = 'SLIDING PUNCH KEY LOCK',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Lock',
  base_price    = 2000,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126406-155' AND company = 'Nippon';

-- [151] SLIDING PUSH LOCK
UPDATE products SET
  description   = 'SLIDING PUSH LOCK',
  profile_code  = NULL,
  model_no      = 'SLIDING PUSH LOCK',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Lock',
  base_price    = 2000,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068181-156' AND company = 'Nippon';

-- [152] BACK ROLLER
UPDATE products SET
  description   = 'BACK ROLLER',
  profile_code  = NULL,
  model_no      = 'BACK ROLLER',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 4350,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-130' AND company = 'Nippon';

-- [153] BACK ROLLER
UPDATE products SET
  description   = 'BACK ROLLER',
  profile_code  = NULL,
  model_no      = 'BACK ROLLER',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 4350,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283557-130' AND company = 'Nippon';

-- [154] DG WHEEL
UPDATE products SET
  description   = 'DG WHEEL',
  profile_code  = NULL,
  model_no      = 'DG WHEEL',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 650,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283557-132' AND company = 'Nippon';

-- [155] DG WHEEL
UPDATE products SET
  description   = 'DG WHEEL',
  profile_code  = NULL,
  model_no      = 'DG WHEEL',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 650,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068180-132' AND company = 'Nippon';

-- [156] DOOR ROLLER [$internalCode]
UPDATE products SET
  description   = 'DOOR ROLLER',
  profile_code  = 'ML35G19K19',
  model_no      = 'DOOR ROLLER',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 700,
  unit          = 'PCS'
WHERE id = 'NIP-ML35G19K19' AND company = 'Nippon';

-- [157] DOOR WHEEL
UPDATE products SET
  description   = 'DOOR WHEEL',
  profile_code  = NULL,
  model_no      = 'DOOR WHEEL',
  brand         = 'NINGBO WIDEN',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP---RED-WHEEL-' AND company = 'Nippon';

-- [158] DOUBLE GROOVE ROLLER
UPDATE products SET
  description   = 'DOUBLE GROOVE ROLLER',
  profile_code  = NULL,
  model_no      = 'DOUBLE GROOVE WHEEL',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 55,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068180-133' AND company = 'Nippon';

-- [159] DOUBLE GROOVE ROLLER
UPDATE products SET
  description   = 'DOUBLE GROOVE ROLLER',
  profile_code  = NULL,
  model_no      = 'DOUBLE GROOVE WHEEL',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 55,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283557-133' AND company = 'Nippon';

-- [160] DOUBLE ROLLER
UPDATE products SET
  description   = 'DOUBLE ROLLER',
  profile_code  = NULL,
  model_no      = 'DOUBLE ROLLER',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-CML35G19K19-2A' AND company = 'Nippon';

-- [161] DOUBLE ROLLER [$internalCode]
UPDATE products SET
  description   = 'DOUBLE ROLLER',
  profile_code  = 'CML35G19K19.2A',
  model_no      = 'CML35G19K19.2A',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 750,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/CML35G19K19-2A.png'
WHERE id = 'NIP-KL-CML35G19K192A' AND company = 'Nippon';

-- [162] DOUBLE ROLLER [$internalCode]
UPDATE products SET
  description   = 'DOUBLE ROLLER',
  profile_code  = 'CLM35G19-K19-2A',
  model_no      = 'DOUBLE ROLLER',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 650,
  unit          = 'PCS'
WHERE id = 'NIP-CLM35G19-K19-2A' AND company = 'Nippon';

-- [163] DOUBLE ROLLER
UPDATE products SET
  description   = 'DOUBLE ROLLER',
  profile_code  = NULL,
  model_no      = 'DOUBLE WHEEL',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 350,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283557-137' AND company = 'Nippon';

-- [164] DOUBLE ROLLER
UPDATE products SET
  description   = 'DOUBLE ROLLER',
  profile_code  = NULL,
  model_no      = 'DOUBLE WHEEL',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 350,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068180-137' AND company = 'Nippon';

-- [165] DOUBLE ROLLER
UPDATE products SET
  description   = 'DOUBLE ROLLER',
  profile_code  = NULL,
  model_no      = 'DOUBLE ROLLER',
  brand         = 'KIN LONG',
  finish_color  = 'White',
  direction     = NULL,
  material      = 'Metal',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 601,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068180-134' AND company = 'Nippon';

-- [166] DOUBLE ROLLER
UPDATE products SET
  description   = 'DOUBLE ROLLER',
  profile_code  = NULL,
  model_no      = 'DOUBLE ROLLER',
  brand         = 'KIN LONG',
  finish_color  = 'White',
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 601,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283557-134' AND company = 'Nippon';

-- [167] DOUBLE ROLLER CARBON STRUCTURAL STEEL + WEAR-RESISTANT PLASTIC MAXIMUM LOAD [$internalCode]
UPDATE products SET
  description   = 'DOUBLE ROLLER CARBON STRUCTURAL STEEL + WEAR-RESISTANT PLASTIC MAXIMUM LOAD',
  profile_code  = 'CML35G19K19.2A',
  model_no      = 'DOUBLE ROLLER CARBON STRUCTURAL STEEL + WEAR-RESISTANT PLASTIC MAXIMUM LOAD BEARING: 80KG/2PCS',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Carbon Steel',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 750,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/CML35G19K19-2A.png'
WHERE id = 'NIP-CML35G19K19.2A' AND company = 'Nippon';

-- [168] DOUBLE ROLLER CARBON STRUCTURAL STEEL + WEAR-RESISTANT PLASTIC MAXIMUM LOAD [$internalCode]
UPDATE products SET
  description   = 'DOUBLE ROLLER CARBON STRUCTURAL STEEL + WEAR-RESISTANT PLASTIC MAXIMUM LOAD',
  profile_code  = 'CML35G19K19',
  model_no      = 'DOUBLE ROLLER CARBON STRUCTURAL STEEL + WEAR-RESISTANT PLASTIC MAXIMUM LOAD BEARING: 80KG/2PCS (CML35G19K19.2A)',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = 'Carbon Steel',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 683,
  unit          = 'PCS'
WHERE id = 'NIP-CML35G19K19' AND company = 'Nippon';

-- [169] DOUBLE ROLLER ELECTROPLATE
UPDATE products SET
  description   = 'DOUBLE ROLLER ELECTROPLATE',
  profile_code  = NULL,
  model_no      = 'DOUBLE ROLLER ELECTROPLATE',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 650,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068180-135' AND company = 'Nippon';

-- [170] DOUBLE ROLLER WHEEL
UPDATE products SET
  description   = 'DOUBLE ROLLER WHEEL',
  profile_code  = NULL,
  model_no      = 'DOUBLE ROLLER WHEEL',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 650,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-136' AND company = 'Nippon';

-- [171] DUMMY WHEEL
UPDATE products SET
  description   = 'DUMMY WHEEL',
  profile_code  = NULL,
  model_no      = 'DUMMY WHEEL',
  brand         = 'Hopo',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 250,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283557-138' AND company = 'Nippon';

-- [172] FRONT ROLLER
UPDATE products SET
  description   = 'FRONT ROLLER',
  profile_code  = NULL,
  model_no      = 'FRONT ROLLER',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 4865,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068180-139' AND company = 'Nippon';

-- [173] FRONT ROLLER
UPDATE products SET
  description   = 'FRONT ROLLER',
  profile_code  = NULL,
  model_no      = 'FRONT ROLLER',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 4865,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283557-139' AND company = 'Nippon';

-- [174] LIFT & SLIDE WHEEL
UPDATE products SET
  description   = 'LIFT & SLIDE WHEEL',
  profile_code  = NULL,
  model_no      = 'LIFT & SLIDE WHEEL',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 5500,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-126' AND company = 'Nippon';

-- [175] NETTING WHEEL
UPDATE products SET
  description   = 'NETTING WHEEL',
  profile_code  = NULL,
  model_no      = 'NETING WHEEL',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 18,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068180-141' AND company = 'Nippon';

-- [176] NETTING WHEEL
UPDATE products SET
  description   = 'NETTING WHEEL',
  profile_code  = NULL,
  model_no      = 'NETING WHEEL',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 18,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283557-141' AND company = 'Nippon';

-- [177] NETTING WHEEL
UPDATE products SET
  description   = 'NETTING WHEEL',
  profile_code  = NULL,
  model_no      = 'NATTING WHEEL',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 800,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283557-140' AND company = 'Nippon';

-- [178] NETTING WHEEL
UPDATE products SET
  description   = 'NETTING WHEEL',
  profile_code  = NULL,
  model_no      = 'NATTING WHEEL',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 800,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068180-140' AND company = 'Nippon';

-- [179] ROLLER ACCESSORY [$internalCode]
UPDATE products SET
  description   = 'ROLLER ACCESSORY',
  profile_code  = 'LYHDX40B-R',
  model_no      = 'LYHDX40B-R',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-KL-LYHDX40B-R' AND company = 'Nippon';

-- [180] ROLLER ACCESSORY [$internalCode]
UPDATE products SET
  description   = 'ROLLER ACCESSORY',
  profile_code  = 'LYHPS40B-R',
  model_no      = 'LYHPS40B-R',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 0,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/LYHPS40B-R.png'
WHERE id = 'NIP-KL-LYHPS40B-R' AND company = 'Nippon';

-- [181] ROLLER ACCESSORY [$internalCode]
UPDATE products SET
  description   = 'ROLLER ACCESSORY',
  profile_code  = 'NDHA10BR',
  model_no      = 'NDHA10BR',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 0,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/NDHA10BR.png'
WHERE id = 'NIP-KL-NDHA10BR' AND company = 'Nippon';

-- [182] ROLLER ACCESSORY [$internalCode]
UPDATE products SET
  description   = 'ROLLER ACCESSORY',
  profile_code  = 'NDHB10BR',
  model_no      = 'NDHB10BR',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-KL-NDHB10BR' AND company = 'Nippon';

-- [183] SLIDING DG WHEEL
UPDATE products SET
  description   = 'SLIDING DG WHEEL',
  profile_code  = NULL,
  model_no      = 'SLIDING DG WHEEL',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 650,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283557-142' AND company = 'Nippon';

-- [184] SLIDING WHEEL
UPDATE products SET
  description   = 'SLIDING WHEEL',
  profile_code  = NULL,
  model_no      = 'SLIDING WHEEL',
  brand         = NULL,
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 341,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283557-143' AND company = 'Nippon';

-- [185] SLIDING WHEEL
UPDATE products SET
  description   = 'SLIDING WHEEL',
  profile_code  = NULL,
  model_no      = 'SLIDING WHEEL',
  brand         = NULL,
  finish_color  = 'Black',
  direction     = NULL,
  material      = 'Metal',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 341,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-143' AND company = 'Nippon';

-- [186] SLIDING WHEEL DOUBLE ROLLER
UPDATE products SET
  description   = 'SLIDING WHEEL DOUBLE ROLLER',
  profile_code  = NULL,
  model_no      = 'SLIDING WHEEL DOUBLE ROLLER',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 900,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-144' AND company = 'Nippon';

-- [187] SLIDING WHEEL DOUBLE ROLLER
UPDATE products SET
  description   = 'SLIDING WHEEL DOUBLE ROLLER',
  profile_code  = NULL,
  model_no      = 'SLIDING WHEEL DOUBLE ROLLER',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 900,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283557-144' AND company = 'Nippon';

-- [188] WHEEL CENTER HOPO
UPDATE products SET
  description   = 'WHEEL CENTER HOPO',
  profile_code  = NULL,
  model_no      = 'WHEEL CENTER HOPO',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 3500,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283557-145' AND company = 'Nippon';

-- [189] WHEEL CENTER HOPO
UPDATE products SET
  description   = 'WHEEL CENTER HOPO',
  profile_code  = NULL,
  model_no      = 'WHEEL CENTER HOPO',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 3500,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-145' AND company = 'Nippon';

-- [190] WHEEL TOP
UPDATE products SET
  description   = 'WHEEL TOP',
  profile_code  = NULL,
  model_no      = 'WHEEL TOP',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Roller Wheel',
  base_price    = 1500,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283557-147' AND company = 'Nippon';

-- [191] STOPPER
UPDATE products SET
  description   = 'STOPPER',
  profile_code  = NULL,
  model_no      = 'MORE STOPER',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Stopper',
  base_price    = 250,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068179-50' AND company = 'Nippon';

-- [192] STOPPER
UPDATE products SET
  description   = 'STOPPER',
  profile_code  = NULL,
  model_no      = 'MORE STOPER',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Stopper',
  base_price    = 250,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283556-50' AND company = 'Nippon';

-- [193] STOPPER
UPDATE products SET
  description   = 'STOPPER',
  profile_code  = NULL,
  model_no      = 'STOPER',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Stopper',
  base_price    = 100,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283556-51' AND company = 'Nippon';

-- [194] STOPPER
UPDATE products SET
  description   = 'STOPPER',
  profile_code  = NULL,
  model_no      = 'STOPERS',
  brand         = NULL,
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Stopper',
  base_price    = 250,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283556-52' AND company = 'Nippon';

-- [195] STOPPER
UPDATE products SET
  description   = 'STOPPER',
  profile_code  = NULL,
  model_no      = 'LOCAL STOPER',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Stopper',
  base_price    = 250,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068179-49' AND company = 'Nippon';

-- [196] SUPPORTING BLOCK
UPDATE products SET
  description   = 'SUPPORTING BLOCK',
  profile_code  = NULL,
  model_no      = 'SUPPORTING BLOCK',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Support Block',
  base_price    = 245,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068180-91' AND company = 'Nippon';

-- [197] SUPPORTING SEAT
UPDATE products SET
  description   = 'SUPPORTING SEAT',
  profile_code  = NULL,
  model_no      = 'SUPPORTING SEAT',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Support Block',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-CDG2370-06G19-5' AND company = 'Nippon';

-- [198] TRANSMISSION LOCK
UPDATE products SET
  description   = 'TRANSMISSION LOCK',
  profile_code  = NULL,
  model_no      = 'TRANSMITTER LOCK',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Transmission Lock',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-CDG2370A' AND company = 'Nippon';

-- [199] TRANSMISSION LOCK
UPDATE products SET
  description   = 'TRANSMISSION LOCK',
  profile_code  = NULL,
  model_no      = 'TRANSMISSION LOCK',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Transmission Lock',
  base_price    = 18000,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068179-31' AND company = 'Nippon';

-- [200] MAIN TRANSMISSION ROD
UPDATE products SET
  description   = 'MAIN TRANSMISSION ROD',
  profile_code  = NULL,
  model_no      = 'MAIN TRANSMISSION ROD',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Transmission Rod',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-ZCD75X25-25' AND company = 'Nippon';

-- [201] MAIN TRANSMISSION ROD [$internalCode]
UPDATE products SET
  description   = 'MAIN TRANSMISSION ROD',
  profile_code  = 'ZCD75X25',
  model_no      = 'ZCD75X25',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Transmission Rod',
  base_price    = 0,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/ZCD75X25.png'
WHERE id = 'NIP-KL-ZCD75X25' AND company = 'Nippon';

-- [202] MAIN TRANSMISSION ROD [$internalCode]
UPDATE products SET
  description   = 'MAIN TRANSMISSION ROD',
  profile_code  = 'ZCD75X40',
  model_no      = 'ZCD75X40',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Stainless steel+Zinc alloy',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Transmission Rod',
  base_price    = 296,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/ZCD75X40.png'
WHERE id = 'NIP-KL-ZCD75X40' AND company = 'Nippon';

-- [203] MAIN TRANSMISSION ROD
UPDATE products SET
  description   = 'MAIN TRANSMISSION ROD',
  profile_code  = NULL,
  model_no      = 'MAIN TRANSMISSION',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Transmission Rod',
  base_price    = 550,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068179-76' AND company = 'Nippon';

-- [204] MAIN TRANSMISSION ROD
UPDATE products SET
  description   = 'MAIN TRANSMISSION ROD',
  profile_code  = NULL,
  model_no      = 'MAIN TRANSMISSION',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Transmission Rod',
  base_price    = 550,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283557-76' AND company = 'Nippon';

-- [205] MAIN TRANSMISSION ROD
UPDATE products SET
  description   = 'MAIN TRANSMISSION ROD',
  profile_code  = NULL,
  model_no      = 'MAIN TRANSMISSION ROD',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Transmission Rod',
  base_price    = 1425,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283557-77' AND company = 'Nippon';

-- [206] MAIN TRANSMISSION ROD
UPDATE products SET
  description   = 'MAIN TRANSMISSION ROD',
  profile_code  = NULL,
  model_no      = 'MAIN TRANSMISSION ROD',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Transmission Rod',
  base_price    = 1425,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068179-77' AND company = 'Nippon';

-- [207] MAIN TRANSMISSION ROD + PIN LENGT [$internalCode]
UPDATE products SET
  description   = 'MAIN TRANSMISSION ROD + PIN LENGT',
  profile_code  = 'ZCD75X25',
  model_no      = 'MAIN TRANSMISSION ROD STAINLESS STEEL+ZINC ALLOY PIN LENGTH=25MM',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Stainless Steel',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Transmission Rod',
  base_price    = 0,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/ZCD75X25.png'
WHERE id = 'NIP-ZCD75X25' AND company = 'Nippon';

-- [208] MAIN TRANSMISSION ROD + PIN LENGTH: 40MM [$internalCode]
UPDATE products SET
  description   = 'MAIN TRANSMISSION ROD + PIN LENGTH: 40MM',
  profile_code  = 'ZCD75X40',
  model_no      = 'MAIN TRANSMISSION ROD STAINLESS STEEL+ZINC ALLOY PIN LENGTH: 40MM',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Stainless Steel',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Transmission Rod',
  base_price    = 0,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/ZCD75X40.png'
WHERE id = 'NIP-ZCD75X40' AND company = 'Nippon';

-- [209] MIDDLE TRANSMISSION ROD [$internalCode]
UPDATE products SET
  description   = 'MIDDLE TRANSMISSION ROD',
  profile_code  = 'N36A',
  model_no      = 'MIDDLE TRANSMISSION ROD ZINC ALLOY',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Zinc alloy',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Transmission Rod',
  base_price    = 318,
  unit          = 'PCS'
WHERE id = 'NIP-N36A' AND company = 'Nippon';

-- [210] SIDE TRANSMISSION ROD [$internalCode]
UPDATE products SET
  description   = 'SIDE TRANSMISSION ROD',
  profile_code  = 'N37A',
  model_no      = 'N37A',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Zinc alloy',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Transmission Rod',
  base_price    = 0,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/N37A.png'
WHERE id = 'NIP-KL-N37A' AND company = 'Nippon';

-- [211] SIDE TRANSMISSION ROD [$internalCode]
UPDATE products SET
  description   = 'SIDE TRANSMISSION ROD',
  profile_code  = 'N39',
  model_no      = 'N39',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Zinc alloy',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Transmission Rod',
  base_price    = 166,
  unit          = 'PCS'
WHERE id = 'NIP-KL-N39' AND company = 'Nippon';

-- [212] SIDE TRANSMISSION ROD [$internalCode]
UPDATE products SET
  description   = 'SIDE TRANSMISSION ROD',
  profile_code  = 'N37A',
  model_no      = 'SIDE TRANSMISSION ROD ZINC ALLOY',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Zinc alloy',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Transmission Rod',
  base_price    = 0,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/N37A.png'
WHERE id = 'NIP-N37A' AND company = 'Nippon';

-- [213] SIDE TRANSMISSION ROD [$internalCode]
UPDATE products SET
  description   = 'SIDE TRANSMISSION ROD',
  profile_code  = 'N39',
  model_no      = 'SIDE TRANSMISSION ROD ZINC ALLOY',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Zinc alloy',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Transmission Rod',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-N39' AND company = 'Nippon';

-- [214] SIDE TRANSMISSION ROD
UPDATE products SET
  description   = 'SIDE TRANSMISSION ROD',
  profile_code  = NULL,
  model_no      = 'SIDE TRANSMISSION',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Transmission Rod',
  base_price    = 550,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283557-82' AND company = 'Nippon';

-- [215] SIDE TRANSMISSION ROD
UPDATE products SET
  description   = 'SIDE TRANSMISSION ROD',
  profile_code  = NULL,
  model_no      = 'SIDE TRANSMISSION',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Transmission Rod',
  base_price    = 550,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-82' AND company = 'Nippon';

-- [216] SIDE TRANSMISSION ROD
UPDATE products SET
  description   = 'SIDE TRANSMISSION ROD',
  profile_code  = NULL,
  model_no      = 'SIDE TRANSMITION',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Transmission Rod',
  base_price    = 650,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-83' AND company = 'Nippon';

-- [217] SIDE TRANSMISSION ROD
UPDATE products SET
  description   = 'SIDE TRANSMISSION ROD',
  profile_code  = NULL,
  model_no      = 'SIDE TRANSMITION',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Transmission Rod',
  base_price    = 650,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283557-83' AND company = 'Nippon';

-- [218] TRANSMISSION ROD [$internalCode]
UPDATE products SET
  description   = 'TRANSMISSION ROD',
  profile_code  = 'LN56',
  model_no      = 'LN56',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Transmission Rod',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-KL-LN56' AND company = 'Nippon';

-- [219] TRANSMISSION ROD [$internalCode]
UPDATE products SET
  description   = 'TRANSMISSION ROD',
  profile_code  = 'LN57',
  model_no      = 'LN57',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Transmission Rod',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-KL-LN57' AND company = 'Nippon';

-- [220] UNNAMED PRODUCT
UPDATE products SET
  description   = 'UNNAMED PRODUCT',
  profile_code  = NULL,
  model_no      = 'SCREW',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Transmission Rod',
  base_price    = 7,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068179-56' AND company = 'Nippon';

-- [221] UNNAMED PRODUCT
UPDATE products SET
  description   = 'UNNAMED PRODUCT',
  profile_code  = NULL,
  model_no      = 'SCREW',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Transmission Rod',
  base_price    = 7,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283556-56' AND company = 'Nippon';

-- [222] UNNAMED PRODUCT
UPDATE products SET
  description   = 'UNNAMED PRODUCT',
  profile_code  = NULL,
  model_no      = 'SCREWS (DIFFERENT TYPE)',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Transmission Rod',
  base_price    = 5,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-57' AND company = 'Nippon';

-- [223] UNNAMED PRODUCT
UPDATE products SET
  description   = 'UNNAMED PRODUCT',
  profile_code  = NULL,
  model_no      = 'SCREWS (DIFFERENT TYPE)',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Transmission Rod',
  base_price    = 5,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283557-57' AND company = 'Nippon';

-- [224] UNNAMED PRODUCT
UPDATE products SET
  description   = 'UNNAMED PRODUCT',
  profile_code  = NULL,
  model_no      = 'SCREWS',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Sliding',
  main_category = 'Sliding',
  sub_category  = 'Transmission Rod',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-M5X75' AND company = 'Nippon';

-- [225] ESPAG GEAR SET
UPDATE products SET
  description   = 'ESPAG GEAR SET',
  profile_code  = NULL,
  model_no      = 'ESPG SET',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Espag Gear Set',
  base_price    = 1400,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068179-21' AND company = 'Nippon';

-- [226] ESPAG GEAR SET
UPDATE products SET
  description   = 'ESPAG GEAR SET',
  profile_code  = NULL,
  model_no      = 'GEAR COMPLETE SET',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Espag Gear Set',
  base_price    = 2500,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126406-204' AND company = 'Nippon';

-- [227] ESPAG GEAR SET
UPDATE products SET
  description   = 'ESPAG GEAR SET',
  profile_code  = NULL,
  model_no      = 'GEAR SET COMPLETE',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Espag Gear Set',
  base_price    = 2500,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283558-214' AND company = 'Nippon';

-- [228] ESPAG GEAR SET
UPDATE products SET
  description   = 'ESPAG GEAR SET',
  profile_code  = NULL,
  model_no      = 'GEAR SET COMPLETE',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Espag Gear Set',
  base_price    = 2500,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126406-214' AND company = 'Nippon';

-- [229] ESPAG GEAR SET
UPDATE products SET
  description   = 'ESPAG GEAR SET',
  profile_code  = NULL,
  model_no      = 'GTEAR COMPLETE',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Espag Gear Set',
  base_price    = 1850,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126406-215' AND company = 'Nippon';

-- [230] ESPAG GEAR SET
UPDATE products SET
  description   = 'ESPAG GEAR SET',
  profile_code  = NULL,
  model_no      = 'GTEAR COMPLETE',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Espag Gear Set',
  base_price    = 1850,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283558-215' AND company = 'Nippon';

-- [231] ESPAG GEAR SET
UPDATE products SET
  description   = 'ESPAG GEAR SET',
  profile_code  = NULL,
  model_no      = 'WINDOW GEAR SET',
  brand         = NULL,
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Espag Gear Set',
  base_price    = 2213,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126406-217' AND company = 'Nippon';

-- [232] ESPAG GEAR SET
UPDATE products SET
  description   = 'ESPAG GEAR SET',
  profile_code  = NULL,
  model_no      = 'GEAR SET',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Espag Gear Set',
  base_price    = 1767,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283558-212' AND company = 'Nippon';

-- [233] ESPAG GEAR SET
UPDATE products SET
  description   = 'ESPAG GEAR SET',
  profile_code  = NULL,
  model_no      = 'GEAR SET',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = 'Metal',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Espag Gear Set',
  base_price    = 1767,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126406-212' AND company = 'Nippon';

-- [234] ESPAG GEAR SET 1200MM
UPDATE products SET
  description   = 'ESPAG GEAR SET 1200MM',
  profile_code  = NULL,
  model_no      = 'GEAR SET 1200MM',
  brand         = NULL,
  finish_color  = 'White',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Espag Gear Set',
  base_price    = 850,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068181-213' AND company = 'Nippon';

-- [235] INWARD ESPAG GEAR SET
UPDATE products SET
  description   = 'INWARD ESPAG GEAR SET',
  profile_code  = NULL,
  model_no      = 'INWARD GEAR SET',
  brand         = NULL,
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Espag Gear Set',
  base_price    = 1650,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126406-216' AND company = 'Nippon';

-- [236] OUTWARD ESPAG GEAR SET
UPDATE products SET
  description   = 'OUTWARD ESPAG GEAR SET',
  profile_code  = NULL,
  model_no      = 'OPENABLE GEAR',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Espag Gear Set',
  base_price    = 600,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068181-186' AND company = 'Nippon';

-- [237] OUTWARD ESPAG GEAR SET
UPDATE products SET
  description   = 'OUTWARD ESPAG GEAR SET',
  profile_code  = NULL,
  model_no      = 'OUTWARD GEAR',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Espag Gear Set',
  base_price    = 586,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283558-189' AND company = 'Nippon';

-- [238] TILT & TURN ESPAG GEAR SET [$internalCode]
UPDATE products SET
  description   = 'TILT & TURN ESPAG GEAR SET',
  profile_code  = 'SS304',
  model_no      = 'TILT & TURN OUTWARD',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Espag Gear Set',
  base_price    = 17631,
  unit          = 'PCS'
WHERE id = 'NIP-SS304' AND company = 'Nippon';

-- [239] ESPAG ROD
UPDATE products SET
  description   = 'ESPAG ROD',
  profile_code  = NULL,
  model_no      = 'GEAR PATTI',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Espag Rod',
  base_price    = 70,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068181-210' AND company = 'Nippon';

-- [240] ESPAG ROD
UPDATE products SET
  description   = 'ESPAG ROD',
  profile_code  = NULL,
  model_no      = 'GEAR ROD',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Espag Rod',
  base_price    = 1050,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068181-211' AND company = 'Nippon';

-- [241] ESPAG ROD
UPDATE products SET
  description   = 'ESPAG ROD',
  profile_code  = NULL,
  model_no      = 'GEAR ROD',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Espag Rod',
  base_price    = 1050,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283558-211' AND company = 'Nippon';

-- [242] ESPAG ROD
UPDATE products SET
  description   = 'ESPAG ROD',
  profile_code  = NULL,
  model_no      = 'PATI',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Espag Rod',
  base_price    = 70,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068179-73' AND company = 'Nippon';

-- [243] ESPAG ROD
UPDATE products SET
  description   = 'ESPAG ROD',
  profile_code  = NULL,
  model_no      = 'ROLL PATI',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Espag Rod',
  base_price    = 70,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-74' AND company = 'Nippon';

-- [244] ESPAG ROD
UPDATE products SET
  description   = 'ESPAG ROD',
  profile_code  = NULL,
  model_no      = 'ROLL PATI',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Espag Rod',
  base_price    = 70,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283557-74' AND company = 'Nippon';

-- [245] ESPAG ROD
UPDATE products SET
  description   = 'ESPAG ROD',
  profile_code  = NULL,
  model_no      = 'GEAR PATI',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Espag Rod',
  base_price    = 70,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283558-209' AND company = 'Nippon';

-- [246] ESPAG ROD 1000MM
UPDATE products SET
  description   = 'ESPAG ROD 1000MM',
  profile_code  = NULL,
  model_no      = 'GEAR 1000MM',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Espag Rod',
  base_price    = 650,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126406-200' AND company = 'Nippon';

-- [247] ESPAG ROD 1000MM
UPDATE products SET
  description   = 'ESPAG ROD 1000MM',
  profile_code  = NULL,
  model_no      = 'GEAR 1000MM',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Espag Rod',
  base_price    = 650,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283558-200' AND company = 'Nippon';

-- [248] ESPAG ROD 10MM
UPDATE products SET
  description   = 'ESPAG ROD 10MM',
  profile_code  = NULL,
  model_no      = 'GEAR 10MM',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Espag Rod',
  base_price    = 650,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068181-201' AND company = 'Nippon';

-- [249] ESPAG ROD 10MM
UPDATE products SET
  description   = 'ESPAG ROD 10MM',
  profile_code  = NULL,
  model_no      = 'GEAR 10MM',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Espag Rod',
  base_price    = 650,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283558-201' AND company = 'Nippon';

-- [250] ESPAG ROD 1600MM
UPDATE products SET
  description   = 'ESPAG ROD 1600MM',
  profile_code  = NULL,
  model_no      = 'GEAR 1600MM',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Espag Rod',
  base_price    = 900,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283558-202' AND company = 'Nippon';

-- [251] ESPAG ROD 1600MM
UPDATE products SET
  description   = 'ESPAG ROD 1600MM',
  profile_code  = NULL,
  model_no      = 'GEAR 1600MM',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Espag Rod',
  base_price    = 900,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126406-202' AND company = 'Nippon';

-- [252] ESPAG ROD 600MM
UPDATE products SET
  description   = 'ESPAG ROD 600MM',
  profile_code  = NULL,
  model_no      = 'GEAR 600MM',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Espag Rod',
  base_price    = 550,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068181-203' AND company = 'Nippon';

-- [253] ESPAG ROD 600MM
UPDATE products SET
  description   = 'ESPAG ROD 600MM',
  profile_code  = NULL,
  model_no      = 'GEAR 600MM',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Espag Rod',
  base_price    = 550,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283558-203' AND company = 'Nippon';

-- [254] FRICTION STAY
UPDATE products SET
  description   = 'FRICTION STAY',
  profile_code  = NULL,
  model_no      = 'FRICTION HINGE',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Friction Stay',
  base_price    = 220,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283559-264' AND company = 'Nippon';

-- [255] FRICTION STAY
UPDATE products SET
  description   = 'FRICTION STAY',
  profile_code  = NULL,
  model_no      = 'FRICTION STAY',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Friction Stay',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-HC320' AND company = 'Nippon';

-- [256] FRICTION STAY [$internalCode]
UPDATE products SET
  description   = 'FRICTION STAY',
  profile_code  = 'HC320-16',
  model_no      = 'FRICTION STAY SS304, NATURAL COLOR APPLICABLE NO GROOVE CASEMENT WINDOW L=413MM HEIGHT LESS 1500MM WIDTH LESS 750MM WEIGHT LESS 36KG OPEN ANGLE: 90DEGREE',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'SS304',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Friction Stay',
  base_price    = 100,
  unit          = 'INCH'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/HC320-16.png'
WHERE id = 'NIP-HC320-16' AND company = 'Nippon';

-- [257] FRICTION STAY [$internalCode]
UPDATE products SET
  description   = 'FRICTION STAY',
  profile_code  = 'HC320-18',
  model_no      = 'FRICTION STAY SS304, NATURAL COLOR APPLICABLE NO GROOVE CASEMENT WINDOW L=458MM HEIGHT LESS 1500MM WIDTH LESS 800MM WEIGHT LESS 38KG OPEN ANGLE: 90DEGREE',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'SS304',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Friction Stay',
  base_price    = 100,
  unit          = 'INCH'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/HC320-18.png'
WHERE id = 'NIP-HC320-18' AND company = 'Nippon';

-- [258] FRICTION STAY [$internalCode]
UPDATE products SET
  description   = 'FRICTION STAY',
  profile_code  = 'HCC40A-12',
  model_no      = 'FRICTION STAY SS304, NATURAL COLOR APPLICABLE EUROPEAN STANDARD C GROOVE CASEMENT WINDOW L=313MM HEIGHT LESS 1500MM WIDTH LESS 500MM WEIGHT LESS 30KG OPEN ANGLE: 90DEGREE',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'SS304',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Friction Stay',
  base_price    = 100,
  unit          = 'INCH'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/HCC40A-12.png'
WHERE id = 'NIP-HCC40A-12' AND company = 'Nippon';

-- [259] FRICTION STAY [$internalCode]
UPDATE products SET
  description   = 'FRICTION STAY',
  profile_code  = 'HCC40A-14',
  model_no      = 'FRICTION STAY SS304, NATURAL COLOR APPLICABLE EUROPEAN STANDARD C GROOVE CASEMENT WINDOW L=365MM HEIGHT LESS 1600MM WIDTH LESS 600MM WEIGHT LESS 34KG OPEN ANGLE: 90DEGREE',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'SS304',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Friction Stay',
  base_price    = 100,
  unit          = 'INCH'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/HCC40A-14.png'
WHERE id = 'NIP-HCC40A-14' AND company = 'Nippon';

-- [260] FRICTION STAY
UPDATE products SET
  description   = 'FRICTION STAY',
  profile_code  = NULL,
  model_no      = 'FRICTION HINGES',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Friction Stay',
  base_price    = 1350,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068182-266' AND company = 'Nippon';

-- [261] FRICTION STAY
UPDATE products SET
  description   = 'FRICTION STAY',
  profile_code  = NULL,
  model_no      = 'FRICTION STAY',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Friction Stay',
  base_price    = 1020,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126406-169' AND company = 'Nippon';

-- [262] FRICTION STAY [$internalCode]
UPDATE products SET
  description   = 'FRICTION STAY',
  profile_code  = 'HCC40A-16',
  model_no      = 'FRICTION STAY SS304, NATURAL COLOR APPLICABLE EUROPEAN STANDARD C GROOVE CASEMENT WINDOW L=416MM HEIGHT LESS 1700MM WIDTH LESS 700MM WEIGHT LESS 39KG OPEN ANGLE: 90DEGREE',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = 'SS304',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Friction Stay',
  base_price    = 100,
  unit          = 'INCH'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/HCC40A-16.png'
WHERE id = 'NIP-HCC40A-16' AND company = 'Nippon';

-- [263] FRICTION STAY 12
UPDATE products SET
  description   = 'FRICTION STAY 12',
  profile_code  = NULL,
  model_no      = 'FRICTION STAY 12|',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Friction Stay',
  base_price    = 900,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126406-171' AND company = 'Nippon';

-- [264] FRICTION STAY 12
UPDATE products SET
  description   = 'FRICTION STAY 12',
  profile_code  = NULL,
  model_no      = 'FRICTION STAY 12|',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Friction Stay',
  base_price    = 900,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283558-171' AND company = 'Nippon';

-- [265] FRICTION STAY 12"
UPDATE products SET
  description   = 'FRICTION STAY 12"',
  profile_code  = NULL,
  model_no      = 'FRICTION HINGES 12"',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Friction Stay',
  base_price    = 575,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126407-267' AND company = 'Nippon';

-- [266] FRICTION STAY 12" [$internalCode]
UPDATE products SET
  description   = 'FRICTION STAY 12"',
  profile_code  = 'HCC40A-12',
  model_no      = 'HCC40A-12',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'SS304',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Friction Stay',
  base_price    = 100,
  unit          = 'INCH'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/HCC40A-12.png'
WHERE id = 'NIP-KL-HCC40A-12' AND company = 'Nippon';

-- [267] FRICTION STAY 12" [$internalCode]
UPDATE products SET
  description   = 'FRICTION STAY 12"',
  profile_code  = 'HCC40A',
  model_no      = 'FRICTION STAY 12" (HCC40A/12',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Friction Stay',
  base_price    = 1093,
  unit          = 'PCS'
WHERE id = 'NIP-HCC40A' AND company = 'Nippon';

-- [268] FRICTION STAY 12"
UPDATE products SET
  description   = 'FRICTION STAY 12"',
  profile_code  = NULL,
  model_no      = 'FRICTION STAY 12"',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Friction Stay',
  base_price    = 812,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068181-170' AND company = 'Nippon';

-- [269] FRICTION STAY 12"
UPDATE products SET
  description   = 'FRICTION STAY 12"',
  profile_code  = NULL,
  model_no      = 'FRICTION STAY 12"',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Friction Stay',
  base_price    = 812,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283558-170' AND company = 'Nippon';

-- [270] FRICTION STAY 14"
UPDATE products SET
  description   = 'FRICTION STAY 14"',
  profile_code  = NULL,
  model_no      = 'FRICTION HINGES 14"',
  brand         = 'Hopo',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Friction Stay',
  base_price    = 1050,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283559-268' AND company = 'Nippon';

-- [271] FRICTION STAY 14"
UPDATE products SET
  description   = 'FRICTION STAY 14"',
  profile_code  = NULL,
  model_no      = 'FRICTION STAY 14"',
  brand         = 'Hopo',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Friction Stay',
  base_price    = 1246,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126406-172' AND company = 'Nippon';

-- [272] FRICTION STAY 14"
UPDATE products SET
  description   = 'FRICTION STAY 14"',
  profile_code  = NULL,
  model_no      = 'FRICTION STAY 14"',
  brand         = 'Hopo',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Friction Stay',
  base_price    = 1246,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283558-172' AND company = 'Nippon';

-- [273] FRICTION STAY 14" [$internalCode]
UPDATE products SET
  description   = 'FRICTION STAY 14"',
  profile_code  = 'HCC40A-14',
  model_no      = 'HCC40A-14',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'SS304',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Friction Stay',
  base_price    = 100,
  unit          = 'INCH'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/HCC40A-14.png'
WHERE id = 'NIP-KL-HCC40A-14' AND company = 'Nippon';

-- [274] FRICTION STAY 16" [$internalCode]
UPDATE products SET
  description   = 'FRICTION STAY 16"',
  profile_code  = 'HCC40A-16',
  model_no      = 'HCC40A-16',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'SS304',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Friction Stay',
  base_price    = 100,
  unit          = 'INCH'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/HCC40A-16.png'
WHERE id = 'NIP-KL-HCC40A-16' AND company = 'Nippon';

-- [275] FRICTION STAY 16"
UPDATE products SET
  description   = 'FRICTION STAY 16"',
  profile_code  = NULL,
  model_no      = 'FRICTION HINGES 16"',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Friction Stay',
  base_price    = 1200,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126407-269' AND company = 'Nippon';

-- [276] FRICTION STAY 16"
UPDATE products SET
  description   = 'FRICTION STAY 16"',
  profile_code  = NULL,
  model_no      = 'FRICTION STAY 16"',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Friction Stay',
  base_price    = 1200,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283558-173' AND company = 'Nippon';

-- [277] FRICTION STAY 16"
UPDATE products SET
  description   = 'FRICTION STAY 16"',
  profile_code  = NULL,
  model_no      = 'FRICTION STAY 16"',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Friction Stay',
  base_price    = 1200,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126406-173' AND company = 'Nippon';

-- [278] FRICTION STAY 16"
UPDATE products SET
  description   = 'FRICTION STAY 16"',
  profile_code  = NULL,
  model_no      = 'FRICTION STAY 16" 90DEGREE',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Friction Stay',
  base_price    = 1200,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126406-174' AND company = 'Nippon';

-- [279] FRICTION STAY 16"
UPDATE products SET
  description   = 'FRICTION STAY 16"',
  profile_code  = NULL,
  model_no      = 'FRICTION STAY 16" 90DEGREE',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Friction Stay',
  base_price    = 1200,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283558-174' AND company = 'Nippon';

-- [280] FRICTION STAY 16"
UPDATE products SET
  description   = 'FRICTION STAY 16"',
  profile_code  = NULL,
  model_no      = 'FRICTION HINGE 16"',
  brand         = 'Hopo',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Friction Stay',
  base_price    = 1360,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126407-265' AND company = 'Nippon';

-- [281] FRICTION STAY ACCESSORY [$internalCode]
UPDATE products SET
  description   = 'FRICTION STAY ACCESSORY',
  profile_code  = 'LPX14A-16',
  model_no      = 'LPX14A-16',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Friction Stay',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-KL-LPX14A-16' AND company = 'Nippon';

-- [282] FRICTION STAY ACCESSORY [$internalCode]
UPDATE products SET
  description   = 'FRICTION STAY ACCESSORY',
  profile_code  = 'LPX30A',
  model_no      = 'LPX30A',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Friction Stay',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-KL-LPX30A' AND company = 'Nippon';

-- [283] OUTWARD WINDOW HINGE
UPDATE products SET
  description   = 'OUTWARD WINDOW HINGE',
  profile_code  = NULL,
  model_no      = 'OUTWARD WINDOW HINGE',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Friction Stay',
  base_price    = 250,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283558-192' AND company = 'Nippon';

-- [284] OUTWARD WINDOW HINGE
UPDATE products SET
  description   = 'OUTWARD WINDOW HINGE',
  profile_code  = NULL,
  model_no      = 'OUTWARD WINDOW HINGE',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Friction Stay',
  base_price    = 250,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068181-192' AND company = 'Nippon';

-- [285] WINDOW HINGE [$internalCode]
UPDATE products SET
  description   = 'WINDOW HINGE',
  profile_code  = 'LCJ13',
  model_no      = 'LCJ13',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = 'Aluminium profile',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Friction Stay',
  base_price    = 800,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/LCJ13.png'
WHERE id = 'NIP-KL-LCJ13-B' AND company = 'Nippon';

-- [286] WINDOW HINGE
UPDATE products SET
  description   = 'WINDOW HINGE',
  profile_code  = NULL,
  model_no      = 'WINDOW HINGE BLACK',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Friction Stay',
  base_price    = 1750,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126407-272' AND company = 'Nippon';

-- [287] WINDOW HINGE
UPDATE products SET
  description   = 'WINDOW HINGE',
  profile_code  = NULL,
  model_no      = 'WINDOW HINGE',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Friction Stay',
  base_price    = 1450,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068182-271' AND company = 'Nippon';

-- [288] WINDOW HINGE
UPDATE products SET
  description   = 'WINDOW HINGE',
  profile_code  = NULL,
  model_no      = 'WINDOW HINGE ( J5C)',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Friction Stay',
  base_price    = 1500,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068179-10' AND company = 'Nippon';

-- [289] WINDOW HINGE
UPDATE products SET
  description   = 'WINDOW HINGE',
  profile_code  = NULL,
  model_no      = 'WINDOW HINGES',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Friction Stay',
  base_price    = 1442,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126407-273' AND company = 'Nippon';

-- [290] WINDOW HINGE
UPDATE products SET
  description   = 'WINDOW HINGE',
  profile_code  = NULL,
  model_no      = 'WINDOWS HINGES',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Friction Stay',
  base_price    = 1450,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283559-274' AND company = 'Nippon';

-- [291] WINDOW HINGE BEARINKG [$internalCode]
UPDATE products SET
  description   = 'WINDOW HINGE BEARINKG',
  profile_code  = 'LCJ13',
  model_no      = 'KIN LONG WINDOW HINGE BLACK BEARING=55KG',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Friction Stay',
  base_price    = 800,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/LCJ13.png'
WHERE id = 'NIP-LCJ13' AND company = 'Nippon';

-- [292] BI-FOLD HANDLE
UPDATE products SET
  description   = 'BI-FOLD HANDLE',
  profile_code  = NULL,
  model_no      = 'BI-FOLIDING HANDLE2',
  brand         = NULL,
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 8000,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126406-219' AND company = 'Nippon';

-- [293] COCKSPUR HANDLE
UPDATE products SET
  description   = 'COCKSPUR HANDLE',
  profile_code  = NULL,
  model_no      = 'COCKUSPUR HANDLE',
  brand         = 'FROISE',
  finish_color  = NULL,
  direction     = 'left',
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP---WHITE-LEFT' AND company = 'Nippon';

-- [294] COCKSPUR HANDLE
UPDATE products SET
  description   = 'COCKSPUR HANDLE',
  profile_code  = NULL,
  model_no      = 'COCKUSPUR HANDLE',
  brand         = 'FROISE',
  finish_color  = NULL,
  direction     = 'right',
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP---WHITE-RIGHT' AND company = 'Nippon';

-- [295] COCKSPUR HANDLE
UPDATE products SET
  description   = 'COCKSPUR HANDLE',
  profile_code  = NULL,
  model_no      = 'COCKSPUR HANDLE',
  brand         = NULL,
  finish_color  = 'White',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 575,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126406-168' AND company = 'Nippon';

-- [296] GEAR HANDLE [$internalCode]
UPDATE products SET
  description   = 'GEAR HANDLE',
  profile_code  = 'CZS133-L55',
  model_no      = 'GEAR HANDLE CZS133-L55',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 1559,
  unit          = 'PCS'
WHERE id = 'NIP-CZS133-L55' AND company = 'Nippon';

-- [297] GEAR HANDLE
UPDATE products SET
  description   = 'GEAR HANDLE',
  profile_code  = NULL,
  model_no      = 'GEAR HANDLE FLAT HANDLE',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 1400,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126406-206' AND company = 'Nippon';

-- [298] GEAR HANDLE
UPDATE products SET
  description   = 'GEAR HANDLE',
  profile_code  = NULL,
  model_no      = 'GEAR HANDLE SET',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 2350,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126406-207' AND company = 'Nippon';

-- [299] GEAR HANDLE
UPDATE products SET
  description   = 'GEAR HANDLE',
  profile_code  = NULL,
  model_no      = 'GEAR HANDLE',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 3050,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126406-205' AND company = 'Nippon';

-- [300] HANDLE
UPDATE products SET
  description   = 'HANDLE',
  profile_code  = NULL,
  model_no      = 'HANDLE',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-CZS133-L55-WHITE' AND company = 'Nippon';

-- [301] HANDLE
UPDATE products SET
  description   = 'HANDLE',
  profile_code  = NULL,
  model_no      = 'HANDLE',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-CZS160A-L55-BLACK' AND company = 'Nippon';

-- [302] HANDLE
UPDATE products SET
  description   = 'HANDLE',
  profile_code  = NULL,
  model_no      = 'KIN LONG HANDLE',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 0,
  unit          = 'SET'
WHERE id = 'NIP-SET-001' AND company = 'Nippon';

-- [303] HANDLE [$internalCode]
UPDATE products SET
  description   = 'HANDLE',
  profile_code  = 'LCZS631',
  model_no      = 'LCZS631',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = 'Left',
  material      = 'Aluminium alloy+Zinc alloy',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 2400,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/LCZS631.png'
WHERE id = 'NIP-KL-LCZS631-L' AND company = 'Nippon';

-- [304] HANDLE [$internalCode]
UPDATE products SET
  description   = 'HANDLE',
  profile_code  = 'LCZ631I',
  model_no      = 'HANDLE (LCZ631I',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = 'Right',
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 3050,
  unit          = 'SET'
WHERE id = 'NIP-LCZ631I' AND company = 'Nippon';

-- [305] HANDLE
UPDATE products SET
  description   = 'HANDLE',
  profile_code  = NULL,
  model_no      = 'HANDLE',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = 'left',
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-LCZS770-L' AND company = 'Nippon';

-- [306] HANDLE
UPDATE products SET
  description   = 'HANDLE',
  profile_code  = NULL,
  model_no      = 'HANDLE',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = 'left',
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-LCZS631-L-L55-WHITE-LEFT-55MM' AND company = 'Nippon';

-- [307] HANDLE
UPDATE products SET
  description   = 'HANDLE',
  profile_code  = NULL,
  model_no      = 'HANDLE',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = 'left',
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-LCZS631-L-L55' AND company = 'Nippon';

-- [308] HANDLE
UPDATE products SET
  description   = 'HANDLE',
  profile_code  = NULL,
  model_no      = 'HANDLE',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = 'left & right',
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-CZS332-L55' AND company = 'Nippon';

-- [309] HANDLE
UPDATE products SET
  description   = 'HANDLE',
  profile_code  = NULL,
  model_no      = 'HANDLE',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = 'right',
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-LCZS770-R-WHITE-RIGHT' AND company = 'Nippon';

-- [310] HANDLE
UPDATE products SET
  description   = 'HANDLE',
  profile_code  = NULL,
  model_no      = 'HANDLE',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = 'right',
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-LCZS770-R' AND company = 'Nippon';

-- [311] HANDLE
UPDATE products SET
  description   = 'HANDLE',
  profile_code  = NULL,
  model_no      = 'HANDLE',
  brand         = NULL,
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 1050,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126406-220' AND company = 'Nippon';

-- [312] HANDLE [$internalCode]
UPDATE products SET
  description   = 'HANDLE',
  profile_code  = 'CZS116AS',
  model_no      = 'CZS116AS',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = 'Aluminium alloy',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 3400,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/CZS116AS.png'
WHERE id = 'NIP-KL-CZS116AS-B' AND company = 'Nippon';

-- [313] HANDLE [$internalCode]
UPDATE products SET
  description   = 'HANDLE',
  profile_code  = 'CZS133',
  model_no      = 'CZS133',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = 'Aluminium alloy',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 2400,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/CZS133.png'
WHERE id = 'NIP-KL-CZS133-B' AND company = 'Nippon';

-- [314] HANDLE [$internalCode]
UPDATE products SET
  description   = 'HANDLE',
  profile_code  = 'CZS160A',
  model_no      = 'CZS160A',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = 'Aluminium alloy',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 2450,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/CZS160A.png'
WHERE id = 'NIP-KL-CZS160A-B' AND company = 'Nippon';

-- [315] HANDLE [$internalCode]
UPDATE products SET
  description   = 'HANDLE',
  profile_code  = 'CZS332',
  model_no      = 'CZS332',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = 'Aluminium alloy',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 2400,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/CZS332.png'
WHERE id = 'NIP-KL-CZS332-B' AND company = 'Nippon';

-- [316] HANDLE [$internalCode]
UPDATE products SET
  description   = 'HANDLE',
  profile_code  = 'CZS133',
  model_no      = 'KIN LONG HANDLE BLACK & WHITE TONGUE LENGTH=55MM',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 2400,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/CZS133.png'
WHERE id = 'NIP-CZS133' AND company = 'Nippon';

-- [317] HANDLE [$internalCode]
UPDATE products SET
  description   = 'HANDLE',
  profile_code  = 'CZS160A',
  model_no      = 'KIN LONG HANDLE BLACK & WHITE TONGUE LENGTH=55MM',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 2450,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/CZS160A.png'
WHERE id = 'NIP-CZS160A' AND company = 'Nippon';

-- [318] HANDLE
UPDATE products SET
  description   = 'HANDLE',
  profile_code  = NULL,
  model_no      = 'HANDLE 116AS',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 3150,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068181-221' AND company = 'Nippon';

-- [319] HANDLE [$internalCode]
UPDATE products SET
  description   = 'HANDLE',
  profile_code  = 'CZS332',
  model_no      = 'KIN LONG HANDLE BLACK, RIGHT(CAN ADJUST LEFT & RIGHT) TONGUE LENGTH=55MM',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = 'L/R',
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 2400,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/CZS332.png'
WHERE id = 'NIP-CZS332' AND company = 'Nippon';

-- [320] HANDLE [$internalCode]
UPDATE products SET
  description   = 'HANDLE',
  profile_code  = 'LCZS631',
  model_no      = 'KIN LONG HANDLE BLACK & WHITE, RIGHT,LEFT TONGUE LENGTH=55MM',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = 'L/R',
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 2400,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/LCZS631.png'
WHERE id = 'NIP-LCZS631' AND company = 'Nippon';

-- [321] HANDLE [$internalCode]
UPDATE products SET
  description   = 'HANDLE',
  profile_code  = 'LCZS770',
  model_no      = 'KIN LONG HANDLE BLACK & WHITE, RIGHT,LEFT',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = 'L/R',
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 1200,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/LCZS770.png'
WHERE id = 'NIP-LCZS770' AND company = 'Nippon';

-- [322] HANDLE
UPDATE products SET
  description   = 'HANDLE',
  profile_code  = NULL,
  model_no      = 'KIN LONG HANDLE BLACK & WHITE, RIGHT,LEFT',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = 'L/R',
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 1050,
  unit          = 'SET'
WHERE id = 'NIP-IMPORT-1779226068181-226' AND company = 'Nippon';

-- [323] HANDLE [$internalCode]
UPDATE products SET
  description   = 'HANDLE',
  profile_code  = 'LCZS631',
  model_no      = 'LCZS631',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = 'Right',
  material      = 'Aluminium alloy+Zinc alloy',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 2400,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/LCZS631.png'
WHERE id = 'NIP-KL-LCZS631-B-R' AND company = 'Nippon';

-- [324] HANDLE [$internalCode]
UPDATE products SET
  description   = 'HANDLE',
  profile_code  = 'LCZ631',
  model_no      = 'HANDLE',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = 'Right',
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 3040,
  unit          = 'PCS'
WHERE id = 'NIP-LCZ631' AND company = 'Nippon';

-- [325] HANDLE
UPDATE products SET
  description   = 'HANDLE',
  profile_code  = NULL,
  model_no      = 'HANDLE WHITE',
  brand         = NULL,
  finish_color  = 'White',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 260,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283558-223' AND company = 'Nippon';

-- [326] HANDLE [$internalCode]
UPDATE products SET
  description   = 'HANDLE',
  profile_code  = 'CZS133',
  model_no      = 'CZS133',
  brand         = 'KIN LONG',
  finish_color  = 'White',
  direction     = NULL,
  material      = 'Aluminium alloy',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 2400,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/CZS133.png'
WHERE id = 'NIP-KL-CZS133-W' AND company = 'Nippon';

-- [327] HANDLE [$internalCode]
UPDATE products SET
  description   = 'HANDLE',
  profile_code  = 'CZS160A',
  model_no      = 'CZS160A',
  brand         = 'KIN LONG',
  finish_color  = 'White',
  direction     = NULL,
  material      = 'Aluminium alloy',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 2450,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/CZS160A.png'
WHERE id = 'NIP-KL-CZS160A-W' AND company = 'Nippon';

-- [328] HANDLE ACCESSORY [$internalCode]
UPDATE products SET
  description   = 'HANDLE ACCESSORY',
  profile_code  = 'CZS100-06C-34',
  model_no      = 'CZS100-06C-34',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-KL-CZS100-06C-34' AND company = 'Nippon';

-- [329] HANDLE ACCESSORY [$internalCode]
UPDATE products SET
  description   = 'HANDLE ACCESSORY',
  profile_code  = 'CZS120AL55',
  model_no      = 'CZS120AL55',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 1278,
  unit          = 'PCS'
WHERE id = 'NIP-KL-CZS120AL55' AND company = 'Nippon';

-- [330] HANDLE ACCESSORY [$internalCode]
UPDATE products SET
  description   = 'HANDLE ACCESSORY',
  profile_code  = 'CZS631-06-34',
  model_no      = 'CZS631-06-34',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-KL-CZS631-06-34' AND company = 'Nippon';

-- [331] HANDLE ACCESSORY [$internalCode]
UPDATE products SET
  description   = 'HANDLE ACCESSORY',
  profile_code  = 'LCZS38-L24',
  model_no      = 'LCZS38-L24',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-KL-LCZS38-L24' AND company = 'Nippon';

-- [332] HANDLE SET [$internalCode]
UPDATE products SET
  description   = 'HANDLE SET',
  profile_code  = 'LCZ631-R',
  model_no      = 'HANDLE SET',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 3100,
  unit          = 'PCS'
WHERE id = 'NIP-LCZ631-R' AND company = 'Nippon';

-- [333] HANDLE SET
UPDATE products SET
  description   = 'HANDLE SET',
  profile_code  = NULL,
  model_no      = 'HANDLE SET (CZS133-L)',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 3100,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283558-222' AND company = 'Nippon';

-- [334] HANDLE SPRING BOLT LENGT [$internalCode]
UPDATE products SET
  description   = 'HANDLE SPRING BOLT LENGT',
  profile_code  = 'CZS116AS',
  model_no      = 'KIN LONG HANDLE BLACK SPRING BOLT LENGTH=54MM',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 3400,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/CZS116AS.png'
WHERE id = 'NIP-CZS116AS' AND company = 'Nippon';

-- [335] HANDLES
UPDATE products SET
  description   = 'HANDLES',
  profile_code  = NULL,
  model_no      = 'HANDLES SCREW',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 50,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283558-224' AND company = 'Nippon';

-- [336] HANDLES
UPDATE products SET
  description   = 'HANDLES',
  profile_code  = NULL,
  model_no      = 'HANDLES SCREW',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 50,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126406-224' AND company = 'Nippon';

-- [337] HOPO WINDOW HANDLE
UPDATE products SET
  description   = 'HOPO WINDOW HANDLE',
  profile_code  = NULL,
  model_no      = 'HOPO WINDOW HANDLE',
  brand         = 'Hopo',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 5800,
  unit          = 'SET'
WHERE id = 'NIP-IMPORT-1779225126406-181' AND company = 'Nippon';

-- [338] KEY LOCKING HANDLE
UPDATE products SET
  description   = 'KEY LOCKING HANDLE',
  profile_code  = NULL,
  model_no      = 'KEY LOCKING HANDLE',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 2250,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068181-225' AND company = 'Nippon';

-- [339] LIFT & SLIDE HANDLE
UPDATE products SET
  description   = 'LIFT & SLIDE HANDLE',
  profile_code  = NULL,
  model_no      = 'LIFT & SLIDE HANDLE',
  brand         = NULL,
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 14746,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-122' AND company = 'Nippon';

-- [340] LIFT & SLIDE HANDLE SET
UPDATE products SET
  description   = 'LIFT & SLIDE HANDLE SET',
  profile_code  = NULL,
  model_no      = 'LIFT & SLIDE HANDLE SET',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 15170,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068180-123' AND company = 'Nippon';

-- [341] NETTING HANDLE
UPDATE products SET
  description   = 'NETTING HANDLE',
  profile_code  = NULL,
  model_no      = 'NETTING HANDLE',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 1419,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283558-227' AND company = 'Nippon';

-- [342] OPENABLE HANDLE
UPDATE products SET
  description   = 'OPENABLE HANDLE',
  profile_code  = NULL,
  model_no      = 'OPENABLE HANDLE',
  brand         = NULL,
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 955,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068181-228' AND company = 'Nippon';

-- [343] OPENABLE HANDLE
UPDATE products SET
  description   = 'OPENABLE HANDLE',
  profile_code  = NULL,
  model_no      = 'OPENABLE DOOR HANDLE SET',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 2600,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283556-4' AND company = 'Nippon';

-- [344] OPENABLE HANDLE
UPDATE products SET
  description   = 'OPENABLE HANDLE',
  profile_code  = NULL,
  model_no      = 'OPENABLE KEY HANDLE',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 2250,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126406-229' AND company = 'Nippon';

-- [345] OPENABLE HANDLE
UPDATE products SET
  description   = 'OPENABLE HANDLE',
  profile_code  = NULL,
  model_no      = 'OPENABLE WINDOW HANDLE',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 1700,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068181-187' AND company = 'Nippon';

-- [346] OUTWARD HANDLE
UPDATE products SET
  description   = 'OUTWARD HANDLE',
  profile_code  = NULL,
  model_no      = 'OUTWARD HANDLE',
  brand         = NULL,
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 255,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126406-190' AND company = 'Nippon';

-- [347] OUTWARD HANDLE
UPDATE products SET
  description   = 'OUTWARD HANDLE',
  profile_code  = NULL,
  model_no      = 'OUTWARD HANDLE BLACK',
  brand         = NULL,
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 1255,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068181-191' AND company = 'Nippon';

-- [348] OUTWARD HANDLE
UPDATE products SET
  description   = 'OUTWARD HANDLE',
  profile_code  = NULL,
  model_no      = 'HANDLE OUTWARD',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 350,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126406-188' AND company = 'Nippon';

-- [349] SLIDING HANDLE
UPDATE products SET
  description   = 'SLIDING HANDLE',
  profile_code  = NULL,
  model_no      = 'SLIDING HANDLEBLACK',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 2250,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068181-231' AND company = 'Nippon';

-- [350] SLIDING HANDLE
UPDATE products SET
  description   = 'SLIDING HANDLE',
  profile_code  = NULL,
  model_no      = 'SLIDING HANDLE',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 950,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283558-230' AND company = 'Nippon';

-- [351] SLIDING SHORTNECK WINDOW HANDLE
UPDATE products SET
  description   = 'SLIDING SHORTNECK WINDOW HANDLE',
  profile_code  = NULL,
  model_no      = 'SLIDING SHORTNECK WINDOW HANDLE',
  brand         = 'FROISE',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP---WHITE-35MM' AND company = 'Nippon';

-- [352] TIK TAK FLAT HANDLE
UPDATE products SET
  description   = 'TIK TAK FLAT HANDLE',
  profile_code  = NULL,
  model_no      = 'TIK TAK FLAT HANDLE',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 1400,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126406-233' AND company = 'Nippon';

-- [353] TIK TAK HANDLE
UPDATE products SET
  description   = 'TIK TAK HANDLE',
  profile_code  = NULL,
  model_no      = 'TICKTAK HANDLE',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 1650,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068181-232' AND company = 'Nippon';

-- [354] TIK TAK HANDLE
UPDATE products SET
  description   = 'TIK TAK HANDLE',
  profile_code  = NULL,
  model_no      = 'TIK TOK HANDLE',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 1500,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068181-236' AND company = 'Nippon';

-- [355] TIK TAK HANDLE
UPDATE products SET
  description   = 'TIK TAK HANDLE',
  profile_code  = NULL,
  model_no      = 'TIK TAK HANDLE L/R',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = 'L/R',
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 1400,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283558-235' AND company = 'Nippon';

-- [356] TIK TAK HANDLE
UPDATE products SET
  description   = 'TIK TAK HANDLE',
  profile_code  = NULL,
  model_no      = 'TIK TAK HANDLE',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = 'Right',
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 1425,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126406-234' AND company = 'Nippon';

-- [357] WINDOW HANDLE [$internalCode]
UPDATE products SET
  description   = 'WINDOW HANDLE',
  profile_code  = 'CZS116AS-L54',
  model_no      = 'WINDOW HANDLE',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 3150,
  unit          = 'PCS'
WHERE id = 'NIP-CZS116AS-L54' AND company = 'Nippon';

-- [358] WINDOW HANDLE
UPDATE products SET
  description   = 'WINDOW HANDLE',
  profile_code  = NULL,
  model_no      = 'WINDOW HANDLE BALCK',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 1575,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126407-239' AND company = 'Nippon';

-- [359] WINDOW HANDLE
UPDATE products SET
  description   = 'WINDOW HANDLE',
  profile_code  = NULL,
  model_no      = 'WINDOW LCZ-770-R',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 1650,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283557-81' AND company = 'Nippon';

-- [360] WINDOW HANDLE
UPDATE products SET
  description   = 'WINDOW HANDLE',
  profile_code  = NULL,
  model_no      = 'WINDOW HANDLE',
  brand         = 'FROISE',
  finish_color  = NULL,
  direction     = 'Outward',
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP---BLACK-OUTWARD--40MM' AND company = 'Nippon';

-- [361] WINDOW HANDLE
UPDATE products SET
  description   = 'WINDOW HANDLE',
  profile_code  = NULL,
  model_no      = 'WINDOW HANDLE BLACK',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 2925,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126407-240' AND company = 'Nippon';

-- [362] WINDOW HANDLE
UPDATE products SET
  description   = 'WINDOW HANDLE',
  profile_code  = NULL,
  model_no      = 'WINDOW HANDLE',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 2544,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126406-237' AND company = 'Nippon';

-- [363] WINDOW HANDLE
UPDATE products SET
  description   = 'WINDOW HANDLE',
  profile_code  = NULL,
  model_no      = 'WINDOW HANDLE (JB HOUSE)',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 1400,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126406-238' AND company = 'Nippon';

-- [364] WINDOW HANDLE KEY
UPDATE products SET
  description   = 'WINDOW HANDLE KEY',
  profile_code  = NULL,
  model_no      = 'WINDOW HANDLE KEY BLACK',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 3150,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068181-241' AND company = 'Nippon';

-- [365] WINDOW HANDLE KEYLOCKING
UPDATE products SET
  description   = 'WINDOW HANDLE KEYLOCKING',
  profile_code  = NULL,
  model_no      = 'WINDOW HANDLE KEYLOCKING',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 2250,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283558-242' AND company = 'Nippon';

-- [366] WINDOW KEY HANDLE
UPDATE products SET
  description   = 'WINDOW KEY HANDLE',
  profile_code  = NULL,
  model_no      = 'WINDOW KEY HANDLE',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Handle',
  base_price    = 3150,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068181-243' AND company = 'Nippon';

-- [367] 22MM ESPAGROD TURKISH STYLE-HEAVY KEEPS
UPDATE products SET
  description   = '22MM ESPAGROD TURKISH STYLE-HEAVY KEEPS',
  profile_code  = NULL,
  model_no      = '22MM ESPAGROD TURKISH STYLE-HEAVY KEEPS',
  brand         = 'NINGBO WIDEN',
  finish_color  = NULL,
  direction     = 'outward',
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Keeps Strike',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-1400-OUTWARD-1400MM' AND company = 'Nippon';

-- [368] 22MM ESPAGROD TURKISH STYLE-HEAVY KEEPS
UPDATE products SET
  description   = '22MM ESPAGROD TURKISH STYLE-HEAVY KEEPS',
  profile_code  = NULL,
  model_no      = '22MM ESPAGROD TURKISH STYLE-HEAVY KEEPS',
  brand         = 'NINGBO WIDEN',
  finish_color  = NULL,
  direction     = 'outward',
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Keeps Strike',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP---OUTWARD-1800MM' AND company = 'Nippon';

-- [369] CYLINDER WITH KEEPS
UPDATE products SET
  description   = 'CYLINDER WITH KEEPS',
  profile_code  = NULL,
  model_no      = 'CYLINDER WITH KEEPS',
  brand         = NULL,
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Keeps Strike',
  base_price    = 2000,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283556-46' AND company = 'Nippon';

-- [370] KEEPS
UPDATE products SET
  description   = 'KEEPS',
  profile_code  = NULL,
  model_no      = 'KEEPS',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Keeps Strike',
  base_price    = 182,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-36' AND company = 'Nippon';

-- [371] KEEPS
UPDATE products SET
  description   = 'KEEPS',
  profile_code  = NULL,
  model_no      = 'KEEPS',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Keeps Strike',
  base_price    = 182,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283556-36' AND company = 'Nippon';

-- [372] OPENABLE KEEPS
UPDATE products SET
  description   = 'OPENABLE KEEPS',
  profile_code  = NULL,
  model_no      = 'KEEPS OPENABLE',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Keeps Strike',
  base_price    = 50,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068179-37' AND company = 'Nippon';

-- [373] OPENABLE KEEPS
UPDATE products SET
  description   = 'OPENABLE KEEPS',
  profile_code  = NULL,
  model_no      = 'OPENABLE KEEPS',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Keeps Strike',
  base_price    = 100,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068179-38' AND company = 'Nippon';

-- [374] OPENABLE KEEPS
UPDATE products SET
  description   = 'OPENABLE KEEPS',
  profile_code  = NULL,
  model_no      = 'OPENABLE KEEPS',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Keeps Strike',
  base_price    = 100,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283556-38' AND company = 'Nippon';

-- [375] SLIDING KEEPS
UPDATE products SET
  description   = 'SLIDING KEEPS',
  profile_code  = NULL,
  model_no      = 'SLIDING KEEPS',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Keeps Strike',
  base_price    = 150,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-39' AND company = 'Nippon';

-- [376] SLIDING KEEPS
UPDATE products SET
  description   = 'SLIDING KEEPS',
  profile_code  = NULL,
  model_no      = 'SLIDING KEEPS',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Keeps Strike',
  base_price    = 150,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283556-39' AND company = 'Nippon';

-- [377] CRESCENT LATCH WITH HOOK
UPDATE products SET
  description   = 'CRESCENT LATCH WITH HOOK',
  profile_code  = NULL,
  model_no      = 'CRESCENT LATCH WITH HOOK',
  brand         = 'NINGBO WIDEN',
  finish_color  = NULL,
  direction     = 'Left',
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Latch',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP---LEFT' AND company = 'Nippon';

-- [378] CRESCENT LATCH WITH HOOK
UPDATE products SET
  description   = 'CRESCENT LATCH WITH HOOK',
  profile_code  = NULL,
  model_no      = 'CRESCENT LATCH WITH HOOK',
  brand         = 'NINGBO WIDEN',
  finish_color  = NULL,
  direction     = 'Right',
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Latch',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP---RIGHT' AND company = 'Nippon';

-- [379] LATCH
UPDATE products SET
  description   = 'LATCH',
  profile_code  = NULL,
  model_no      = 'LATCH',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Latch',
  base_price    = 110,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283556-40' AND company = 'Nippon';

-- [380] LATCH
UPDATE products SET
  description   = 'LATCH',
  profile_code  = NULL,
  model_no      = 'LATCH WHITE',
  brand         = NULL,
  finish_color  = 'White',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Latch',
  base_price    = 145,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068179-41' AND company = 'Nippon';

-- [381] MOON LATCH
UPDATE products SET
  description   = 'MOON LATCH',
  profile_code  = NULL,
  model_no      = 'MOON LATCH',
  brand         = NULL,
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Latch',
  base_price    = 143,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283556-42' AND company = 'Nippon';

-- [382] SLIDING LATCH
UPDATE products SET
  description   = 'SLIDING LATCH',
  profile_code  = NULL,
  model_no      = 'SLIDING LATCH',
  brand         = NULL,
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Latch',
  base_price    = 125,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283556-43' AND company = 'Nippon';

-- [383] GEAR LOCKBODY SET
UPDATE products SET
  description   = 'GEAR LOCKBODY SET',
  profile_code  = NULL,
  model_no      = 'GEAR LOCKBODY SET',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Lock',
  base_price    = 5500,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126406-208' AND company = 'Nippon';

-- [384] LOCK
UPDATE products SET
  description   = 'LOCK',
  profile_code  = NULL,
  model_no      = 'LOCK',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Lock',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-ZTS218-BLACK' AND company = 'Nippon';

-- [385] LOCK HOOK
UPDATE products SET
  description   = 'LOCK HOOK',
  profile_code  = NULL,
  model_no      = 'LOCK HOOK',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Lock',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-TLS22-6-44' AND company = 'Nippon';

-- [386] LOCK HOOK
UPDATE products SET
  description   = 'LOCK HOOK',
  profile_code  = NULL,
  model_no      = 'LOCK HOOK',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Lock',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-TLS22-6' AND company = 'Nippon';

-- [387] LOCK HOOK [$internalCode]
UPDATE products SET
  description   = 'LOCK HOOK',
  profile_code  = 'TLS12-6',
  model_no      = 'TLS12-6',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = '304',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Lock',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-KL-TLS12-6' AND company = 'Nippon';

-- [388] PUSH LOCK
UPDATE products SET
  description   = 'PUSH LOCK',
  profile_code  = NULL,
  model_no      = 'POUNCH LOCK',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Lock',
  base_price    = 1500,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283556-29' AND company = 'Nippon';

-- [389] PUSH LOCK
UPDATE products SET
  description   = 'PUSH LOCK',
  profile_code  = NULL,
  model_no      = 'PUCH LOCK',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Lock',
  base_price    = 2000,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068179-30' AND company = 'Nippon';

-- [390] T-LOCK
UPDATE products SET
  description   = 'T-LOCK',
  profile_code  = NULL,
  model_no      = 'T-LOCK',
  brand         = 'NINGBO WIDEN',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Lock',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP---BLACK' AND company = 'Nippon';

-- [391] WIRE LOCK
UPDATE products SET
  description   = 'WIRE LOCK',
  profile_code  = NULL,
  model_no      = 'WIRE LOCK',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Lock',
  base_price    = 1667,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068179-32' AND company = 'Nippon';

-- [392] WIRE LOCK
UPDATE products SET
  description   = 'WIRE LOCK',
  profile_code  = NULL,
  model_no      = 'WIRE LOCK',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Lock',
  base_price    = 1667,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283556-32' AND company = 'Nippon';

-- [393] CYLINDER
UPDATE products SET
  description   = 'CYLINDER',
  profile_code  = NULL,
  model_no      = 'CYLINDER',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Lock Cylinder',
  base_price    = 2500,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-44' AND company = 'Nippon';

-- [394] CYLINDER 100MM
UPDATE products SET
  description   = 'CYLINDER 100MM',
  profile_code  = NULL,
  model_no      = 'CYLINDER 100MM',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Lock Cylinder',
  base_price    = 850,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126405-45' AND company = 'Nippon';

-- [395] LIFT & SLIDE CYLINDER
UPDATE products SET
  description   = 'LIFT & SLIDE CYLINDER',
  profile_code  = NULL,
  model_no      = 'LIFT & SLIDE CYLINDER',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Lock Cylinder',
  base_price    = 2000,
  unit          = 'SET'
WHERE id = 'NIP-IMPORT-1779225126405-47' AND company = 'Nippon';

-- [396] LIFT & SLIDE CYLINDER
UPDATE products SET
  description   = 'LIFT & SLIDE CYLINDER',
  profile_code  = NULL,
  model_no      = 'LIFT & SLIDE CYLINDER',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Lock Cylinder',
  base_price    = 2000,
  unit          = 'SET'
WHERE id = 'NIP-IMPORT-1779224283556-47' AND company = 'Nippon';

-- [397] LOCK CYLINDER
UPDATE products SET
  description   = 'LOCK CYLINDER',
  profile_code  = NULL,
  model_no      = 'LOCK CYLINDER',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Lock Cylinder',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP-KIL2857-T' AND company = 'Nippon';

-- [398] LOCK CYLINDER [$internalCode]
UPDATE products SET
  description   = 'LOCK CYLINDER',
  profile_code  = 'KIL2857/T',
  model_no      = 'KIL2857/T',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Brass',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Lock Cylinder',
  base_price    = 2013,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/KIL2857-T.jpg'
WHERE id = 'NIP-KL-KIL2857-T' AND company = 'Nippon';

-- [399] ACTIVE LOCK POINT [$internalCode]
UPDATE products SET
  description   = 'ACTIVE LOCK POINT',
  profile_code  = 'HDS8',
  model_no      = 'KIN LONG ACTIVE LOCK POINT',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Lock Point',
  base_price    = 50238,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/HDS8.jpg'
WHERE id = 'NIP-HDS8' AND company = 'Nippon';

-- [400] LOCKING PLATE [$internalCode]
UPDATE products SET
  description   = 'LOCKING PLATE',
  profile_code  = 'ZA1',
  model_no      = 'ZA1',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Locking Plate',
  base_price    = 0,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/ZA1.png'
WHERE id = 'NIP-KL-ZA1' AND company = 'Nippon';

-- [401] LOCKING PLATE [$internalCode]
UPDATE products SET
  description   = 'LOCKING PLATE',
  profile_code  = 'ZA1-6A',
  model_no      = 'ZA1-6A',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Locking Plate',
  base_price    = 130,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/ZA1-6A.png'
WHERE id = 'NIP-KL-ZA1-6A' AND company = 'Nippon';

-- [402] LOCKING PLATE [$internalCode]
UPDATE products SET
  description   = 'LOCKING PLATE',
  profile_code  = 'ZA1-6A',
  model_no      = 'LOCKING PLATE ZINC ALLOY',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Zinc alloy',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Locking Plate',
  base_price    = 0,
  unit          = 'PCS'
  ,image_url    = 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/ZA1-6A.png'
WHERE id = 'NIP-ZA1-6A' AND company = 'Nippon';

-- [403] LOCKING PLATE [$internalCode]
UPDATE products SET
  description   = 'LOCKING PLATE',
  profile_code  = 'ZAI-6A',
  model_no      = 'LOCKING PLATE',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Zinc Alloy',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Locking Plate',
  base_price    = 133,
  unit          = 'PCS'
WHERE id = 'NIP-ZAI-6A' AND company = 'Nippon';

-- [404] LOCKING PLATE
UPDATE products SET
  description   = 'LOCKING PLATE',
  profile_code  = NULL,
  model_no      = 'LOCKING PLATE',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Locking Plate',
  base_price    = 350,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283556-27' AND company = 'Nippon';

-- [405] LOCKING PLATE
UPDATE products SET
  description   = 'LOCKING PLATE',
  profile_code  = NULL,
  model_no      = 'LOCKING PLATE',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Locking Plate',
  base_price    = 350,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068179-27' AND company = 'Nippon';

-- [406] MIDDLE LOCKING PLATE
UPDATE products SET
  description   = 'MIDDLE LOCKING PLATE',
  profile_code  = NULL,
  model_no      = 'MIDDLE LOCKING PLATE',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Locking Plate',
  base_price    = 450,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068179-28' AND company = 'Nippon';

-- [407] ANTI DROP DEVICE [$internalCode]
UPDATE products SET
  description   = 'ANTI DROP DEVICE',
  profile_code  = 'FTQ25/I',
  model_no      = 'KIN LONG Anti drop Device',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Safety Device',
  base_price    = 850,
  unit          = 'PCS'
WHERE id = 'NIP-KL-FTQ25-I' AND company = 'Nippon';

-- [408] SASH LIFTER
UPDATE products SET
  description   = 'SASH LIFTER',
  profile_code  = NULL,
  model_no      = 'SASH LIFTER',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Sash Hardware',
  base_price    = 350,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126406-198' AND company = 'Nippon';

-- [409] SASH LIMITER [$internalCode]
UPDATE products SET
  description   = 'SASH LIMITER',
  profile_code  = 'FC500-14',
  model_no      = 'SASH LIMITTER',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Sash Hardware',
  base_price    = 1190,
  unit          = 'PCS'
WHERE id = 'NIP-FC500-14' AND company = 'Nippon';

-- [410] BOTTOM STAY
UPDATE products SET
  description   = 'BOTTOM STAY',
  profile_code  = NULL,
  model_no      = 'BOTTOMSTAY',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Stay',
  base_price    = 1000,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283558-164' AND company = 'Nippon';

-- [411] BOTTOM STAY
UPDATE products SET
  description   = 'BOTTOM STAY',
  profile_code  = NULL,
  model_no      = 'BOTTOM STAY',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Stay',
  base_price    = 1025,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126406-162' AND company = 'Nippon';

-- [412] BOTTOM STAY
UPDATE products SET
  description   = 'BOTTOM STAY',
  profile_code  = NULL,
  model_no      = 'BOTTOM STAY 14"',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Stay',
  base_price    = 1050,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068181-163' AND company = 'Nippon';

-- [413] BUTTON STAY 14"
UPDATE products SET
  description   = 'BUTTON STAY 14"',
  profile_code  = NULL,
  model_no      = 'BUTTON STAY 14"',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Stay',
  base_price    = 967,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283558-167' AND company = 'Nippon';

-- [414] BUTTON STAY 14"
UPDATE products SET
  description   = 'BUTTON STAY 14"',
  profile_code  = NULL,
  model_no      = 'BUTTON STAY 14"',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Stay',
  base_price    = 967,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068181-167' AND company = 'Nippon';

-- [415] LAHORI STAY
UPDATE products SET
  description   = 'LAHORI STAY',
  profile_code  = NULL,
  model_no      = 'LAHORI STAY',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Stay',
  base_price    = 900,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126406-183' AND company = 'Nippon';

-- [416] LAHORI STAY
UPDATE products SET
  description   = 'LAHORI STAY',
  profile_code  = NULL,
  model_no      = 'LAHORI STAY',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Stay',
  base_price    = 900,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283558-183' AND company = 'Nippon';

-- [417] LAHORI STAY
UPDATE products SET
  description   = 'LAHORI STAY',
  profile_code  = NULL,
  model_no      = 'PIG STAY LAHORI',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Stay',
  base_price    = 650,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126406-197' AND company = 'Nippon';

-- [418] LAHORI STAY
UPDATE products SET
  description   = 'LAHORI STAY',
  profile_code  = NULL,
  model_no      = 'PIG STAY LAHORI',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Stay',
  base_price    = 650,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283558-197' AND company = 'Nippon';

-- [419] LAHORI STAY
UPDATE products SET
  description   = 'LAHORI STAY',
  profile_code  = NULL,
  model_no      = 'STAY LAHORI',
  brand         = NULL,
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Stay',
  base_price    = 750,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283559-279' AND company = 'Nippon';

-- [420] LAHORI STAY 14"
UPDATE products SET
  description   = 'LAHORI STAY 14"',
  profile_code  = NULL,
  model_no      = 'LAHORE STAY 14"',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Stay',
  base_price    = 1050,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126406-182' AND company = 'Nippon';

-- [421] LAHORI STAY 14"
UPDATE products SET
  description   = 'LAHORI STAY 14"',
  profile_code  = NULL,
  model_no      = 'LAHORI STAY 14"',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Stay',
  base_price    = 1078,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126406-184' AND company = 'Nippon';

-- [422] LATOO STAY
UPDATE products SET
  description   = 'LATOO STAY',
  profile_code  = NULL,
  model_no      = 'LATOO STAY 8"',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Stay',
  base_price    = 250,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068181-185' AND company = 'Nippon';

-- [423] LATOO STAY
UPDATE products SET
  description   = 'LATOO STAY',
  profile_code  = NULL,
  model_no      = 'LATOO STAY 8"',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Stay',
  base_price    = 250,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283558-185' AND company = 'Nippon';

-- [424] PEG STAY
UPDATE products SET
  description   = 'PEG STAY',
  profile_code  = NULL,
  model_no      = 'PEG STAY',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = 'Metal',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Stay',
  base_price    = 925,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126406-194' AND company = 'Nippon';

-- [425] PEG STAY
UPDATE products SET
  description   = 'PEG STAY',
  profile_code  = NULL,
  model_no      = 'PEG STAY',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Stay',
  base_price    = 925,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283558-194' AND company = 'Nippon';

-- [426] PEG STAY [$internalCode]
UPDATE products SET
  description   = 'PEG STAY',
  profile_code  = 'SC200',
  model_no      = 'KIN LONG Peg Stay, SS 304 Natural color',
  brand         = 'KIN LONG',
  finish_color  = 'Silver',
  direction     = NULL,
  material      = 'SS 304',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Stay',
  base_price    = 63,
  unit          = 'INCH'
WHERE id = 'NIP-KL-SC200' AND company = 'Nippon';

-- [427] PIG STAY
UPDATE products SET
  description   = 'PIG STAY',
  profile_code  = NULL,
  model_no      = 'PIG STAY 14"',
  brand         = 'KIN LONG',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Stay',
  base_price    = 1050,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283558-196' AND company = 'Nippon';

-- [428] PIG STAY
UPDATE products SET
  description   = 'PIG STAY',
  profile_code  = NULL,
  model_no      = 'PIG STAY',
  brand         = 'KIN LONG',
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Stay',
  base_price    = 1050,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068181-195' AND company = 'Nippon';

-- [429] STAY
UPDATE products SET
  description   = 'STAY',
  profile_code  = NULL,
  model_no      = 'STAY 14"',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Stay',
  base_price    = 252,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126407-278' AND company = 'Nippon';

-- [430] STAY BAR
UPDATE products SET
  description   = 'STAY BAR',
  profile_code  = NULL,
  model_no      = 'STAY BAR 14"',
  brand         = NULL,
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Stay',
  base_price    = 1500,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779225126406-166' AND company = 'Nippon';

-- [431] STAY BAR
UPDATE products SET
  description   = 'STAY BAR',
  profile_code  = NULL,
  model_no      = 'STAY BAR',
  brand         = NULL,
  finish_color  = 'Black',
  direction     = NULL,
  material      = 'Metal',
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Stay',
  base_price    = 917,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779226068181-165' AND company = 'Nippon';

-- [432] STAY BAR
UPDATE products SET
  description   = 'STAY BAR',
  profile_code  = NULL,
  model_no      = 'STAY BAR',
  brand         = NULL,
  finish_color  = 'Black',
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Stay',
  base_price    = 917,
  unit          = 'PCS'
WHERE id = 'NIP-IMPORT-1779224283558-165' AND company = 'Nippon';

-- [433] TELESCOPIC ARM STAY
UPDATE products SET
  description   = 'TELESCOPIC ARM STAY',
  profile_code  = NULL,
  model_no      = 'TELESCOPIC ARM STAY',
  brand         = 'NINGBO WIDEN',
  finish_color  = NULL,
  direction     = NULL,
  material      = NULL,
  category      = 'Window',
  main_category = 'Window',
  sub_category  = 'Stay',
  base_price    = 0,
  unit          = 'PCS'
WHERE id = 'NIP--' AND company = 'Nippon';

COMMIT;

-- ── Verification queries ────────────────────────────────────────────
SELECT
  COUNT(*) FILTER (WHERE brand IS NOT NULL)   AS with_brand,
  COUNT(*) FILTER (WHERE profile_code IS NOT NULL) AS with_code,
  COUNT(*) FILTER (WHERE image_url IS NOT NULL)    AS with_image,
  COUNT(*) FILTER (WHERE base_price > 0)           AS with_price,
  COUNT(*) AS total
FROM products WHERE company = 'Nippon';
