-- 055_sprint29_reporting_views.sql
-- Sprint 29: Reporting Pack — GL helper views for P&L, Aging, Sales Analysis, Cash Flow
-- All views are company-scoped; consumers must still apply .eq('company', ...)
-- Safe to re-run (CREATE OR REPLACE).

-- ── 1. P&L Roll-up view ───────────────────────────────────────────────────────
-- Aggregates posted ledger details by account type + month.
-- Used by PnL tab in ReportsHub for fast monthly/quarterly slices.
CREATE OR REPLACE VIEW v_gl_pnl AS
SELECT
  l.company,
  date_trunc('month', l.doc_date)::date          AS month,
  a.id                                            AS account_id,
  a.code                                          AS account_code,
  a.name                                          AS account_name,
  a.type                                          AS account_type,
  COALESCE(SUM((d->>'debit')::numeric),  0)      AS total_debit,
  COALESCE(SUM((d->>'credit')::numeric), 0)      AS total_credit,
  COALESCE(SUM((d->>'debit')::numeric), 0)
    - COALESCE(SUM((d->>'credit')::numeric), 0)  AS net
FROM ledger l
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(l.details, l.data->'details', '[]'::jsonb)
) AS d
JOIN accounts a ON a.id::text = (d->>'accountId')
WHERE l.status = 'Posted'
GROUP BY l.company, date_trunc('month', l.doc_date), a.id, a.code, a.name, a.type;

-- ── 2. AR Aging view ──────────────────────────────────────────────────────────
-- Outstanding invoice balances bucketed by days-past-due.
CREATE OR REPLACE VIEW v_ar_aging AS
SELECT
  i.company,
  i.id                                                         AS invoice_id,
  i.invoice_number,
  c.business_name                                              AS client_name,
  i.grand_total                                                AS invoice_amount,
  COALESCE(SUM(r.amount), 0)                                   AS paid_amount,
  i.grand_total - COALESCE(SUM(r.amount), 0)                  AS balance,
  i.date::date                                                  AS invoice_date,
  (CURRENT_DATE - i.date::date)                               AS days_outstanding,
  CASE
    WHEN (CURRENT_DATE - i.date::date) <= 30  THEN 'current'
    WHEN (CURRENT_DATE - i.date::date) <= 60  THEN '31_60'
    WHEN (CURRENT_DATE - i.date::date) <= 90  THEN '61_90'
    WHEN (CURRENT_DATE - i.date::date) <= 120 THEN '91_120'
    ELSE 'over_120'
  END                                                          AS aging_bucket
FROM invoices i
LEFT JOIN clients c       ON c.id = i.client_id
LEFT JOIN receipts r      ON r.invoice_id = i.id
WHERE i.status NOT IN ('cancelled', 'draft')
GROUP BY i.company, i.id, i.invoice_number, c.business_name,
         i.grand_total, i.date
HAVING (i.grand_total - COALESCE(SUM(r.amount), 0)) > 0.01;

-- ── 3. AP Aging view ──────────────────────────────────────────────────────────
-- Outstanding vendor bills bucketed by days-past-due.
CREATE OR REPLACE VIEW v_ap_aging AS
SELECT
  po.company,
  po.id                                                         AS bill_id,
  po.po_number,
  v.name                                                        AS vendor_name,
  po.total_amount                                               AS bill_amount,
  COALESCE(SUM(pmt.amount), 0)                                  AS paid_amount,
  po.total_amount - COALESCE(SUM(pmt.amount), 0)               AS balance,
  po.order_date::date                                            AS bill_date,
  (CURRENT_DATE - po.order_date::date)                         AS days_outstanding,
  CASE
    WHEN (CURRENT_DATE - po.order_date::date) <= 30  THEN 'current'
    WHEN (CURRENT_DATE - po.order_date::date) <= 60  THEN '31_60'
    WHEN (CURRENT_DATE - po.order_date::date) <= 90  THEN '61_90'
    WHEN (CURRENT_DATE - po.order_date::date) <= 120 THEN '91_120'
    ELSE 'over_120'
  END                                                          AS aging_bucket
FROM purchase_orders po
LEFT JOIN vendors v            ON v.id = po.vendor_id
LEFT JOIN vendor_payments pmt  ON pmt.purchase_order_id = po.id
WHERE po.status NOT IN ('cancelled', 'draft')
GROUP BY po.company, po.id, po.po_number, v.name,
         po.total_amount, po.order_date
HAVING (po.total_amount - COALESCE(SUM(pmt.amount), 0)) > 0.01;

-- ── 4. Sales Analysis view ────────────────────────────────────────────────────
-- Invoice lines rolled up by client + product + month for sales reports.
CREATE OR REPLACE VIEW v_sales_analysis AS
SELECT
  i.company,
  date_trunc('month', i.date::date)::date  AS month,
  c.business_name                           AS client_name,
  i.client_id,
  (item->>'productName')                   AS product_name,
  (item->>'productCode')                   AS product_code,
  COUNT(*)                                  AS line_count,
  COALESCE(SUM((item->>'quantity')::numeric), 0)   AS total_qty,
  COALESCE(SUM((item->>'subtotal')::numeric), 0)   AS total_revenue
FROM invoices i
LEFT JOIN clients c ON c.id = i.client_id
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(i.items, '[]'::jsonb)
) AS item
WHERE i.status NOT IN ('cancelled', 'draft')
GROUP BY i.company, date_trunc('month', i.date::date), c.business_name, i.client_id,
         item->>'productName', item->>'productCode';

-- ── 5. Stock Aging view ───────────────────────────────────────────────────────
-- Days-on-hand per material; flags slow-moving (>90d) and dead (>180d) stock.
CREATE OR REPLACE VIEW v_stock_aging AS
SELECT
  sl.company,
  sl.material_code,
  sl.material_name,
  sl.unit,
  sl.warehouse,
  COALESCE(SUM(sl.qty_in) - SUM(sl.qty_out), 0)  AS on_hand_qty,
  MIN(sl.date)                                      AS first_movement,
  MAX(sl.date)                                      AS last_movement,
  (CURRENT_DATE - MAX(sl.date)::date)              AS days_since_last_movement,
  CASE
    WHEN (CURRENT_DATE - MAX(sl.date)::date) > 180 THEN 'dead'
    WHEN (CURRENT_DATE - MAX(sl.date)::date) > 90  THEN 'slow_moving'
    WHEN (CURRENT_DATE - MAX(sl.date)::date) > 30  THEN 'moderate'
    ELSE 'active'
  END                                               AS stock_status
FROM stock_ledger sl
GROUP BY sl.company, sl.material_code, sl.material_name, sl.unit, sl.warehouse
HAVING COALESCE(SUM(sl.qty_in) - SUM(sl.qty_out), 0) > 0;

-- ── 6. Vendor Scorecard view ──────────────────────────────────────────────────
-- On-time delivery rate, defect rate, and PO count per vendor.
CREATE OR REPLACE VIEW v_vendor_scorecard AS
SELECT
  po.company,
  po.vendor_id,
  v.name                                                          AS vendor_name,
  COUNT(po.id)                                                    AS total_pos,
  COALESCE(SUM(po.total_amount), 0)                              AS total_value,
  COUNT(CASE WHEN po.status = 'received' THEN 1 END)             AS received_pos,
  COUNT(CASE
    WHEN po.status = 'received'
     AND po.actual_delivery_date::date <= po.expected_delivery_date::date
    THEN 1 END)                                                   AS on_time_pos,
  ROUND(
    100.0 * COUNT(CASE
      WHEN po.status = 'received'
       AND po.actual_delivery_date::date <= po.expected_delivery_date::date
      THEN 1 END)
    / NULLIF(COUNT(CASE WHEN po.status = 'received' THEN 1 END), 0),
    1
  )                                                               AS on_time_pct
FROM purchase_orders po
LEFT JOIN vendors v ON v.id = po.vendor_id
GROUP BY po.company, po.vendor_id, v.name;

-- ── 7. Project Profitability view ─────────────────────────────────────────────
-- Revenue vs COGS vs allocated overhead per sales order (project proxy).
CREATE OR REPLACE VIEW v_project_profitability AS
SELECT
  so.company,
  so.id                                             AS order_id,
  so.order_number,
  c.business_name                                   AS client_name,
  so.status,
  so.created_at::date                               AS order_date,
  COALESCE(i.grand_total, 0)                        AS revenue,
  COALESCE(cogs.cogs_amount, 0)                     AS cogs,
  COALESCE(i.grand_total, 0)
    - COALESCE(cogs.cogs_amount, 0)                 AS gross_profit,
  ROUND(
    100.0 * (COALESCE(i.grand_total, 0) - COALESCE(cogs.cogs_amount, 0))
    / NULLIF(COALESCE(i.grand_total, 0), 0),
    1
  )                                                 AS gross_margin_pct
FROM sales_orders so
LEFT JOIN clients c ON c.id = so.client_id
LEFT JOIN invoices i ON i.order_id = so.id AND i.status NOT IN ('cancelled')
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(
    COALESCE((d->>'debit')::numeric, 0)
  ), 0) AS cogs_amount
  FROM ledger l
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(l.details, l.data->'details', '[]'::jsonb)
  ) AS d
  JOIN accounts a ON a.id::text = (d->>'accountId')
  WHERE l.company      = so.company
    AND l.reference    = so.order_number
    AND a.name ILIKE '%COGS%'
    AND l.status       = 'Posted'
) cogs ON true;
