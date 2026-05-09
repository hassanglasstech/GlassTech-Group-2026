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
-- Pure additive — no behaviour change. Indexes are CREATEd CONCURRENTLY-
-- safe (IF NOT EXISTS); we don't use CONCURRENTLY here because Supabase
-- migrations run inside a transaction.
-- ═══════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_pieces_company_status_order
  ON production_pieces (company, status, order_id);

CREATE INDEX IF NOT EXISTS idx_pieces_dispatch_id
  ON production_pieces (dispatch_id)
  WHERE dispatch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pieces_updated_at
  ON production_pieces (updated_at DESC);

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────
-- SELECT indexname, indexdef FROM pg_indexes
--   WHERE tablename = 'production_pieces'
--   ORDER BY indexname;
-- -- expect: idx_pieces_company_status_order, idx_pieces_dispatch_id,
-- --         idx_pieces_updated_at, plus pre-existing PK + idx_production_pieces_company.
--
-- -- Smoke test the new composite index is used by the planner:
-- EXPLAIN ANALYZE
-- SELECT id, status, order_id FROM production_pieces
--  WHERE company = 'Glassco' AND status = 'QC-Pending';
-- ═══════════════════════════════════════════════════════════════════════
