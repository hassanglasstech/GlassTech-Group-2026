-- ═══════════════════════════════════════════════════════════════════════
-- Migration 043 — Sprint 2: Version columns + IC mirror FK
--
-- Two changes:
--
-- 1. VERSION COLUMNS — adds an INT `version` column on every table that
--    multiple users can edit concurrently. The `update_with_version` RPC
--    (migration 042) reads + bumps this on each write so User B's stale
--    save fails loudly instead of silently overwriting User A's edits.
--
-- 2. IC MIRROR FK — replaces the regex-based intercompany mirror lookup
--    in deliveryInvoiceService with an explicit `mirror_company` column
--    on `clients`. NULL = no IC mirror.
--
-- All operations are guarded with information_schema checks so the
-- migration is idempotent and safe to re-run, even if a target table or
-- column doesn't exist on the current Supabase instance.
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 1. Top-level version columns (only when the table exists)
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'quotations','invoices','products','store_items','clients','production_pieces'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD COLUMN IF NOT EXISTS version INT DEFAULT 1', t
      );
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Backfill version from data->>'version' (skip if data column absent)
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'quotations','invoices','products','store_items','clients','production_pieces'
  ]
  LOOP
    -- Skip if either column is missing (idempotent, safe on partial schemas)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name=t AND column_name='version'
    ) THEN CONTINUE; END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name=t AND column_name='data'
    ) THEN
      EXECUTE format(
        'UPDATE %I
            SET version = COALESCE(NULLIF(data->>''version'','''')::INT, 1)
          WHERE version IS NULL OR version = 1', t
      );
    ELSE
      EXECUTE format(
        'UPDATE %I SET version = 1 WHERE version IS NULL', t
      );
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 3. Trigger keeps top-level `version` in sync with data->>'version'
--    Only attached to tables that actually have BOTH `data` and `version`
--    columns — skipped silently otherwise.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION sync_version_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_jsonb_version INT;
  v_has_data BOOLEAN;
BEGIN
  -- Defensive: NEW.data may not exist if the trigger is attached to a
  -- thin table. We still want to keep `version` populated for FOR UPDATE
  -- locks the RPC depends on.
  BEGIN
    v_jsonb_version := NULLIF(NEW.data->>'version', '')::INT;
    v_has_data := TRUE;
  EXCEPTION WHEN undefined_column THEN
    v_jsonb_version := NULL;
    v_has_data := FALSE;
  END;

  IF v_jsonb_version IS NOT NULL THEN
    NEW.version := v_jsonb_version;
  ELSIF NEW.version IS NULL THEN
    NEW.version := 1;
  END IF;

  IF v_has_data THEN
    NEW.data := COALESCE(NEW.data, '{}'::JSONB)
                  || jsonb_build_object('version', NEW.version);
  END IF;

  RETURN NEW;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'quotations','invoices','products','store_items','clients','production_pieces'
  ]
  LOOP
    -- Only attach if BOTH version + table exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name=t AND column_name='version'
    ) THEN CONTINUE; END IF;

    EXECUTE format('DROP TRIGGER IF EXISTS tr_%I_sync_version ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER tr_%I_sync_version
         BEFORE INSERT OR UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION sync_version_column()',
      t, t
    );
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 4. update_with_version RPC — read flat `version` column directly
--    (migration 042 read from data->>'version'; flat column is faster +
--    works even on tables without a `data` column at all.)
-- ─────────────────────────────────────────────────────────────────────
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
  v_has_data  BOOLEAN;
BEGIN
  IF p_table NOT IN (
    'quotations', 'invoices', 'products', 'store_items',
    'clients', 'production_pieces'
  ) THEN
    RAISE EXCEPTION 'invalid_table: % (not version-controlled)', p_table;
  END IF;

  -- Lock + read current version from FLAT column
  v_query := format(
    'SELECT COALESCE(version, 1) FROM %I WHERE id = $1 FOR UPDATE',
    p_table
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

  -- Branch on whether the table has a `data` JSONB column
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name=p_table AND column_name='data'
  ) INTO v_has_data;

  IF v_has_data THEN
    v_query := format(
      'UPDATE %I
         SET data       = COALESCE(data, ''{}''::JSONB) || $1,
             version    = $2,
             updated_at = now()
       WHERE id = $3
       RETURNING data',
      p_table
    );
    EXECUTE v_query INTO v_row USING p_patch, v_new, p_id;
  ELSE
    -- No data column → just bump version, ignore patch (caller's
    -- responsibility to write flat columns separately for thin tables)
    v_query := format(
      'UPDATE %I SET version = $1, updated_at = now() WHERE id = $2',
      p_table
    );
    EXECUTE v_query USING v_new, p_id;
    v_row := p_patch;
  END IF;

  RETURN jsonb_build_object(
    'id',      p_id,
    'version', v_new,
    'data',    v_row
  );
END $$;

GRANT EXECUTE ON FUNCTION update_with_version(TEXT, TEXT, JSONB, INT) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 5. IC mirror — explicit FK column on clients (only if clients exists)
-- ─────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema='public' AND table_name='clients'
  ) THEN
    ALTER TABLE clients
      ADD COLUMN IF NOT EXISTS mirror_company TEXT;

    -- Add CHECK only if not already there
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
       WHERE table_schema='public' AND table_name='clients'
         AND constraint_name='ck_clients_mirror_company'
    ) THEN
      ALTER TABLE clients
        ADD CONSTRAINT ck_clients_mirror_company
        CHECK (mirror_company IS NULL
               OR mirror_company IN ('GTK','GTI','Glassco','Nippon','Factory'));
    END IF;

    CREATE INDEX IF NOT EXISTS idx_clients_mirror_company
      ON clients(mirror_company)
      WHERE mirror_company IS NOT NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 6. Realtime publication — register tables for postgres_changes events
--    Skips silently if a table doesn't exist on this instance.
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
BEGIN
  -- Bail if the publication itself doesn't exist (rare — Supabase always has it)
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    RAISE NOTICE 'supabase_realtime publication not found, skipping';
    RETURN;
  END IF;

  FOREACH t IN ARRAY ARRAY[
    'quotations','invoices','clients','store_items',
    'production_pieces','cutting_sessions','ledger'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema='public' AND table_name=t
    ) THEN CONTINUE; END IF;

    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    EXCEPTION
      WHEN duplicate_object THEN NULL;  -- already in publication
      WHEN OTHERS THEN
        RAISE NOTICE 'Could not add % to publication: %', t, SQLERRM;
    END;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
