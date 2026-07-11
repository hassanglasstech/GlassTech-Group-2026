-- 083_cutter_workflow.sql
-- Cutter workflow: job→cutter assignment, piece-level cut attribution, and a
-- new 'Pending-Cut' pool status.
--
-- Flow:
--   • Job order is assigned to a cutter           (quotations.assigned_cutter)
--   • Pieces are created at approval as 'Pending-Cut' (the pool)
--   • The cutter cuts each piece → status 'Cut' + cut_by / cut_at
--   • The SAME pieces then flow QC → tempering → delivery (unchanged)
--
-- STAGING-FIRST: apply on staging, smoke-test the cutter cut flow
-- (Pending-Cut → Cut via update_piece_status_atomic), then promote to live.
-- Harmless until the app starts creating pieces at 'Pending-Cut'.

-- 1. Job order → cutter assignment (job-level). Flat column for SQL reporting;
--    the app also round-trips it inside quotations.data.
ALTER TABLE quotations       ADD COLUMN IF NOT EXISTS assigned_cutter TEXT;

-- 2. Piece-level cut attribution. The RPC also carries cutBy/cutAt inside
--    production_pieces.data (p_extra merge); these flat columns are for SQL
--    reporting / per-cutter rollups.
ALTER TABLE production_pieces ADD COLUMN IF NOT EXISTS cut_by TEXT;
ALTER TABLE production_pieces ADD COLUMN IF NOT EXISTS cut_at TIMESTAMPTZ;

-- 3. Extend the server-side transition map so the cutter's Pending-Cut → Cut
--    move is allowed (mirrors TS PIECE_TRANSITIONS). Recreated verbatim from
--    046_sprint5_production_atomic.sql with the 'Pending-Cut' row added.
CREATE OR REPLACE FUNCTION _piece_transition_allowed(
  p_from TEXT,
  p_to   TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- No-op (e.g. spot reassignment that re-sets the same status)
  IF p_from = p_to THEN RETURN TRUE; END IF;

  -- Universal transitions — allowed FROM any status
  IF p_to IN ('Hold', 'Broken', 'Returned') THEN RETURN TRUE; END IF;

  -- Per-status forward + corrective transitions (mirror TS PIECE_TRANSITIONS)
  RETURN CASE p_from
    WHEN 'Pending-Cut'             THEN p_to IN ('Cut')
    WHEN 'Cut'                     THEN p_to IN ('Service-Pending','QC-Pending','QC-Failed')
    WHEN 'Service-Pending'         THEN p_to IN ('QC-Pending','Cut','QC-Failed')
    WHEN 'QC-Pending'              THEN p_to IN ('QC-Passed','QC-Failed','Service-Pending')
    WHEN 'QC-Failed'               THEN p_to IN ('Cut','Service-Pending')
    WHEN 'QC-Passed'               THEN p_to IN ('Ready to Dispatch','Dispatched','Delivered')
    WHEN 'Ready to Dispatch'       THEN p_to IN ('Dispatched','Delivered','QC-Passed')
    WHEN 'Dispatched'              THEN p_to IN ('Tempered','Received-From-Tempering','Ready to Dispatch')
    WHEN 'Tempered'                THEN p_to IN ('Ready to Dispatch','Received-From-Tempering','Delivered','QC-Pending')
    WHEN 'Received-From-Tempering' THEN p_to IN ('Ready to Dispatch','Tempered','QC-Pending')
    WHEN 'Delivered'               THEN FALSE     -- terminal except universal (above)
    WHEN 'Returned'                THEN p_to IN ('Cut')
    WHEN 'Broken'                  THEN FALSE     -- terminal
    WHEN 'Hold'                    THEN FALSE     -- origin-only exits checked in the RPC
    ELSE FALSE
  END;
END $$;

GRANT EXECUTE ON FUNCTION _piece_transition_allowed(TEXT, TEXT) TO anon, authenticated;

-- Smoke test (run on staging after apply):
--   SELECT _piece_transition_allowed('Pending-Cut','Cut');   -- expect t
--   SELECT _piece_transition_allowed('Pending-Cut','QC-Pending'); -- expect f
--   SELECT _piece_transition_allowed('Cut','Service-Pending'); -- expect t (unchanged)
