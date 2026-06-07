-- PREVIEW: Yeh 34 rows delete hongi -- run karke confirm karo, kuch change nahi hoga
SELECT id, model_no, description,
  CASE WHEN image_url <> '' THEN 'has-img' ELSE 'no-img' END AS img
FROM products
WHERE company = 'Nippon'
  AND id IN (
    'NIP-KL-CML35G19K192A-2',
    'NIP-KL-CZS133-L55-B',
    'NIP-KL-CZS160A-L55-W',
    'NIP-KL-H50-20A-3',
    'NIP-KL-H50-20A-2',
    'NIP-KL-H50B-2',
    'NIP-KL-H52A-2',
    'NIP-KL-HC320-16-2',
    'NIP-KL-HCC40A-16-2',
    'NIP-KL-J5C-L-2',
    'NIP-KL-J5C-R',
    'NIP-KL-LCJ13-B',
    'NIP-KL-LCJ13-2',
    'NIP-KL-LCJ13-3',
    'NIP-KL-LCZS770-L-2',
    'NIP-KL-LCZS770-R',
    'NIP-KL-LMS003-100-2',
    'NIP-KL-LMS003-100-3',
    'NIP-KL-LMS003-100-4',
    'NIP-KL-M5X75',
    'NIP-KL-M5X75-3',
    'NIP-KL-M5X75-4',
    'NIP-KL-MZS208C-2',
    'NIP-KL-N37A-2',
    'NIP-KL-SC200-10-L',
    'NIP-KL-SC200-12-L',
    'NIP-KL-SK51',
    'NIP-SIWAY-SV888-W',
    'NIP-KL-T-MJ35-R',
    'NIP-KL-TLS22-6',
    'NIP-KL-UP-FZS1043A-B-L-55',
    'NIP-KL-Z201-L100-B',
    'NIP-KL-ZA1-6A-2',
    'NIP-KL-ZCD75X25'
  )
ORDER BY model_no;
