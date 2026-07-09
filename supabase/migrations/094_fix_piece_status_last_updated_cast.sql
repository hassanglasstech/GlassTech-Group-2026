-- ═══════════════════════════════════════════════════════════════════════
-- Migration 094 — HOTFIX: update_piece_status_atomic last_updated type cast
--
-- BUG (live): the UPDATE inside update_piece_status_atomic set
--     last_updated = v_now_iso
-- where v_now_iso is TEXT, but the live production_pieces.last_updated column
-- is TIMESTAMPTZ. Postgres raised
--     42804  column "last_updated" is of type timestamp with time zone
--            but expression is of type text
-- and the function's only EXCEPTION handler caught `undefined_column` (42703,
-- the "column missing on older deployments" case) — NOT the type mismatch. So
-- the error propagated out and EVERY status transition failed on the floor:
-- Cut, QC pass/fail, dispatch status, NCR, recut — all of them.
--
-- FIX:
--   • Assign the TIMESTAMPTZ value (v_now) to the TIMESTAMPTZ column.
--     (v_now_iso — the ISO text — is still used for the data->>'lastUpdated'
--     JSON field, which is correctly a string.)
--   • Broaden the retry EXCEPTION to also catch datatype_mismatch, so a
--     divergent instance where last_updated is TEXT (or absent) still lands
--     the status change via the last_updated-less UPDATE.
--
-- Safe to run repeatedly (CREATE OR REPLACE). No data migration.
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
  IF v_current = 'Hold'
     AND p_new_status NOT IN ('Hold','Broken','Returned')
     AND v_hold_from IS NOT NULL
     AND p_new_status <> v_hold_from THEN
    RAISE EXCEPTION
      'invalid_hold_exit: piece % was held from "%" — can only exit back to "%", got "%"',
      p_piece_id, v_hold_from, v_hold_from, p_new_status;
  END IF;

  -- ── General transition guard (defect #3 & #5) ──
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
     SET data         = v_new_data,
         status       = p_new_status,
         updated_at   = v_now,
         last_updated = v_now          -- FIX: TIMESTAMPTZ value, not the ISO text
   WHERE id = p_piece_id;

  RETURN jsonb_build_object(
    'piece_id',  p_piece_id,
    'old_status', v_current,
    'new_status', p_new_status,
    'version',   v_version + 1,
    'hold_from', v_new_data->>'holdFrom'
  );
EXCEPTION
  -- last_updated may not exist (older deploy) OR be a divergent type — either
  -- way, land the status change via the last_updated-less UPDATE.
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
