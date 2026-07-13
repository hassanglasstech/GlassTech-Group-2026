-- ============================================================================
-- M1: align tempering_dispatches to the app/RPC contract (2026-07-13)
-- Founder applies in the Supabase SQL editor (MCP is read-only).
-- ============================================================================
-- ROOT CAUSE (why tempering_dispatches has 0 rows despite dispatch being used):
--   * The whole codebase — load_pieces_to_dispatch_atomic (reads/writes a `data`
--     jsonb blob and treats id as text), the SyncService mapper, and the app
--     (TemperingDispatchOut writes id = 'CH-Glassco-NNNN') — ALL assume a TEXT id
--     and a `data` jsonb column.
--   * But the live table was created with id = UUID (default uuid_generate_v4())
--     and NO `data` column. So the two-tier push of a CH-… id is rejected by the
--     uuid column → the row never lands → the RPC's `WHERE id = p_dispatch_id`
--     finds nothing → the whole outbound-dispatch cloud flow silently no-ops.
--
-- FIX: bring the live schema to what the code already expects — text id + data
-- jsonb. All affected tables are EMPTY (verified 0 rows: tempering_dispatches,
-- dispatch_events, dispatch_photos, customer_signatures, delivery_otps,
-- gate_passes), so this is structural-only — no data migration, no FK values to
-- rewrite. Idempotent where possible. Wrapped in a transaction.
-- ============================================================================

BEGIN;

-- 1. Drop the FKs that reference tempering_dispatches(id) so the PK can be retyped.
ALTER TABLE public.dispatch_events      DROP CONSTRAINT IF EXISTS fk_dispatch_event_dispatch;
ALTER TABLE public.dispatch_photos      DROP CONSTRAINT IF EXISTS fk_dispatch_photos_dispatch;
ALTER TABLE public.customer_signatures  DROP CONSTRAINT IF EXISTS fk_customer_signatures_dispatch;
ALTER TABLE public.delivery_otps        DROP CONSTRAINT IF EXISTS fk_delivery_otps_dispatch;

-- 2. Retype the PK to text ('CH-Glassco-NNNN' sequence ids) + drop the uuid default.
ALTER TABLE public.tempering_dispatches ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.tempering_dispatches ALTER COLUMN id TYPE text USING id::text;

-- 3. Retype the referencing columns to match.
ALTER TABLE public.dispatch_events      ALTER COLUMN dispatch_id TYPE text USING dispatch_id::text;
ALTER TABLE public.dispatch_photos      ALTER COLUMN dispatch_id TYPE text USING dispatch_id::text;
ALTER TABLE public.customer_signatures  ALTER COLUMN dispatch_id TYPE text USING dispatch_id::text;
ALTER TABLE public.delivery_otps        ALTER COLUMN dispatch_id TYPE text USING dispatch_id::text;

-- 4. Re-add the FKs (same ON DELETE behavior as before).
ALTER TABLE public.dispatch_events      ADD CONSTRAINT fk_dispatch_event_dispatch      FOREIGN KEY (dispatch_id) REFERENCES public.tempering_dispatches(id) ON DELETE CASCADE;
ALTER TABLE public.dispatch_photos      ADD CONSTRAINT fk_dispatch_photos_dispatch     FOREIGN KEY (dispatch_id) REFERENCES public.tempering_dispatches(id) ON DELETE CASCADE;
ALTER TABLE public.customer_signatures  ADD CONSTRAINT fk_customer_signatures_dispatch FOREIGN KEY (dispatch_id) REFERENCES public.tempering_dispatches(id) ON DELETE CASCADE;
ALTER TABLE public.delivery_otps        ADD CONSTRAINT fk_delivery_otps_dispatch       FOREIGN KEY (dispatch_id) REFERENCES public.tempering_dispatches(id) ON DELETE CASCADE;

-- 5. Add the `data` jsonb blob the RPC + SyncService mapper already write to.
ALTER TABLE public.tempering_dispatches ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMIT;

-- Verify after apply:
--   SELECT data_type FROM information_schema.columns
--     WHERE table_name='tempering_dispatches' AND column_name IN ('id','data');
--   -- expect: id = text, data = jsonb
