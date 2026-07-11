-- ═══════════════════════════════════════════════════════════════════════
-- 102 — HYGIENE wrap-up (audit 2026-07-11): activity_log retention + bucket listing
--
-- 6c (M2): activity_log = 178k rows in ~61 days, no retention. Add a retention
--   function. NOTE: nothing is >90d old yet (oldest 2026-05-10), so it prunes 0
--   rows today — it's forward-looking. pg_cron is NOT installed, so schedule it via
--   pg_cron (after enabling the extension) OR a Supabase scheduled Edge Function,
--   or run it manually. Function is admin-only (anon/PUBLIC EXECUTE revoked).
--
-- 6d (L1): the product-images bucket (public=true) had a broad storage.objects
--   SELECT policy `product_images_read` that lets anyone LIST every file (enumerate
--   the catalog). Public object URLs (<img src>) work WITHOUT it, and the app never
--   calls .list() on product-images (only employee-docs), so drop it.
--
-- Run in Supabase SQL editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 6c — activity_log retention function ──
CREATE OR REPLACE FUNCTION public.prune_activity_log(retain_days int DEFAULT 180)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE n bigint;
BEGIN
  DELETE FROM public.activity_log
   WHERE changed_at < now() - make_interval(days => retain_days);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION public.prune_activity_log(int) FROM anon, PUBLIC;

-- To run once now (deletes rows older than 180 days — currently 0):
--   SELECT public.prune_activity_log(180);
--
-- To auto-schedule (weekly): first enable pg_cron in Dashboard → Database →
-- Extensions, then:
--   SELECT cron.schedule('prune-activity-log', '0 3 * * 0',
--     $$SELECT public.prune_activity_log(180)$$);

-- ── 6d — stop product-images bucket enumeration (public URLs unaffected) ──
DROP POLICY IF EXISTS product_images_read ON storage.objects;
-- If the DROP errors with "must be owner of table objects", do it instead via
-- Dashboard → Storage → product-images → Policies → delete the read/SELECT policy.

-- ── Verify (optional) ──
-- SELECT proname FROM pg_proc WHERE proname='prune_activity_log';  -- exists
-- SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
--   AND policyname='product_images_read';  -- expect 0 rows (gone)
