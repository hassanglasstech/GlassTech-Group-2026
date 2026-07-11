-- ═══════════════════════════════════════════════════════════════════════
-- Migration 053 — Sprint 21: Global Full-Text Search
--
-- Adds Postgres tsvector + GIN index to the four most-searched master
-- tables. Powers the Cmd+K command palette: type "INV-001" → jump to
-- the invoice in <2 s.
--
-- Why this matters: localStorage caching is fast on the client but
-- doesn't survive the "I just got assigned this" moment when a user
-- knows a partial ID and wants to find it. Server-side FTS solves it.
--
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 1. Add tsvector columns + GIN indexes
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE clients     ADD COLUMN IF NOT EXISTS search_tsv tsvector;
ALTER TABLE invoices    ADD COLUMN IF NOT EXISTS search_tsv tsvector;
ALTER TABLE quotations  ADD COLUMN IF NOT EXISTS search_tsv tsvector;
ALTER TABLE vendors     ADD COLUMN IF NOT EXISTS search_tsv tsvector;

CREATE INDEX IF NOT EXISTS idx_clients_search    ON clients    USING GIN(search_tsv);
CREATE INDEX IF NOT EXISTS idx_invoices_search   ON invoices   USING GIN(search_tsv);
CREATE INDEX IF NOT EXISTS idx_quotations_search ON quotations USING GIN(search_tsv);
CREATE INDEX IF NOT EXISTS idx_vendors_search    ON vendors    USING GIN(search_tsv);

-- ─────────────────────────────────────────────────────────────────────
-- 2. Trigger functions — keep tsvector in sync on every INSERT/UPDATE
--
-- HOTFIX (user feedback 2026-05-10): different envs have different
-- flat-column sets on these tables (some envs have just `id` + `data`
-- JSONB; others have full flat columns from migration 032). Using
-- `NEW.colname` directly throws "record has no field" if the column
-- is absent.
--
-- Fix: convert NEW to JSONB first via to_jsonb(NEW) and read every
-- field via ->> 'fieldname'. Missing keys → NULL → COALESCE handles it.
-- One trigger function definition works across all schema variants.
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_clients_search() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  r JSONB := to_jsonb(NEW);
  d JSONB := COALESCE(r->'data', '{}'::jsonb);
BEGIN
  NEW.search_tsv := to_tsvector('simple',
       COALESCE(r->>'id', '')                                                              || ' '
    || COALESCE(r->>'code',          d->>'code',          '')                              || ' '
    || COALESCE(r->>'business_name', d->>'businessName',  d->>'name',          '')         || ' '
    || COALESCE(r->>'name',          d->>'name',          '')                              || ' '
    || COALESCE(r->>'contact_person',d->>'contactPerson', d->>'contact_person', '')        || ' '
    || COALESCE(r->>'email',         d->>'email',         '')                              || ' '
    || COALESCE(r->>'phone',         d->>'phone',         '')
  );
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION update_invoices_search() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  r JSONB := to_jsonb(NEW);
  d JSONB := COALESCE(r->'data', '{}'::jsonb);
BEGIN
  NEW.search_tsv := to_tsvector('simple',
       COALESCE(r->>'id', '')                                                                                  || ' '
    || COALESCE(r->>'invoice_number', d->>'invoiceNumber', d->>'invoiceNo', '')                                || ' '
    || COALESCE(r->>'client_name',    d->>'clientName',    '')                                                 || ' '
    || COALESCE(r->>'order_id',       d->>'orderId',       '')
  );
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION update_quotations_search() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  r JSONB := to_jsonb(NEW);
  d JSONB := COALESCE(r->'data', '{}'::jsonb);
BEGIN
  NEW.search_tsv := to_tsvector('simple',
       COALESCE(r->>'id', '')                                                  || ' '
    || COALESCE(r->>'order_no',    d->>'orderNo',     '')                       || ' '
    || COALESCE(r->>'quote_number',d->>'quoteNumber', d->>'quoteNo', '')        || ' '
    || COALESCE(r->>'client_name', d->>'clientName',  '')
  );
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION update_vendors_search() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  r JSONB := to_jsonb(NEW);
  d JSONB := COALESCE(r->'data', '{}'::jsonb);
BEGIN
  NEW.search_tsv := to_tsvector('simple',
       COALESCE(r->>'id', '')                                       || ' '
    || COALESCE(r->>'code',    d->>'code',    '')                    || ' '
    || COALESCE(r->>'name',    d->>'name',    '')                    || ' '
    || COALESCE(r->>'contact', d->>'contact', '')
  );
  RETURN NEW;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 3. Wire the triggers (drop-then-create for idempotency)
-- ─────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS tr_clients_search    ON clients;
CREATE TRIGGER tr_clients_search
  BEFORE INSERT OR UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_clients_search();

DROP TRIGGER IF EXISTS tr_invoices_search   ON invoices;
CREATE TRIGGER tr_invoices_search
  BEFORE INSERT OR UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_invoices_search();

DROP TRIGGER IF EXISTS tr_quotations_search ON quotations;
CREATE TRIGGER tr_quotations_search
  BEFORE INSERT OR UPDATE ON quotations
  FOR EACH ROW EXECUTE FUNCTION update_quotations_search();

DROP TRIGGER IF EXISTS tr_vendors_search    ON vendors;
CREATE TRIGGER tr_vendors_search
  BEFORE INSERT OR UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION update_vendors_search();

-- ─────────────────────────────────────────────────────────────────────
-- 4. Backfill existing rows
--    UPDATE col=col is a no-op write but it fires BEFORE UPDATE triggers,
--    populating search_tsv via the functions above. Use updated_at as the
--    pivot since `id` is the PK on every table here.
-- ─────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients'    AND column_name='updated_at') THEN
    UPDATE clients    SET updated_at = updated_at WHERE search_tsv IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices'   AND column_name='updated_at') THEN
    UPDATE invoices   SET updated_at = updated_at WHERE search_tsv IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotations' AND column_name='updated_at') THEN
    UPDATE quotations SET updated_at = updated_at WHERE search_tsv IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendors'    AND column_name='updated_at') THEN
    UPDATE vendors    SET updated_at = updated_at WHERE search_tsv IS NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 5. Unified search RPC — single entry point for the command palette.
--    Returns top N hits across all four tables, ordered by ts_rank.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION global_search(
  p_query   TEXT,
  p_company TEXT DEFAULT NULL,
  p_limit   INT  DEFAULT 20
)
RETURNS TABLE (
  entity_type TEXT,
  entity_id   TEXT,
  title       TEXT,
  subtitle    TEXT,
  rank        REAL
) LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_q tsquery;
BEGIN
  IF p_query IS NULL OR length(trim(p_query)) = 0 THEN RETURN; END IF;
  -- Tokenise input — `:*` for prefix matches so "INV" finds "INV-001"
  v_q := to_tsquery('simple',
    array_to_string(
      string_to_array(regexp_replace(trim(p_query), '\s+', ' ', 'g'), ' '),
      ' & '
    ) || ':*'
  );

  -- Same defensive pattern as the triggers: read every label/subtitle
  -- field via to_jsonb()->> so the SELECT works regardless of which
  -- flat columns exist on the live tables.
  RETURN QUERY
  (
    SELECT 'client'::text,
           (to_jsonb(c)->>'id')::text,
           COALESCE(to_jsonb(c)->>'business_name', c.data->>'businessName', c.data->>'name', to_jsonb(c)->>'id')::text,
           COALESCE(to_jsonb(c)->>'contact_person', to_jsonb(c)->>'email', c.data->>'phone', '')::text,
           ts_rank(c.search_tsv, v_q)
      FROM clients c
     WHERE c.search_tsv @@ v_q
       AND (p_company IS NULL OR c.company = p_company)
     ORDER BY ts_rank(c.search_tsv, v_q) DESC LIMIT p_limit
  )
  UNION ALL
  (
    SELECT 'invoice'::text,
           (to_jsonb(i)->>'id')::text,
           COALESCE(to_jsonb(i)->>'invoice_number', i.data->>'invoiceNumber', i.data->>'invoiceNo', to_jsonb(i)->>'id')::text,
           COALESCE(to_jsonb(i)->>'client_name', i.data->>'clientName', '')::text,
           ts_rank(i.search_tsv, v_q)
      FROM invoices i
     WHERE i.search_tsv @@ v_q
       AND (p_company IS NULL OR i.company = p_company)
     ORDER BY ts_rank(i.search_tsv, v_q) DESC LIMIT p_limit
  )
  UNION ALL
  (
    SELECT 'quotation'::text,
           (to_jsonb(q)->>'id')::text,
           COALESCE(to_jsonb(q)->>'order_no', to_jsonb(q)->>'quote_number', q.data->>'orderNo', to_jsonb(q)->>'id')::text,
           COALESCE(to_jsonb(q)->>'client_name', q.data->>'clientName', '')::text,
           ts_rank(q.search_tsv, v_q)
      FROM quotations q
     WHERE q.search_tsv @@ v_q
       AND (p_company IS NULL OR q.company = p_company)
     ORDER BY ts_rank(q.search_tsv, v_q) DESC LIMIT p_limit
  )
  UNION ALL
  (
    SELECT 'vendor'::text,
           (to_jsonb(v)->>'id')::text,
           COALESCE(to_jsonb(v)->>'name', v.data->>'name', to_jsonb(v)->>'id')::text,
           COALESCE(to_jsonb(v)->>'contact', v.data->>'contact', '')::text,
           ts_rank(v.search_tsv, v_q)
      FROM vendors v
     WHERE v.search_tsv @@ v_q
       AND (p_company IS NULL OR v.company = p_company)
     ORDER BY ts_rank(v.search_tsv, v_q) DESC LIMIT p_limit
  )
  ORDER BY rank DESC LIMIT p_limit;

EXCEPTION
  WHEN OTHERS THEN
    -- Bad query syntax — return empty rather than error out the palette
    RETURN;
END $$;

GRANT EXECUTE ON FUNCTION global_search(TEXT, TEXT, INT) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 6. PostgREST schema reload
-- ─────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────
-- 7. Verification
--
-- -- Search across everything for a partial token:
-- SELECT * FROM global_search('INV-001', 'Glassco');
-- SELECT * FROM global_search('hassan', 'Glassco');
--
-- -- Verify trigger fires on update:
-- UPDATE clients SET business_name = business_name WHERE id = '...';
-- SELECT search_tsv FROM clients WHERE id = '...';   -- should be populated
-- ═══════════════════════════════════════════════════════════════════════
