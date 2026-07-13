-- ============================================================================
-- Root-cause fix: stop activity_log from bloating on sync churn (2026-07-13)
-- Founder applies in the Supabase SQL editor (MCP is read-only).
-- ============================================================================
-- The row-level audit trigger `log_changes` (on clients, credit_notes, invoices,
-- ledger, payment_receipts, production_pieces, quotations, store_items) logged a
-- FULL before+after jsonb copy of the row on EVERY write — including the app's
-- idempotent SyncService re-upserts. In ~2 months that produced 178k rows / 493 MB
-- and blew the 0.5 GB Free-plan cap. 99.8% of store_items updates were literal
-- no-ops (before = after); quotations/clients were re-written thousands of times.
--
-- FIX (two changes, both preserve the FINANCIAL audit trail intact):
--   1. Skip no-op UPDATEs (NEW is not distinct from OLD) — never log them.
--   2. Store the heavy before/after jsonb ONLY for the financial tables
--      (ledger / invoices / credit_notes / payment_receipts). For the
--      high-churn operational tables keep just the lightweight event row
--      (table / id / operation / when / who) — that is what compliance needs
--      for them, at ~1% of the storage.
--
-- Idempotent (CREATE OR REPLACE). Run CLEANUP_activity_log_bloat.sql once
-- afterwards to reclaim the EXISTING bloat (that one has VACUUM FULL, so it
-- must run in the SQL editor, not via the migration transaction).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user      TEXT;
  v_company   TEXT;
  v_id        TEXT;
  v_financial BOOLEAN := TG_TABLE_NAME IN ('ledger','invoices','credit_notes','payment_receipts','accounts');
BEGIN
  -- (1) Skip no-op UPDATEs — the idempotent sync re-writes that caused the bloat.
  IF TG_OP = 'UPDATE' AND to_jsonb(NEW) IS NOT DISTINCT FROM to_jsonb(OLD) THEN
    RETURN NEW;
  END IF;

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
    -- (2) Heavy payload only for financial tables; lightweight event otherwise.
    CASE WHEN v_financial AND TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN v_financial AND TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    v_company
  );

  RETURN COALESCE(NEW, OLD);
END $function$;

-- Retention helper (already existed as prune_activity_log(retain_days) RETURNS
-- bigint — signature kept EXACTLY so CREATE OR REPLACE succeeds). Improvement:
-- it now PROTECTS the financial-table audit from pruning (only non-financial
-- events age out), instead of deleting all rows older than retain_days.
CREATE OR REPLACE FUNCTION public.prune_activity_log(retain_days integer DEFAULT 180)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE n bigint;
BEGIN
  DELETE FROM public.activity_log
   WHERE table_name NOT IN ('ledger','invoices','credit_notes','payment_receipts','accounts')
     AND changed_at < now() - make_interval(days => retain_days);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $function$;

REVOKE ALL ON FUNCTION public.prune_activity_log(integer) FROM anon, authenticated;
