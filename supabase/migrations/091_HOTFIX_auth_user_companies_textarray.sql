-- ============================================================================
-- 091 — HOTFIX: auth_user_companies() crashes on text[] allowed_companies
-- ============================================================================
-- 🔴 APPLY IMMEDIATELY. This unblocks a full read outage introduced by 086.
--
-- SYMPTOM (after 086 strict RLS was enabled):
--   Every RLS-protected SELECT (quotations, clients, store_items, …) fails with
--     ERROR: function jsonb_array_elements_text(text[]) does not exist
--   surfacing in the app as HTTP 404 on GET .../quotations?... and the record
--   "disappearing" after a green save toast (the WRITE succeeds because the
--   super-admin branch short-circuits; the READ evaluates the broken branch).
--
-- ROOT CAUSE (schema divergence — same class as the text/date columns):
--   auth_user_companies() (migration 054) reads
--       jsonb_array_elements_text(allowed_companies)
--   assuming user_profiles.allowed_companies is JSONB. But on this live DB the
--   column is a Postgres TEXT[] (migration 044 already treated it as text[] via
--   unnest(...)). jsonb_array_elements_text() has no text[] overload → the RLS
--   policy expression throws, so the whole SELECT errors out.
--
-- FIX: normalise the column with to_jsonb() before extracting, so the function
--   works whether allowed_companies is TEXT[] *or* JSONB (future-proof against
--   whichever type any given instance has). No data change; CREATE OR REPLACE is
--   idempotent and instantly repairs every table's RLS (all call this helper).
--
-- ROLLBACK: re-run migration 054's original auth_user_companies() definition.
-- ============================================================================

CREATE OR REPLACE FUNCTION auth_user_companies()
RETURNS TEXT[]
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_json   jsonb;
  v_arr    TEXT[];
  v_single TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;   -- anon / service-role bypasses RLS naturally
  END IF;

  -- Normalise allowed_companies to a jsonb array regardless of its actual
  -- column type: to_jsonb(text[]) -> ["a","b"]; to_jsonb(jsonb) -> itself.
  SELECT to_jsonb(allowed_companies) INTO v_json
    FROM user_profiles
   WHERE id = v_uid;

  IF v_json IS NOT NULL AND jsonb_typeof(v_json) = 'array' THEN
    v_arr := ARRAY(SELECT jsonb_array_elements_text(v_json));
    IF v_arr IS NOT NULL AND array_length(v_arr, 1) > 0 THEN
      RETURN v_arr;
    END IF;
  END IF;

  -- Fallback: single company column
  SELECT company INTO v_single FROM user_profiles WHERE id = v_uid;
  IF v_single IS NOT NULL THEN
    RETURN ARRAY[v_single];
  END IF;

  RETURN NULL;
END $$;

GRANT EXECUTE ON FUNCTION auth_user_companies() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- VERIFY after applying (should return your companies, not an error):
--   SELECT auth_user_companies();            -- run while logged in via the app
--   -- or, direct check of the column type:
--   SELECT data_type, udt_name FROM information_schema.columns
--   WHERE table_name='user_profiles' AND column_name='allowed_companies';
--   -- Then in the app: reload → quotations/clients/stock should load again.
-- ---------------------------------------------------------------------------
