-- ============================================================================
-- Backup: add erp_snapshot_export + erp_snapshot_prune RPCs (2026-07-13)
-- Founder applies in the Supabase SQL editor (MCP is read-only).
-- ============================================================================
-- The nightly off-site backup (scripts/nightly-export.js, GitHub Action) and the
-- in-app DR Console both call two RPCs that were never deployed:
--   • erp_snapshot_export(p_id)      — pull a snapshot's full payload to mirror
--   • erp_snapshot_prune(p_keep_days) — drop old snapshots from erp_backups
-- Only erp_snapshot (capture) + the erp_snapshot_index / _summary views exist,
-- so the backup fails even with the secrets set. These add the missing two.
--
-- Snapshots live in erp_backups.meta (jsonb, backup_type='phase5_snapshot').
-- Both functions are admin-only: the service-role backup job (auth.uid() null)
-- and super users may run them; regular authenticated users are rejected — a
-- snapshot is a full multi-company dump. Idempotent (CREATE OR REPLACE).
-- ============================================================================

-- Pull the full payload of one snapshot (meta blob) + its metadata columns.
CREATE OR REPLACE FUNCTION public.erp_snapshot_export(p_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT auth_user_is_super() THEN
    RAISE EXCEPTION 'not_authorized: snapshot export is admin-only' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(b.meta, '{}'::jsonb) || jsonb_build_object(
           'id',           b.id,
           'backup_date',  b.backup_date,
           'backup_type',  b.backup_type,
           'company',      b.meta ->> 'company',
           'label',        b.meta ->> 'label',
           'table_count',  b.table_count,
           'record_count', b.record_count,
           'source',       b.source
         )
    INTO v
    FROM public.erp_backups b
   WHERE b.id = p_id;

  IF v IS NULL THEN
    RAISE EXCEPTION 'snapshot_not_found: %', p_id USING ERRCODE = 'P0002';
  END IF;
  RETURN v;
END $function$;

REVOKE ALL ON FUNCTION public.erp_snapshot_export(text) FROM anon;

-- Prune snapshots older than p_keep_days (default 30). Returns rows deleted.
CREATE OR REPLACE FUNCTION public.erp_snapshot_prune(p_keep_days integer DEFAULT 30)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  n integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT auth_user_is_super() THEN
    RAISE EXCEPTION 'not_authorized: snapshot prune is admin-only' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.erp_backups
   WHERE backup_type = 'phase5_snapshot'
     AND backup_date < now() - make_interval(days => GREATEST(p_keep_days, 1));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $function$;

REVOKE ALL ON FUNCTION public.erp_snapshot_prune(integer) FROM anon;
