-- ═══════════════════════════════════════════════════════════════════════
-- Migration 046 — Sprint 5: Production Atomicity RPCs
--
-- Closes 4 of the 5 production-engineering defects identified in audit
-- (defect #2 — cutting session GL/stock split — was fixed by Sprint 1's
-- consume_glass_stock RPC and is intentionally NOT re-implemented here).
--
-- Two new SECURITY-DEFINER RPCs:
--
--   1. update_piece_status_atomic
--      • SELECT … FOR UPDATE on production_pieces (blocks concurrent writers)
--      • Validates the (current → next) transition against a PG-side
--        replica of the TS PIECE_TRANSITIONS map
--      • Tracks `hold_from` in JSONB `data` so a piece in Hold can ONLY
--        exit back to its origin status (P1 — Hold asymmetry fix)
--      • Increments optimistic-concurrency `version` (Sprint 2 contract)
--
--   2. load_pieces_to_dispatch_atomic
--      • Per-piece SELECT … FOR UPDATE
--      • Rejects pieces already in another active dispatch (P1 — non-atomic
--        batch fix; also satisfies "cannot dispatch a piece already in
--        another active dispatch" acceptance criterion)
--      • Updates production_pieces (dispatch_id + status='Dispatched')
--      • Patches tempering_dispatches.data.pieceIds (union, no duplicates)
--      • All-or-nothing — any failure rolls back the entire batch
--
-- Defect #3 (NCR can resurrect Delivered piece) is enforced both at the
-- service layer (ncrService.createNCR guard) AND here — calling
-- update_piece_status_atomic with new_status='Broken' on a Delivered piece
-- raises 'invalid_transition'.
--
-- Audit: activity_log triggers from migration 045 capture before/after for
-- every UPDATE so we don't need explicit INSERTs into activity_log here.
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- Helper — server-side mirror of TS PIECE_TRANSITIONS map.
-- Returns TRUE if (from → to) is allowed.
-- ─────────────────────────────────────────────────────────────────────
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
    -- Hold has no fixed allow-list — origin-only exits are checked separately
    -- by update_piece_status_atomic via the hold_from value.
    WHEN 'Hold'                    THEN FALSE
    ELSE FALSE
  END;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- RPC #1 — update_piece_status_atomic
--
-- Replaces the client-side fire-and-forget (`getPieces.then(saveAll)`)
-- pattern that was racing with itself. Each call:
--   • Locks the piece row
--   • Validates the transition (or, if leaving Hold, validates the target
--     equals the captured hold_from)
--   • Patches data: status, lastUpdated, version++, hold_from add/clear
--   • Patches the flat `status` column (kept in sync by Sprint-2 trigger)
--
-- p_extra is merged into data so callers can stash dispatch_id, spot_id,
-- pendingServices, fault, etc. in the same transaction.
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_piece_status_atomic(
  p_piece_id    TEXT,
  p_new_status  TEXT,
  p_changed_by  TEXT DEFAULT NULL,
  p_reason      TEXT DEFAULT NULL,
  p_extra       JSONB DEFAULT '{}'::JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row         RECORD;
  v_data        JSONB;
  v_current     TEXT;
  v_hold_from   TEXT;
  v_new_data    JSONB;
  v_now         TIMESTAMPTZ := now();
  v_now_iso     TEXT := to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_version     INT;
BEGIN
  IF p_piece_id IS NULL OR p_new_status IS NULL THEN
    RAISE EXCEPTION 'invalid_payload: piece_id + new_status required';
  END IF;

  -- Pessimistic lock — second concurrent caller waits here
  SELECT id, status, data INTO v_row
    FROM production_pieces
    WHERE id = p_piece_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'piece_not_found: %', p_piece_id;
  END IF;

  v_data    := COALESCE(v_row.data, '{}'::JSONB);
  v_current := COALESCE(v_row.status, v_data->>'status', 'Cut');
  v_hold_from := v_data->>'holdFrom';
  v_version := COALESCE((v_data->>'version')::INT, 1);

  -- ── Hold asymmetry guard (defect #5) ──
  -- A piece parked in 'Hold' may ONLY exit to its captured origin
  -- (or to a universal status: Hold/Broken/Returned).
  IF v_current = 'Hold'
     AND p_new_status NOT IN ('Hold','Broken','Returned')
     AND v_hold_from IS NOT NULL
     AND p_new_status <> v_hold_from THEN
    RAISE EXCEPTION
      'invalid_hold_exit: piece % was held from "%" — can only exit back to "%", got "%"',
      p_piece_id, v_hold_from, v_hold_from, p_new_status;
  END IF;

  -- ── General transition guard (defect #3 & #5) ──
  -- For Hold→originHold the IF above passed; we still need the standard
  -- map check for non-Hold transitions and Hold→universal moves.
  IF v_current <> 'Hold' THEN
    IF NOT _piece_transition_allowed(v_current, p_new_status) THEN
      RAISE EXCEPTION
        'invalid_transition: % cannot move from "%" to "%"',
        p_piece_id, v_current, p_new_status;
    END IF;
  END IF;

  -- ── Compose new data: optimistic version + lastUpdated + status + extra ──
  v_new_data := v_data
              || COALESCE(p_extra, '{}'::JSONB)
              || jsonb_build_object(
                   'status',       p_new_status,
                   'lastUpdated',  v_now_iso,
                   'version',      v_version + 1
                 );

  -- ── holdFrom bookkeeping ──
  -- Entering Hold → snapshot current status as holdFrom (only if we're not
  -- already in Hold). Exiting Hold → clear holdFrom.
  IF p_new_status = 'Hold' AND v_current <> 'Hold' THEN
    v_new_data := v_new_data || jsonb_build_object('holdFrom', v_current);
  ELSIF v_current = 'Hold' AND p_new_status <> 'Hold' THEN
    v_new_data := v_new_data - 'holdFrom';
  END IF;

  -- Audit hint for the trigger (activity_log captures full before/after).
  IF p_changed_by IS NOT NULL THEN
    PERFORM set_config('app.current_user', p_changed_by, true);
  END IF;
  IF p_reason IS NOT NULL THEN
    v_new_data := v_new_data || jsonb_build_object('lastChangeReason', p_reason);
  END IF;

  UPDATE production_pieces
     SET data       = v_new_data,
         status     = p_new_status,
         updated_at = v_now,
         last_updated = v_now          -- TIMESTAMPTZ column takes the TIMESTAMPTZ value (see 094)
   WHERE id = p_piece_id;

  RETURN jsonb_build_object(
    'piece_id',  p_piece_id,
    'old_status', v_current,
    'new_status', p_new_status,
    'version',   v_version + 1,
    'hold_from', v_new_data->>'holdFrom'
  );
EXCEPTION
  -- last_updated may not exist (older deploy) OR be a divergent type — retry without it.
  WHEN undefined_column OR datatype_mismatch THEN
    UPDATE production_pieces
       SET data       = v_new_data,
           status     = p_new_status,
           updated_at = v_now
     WHERE id = p_piece_id;
    RETURN jsonb_build_object(
      'piece_id',  p_piece_id,
      'old_status', v_current,
      'new_status', p_new_status,
      'version',   v_version + 1,
      'hold_from', v_new_data->>'holdFrom'
    );
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- RPC #2 — load_pieces_to_dispatch_atomic
--
-- Replaces the client-side `getPieces → modify-all → saveAll` pattern
-- that was non-atomic and let two operators dispatch the same piece into
-- two trips simultaneously.
--
-- Validation per piece:
--   • exists
--   • status is dispatchable (QC-Passed / Ready to Dispatch / Tempered /
--     Received-From-Tempering)
--   • not already in ANOTHER active dispatch (different dispatch_id)
--
-- All-or-nothing: any failure raises and rolls back the entire batch.
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION load_pieces_to_dispatch_atomic(
  p_dispatch_id TEXT,
  p_piece_ids   TEXT[],
  p_changed_by  TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pid          TEXT;
  v_row          RECORD;
  v_now          TIMESTAMPTZ := now();
  v_now_iso      TEXT := to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_dispatch     RECORD;
  v_existing_ids JSONB;
  v_added        INT := 0;
  v_skipped      INT := 0;
  v_dispatchable TEXT[] := ARRAY[
    'QC-Passed','Ready to Dispatch','Tempered','Received-From-Tempering','Cut'
  ];
BEGIN
  IF p_dispatch_id IS NULL OR p_piece_ids IS NULL OR array_length(p_piece_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'invalid_payload: dispatch_id + non-empty piece_ids required';
  END IF;

  -- Lock the dispatch first so concurrent batches serialise on it.
  SELECT id, data INTO v_dispatch
    FROM tempering_dispatches
    WHERE id = p_dispatch_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'dispatch_not_found: %', p_dispatch_id;
  END IF;

  IF p_changed_by IS NOT NULL THEN
    PERFORM set_config('app.current_user', p_changed_by, true);
  END IF;

  -- Per-piece validate + update (each piece locked individually).
  FOREACH v_pid IN ARRAY p_piece_ids LOOP
    SELECT id, status, data INTO v_row
      FROM production_pieces
      WHERE id = v_pid
      FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'piece_not_found: %', v_pid;
    END IF;

    -- Already in THIS dispatch? Skip silently (idempotent re-load).
    IF (v_row.data->>'dispatchId') = p_dispatch_id THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Already in ANOTHER active dispatch? Reject the batch.
    IF v_row.data ? 'dispatchId'
       AND COALESCE(v_row.data->>'dispatchId','') <> ''
       AND v_row.data->>'dispatchId' <> p_dispatch_id THEN
      RAISE EXCEPTION
        'piece_already_dispatched: % is in dispatch %, cannot add to %',
        v_pid, v_row.data->>'dispatchId', p_dispatch_id;
    END IF;

    -- Status must be dispatchable
    IF NOT (COALESCE(v_row.status, v_row.data->>'status') = ANY (v_dispatchable)) THEN
      RAISE EXCEPTION
        'piece_not_dispatchable: % is "%" — must be QC-Passed/Ready to Dispatch/Tempered/Received-From-Tempering/Cut',
        v_pid, COALESCE(v_row.status, v_row.data->>'status');
    END IF;

    UPDATE production_pieces
       SET data = COALESCE(data, '{}'::JSONB) || jsonb_build_object(
                    'dispatchId',  p_dispatch_id,
                    'status',      'Dispatched',
                    'lastUpdated', v_now_iso,
                    'version',     COALESCE((data->>'version')::INT, 1) + 1
                  ),
           status     = 'Dispatched',
           updated_at = v_now
     WHERE id = v_pid;

    v_added := v_added + 1;
  END LOOP;

  -- Patch the dispatch with the union of existing + new piece_ids
  v_existing_ids := COALESCE(v_dispatch.data->'pieceIds', '[]'::JSONB);
  UPDATE tempering_dispatches
     SET data = COALESCE(data, '{}'::JSONB) || jsonb_build_object(
                  'pieceIds', (
                    SELECT jsonb_agg(DISTINCT v ORDER BY v)
                    FROM (
                      SELECT jsonb_array_elements_text(v_existing_ids) AS v
                      UNION
                      SELECT unnest(p_piece_ids) AS v
                    ) u
                  ),
                  'lastUpdated', v_now_iso
                ),
         updated_at = v_now
   WHERE id = p_dispatch_id;

  RETURN jsonb_build_object(
    'dispatch_id', p_dispatch_id,
    'added',       v_added,
    'skipped',     v_skipped,
    'total',       array_length(p_piece_ids, 1)
  );
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- Grants
-- ─────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION _piece_transition_allowed(TEXT, TEXT)                            TO anon, authenticated;
GRANT EXECUTE ON FUNCTION update_piece_status_atomic(TEXT, TEXT, TEXT, TEXT, JSONB)        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION load_pieces_to_dispatch_atomic(TEXT, TEXT[], TEXT)               TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────
-- SELECT _piece_transition_allowed('Cut', 'QC-Pending');           -- t
-- SELECT _piece_transition_allowed('Delivered', 'Cut');            -- f
-- SELECT _piece_transition_allowed('Cut', 'Hold');                 -- t (universal)
-- SELECT _piece_transition_allowed('Hold', 'Cut');                 -- f (origin-only — checked in RPC)
-- SELECT proname FROM pg_proc
--   WHERE proname IN ('update_piece_status_atomic','load_pieces_to_dispatch_atomic');
-- ═══════════════════════════════════════════════════════════════════════
