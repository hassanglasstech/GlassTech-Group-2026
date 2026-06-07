SELECT
  (SELECT COUNT(*) FROM products    WHERE company = 'Nippon') AS total_products,
  (SELECT COUNT(*) FROM store_items WHERE company = 'Nippon' AND id NOT LIKE '%-SUB-%') AS total_stock_entries,

  (SELECT COUNT(*) FROM products p
   LEFT JOIN store_items s ON s.id = p.id
   WHERE p.company = 'Nippon' AND s.id IS NULL) AS products_missing_stock,

  (SELECT COUNT(*) FROM store_items s
   LEFT JOIN products p ON p.id = s.id
   WHERE s.company = 'Nippon' AND p.id IS NULL AND s.id NOT LIKE '%-SUB-%') AS orphaned_stock,

  (SELECT COUNT(*) FROM (
    SELECT model_no FROM products
    WHERE company = 'Nippon' AND model_no IS NOT NULL AND model_no <> ''
    GROUP BY model_no HAVING COUNT(*) > 1
  ) x) AS duplicate_model_nos;
