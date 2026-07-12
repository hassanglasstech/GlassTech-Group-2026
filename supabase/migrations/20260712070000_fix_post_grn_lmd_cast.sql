-- ============================================================================
-- FIX: post_grn_atomic — 42804 on store_items.last_movement_date (2026-07-12)
-- ============================================================================
-- The store_items upsert inserted COALESCE(r->>'last_movement_date','') (text)
-- into store_items.last_movement_date, which is `timestamp with time zone`.
-- There is no text→timestamptz assignment cast, so the INSERT failed with
-- SQLSTATE 42804 for ANY GRN carrying store_rows (verified on live prod).
--
-- ONLY CHANGE vs the live body: that one VALUES expression is now
--   NULLIF(r->>'last_movement_date','')::timestamptz
-- (NULL when blank, otherwise a real timestamptz). Everything else is verbatim
-- from pg_get_functiondef on prod. Idempotent (CREATE OR REPLACE).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.post_grn_atomic(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_company TEXT  := p_payload->>'company';
  v_grn     TEXT  := p_payload->>'grn_id';
  v_store   JSONB := p_payload->'store_rows';
  v_ledger  JSONB := p_payload->'ledger_rows';
  r         JSONB;
  v_dup     INT;
  v_n_store INT := 0;
  v_n_led   INT := 0;
BEGIN
  IF v_company IS NULL OR v_grn IS NULL THEN
    RAISE EXCEPTION 'invalid_payload: company + grn_id required';
  END IF;

  -- Idempotency: a GRN posts its material GL as a JV with reference_id = grn_id.
  SELECT 1 INTO v_dup FROM ledger
   WHERE reference_id = v_grn AND company = v_company AND doc_type = 'JV'
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'grn_already_posted: %', v_grn;
  END IF;

  -- Pre-flight: every ledger row must balance BEFORE anything is written.
  IF v_ledger IS NOT NULL AND v_ledger <> 'null'::JSONB THEN
    FOR r IN SELECT value FROM jsonb_array_elements(v_ledger) AS t(value) LOOP
      PERFORM assert_ledger_balance(r->'details');
    END LOOP;
  END IF;

  -- 1. store_items — upsert the changed rows.
  IF v_store IS NOT NULL AND v_store <> 'null'::JSONB THEN
    FOR r IN SELECT value FROM jsonb_array_elements(v_store) AS t(value) LOOP
      INSERT INTO store_items (
        id, company, name, category, quantity,
        unrestricted_qty, qi_qty, blocked_qty, reserved_qty, unit,
        moving_average_price, total_value, storage_bin, last_movement_date,
        min_level, reorder_point, per_sheet_weight_kg, per_sqft_weight_kg, updated_at
      ) VALUES (
        r->>'id', r->>'company', COALESCE(r->>'name',''), COALESCE(r->>'category',''),
        COALESCE(NULLIF(r->>'quantity','')::NUMERIC, 0),
        COALESCE(NULLIF(r->>'unrestricted_qty','')::NUMERIC, 0),
        COALESCE(NULLIF(r->>'qi_qty','')::NUMERIC, 0),
        COALESCE(NULLIF(r->>'blocked_qty','')::NUMERIC, 0),
        COALESCE(NULLIF(r->>'reserved_qty','')::NUMERIC, 0),
        COALESCE(r->>'unit','Sqft'),
        COALESCE(NULLIF(r->>'moving_average_price','')::NUMERIC, 0),
        COALESCE(NULLIF(r->>'total_value','')::NUMERIC, 0),
        COALESCE(r->>'storage_bin',''), NULLIF(r->>'last_movement_date','')::timestamptz,  -- FIX: cast text→timestamptz
        COALESCE(NULLIF(r->>'min_level','')::NUMERIC, 0),
        COALESCE(NULLIF(r->>'reorder_point','')::NUMERIC, 0),
        COALESCE(NULLIF(r->>'per_sheet_weight_kg','')::NUMERIC, 0),
        COALESCE(NULLIF(r->>'per_sqft_weight_kg','')::NUMERIC, 0),
        now()
      )
      ON CONFLICT (id) DO UPDATE SET
        company              = EXCLUDED.company,
        name                 = EXCLUDED.name,
        category             = EXCLUDED.category,
        quantity             = EXCLUDED.quantity,
        unrestricted_qty     = EXCLUDED.unrestricted_qty,
        qi_qty               = EXCLUDED.qi_qty,
        blocked_qty          = EXCLUDED.blocked_qty,
        reserved_qty         = EXCLUDED.reserved_qty,
        unit                 = EXCLUDED.unit,
        moving_average_price = EXCLUDED.moving_average_price,
        total_value          = EXCLUDED.total_value,
        storage_bin          = EXCLUDED.storage_bin,
        last_movement_date   = EXCLUDED.last_movement_date,
        min_level            = EXCLUDED.min_level,
        reorder_point        = EXCLUDED.reorder_point,
        per_sheet_weight_kg  = EXCLUDED.per_sheet_weight_kg,
        per_sqft_weight_kg   = EXCLUDED.per_sqft_weight_kg,
        updated_at           = now();
      v_n_store := v_n_store + 1;
    END LOOP;
  END IF;

  -- 2. ledger — material GL (JV) + freight/labour PVs.
  IF v_ledger IS NOT NULL AND v_ledger <> 'null'::JSONB THEN
    FOR r IN SELECT value FROM jsonb_array_elements(v_ledger) AS t(value) LOOP
      PERFORM _insert_ledger_row(r);
      v_n_led := v_n_led + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'grn_id',         v_grn,
    'store_written',  v_n_store,
    'ledger_written', v_n_led
  );
END $function$;
