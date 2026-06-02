-- ═══════════════════════════════════════════════════════════════════════
-- Migration 045 — Sprint 4: Audit triggers + activity_log
--
-- Captures every INSERT / UPDATE / DELETE on financially-significant
-- tables in `public.activity_log`. Auditor's first question — "show me
-- who changed invoice INV-001 in March" — is answerable from this log.
--
-- Pure-additive: no business behaviour changes. Safe to apply during
-- single-user go-live.
--
-- Tables tracked: clients, quotations, invoices, payment_receipts,
-- credit_notes, ledger, store_items, production_pieces.
--
-- Each row stores the FULL before/after JSONB so investigators can diff
-- without joining back to the source table (which may have been
-- mutated again since).
-- ═══════════════════════════════════════════════════════════════════════

-- Activity log — append-only audit table
CREATE TABLE IF NOT EXISTS activity_log (
  id           BIGSERIAL PRIMARY KEY,
  table_name   TEXT NOT NULL,
  row_id       TEXT NOT NULL,
  operation    TEXT NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  changed_at   TIMESTAMPTZ DEFAULT now(),
  changed_by   TEXT,
  before_data  JSONB,
  after_data   JSONB,
  company      TEXT
);

-- Indexes for the two main query shapes:
--   "all activity for invoice X"
--   "all activity in Glassco this week"
CREATE INDEX IF NOT EXISTS idx_activity_log_table_row
  ON activity_log(table_name, row_id);

CREATE INDEX IF NOT EXISTS idx_activity_log_company_date
  ON activity_log(company, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_log_changed_by
  ON activity_log(changed_by, changed_at DESC);

-- Trigger function — generic, attached per-table below.
-- Reads acting user from `app.current_user` GUC (settable per session
-- by the client) with auth.email()/auth.uid() as fallbacks.
CREATE OR REPLACE FUNCTION log_changes() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_user TEXT;
  v_company TEXT;
  v_id TEXT;
BEGIN
  -- Acting user: GUC > auth claim > auth.uid() > 'unknown'
  BEGIN
    v_user := COALESCE(
      NULLIF(current_setting('app.current_user', true), ''),
      auth.jwt() ->> 'email',
      auth.uid()::TEXT,
      'unknown'
    );
  EXCEPTION WHEN OTHERS THEN
    v_user := 'unknown';
  END;

  -- Company + id are read defensively — some target tables omit either
  BEGIN
    v_id := COALESCE((NEW).id::TEXT, (OLD).id::TEXT);
  EXCEPTION WHEN OTHERS THEN
    v_id := NULL;
  END;

  BEGIN
    v_company := COALESCE((NEW).company::TEXT, (OLD).company::TEXT);
  EXCEPTION WHEN OTHERS THEN
    v_company := NULL;
  END;

  INSERT INTO activity_log (
    table_name, row_id, operation, changed_by,
    before_data, after_data, company
  ) VALUES (
    TG_TABLE_NAME,
    COALESCE(v_id, 'unknown'),
    TG_OP,
    v_user,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    v_company
  );

  RETURN COALESCE(NEW, OLD);
END $$;

-- Attach trigger to every audited table that exists on this instance.
-- Idempotent — DROP first.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clients','quotations','invoices','payment_receipts','credit_notes',
    'ledger','store_items','production_pieces'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema='public' AND table_name=t
    ) THEN CONTINUE; END IF;

    EXECUTE format('DROP TRIGGER IF EXISTS tr_%I_audit ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER tr_%I_audit
         AFTER INSERT OR UPDATE OR DELETE ON %I
         FOR EACH ROW EXECUTE FUNCTION log_changes()',
      t, t
    );
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- erp_health_snapshot — single SELECT returning operational vitals.
-- HealthMonitor page calls this every ~30s.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION erp_health_snapshot(p_company TEXT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_trial_balance NUMERIC := 0;
  v_imbalanced_count INT := 0;
  v_recent_activity INT := 0;
  v_last_invoice TIMESTAMPTZ;
  v_last_ledger TIMESTAMPTZ;
  v_clients_count INT;
  v_invoices_count INT;
  v_pieces_count INT;
BEGIN
  -- Trial balance: sum of all debit minus all credit across posted ledger
  -- (should always be 0). Read from the JSONB `details` array — same
  -- shape as the client mapper.
  BEGIN
    SELECT
      COALESCE(SUM(
        (d->>'debit')::NUMERIC - (d->>'credit')::NUMERIC
      ), 0)
    INTO v_trial_balance
    FROM ledger l, jsonb_array_elements(COALESCE(l.details, '[]'::JSONB)) d
    WHERE l.company = p_company AND l.status = 'Posted';
  EXCEPTION WHEN OTHERS THEN
    v_trial_balance := 0;
  END;

  -- Imbalanced JV count
  BEGIN
    SELECT COUNT(*) INTO v_imbalanced_count
    FROM (
      SELECT id,
        SUM((d->>'debit')::NUMERIC)  AS dr,
        SUM((d->>'credit')::NUMERIC) AS cr
      FROM ledger l, jsonb_array_elements(COALESCE(l.details, '[]'::JSONB)) d
      WHERE l.company = p_company AND l.status = 'Posted'
      GROUP BY l.id
      HAVING ABS(SUM((d->>'debit')::NUMERIC) - SUM((d->>'credit')::NUMERIC)) >= 0.01
    ) imbal;
  EXCEPTION WHEN OTHERS THEN
    v_imbalanced_count := 0;
  END;

  -- Recent activity (last hour)
  SELECT COUNT(*) INTO v_recent_activity
  FROM activity_log
  WHERE company = p_company
    AND changed_at > now() - INTERVAL '1 hour';

  -- Last successful write timestamps (proxy for sync health)
  BEGIN
    SELECT MAX(updated_at) INTO v_last_invoice FROM invoices WHERE company = p_company;
  EXCEPTION WHEN OTHERS THEN v_last_invoice := NULL; END;

  BEGIN
    SELECT MAX(updated_at) INTO v_last_ledger FROM ledger WHERE company = p_company;
  EXCEPTION WHEN OTHERS THEN v_last_ledger := NULL; END;

  -- Row counts (sanity)
  BEGIN SELECT COUNT(*) INTO v_clients_count FROM clients WHERE company = p_company;
  EXCEPTION WHEN OTHERS THEN v_clients_count := 0; END;

  BEGIN SELECT COUNT(*) INTO v_invoices_count FROM invoices WHERE company = p_company;
  EXCEPTION WHEN OTHERS THEN v_invoices_count := 0; END;

  BEGIN SELECT COUNT(*) INTO v_pieces_count FROM production_pieces WHERE company = p_company;
  EXCEPTION WHEN OTHERS THEN v_pieces_count := 0; END;

  RETURN jsonb_build_object(
    'company',           p_company,
    'snapshot_at',       now(),
    'trial_balance',     v_trial_balance,
    'imbalanced_jvs',    v_imbalanced_count,
    'recent_activity_1h', v_recent_activity,
    'last_invoice_at',   v_last_invoice,
    'last_ledger_at',    v_last_ledger,
    'row_counts',        jsonb_build_object(
                            'clients',           v_clients_count,
                            'invoices',          v_invoices_count,
                            'production_pieces', v_pieces_count
                          )
  );
END $$;

GRANT SELECT ON activity_log TO authenticated;
GRANT EXECUTE ON FUNCTION log_changes()                  TO authenticated;
GRANT EXECUTE ON FUNCTION erp_health_snapshot(TEXT)      TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
