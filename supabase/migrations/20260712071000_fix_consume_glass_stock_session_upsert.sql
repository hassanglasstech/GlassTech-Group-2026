-- ============================================================================
-- FIX: consume_glass_stock — 23502 on cutting_sessions upsert (2026-07-12)
-- ============================================================================
-- Step 4 did INSERT INTO cutting_sessions (id, company, data, updated_at) … ON
-- CONFLICT (id) DO UPDATE. But cutting_sessions.job_order_id and cutter_id are
-- NOT NULL, and PostgreSQL validates NOT NULL on the proposed insert tuple
-- BEFORE ON CONFLICT arbitration — so it failed with 23502 even when the session
-- already existed (verified on live prod; pre-seeding the session did not help).
--
-- FIX: the session is ALWAYS already open when it is being closed here, so a
-- plain UPDATE is correct and never touches the NOT NULL columns. Behaviour is
-- identical to the old DO UPDATE branch (merge data, bump updated_at). Everything
-- else is verbatim from pg_get_functiondef on prod. Idempotent.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.consume_glass_stock(p_company text, p_session_id text, p_consumption jsonb, p_gl_row jsonb, p_stock_rows jsonb, p_session_row jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- 1. Lock + validate + decrement each material
  IF p_consumption IS NOT NULL AND p_consumption <> 'null'::JSONB THEN
    FOR v_item IN
      SELECT (c->>'material_id')::TEXT AS material_id, (c->>'qty')::NUMERIC AS qty
      FROM jsonb_array_elements(p_consumption) c
    LOOP
      v_material_id  := v_item.material_id;
      v_consumed_qty := v_item.qty;

      PERFORM 1 FROM store_items WHERE id = v_material_id AND company = p_company FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'material_not_found: %', v_material_id;
      END IF;

      SELECT COALESCE((data->>'unrestrictedQty')::NUMERIC, (data->>'quantity')::NUMERIC, 0)
      INTO v_on_hand FROM store_items WHERE id = v_material_id AND company = p_company;

      IF v_consumed_qty > v_on_hand THEN
        RAISE EXCEPTION 'insufficient_stock: % needs % but only % on-hand',
          v_material_id, v_consumed_qty, v_on_hand;
      END IF;

      v_new_unr := COALESCE((SELECT (data->>'unrestrictedQty')::NUMERIC FROM store_items WHERE id = v_material_id), 0) - v_consumed_qty;
      v_new_qty := COALESCE((SELECT (data->>'quantity')::NUMERIC        FROM store_items WHERE id = v_material_id), 0) - v_consumed_qty;

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

  -- 2. Insert stock_ledger audit rows
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

  -- 3. Post GL (Dr WIP / Cr Glass Inventory)
  IF p_gl_row IS NOT NULL AND p_gl_row <> 'null'::JSONB THEN
    PERFORM _insert_ledger_row(p_gl_row);
  END IF;

  -- 4. Close the cutting session — FIX: plain UPDATE (the session is always open
  --    already, and cutting_sessions.job_order_id/cutter_id are NOT NULL so an
  --    INSERT ... ON CONFLICT tuple violated NOT NULL before conflict arbitration).
  IF p_session_row IS NOT NULL AND p_session_row <> 'null'::JSONB THEN
    UPDATE cutting_sessions
       SET data       = COALESCE(data, '{}'::JSONB) || COALESCE(p_session_row->'data', '{}'::JSONB),
           updated_at = now()
     WHERE id = p_session_row->>'id';
  END IF;

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'gl_tx_id',   v_gl_id
  );
END $function$;
