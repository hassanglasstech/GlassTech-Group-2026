-- ═══════════════════════════════════════════════════════════════════
-- Fresh-start user reset — keep ONLY Hassan, lock his deletion forever
-- ═══════════════════════════════════════════════════════════════════
--
-- Protected user:
--   id    = 3d73eeff-b20b-47b3-a434-71a56588fd70
--   email = hassanlatif1302@gmail.com
--   role  = super_admin
--
-- Run this in Supabase SQL Editor (full privileges). Each section is
-- independent — if a step errors, fix and re-run; the trigger creation
-- is idempotent.
-- ═══════════════════════════════════════════════════════════════════

-- ── 0. Sanity preview — what will be deleted ──────────────────────
-- Run this BEFORE the delete to confirm.
SELECT '=== auth.users to be deleted ===' AS section;
SELECT id, email, created_at
FROM auth.users
WHERE id <> '3d73eeff-b20b-47b3-a434-71a56588fd70'
ORDER BY created_at;

SELECT '=== user_profiles to be deleted ===' AS section;
SELECT id, email, full_name, role
FROM public.user_profiles
WHERE id <> '3d73eeff-b20b-47b3-a434-71a56588fd70'
ORDER BY created_at;

-- ── 1. Delete user_profiles rows except Hassan ────────────────────
-- Done first because some FKs point to user_profiles.id.
DELETE FROM public.user_profiles
WHERE id <> '3d73eeff-b20b-47b3-a434-71a56588fd70';

-- ── 2. Delete auth.users rows except Hassan ───────────────────────
-- Supabase Auth's auth.users table — only service_role / SQL Editor
-- can do this. Cascades via Supabase's built-in FKs to identities,
-- sessions, refresh_tokens, etc.
DELETE FROM auth.users
WHERE id <> '3d73eeff-b20b-47b3-a434-71a56588fd70';

-- ── 3. Protection trigger — Hassan's row can NEVER be deleted ─────
-- Defense-in-depth: even if someone hits the manage-users edge
-- function with Hassan's UUID, or runs DELETE from SQL Editor by
-- mistake, this trigger blocks it at the database level.

CREATE OR REPLACE FUNCTION public.protect_hassan_from_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.id = '3d73eeff-b20b-47b3-a434-71a56588fd70'::uuid THEN
    RAISE EXCEPTION
      'PROTECTED USER: Hassan (super_admin) cannot be deleted. Override only via direct DB access by DBA.';
  END IF;
  RETURN OLD;
END;
$$;

-- Trigger on user_profiles
DROP TRIGGER IF EXISTS hassan_protect_user_profiles ON public.user_profiles;
CREATE TRIGGER hassan_protect_user_profiles
  BEFORE DELETE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_hassan_from_delete();

-- Trigger on auth.users (Supabase's auth schema is owned by supabase_auth_admin
-- but triggers can be added by postgres role from SQL Editor)
DROP TRIGGER IF EXISTS hassan_protect_auth_users ON auth.users;
CREATE TRIGGER hassan_protect_auth_users
  BEFORE DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.protect_hassan_from_delete();

-- ── 4. Verify — both counts should be exactly 1 ──────────────────
SELECT 'auth.users count'      AS metric, COUNT(*) AS value FROM auth.users
UNION ALL
SELECT 'user_profiles count',  COUNT(*)                     FROM public.user_profiles
UNION ALL
SELECT 'Hassan present in auth.users',
       COUNT(*) FROM auth.users WHERE id = '3d73eeff-b20b-47b3-a434-71a56588fd70'
UNION ALL
SELECT 'Hassan present in user_profiles',
       COUNT(*) FROM public.user_profiles WHERE id = '3d73eeff-b20b-47b3-a434-71a56588fd70';

-- ── 5. Self-test the trigger — should FAIL with PROTECTED USER ────
-- Wrap in a transaction so the test doesn't actually delete you.
-- If this RAISES the exception, the trigger works.
DO $$
BEGIN
  BEGIN
    DELETE FROM public.user_profiles WHERE id = '3d73eeff-b20b-47b3-a434-71a56588fd70';
    RAISE EXCEPTION '❌ TEST FAILED — trigger did not block Hassan deletion';
  EXCEPTION
    WHEN raise_exception THEN
      RAISE NOTICE '✅ Trigger works — Hassan protected from deletion.';
  END;
  -- Make sure no actual delete happened
  RAISE EXCEPTION 'rollback'; -- rolls back the DO block
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM = 'rollback' THEN
      RAISE NOTICE '✅ Self-test complete. Hassan row intact.';
    ELSE
      RAISE;
    END IF;
END $$;
