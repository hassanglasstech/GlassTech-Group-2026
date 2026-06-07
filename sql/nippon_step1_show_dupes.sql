SELECT
  model_no,
  COUNT(*) AS count,
  array_agg(id ORDER BY
    CASE WHEN image_url IS NOT NULL AND image_url <> '' THEN 0 ELSE 1 END,
    created_at DESC
  ) AS ids,
  array_agg(description ORDER BY
    CASE WHEN image_url IS NOT NULL AND image_url <> '' THEN 0 ELSE 1 END,
    created_at DESC
  ) AS descriptions,
  array_agg(CASE WHEN image_url <> '' THEN 'has-img' ELSE 'no-img' END ORDER BY
    CASE WHEN image_url IS NOT NULL AND image_url <> '' THEN 0 ELSE 1 END,
    created_at DESC
  ) AS image_status
FROM products
WHERE company = 'Nippon'
  AND model_no IS NOT NULL
  AND model_no <> ''
GROUP BY model_no
HAVING COUNT(*) > 1
ORDER BY model_no;
