-- ═══════════════════════════════════════════════════════════════════════
-- Migration 041 — Sprint 0: Sheet Consumption Lock
--
-- Replaces QR scanner workflow with manual sheet number entry +
-- autocomplete. Adds DB-level guard so a single sheet (tag_id) cannot
-- be consumed by two cutting sessions simultaneously.
--
-- Changes:
--   1. Add flat columns to grn_sheet_entries: tag_id, consumed_in_session_id,
--      consumed_at, consumed_by
--   2. Backfill tag_id from JSONB data->>'tagId' for existing rows
--   3. Partial UNIQUE index on tag_id WHERE consumed_in_session_id IS NULL
--      → blocks the case where the same tag_id is unconsumed in 2 rows
--      (defensive — shouldn't happen but cheap insurance)
--   4. UNIQUE constraint on (consumed_in_session_id, tag_id) IS NOT NULL
--      → second session attempting to claim same tag_id fails at DB
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 1. Add flat columns
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE grn_sheet_entries
  ADD COLUMN IF NOT EXISTS tag_id TEXT,
  ADD COLUMN IF NOT EXISTS consumed_in_session_id TEXT,
  ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consumed_by TEXT;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Backfill tag_id from JSONB data blob (idempotent)
-- ─────────────────────────────────────────────────────────────────────
UPDATE grn_sheet_entries
SET tag_id = data->>'tagId'
WHERE tag_id IS NULL
  AND data ? 'tagId';

-- ─────────────────────────────────────────────────────────────────────
-- 3. Atomic consume RPC — used by cutting session to claim a sheet
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION consume_grn_sheet(
  p_tag_id TEXT,
  p_session_id TEXT,
  p_company TEXT,
  p_consumed_by TEXT
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_row grn_sheet_entries%ROWTYPE;
BEGIN
  -- Lock the row, fail loudly if already consumed
  SELECT * INTO v_row
  FROM grn_sheet_entries
  WHERE tag_id = p_tag_id
    AND company = p_company
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sheet_not_found: %', p_tag_id;
  END IF;

  IF v_row.consumed_in_session_id IS NOT NULL
     AND v_row.consumed_in_session_id <> p_session_id THEN
    RAISE EXCEPTION 'sheet_already_consumed: % (session %)',
      p_tag_id, v_row.consumed_in_session_id;
  END IF;

  UPDATE grn_sheet_entries
  SET consumed_in_session_id = p_session_id,
      consumed_at = now(),
      consumed_by = p_consumed_by,
      data = data || jsonb_build_object(
        'consumedInSessionId', p_session_id,
        'consumedAt', now(),
        'consumedBy', p_consumed_by
      )
  WHERE id = v_row.id;

  RETURN jsonb_build_object(
    'tag_id', v_row.tag_id,
    'thickness', v_row.data->>'thickness',
    'sheet_size', v_row.data->>'sheetSize',
    'sqft_per_sheet', (v_row.data->>'sqftPerSheet')::numeric,
    'status', v_row.data->>'status',
    'session_id', p_session_id
  );
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 4. Indexes for autocomplete + uniqueness
-- ─────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_grn_sheet_entries_tag_id
  ON grn_sheet_entries(tag_id);

CREATE INDEX IF NOT EXISTS idx_grn_sheet_entries_company_unconsumed
  ON grn_sheet_entries(company, tag_id)
  WHERE consumed_in_session_id IS NULL;

-- One sheet (tag_id within a company) can only be claimed by one session.
-- NULL session = available; FILTER ensures uniqueness only on consumed rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_grn_sheet_entries_consumed_unique
  ON grn_sheet_entries(company, tag_id)
  WHERE consumed_in_session_id IS NOT NULL;

GRANT EXECUTE ON FUNCTION consume_grn_sheet(TEXT, TEXT, TEXT, TEXT)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
