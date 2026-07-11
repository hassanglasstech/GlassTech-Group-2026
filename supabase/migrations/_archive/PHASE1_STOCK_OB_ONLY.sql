-- ============================================================
-- GLASSCO — STOCK OPENING BALANCE ONLY
-- Sirf inventory ka opening balance — baaki baad mein
-- Run in Supabase SQL Editor
-- ============================================================

-- Step A: Ensure columns exist
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}';
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS doc_type TEXT DEFAULT 'JV';
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS doc_date TEXT;
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS reference_id TEXT;
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Posted';

-- Step B: Stock opening entry
-- EDIT: Raw Glass aur FG ki actual value PKR mein daalo

INSERT INTO ledger (
  id, company, doc_type, doc_date, description,
  reference_id, status, data, created_at, updated_at
) VALUES (
  'OB-STOCK-Glassco-2026-04',
  'Glassco',
  'JV',
  '2026-04-01',
  'Stock Opening Balance — GlassCo April 2026',
  'OPENING-STOCK',
  'Posted',
  jsonb_build_object(
    'lines', jsonb_build_array(

      -- Dr: Raw Glass Inventory (actual stock value likhna hai)
      jsonb_build_object(
        'accountCode', '11511',
        'accountName', 'Glass Inventory Raw',
        'debit',  0,          -- ← YE AMOUNT DAALO (e.g. 850000)
        'credit', 0,
        'description', 'Opening Stock — Raw Glass'
      ),

      -- Dr: Finished Goods (agar cut/processed glass hai)
      jsonb_build_object(
        'accountCode', '11515',
        'accountName', 'Finished Goods — Glass',
        'debit',  0,          -- ← YE AMOUNT DAALO (agar hai to)
        'credit', 0,
        'description', 'Opening Stock — Finished Glass'
      ),

      -- Cr: Owner Equity (counter entry)
      jsonb_build_object(
        'accountCode', '31111',
        'accountName', 'Owner Capital',
        'debit',  0,
        'credit', 0,          -- ← SAME TOTAL DAALO (Raw + FG)
        'description', 'Opening Stock contra entry'
      )
    ),
    'totalDebit',  0,         -- ← Raw + FG total
    'totalCredit', 0,         -- ← Same number
    'postedBy', 'Hassan',
    'openingBalance', true,
    'note', 'Partial opening — only stock. Full OB pending.'
  ),
  now(),
  now()
) ON CONFLICT (id) DO UPDATE SET
  data = EXCLUDED.data,
  updated_at = now();

-- Step C: Verify
SELECT
  description,
  (data->>'totalDebit')::numeric  AS stock_value,
  (data->>'totalCredit')::numeric AS contra,
  CASE
    WHEN (data->>'totalDebit')::numeric = (data->>'totalCredit')::numeric
    THEN 'BALANCED ✓'
    ELSE 'NOT BALANCED ✗'
  END AS status
FROM ledger
WHERE id = 'OB-STOCK-Glassco-2026-04';
