-- ============================================================================
-- 085 — SECURITY P0: revoke anon WRITE access on all public tables
-- ============================================================================
-- ⚠️  NOT YET APPLIED. Review + apply manually in the Supabase SQL editor when
--     ready (see God-mode audit 2026-07, blocker #1). Do NOT bundle blindly.
--
-- WHY: migration 000_disable_rls_single_user.sql ran
--        GRANT ALL ON public.<every table> TO anon, authenticated;
--      and several later migrations (031 wazir, 032 sales, 034 complaints,
--      20260429/32/33/34) re-granted `ALL ... TO anon` on ledger / payroll /
--      user_profiles / payment_receipts / credit_notes etc. after the 064/068
--      tightening, and never re-revoked. The ANON key ships in the public JS
--      bundle, so today an UNAUTHENTICATED caller can INSERT/UPDATE/DELETE the
--      general ledger, payroll, and user roles. This is the single most urgent
--      finding in the audit.
--
-- WHAT THIS DOES (conservative, low app-breakage risk):
--   Revokes INSERT / UPDATE / DELETE / TRUNCATE from `anon` on every base table
--   in the public schema. It intentionally KEEPS anon SELECT for now so that any
--   read-before-login path in the app does not break — the catastrophic part is
--   WRITE access, and this closes it. (A follow-up migration should enable strict
--   per-company RLS to also close cross-company READ leakage — that one needs the
--   app to be verified as always-logged-in first, so it is deliberately separate.)
--
-- SAFETY: logged-in users write through the `authenticated` role (their OTP/JWT
--   session), which this migration does NOT touch — so normal in-app writes keep
--   working. Only the anonymous key loses write power.
--
-- REVERSIBLE: to undo, re-run `GRANT INSERT, UPDATE, DELETE ON <table> TO anon`.
--
-- BEFORE APPLYING: confirm the app never writes before login. Test on a staging
--   Supabase or during a maintenance window: log in, create a quotation, post a
--   GL entry, mark attendance — all must still succeed.
-- ============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon',
      r.tablename
    );
  END LOOP;
END $$;

-- Also stop anon from advancing sequences (needed for inserts).
DO $$
DECLARE
  s RECORD;
BEGIN
  FOR s IN
    SELECT sequencename
    FROM pg_sequences
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('REVOKE USAGE, UPDATE ON SEQUENCE public.%I FROM anon', s.sequencename);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- VERIFY (run after applying): expect ZERO rows. Any row = anon still has a
-- write privilege on that table.
-- ---------------------------------------------------------------------------
-- SELECT table_name, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE grantee = 'anon'
--   AND table_schema = 'public'
--   AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')
-- ORDER BY table_name, privilege_type;
