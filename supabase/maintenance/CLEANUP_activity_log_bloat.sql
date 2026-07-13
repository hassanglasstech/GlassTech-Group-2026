-- ============================================================================
-- ONE-TIME: reclaim the activity_log bloat (2026-07-13)
-- RUN IN THE SUPABASE SQL EDITOR — one statement at a time (see notes below).
-- The last statement is VACUUM FULL, which cannot run inside a transaction.
-- ============================================================================
-- WHY: activity_log grew to 493 MB / 178k rows (blew the 0.5 GB Free-plan cap).
-- ~413 MB was sync-churn audit noise on non-financial tables (quotations,
-- store_items, clients). The financial-table audit (ledger / invoices /
-- credit_notes / payment_receipts / accounts) is tiny and is kept in full.
-- Migration 20260713100000 stops it recurring; this reclaims the existing bloat.
--
-- ⚠️ If you got "Failed to fetch (api.supabase.com)": that is a request timeout,
--    not a SQL failure. Run the 3 statements BELOW ONE AT A TIME (select just one
--    and Run). Steps 1-2 are fast; step 3 (VACUUM FULL) rewrites only the small
--    remainder, so it should finish quickly. If step 3 still times out, wait ~1
--    min and re-check the size (query at the bottom) — it may have completed
--    server-side; if not, just re-run step 3 alone.
-- ============================================================================

-- 1. Delete the non-financial audit churn (keep the last 2 days for recent
--    debugging). Financial-table audit is never touched. FAST.
DELETE FROM public.activity_log
 WHERE table_name NOT IN ('ledger','invoices','credit_notes','payment_receipts','accounts')
   AND changed_at < now() - interval '2 days';

-- 2. Delete any remaining pure no-op update rows (before = after — record nothing).
DELETE FROM public.activity_log
 WHERE operation = 'UPDATE'
   AND before_data IS NOT DISTINCT FROM after_data;

-- 3. Reclaim disk back to the OS. Now that the table is small, this is fast.
--    Run this ALONE (never select it together with a SELECT).
VACUUM FULL public.activity_log;

-- Verify (Supabase "Database Size" may take up to 1h to refresh):
--   SELECT pg_size_pretty(pg_total_relation_size('public.activity_log'));
--   -- expect: a few MB (was 493 MB)
