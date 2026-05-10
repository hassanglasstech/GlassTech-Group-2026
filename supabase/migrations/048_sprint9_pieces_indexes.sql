-- ═══════════════════════════════════════════════════════════════════════
-- Migration 048 — Sprint 9: production_pieces hot-path indexes
--
-- Three additive indexes to support 1000+ active pieces without table
-- scans on the queries the production module hits every render:
--
--   1. (company, status, order_id) — composite index for the "list me
--      every QC-Pending piece for this Glassco order" lookup that
--      ProductionContext + QCCheckPanel + DispatchView all do.
--
--   2. dispatch_id (partial) — drives the "is this piece already in
--      another active dispatch?" guard from Sprint 5's
--      load_pieces_to_dispatch_atomic RPC. Partial index keeps it
--      tiny; only rows actually loaded into a dispatch are stored.
--
--   3. updated_at DESC — getProductionPiecesPage orders by this. With
--      1000+ rows the cost of an unindexed sort on every page load was
--      noticeable on staging. DESC ordering matches the query exactly.
--
-- ───────────────────────────────────────────────────────────────────────
-- HOTFIX (user feedback 2026-05-10):
-- production_pieces stores `status`, `order_id`, `dispatch_id` inside the
-- JSONB `data` column — not as flat columns. The original 048 referenced
-- flat columns and failed with "column dispatch_id does not exist".
--
-- Fixed: detect at runtime which columns exist; create either a flat-
-- column index OR a JSONB-expression index. Either way the planner
-- picks it up because both the service layer and the RPCs use the same
-- column expression as the indexed expression.
--
-- Safe to re-run on partial / failed prior application.
-- ═══════════════════════════════════════════════════════════════════════

-- Drop any partially-created variants first so re-runs converge cleanly
DROP INDEX IF EXISTS idx_pieces_company_status_order;
DROP INDEX IF EXISTS idx_pieces_dispatch_id;
DROP INDEX IF EXISTS idx_pieces_updated_at;

-- ─────────────────────────────────────────────────────────────────────
-- Helper: column exists?
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  has_status_col   BOOLEAN;
  has_order_col    BOOLEAN;
  has_dispatch_col BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='production_pieces' AND column_name='status'
  ) INTO has_status_col;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='production_pieces' AND column_name='order_id'
  ) INTO has_order_col;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='production_pieces' AND column_name='dispatch_id'
  ) INTO has_dispatch_col;

  -- ── Index 1: (company, status, order_id) ─────────────────────────
  IF has_status_col AND has_order_col THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_pieces_company_status_order
             ON production_pieces (company, status, order_id)';
  ELSE
    -- JSONB expression variant — service layer already reads via data->>'status'
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_pieces_company_status_order
        ON production_pieces (company, (data->>'status'), (data->>'orderId'))
    $idx$;
  END IF;

  -- ── Index 2: dispatch_id (partial — only when set) ──────────────
  IF has_dispatch_col THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_pieces_dispatch_id
             ON production_pieces (dispatch_id)
             WHERE dispatch_id IS NOT NULL';
  ELSE
    -- JSONB expression — matches data->>''dispatchId'' used by Sprint 5's
    -- load_pieces_to_dispatch_atomic RPC and Sprint 11's active-dispatch
    -- uniqueness index (idx_pieces_active_dispatch).
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_pieces_dispatch_id
        ON production_pieces ((data->>'dispatchId'))
        WHERE (data->>'dispatchId') IS NOT NULL
    $idx$;
  END IF;
END $$;

-- ── Index 3: updated_at DESC (this column is always flat) ───────
CREATE INDEX IF NOT EXISTS idx_pieces_updated_at
  ON production_pieces (updated_at DESC);

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────
-- SELECT indexname, indexdef FROM pg_indexes
--   WHERE tablename = 'production_pieces'
--   ORDER BY indexname;
-- -- Expect: idx_pieces_company_status_order, idx_pieces_dispatch_id,
-- --         idx_pieces_updated_at, plus pre-existing PK +
-- --         production_pieces_company_idx.
--
-- -- Smoke test the composite index is used by the planner:
-- EXPLAIN ANALYZE
-- SELECT id FROM production_pieces
--  WHERE company = 'Glassco' AND data->>'status' = 'QC-Pending';
-- ═══════════════════════════════════════════════════════════════════════
