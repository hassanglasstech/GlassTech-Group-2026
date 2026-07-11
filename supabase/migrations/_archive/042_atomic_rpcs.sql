-- ═══════════════════════════════════════════════════════════════════════
-- Migration 042 — Sprint 1: Atomic Transaction RPCs
--
-- Three RPCs that replace fragmented client-side multi-step flows with
-- single Postgres transactions. All-or-nothing semantics — no orphan
-- ledger entries, no double-consumed stock, no stale-write conflicts.
--
-- 1. post_invoice_atomic(payload)         — invoice + ledger(s) + quote update
-- 2. consume_glass_stock(...)             — stock decrement + stock_ledger + GL
-- 3. update_with_version(table,id,...)    — optimistic concurrency control
--
-- Schema notes:
--   - Tables `ledger`, `invoices`, `quotations`, `stock_ledger`,
--     `cutting_sessions`, `store_items` use a hybrid shape:
--     a `data` JSONB blob alongside flat columns (id, company, status, etc).
--   - The RPC accepts a **row JSONB** matching the column shape and uses
--     `jsonb_populate_record` to splat it into the target table.
--     This keeps the SQL agnostic to schema drift — client mappers stay
--     authoritative.
--   - Optimistic locking: `data->>'version'` (string-cast int).
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- Helper: balance-check a list of ledger details before commit.
-- Mirrors FinanceService.assertGLBalance — never write an unbalanced JV.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION assert_ledger_balance(p_details JSONB)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_debit  NUMERIC := 0;
  v_credit NUMERIC := 0;
  v_diff   NUMERIC;
BEGIN
  IF p_details IS NULL OR jsonb_typeof(p_details) <> 'array' THEN
    RAISE EXCEPTION 'ledger_imbalance: details must be a JSONB array';
  END IF;

  SELECT
    COALESCE(SUM((d->>'debit')::NUMERIC), 0),
    COALESCE(SUM((d->>'credit')::NUMERIC), 0)
  INTO v_debit, v_credit
  FROM jsonb_array_elements(p_details) d;

  v_diff := ABS(v_debit - v_credit);
  -- Tolerate sub-rupee FP drift; >= 0.01 PKR is a real imbalance.
  IF v_diff >= 0.01 THEN
    RAISE EXCEPTION 'ledger_imbalance: debit=% credit=% diff=%',
      v_debit, v_credit, v_diff;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- Helper: insert a JSONB-row into the `ledger` table by splatting
-- columns. The client mapper (ledgerToRow) controls the row shape.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _insert_ledger_row(p_row JSONB)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO ledger (
    id, company, doc_type, doc_date, date, description,
    reference_id, status, details, data,
    drafted_by, approved_by, jv_approved_at,
    created_by, updated_by, posted_at, updated_at
  )
  VALUES (
    p_row->>'id',
    p_row->>'company',
    p_row->>'doc_type',
    p_row->>'doc_date',
    p_row->>'date',
    p_row->>'description',
    p_row->>'reference_id',
    p_row->>'status',
    COALESCE(p_row->'details', '[]'::JSONB),
    COALESCE(p_row->'data',    '{}'::JSONB),
    p_row->>'drafted_by',
    p_row->>'approved_by',
    NULLIF(p_row->>'jv_approved_at','')::TIMESTAMPTZ,
    p_row->>'created_by',
    p_row->>'updated_by',
    NULLIF(p_row->>'posted_at','')::TIMESTAMPTZ,
    COALESCE(NULLIF(p_row->>'updated_at','')::TIMESTAMPTZ, now())
  )
  ON CONFLICT (id) DO NOTHING;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- RPC #1 — post_invoice_atomic
--
-- Replaces the 6-step client-side invoice flow with one transaction.
-- Caller pre-resolves accounts + amounts client-side and passes a
-- fully-formed payload built by the existing TS mappers.
--
-- Payload:
-- {
--   "company":          "Glassco",
--   "invoice_row":      <invoiceToRow output>,
--   "main_ledger_row":  <ledgerToRow output for AR/Revenue/GST>,
--   "cogs_ledger_row":  <ledgerToRow output> | null,
--   "mirror_ledger_row":<ledgerToRow output> | null,   -- target_company set
--   "quotation_patch":  { "id": "...", "patch": {...} } | null
-- }
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION post_invoice_atomic(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_company     TEXT  := p_payload->>'company';
  v_inv         JSONB := p_payload->'invoice_row';
  v_main        JSONB := p_payload->'main_ledger_row';
  v_cogs        JSONB := p_payload->'cogs_ledger_row';
  v_mirror      JSONB := p_payload->'mirror_ledger_row';
  v_quote       JSONB := p_payload->'quotation_patch';
  v_invoice_id  TEXT;
  v_existing    INT;
  v_quote_id    TEXT;
BEGIN
  -- Validate
  IF v_company IS NULL OR v_inv IS NULL OR v_main IS NULL THEN
    RAISE EXCEPTION 'invalid_payload: company, invoice_row, main_ledger_row required';
  END IF;

  v_invoice_id := v_inv->>'id';
  IF v_invoice_id IS NULL THEN
    RAISE EXCEPTION 'invalid_payload: invoice_row.id required';
  END IF;

  -- Reject duplicate invoice (idempotency guard)
  SELECT 1 INTO v_existing FROM invoices WHERE id = v_invoice_id;
  IF FOUND THEN
    RAISE EXCEPTION 'invoice_already_exists: %', v_invoice_id;
  END IF;

  -- Pre-flight balance check on every ledger row
  PERFORM assert_ledger_balance(v_main->'details');
  IF v_cogs   IS NOT NULL AND v_cogs   <> 'null'::JSONB THEN
    PERFORM assert_ledger_balance(v_cogs->'details');
  END IF;
  IF v_mirror IS NOT NULL AND v_mirror <> 'null'::JSONB THEN
    PERFORM assert_ledger_balance(v_mirror->'details');
  END IF;

  -- 1. Main ledger (AR/Revenue/GST)
  PERFORM _insert_ledger_row(v_main);

  -- 2. Invoice row — flat columns
  INSERT INTO invoices (
    id, company, order_id, order_no, client_id, client_name,
    date, due_date, total_amount, received_amount, balance,
    status, gl_tx_id, payments, items, service_charges,
    project_name, discount_amount, gst_percent, gst_amount,
    data, updated_at
  )
  VALUES (
    v_inv->>'id',
    v_inv->>'company',
    v_inv->>'order_id',
    v_inv->>'order_no',
    v_inv->>'client_id',
    v_inv->>'client_name',
    NULLIF(v_inv->>'date','')::DATE,
    NULLIF(v_inv->>'due_date','')::DATE,
    NULLIF(v_inv->>'total_amount','')::NUMERIC,
    NULLIF(v_inv->>'received_amount','')::NUMERIC,
    NULLIF(v_inv->>'balance','')::NUMERIC,
    v_inv->>'status',
    v_inv->>'gl_tx_id',
    COALESCE(v_inv->'payments',         '[]'::JSONB),
    COALESCE(v_inv->'items',            '[]'::JSONB),
    COALESCE(v_inv->'service_charges',  '[]'::JSONB),
    v_inv->>'project_name',
    COALESCE(NULLIF(v_inv->>'discount_amount','')::NUMERIC, 0),
    COALESCE(NULLIF(v_inv->>'gst_percent','')::NUMERIC, 0),
    COALESCE(NULLIF(v_inv->>'gst_amount','')::NUMERIC, 0),
    COALESCE(v_inv->'data', '{}'::JSONB),
    now()
  );

  -- 3. Quotation patch (mark Invoiced) — merges into data JSONB
  IF v_quote IS NOT NULL AND v_quote <> 'null'::JSONB THEN
    v_quote_id := v_quote->>'id';
    UPDATE quotations
    SET data       = COALESCE(data, '{}'::JSONB) || COALESCE(v_quote->'patch', '{}'::JSONB),
        updated_at = now()
    WHERE id = v_quote_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'quotation_not_found: %', v_quote_id;
    END IF;
  END IF;

  -- 4. COGS ledger (optional — pure-service invoices skip it)
  IF v_cogs IS NOT NULL AND v_cogs <> 'null'::JSONB THEN
    PERFORM _insert_ledger_row(v_cogs);
  END IF;

  -- 5. Mirror ledger (optional — intercompany BILL on target company books)
  IF v_mirror IS NOT NULL AND v_mirror <> 'null'::JSONB THEN
    PERFORM _insert_ledger_row(v_mirror);
  END IF;

  RETURN jsonb_build_object(
    'invoice_id',    v_invoice_id,
    'main_tx_id',    v_main->>'id',
    'cogs_tx_id',    v_cogs->>'id',
    'mirror_tx_id',  v_mirror->>'id'
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- RPC #2 — consume_glass_stock
--
-- Atomic stock decrement for cutting session close. Replaces the
-- client-side: validate → save session → post GL → mutate store. Today
-- a mid-flow failure leaves stock decremented without GL (or vice versa).
--
-- p_consumption: [{ "material_id":..., "qty": 12.5 }, ...]
-- p_gl_row:      <ledgerToRow output> for Dr WIP / Cr Inventory   | null
-- p_stock_rows:  [{ id, company, data }, ...]                     | null
-- p_session_row: <cutting_sessions row patch> { id, data }        | null
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION consume_glass_stock(
  p_company       TEXT,
  p_session_id    TEXT,
  p_consumption   JSONB,
  p_gl_row        JSONB,
  p_stock_rows    JSONB,
  p_session_row   JSONB
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_item            RECORD;
  v_material_id     TEXT;
  v_consumed_qty    NUMERIC;
  v_on_hand         NUMERIC;
  v_new_unr         NUMERIC;
  v_new_qty         NUMERIC;
  v_gl_id           TEXT  := p_gl_row->>'id';
  v_stock_row       JSONB;
  v_existing_gl     INT;
BEGIN
  IF p_company IS NULL OR p_session_id IS NULL THEN
    RAISE EXCEPTION 'invalid_payload: company + session_id required';
  END IF;

  -- Idempotency: reject if GL already posted for this session
  IF v_gl_id IS NOT NULL THEN
    SELECT 1 INTO v_existing_gl FROM ledger WHERE id = v_gl_id;
    IF FOUND THEN
      RAISE EXCEPTION 'gl_already_posted: %', v_gl_id;
    END IF;
  END IF;

  -- Pre-flight balance check
  IF p_gl_row IS NOT NULL AND p_gl_row <> 'null'::JSONB THEN
    PERFORM assert_ledger_balance(p_gl_row->'details');
  END IF;

  -- ── 1. Lock + validate + decrement each material ─────────────────
  IF p_consumption IS NOT NULL AND p_consumption <> 'null'::JSONB THEN
    FOR v_item IN
      SELECT
        (c->>'material_id')::TEXT AS material_id,
        (c->>'qty')::NUMERIC      AS qty
      FROM jsonb_array_elements(p_consumption) c
    LOOP
      v_material_id  := v_item.material_id;
      v_consumed_qty := v_item.qty;

      -- Pessimistic lock — block concurrent sessions on the same row
      PERFORM 1 FROM store_items
        WHERE id = v_material_id AND company = p_company
        FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'material_not_found: %', v_material_id;
      END IF;

      SELECT
        COALESCE((data->>'unrestrictedQty')::NUMERIC, (data->>'quantity')::NUMERIC, 0)
      INTO v_on_hand
      FROM store_items
      WHERE id = v_material_id AND company = p_company;

      IF v_consumed_qty > v_on_hand THEN
        RAISE EXCEPTION 'insufficient_stock: % needs % but only % on-hand',
          v_material_id, v_consumed_qty, v_on_hand;
      END IF;

      v_new_unr := COALESCE((SELECT (data->>'unrestrictedQty')::NUMERIC
                             FROM store_items WHERE id = v_material_id), 0) - v_consumed_qty;
      v_new_qty := COALESCE((SELECT (data->>'quantity')::NUMERIC
                             FROM store_items WHERE id = v_material_id), 0) - v_consumed_qty;

      UPDATE store_items
      SET data = COALESCE(data, '{}'::JSONB) || jsonb_build_object(
                    'unrestrictedQty', v_new_unr,
                    'quantity',        v_new_qty,
                    'lastMovementDate', to_char(now(), 'YYYY-MM-DD')
                  ),
          updated_at = now()
      WHERE id = v_material_id AND company = p_company;
    END LOOP;
  END IF;

  -- ── 2. Insert stock_ledger audit rows ─────────────────────────────
  IF p_stock_rows IS NOT NULL AND p_stock_rows <> 'null'::JSONB THEN
    FOR v_stock_row IN SELECT * FROM jsonb_array_elements(p_stock_rows)
    LOOP
      INSERT INTO stock_ledger (id, company, data, updated_at)
      VALUES (
        v_stock_row->>'id',
        COALESCE(v_stock_row->>'company', p_company),
        COALESCE(v_stock_row->'data', '{}'::JSONB),
        now()
      )
      ON CONFLICT (id) DO NOTHING;
    END LOOP;
  END IF;

  -- ── 3. Post GL (Dr WIP / Cr Glass Inventory) ──────────────────────
  IF p_gl_row IS NOT NULL AND p_gl_row <> 'null'::JSONB THEN
    PERFORM _insert_ledger_row(p_gl_row);
  END IF;

  -- ── 4. Update cutting_sessions row → Closed ───────────────────────
  IF p_session_row IS NOT NULL AND p_session_row <> 'null'::JSONB THEN
    INSERT INTO cutting_sessions (id, company, data, updated_at)
    VALUES (
      p_session_row->>'id',
      p_company,
      COALESCE(p_session_row->'data', '{}'::JSONB),
      now()
    )
    ON CONFLICT (id) DO UPDATE
    SET data       = COALESCE(cutting_sessions.data, '{}'::JSONB)
                       || COALESCE(EXCLUDED.data, '{}'::JSONB),
        updated_at = now();
  END IF;

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'gl_tx_id',   v_gl_id
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- RPC #3 — update_with_version
--
-- Optimistic concurrency control. Reads the current version (from
-- data->>'version'), compares to caller's expected, raises on mismatch.
-- Defaults `version` = 1 when missing. Write increments by 1.
--
-- Whitelisted tables (Sprint 2 will populate the actual version field).
--
-- p_patch: partial JSONB merged into existing `data`
-- p_expected_version: integer; pass 1 for first version-aware write
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_with_version(
  p_table             TEXT,
  p_id                TEXT,
  p_patch             JSONB,
  p_expected_version  INT
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_current   INT;
  v_new       INT;
  v_row       JSONB;
  v_query     TEXT;
BEGIN
  IF p_table NOT IN (
    'quotations', 'invoices', 'products', 'store_items',
    'clients', 'production_pieces'
  ) THEN
    RAISE EXCEPTION 'invalid_table: % (not version-controlled)', p_table;
  END IF;

  -- Lock + read current version (dynamic table name → EXECUTE)
  v_query := format(
    'SELECT COALESCE((data->>%L)::INT, 1) FROM %I WHERE id = $1 FOR UPDATE',
    'version', p_table
  );
  EXECUTE v_query INTO v_current USING p_id;

  IF v_current IS NULL THEN
    RAISE EXCEPTION 'row_not_found: %.%', p_table, p_id;
  END IF;

  IF v_current <> p_expected_version THEN
    RAISE EXCEPTION 'version_conflict: expected % but found %',
      p_expected_version, v_current;
  END IF;

  v_new := v_current + 1;

  v_query := format(
    'UPDATE %I
       SET data       = COALESCE(data, ''{}''::JSONB) || $1
                          || jsonb_build_object(''version'', $2),
           updated_at = now()
     WHERE id = $3
     RETURNING data',
    p_table
  );
  EXECUTE v_query INTO v_row USING p_patch, v_new, p_id;

  RETURN jsonb_build_object(
    'id',      p_id,
    'version', v_new,
    'data',    v_row
  );
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- Grants
-- ─────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION assert_ledger_balance(JSONB)               TO anon, authenticated;
GRANT EXECUTE ON FUNCTION _insert_ledger_row(JSONB)                  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION post_invoice_atomic(JSONB)                 TO anon, authenticated;
GRANT EXECUTE ON FUNCTION consume_glass_stock(TEXT, TEXT, JSONB, JSONB, JSONB, JSONB)
                                                                      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION update_with_version(TEXT, TEXT, JSONB, INT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
