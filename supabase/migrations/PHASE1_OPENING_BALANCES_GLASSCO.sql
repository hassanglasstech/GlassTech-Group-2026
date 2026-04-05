-- ============================================================
-- GLASSTECH ERP — PHASE 1: GLASSCO OPENING BALANCES
-- Run in Supabase SQL Editor after migrations
-- EDIT the amounts below before running — ye sirf template hai
-- Date format: YYYY-MM-DD
-- ============================================================

-- Opening Balance entry = one JV with all account balances
-- Debit = Asset / Expense accounts
-- Credit = Liability / Equity accounts
-- Total Debits MUST equal Total Credits

-- ── STEP 1: Insert Opening Balance JV into ledger ─────────────────────
-- Replace 'YYYY-MM-DD' with actual opening date (e.g. '2026-04-01')
-- Replace amounts with your actual balances

INSERT INTO ledger (
  id, company, doc_type, doc_date, description,
  reference_id, status, data, created_at, updated_at
) VALUES (
  'OB-Glassco-2026-04',
  'Glassco',
  'JV',
  '2026-04-01',
  'Opening Balances — GlassCo April 2026',
  'OPENING-BALANCE',
  'Posted',
  jsonb_build_object(
    'lines', jsonb_build_array(
      -- ── DEBIT SIDE (Assets) ─────────────────────────────────────
      -- Cash & Bank
      jsonb_build_object('accountCode','11111','accountName','Cash in Hand',        'debit',0,      'credit',0, 'description','Opening Balance'),
      jsonb_build_object('accountCode','11121','accountName','Bank Account — HBL',  'debit',0,      'credit',0, 'description','Opening Balance'),

      -- Accounts Receivable (customers jo paise dene hain)
      jsonb_build_object('accountCode','12111','accountName','Accounts Receivable',  'debit',0,      'credit',0, 'description','Opening Balance'),

      -- Inventory
      jsonb_build_object('accountCode','11511','accountName','Glass Inventory Raw',  'debit',0,      'credit',0, 'description','Opening Balance'),
      jsonb_build_object('accountCode','11513','accountName','WIP Glass',            'debit',0,      'credit',0, 'description','Opening Balance'),
      jsonb_build_object('accountCode','11515','accountName','Finished Goods',       'debit',0,      'credit',0, 'description','Opening Balance'),

      -- Fixed Assets
      jsonb_build_object('accountCode','13111','accountName','Plant & Machinery',    'debit',0,      'credit',0, 'description','Opening Balance'),
      jsonb_build_object('accountCode','13211','accountName','Vehicles',             'debit',0,      'credit',0, 'description','Opening Balance'),

      -- ── CREDIT SIDE (Liabilities + Equity) ──────────────────────
      -- Accounts Payable (vendors jo hum ne dene hain)
      jsonb_build_object('accountCode','22111','accountName','Accounts Payable',     'debit',0,      'credit',0, 'description','Opening Balance'),
      jsonb_build_object('accountCode','22113','accountName','AP Tempering Vendors', 'debit',0,      'credit',0, 'description','Opening Balance'),

      -- Loans
      jsonb_build_object('accountCode','23111','accountName','Bank Loan',            'debit',0,      'credit',0, 'description','Opening Balance'),

      -- Owner Equity
      jsonb_build_object('accountCode','31111','accountName','Owner Capital',        'debit',0,      'credit',0, 'description','Opening Balance'),
      jsonb_build_object('accountCode','31211','accountName','Retained Earnings',    'debit',0,      'credit',0, 'description','Opening Balance')
    ),
    'totalDebit',  0,
    'totalCredit', 0,
    'postedBy', 'Hassan',
    'openingBalance', true
  ),
  now(),
  now()
) ON CONFLICT (id) DO NOTHING;

-- ── STEP 2: Verify balance after entry ───────────────────────────────
-- Run this after inserting — debit aur credit equal hone chahiye
SELECT
  (data->>'totalDebit')::numeric  AS total_debit,
  (data->>'totalCredit')::numeric AS total_credit,
  (data->>'totalDebit')::numeric - (data->>'totalCredit')::numeric AS difference,
  CASE
    WHEN (data->>'totalDebit')::numeric = (data->>'totalCredit')::numeric
    THEN 'BALANCED ✓'
    ELSE 'NOT BALANCED ✗ — fix amounts'
  END AS status
FROM ledger
WHERE id = 'OB-Glassco-2026-04';
