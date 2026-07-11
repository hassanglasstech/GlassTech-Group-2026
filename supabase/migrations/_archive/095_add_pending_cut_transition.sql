-- ═══════════════════════════════════════════════════════════════════════
-- Migration 095 — HOTFIX: allow Pending-Cut → Cut in _piece_transition_allowed
--
-- BUG (live): the server-side transition map _piece_transition_allowed (from
-- migration 046) predates the cutter workflow (migration 083), which introduced
-- the 'Pending-Cut' pool status. The CASE map has no 'Pending-Cut' branch, so
-- _piece_transition_allowed('Pending-Cut','Cut') fell through to ELSE → FALSE,
-- and update_piece_status_atomic raised
--     invalid_transition: <id> cannot move from "Pending-Cut" to "Cut"
-- Every cut on the floor failed once the cutter tried to mark a piece Cut.
--
-- FIX: add `WHEN 'Pending-Cut' THEN p_to IN ('Cut')`, mirroring the TS map
-- PIECE_TRANSITIONS in ProductionContext.tsx ('Pending-Cut': ['Cut']). All
-- other branches already matched the TS map, so this is the only gap.
--
-- Safe to run repeatedly (CREATE OR REPLACE). No data migration.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION _piece_transition_allowed(
  p_from TEXT,
  p_to   TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- No-op (e.g. spot reassignment / cutter assignment that re-sets the same status)
  IF p_from = p_to THEN RETURN TRUE; END IF;

  -- Universal transitions — allowed FROM any status
  IF p_to IN ('Hold', 'Broken', 'Returned') THEN RETURN TRUE; END IF;

  -- Per-status forward + corrective transitions (mirror TS PIECE_TRANSITIONS)
  RETURN CASE p_from
    WHEN 'Pending-Cut'             THEN p_to IN ('Cut')                 -- 083 cutter pool → cut
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
    WHEN 'Hold'                    THEN FALSE     -- origin-only exit checked in update_piece_status_atomic
    ELSE FALSE
  END;
END $$;
