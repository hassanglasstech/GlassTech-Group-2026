-- ════════════════════════════════════════════════════════════════════════
-- GLASSTECH ERP — PHASE 1: NIPPON OPENING BALANCES (TRADING BUSINESS)
-- Run in Supabase SQL Editor after RLS verification passes.
-- EDIT the amounts marked <<...>> below before running — yeh sirf template hai.
-- Date format: YYYY-MM-DD
--
-- IMPORTANT — Nippon is a TRADING business (no production, no WIP).
-- Account codes below correspond to coa.nippon.ts.
-- Total debits MUST equal total credits — verification query at the end.
-- ════════════════════════════════════════════════════════════════════════

-- ── STEP 1: Opening Balance Journal Voucher ─────────────────────────────
INSERT INTO ledger (
  id, company, doc_type, doc_date, description,
  reference_id, status, data, created_at, updated_at
) VALUES (
  'OB-Nippon-2026-05',
  'Nippon',
  'OB',
  '2026-05-19',
  'Opening Balances — Nippon May 2026',
  'OPENING-BALANCE',
  'Posted',
  jsonb_build_object(
    'lines', jsonb_build_array(
      -- ══════════════════════════════════════════════════════════════
      -- DEBIT SIDE — Assets
      -- ══════════════════════════════════════════════════════════════

      -- Cash & Bank (Nippon COA: 1111x / 1112x)
      jsonb_build_object('accountCode','11111','accountName','Cash in Hand',                'debit',0, 'credit',0),
      jsonb_build_object('accountCode','11121','accountName','Bank — Main',                 'debit',0, 'credit',0),

      -- Trade Receivables — one line per major client (or one total per control acct)
      jsonb_build_object('accountCode','12210','accountName','Customers Control — Opening', 'debit',0, 'credit',0),

      -- Hardware Inventory (Nippon COA: 11511..11515)
      jsonb_build_object('accountCode','11511','accountName','Kin Long Products — Stock',   'debit',0, 'credit',0),
      jsonb_build_object('accountCode','11512','accountName','Aluminium Accessories — Stock','debit',0, 'credit',0),
      jsonb_build_object('accountCode','11513','accountName','UPVC Hardware — Stock',       'debit',0, 'credit',0),
      jsonb_build_object('accountCode','11514','accountName','General Hardware — Stock',    'debit',0, 'credit',0),

      -- PPE (if any owned equipment in Nippon entity)
      jsonb_build_object('accountCode','12111','accountName','Office Equipment — Cost',     'debit',0, 'credit',0),
      jsonb_build_object('accountCode','12112','accountName','Computers — Cost',            'debit',0, 'credit',0),

      -- ══════════════════════════════════════════════════════════════
      -- CREDIT SIDE — Liabilities + Equity
      -- ══════════════════════════════════════════════════════════════

      -- Accounts Payable (Kin Long suppliers, importers, etc)
      jsonb_build_object('accountCode','21111','accountName','Payable — Kin Long Vendors',  'debit',0, 'credit',0),
      jsonb_build_object('accountCode','21112','accountName','Payable — Hardware Importers','debit',0, 'credit',0),
      jsonb_build_object('accountCode','21113','accountName','Payable — Other',             'debit',0, 'credit',0),

      -- Tax (any GST output payable carried forward)
      jsonb_build_object('accountCode','21211','accountName','Sales Tax Payable',           'debit',0, 'credit',0),

      -- Intercompany — Nippon shares 20% with Factory per group structure
      jsonb_build_object('accountCode','21131','accountName','Due to Factory (20% Share)',  'debit',0, 'credit',0),

      -- Equity
      jsonb_build_object('accountCode','31111','accountName','Owner Capital',               'debit',0, 'credit',0),
      jsonb_build_object('accountCode','31211','accountName','Retained Earnings',           'debit',0, 'credit',0)
    ),
    'totalDebit',  0,
    'totalCredit', 0,
    'postedBy',    'Hassan',
    'openingBalance', true,
    'company',     'Nippon'
  ),
  now(),
  now()
) ON CONFLICT (id) DO NOTHING;

-- ── STEP 2: Verify balance ──────────────────────────────────────────────
-- Run this AFTER updating amounts. Both totals MUST match.
SELECT
  (data->>'totalDebit')::numeric  AS total_debit,
  (data->>'totalCredit')::numeric AS total_credit,
  (data->>'totalDebit')::numeric - (data->>'totalCredit')::numeric AS difference,
  CASE
    WHEN (data->>'totalDebit')::numeric = (data->>'totalCredit')::numeric
    THEN 'BALANCED ✓'
    ELSE 'NOT BALANCED ✗ — fix amounts before go-live'
  END AS status
FROM ledger
WHERE id = 'OB-Nippon-2026-05';

-- ── STEP 3: Seed customer-wise AR sub-ledger ────────────────────────────
-- For each existing client with an opening balance, add one row matching
-- the per-customer control account expected by deliveryInvoiceService.
-- Example — duplicate this block per client:
/*
INSERT INTO ledger (id, company, doc_type, doc_date, description, reference_id, status, data, created_at, updated_at)
VALUES (
  'OB-Nippon-AR-<CLIENT_CODE>',
  'Nippon',
  'OB',
  '2026-05-19',
  'Opening AR — <CLIENT NAME>',
  'OPENING-BALANCE-AR',
  'Posted',
  jsonb_build_object(
    'lines', jsonb_build_array(
      jsonb_build_object('accountCode','12210','accountName','Customers Control — <CLIENT NAME>','debit',<AMOUNT>, 'credit',0),
      jsonb_build_object('accountCode','12210','accountName','Customers Control — Opening',      'debit',0, 'credit',<AMOUNT>)
    ),
    'totalDebit',  <AMOUNT>,
    'totalCredit', <AMOUNT>,
    'openingBalance', true,
    'company',     'Nippon'
  ),
  now(), now()
) ON CONFLICT (id) DO NOTHING;
*/

-- ── STEP 4: Seed inventory rows (on-hand qty + MAP) ─────────────────────
-- CRITICAL — without movingAveragePrice populated, COGS at delivery
-- posts as ZERO (Phase 1 P1-2 fix relies on this column being set).
-- Replace placeholder values per actual stock count on go-live date.
/*
INSERT INTO store_items (id, company, name, category, quantity, unrestricted_qty, moving_average_price, total_value, unit, storage_bin, last_movement_date, created_at, updated_at)
VALUES
  ('STK-KL-H123', 'Nippon', 'Kin Long Hinge 90°',     'Hardware', 50, 50, 800,  40000, 'PCS', 'A-01', '2026-05-19', now(), now()),
  ('STK-AL-L456', 'Nippon', 'Aluminium Lock 200mm',   'Hardware', 50, 50, 1200, 60000, 'PCS', 'A-02', '2026-05-19', now(), now())
ON CONFLICT (id) DO UPDATE
  SET quantity             = EXCLUDED.quantity,
      unrestricted_qty     = EXCLUDED.unrestricted_qty,
      moving_average_price = EXCLUDED.moving_average_price,
      total_value          = EXCLUDED.total_value,
      updated_at           = now();
*/

-- ── STEP 5: Sanity — total inventory value must match the OB-Stock lines ─
SELECT
  SUM(quantity * moving_average_price)::numeric AS total_inventory_value
FROM store_items
WHERE company = 'Nippon';

-- Compare this number with the SUM of debit on the four 1151x lines
-- in the OB-Nippon-2026-05 JV. They MUST match.
