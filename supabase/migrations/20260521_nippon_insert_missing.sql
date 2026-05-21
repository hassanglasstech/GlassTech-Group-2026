-- ════════════════════════════════════════════════════════════════════
-- Nippon Products — INSERT missing products only
-- Source: Nippon_Products_CLEAN (3).xlsx | 430 rows attempted
-- ON CONFLICT (id) DO NOTHING  ← existing 185 clean products UNTOUCHED
-- Generated: 2026-05-21 14:25
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- [4] GLAZEON
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-97', 'Nippon',
  'GLAZEON', NULL, 'GLAZEON BLACK', 'Harris',
  'Black', NULL, NULL,
  'Consumable', 'Consumable', 'Glazing Compound',
  850, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [5] INSULATION STRIP
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-LDG-194-HW-', 'Nippon',
  'INSULATION STRIP', NULL, 'POLYAMIDE INSULATION STRIP', 'KIN LONG',
  NULL, NULL, 'Polyamide',
  'Consumable', 'Consumable', 'Insulation Strip',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [6] INSULATION STRIP
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-LDG-194HW', 'Nippon',
  'INSULATION STRIP', 'LDG-194(HW)', 'LDG-194(HW)', 'KIN LONG',
  NULL, NULL, 'PA66GF25',
  'Consumable', 'Consumable', 'Insulation Strip',
  41053, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [7] SCREW
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-55', 'Nippon',
  'SCREW', NULL, 'SCREEW', NULL,
  NULL, NULL, 'Metal',
  'Consumable', 'Consumable', 'Screw Fastener',
  7, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [8] SCREW
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283556-55', 'Nippon',
  'SCREW', NULL, 'SCREEW', NULL,
  NULL, NULL, NULL,
  'Consumable', 'Consumable', 'Screw Fastener',
  7, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [9] SQUARE STEEL
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-LMS003-100', 'Nippon',
  'SQUARE STEEL', NULL, 'SQUARE STEEL', 'KIN LONG',
  NULL, NULL, NULL,
  'Consumable', 'Consumable', 'Screw Fastener',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [10] SILICONE SEALANT
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068180-103', 'Nippon',
  'SILICONE SEALANT', NULL, 'SILICON CLEAR', NULL,
  NULL, NULL, NULL,
  'Consumable', 'Consumable', 'Silicone Sealant',
  638, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [11] SILICONE SEALANT
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-104', 'Nippon',
  'SILICONE SEALANT', NULL, 'SILICON CLEAR RTV', NULL,
  NULL, NULL, NULL,
  'Consumable', 'Consumable', 'Silicone Sealant',
  375, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [12] SILICONE SEALANT
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-109', 'Nippon',
  'SILICONE SEALANT', NULL, 'SILICON POUCH RTV', NULL,
  NULL, NULL, NULL,
  'Consumable', 'Consumable', 'Silicone Sealant',
  850, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [13] SILICONE SEALANT
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-112', 'Nippon',
  'SILICONE SEALANT', NULL, 'SLICON POUCH', NULL,
  NULL, NULL, NULL,
  'Consumable', 'Consumable', 'Silicone Sealant',
  900, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [14] SILICONE SEALANT
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-100', 'Nippon',
  'SILICONE SEALANT', NULL, 'RTV SILICON', 'KIN LONG',
  NULL, NULL, NULL,
  'Consumable', 'Consumable', 'Silicone Sealant',
  370, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [15] SILICONE SEALANT
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-SV888-WHITE', 'Nippon',
  'SILICONE SEALANT', NULL, 'WEATHERPROOF  SILICONE', 'SIWAY',
  NULL, NULL, NULL,
  'Consumable', 'Consumable', 'Silicone Sealant',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [16] SILICONE SEALANT
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-101', 'Nippon',
  'SILICONE SEALANT', NULL, 'SILICON', NULL,
  'Black', NULL, NULL,
  'Consumable', 'Consumable', 'Silicone Sealant',
  892, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [17] SILICONE SEALANT
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-102', 'Nippon',
  'SILICONE SEALANT', NULL, 'SILICON BOTTLE', NULL,
  'Black', NULL, NULL,
  'Consumable', 'Consumable', 'Silicone Sealant',
  370, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [18] SILICONE SEALANT
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-107', 'Nippon',
  'SILICONE SEALANT', NULL, 'SILICON POUCH', NULL,
  'Black', NULL, 'Metal',
  'Consumable', 'Consumable', 'Silicone Sealant',
  868, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [19] SILICONE SEALANT
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068180-108', 'Nippon',
  'SILICONE SEALANT', NULL, 'SILICON POUCH BLACK', NULL,
  'Black', NULL, NULL,
  'Consumable', 'Consumable', 'Silicone Sealant',
  850, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [20] SILICONE SEALANT
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-107', 'Nippon',
  'SILICONE SEALANT', NULL, 'SILICON POUCH', NULL,
  'Black', NULL, NULL,
  'Consumable', 'Consumable', 'Silicone Sealant',
  868, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [21] SILICONE SEALANT
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068180-110', 'Nippon',
  'SILICONE SEALANT', NULL, 'SILICON RTV', NULL,
  'Black', NULL, NULL,
  'Consumable', 'Consumable', 'Silicone Sealant',
  369, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [22] SILICONE SEALANT
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068180-111', 'Nippon',
  'SILICONE SEALANT', NULL, 'SILICON SAUSAGE', NULL,
  'Black', NULL, NULL,
  'Consumable', 'Consumable', 'Silicone Sealant',
  850, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [23] SILICONE SEALANT
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-99', 'Nippon',
  'SILICONE SEALANT', NULL, 'NEW SILICON POUCH', NULL,
  'Black', NULL, NULL,
  'Consumable', 'Consumable', 'Silicone Sealant',
  850, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [24] SILICONE SEALANT
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-105', 'Nippon',
  'SILICONE SEALANT', NULL, 'SILICON IMPORTED', 'KIN LONG',
  'Black', NULL, NULL,
  'Consumable', 'Consumable', 'Silicone Sealant',
  730, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [25] SILICONE SEALANT
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-106', 'Nippon',
  'SILICONE SEALANT', NULL, 'SILICON PAUCH', 'KIN LONG',
  'Black', NULL, NULL,
  'Consumable', 'Consumable', 'Silicone Sealant',
  900, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [26] SILICONE SEALANT
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068180-113', 'Nippon',
  'SILICONE SEALANT', NULL, 'SLICON POUCH BLACK', 'KIN LONG',
  'Black', NULL, NULL,
  'Consumable', 'Consumable', 'Silicone Sealant',
  900, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [27] SILICONE SEALANT
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-WS601-BLACK', 'Nippon',
  'SILICONE SEALANT', 'KL-WS601', '100% Neutral Sealant Sausage Type Weatherproofing Silicone Sealant, Black, 590ml', 'KIN LONG',
  'Black', NULL, '100% Neutral',
  'Consumable', 'Consumable', 'Silicone Sealant',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [28] BUTYL TAPE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP---4-0-5MM-50M', 'Nippon',
  'BUTYL TAPE', NULL, 'BUTYL TAPE', 'SOLERON',
  NULL, NULL, NULL,
  'Consumable', 'Consumable', 'Tape Gasket',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [29] GASKET
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-114', 'Nippon',
  'GASKET', NULL, 'GASKET', NULL,
  'Black', NULL, NULL,
  'Consumable', 'Consumable', 'Tape Gasket',
  350, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [30] GASKET BUNDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-115', 'Nippon',
  'GASKET BUNDLE', NULL, 'GASKET BUNDLE', NULL,
  'White', NULL, NULL,
  'Consumable', 'Consumable', 'Tape Gasket',
  350, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [31] GASKET M4
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-116', 'Nippon',
  'GASKET M4', NULL, 'GASKET M4', 'KIN LONG',
  'Black', NULL, NULL,
  'Consumable', 'Consumable', 'Tape Gasket',
  70, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [32] KAPLAR
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-98', 'Nippon',
  'KAPLAR', NULL, 'KAPLAR', NULL,
  NULL, NULL, NULL,
  'Consumable', 'Consumable', 'Tape Gasket',
  650, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [33] DOOR SET
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-20', 'Nippon',
  'DOOR SET', NULL, 'DOOR SET', NULL,
  'Black', NULL, NULL,
  'Door', 'Door', 'Complete Set',
  9500, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [34] NON-DIGGING FLOOR SPRING
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP--H-102', 'Nippon',
  'NON-DIGGING FLOOR SPRING', NULL, 'NON-DIGGING FLOOR SPRING', 'HONGKONG HUANGXING',
  NULL, NULL, NULL,
  'Door', 'Door', 'Floor Spring',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [35] DOOR HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283556-1', 'Nippon',
  'DOOR HANDLE', NULL, 'DOOR HANDLE BLACK', 'Hopo',
  'Black', NULL, NULL,
  'Door', 'Door', 'Handle',
  11000, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [36] DOOR HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068178-1', 'Nippon',
  'DOOR HANDLE', NULL, 'DOOR HANDLE BLACK', 'Hopo',
  'Black', NULL, 'Metal',
  'Door', 'Door', 'Handle',
  11000, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [37] DOOR HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-MZS3208C', 'Nippon',
  'DOOR HANDLE', 'MZS3208C', 'DOOR HANDLE (MZS3208C, T-MSD35/I,KIL2857/T)', 'KIN LONG',
  'Black', NULL, NULL,
  'Door', 'Door', 'Handle',
  9500, 'SET', NULL
) ON CONFLICT (id) DO NOTHING;

-- [38] DOOR HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126404-0', 'Nippon',
  'DOOR HANDLE', NULL, 'DOOR HANDLE', 'KIN LONG',
  'Black', NULL, NULL,
  'Door', 'Door', 'Handle',
  7167, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [39] DOOR HANDLE SET
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-3', 'Nippon',
  'DOOR HANDLE SET', NULL, 'DOOR HANDLE SET', 'KIN LONG',
  NULL, NULL, NULL,
  'Door', 'Door', 'Handle',
  9500, 'SET', NULL
) ON CONFLICT (id) DO NOTHING;

-- [40] 2D HINGE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283559-257', 'Nippon',
  '2D HINGE', NULL, '2D HINGES', NULL,
  'Black', NULL, NULL,
  'Door', 'Door', 'Hinge',
  225, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [41] 2D HINGE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283559-258', 'Nippon',
  '2D HINGE', NULL, '2D HINGES BLACK', NULL,
  'Black', NULL, NULL,
  'Door', 'Door', 'Hinge',
  250, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [42] 2D HINGE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126407-259', 'Nippon',
  '2D HINGE', NULL, '2D HINGES WHITE', NULL,
  'White', NULL, NULL,
  'Door', 'Door', 'Hinge',
  250, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [43] 2D HINGE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068182-256', 'Nippon',
  '2D HINGE', NULL, '2D HINGE', 'KIN LONG',
  'White', NULL, NULL,
  'Door', 'Door', 'Hinge',
  270, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [44] BUTT HINGE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068182-260', 'Nippon',
  'BUTT HINGE', NULL, 'BUTT HINGE', NULL,
  'Black', NULL, NULL,
  'Door', 'Door', 'Hinge',
  160, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [45] BUTT HINGE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283559-262', 'Nippon',
  'BUTT HINGE', NULL, 'BUTT HINGES', NULL,
  'Black', NULL, NULL,
  'Door', 'Door', 'Hinge',
  160, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [46] BUTT HINGE 90MM
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126407-261', 'Nippon',
  'BUTT HINGE 90MM', NULL, 'BUTT HINGE 90MM', NULL,
  NULL, NULL, 'Metal',
  'Door', 'Door', 'Hinge',
  160, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [47] BUTT HINGE 90MM
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283559-261', 'Nippon',
  'BUTT HINGE 90MM', NULL, 'BUTT HINGE 90MM', NULL,
  NULL, NULL, NULL,
  'Door', 'Door', 'Hinge',
  160, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [48] CONCEALED HINGES
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126407-263', 'Nippon',
  'CONCEALED HINGES', NULL, 'CONSEALED HINGES', 'KIN LONG',
  NULL, NULL, 'Metal',
  'Door', 'Door', 'Hinge',
  2000, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [49] CONCEALED HINGES
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283559-263', 'Nippon',
  'CONCEALED HINGES', NULL, 'CONSEALED HINGES', 'KIN LONG',
  NULL, NULL, NULL,
  'Door', 'Door', 'Hinge',
  2000, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [50] CONSEALED DOOR HINGE MAXIMUM LOAD, 1 PAIR )
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-ZHY622', 'Nippon',
  'CONSEALED DOOR HINGE MAXIMUM LOAD, 1 PAIR )', 'ZHY622', 'KINLONG CONSEALED DOOR HINGE MAXIMUM LOAD BEARING:120KG (2 PAIR RIGHT, 1 PAIR LEFT)', 'KIN LONG',
  NULL, 'L/R', NULL,
  'Door', 'Door', 'Hinge',
  5200, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/ZHY622.png'
) ON CONFLICT (id) DO NOTHING;

-- [51] DOOR HINGE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-7', 'Nippon',
  'DOOR HINGE', NULL, 'DOOR HINGE', 'Hopo',
  'Black', NULL, NULL,
  'Door', 'Door', 'Hinge',
  2375, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [52] DOOR HINGE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283556-8', 'Nippon',
  'DOOR HINGE', NULL, 'DOOR HINGES', 'KIN LONG',
  'Black', NULL, NULL,
  'Door', 'Door', 'Hinge',
  2158, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [53] DOOR HINGE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068179-9', 'Nippon',
  'DOOR HINGE', NULL, 'DOOR HINGES BLACK', 'KIN LONG',
  'Black', NULL, NULL,
  'Door', 'Door', 'Hinge',
  2050, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [54] DOOR HINGE 100MM
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068182-255', 'Nippon',
  'DOOR HINGE 100MM', NULL, '100MM HINGES BLACK', NULL,
  'Black', NULL, NULL,
  'Door', 'Door', 'Hinge',
  175, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [55] HINGE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-T-MJ35-L', 'Nippon',
  'HINGE', NULL, 'HINGE', 'KIN LONG',
  NULL, NULL, NULL,
  'Door', 'Door', 'Hinge',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [56] NETTING HINGES
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283559-270', 'Nippon',
  'NETTING HINGES', NULL, 'NETTING HINGES', 'KIN LONG',
  'Black', NULL, NULL,
  'Door', 'Door', 'Hinge',
  1150, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [57] PIVOT HINGE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-J5C-R-BLACK', 'Nippon',
  'PIVOT HINGE', NULL, 'PIVOT HINGE', 'KIN LONG',
  NULL, NULL, NULL,
  'Door', 'Door', 'Hinge',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [58] PIVOT HINGE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-J5C-B-R', 'Nippon',
  'PIVOT HINGE', 'J5C', 'J5C', 'KIN LONG',
  'Black', 'Right', 'Aluminium profile',
  'Door', 'Door', 'Hinge',
  1700, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/J5C.jpg'
) ON CONFLICT (id) DO NOTHING;

-- [59] PIVOT HINGE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-T-MJ35-W-L', 'Nippon',
  'PIVOT HINGE', 'T-MJ35', 'T-MJ35', 'KIN LONG',
  'White', 'Left', 'Aluminium profile',
  'Door', 'Door', 'Hinge',
  2300, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/T-MJ35.jpg'
) ON CONFLICT (id) DO NOTHING;

-- [60] PIVOT HINGE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-T-MJ35-W-R', 'Nippon',
  'PIVOT HINGE', 'T-MJ35', 'T-MJ35', 'KIN LONG',
  'White', 'Right', 'Aluminium profile',
  'Door', 'Door', 'Hinge',
  2300, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/T-MJ35.jpg'
) ON CONFLICT (id) DO NOTHING;

-- [61] PIVOT HINGE & , + BEARINKG
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-J5C', 'Nippon',
  'PIVOT HINGE & , + BEARINKG', 'J5C', 'KIN LONG PIVOT HINGE BLACK & WHITE, ALUMINUM+STAINLESS STEEL BEARING=110KG', 'KIN LONG',
  'Black', NULL, 'Stainless Steel',
  'Door', 'Door', 'Hinge',
  1700, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/J5C.jpg'
) ON CONFLICT (id) DO NOTHING;

-- [62] PIVOT HINGE & , + BEARINKG
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-T-MJ35', 'Nippon',
  'PIVOT HINGE & , + BEARINKG', 'T-MJ35', 'KIN LONG PIVOT HINGE BLACK & WHITE, ALUMINUM+STAINLESS STEEL BEARING=150KG', 'KIN LONG',
  'Black', NULL, 'Stainless Steel',
  'Door', 'Door', 'Hinge',
  2300, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/T-MJ35.jpg'
) ON CONFLICT (id) DO NOTHING;

-- [63] DOOR LOCK
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-T-MSD35-II', 'Nippon',
  'DOOR LOCK', NULL, 'DOOR LOCK', 'KIN LONG',
  NULL, NULL, NULL,
  'Door', 'Door', 'Lock',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [64] DOOR HANDLE LOCK BODY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-2', 'Nippon',
  'DOOR HANDLE LOCK BODY', NULL, 'DOOR HANDLE LOCK BODY', 'Hopo',
  'Black', NULL, NULL,
  'Door', 'Door', 'Lock Body',
  15000, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [65] LOCK BODY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068179-14', 'Nippon',
  'LOCK BODY', NULL, 'DOOR LOCK BODY', 'KIN LONG',
  'Black', NULL, NULL,
  'Door', 'Door', 'Lock Body',
  7500, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [66] LOCK BODY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068179-24', 'Nippon',
  'LOCK BODY', NULL, 'LOCK BODY', NULL,
  'White', NULL, NULL,
  'Door', 'Door', 'Lock Body',
  2600, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [67] LOCK BODY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283556-25', 'Nippon',
  'LOCK BODY', NULL, 'LOCKBODY', NULL,
  'White', NULL, NULL,
  'Door', 'Door', 'Lock Body',
  2550, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [68] LOCK BODY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-16', 'Nippon',
  'LOCK BODY', NULL, 'DOOR LOCKBODY', 'KIN LONG',
  'White', NULL, 'Metal',
  'Door', 'Door', 'Lock Body',
  5860, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [69] LOCK BODY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283556-16', 'Nippon',
  'LOCK BODY', NULL, 'DOOR LOCKBODY', 'KIN LONG',
  'White', NULL, NULL,
  'Door', 'Door', 'Lock Body',
  5860, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [70] LOCK BODY 35MM
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283556-15', 'Nippon',
  'LOCK BODY 35MM', NULL, 'DOOR LOCK BODY 35MM ONLY', 'KIN LONG',
  NULL, NULL, NULL,
  'Door', 'Door', 'Lock Body',
  3500, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [71] LOCK BODY 35MM
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068179-15', 'Nippon',
  'LOCK BODY 35MM', NULL, 'DOOR LOCK BODY 35MM ONLY', 'KIN LONG',
  NULL, NULL, 'Metal',
  'Door', 'Door', 'Lock Body',
  3500, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [72] LOCK BODY 35MM
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283556-19', 'Nippon',
  'LOCK BODY 35MM', NULL, 'LOCKBODY 35MM', NULL,
  NULL, NULL, NULL,
  'Door', 'Door', 'Lock Body',
  2450, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [73] LOCK BODY SET
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-17', 'Nippon',
  'LOCK BODY SET', NULL, 'DOOR LOCKBODY SET', 'KIN LONG',
  NULL, NULL, NULL,
  'Door', 'Door', 'Lock Body',
  9500, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [74] LOCK BODY SET
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068179-26', 'Nippon',
  'LOCK BODY SET', NULL, 'LOCKBODY SET', 'KIN LONG',
  'Black', NULL, NULL,
  'Door', 'Door', 'Lock Body',
  7500, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [75] LOCK BODY SET 35MM
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-18', 'Nippon',
  'LOCK BODY SET 35MM', NULL, 'DOOR LOCKBODY SET 35MM', 'KIN LONG',
  'Black', NULL, NULL,
  'Door', 'Door', 'Lock Body',
  5500, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [76] ROUTEL
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-ATF11X', 'Nippon',
  'ROUTEL', NULL, 'ROUTEL', 'KIN LONG',
  NULL, NULL, NULL,
  'Door', 'Door', 'Patch Fitting',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [77] TOP PATCH
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KPF-20', 'Nippon',
  'TOP PATCH', NULL, 'TOP PATCH', 'HONGKONG HUANGXING',
  NULL, NULL, NULL,
  'Door', 'Door', 'Patch Fitting',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [78] DOOR SOCKET
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068179-22', 'Nippon',
  'DOOR SOCKET', NULL, 'DOOR SCOKET', NULL,
  NULL, NULL, NULL,
  'Door', 'Door', 'Socket',
  900, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [79] DOOR SOCKET
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-MCX320A', 'Nippon',
  'DOOR SOCKET', 'MCX320A', 'KIN LONG DOOR SOCKET ZINC ALLOY+STAINLESS STEEL L=300MM', 'KIN LONG',
  NULL, NULL, 'Stainless Steel',
  'Door', 'Door', 'Socket',
  950, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/MCX320A.jpg'
) ON CONFLICT (id) DO NOTHING;

-- [80] DOOR SOCKET
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-SCX500B', 'Nippon',
  'DOOR SOCKET', 'SCX500B', 'KIN LONG Door socket, Aluminium alloy+Stainless steel, L=513mm, Black', 'KIN LONG',
  'Black', NULL, 'Aluminium Alloy + Stainless Steel',
  'Door', 'Door', 'Socket',
  1600, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [81] TOWER BOLT
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-53', 'Nippon',
  'TOWER BOLT', NULL, 'TOWER BOLT', 'KIN LONG',
  NULL, NULL, 'Metal',
  'Door', 'Door', 'Tower Bolt',
  575, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [82] TOWER BOLT
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283556-53', 'Nippon',
  'TOWER BOLT', NULL, 'TOWER BOLT', 'KIN LONG',
  NULL, NULL, NULL,
  'Door', 'Door', 'Tower Bolt',
  575, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [83] TOWER BOLT
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283556-54', 'Nippon',
  'TOWER BOLT', NULL, 'TOWERBOLT', 'KIN LONG',
  NULL, NULL, NULL,
  'Door', 'Door', 'Tower Bolt',
  1500, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [84] GEORGIAN BAR
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP---WHITE-5-8MM-3M-', 'Nippon',
  'GEORGIAN BAR', NULL, 'GEORGIAN BAR', 'SOLERON',
  NULL, NULL, NULL,
  'Glass Fitting', 'Glass Fitting', 'Georgian Bar',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [85] GEORGIAN FLOWER
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-P0401-UV-DARK-GOLD-', 'Nippon',
  'GEORGIAN FLOWER', NULL, 'GEORGIAN FLOWER', 'SOLERON',
  NULL, NULL, NULL,
  'Glass Fitting', 'Glass Fitting', 'Georgian Bar',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [86] GEORGIAN FLOWER
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-P0401-WHITE', 'Nippon',
  'GEORGIAN FLOWER', NULL, 'GEORGIAN FLOWER', 'SOLERON',
  NULL, NULL, NULL,
  'Glass Fitting', 'Glass Fitting', 'Georgian Bar',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [87] BI-FOLD COMPLETE SET
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-117', 'Nippon',
  'BI-FOLD COMPLETE SET', NULL, 'BYFOLD HARDWARE', 'Hopo',
  NULL, NULL, NULL,
  'Lift and Slide', 'Lift and Slide', 'Complete Set',
  85000, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [88] LIFT & SLIDE COMPLETE SET
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068180-119', 'Nippon',
  'LIFT & SLIDE COMPLETE SET', NULL, 'LIFT & SLIDE', NULL,
  'Black', NULL, 'Metal',
  'Lift and Slide', 'Lift and Slide', 'Complete Set',
  42500, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [89] LIFT & SLIDE COMPLETE SET
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-119', 'Nippon',
  'LIFT & SLIDE COMPLETE SET', NULL, 'LIFT & SLIDE', NULL,
  'Black', NULL, NULL,
  'Lift and Slide', 'Lift and Slide', 'Complete Set',
  42500, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [90] LIFT & SLIDE COMPLETE SET
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-120', 'Nippon',
  'LIFT & SLIDE COMPLETE SET', NULL, 'LIFT & SLIDE DOOR', 'KIN LONG',
  'Black', NULL, NULL,
  'Lift and Slide', 'Lift and Slide', 'Complete Set',
  30000, 'SET', NULL
) ON CONFLICT (id) DO NOTHING;

-- [91] LIFT & SLIDE COMPLETE SET
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068180-124', 'Nippon',
  'LIFT & SLIDE COMPLETE SET', NULL, 'LIFT & SLIDE HANDLE+KEEPS+EAPAG ROD', 'KIN LONG',
  'Black', NULL, NULL,
  'Lift and Slide', 'Lift and Slide', 'Complete Set',
  20000, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [92] LIFT & SLIDE COMPLETE SET
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-125', 'Nippon',
  'LIFT & SLIDE COMPLETE SET', NULL, 'LIFT & SLIDE SET', 'KIN LONG',
  'Black', NULL, NULL,
  'Lift and Slide', 'Lift and Slide', 'Complete Set',
  20000, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [93] LIFT & SLIDE GEAR SET
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-121', 'Nippon',
  'LIFT & SLIDE GEAR SET', NULL, 'LIFT & SLIDE GEAR SET', NULL,
  NULL, NULL, NULL,
  'Lift and Slide', 'Lift and Slide', 'Gear Set',
  28500, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [94] LIFT & SLIDE GEAR SET
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-118', 'Nippon',
  'LIFT & SLIDE GEAR SET', NULL, 'LIFT & SLIDA GEAR SET', 'KIN LONG',
  NULL, NULL, NULL,
  'Lift and Slide', 'Lift and Slide', 'Gear Set',
  35000, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [95] FIBER JALI
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-58', 'Nippon',
  'FIBER JALI', NULL, 'FIBER JALI', NULL,
  NULL, NULL, 'Metal',
  'Mesh Netting', 'Mesh Netting', 'Fiber Mesh',
  3200, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [96] FIBER JALI
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-58', 'Nippon',
  'FIBER JALI', NULL, 'FIBER JALI', NULL,
  NULL, NULL, NULL,
  'Mesh Netting', 'Mesh Netting', 'Fiber Mesh',
  3200, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [97] MESH
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068179-60', 'Nippon',
  'MESH', NULL, 'SS 304 MESH BLACK', NULL,
  'Black', NULL, 'SS304',
  'Mesh Netting', 'Mesh Netting', 'SS Mesh',
  200000, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [98] SS MESH
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-59', 'Nippon',
  'SS MESH', NULL, 'S.S 304 MESH BLACK', NULL,
  'Black', NULL, NULL,
  'Mesh Netting', 'Mesh Netting', 'SS Mesh',
  150000, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [99] SS MESH
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-GTSSM0.6', 'Nippon',
  'SS MESH', 'GTSSM0.6', 'STAINLESS STEEL 304 MESH BLACK, HOLE SIZE: 2MM THICKNESS: 0.6MM', 'KIN LONG',
  'Black', NULL, 'Stainless Steel',
  'Mesh Netting', 'Mesh Netting', 'SS Mesh',
  95000, 'ROLL', NULL
) ON CONFLICT (id) DO NOTHING;

-- [100] SS MESH
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-GTSSM1', 'Nippon',
  'SS MESH', 'GTSSM1', 'STAINLESS STEEL 304 MESH BLACK, HOLE SIZE: 2MM THICKNESS: 1MM', 'KIN LONG',
  'Black', NULL, 'Stainless Steel',
  'Mesh Netting', 'Mesh Netting', 'SS Mesh',
  142500, 'ROLL', NULL
) ON CONFLICT (id) DO NOTHING;

-- [101] SS MESH
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-GTSSM1.2', 'Nippon',
  'SS MESH', 'GTSSM1.2', 'STAINLESS STEEL 304 MESH BLACK, HOLE SIZE: 2MM THICKNESS: 1.2MM', 'KIN LONG',
  'Black', NULL, 'Stainless Steel',
  'Mesh Netting', 'Mesh Netting', 'SS Mesh',
  190000, 'ROLL', NULL
) ON CONFLICT (id) DO NOTHING;

-- [102] SS MESH
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-GTSSM1.5', 'Nippon',
  'SS MESH', 'GTSSM1.5', 'STAINLESS STEEL 304 MESH BLACK, HOLE SIZE: 2MM THICKNESS: 1.5MM', 'KIN LONG',
  'Black', NULL, 'Stainless Steel',
  'Mesh Netting', 'Mesh Netting', 'SS Mesh',
  285000, 'ROLL', NULL
) ON CONFLICT (id) DO NOTHING;

-- [103] SS NETTING 1MM
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068179-61', 'Nippon',
  'SS NETTING 1MM', NULL, 'SS NETTING 1.0MM', NULL,
  NULL, NULL, NULL,
  'Mesh Netting', 'Mesh Netting', 'SS Mesh',
  27335, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [104] SS NETTING 1MM
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068179-62', 'Nippon',
  'SS NETTING 1MM', NULL, 'SS NETTING ROLL 1MM', NULL,
  NULL, NULL, NULL,
  'Mesh Netting', 'Mesh Netting', 'SS Mesh',
  130000, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [105] CONNECTOR ROD
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-146', 'Nippon',
  'CONNECTOR ROD', NULL, 'WHEEL CONNECTOR ROD', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Connecting Rod',
  650, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [106] CONNECTOR ROD
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068180-146', 'Nippon',
  'CONNECTOR ROD', NULL, 'WHEEL CONNECTOR ROD', 'KIN LONG',
  NULL, NULL, 'Metal',
  'Sliding', 'Sliding', 'Connecting Rod',
  650, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [107] INSULATION CONNECTING ROD
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-LDG-194', 'Nippon',
  'INSULATION CONNECTING ROD', 'LDG-194', 'INSULATION CONNECTING ROD USED WITH ZCD-08 & HDS8 250LM PER ROLL', 'KIN LONG',
  'Black', NULL, NULL,
  'Sliding', 'Sliding', 'Connecting Rod',
  90, 'RFT', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/LDG-194.png'
) ON CONFLICT (id) DO NOTHING;

-- [108] CONNECT PIN
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-ZCD-08X545', 'Nippon',
  'CONNECT PIN', 'ZCD-08X54.5', 'ZCD-08X54.5', 'KIN LONG',
  NULL, NULL, 'Stainless steel',
  'Sliding', 'Sliding', 'Connector Pin',
  0, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/ZCD-08X54-5.png'
) ON CONFLICT (id) DO NOTHING;

-- [109] CONNECT PIN
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-ZCD-08X54.5', 'Nippon',
  'CONNECT PIN', 'ZCD-08X54.5', 'KIN LONG CONNECT PIN 54.5 MEANS 50MM EXPOSED AFTER BEING INSTALLED ON THE ALUMINUM ROD', 'KIN LONG',
  NULL, NULL, 'Aluminum',
  'Sliding', 'Sliding', 'Connector Pin',
  0, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/ZCD-08X54-5.png'
) ON CONFLICT (id) DO NOTHING;

-- [110] CONNECT PIN
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-68', 'Nippon',
  'CONNECT PIN', NULL, 'PIN-ZCD 08', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Connector Pin',
  500, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [111] CONNECT PIN
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068179-69', 'Nippon',
  'CONNECT PIN', NULL, 'T-PIN', 'KIN LONG',
  NULL, NULL, 'Metal',
  'Sliding', 'Sliding', 'Connector Pin',
  200, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [112] CONNECT PIN
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-69', 'Nippon',
  'CONNECT PIN', NULL, 'T-PIN', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Connector Pin',
  200, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [113] CONNECTING PIN
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068179-67', 'Nippon',
  'CONNECTING PIN', NULL, 'CONNECTING PIN', 'KIN LONG',
  NULL, NULL, 'Metal',
  'Sliding', 'Sliding', 'Connector Pin',
  650, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [114] CONNECTING PIN
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-67', 'Nippon',
  'CONNECTING PIN', NULL, 'CONNECTING PIN', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Connector Pin',
  650, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [115] CONNECTOR
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-Z15', 'Nippon',
  'CONNECTOR', NULL, 'CONNECTOR', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Connector Pin',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [116] CONNECTOR
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-71', 'Nippon',
  'CONNECTOR', NULL, 'CONNECTOR', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Connector Pin',
  500, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [117] CONNECTOR ACCESSORY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-AQS10', 'Nippon',
  'CONNECTOR ACCESSORY', 'AQS10', 'AQS10', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Connector Pin',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [118] CONNECTOR ACCESSORY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-FSG-01', 'Nippon',
  'CONNECTOR ACCESSORY', 'FSG-01', 'FSG-01', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Connector Pin',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [119] CONNECTOR ACCESSORY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-FSP10', 'Nippon',
  'CONNECTOR ACCESSORY', 'FSP10', 'FSP10', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Connector Pin',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [120] CONNECTOR ACCESSORY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-FWG10A', 'Nippon',
  'CONNECTOR ACCESSORY', 'FWG10A', 'FWG10A', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Connector Pin',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [121] CONNECTOR ACCESSORY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-LCDG41', 'Nippon',
  'CONNECTOR ACCESSORY', 'LCDG41', 'LCDG41', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Connector Pin',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [122] CONNECTOR ACCESSORY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-LZA4', 'Nippon',
  'CONNECTOR ACCESSORY', 'LZA4', 'LZA4', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Connector Pin',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [123] CONNECTOR ACCESSORY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-LZB5', 'Nippon',
  'CONNECTOR ACCESSORY', 'LZB5', 'LZB5', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Connector Pin',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [124] CONNECTOR ACCESSORY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-LZCK05', 'Nippon',
  'CONNECTOR ACCESSORY', 'LZCK05', 'LZCK05', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Connector Pin',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [125] CONNECTOR ACCESSORY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-N31', 'Nippon',
  'CONNECTOR ACCESSORY', 'N31', 'N31', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Connector Pin',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [126] CONNECTOR ACCESSORY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-N33A', 'Nippon',
  'CONNECTOR ACCESSORY', 'N33A', 'N33A', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Connector Pin',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [127] CONNECTOR ACCESSORY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-N50', 'Nippon',
  'CONNECTOR ACCESSORY', 'N50', 'N50', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Connector Pin',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [128] CONNECTOR ACCESSORY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-SK29', 'Nippon',
  'CONNECTOR ACCESSORY', 'SK29', 'SK29', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Connector Pin',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [129] SPIDER CONNECTOR SPACER
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-86', 'Nippon',
  'SPIDER CONNECTOR SPACER', NULL, 'SPIDER CONNECTOR SPACER', 'KIN LONG',
  NULL, NULL, 'Metal',
  'Sliding', 'Sliding', 'Connector Pin',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [130] SPIDER CONNECTOR SPACER
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-86', 'Nippon',
  'SPIDER CONNECTOR SPACER', NULL, 'SPIDER CONNECTOR SPACER', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Connector Pin',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [131] BACK-UP BLOCK
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-CDG2370-05G23', 'Nippon',
  'BACK-UP BLOCK', NULL, 'BACK-UP BLOCK', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Cushion Block',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [132] CUSHION BLOCK
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-H50-20A', 'Nippon',
  'CUSHION BLOCK', NULL, 'CUSHION BLOCK', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Cushion Block',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [133] CUSHION BLOCK
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-131', 'Nippon',
  'CUSHION BLOCK', NULL, 'COUSION BLOCK', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Cushion Block',
  235, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [134] CUSHION BLOCK
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-H50-20', 'Nippon',
  'CUSHION BLOCK', 'H50-20', 'KIN LONG CUSHION BLOCK BLACK', 'KIN LONG',
  'Black', NULL, NULL,
  'Sliding', 'Sliding', 'Cushion Block',
  0, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/H50-20.png'
) ON CONFLICT (id) DO NOTHING;

-- [135] SLIDING GEAR
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-127', 'Nippon',
  'SLIDING GEAR', NULL, 'SLIDING GEAR', 'Hopo',
  NULL, NULL, 'Metal',
  'Sliding', 'Sliding', 'Gear Set',
  2500, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [136] SLIDING GEAR
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-127', 'Nippon',
  'SLIDING GEAR', NULL, 'SLIDING GEAR', 'Hopo',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Gear Set',
  2500, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [137] SLIDING GEAR SET
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-128', 'Nippon',
  'SLIDING GEAR SET', NULL, 'SLIDING GEAR SET', NULL,
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Gear Set',
  1650, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [138] SLIDING GEAR SET
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-129', 'Nippon',
  'SLIDING GEAR SET', NULL, 'SLIDING GEAR SET COMPLETE', 'KIN LONG',
  'Black', NULL, NULL,
  'Sliding', 'Sliding', 'Gear Set',
  2500, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [139] SLIDING GEAR SET
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-129', 'Nippon',
  'SLIDING GEAR SET', NULL, 'SLIDING GEAR SET COMPLETE', 'KIN LONG',
  'Black', NULL, 'Metal',
  'Sliding', 'Sliding', 'Gear Set',
  2500, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [140] SLIDING LOCK
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-TLS21HS-B', 'Nippon',
  'SLIDING LOCK', 'TLS21HS', 'TLS21HS', 'KIN LONG',
  'Black', NULL, 'Zinc alloy',
  'Sliding', 'Sliding', 'Lock',
  1950, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/TLS21HS.png'
) ON CONFLICT (id) DO NOTHING;

-- [141] SLIDING LOCK
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-TLS22HS-B', 'Nippon',
  'SLIDING LOCK', 'TLS22HS', 'TLS22HS', 'KIN LONG',
  'Black', NULL, 'Zinc alloy',
  'Sliding', 'Sliding', 'Lock',
  1400, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/TLS22HS.png'
) ON CONFLICT (id) DO NOTHING;

-- [142] SLIDING LOCK
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-ZTS218-B', 'Nippon',
  'SLIDING LOCK', 'ZTS218', 'ZTS218', 'KIN LONG',
  'Black', NULL, 'Zinc alloy',
  'Sliding', 'Sliding', 'Lock',
  0, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/ZTS218.png'
) ON CONFLICT (id) DO NOTHING;

-- [143] SLIDING LOCK
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-TLS12-6', 'Nippon',
  'SLIDING LOCK', 'TLS12-6', 'SLIDING LOCK WITH LOCK HOOK TLS12-6,TLS21-HS BLACK ZINC ALLOY+STAINLESS STEEL SCREW: M5*35MM', 'KIN LONG',
  'Black', NULL, 'Stainless Steel',
  'Sliding', 'Sliding', 'Lock',
  1550, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [144] SLIDING LOCK
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-TLS21HS', 'Nippon',
  'SLIDING LOCK', 'TLS21HS', 'SLIDING LOCK WITH LOCK HOOK TLS12-6 BLACK ZINC ALLOY+STAINLESS STEEL SCREW: M5*35MM', 'KIN LONG',
  'Black', NULL, 'Stainless Steel',
  'Sliding', 'Sliding', 'Lock',
  1950, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/TLS21HS.png'
) ON CONFLICT (id) DO NOTHING;

-- [145] SLIDING LOCK
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-TLS22HS', 'Nippon',
  'SLIDING LOCK', 'TLS22HS', 'SLIDING LOCK WITH LOCK HOOK TLS22-6 BLACK ALUMINIUM ALLOY+STAINLESS STEEL SCREW: M5*35MM', 'KIN LONG',
  'Black', NULL, 'Stainless Steel',
  'Sliding', 'Sliding', 'Lock',
  1400, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/TLS22HS.png'
) ON CONFLICT (id) DO NOTHING;

-- [146] SLIDING LOCK
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-TLS32', 'Nippon',
  'SLIDING LOCK', 'TLS32', 'Sliding lock with lock hook TLS22-6, Black, Aluminium alloy+Stainless steel', 'KIN LONG',
  'Black', NULL, 'Aluminium Alloy + Stainless Steel',
  'Sliding', 'Sliding', 'Lock',
  770, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/TLS32.png'
) ON CONFLICT (id) DO NOTHING;

-- [147] SLIDING PUSH LOCK
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-154', 'Nippon',
  'SLIDING PUSH LOCK', NULL, 'SLIDING PUCH LOCK', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Lock',
  2000, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [148] SLIDING PUSH LOCK
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-158', 'Nippon',
  'SLIDING PUSH LOCK', NULL, 'SLIDING PUSH LOCK KEY LOCKING', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Lock',
  2000, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [149] SLIDING PUSH LOCK
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068181-157', 'Nippon',
  'SLIDING PUSH LOCK', NULL, 'SLIDING PUSH LOCK KEY', 'KIN LONG',
  NULL, 'Right', NULL,
  'Sliding', 'Sliding', 'Lock',
  2000, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [150] SLIDING PUSH LOCK
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-155', 'Nippon',
  'SLIDING PUSH LOCK', NULL, 'SLIDING PUNCH KEY LOCK', 'KIN LONG',
  'Black', NULL, NULL,
  'Sliding', 'Sliding', 'Lock',
  2000, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [151] SLIDING PUSH LOCK
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068181-156', 'Nippon',
  'SLIDING PUSH LOCK', NULL, 'SLIDING PUSH LOCK', 'KIN LONG',
  'Black', NULL, NULL,
  'Sliding', 'Sliding', 'Lock',
  2000, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [152] BACK ROLLER
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-130', 'Nippon',
  'BACK ROLLER', NULL, 'BACK ROLLER', 'KIN LONG',
  NULL, NULL, 'Metal',
  'Sliding', 'Sliding', 'Roller Wheel',
  4350, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [153] BACK ROLLER
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-130', 'Nippon',
  'BACK ROLLER', NULL, 'BACK ROLLER', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Roller Wheel',
  4350, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [154] DG WHEEL
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-132', 'Nippon',
  'DG WHEEL', NULL, 'DG WHEEL', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Roller Wheel',
  650, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [155] DG WHEEL
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068180-132', 'Nippon',
  'DG WHEEL', NULL, 'DG WHEEL', 'KIN LONG',
  NULL, NULL, 'Metal',
  'Sliding', 'Sliding', 'Roller Wheel',
  650, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [156] DOOR ROLLER
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-ML35G19K19', 'Nippon',
  'DOOR ROLLER', 'ML35G19K19', 'DOOR ROLLER', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Roller Wheel',
  700, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [157] DOOR WHEEL
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP---RED-WHEEL-', 'Nippon',
  'DOOR WHEEL', NULL, 'DOOR WHEEL', 'NINGBO WIDEN',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Roller Wheel',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [158] DOUBLE GROOVE ROLLER
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068180-133', 'Nippon',
  'DOUBLE GROOVE ROLLER', NULL, 'DOUBLE GROOVE WHEEL', 'KIN LONG',
  NULL, NULL, 'Metal',
  'Sliding', 'Sliding', 'Roller Wheel',
  55, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [159] DOUBLE GROOVE ROLLER
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-133', 'Nippon',
  'DOUBLE GROOVE ROLLER', NULL, 'DOUBLE GROOVE WHEEL', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Roller Wheel',
  55, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [160] DOUBLE ROLLER
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-CML35G19K19-2A', 'Nippon',
  'DOUBLE ROLLER', NULL, 'DOUBLE ROLLER', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Roller Wheel',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [161] DOUBLE ROLLER
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-CML35G19K192A', 'Nippon',
  'DOUBLE ROLLER', 'CML35G19K19.2A', 'CML35G19K19.2A', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Roller Wheel',
  750, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/CML35G19K19-2A.png'
) ON CONFLICT (id) DO NOTHING;

-- [162] DOUBLE ROLLER
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-CLM35G19-K19-2A', 'Nippon',
  'DOUBLE ROLLER', 'CLM35G19-K19-2A', 'DOUBLE ROLLER', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Roller Wheel',
  650, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [163] DOUBLE ROLLER
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-137', 'Nippon',
  'DOUBLE ROLLER', NULL, 'DOUBLE WHEEL', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Roller Wheel',
  350, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [164] DOUBLE ROLLER
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068180-137', 'Nippon',
  'DOUBLE ROLLER', NULL, 'DOUBLE WHEEL', 'KIN LONG',
  NULL, NULL, 'Metal',
  'Sliding', 'Sliding', 'Roller Wheel',
  350, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [165] DOUBLE ROLLER
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068180-134', 'Nippon',
  'DOUBLE ROLLER', NULL, 'DOUBLE ROLLER', 'KIN LONG',
  'White', NULL, 'Metal',
  'Sliding', 'Sliding', 'Roller Wheel',
  601, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [166] DOUBLE ROLLER
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-134', 'Nippon',
  'DOUBLE ROLLER', NULL, 'DOUBLE ROLLER', 'KIN LONG',
  'White', NULL, NULL,
  'Sliding', 'Sliding', 'Roller Wheel',
  601, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [167] DOUBLE ROLLER CARBON STRUCTURAL STEEL + WEAR-RESISTANT PLASTIC MAXIMUM LOAD
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-CML35G19K19.2A', 'Nippon',
  'DOUBLE ROLLER CARBON STRUCTURAL STEEL + WEAR-RESISTANT PLASTIC MAXIMUM LOAD', 'CML35G19K19.2A', 'DOUBLE ROLLER CARBON STRUCTURAL STEEL + WEAR-RESISTANT PLASTIC MAXIMUM LOAD BEARING: 80KG/2PCS', 'KIN LONG',
  NULL, NULL, 'Carbon Steel',
  'Sliding', 'Sliding', 'Roller Wheel',
  750, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/CML35G19K19-2A.png'
) ON CONFLICT (id) DO NOTHING;

-- [168] DOUBLE ROLLER CARBON STRUCTURAL STEEL + WEAR-RESISTANT PLASTIC MAXIMUM LOAD
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-CML35G19K19', 'Nippon',
  'DOUBLE ROLLER CARBON STRUCTURAL STEEL + WEAR-RESISTANT PLASTIC MAXIMUM LOAD', 'CML35G19K19', 'DOUBLE ROLLER CARBON STRUCTURAL STEEL + WEAR-RESISTANT PLASTIC MAXIMUM LOAD BEARING: 80KG/2PCS (CML35G19K19.2A)', 'KIN LONG',
  'Black', NULL, 'Carbon Steel',
  'Sliding', 'Sliding', 'Roller Wheel',
  683, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [169] DOUBLE ROLLER ELECTROPLATE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068180-135', 'Nippon',
  'DOUBLE ROLLER ELECTROPLATE', NULL, 'DOUBLE ROLLER ELECTROPLATE', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Roller Wheel',
  650, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [170] DOUBLE ROLLER WHEEL
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-136', 'Nippon',
  'DOUBLE ROLLER WHEEL', NULL, 'DOUBLE ROLLER WHEEL', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Roller Wheel',
  650, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [171] DUMMY WHEEL
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-138', 'Nippon',
  'DUMMY WHEEL', NULL, 'DUMMY WHEEL', 'Hopo',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Roller Wheel',
  250, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [172] FRONT ROLLER
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068180-139', 'Nippon',
  'FRONT ROLLER', NULL, 'FRONT ROLLER', 'KIN LONG',
  NULL, NULL, 'Metal',
  'Sliding', 'Sliding', 'Roller Wheel',
  4865, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [173] FRONT ROLLER
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-139', 'Nippon',
  'FRONT ROLLER', NULL, 'FRONT ROLLER', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Roller Wheel',
  4865, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [174] LIFT & SLIDE WHEEL
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-126', 'Nippon',
  'LIFT & SLIDE WHEEL', NULL, 'LIFT & SLIDE WHEEL', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Roller Wheel',
  5500, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [175] NETTING WHEEL
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068180-141', 'Nippon',
  'NETTING WHEEL', NULL, 'NETING WHEEL', NULL,
  NULL, NULL, 'Metal',
  'Sliding', 'Sliding', 'Roller Wheel',
  18, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [176] NETTING WHEEL
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-141', 'Nippon',
  'NETTING WHEEL', NULL, 'NETING WHEEL', NULL,
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Roller Wheel',
  18, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [177] NETTING WHEEL
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-140', 'Nippon',
  'NETTING WHEEL', NULL, 'NATTING WHEEL', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Roller Wheel',
  800, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [178] NETTING WHEEL
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068180-140', 'Nippon',
  'NETTING WHEEL', NULL, 'NATTING WHEEL', 'KIN LONG',
  NULL, NULL, 'Metal',
  'Sliding', 'Sliding', 'Roller Wheel',
  800, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [179] ROLLER ACCESSORY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-LYHDX40B-R', 'Nippon',
  'ROLLER ACCESSORY', 'LYHDX40B-R', 'LYHDX40B-R', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Roller Wheel',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [180] ROLLER ACCESSORY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-LYHPS40B-R', 'Nippon',
  'ROLLER ACCESSORY', 'LYHPS40B-R', 'LYHPS40B-R', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Roller Wheel',
  0, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/LYHPS40B-R.png'
) ON CONFLICT (id) DO NOTHING;

-- [181] ROLLER ACCESSORY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-NDHA10BR', 'Nippon',
  'ROLLER ACCESSORY', 'NDHA10BR', 'NDHA10BR', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Roller Wheel',
  0, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/NDHA10BR.png'
) ON CONFLICT (id) DO NOTHING;

-- [182] ROLLER ACCESSORY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-NDHB10BR', 'Nippon',
  'ROLLER ACCESSORY', 'NDHB10BR', 'NDHB10BR', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Roller Wheel',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [183] SLIDING DG WHEEL
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-142', 'Nippon',
  'SLIDING DG WHEEL', NULL, 'SLIDING DG WHEEL', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Roller Wheel',
  650, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [184] SLIDING WHEEL
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-143', 'Nippon',
  'SLIDING WHEEL', NULL, 'SLIDING WHEEL', NULL,
  'Black', NULL, NULL,
  'Sliding', 'Sliding', 'Roller Wheel',
  341, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [185] SLIDING WHEEL
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-143', 'Nippon',
  'SLIDING WHEEL', NULL, 'SLIDING WHEEL', NULL,
  'Black', NULL, 'Metal',
  'Sliding', 'Sliding', 'Roller Wheel',
  341, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [186] SLIDING WHEEL DOUBLE ROLLER
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-144', 'Nippon',
  'SLIDING WHEEL DOUBLE ROLLER', NULL, 'SLIDING WHEEL DOUBLE ROLLER', NULL,
  NULL, NULL, 'Metal',
  'Sliding', 'Sliding', 'Roller Wheel',
  900, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [187] SLIDING WHEEL DOUBLE ROLLER
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-144', 'Nippon',
  'SLIDING WHEEL DOUBLE ROLLER', NULL, 'SLIDING WHEEL DOUBLE ROLLER', NULL,
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Roller Wheel',
  900, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [188] WHEEL CENTER HOPO
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-145', 'Nippon',
  'WHEEL CENTER HOPO', NULL, 'WHEEL CENTER HOPO', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Roller Wheel',
  3500, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [189] WHEEL CENTER HOPO
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-145', 'Nippon',
  'WHEEL CENTER HOPO', NULL, 'WHEEL CENTER HOPO', 'KIN LONG',
  NULL, NULL, 'Metal',
  'Sliding', 'Sliding', 'Roller Wheel',
  3500, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [190] WHEEL TOP
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-147', 'Nippon',
  'WHEEL TOP', NULL, 'WHEEL TOP', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Roller Wheel',
  1500, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [191] STOPPER
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068179-50', 'Nippon',
  'STOPPER', NULL, 'MORE STOPER', 'KIN LONG',
  NULL, NULL, 'Metal',
  'Sliding', 'Sliding', 'Stopper',
  250, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [192] STOPPER
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283556-50', 'Nippon',
  'STOPPER', NULL, 'MORE STOPER', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Stopper',
  250, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [193] STOPPER
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283556-51', 'Nippon',
  'STOPPER', NULL, 'STOPER', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Stopper',
  100, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [194] STOPPER
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283556-52', 'Nippon',
  'STOPPER', NULL, 'STOPERS', NULL,
  'Black', NULL, NULL,
  'Sliding', 'Sliding', 'Stopper',
  250, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [195] STOPPER
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068179-49', 'Nippon',
  'STOPPER', NULL, 'LOCAL STOPER', 'KIN LONG',
  'Black', NULL, NULL,
  'Sliding', 'Sliding', 'Stopper',
  250, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [196] SUPPORTING BLOCK
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068180-91', 'Nippon',
  'SUPPORTING BLOCK', NULL, 'SUPPORTING BLOCK', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Support Block',
  245, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [197] SUPPORTING SEAT
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-CDG2370-06G19-5', 'Nippon',
  'SUPPORTING SEAT', NULL, 'SUPPORTING SEAT', NULL,
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Support Block',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [198] TRANSMISSION LOCK
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-CDG2370A', 'Nippon',
  'TRANSMISSION LOCK', NULL, 'TRANSMITTER LOCK', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Transmission Lock',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [199] TRANSMISSION LOCK
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068179-31', 'Nippon',
  'TRANSMISSION LOCK', NULL, 'TRANSMISSION LOCK', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Transmission Lock',
  18000, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [200] MAIN TRANSMISSION ROD
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-ZCD75X25-25', 'Nippon',
  'MAIN TRANSMISSION ROD', NULL, 'MAIN TRANSMISSION ROD', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Transmission Rod',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [201] MAIN TRANSMISSION ROD
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-ZCD75X25', 'Nippon',
  'MAIN TRANSMISSION ROD', 'ZCD75X25', 'ZCD75X25', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Transmission Rod',
  0, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/ZCD75X25.png'
) ON CONFLICT (id) DO NOTHING;

-- [202] MAIN TRANSMISSION ROD
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-ZCD75X40', 'Nippon',
  'MAIN TRANSMISSION ROD', 'ZCD75X40', 'ZCD75X40', 'KIN LONG',
  NULL, NULL, 'Stainless steel+Zinc alloy',
  'Sliding', 'Sliding', 'Transmission Rod',
  296, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/ZCD75X40.png'
) ON CONFLICT (id) DO NOTHING;

-- [203] MAIN TRANSMISSION ROD
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068179-76', 'Nippon',
  'MAIN TRANSMISSION ROD', NULL, 'MAIN TRANSMISSION', 'KIN LONG',
  NULL, NULL, 'Metal',
  'Sliding', 'Sliding', 'Transmission Rod',
  550, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [204] MAIN TRANSMISSION ROD
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-76', 'Nippon',
  'MAIN TRANSMISSION ROD', NULL, 'MAIN TRANSMISSION', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Transmission Rod',
  550, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [205] MAIN TRANSMISSION ROD
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-77', 'Nippon',
  'MAIN TRANSMISSION ROD', NULL, 'MAIN TRANSMISSION ROD', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Transmission Rod',
  1425, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [206] MAIN TRANSMISSION ROD
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068179-77', 'Nippon',
  'MAIN TRANSMISSION ROD', NULL, 'MAIN TRANSMISSION ROD', 'KIN LONG',
  NULL, NULL, 'Metal',
  'Sliding', 'Sliding', 'Transmission Rod',
  1425, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [207] MAIN TRANSMISSION ROD + PIN LENGT
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-ZCD75X25', 'Nippon',
  'MAIN TRANSMISSION ROD + PIN LENGT', 'ZCD75X25', 'MAIN TRANSMISSION ROD STAINLESS STEEL+ZINC ALLOY PIN LENGTH=25MM', 'KIN LONG',
  NULL, NULL, 'Stainless Steel',
  'Sliding', 'Sliding', 'Transmission Rod',
  0, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/ZCD75X25.png'
) ON CONFLICT (id) DO NOTHING;

-- [208] MAIN TRANSMISSION ROD + PIN LENGTH: 40MM
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-ZCD75X40', 'Nippon',
  'MAIN TRANSMISSION ROD + PIN LENGTH: 40MM', 'ZCD75X40', 'MAIN TRANSMISSION ROD STAINLESS STEEL+ZINC ALLOY PIN LENGTH: 40MM', 'KIN LONG',
  NULL, NULL, 'Stainless Steel',
  'Sliding', 'Sliding', 'Transmission Rod',
  0, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/ZCD75X40.png'
) ON CONFLICT (id) DO NOTHING;

-- [209] MIDDLE TRANSMISSION ROD
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-N36A', 'Nippon',
  'MIDDLE TRANSMISSION ROD', 'N36A', 'MIDDLE TRANSMISSION ROD ZINC ALLOY', 'KIN LONG',
  NULL, NULL, 'Zinc alloy',
  'Sliding', 'Sliding', 'Transmission Rod',
  318, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [210] SIDE TRANSMISSION ROD
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-N37A', 'Nippon',
  'SIDE TRANSMISSION ROD', 'N37A', 'N37A', 'KIN LONG',
  NULL, NULL, 'Zinc alloy',
  'Sliding', 'Sliding', 'Transmission Rod',
  0, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/N37A.png'
) ON CONFLICT (id) DO NOTHING;

-- [211] SIDE TRANSMISSION ROD
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-N39', 'Nippon',
  'SIDE TRANSMISSION ROD', 'N39', 'N39', 'KIN LONG',
  NULL, NULL, 'Zinc alloy',
  'Sliding', 'Sliding', 'Transmission Rod',
  166, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [212] SIDE TRANSMISSION ROD
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-N37A', 'Nippon',
  'SIDE TRANSMISSION ROD', 'N37A', 'SIDE TRANSMISSION ROD ZINC ALLOY', 'KIN LONG',
  NULL, NULL, 'Zinc alloy',
  'Sliding', 'Sliding', 'Transmission Rod',
  0, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/N37A.png'
) ON CONFLICT (id) DO NOTHING;

-- [213] SIDE TRANSMISSION ROD
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-N39', 'Nippon',
  'SIDE TRANSMISSION ROD', 'N39', 'SIDE TRANSMISSION ROD ZINC ALLOY', 'KIN LONG',
  NULL, NULL, 'Zinc alloy',
  'Sliding', 'Sliding', 'Transmission Rod',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [214] SIDE TRANSMISSION ROD
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-82', 'Nippon',
  'SIDE TRANSMISSION ROD', NULL, 'SIDE TRANSMISSION', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Transmission Rod',
  550, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [215] SIDE TRANSMISSION ROD
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-82', 'Nippon',
  'SIDE TRANSMISSION ROD', NULL, 'SIDE TRANSMISSION', 'KIN LONG',
  NULL, NULL, 'Metal',
  'Sliding', 'Sliding', 'Transmission Rod',
  550, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [216] SIDE TRANSMISSION ROD
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-83', 'Nippon',
  'SIDE TRANSMISSION ROD', NULL, 'SIDE TRANSMITION', 'KIN LONG',
  NULL, NULL, 'Metal',
  'Sliding', 'Sliding', 'Transmission Rod',
  650, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [217] SIDE TRANSMISSION ROD
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-83', 'Nippon',
  'SIDE TRANSMISSION ROD', NULL, 'SIDE TRANSMITION', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Transmission Rod',
  650, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [218] TRANSMISSION ROD
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-LN56', 'Nippon',
  'TRANSMISSION ROD', 'LN56', 'LN56', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Transmission Rod',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [219] TRANSMISSION ROD
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-LN57', 'Nippon',
  'TRANSMISSION ROD', 'LN57', 'LN57', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Transmission Rod',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [220] UNNAMED PRODUCT
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068179-56', 'Nippon',
  'UNNAMED PRODUCT', NULL, 'SCREW', NULL,
  NULL, NULL, 'Metal',
  'Sliding', 'Sliding', 'Transmission Rod',
  7, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [221] UNNAMED PRODUCT
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283556-56', 'Nippon',
  'UNNAMED PRODUCT', NULL, 'SCREW', NULL,
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Transmission Rod',
  7, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [222] UNNAMED PRODUCT
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-57', 'Nippon',
  'UNNAMED PRODUCT', NULL, 'SCREWS (DIFFERENT TYPE)', NULL,
  NULL, NULL, 'Metal',
  'Sliding', 'Sliding', 'Transmission Rod',
  5, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [223] UNNAMED PRODUCT
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-57', 'Nippon',
  'UNNAMED PRODUCT', NULL, 'SCREWS (DIFFERENT TYPE)', NULL,
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Transmission Rod',
  5, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [224] UNNAMED PRODUCT
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-M5X75', 'Nippon',
  'UNNAMED PRODUCT', NULL, 'SCREWS', 'KIN LONG',
  NULL, NULL, NULL,
  'Sliding', 'Sliding', 'Transmission Rod',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [225] ESPAG GEAR SET
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068179-21', 'Nippon',
  'ESPAG GEAR SET', NULL, 'ESPG SET', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Espag Gear Set',
  1400, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [226] ESPAG GEAR SET
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-204', 'Nippon',
  'ESPAG GEAR SET', NULL, 'GEAR COMPLETE SET', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Espag Gear Set',
  2500, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [227] ESPAG GEAR SET
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283558-214', 'Nippon',
  'ESPAG GEAR SET', NULL, 'GEAR SET COMPLETE', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Espag Gear Set',
  2500, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [228] ESPAG GEAR SET
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-214', 'Nippon',
  'ESPAG GEAR SET', NULL, 'GEAR SET COMPLETE', 'KIN LONG',
  NULL, NULL, 'Metal',
  'Window', 'Window', 'Espag Gear Set',
  2500, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [229] ESPAG GEAR SET
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-215', 'Nippon',
  'ESPAG GEAR SET', NULL, 'GTEAR COMPLETE', 'KIN LONG',
  NULL, NULL, 'Metal',
  'Window', 'Window', 'Espag Gear Set',
  1850, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [230] ESPAG GEAR SET
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283558-215', 'Nippon',
  'ESPAG GEAR SET', NULL, 'GTEAR COMPLETE', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Espag Gear Set',
  1850, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [231] ESPAG GEAR SET
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-217', 'Nippon',
  'ESPAG GEAR SET', NULL, 'WINDOW GEAR SET', NULL,
  'Black', NULL, NULL,
  'Window', 'Window', 'Espag Gear Set',
  2213, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [232] ESPAG GEAR SET
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283558-212', 'Nippon',
  'ESPAG GEAR SET', NULL, 'GEAR SET', 'KIN LONG',
  'Black', NULL, NULL,
  'Window', 'Window', 'Espag Gear Set',
  1767, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [233] ESPAG GEAR SET
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-212', 'Nippon',
  'ESPAG GEAR SET', NULL, 'GEAR SET', 'KIN LONG',
  'Black', NULL, 'Metal',
  'Window', 'Window', 'Espag Gear Set',
  1767, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [234] ESPAG GEAR SET 1200MM
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068181-213', 'Nippon',
  'ESPAG GEAR SET 1200MM', NULL, 'GEAR SET 1200MM', NULL,
  'White', NULL, NULL,
  'Window', 'Window', 'Espag Gear Set',
  850, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [235] INWARD ESPAG GEAR SET
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-216', 'Nippon',
  'INWARD ESPAG GEAR SET', NULL, 'INWARD GEAR SET', NULL,
  'Black', NULL, NULL,
  'Window', 'Window', 'Espag Gear Set',
  1650, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [236] OUTWARD ESPAG GEAR SET
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068181-186', 'Nippon',
  'OUTWARD ESPAG GEAR SET', NULL, 'OPENABLE GEAR', NULL,
  NULL, NULL, NULL,
  'Window', 'Window', 'Espag Gear Set',
  600, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [237] OUTWARD ESPAG GEAR SET
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283558-189', 'Nippon',
  'OUTWARD ESPAG GEAR SET', NULL, 'OUTWARD GEAR', NULL,
  NULL, NULL, NULL,
  'Window', 'Window', 'Espag Gear Set',
  586, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [238] TILT & TURN ESPAG GEAR SET
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-SS304', 'Nippon',
  'TILT & TURN ESPAG GEAR SET', 'SS304', 'TILT & TURN OUTWARD', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Espag Gear Set',
  17631, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [239] ESPAG ROD
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068181-210', 'Nippon',
  'ESPAG ROD', NULL, 'GEAR PATTI', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Espag Rod',
  70, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [240] ESPAG ROD
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068181-211', 'Nippon',
  'ESPAG ROD', NULL, 'GEAR ROD', 'KIN LONG',
  NULL, NULL, 'Metal',
  'Window', 'Window', 'Espag Rod',
  1050, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [241] ESPAG ROD
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283558-211', 'Nippon',
  'ESPAG ROD', NULL, 'GEAR ROD', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Espag Rod',
  1050, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [242] ESPAG ROD
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068179-73', 'Nippon',
  'ESPAG ROD', NULL, 'PATI', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Espag Rod',
  70, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [243] ESPAG ROD
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-74', 'Nippon',
  'ESPAG ROD', NULL, 'ROLL PATI', 'KIN LONG',
  NULL, NULL, 'Metal',
  'Window', 'Window', 'Espag Rod',
  70, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [244] ESPAG ROD
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-74', 'Nippon',
  'ESPAG ROD', NULL, 'ROLL PATI', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Espag Rod',
  70, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [245] ESPAG ROD
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283558-209', 'Nippon',
  'ESPAG ROD', NULL, 'GEAR PATI', 'KIN LONG',
  'Black', NULL, NULL,
  'Window', 'Window', 'Espag Rod',
  70, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [246] ESPAG ROD 1000MM
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-200', 'Nippon',
  'ESPAG ROD 1000MM', NULL, 'GEAR 1000MM', NULL,
  NULL, NULL, 'Metal',
  'Window', 'Window', 'Espag Rod',
  650, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [247] ESPAG ROD 1000MM
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283558-200', 'Nippon',
  'ESPAG ROD 1000MM', NULL, 'GEAR 1000MM', NULL,
  NULL, NULL, NULL,
  'Window', 'Window', 'Espag Rod',
  650, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [248] ESPAG ROD 10MM
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068181-201', 'Nippon',
  'ESPAG ROD 10MM', NULL, 'GEAR 10MM', NULL,
  NULL, NULL, 'Metal',
  'Window', 'Window', 'Espag Rod',
  650, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [249] ESPAG ROD 10MM
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283558-201', 'Nippon',
  'ESPAG ROD 10MM', NULL, 'GEAR 10MM', NULL,
  NULL, NULL, NULL,
  'Window', 'Window', 'Espag Rod',
  650, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [250] ESPAG ROD 1600MM
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283558-202', 'Nippon',
  'ESPAG ROD 1600MM', NULL, 'GEAR 1600MM', NULL,
  NULL, NULL, NULL,
  'Window', 'Window', 'Espag Rod',
  900, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [251] ESPAG ROD 1600MM
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-202', 'Nippon',
  'ESPAG ROD 1600MM', NULL, 'GEAR 1600MM', NULL,
  NULL, NULL, 'Metal',
  'Window', 'Window', 'Espag Rod',
  900, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [252] ESPAG ROD 600MM
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068181-203', 'Nippon',
  'ESPAG ROD 600MM', NULL, 'GEAR 600MM', NULL,
  NULL, NULL, 'Metal',
  'Window', 'Window', 'Espag Rod',
  550, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [253] ESPAG ROD 600MM
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283558-203', 'Nippon',
  'ESPAG ROD 600MM', NULL, 'GEAR 600MM', NULL,
  NULL, NULL, NULL,
  'Window', 'Window', 'Espag Rod',
  550, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [254] FRICTION STAY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283559-264', 'Nippon',
  'FRICTION STAY', NULL, 'FRICTION HINGE', NULL,
  NULL, NULL, NULL,
  'Window', 'Window', 'Friction Stay',
  220, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [255] FRICTION STAY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-HC320', 'Nippon',
  'FRICTION STAY', NULL, 'FRICTION STAY', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Friction Stay',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [256] FRICTION STAY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-HC320-16', 'Nippon',
  'FRICTION STAY', 'HC320-16', 'FRICTION STAY SS304, NATURAL COLOR APPLICABLE NO GROOVE CASEMENT WINDOW L=413MM HEIGHT LESS 1500MM WIDTH LESS 750MM WEIGHT LESS 36KG OPEN ANGLE: 90DEGREE', 'KIN LONG',
  NULL, NULL, 'SS304',
  'Window', 'Window', 'Friction Stay',
  100, 'INCH', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/HC320-16.png'
) ON CONFLICT (id) DO NOTHING;

-- [257] FRICTION STAY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-HC320-18', 'Nippon',
  'FRICTION STAY', 'HC320-18', 'FRICTION STAY SS304, NATURAL COLOR APPLICABLE NO GROOVE CASEMENT WINDOW L=458MM HEIGHT LESS 1500MM WIDTH LESS 800MM WEIGHT LESS 38KG OPEN ANGLE: 90DEGREE', 'KIN LONG',
  NULL, NULL, 'SS304',
  'Window', 'Window', 'Friction Stay',
  100, 'INCH', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/HC320-18.png'
) ON CONFLICT (id) DO NOTHING;

-- [258] FRICTION STAY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-HCC40A-12', 'Nippon',
  'FRICTION STAY', 'HCC40A-12', 'FRICTION STAY SS304, NATURAL COLOR APPLICABLE EUROPEAN STANDARD C GROOVE CASEMENT WINDOW L=313MM HEIGHT LESS 1500MM WIDTH LESS 500MM WEIGHT LESS 30KG OPEN ANGLE: 90DEGREE', 'KIN LONG',
  NULL, NULL, 'SS304',
  'Window', 'Window', 'Friction Stay',
  100, 'INCH', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/HCC40A-12.png'
) ON CONFLICT (id) DO NOTHING;

-- [259] FRICTION STAY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-HCC40A-14', 'Nippon',
  'FRICTION STAY', 'HCC40A-14', 'FRICTION STAY SS304, NATURAL COLOR APPLICABLE EUROPEAN STANDARD C GROOVE CASEMENT WINDOW L=365MM HEIGHT LESS 1600MM WIDTH LESS 600MM WEIGHT LESS 34KG OPEN ANGLE: 90DEGREE', 'KIN LONG',
  NULL, NULL, 'SS304',
  'Window', 'Window', 'Friction Stay',
  100, 'INCH', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/HCC40A-14.png'
) ON CONFLICT (id) DO NOTHING;

-- [260] FRICTION STAY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068182-266', 'Nippon',
  'FRICTION STAY', NULL, 'FRICTION HINGES', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Friction Stay',
  1350, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [261] FRICTION STAY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-169', 'Nippon',
  'FRICTION STAY', NULL, 'FRICTION STAY', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Friction Stay',
  1020, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [262] FRICTION STAY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-HCC40A-16', 'Nippon',
  'FRICTION STAY', 'HCC40A-16', 'FRICTION STAY SS304, NATURAL COLOR APPLICABLE EUROPEAN STANDARD C GROOVE CASEMENT WINDOW L=416MM HEIGHT LESS 1700MM WIDTH LESS 700MM WEIGHT LESS 39KG OPEN ANGLE: 90DEGREE', 'KIN LONG',
  'Black', NULL, 'SS304',
  'Window', 'Window', 'Friction Stay',
  100, 'INCH', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/HCC40A-16.png'
) ON CONFLICT (id) DO NOTHING;

-- [263] FRICTION STAY 12
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-171', 'Nippon',
  'FRICTION STAY 12', NULL, 'FRICTION STAY 12|', 'KIN LONG',
  NULL, NULL, 'Metal',
  'Window', 'Window', 'Friction Stay',
  900, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [264] FRICTION STAY 12
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283558-171', 'Nippon',
  'FRICTION STAY 12', NULL, 'FRICTION STAY 12|', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Friction Stay',
  900, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [265] FRICTION STAY 12"
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126407-267', 'Nippon',
  'FRICTION STAY 12"', NULL, 'FRICTION HINGES 12"', NULL,
  NULL, NULL, NULL,
  'Window', 'Window', 'Friction Stay',
  575, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [266] FRICTION STAY 12"
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-HCC40A-12', 'Nippon',
  'FRICTION STAY 12"', 'HCC40A-12', 'HCC40A-12', 'KIN LONG',
  NULL, NULL, 'SS304',
  'Window', 'Window', 'Friction Stay',
  100, 'INCH', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/HCC40A-12.png'
) ON CONFLICT (id) DO NOTHING;

-- [267] FRICTION STAY 12"
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-HCC40A', 'Nippon',
  'FRICTION STAY 12"', 'HCC40A', 'FRICTION STAY 12" (HCC40A/12', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Friction Stay',
  1093, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [268] FRICTION STAY 12"
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068181-170', 'Nippon',
  'FRICTION STAY 12"', NULL, 'FRICTION STAY 12"', 'KIN LONG',
  NULL, NULL, 'Metal',
  'Window', 'Window', 'Friction Stay',
  812, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [269] FRICTION STAY 12"
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283558-170', 'Nippon',
  'FRICTION STAY 12"', NULL, 'FRICTION STAY 12"', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Friction Stay',
  812, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [270] FRICTION STAY 14"
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283559-268', 'Nippon',
  'FRICTION STAY 14"', NULL, 'FRICTION HINGES 14"', 'Hopo',
  NULL, NULL, NULL,
  'Window', 'Window', 'Friction Stay',
  1050, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [271] FRICTION STAY 14"
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-172', 'Nippon',
  'FRICTION STAY 14"', NULL, 'FRICTION STAY 14"', 'Hopo',
  NULL, NULL, 'Metal',
  'Window', 'Window', 'Friction Stay',
  1246, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [272] FRICTION STAY 14"
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283558-172', 'Nippon',
  'FRICTION STAY 14"', NULL, 'FRICTION STAY 14"', 'Hopo',
  NULL, NULL, NULL,
  'Window', 'Window', 'Friction Stay',
  1246, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [273] FRICTION STAY 14"
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-HCC40A-14', 'Nippon',
  'FRICTION STAY 14"', 'HCC40A-14', 'HCC40A-14', 'KIN LONG',
  NULL, NULL, 'SS304',
  'Window', 'Window', 'Friction Stay',
  100, 'INCH', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/HCC40A-14.png'
) ON CONFLICT (id) DO NOTHING;

-- [274] FRICTION STAY 16"
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-HCC40A-16', 'Nippon',
  'FRICTION STAY 16"', 'HCC40A-16', 'HCC40A-16', 'KIN LONG',
  NULL, NULL, 'SS304',
  'Window', 'Window', 'Friction Stay',
  100, 'INCH', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/HCC40A-16.png'
) ON CONFLICT (id) DO NOTHING;

-- [275] FRICTION STAY 16"
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126407-269', 'Nippon',
  'FRICTION STAY 16"', NULL, 'FRICTION HINGES 16"', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Friction Stay',
  1200, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [276] FRICTION STAY 16"
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283558-173', 'Nippon',
  'FRICTION STAY 16"', NULL, 'FRICTION STAY 16"', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Friction Stay',
  1200, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [277] FRICTION STAY 16"
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-173', 'Nippon',
  'FRICTION STAY 16"', NULL, 'FRICTION STAY 16"', 'KIN LONG',
  NULL, NULL, 'Metal',
  'Window', 'Window', 'Friction Stay',
  1200, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [278] FRICTION STAY 16"
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-174', 'Nippon',
  'FRICTION STAY 16"', NULL, 'FRICTION STAY 16" 90DEGREE', 'KIN LONG',
  NULL, NULL, 'Metal',
  'Window', 'Window', 'Friction Stay',
  1200, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [279] FRICTION STAY 16"
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283558-174', 'Nippon',
  'FRICTION STAY 16"', NULL, 'FRICTION STAY 16" 90DEGREE', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Friction Stay',
  1200, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [280] FRICTION STAY 16"
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126407-265', 'Nippon',
  'FRICTION STAY 16"', NULL, 'FRICTION HINGE 16"', 'Hopo',
  'Black', NULL, NULL,
  'Window', 'Window', 'Friction Stay',
  1360, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [281] FRICTION STAY ACCESSORY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-LPX14A-16', 'Nippon',
  'FRICTION STAY ACCESSORY', 'LPX14A-16', 'LPX14A-16', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Friction Stay',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [282] FRICTION STAY ACCESSORY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-LPX30A', 'Nippon',
  'FRICTION STAY ACCESSORY', 'LPX30A', 'LPX30A', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Friction Stay',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [283] OUTWARD WINDOW HINGE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283558-192', 'Nippon',
  'OUTWARD WINDOW HINGE', NULL, 'OUTWARD WINDOW HINGE', NULL,
  NULL, NULL, NULL,
  'Window', 'Window', 'Friction Stay',
  250, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [284] OUTWARD WINDOW HINGE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068181-192', 'Nippon',
  'OUTWARD WINDOW HINGE', NULL, 'OUTWARD WINDOW HINGE', NULL,
  NULL, NULL, 'Metal',
  'Window', 'Window', 'Friction Stay',
  250, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [285] WINDOW HINGE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-LCJ13-B', 'Nippon',
  'WINDOW HINGE', 'LCJ13', 'LCJ13', 'KIN LONG',
  'Black', NULL, 'Aluminium profile',
  'Window', 'Window', 'Friction Stay',
  800, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/LCJ13.png'
) ON CONFLICT (id) DO NOTHING;

-- [286] WINDOW HINGE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126407-272', 'Nippon',
  'WINDOW HINGE', NULL, 'WINDOW HINGE BLACK', 'KIN LONG',
  'Black', NULL, NULL,
  'Window', 'Window', 'Friction Stay',
  1750, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [287] WINDOW HINGE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068182-271', 'Nippon',
  'WINDOW HINGE', NULL, 'WINDOW HINGE', 'KIN LONG',
  'Black', NULL, NULL,
  'Window', 'Window', 'Friction Stay',
  1450, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [288] WINDOW HINGE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068179-10', 'Nippon',
  'WINDOW HINGE', NULL, 'WINDOW HINGE ( J5C)', 'KIN LONG',
  'Black', NULL, NULL,
  'Window', 'Window', 'Friction Stay',
  1500, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [289] WINDOW HINGE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126407-273', 'Nippon',
  'WINDOW HINGE', NULL, 'WINDOW HINGES', 'KIN LONG',
  'Black', NULL, NULL,
  'Window', 'Window', 'Friction Stay',
  1442, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [290] WINDOW HINGE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283559-274', 'Nippon',
  'WINDOW HINGE', NULL, 'WINDOWS HINGES', 'KIN LONG',
  'Black', NULL, NULL,
  'Window', 'Window', 'Friction Stay',
  1450, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [291] WINDOW HINGE BEARINKG
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-LCJ13', 'Nippon',
  'WINDOW HINGE BEARINKG', 'LCJ13', 'KIN LONG WINDOW HINGE BLACK BEARING=55KG', 'KIN LONG',
  'Black', NULL, NULL,
  'Window', 'Window', 'Friction Stay',
  800, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/LCJ13.png'
) ON CONFLICT (id) DO NOTHING;

-- [292] BI-FOLD HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-219', 'Nippon',
  'BI-FOLD HANDLE', NULL, 'BI-FOLIDING HANDLE2', NULL,
  'Black', NULL, NULL,
  'Window', 'Window', 'Handle',
  8000, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [293] COCKSPUR HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP---WHITE-LEFT', 'Nippon',
  'COCKSPUR HANDLE', NULL, 'COCKUSPUR HANDLE', 'FROISE',
  NULL, 'left', NULL,
  'Window', 'Window', 'Handle',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [294] COCKSPUR HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP---WHITE-RIGHT', 'Nippon',
  'COCKSPUR HANDLE', NULL, 'COCKUSPUR HANDLE', 'FROISE',
  NULL, 'right', NULL,
  'Window', 'Window', 'Handle',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [295] COCKSPUR HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-168', 'Nippon',
  'COCKSPUR HANDLE', NULL, 'COCKSPUR HANDLE', NULL,
  'White', NULL, NULL,
  'Window', 'Window', 'Handle',
  575, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [296] GEAR HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-CZS133-L55', 'Nippon',
  'GEAR HANDLE', 'CZS133-L55', 'GEAR HANDLE CZS133-L55', 'KIN LONG',
  NULL, NULL, 'Metal',
  'Window', 'Window', 'Handle',
  1559, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [297] GEAR HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-206', 'Nippon',
  'GEAR HANDLE', NULL, 'GEAR HANDLE FLAT HANDLE', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Handle',
  1400, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [298] GEAR HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-207', 'Nippon',
  'GEAR HANDLE', NULL, 'GEAR HANDLE SET', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Handle',
  2350, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [299] GEAR HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-205', 'Nippon',
  'GEAR HANDLE', NULL, 'GEAR HANDLE', 'KIN LONG',
  'Black', NULL, NULL,
  'Window', 'Window', 'Handle',
  3050, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [300] HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-CZS133-L55-WHITE', 'Nippon',
  'HANDLE', NULL, 'HANDLE', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Handle',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [301] HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-CZS160A-L55-BLACK', 'Nippon',
  'HANDLE', NULL, 'HANDLE', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Handle',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [302] HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-SET-001', 'Nippon',
  'HANDLE', NULL, 'KIN LONG HANDLE', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Handle',
  0, 'SET', NULL
) ON CONFLICT (id) DO NOTHING;

-- [303] HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-LCZS631-L', 'Nippon',
  'HANDLE', 'LCZS631', 'LCZS631', 'KIN LONG',
  NULL, 'Left', 'Aluminium alloy+Zinc alloy',
  'Window', 'Window', 'Handle',
  2400, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/LCZS631.png'
) ON CONFLICT (id) DO NOTHING;

-- [304] HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-LCZ631I', 'Nippon',
  'HANDLE', 'LCZ631I', 'HANDLE (LCZ631I', 'KIN LONG',
  NULL, 'Right', NULL,
  'Window', 'Window', 'Handle',
  3050, 'SET', NULL
) ON CONFLICT (id) DO NOTHING;

-- [305] HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-LCZS770-L', 'Nippon',
  'HANDLE', NULL, 'HANDLE', 'KIN LONG',
  NULL, 'left', NULL,
  'Window', 'Window', 'Handle',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [306] HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-LCZS631-L-L55-WHITE-LEFT-55MM', 'Nippon',
  'HANDLE', NULL, 'HANDLE', 'KIN LONG',
  NULL, 'left', NULL,
  'Window', 'Window', 'Handle',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [307] HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-LCZS631-L-L55', 'Nippon',
  'HANDLE', NULL, 'HANDLE', 'KIN LONG',
  NULL, 'left', NULL,
  'Window', 'Window', 'Handle',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [308] HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-CZS332-L55', 'Nippon',
  'HANDLE', NULL, 'HANDLE', 'KIN LONG',
  NULL, 'left & right', NULL,
  'Window', 'Window', 'Handle',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [309] HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-LCZS770-R-WHITE-RIGHT', 'Nippon',
  'HANDLE', NULL, 'HANDLE', 'KIN LONG',
  NULL, 'right', NULL,
  'Window', 'Window', 'Handle',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [310] HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-LCZS770-R', 'Nippon',
  'HANDLE', NULL, 'HANDLE', 'KIN LONG',
  NULL, 'right', NULL,
  'Window', 'Window', 'Handle',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [311] HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-220', 'Nippon',
  'HANDLE', NULL, 'HANDLE', NULL,
  'Black', NULL, NULL,
  'Window', 'Window', 'Handle',
  1050, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [312] HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-CZS116AS-B', 'Nippon',
  'HANDLE', 'CZS116AS', 'CZS116AS', 'KIN LONG',
  'Black', NULL, 'Aluminium alloy',
  'Window', 'Window', 'Handle',
  3400, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/CZS116AS.png'
) ON CONFLICT (id) DO NOTHING;

-- [313] HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-CZS133-B', 'Nippon',
  'HANDLE', 'CZS133', 'CZS133', 'KIN LONG',
  'Black', NULL, 'Aluminium alloy',
  'Window', 'Window', 'Handle',
  2400, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/CZS133.png'
) ON CONFLICT (id) DO NOTHING;

-- [314] HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-CZS160A-B', 'Nippon',
  'HANDLE', 'CZS160A', 'CZS160A', 'KIN LONG',
  'Black', NULL, 'Aluminium alloy',
  'Window', 'Window', 'Handle',
  2450, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/CZS160A.png'
) ON CONFLICT (id) DO NOTHING;

-- [315] HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-CZS332-B', 'Nippon',
  'HANDLE', 'CZS332', 'CZS332', 'KIN LONG',
  'Black', NULL, 'Aluminium alloy',
  'Window', 'Window', 'Handle',
  2400, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/CZS332.png'
) ON CONFLICT (id) DO NOTHING;

-- [316] HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-CZS133', 'Nippon',
  'HANDLE', 'CZS133', 'KIN LONG HANDLE BLACK & WHITE TONGUE LENGTH=55MM', 'KIN LONG',
  'Black', NULL, NULL,
  'Window', 'Window', 'Handle',
  2400, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/CZS133.png'
) ON CONFLICT (id) DO NOTHING;

-- [317] HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-CZS160A', 'Nippon',
  'HANDLE', 'CZS160A', 'KIN LONG HANDLE BLACK & WHITE TONGUE LENGTH=55MM', 'KIN LONG',
  'Black', NULL, NULL,
  'Window', 'Window', 'Handle',
  2450, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/CZS160A.png'
) ON CONFLICT (id) DO NOTHING;

-- [318] HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068181-221', 'Nippon',
  'HANDLE', NULL, 'HANDLE 116AS', 'KIN LONG',
  'Black', NULL, NULL,
  'Window', 'Window', 'Handle',
  3150, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [319] HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-CZS332', 'Nippon',
  'HANDLE', 'CZS332', 'KIN LONG HANDLE BLACK, RIGHT(CAN ADJUST LEFT & RIGHT) TONGUE LENGTH=55MM', 'KIN LONG',
  'Black', 'L/R', NULL,
  'Window', 'Window', 'Handle',
  2400, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/CZS332.png'
) ON CONFLICT (id) DO NOTHING;

-- [320] HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-LCZS631', 'Nippon',
  'HANDLE', 'LCZS631', 'KIN LONG HANDLE BLACK & WHITE, RIGHT,LEFT TONGUE LENGTH=55MM', 'KIN LONG',
  'Black', 'L/R', NULL,
  'Window', 'Window', 'Handle',
  2400, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/LCZS631.png'
) ON CONFLICT (id) DO NOTHING;

-- [321] HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-LCZS770', 'Nippon',
  'HANDLE', 'LCZS770', 'KIN LONG HANDLE BLACK & WHITE, RIGHT,LEFT', 'KIN LONG',
  'Black', 'L/R', NULL,
  'Window', 'Window', 'Handle',
  1200, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/LCZS770.png'
) ON CONFLICT (id) DO NOTHING;

-- [322] HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068181-226', 'Nippon',
  'HANDLE', NULL, 'KIN LONG HANDLE BLACK & WHITE, RIGHT,LEFT', 'KIN LONG',
  'Black', 'L/R', NULL,
  'Window', 'Window', 'Handle',
  1050, 'SET', NULL
) ON CONFLICT (id) DO NOTHING;

-- [323] HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-LCZS631-B-R', 'Nippon',
  'HANDLE', 'LCZS631', 'LCZS631', 'KIN LONG',
  'Black', 'Right', 'Aluminium alloy+Zinc alloy',
  'Window', 'Window', 'Handle',
  2400, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/LCZS631.png'
) ON CONFLICT (id) DO NOTHING;

-- [324] HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-LCZ631', 'Nippon',
  'HANDLE', 'LCZ631', 'HANDLE', 'KIN LONG',
  'Black', 'Right', NULL,
  'Window', 'Window', 'Handle',
  3040, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [325] HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283558-223', 'Nippon',
  'HANDLE', NULL, 'HANDLE WHITE', NULL,
  'White', NULL, NULL,
  'Window', 'Window', 'Handle',
  260, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [326] HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-CZS133-W', 'Nippon',
  'HANDLE', 'CZS133', 'CZS133', 'KIN LONG',
  'White', NULL, 'Aluminium alloy',
  'Window', 'Window', 'Handle',
  2400, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/CZS133.png'
) ON CONFLICT (id) DO NOTHING;

-- [327] HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-CZS160A-W', 'Nippon',
  'HANDLE', 'CZS160A', 'CZS160A', 'KIN LONG',
  'White', NULL, 'Aluminium alloy',
  'Window', 'Window', 'Handle',
  2450, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/CZS160A.png'
) ON CONFLICT (id) DO NOTHING;

-- [328] HANDLE ACCESSORY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-CZS100-06C-34', 'Nippon',
  'HANDLE ACCESSORY', 'CZS100-06C-34', 'CZS100-06C-34', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Handle',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [329] HANDLE ACCESSORY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-CZS120AL55', 'Nippon',
  'HANDLE ACCESSORY', 'CZS120AL55', 'CZS120AL55', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Handle',
  1278, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [330] HANDLE ACCESSORY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-CZS631-06-34', 'Nippon',
  'HANDLE ACCESSORY', 'CZS631-06-34', 'CZS631-06-34', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Handle',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [331] HANDLE ACCESSORY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-LCZS38-L24', 'Nippon',
  'HANDLE ACCESSORY', 'LCZS38-L24', 'LCZS38-L24', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Handle',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [332] HANDLE SET
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-LCZ631-R', 'Nippon',
  'HANDLE SET', 'LCZ631-R', 'HANDLE SET', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Handle',
  3100, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [333] HANDLE SET
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283558-222', 'Nippon',
  'HANDLE SET', NULL, 'HANDLE SET (CZS133-L)', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Handle',
  3100, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [334] HANDLE SPRING BOLT LENGT
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-CZS116AS', 'Nippon',
  'HANDLE SPRING BOLT LENGT', 'CZS116AS', 'KIN LONG HANDLE BLACK SPRING BOLT LENGTH=54MM', 'KIN LONG',
  'Black', NULL, NULL,
  'Window', 'Window', 'Handle',
  3400, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/CZS116AS.png'
) ON CONFLICT (id) DO NOTHING;

-- [335] HANDLES
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283558-224', 'Nippon',
  'HANDLES', NULL, 'HANDLES SCREW', NULL,
  NULL, NULL, NULL,
  'Window', 'Window', 'Handle',
  50, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [336] HANDLES
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-224', 'Nippon',
  'HANDLES', NULL, 'HANDLES SCREW', NULL,
  NULL, NULL, 'Metal',
  'Window', 'Window', 'Handle',
  50, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [337] HOPO WINDOW HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-181', 'Nippon',
  'HOPO WINDOW HANDLE', NULL, 'HOPO WINDOW HANDLE', 'Hopo',
  'Black', NULL, NULL,
  'Window', 'Window', 'Handle',
  5800, 'SET', NULL
) ON CONFLICT (id) DO NOTHING;

-- [338] KEY LOCKING HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068181-225', 'Nippon',
  'KEY LOCKING HANDLE', NULL, 'KEY LOCKING HANDLE', 'KIN LONG',
  'Black', NULL, NULL,
  'Window', 'Window', 'Handle',
  2250, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [339] LIFT & SLIDE HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-122', 'Nippon',
  'LIFT & SLIDE HANDLE', NULL, 'LIFT & SLIDE HANDLE', NULL,
  'Black', NULL, NULL,
  'Window', 'Window', 'Handle',
  14746, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [340] LIFT & SLIDE HANDLE SET
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068180-123', 'Nippon',
  'LIFT & SLIDE HANDLE SET', NULL, 'LIFT & SLIDE HANDLE SET', 'KIN LONG',
  'Black', NULL, NULL,
  'Window', 'Window', 'Handle',
  15170, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [341] NETTING HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283558-227', 'Nippon',
  'NETTING HANDLE', NULL, 'NETTING HANDLE', 'KIN LONG',
  'Black', NULL, NULL,
  'Window', 'Window', 'Handle',
  1419, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [342] OPENABLE HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068181-228', 'Nippon',
  'OPENABLE HANDLE', NULL, 'OPENABLE HANDLE', NULL,
  'Black', NULL, NULL,
  'Window', 'Window', 'Handle',
  955, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [343] OPENABLE HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283556-4', 'Nippon',
  'OPENABLE HANDLE', NULL, 'OPENABLE DOOR HANDLE SET', 'KIN LONG',
  'Black', NULL, NULL,
  'Window', 'Window', 'Handle',
  2600, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [344] OPENABLE HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-229', 'Nippon',
  'OPENABLE HANDLE', NULL, 'OPENABLE KEY HANDLE', 'KIN LONG',
  'Black', NULL, NULL,
  'Window', 'Window', 'Handle',
  2250, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [345] OPENABLE HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068181-187', 'Nippon',
  'OPENABLE HANDLE', NULL, 'OPENABLE WINDOW HANDLE', 'KIN LONG',
  'Black', NULL, NULL,
  'Window', 'Window', 'Handle',
  1700, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [346] OUTWARD HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-190', 'Nippon',
  'OUTWARD HANDLE', NULL, 'OUTWARD HANDLE', NULL,
  'Black', NULL, NULL,
  'Window', 'Window', 'Handle',
  255, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [347] OUTWARD HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068181-191', 'Nippon',
  'OUTWARD HANDLE', NULL, 'OUTWARD HANDLE BLACK', NULL,
  'Black', NULL, NULL,
  'Window', 'Window', 'Handle',
  1255, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [348] OUTWARD HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-188', 'Nippon',
  'OUTWARD HANDLE', NULL, 'HANDLE OUTWARD', 'KIN LONG',
  'Black', NULL, NULL,
  'Window', 'Window', 'Handle',
  350, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [349] SLIDING HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068181-231', 'Nippon',
  'SLIDING HANDLE', NULL, 'SLIDING HANDLEBLACK', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Handle',
  2250, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [350] SLIDING HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283558-230', 'Nippon',
  'SLIDING HANDLE', NULL, 'SLIDING HANDLE', 'KIN LONG',
  'Black', NULL, NULL,
  'Window', 'Window', 'Handle',
  950, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [351] SLIDING SHORTNECK WINDOW HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP---WHITE-35MM', 'Nippon',
  'SLIDING SHORTNECK WINDOW HANDLE', NULL, 'SLIDING SHORTNECK WINDOW HANDLE', 'FROISE',
  NULL, NULL, NULL,
  'Window', 'Window', 'Handle',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [352] TIK TAK FLAT HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-233', 'Nippon',
  'TIK TAK FLAT HANDLE', NULL, 'TIK TAK FLAT HANDLE', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Handle',
  1400, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [353] TIK TAK HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068181-232', 'Nippon',
  'TIK TAK HANDLE', NULL, 'TICKTAK HANDLE', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Handle',
  1650, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [354] TIK TAK HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068181-236', 'Nippon',
  'TIK TAK HANDLE', NULL, 'TIK TOK HANDLE', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Handle',
  1500, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [355] TIK TAK HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283558-235', 'Nippon',
  'TIK TAK HANDLE', NULL, 'TIK TAK HANDLE L/R', 'KIN LONG',
  NULL, 'L/R', NULL,
  'Window', 'Window', 'Handle',
  1400, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [356] TIK TAK HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-234', 'Nippon',
  'TIK TAK HANDLE', NULL, 'TIK TAK HANDLE', 'KIN LONG',
  NULL, 'Right', NULL,
  'Window', 'Window', 'Handle',
  1425, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [357] WINDOW HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-CZS116AS-L54', 'Nippon',
  'WINDOW HANDLE', 'CZS116AS-L54', 'WINDOW HANDLE', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Handle',
  3150, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [358] WINDOW HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126407-239', 'Nippon',
  'WINDOW HANDLE', NULL, 'WINDOW HANDLE BALCK', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Handle',
  1575, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [359] WINDOW HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283557-81', 'Nippon',
  'WINDOW HANDLE', NULL, 'WINDOW LCZ-770-R', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Handle',
  1650, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [360] WINDOW HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP---BLACK-OUTWARD--40MM', 'Nippon',
  'WINDOW HANDLE', NULL, 'WINDOW HANDLE', 'FROISE',
  NULL, 'Outward', NULL,
  'Window', 'Window', 'Handle',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [361] WINDOW HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126407-240', 'Nippon',
  'WINDOW HANDLE', NULL, 'WINDOW HANDLE BLACK', 'KIN LONG',
  'Black', NULL, NULL,
  'Window', 'Window', 'Handle',
  2925, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [362] WINDOW HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-237', 'Nippon',
  'WINDOW HANDLE', NULL, 'WINDOW HANDLE', 'KIN LONG',
  'Black', NULL, NULL,
  'Window', 'Window', 'Handle',
  2544, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [363] WINDOW HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-238', 'Nippon',
  'WINDOW HANDLE', NULL, 'WINDOW HANDLE (JB HOUSE)', 'KIN LONG',
  'Black', NULL, NULL,
  'Window', 'Window', 'Handle',
  1400, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [364] WINDOW HANDLE KEY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068181-241', 'Nippon',
  'WINDOW HANDLE KEY', NULL, 'WINDOW HANDLE KEY BLACK', 'KIN LONG',
  'Black', NULL, NULL,
  'Window', 'Window', 'Handle',
  3150, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [365] WINDOW HANDLE KEYLOCKING
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283558-242', 'Nippon',
  'WINDOW HANDLE KEYLOCKING', NULL, 'WINDOW HANDLE KEYLOCKING', 'KIN LONG',
  'Black', NULL, NULL,
  'Window', 'Window', 'Handle',
  2250, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [366] WINDOW KEY HANDLE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068181-243', 'Nippon',
  'WINDOW KEY HANDLE', NULL, 'WINDOW KEY HANDLE', 'KIN LONG',
  'Black', NULL, NULL,
  'Window', 'Window', 'Handle',
  3150, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [367] 22MM ESPAGROD TURKISH STYLE-HEAVY KEEPS
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-1400-OUTWARD-1400MM', 'Nippon',
  '22MM ESPAGROD TURKISH STYLE-HEAVY KEEPS', NULL, '22MM ESPAGROD TURKISH STYLE-HEAVY KEEPS', 'NINGBO WIDEN',
  NULL, 'outward', NULL,
  'Window', 'Window', 'Keeps Strike',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [368] 22MM ESPAGROD TURKISH STYLE-HEAVY KEEPS
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP---OUTWARD-1800MM', 'Nippon',
  '22MM ESPAGROD TURKISH STYLE-HEAVY KEEPS', NULL, '22MM ESPAGROD TURKISH STYLE-HEAVY KEEPS', 'NINGBO WIDEN',
  NULL, 'outward', NULL,
  'Window', 'Window', 'Keeps Strike',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [369] CYLINDER WITH KEEPS
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283556-46', 'Nippon',
  'CYLINDER WITH KEEPS', NULL, 'CYLINDER WITH KEEPS', NULL,
  'Black', NULL, NULL,
  'Window', 'Window', 'Keeps Strike',
  2000, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [370] KEEPS
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-36', 'Nippon',
  'KEEPS', NULL, 'KEEPS', 'KIN LONG',
  NULL, NULL, 'Metal',
  'Window', 'Window', 'Keeps Strike',
  182, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [371] KEEPS
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283556-36', 'Nippon',
  'KEEPS', NULL, 'KEEPS', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Keeps Strike',
  182, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [372] OPENABLE KEEPS
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068179-37', 'Nippon',
  'OPENABLE KEEPS', NULL, 'KEEPS OPENABLE', NULL,
  NULL, NULL, NULL,
  'Window', 'Window', 'Keeps Strike',
  50, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [373] OPENABLE KEEPS
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068179-38', 'Nippon',
  'OPENABLE KEEPS', NULL, 'OPENABLE KEEPS', NULL,
  NULL, NULL, 'Metal',
  'Window', 'Window', 'Keeps Strike',
  100, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [374] OPENABLE KEEPS
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283556-38', 'Nippon',
  'OPENABLE KEEPS', NULL, 'OPENABLE KEEPS', NULL,
  NULL, NULL, NULL,
  'Window', 'Window', 'Keeps Strike',
  100, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [375] SLIDING KEEPS
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-39', 'Nippon',
  'SLIDING KEEPS', NULL, 'SLIDING KEEPS', 'KIN LONG',
  NULL, NULL, 'Metal',
  'Window', 'Window', 'Keeps Strike',
  150, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [376] SLIDING KEEPS
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283556-39', 'Nippon',
  'SLIDING KEEPS', NULL, 'SLIDING KEEPS', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Keeps Strike',
  150, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [377] CRESCENT LATCH WITH HOOK
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP---LEFT', 'Nippon',
  'CRESCENT LATCH WITH HOOK', NULL, 'CRESCENT LATCH WITH HOOK', 'NINGBO WIDEN',
  NULL, 'Left', NULL,
  'Window', 'Window', 'Latch',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [378] CRESCENT LATCH WITH HOOK
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP---RIGHT', 'Nippon',
  'CRESCENT LATCH WITH HOOK', NULL, 'CRESCENT LATCH WITH HOOK', 'NINGBO WIDEN',
  NULL, 'Right', NULL,
  'Window', 'Window', 'Latch',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [379] LATCH
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283556-40', 'Nippon',
  'LATCH', NULL, 'LATCH', NULL,
  NULL, NULL, NULL,
  'Window', 'Window', 'Latch',
  110, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [380] LATCH
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068179-41', 'Nippon',
  'LATCH', NULL, 'LATCH WHITE', NULL,
  'White', NULL, NULL,
  'Window', 'Window', 'Latch',
  145, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [381] MOON LATCH
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283556-42', 'Nippon',
  'MOON LATCH', NULL, 'MOON LATCH', NULL,
  'Black', NULL, NULL,
  'Window', 'Window', 'Latch',
  143, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [382] SLIDING LATCH
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283556-43', 'Nippon',
  'SLIDING LATCH', NULL, 'SLIDING LATCH', NULL,
  'Black', NULL, NULL,
  'Window', 'Window', 'Latch',
  125, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [383] GEAR LOCKBODY SET
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-208', 'Nippon',
  'GEAR LOCKBODY SET', NULL, 'GEAR LOCKBODY SET', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Lock',
  5500, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [384] LOCK
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-ZTS218-BLACK', 'Nippon',
  'LOCK', NULL, 'LOCK', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Lock',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [385] LOCK HOOK
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-TLS22-6-44', 'Nippon',
  'LOCK HOOK', NULL, 'LOCK HOOK', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Lock',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [386] LOCK HOOK
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-TLS22-6', 'Nippon',
  'LOCK HOOK', NULL, 'LOCK HOOK', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Lock',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [387] LOCK HOOK
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-TLS12-6', 'Nippon',
  'LOCK HOOK', 'TLS12-6', 'TLS12-6', 'KIN LONG',
  NULL, NULL, '304',
  'Window', 'Window', 'Lock',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [388] PUSH LOCK
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283556-29', 'Nippon',
  'PUSH LOCK', NULL, 'POUNCH LOCK', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Lock',
  1500, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [389] PUSH LOCK
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068179-30', 'Nippon',
  'PUSH LOCK', NULL, 'PUCH LOCK', 'KIN LONG',
  'Black', NULL, NULL,
  'Window', 'Window', 'Lock',
  2000, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [390] T-LOCK
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP---BLACK', 'Nippon',
  'T-LOCK', NULL, 'T-LOCK', 'NINGBO WIDEN',
  NULL, NULL, NULL,
  'Window', 'Window', 'Lock',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [391] WIRE LOCK
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068179-32', 'Nippon',
  'WIRE LOCK', NULL, 'WIRE LOCK', NULL,
  NULL, NULL, 'Metal',
  'Window', 'Window', 'Lock',
  1667, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [392] WIRE LOCK
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283556-32', 'Nippon',
  'WIRE LOCK', NULL, 'WIRE LOCK', NULL,
  NULL, NULL, NULL,
  'Window', 'Window', 'Lock',
  1667, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [393] CYLINDER
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-44', 'Nippon',
  'CYLINDER', NULL, 'CYLINDER', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Lock Cylinder',
  2500, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [394] CYLINDER 100MM
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-45', 'Nippon',
  'CYLINDER 100MM', NULL, 'CYLINDER 100MM', NULL,
  NULL, NULL, NULL,
  'Window', 'Window', 'Lock Cylinder',
  850, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [395] LIFT & SLIDE CYLINDER
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126405-47', 'Nippon',
  'LIFT & SLIDE CYLINDER', NULL, 'LIFT & SLIDE CYLINDER', NULL,
  NULL, NULL, 'Metal',
  'Window', 'Window', 'Lock Cylinder',
  2000, 'SET', NULL
) ON CONFLICT (id) DO NOTHING;

-- [396] LIFT & SLIDE CYLINDER
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283556-47', 'Nippon',
  'LIFT & SLIDE CYLINDER', NULL, 'LIFT & SLIDE CYLINDER', NULL,
  NULL, NULL, NULL,
  'Window', 'Window', 'Lock Cylinder',
  2000, 'SET', NULL
) ON CONFLICT (id) DO NOTHING;

-- [397] LOCK CYLINDER
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KIL2857-T', 'Nippon',
  'LOCK CYLINDER', NULL, 'LOCK CYLINDER', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Lock Cylinder',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [398] LOCK CYLINDER
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-KIL2857-T', 'Nippon',
  'LOCK CYLINDER', 'KIL2857/T', 'KIL2857/T', 'KIN LONG',
  NULL, NULL, 'Brass',
  'Window', 'Window', 'Lock Cylinder',
  2013, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/KIL2857-T.jpg'
) ON CONFLICT (id) DO NOTHING;

-- [399] ACTIVE LOCK POINT
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-HDS8', 'Nippon',
  'ACTIVE LOCK POINT', 'HDS8', 'KIN LONG ACTIVE LOCK POINT', 'KIN LONG',
  'Black', NULL, NULL,
  'Window', 'Window', 'Lock Point',
  50238, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/HDS8.jpg'
) ON CONFLICT (id) DO NOTHING;

-- [400] LOCKING PLATE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-ZA1', 'Nippon',
  'LOCKING PLATE', 'ZA1', 'ZA1', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Locking Plate',
  0, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/ZA1.png'
) ON CONFLICT (id) DO NOTHING;

-- [401] LOCKING PLATE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-ZA1-6A', 'Nippon',
  'LOCKING PLATE', 'ZA1-6A', 'ZA1-6A', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Locking Plate',
  130, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/ZA1-6A.png'
) ON CONFLICT (id) DO NOTHING;

-- [402] LOCKING PLATE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-ZA1-6A', 'Nippon',
  'LOCKING PLATE', 'ZA1-6A', 'LOCKING PLATE ZINC ALLOY', 'KIN LONG',
  NULL, NULL, 'Zinc alloy',
  'Window', 'Window', 'Locking Plate',
  0, 'PCS', 'https://wfytbcmazixddtwpbego.supabase.co/storage/v1/object/public/product-images/products/ZA1-6A.png'
) ON CONFLICT (id) DO NOTHING;

-- [403] LOCKING PLATE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-ZAI-6A', 'Nippon',
  'LOCKING PLATE', 'ZAI-6A', 'LOCKING PLATE', 'KIN LONG',
  NULL, NULL, 'Zinc Alloy',
  'Window', 'Window', 'Locking Plate',
  133, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [404] LOCKING PLATE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283556-27', 'Nippon',
  'LOCKING PLATE', NULL, 'LOCKING PLATE', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Locking Plate',
  350, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [405] LOCKING PLATE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068179-27', 'Nippon',
  'LOCKING PLATE', NULL, 'LOCKING PLATE', 'KIN LONG',
  NULL, NULL, 'Metal',
  'Window', 'Window', 'Locking Plate',
  350, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [406] MIDDLE LOCKING PLATE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068179-28', 'Nippon',
  'MIDDLE LOCKING PLATE', NULL, 'MIDDLE LOCKING PLATE', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Locking Plate',
  450, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [407] ANTI DROP DEVICE
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-FTQ25-I', 'Nippon',
  'ANTI DROP DEVICE', 'FTQ25/I', 'KIN LONG Anti drop Device', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Safety Device',
  850, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [408] SASH LIFTER
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-198', 'Nippon',
  'SASH LIFTER', NULL, 'SASH LIFTER', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Sash Hardware',
  350, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [409] SASH LIMITER
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-FC500-14', 'Nippon',
  'SASH LIMITER', 'FC500-14', 'SASH LIMITTER', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Sash Hardware',
  1190, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [410] BOTTOM STAY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283558-164', 'Nippon',
  'BOTTOM STAY', NULL, 'BOTTOMSTAY', NULL,
  NULL, NULL, NULL,
  'Window', 'Window', 'Stay',
  1000, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [411] BOTTOM STAY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-162', 'Nippon',
  'BOTTOM STAY', NULL, 'BOTTOM STAY', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Stay',
  1025, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [412] BOTTOM STAY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068181-163', 'Nippon',
  'BOTTOM STAY', NULL, 'BOTTOM STAY 14"', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Stay',
  1050, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [413] BUTTON STAY 14"
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283558-167', 'Nippon',
  'BUTTON STAY 14"', NULL, 'BUTTON STAY 14"', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Stay',
  967, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [414] BUTTON STAY 14"
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068181-167', 'Nippon',
  'BUTTON STAY 14"', NULL, 'BUTTON STAY 14"', 'KIN LONG',
  NULL, NULL, 'Metal',
  'Window', 'Window', 'Stay',
  967, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [415] LAHORI STAY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-183', 'Nippon',
  'LAHORI STAY', NULL, 'LAHORI STAY', NULL,
  NULL, NULL, 'Metal',
  'Window', 'Window', 'Stay',
  900, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [416] LAHORI STAY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283558-183', 'Nippon',
  'LAHORI STAY', NULL, 'LAHORI STAY', NULL,
  NULL, NULL, NULL,
  'Window', 'Window', 'Stay',
  900, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [417] LAHORI STAY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-197', 'Nippon',
  'LAHORI STAY', NULL, 'PIG STAY LAHORI', 'KIN LONG',
  NULL, NULL, 'Metal',
  'Window', 'Window', 'Stay',
  650, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [418] LAHORI STAY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283558-197', 'Nippon',
  'LAHORI STAY', NULL, 'PIG STAY LAHORI', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Stay',
  650, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [419] LAHORI STAY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283559-279', 'Nippon',
  'LAHORI STAY', NULL, 'STAY LAHORI', NULL,
  'Black', NULL, NULL,
  'Window', 'Window', 'Stay',
  750, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [420] LAHORI STAY 14"
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-182', 'Nippon',
  'LAHORI STAY 14"', NULL, 'LAHORE STAY 14"', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Stay',
  1050, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [421] LAHORI STAY 14"
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-184', 'Nippon',
  'LAHORI STAY 14"', NULL, 'LAHORI STAY 14"', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Stay',
  1078, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [422] LATOO STAY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068181-185', 'Nippon',
  'LATOO STAY', NULL, 'LATOO STAY 8"', NULL,
  NULL, NULL, 'Metal',
  'Window', 'Window', 'Stay',
  250, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [423] LATOO STAY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283558-185', 'Nippon',
  'LATOO STAY', NULL, 'LATOO STAY 8"', NULL,
  NULL, NULL, NULL,
  'Window', 'Window', 'Stay',
  250, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [424] PEG STAY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-194', 'Nippon',
  'PEG STAY', NULL, 'PEG STAY', 'KIN LONG',
  NULL, NULL, 'Metal',
  'Window', 'Window', 'Stay',
  925, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [425] PEG STAY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283558-194', 'Nippon',
  'PEG STAY', NULL, 'PEG STAY', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Stay',
  925, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [426] PEG STAY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-KL-SC200', 'Nippon',
  'PEG STAY', 'SC200', 'KIN LONG Peg Stay, SS 304 Natural color', 'KIN LONG',
  'Silver', NULL, 'SS 304',
  'Window', 'Window', 'Stay',
  63, 'INCH', NULL
) ON CONFLICT (id) DO NOTHING;

-- [427] PIG STAY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283558-196', 'Nippon',
  'PIG STAY', NULL, 'PIG STAY 14"', 'KIN LONG',
  NULL, NULL, NULL,
  'Window', 'Window', 'Stay',
  1050, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [428] PIG STAY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068181-195', 'Nippon',
  'PIG STAY', NULL, 'PIG STAY', 'KIN LONG',
  'Black', NULL, NULL,
  'Window', 'Window', 'Stay',
  1050, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [429] STAY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126407-278', 'Nippon',
  'STAY', NULL, 'STAY 14"', NULL,
  NULL, NULL, NULL,
  'Window', 'Window', 'Stay',
  252, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [430] STAY BAR
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779225126406-166', 'Nippon',
  'STAY BAR', NULL, 'STAY BAR 14"', NULL,
  NULL, NULL, NULL,
  'Window', 'Window', 'Stay',
  1500, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [431] STAY BAR
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779226068181-165', 'Nippon',
  'STAY BAR', NULL, 'STAY BAR', NULL,
  'Black', NULL, 'Metal',
  'Window', 'Window', 'Stay',
  917, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [432] STAY BAR
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP-IMPORT-1779224283558-165', 'Nippon',
  'STAY BAR', NULL, 'STAY BAR', NULL,
  'Black', NULL, NULL,
  'Window', 'Window', 'Stay',
  917, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

-- [433] TELESCOPIC ARM STAY
INSERT INTO products (id, company, description, profile_code, model_no, brand,
  finish_color, direction, material, category, main_category, sub_category,
  base_price, unit, image_url)
VALUES (
  'NIP--', 'Nippon',
  'TELESCOPIC ARM STAY', NULL, 'TELESCOPIC ARM STAY', 'NINGBO WIDEN',
  NULL, NULL, NULL,
  'Window', 'Window', 'Stay',
  0, 'PCS', NULL
) ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ── Post-run verification ───────────────────────────────────────────
SELECT
  COUNT(*)                                        AS total_nippon,
  COUNT(*) FILTER (WHERE brand IS NOT NULL)       AS with_brand,
  COUNT(*) FILTER (WHERE profile_code IS NOT NULL) AS with_code,
  COUNT(*) FILTER (WHERE image_url IS NOT NULL)   AS with_image,
  COUNT(*) FILTER (WHERE base_price > 0)          AS with_price
FROM products WHERE company = 'Nippon';

-- Category breakdown after insert:
SELECT COALESCE(category,'(none)') AS category, COUNT(*) AS cnt
FROM products WHERE company = 'Nippon'
GROUP BY category ORDER BY cnt DESC;
