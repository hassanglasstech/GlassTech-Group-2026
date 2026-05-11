-- 055_sprint29_reporting_views.sql
-- Sprint 29: Reporting Pack — GL helper views for P&L, Aging, Sales Analysis, Cash Flow
-- All views are company-scoped; consumers must still apply .eq('company', ...)
-- Safe to re-run (CREATE OR REPLACE).
--
-- Schema notes (deviates from naive expectations):
--   * invoices: total_amount (NOT grand_total), no flat invoice_number col
--   * payment_receipts (NOT receipts): has invoice_id + amount
--   * purchase_orders: all business fields in JSONB data col; no vendor_payments table
--   * quotations: used as sales-order equivalent (no separate sales_orders table)
--                 flat col is order_no (NOT order_number)

-- ── 1. P&L Roll-up view ───────────────────────────────────────────────────────
-- Aggregates posted ledger details by account type + month.
-- Used by PnL tab in ReportsHub for fast monthly/quarterly slices.
CREATE OR REPLACE VIEW v_gl_pnl AS
SELECT
  l.company,
  date_trunc('month', l.doc_date::timestamp)::date AS month,
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
GROUP BY l.company, date_trunc('month', l.doc_date::timestamp), a.id, a.code, a.name, a.type;

-- ── 2. AR Aging view ──────────────────────────────────────────────────────────
-- Outstanding invoice balances bucketed by days-past-due.
-- Hotfix 3: receipts->payment_receipts; grand_total->total_amount; invoice_number via JSONB
CREATE OR REPLACE VIEW v_ar_aging AS
SELECT
  i.company,
  i.id                                                           AS invoice_id,
  COALESCE((i.data->>'invoiceNumber'), i.id)                    AS invoice_number,
  COALESCE(c.name, i.client_name, c.data->>'businessName')      AS client_name,
  COALESCE(i.total_amount, 0)                                    AS invoice_amount,
  COALESCE(SUM(r.amount), 0)                                     AS paid_amount,
  COALESCE(i.total_amount, 0) - COALESCE(SUM(r.amount), 0)      AS balance,
  i.date::date                                                   AS invoice_date,
  (CURRENT_DATE - i.date::date)                                  AS days_outstanding,
  CASE
    WHEN (CURRENT_DATE - i.date::date) <= 30  THEN 'current'
    WHEN (CURRENT_DATE - i.date::date) <= 60  THEN '31_60'
    WHEN (CURRENT_DATE - i.date::date) <= 90  THEN '61_90'
    WHEN (CURRENT_DATE - i.date::date) <= 120 THEN '91_120'
    ELSE 'over_120'
  END                                                            AS aging_bucket
FROM invoices i
LEFT JOIN clients c           ON c.id = i.client_id
LEFT JOIN payment_receipts r  ON r.invoice_id = i.id
WHERE i.status NOT IN ('cancelled', 'draft', 'Cancelled', 'Draft')
  AND i.date IS NOT NULL
  AND i.date <> ''
GROUP BY i.company, i.id, i.data, i.client_name, c.name, c.data,
         i.total_amount, i.date
HAVING (COALESCE(i.total_amount, 0) - COALESCE(SUM(r.amount), 0)) > 0.01;

-- ── 3. AP Aging view ──────────────────────────────────────────────────────────
-- Outstanding vendor bills bucketed by days-past-due.
-- Note: purchase_orders is JSONB-based; no vendor_payments table.
-- Wrapped in DO block: skip silently if purchase_orders.company missing
-- (some installs only have the bare id/data cols).
DO $reporting$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'company'
  ) THEN
    EXECUTE $view$
      CREATE OR REPLACE VIEW v_ap_aging AS
      SELECT
        po.company,
        po.id                                                              AS bill_id,
        COALESCE(po.data->>'id', po.id)                                   AS po_number,
        COALESCE(v.name, po.data->>'vendorName', po.data->>'toVendor')    AS vendor_name,
        COALESCE((po.data->>'totalAmount')::numeric, 0)                   AS bill_amount,
        0::numeric                                                         AS paid_amount,
        COALESCE((po.data->>'totalAmount')::numeric, 0)                   AS balance,
        COALESCE((po.data->>'date')::date, po.created_at::date)           AS bill_date,
        (CURRENT_DATE - COALESCE((po.data->>'date')::date, po.created_at::date)) AS days_outstanding,
        CASE
          WHEN (CURRENT_DATE - COALESCE((po.data->>'date')::date, po.created_at::date)) <= 30  THEN 'current'
          WHEN (CURRENT_DATE - COALESCE((po.data->>'date')::date, po.created_at::date)) <= 60  THEN '31_60'
          WHEN (CURRENT_DATE - COALESCE((po.data->>'date')::date, po.created_at::date)) <= 90  THEN '61_90'
          WHEN (CURRENT_DATE - COALESCE((po.data->>'date')::date, po.created_at::date)) <= 120 THEN '91_120'
          ELSE 'over_120'
        END                                                                AS aging_bucket
      FROM purchase_orders po
      LEFT JOIN vendors v ON v.id = COALESCE(po.data->>'vendorId', po.data->>'toVendor')
      WHERE LOWER(COALESCE(po.data->>'status', '')) NOT IN ('cancelled', 'draft')
        AND COALESCE((po.data->>'totalAmount')::numeric, 0) > 0.01
    $view$;
  ELSE
    RAISE NOTICE 'Skipping v_ap_aging: purchase_orders.company column missing';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipping v_ap_aging: %', SQLERRM;
END
$reporting$;

-- ── 4. Sales Analysis view ────────────────────────────────────────────────────
-- Invoice lines rolled up by client + product + month for sales reports.
CREATE OR REPLACE VIEW v_sales_analysis AS
SELECT
  i.company,
  date_trunc('month', i.date::timestamp)::date AS month,
  COALESCE(c.name, i.client_name, c.data->>'businessName') AS client_name,
  i.client_id,
  (item->>'productName')                    AS product_name,
  (item->>'productCode')                    AS product_code,
  COUNT(*)                                   AS line_count,
  COALESCE(SUM((item->>'quantity')::numeric), 0)   AS total_qty,
  COALESCE(SUM((item->>'subtotal')::numeric), 0)   AS total_revenue
FROM invoices i
LEFT JOIN clients c ON c.id = i.client_id
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(i.items, '[]'::jsonb)
) AS item
WHERE i.status NOT IN ('cancelled', 'draft', 'Cancelled', 'Draft')
  AND i.date IS NOT NULL
  AND i.date <> ''
GROUP BY i.company, date_trunc('month', i.date::timestamp), c.name, c.data, i.client_name,
         i.client_id, item->>'productName', item->>'productCode';

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
-- PO count, total value and received rate per vendor.
-- Wrapped in DO block: same defensive check as v_ap_aging.
DO $reporting$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'company'
  ) THEN
    EXECUTE $view$
      CREATE OR REPLACE VIEW v_vendor_scorecard AS
      SELECT
        po.company,
        COALESCE(po.data->>'vendorId', po.data->>'toVendor')           AS vendor_id,
        COALESCE(v.name, po.data->>'vendorName', po.data->>'toVendor') AS vendor_name,
        COUNT(po.id)                                                    AS total_pos,
        COALESCE(SUM((po.data->>'totalAmount')::numeric), 0)           AS total_value,
        COUNT(CASE WHEN LOWER(po.data->>'status') = 'received' THEN 1 END) AS received_pos,
        ROUND(
          100.0 * COUNT(CASE WHEN LOWER(po.data->>'status') = 'received' THEN 1 END)
          / NULLIF(COUNT(po.id), 0),
          1
        )                                                               AS received_pct
      FROM purchase_orders po
      LEFT JOIN vendors v ON v.id = COALESCE(po.data->>'vendorId', po.data->>'toVendor')
      WHERE COALESCE(po.data->>'vendorId', po.data->>'toVendor') IS NOT NULL
      GROUP BY po.company,
               COALESCE(po.data->>'vendorId', po.data->>'toVendor'),
               v.name,
               po.data->>'vendorName',
               po.data->>'toVendor'
    $view$;
  ELSE
    RAISE NOTICE 'Skipping v_vendor_scorecard: purchase_orders.company column missing';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipping v_vendor_scorecard: %', SQLERRM;
END
$reporting$;

-- ── 7. Project Profitability view ─────────────────────────────────────────────
-- Revenue vs COGS per quotation (quotations = sales-order equivalent here).
-- Fixes: sales_orders->quotations; grand_total->total_amount; order_number->order_no
CREATE OR REPLACE VIEW v_project_profitability AS
SELECT
  so.company,
  so.id                                             AS order_id,
  so.order_no                                       AS order_number,
  COALESCE(c.name, so.data->>'clientName', c.data->>'businessName') AS client_name,
  so.status,
  so.created_at::date                               AS order_date,
  COALESCE(i.total_amount, 0)                       AS revenue,
  COALESCE(cogs.cogs_amount, 0)                     AS cogs,
  COALESCE(i.total_amount, 0)
    - COALESCE(cogs.cogs_amount, 0)                 AS gross_profit,
  ROUND(
    100.0 * (COALESCE(i.total_amount, 0) - COALESCE(cogs.cogs_amount, 0))
    / NULLIF(COALESCE(i.total_amount, 0), 0),
    1
  )                                                 AS gross_margin_pct
FROM quotations so
LEFT JOIN clients c ON c.id = so.client_id
LEFT JOIN invoices i ON i.order_id = so.id AND i.status NOT IN ('cancelled', 'Cancelled')
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(
    COALESCE((d->>'debit')::numeric, 0)
  ), 0) AS cogs_amount
  FROM ledger l
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(l.details, l.data->'details', '[]'::jsonb)
  ) AS d
  JOIN accounts a ON a.id::text = (d->>'accountId')
  WHERE l.company   = so.company
    AND l.reference = so.order_no
    AND a.name ILIKE '%COGS%'
    AND l.status    = 'Posted'
) cogs ON true
WHERE so.status NOT IN ('Draft', 'Cancelled', 'cancelled');
