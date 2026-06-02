-- ═══════════════════════════════════════════════════════════════════════
-- Migration 033 — Phase 2: Atomic Serial Allocator (RC-1, RC-8, RC-9)
--
-- Audit findings addressed:
--   B4 / RC-1  Two users approving in parallel computed the same
--              maxSeq+1 from a stale local array → identical SO numbers,
--              second save silently overwrote the first.
--   RC-8       getNextInvoiceNumber used a localStorage counter +
--              local existing-id check — duplicates across browsers.
--   RC-9       getNextCNNumber had zero collision protection.
--
-- Fix: Postgres `doc_serials` table + `allocate_serial(...)` RPC issues
-- monotonic numbers atomically, scoped by (company, doc_type, year).
-- The RPC takes a `min_seed` so sequences can be rolled forward (e.g.
-- Glassco SO sequence starts at 2523, drafts at 9026).
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- doc_serials — counter table (one row per company × doc_type × year)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS doc_serials (
  company    TEXT NOT NULL,
  doc_type   TEXT NOT NULL,         -- 'GT-SO', 'GT-QUT', 'DRF', 'INV', 'CN'
  year       INT  NOT NULL,
  next_seq   INT  NOT NULL,         -- LAST allocated number (semantic: incremented on each allocation)
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (company, doc_type, year)
);

-- Single-user mode: keep RLS permissive (user requested no role gating).
ALTER TABLE doc_serials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "doc_serials_rw"      ON doc_serials;
DROP POLICY IF EXISTS "doc_serials_anon_rw" ON doc_serials;
CREATE POLICY "doc_serials_rw" ON doc_serials
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "doc_serials_anon_rw" ON doc_serials
  FOR ALL TO anon          USING (true) WITH CHECK (true);

GRANT ALL ON doc_serials TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- allocate_serial — atomic next-number issuer
--
-- Behaviour:
--   • First call for (company, doc_type, year): inserts row with
--     next_seq = max(min_seed, 1), returns that value.
--   • Subsequent calls: increments next_seq by 1 and returns the new
--     value. Row-level lock during UPDATE ensures concurrent callers
--     never see the same value.
--   • If existing next_seq < min_seed (e.g. seed bumped after first
--     allocations), the function jumps next_seq forward to min_seed.
--
-- Examples:
--   allocate_serial('Glassco','GT-SO',2026, 2523)  →  2523
--   allocate_serial('Glassco','GT-SO',2026, 2523)  →  2524
--   allocate_serial('Glassco','DRF',  2026, 9026)  →  9026
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION allocate_serial(
  p_company  TEXT,
  p_doc_type TEXT,
  p_year     INT,
  p_min_seed INT DEFAULT 1
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next INT;
BEGIN
  INSERT INTO doc_serials (company, doc_type, year, next_seq)
  VALUES (p_company, p_doc_type, p_year, GREATEST(p_min_seed, 1))
  ON CONFLICT (company, doc_type, year)
  DO UPDATE
    SET next_seq   = GREATEST(doc_serials.next_seq + 1, EXCLUDED.next_seq),
        updated_at = now()
  RETURNING next_seq INTO v_next;
  RETURN v_next;
END;
$$;

REVOKE EXECUTE ON FUNCTION allocate_serial(TEXT, TEXT, INT, INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION allocate_serial(TEXT, TEXT, INT, INT) TO authenticated, anon;

-- Reload PostgREST schema cache so the RPC is immediately callable
NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────
-- SELECT allocate_serial('Glassco', 'GT-SO',  2026, 2523);   -- 2523
-- SELECT allocate_serial('Glassco', 'GT-SO',  2026, 2523);   -- 2524
-- SELECT allocate_serial('Glassco', 'GT-QUT', 2026, 2523);   -- 2523 (separate doc_type)
-- SELECT allocate_serial('Glassco', 'DRF',    2026, 9026);   -- 9026
-- SELECT * FROM doc_serials WHERE company = 'Glassco';
-- ═══════════════════════════════════════════════════════════════════════
