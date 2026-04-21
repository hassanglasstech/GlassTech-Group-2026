-- ============================================================
-- stock_ledger + ledger missing flat columns — 20260433
-- Two code paths write different column names — add ALL
-- ============================================================

-- ── stock_ledger: inventoryService writes these flat columns ──
-- (material_id was never added despite being in every upsert call)
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS material_id       TEXT;

-- SyncService writes these (different names from the GRN flow):
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS movement_type     TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS quantity          NUMERIC DEFAULT 0;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS posting_date      DATE;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS document_no       TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS plant             TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS storage_loc       TEXT;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS value             NUMERIC DEFAULT 0;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS moving_avg_price  NUMERIC DEFAULT 0;

-- ── ledger: financeService writes these but created_by was missing ──
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS created_by    TEXT;
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS doc_type      TEXT;
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS doc_date      TEXT;
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS description   TEXT;
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS reference_id  TEXT;

-- ── Refresh Supabase schema cache ──
NOTIFY pgrst, 'reload schema';

GRANT ALL ON stock_ledger TO anon, authenticated;
GRANT ALL ON ledger       TO anon, authenticated;

SELECT 'stock_ledger + ledger columns fixed.' AS status;
