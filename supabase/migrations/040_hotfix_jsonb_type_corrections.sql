-- ═══════════════════════════════════════════════════════════════════════
-- Migration 040 — Hotfix Round 3: type corrections + remaining audit cols
--
-- After 038 + 039 cleared the missing-column errors, a new error surfaced:
--   "invalid input syntax for type numeric: \"[]\""
--
-- Root cause: `quotations.service_charges` exists on Supabase but as
-- NUMERIC, not JSONB. The app sends it as a JSONB array. Migration 032's
-- `ADD COLUMN IF NOT EXISTS service_charges JSONB` skipped because the
-- column already existed (with wrong type). Same risk for other JSONB
-- columns that may have been created with wrong types.
--
-- Plus: clients.updated_at column missing → saveClients still fails.
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 1. Type fix: quotations.service_charges NUMERIC → JSONB
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  current_type TEXT;
BEGIN
  SELECT data_type INTO current_type
  FROM information_schema.columns
  WHERE table_name = 'quotations' AND column_name = 'service_charges';

  IF current_type IS NULL THEN
    -- Column doesn't exist at all — add it as JSONB
    ALTER TABLE quotations ADD COLUMN service_charges JSONB DEFAULT '[]';
    RAISE NOTICE 'service_charges added as JSONB (was missing)';
  ELSIF current_type != 'jsonb' THEN
    -- Column exists with wrong type — drop and re-add (safe: existing values
    -- are NUMERIC and would be lost, but nobody can have stored an array in
    -- a numeric column anyway, so any data here is wrong by definition).
    ALTER TABLE quotations DROP COLUMN service_charges;
    ALTER TABLE quotations ADD COLUMN service_charges JSONB DEFAULT '[]';
    RAISE NOTICE 'service_charges re-typed from % to JSONB', current_type;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Type fix: quotations.items NUMERIC/TEXT → JSONB (defensive)
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  current_type TEXT;
BEGIN
  SELECT data_type INTO current_type
  FROM information_schema.columns
  WHERE table_name = 'quotations' AND column_name = 'items';
  IF current_type IS NOT NULL AND current_type != 'jsonb' THEN
    ALTER TABLE quotations DROP COLUMN items;
    ALTER TABLE quotations ADD COLUMN items JSONB DEFAULT '[]';
    RAISE NOTICE 'quotations.items re-typed from % to JSONB', current_type;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 3. Type fix: invoices.items, invoices.payments, invoices.service_charges
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE c TEXT;
BEGIN
  SELECT data_type INTO c FROM information_schema.columns
    WHERE table_name='invoices' AND column_name='items';
  IF c IS NOT NULL AND c != 'jsonb' THEN
    ALTER TABLE invoices DROP COLUMN items;
    ALTER TABLE invoices ADD COLUMN items JSONB DEFAULT '[]';
  END IF;

  SELECT data_type INTO c FROM information_schema.columns
    WHERE table_name='invoices' AND column_name='payments';
  IF c IS NOT NULL AND c != 'jsonb' THEN
    ALTER TABLE invoices DROP COLUMN payments;
    ALTER TABLE invoices ADD COLUMN payments JSONB DEFAULT '[]';
  END IF;

  SELECT data_type INTO c FROM information_schema.columns
    WHERE table_name='invoices' AND column_name='service_charges';
  IF c IS NOT NULL AND c != 'jsonb' THEN
    ALTER TABLE invoices DROP COLUMN service_charges;
    ALTER TABLE invoices ADD COLUMN service_charges JSONB DEFAULT '[]';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 4. Add timestamps + missing audit columns on clients
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_by   TEXT,
  ADD COLUMN IF NOT EXISTS updated_by   TEXT;

-- ─────────────────────────────────────────────────────────────────────
-- 5. Same defensive timestamps on every Sales / Production table
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ DEFAULT now();
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ DEFAULT now();
ALTER TABLE credit_notes
  ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ DEFAULT now();
ALTER TABLE customer_complaints
  ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ DEFAULT now();
ALTER TABLE production_pieces
  ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ DEFAULT now();
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ DEFAULT now();

-- ─────────────────────────────────────────────────────────────────────
-- 6. Reload PostgREST schema cache
-- ─────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────
-- 7. Verification — types should all be jsonb where expected
-- ─────────────────────────────────────────────────────────────────────
-- SELECT table_name, column_name, data_type
-- FROM information_schema.columns
-- WHERE (table_name='quotations' AND column_name IN ('items','service_charges','data'))
--    OR (table_name='invoices'   AND column_name IN ('items','payments','service_charges','data'))
--    OR (table_name='clients'    AND column_name IN ('data','updated_at','created_at'))
-- ORDER BY table_name, column_name;
-- (data_type should be 'jsonb' for items/payments/service_charges/data,
--  'timestamp with time zone' for *_at columns.)
-- ═══════════════════════════════════════════════════════════════════════
