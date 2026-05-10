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
-- Each table reads the columns it actually has. We use COALESCE +
-- (data->>'…') as a fallback so the JSONB twin column also contributes
-- (search hits both flat and JSONB-stored fields).
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_clients_search() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_tsv := to_tsvector('simple',
       COALESCE(NEW.id::text, '')                            || ' '
    || COALESCE(NEW.code, '')                                 || ' '
    || COALESCE(NEW.business_name, NEW.data->>'businessName', NEW.data->>'name', '') || ' '
    || COALESCE(NEW.contact_person, NEW.data->>'contactPerson', '') || ' '
    || COALESCE(NEW.email,   NEW.data->>'email', '')          || ' '
    || COALESCE(NEW.phone,   NEW.data->>'phone', '')
  );
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION update_invoices_search() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_tsv := to_tsvector('simple',
       COALESCE(NEW.id::text, '')                            || ' '
    || COALESCE(NEW.invoice_number, NEW.data->>'invoiceNumber', NEW.data->>'invoiceNo', '') || ' '
    || COALESCE(NEW.client_name,    NEW.data->>'clientName', '') || ' '
    || COALESCE(NEW.order_id::text, NEW.data->>'orderId', '')
  );
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION update_quotations_search() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_tsv := to_tsvector('simple',
       COALESCE(NEW.id::text, '')                            || ' '
    || COALESCE(NEW.order_no,    NEW.data->>'orderNo',  '')   || ' '
    || COALESCE(NEW.quote_number,NEW.data->>'quoteNumber','') || ' '
    || COALESCE(NEW.client_name, NEW.data->>'clientName',  '')
  );
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION update_vendors_search() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_tsv := to_tsvector('simple',
       COALESCE(NEW.id::text, '')                            || ' '
    || COALESCE(NEW.code, '')                                 || ' '
    || COALESCE(NEW.name,    NEW.data->>'name', '')           || ' '
    || COALESCE(NEW.contact, NEW.data->>'contact', '')
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
-- 4. Backfill existing rows (no-op UPDATE fires the trigger)
-- ─────────────────────────────────────────────────────────────────────
UPDATE clients     SET id = id WHERE search_tsv IS NULL;
UPDATE invoices    SET id = id WHERE search_tsv IS NULL;
UPDATE quotations  SET id = id WHERE search_tsv IS NULL;
UPDATE vendors     SET id = id WHERE search_tsv IS NULL;

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

  RETURN QUERY
  (
    SELECT 'client'::text,
           c.id::text,
           COALESCE(c.business_name, c.data->>'businessName', c.data->>'name', c.id::text)::text,
           COALESCE(c.contact_person, c.email, c.data->>'phone', '')::text,
           ts_rank(c.search_tsv, v_q)
      FROM clients c
     WHERE c.search_tsv @@ v_q
       AND (p_company IS NULL OR c.company = p_company)
     ORDER BY ts_rank(c.search_tsv, v_q) DESC LIMIT p_limit
  )
  UNION ALL
  (
    SELECT 'invoice'::text,
           i.id::text,
           COALESCE(i.invoice_number, i.data->>'invoiceNumber', i.id::text)::text,
           COALESCE(i.client_name, i.data->>'clientName', '')::text,
           ts_rank(i.search_tsv, v_q)
      FROM invoices i
     WHERE i.search_tsv @@ v_q
       AND (p_company IS NULL OR i.company = p_company)
     ORDER BY ts_rank(i.search_tsv, v_q) DESC LIMIT p_limit
  )
  UNION ALL
  (
    SELECT 'quotation'::text,
           q.id::text,
           COALESCE(q.order_no, q.quote_number, q.data->>'orderNo', q.id::text)::text,
           COALESCE(q.client_name, q.data->>'clientName', '')::text,
           ts_rank(q.search_tsv, v_q)
      FROM quotations q
     WHERE q.search_tsv @@ v_q
       AND (p_company IS NULL OR q.company = p_company)
     ORDER BY ts_rank(q.search_tsv, v_q) DESC LIMIT p_limit
  )
  UNION ALL
  (
    SELECT 'vendor'::text,
           v.id::text,
           COALESCE(v.name, v.data->>'name', v.id::text)::text,
           COALESCE(v.contact, v.data->>'contact', '')::text,
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
