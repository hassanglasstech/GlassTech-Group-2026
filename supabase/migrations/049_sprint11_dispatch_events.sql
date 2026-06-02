-- ═══════════════════════════════════════════════════════════════════════
-- Migration 049 — Sprint 11: Atomic Dispatch + Audit Log
--
-- Closes P0 outbound bugs:
--   • Fragmented dispatch lifecycle  → single event-sourced log
--   • A piece could be in 2 active dispatches → unique active-dispatch index
--   • Vendor invoice mismatches missed → 3-way match columns + RPC flag
--   • Dispatch could be marked Dispatched without gate pass → FK + RPC guard
--
-- ───────────────────────────────────────────────────────────────────────
-- HOTFIX (user feedback 2026-05-10):
-- Live Supabase has tempering_dispatches.id as UUID (not TEXT as the
-- repo migrations claim). Original FK fk_dispatch_event_dispatch failed
-- with "incompatible types: text and uuid".
--
-- Fix: detect tempering_dispatches.id actual type at apply time. Build
-- dispatch_id columns to match. FK created via EXECUTE format() so types
-- always align. RPCs use TEXT params with explicit casts so a single
-- function definition works regardless of PK type.
--
-- Idempotent — safe to re-run after a partial failure.
-- ═══════════════════════════════════════════════════════════════════════

-- Drop any partial artefacts from a failed prior run
DROP TABLE IF EXISTS dispatch_events CASCADE;
DROP FUNCTION IF EXISTS _dispatch_events_block_mutation() CASCADE;
DROP FUNCTION IF EXISTS append_dispatch_event(TEXT, TEXT, JSONB, TEXT) CASCADE;
DROP FUNCTION IF EXISTS authorize_dispatch(TEXT, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS record_three_way_match(TEXT, TEXT, NUMERIC, NUMERIC, TEXT) CASCADE;

-- ─────────────────────────────────────────────────────────────────────
-- 1. dispatch_events — append-only audit log
--    dispatch_id type matches tempering_dispatches.id
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_id_type TEXT;
BEGIN
  SELECT data_type INTO v_id_type
    FROM information_schema.columns
    WHERE table_name='tempering_dispatches' AND column_name='id' LIMIT 1;

  IF v_id_type IS NULL THEN
    RAISE EXCEPTION 'tempering_dispatches table missing — apply earlier migrations first';
  END IF;

  EXECUTE format($t$
    CREATE TABLE dispatch_events (
      id           BIGSERIAL PRIMARY KEY,
      dispatch_id  %s NOT NULL,
      company      TEXT NOT NULL,
      event_type   TEXT NOT NULL,
      event_data   JSONB DEFAULT '{}'::jsonb,
      occurred_at  TIMESTAMPTZ DEFAULT now(),
      created_by   TEXT,
      CONSTRAINT fk_dispatch_event_dispatch
        FOREIGN KEY (dispatch_id) REFERENCES tempering_dispatches(id) ON DELETE CASCADE
    )
  $t$, v_id_type);
END $$;

CREATE INDEX IF NOT EXISTS idx_dispatch_events_dispatch
  ON dispatch_events (dispatch_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_dispatch_events_company_date
  ON dispatch_events (company, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_dispatch_events_type
  ON dispatch_events (event_type, occurred_at DESC);

-- Append-only: block UPDATE / DELETE
CREATE OR REPLACE FUNCTION _dispatch_events_block_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'dispatch_events is append-only — UPDATE/DELETE denied (event_id=%)', OLD.id;
END $$;

CREATE TRIGGER dispatch_events_no_update
  BEFORE UPDATE OR DELETE ON dispatch_events
  FOR EACH ROW EXECUTE FUNCTION _dispatch_events_block_mutation();

ALTER TABLE dispatch_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dispatch_events_rw ON dispatch_events;
CREATE POLICY dispatch_events_rw ON dispatch_events FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────
-- 2. tempering_dispatches — flat columns for 3-way match + gate pass
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_gp_type TEXT;
  v_disp_id_type TEXT;
BEGIN
  -- Look up gate_passes.id type so the gate_pass_id column matches it
  SELECT data_type INTO v_gp_type
    FROM information_schema.columns
    WHERE table_name='gate_passes' AND column_name='id' LIMIT 1;

  -- Look up tempering_dispatches.id type for any FK we add
  SELECT data_type INTO v_disp_id_type
    FROM information_schema.columns
    WHERE table_name='tempering_dispatches' AND column_name='id' LIMIT 1;

  -- Add flat columns (idempotent)
  ALTER TABLE tempering_dispatches
    ADD COLUMN IF NOT EXISTS vendor_invoice_amount   NUMERIC(15,2),
    ADD COLUMN IF NOT EXISTS vendor_invoice_no       TEXT,
    ADD COLUMN IF NOT EXISTS three_way_match_status  TEXT,
    ADD COLUMN IF NOT EXISTS status                  TEXT;

  -- gate_pass_id with matching type (default to TEXT if gate_passes missing)
  IF v_gp_type IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE tempering_dispatches ADD COLUMN IF NOT EXISTS gate_pass_id %s',
      v_gp_type
    );
  ELSE
    ALTER TABLE tempering_dispatches ADD COLUMN IF NOT EXISTS gate_pass_id TEXT;
  END IF;
END $$;

-- 3-way match check
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name='tempering_dispatches' AND constraint_name='chk_three_way_match_status'
  ) THEN
    ALTER TABLE tempering_dispatches
      ADD CONSTRAINT chk_three_way_match_status
      CHECK (three_way_match_status IS NULL
             OR three_way_match_status IN ('Match','Mismatch','Pending'));
  END IF;
END $$;

-- gate_pass_id FK (only if types align)
DO $$
DECLARE
  v_gp_type TEXT;
  v_my_type TEXT;
BEGIN
  SELECT data_type INTO v_gp_type
    FROM information_schema.columns
    WHERE table_name='gate_passes' AND column_name='id' LIMIT 1;
  SELECT data_type INTO v_my_type
    FROM information_schema.columns
    WHERE table_name='tempering_dispatches' AND column_name='gate_pass_id' LIMIT 1;

  IF v_gp_type IS NOT NULL
     AND v_my_type = v_gp_type
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.table_constraints
       WHERE table_name='tempering_dispatches'
         AND constraint_name='fk_tempering_dispatches_gate_pass'
     ) THEN
    ALTER TABLE tempering_dispatches
      ADD CONSTRAINT fk_tempering_dispatches_gate_pass
      FOREIGN KEY (gate_pass_id) REFERENCES gate_passes(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tempering_dispatches_gate_pass
  ON tempering_dispatches (gate_pass_id) WHERE gate_pass_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tempering_dispatches_3way
  ON tempering_dispatches (three_way_match_status)
  WHERE three_way_match_status IN ('Mismatch','Pending');

-- ─────────────────────────────────────────────────────────────────────
-- 3. production_pieces — unique active-dispatch index (JSONB expr)
--
-- Prevents the same piece being attached to TWO active dispatches.
-- "Active" = piece is currently in flight (Dispatched / Tempered /
-- Received-From-Tempering). After Delivered/Returned/Broken the
-- dispatch_id link is fine to leave for history, but the active flight
-- must be unique.
-- ─────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_pieces_active_dispatch;
CREATE UNIQUE INDEX idx_pieces_active_dispatch
  ON production_pieces ((data->>'dispatchId'))
  WHERE (data->>'dispatchId') IS NOT NULL
    AND (data->>'status') IN ('Dispatched','Tempered','Received-From-Tempering');

-- ─────────────────────────────────────────────────────────────────────
-- 4. RPC: append_dispatch_event
--
-- Param uses TEXT — the function casts on lookup so a single signature
-- works whether tempering_dispatches.id is UUID or TEXT.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION append_dispatch_event(
  p_dispatch_id  TEXT,
  p_event_type   TEXT,
  p_event_data   JSONB DEFAULT '{}'::jsonb,
  p_created_by   TEXT  DEFAULT 'system'
) RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_company TEXT;
  v_event_id BIGINT;
  v_allowed_types TEXT[] := ARRAY[
    'CREATED','PIECES_LOADED','AUTHORIZED','GATE_OUT','IN_TRANSIT',
    'ARRIVED','RECEIVING','INVOICE_RECORDED','THREE_WAY_MATCHED',
    'CLOSED','CANCELLED'
  ];
BEGIN
  IF p_dispatch_id IS NULL OR p_event_type IS NULL THEN
    RAISE EXCEPTION 'invalid_payload: dispatch_id + event_type required';
  END IF;

  IF NOT (p_event_type = ANY (v_allowed_types)) THEN
    RAISE EXCEPTION 'invalid_event_type: % (allowed: %)', p_event_type, v_allowed_types;
  END IF;

  -- id::text cast lets this work for both UUID and TEXT primary keys
  SELECT COALESCE(company, data->>'company') INTO v_company
    FROM tempering_dispatches WHERE id::text = p_dispatch_id;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'dispatch_not_found: %', p_dispatch_id;
  END IF;

  -- INSERT — dispatch_id column type matches tempering_dispatches.id, so
  -- we cast the TEXT param to that type via the column's implicit cast.
  EXECUTE 'INSERT INTO dispatch_events (dispatch_id, company, event_type, event_data, created_by)
           VALUES ($1, $2, $3, $4, $5) RETURNING id'
    INTO v_event_id
    USING p_dispatch_id, v_company, p_event_type,
          COALESCE(p_event_data, '{}'::jsonb), COALESCE(p_created_by, 'system');

  RETURN v_event_id;
END $$;

GRANT EXECUTE ON FUNCTION append_dispatch_event(TEXT, TEXT, JSONB, TEXT) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 5. RPC: authorize_dispatch — gate-pass guard
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION authorize_dispatch(
  p_dispatch_id   TEXT,
  p_gate_pass_id  TEXT,
  p_authorized_by TEXT DEFAULT 'system'
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_company TEXT;
  v_existing_gate TEXT;
BEGIN
  IF p_dispatch_id IS NULL OR p_gate_pass_id IS NULL THEN
    RAISE EXCEPTION 'invalid_payload: dispatch_id + gate_pass_id required';
  END IF;

  SELECT COALESCE(company, data->>'company'), gate_pass_id::text
    INTO v_company, v_existing_gate
    FROM tempering_dispatches WHERE id::text = p_dispatch_id
    FOR UPDATE;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'dispatch_not_found: %', p_dispatch_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM gate_passes
    WHERE id::text = p_gate_pass_id AND COALESCE(company, '') = v_company
  ) THEN
    RAISE EXCEPTION 'gate_pass_not_found_for_company: gate_pass=% company=%', p_gate_pass_id, v_company;
  END IF;

  IF v_existing_gate IS NOT NULL AND v_existing_gate <> p_gate_pass_id THEN
    RAISE EXCEPTION 'already_authorized_with_different_gate_pass: existing=% new=%', v_existing_gate, p_gate_pass_id;
  END IF;

  EXECUTE 'UPDATE tempering_dispatches
              SET gate_pass_id = $1,
                  status       = ''Dispatched'',
                  data         = COALESCE(data, ''{}''::jsonb)
                                 || jsonb_build_object(''gatePassId'', $2, ''status'', ''Dispatched''),
                  updated_at   = now()
            WHERE id::text = $3'
    USING p_gate_pass_id, p_gate_pass_id, p_dispatch_id;

  PERFORM append_dispatch_event(p_dispatch_id, 'AUTHORIZED',
    jsonb_build_object('gatePassId', p_gate_pass_id), p_authorized_by);
END $$;

GRANT EXECUTE ON FUNCTION authorize_dispatch(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 6. RPC: record_three_way_match
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION record_three_way_match(
  p_dispatch_id           TEXT,
  p_vendor_invoice_no     TEXT,
  p_vendor_invoice_amount NUMERIC,
  p_computed_ap_amount    NUMERIC,
  p_recorded_by           TEXT DEFAULT 'system'
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_status    TEXT;
  v_delta_pct NUMERIC;
  v_rows      INT;
BEGIN
  IF p_dispatch_id IS NULL OR p_vendor_invoice_amount IS NULL OR p_computed_ap_amount IS NULL THEN
    RAISE EXCEPTION 'invalid_payload: dispatch_id + amounts required';
  END IF;

  IF p_computed_ap_amount = 0 THEN
    v_delta_pct := CASE WHEN p_vendor_invoice_amount = 0 THEN 0 ELSE 100 END;
  ELSE
    v_delta_pct := ABS(p_vendor_invoice_amount - p_computed_ap_amount) / p_computed_ap_amount * 100;
  END IF;

  v_status := CASE WHEN v_delta_pct <= 5 THEN 'Match' ELSE 'Mismatch' END;

  EXECUTE 'UPDATE tempering_dispatches
              SET vendor_invoice_no       = $1,
                  vendor_invoice_amount   = $2,
                  three_way_match_status  = $3,
                  updated_at              = now()
            WHERE id::text = $4'
    USING p_vendor_invoice_no, p_vendor_invoice_amount, v_status, p_dispatch_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'dispatch_not_found: %', p_dispatch_id;
  END IF;

  PERFORM append_dispatch_event(p_dispatch_id, 'THREE_WAY_MATCHED',
    jsonb_build_object(
      'vendorInvoiceNo',     p_vendor_invoice_no,
      'vendorInvoiceAmount', p_vendor_invoice_amount,
      'computedApAmount',    p_computed_ap_amount,
      'deltaPct',            ROUND(v_delta_pct, 2),
      'status',              v_status
    ), p_recorded_by);

  RETURN v_status;
END $$;

GRANT EXECUTE ON FUNCTION record_three_way_match(TEXT, TEXT, NUMERIC, NUMERIC, TEXT) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 7. PostgREST schema reload
-- ─────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────
-- 8. Verification
--
-- -- Lifecycle for a dispatch:
-- SELECT event_type, occurred_at, created_by, event_data
--   FROM dispatch_events WHERE dispatch_id::text = 'TD-xxxx' ORDER BY occurred_at;
--
-- -- 3-way mismatches needing supervisor review:
-- SELECT id, vendor_invoice_no, vendor_invoice_amount, three_way_match_status
--   FROM tempering_dispatches WHERE three_way_match_status = 'Mismatch';
--
-- -- Active-dispatch uniqueness (should be empty):
-- SELECT data->>'dispatchId' AS d, count(*) FROM production_pieces
--   WHERE (data->>'dispatchId') IS NOT NULL
--     AND (data->>'status') IN ('Dispatched','Tempered','Received-From-Tempering')
--   GROUP BY 1 HAVING count(*) > 1;
-- ═══════════════════════════════════════════════════════════════════════
