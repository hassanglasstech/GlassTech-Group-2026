-- 20260718120000_nippon_owner_approval_guard.sql
--
-- Owner-only order approval for Nippon — DEFENCE-IN-DEPTH for the client-side gate
-- (useNipponQuotations.handleSave). Blocks a transition INTO status 'Approved' on a
-- Nippon quotation unless the acting user's role is owner / hassan / super_admin.
--
-- • Only fires for company = 'Nippon' and only on the Draft→Approved transition
--   (or an INSERT that lands directly on Approved) — later saves of an already-
--   approved order (pick progress, Delivered, revisions) are NOT blocked.
-- • Service-role writes (auth.uid() IS NULL — sync jobs, backups) bypass.
-- • ERRCODE 42501 = insufficient_privilege, so the client surfaces a clean message.
--
-- SIGN-OFF: founder applies in the Supabase SQL editor (MCP is read-only). Safe /
-- idempotent (CREATE OR REPLACE + DROP TRIGGER IF EXISTS). Nippon-scoped, so glass
-- companies are entirely unaffected.

CREATE OR REPLACE FUNCTION public.enforce_nippon_owner_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  IF NEW.company = 'Nippon'
     AND NEW.status = 'Approved'
     AND COALESCE(OLD.status, '') <> 'Approved'
     AND auth.uid() IS NOT NULL THEN
    SELECT role INTO v_role FROM public.user_profiles WHERE id = auth.uid();
    IF COALESCE(v_role, '') NOT IN ('owner', 'hassan', 'super_admin') THEN
      RAISE EXCEPTION 'Only the owner can approve Nippon orders (role=%).', COALESCE(v_role, 'unknown')
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_nippon_owner_approval ON public.quotations;
CREATE TRIGGER trg_nippon_owner_approval
  BEFORE INSERT OR UPDATE ON public.quotations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_nippon_owner_approval();
