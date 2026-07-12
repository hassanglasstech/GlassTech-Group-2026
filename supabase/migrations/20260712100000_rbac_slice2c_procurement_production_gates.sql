-- ============================================================================
-- RBAC WRITE-LAYER, slice 2c: module gates on the procurement + production-floor
-- tables. (2026-07-12). Founder applies in the Supabase SQL editor (MCP is
-- read-only). Commented rollback at the bottom.
-- ============================================================================
-- Completes the deferred set from slice 2. Gates use the REAL allowed_modules
-- vocabulary (inventory / requisitions / vendors / accounts / sales / production),
-- NOT the code's folder names. Owners (company-admin) bypass the module gate;
-- super_admin bypasses everything. Verified zero-lockout for the 5 live users —
-- only naqeeb [sales,requisitions,logistics] and shakeel [sales] are gated, and
-- both hold a module in every gate below that they legitimately write.
--
--   store_items       → inventory | requisitions | sales | production
--       (procurement inventory + sales product-masters + the production
--        cutting-close consume path, which writes store_items as the caller)
--   vendors           → vendors | requisitions | sales
--   purchase_orders   → requisitions | accounts | sales   (gated on from_company;
--        the IntercompanyHub path is super_admin-run and bypasses)
--   production_pieces → production   (only the production module writes it
--        directly; status changes go through SECURITY DEFINER RPCs that bypass RLS)
--   cutting_sessions  → production   (CutterWorkbench + glassco CutterScanPanel;
--        both run under a cutter/supervisor JWT that carries 'production')
--
-- ledger / stock_ledger / quotations remain company-only (5-6 writer modules).
-- Admin/destructive/diagnostic writers (GlasscoDataWiper, AdminSecurity nuke,
-- appService restore, factory E2E verifier) are super_admin/service-role paths
-- and are unaffected (they bypass the module gate).
--
-- Relies on auth_can_write(text, text[]) + auth_user_has_module(text) +
-- auth_user_is_company_admin() from slices 1-2. Idempotent (DROP IF EXISTS +
-- CREATE). auth_can_write already granted to authenticated, anon.
-- ============================================================================

-- store_items → {inventory, requisitions, sales, production} -----------------
DROP POLICY IF EXISTS store_items_strict_insert ON public.store_items;
CREATE POLICY store_items_strict_insert ON public.store_items
  FOR INSERT WITH CHECK (auth_can_write(company, ARRAY['inventory','requisitions','sales','production']));
DROP POLICY IF EXISTS store_items_strict_update ON public.store_items;
CREATE POLICY store_items_strict_update ON public.store_items
  FOR UPDATE USING (auth_can_write(company, ARRAY['inventory','requisitions','sales','production']))
             WITH CHECK (auth_can_write(company, ARRAY['inventory','requisitions','sales','production']));
DROP POLICY IF EXISTS store_items_strict_delete ON public.store_items;
CREATE POLICY store_items_strict_delete ON public.store_items
  FOR DELETE USING (auth_can_write(company, ARRAY['inventory','requisitions','sales','production']));

-- vendors → {vendors, requisitions, sales} -----------------------------------
DROP POLICY IF EXISTS vendors_strict_insert ON public.vendors;
CREATE POLICY vendors_strict_insert ON public.vendors
  FOR INSERT WITH CHECK (auth_can_write(company, ARRAY['vendors','requisitions','sales']));
DROP POLICY IF EXISTS vendors_strict_update ON public.vendors;
CREATE POLICY vendors_strict_update ON public.vendors
  FOR UPDATE USING (auth_can_write(company, ARRAY['vendors','requisitions','sales']))
             WITH CHECK (auth_can_write(company, ARRAY['vendors','requisitions','sales']));
DROP POLICY IF EXISTS vendors_strict_delete ON public.vendors;
CREATE POLICY vendors_strict_delete ON public.vendors
  FOR DELETE USING (auth_can_write(company, ARRAY['vendors','requisitions','sales']));

-- purchase_orders → {requisitions, accounts, sales} (scoped on from_company) --
DROP POLICY IF EXISTS purchase_orders_strict_insert ON public.purchase_orders;
CREATE POLICY purchase_orders_strict_insert ON public.purchase_orders
  FOR INSERT WITH CHECK (auth_can_write(from_company, ARRAY['requisitions','accounts','sales']));
DROP POLICY IF EXISTS purchase_orders_strict_update ON public.purchase_orders;
CREATE POLICY purchase_orders_strict_update ON public.purchase_orders
  FOR UPDATE USING (auth_can_write(from_company, ARRAY['requisitions','accounts','sales']))
             WITH CHECK (auth_can_write(from_company, ARRAY['requisitions','accounts','sales']));
DROP POLICY IF EXISTS purchase_orders_strict_delete ON public.purchase_orders;
CREATE POLICY purchase_orders_strict_delete ON public.purchase_orders
  FOR DELETE USING (auth_can_write(from_company, ARRAY['requisitions','accounts','sales']));

-- production_pieces → {production} -------------------------------------------
DROP POLICY IF EXISTS production_pieces_strict_insert ON public.production_pieces;
CREATE POLICY production_pieces_strict_insert ON public.production_pieces
  FOR INSERT WITH CHECK (auth_can_write(company, ARRAY['production']));
DROP POLICY IF EXISTS production_pieces_strict_update ON public.production_pieces;
CREATE POLICY production_pieces_strict_update ON public.production_pieces
  FOR UPDATE USING (auth_can_write(company, ARRAY['production']))
             WITH CHECK (auth_can_write(company, ARRAY['production']));
DROP POLICY IF EXISTS production_pieces_strict_delete ON public.production_pieces;
CREATE POLICY production_pieces_strict_delete ON public.production_pieces
  FOR DELETE USING (auth_can_write(company, ARRAY['production']));

-- cutting_sessions → {production} --------------------------------------------
-- SPECIAL: this table is on the older current_user_* RLS family (a single ALL
-- policy). Preserve its company/super logic VERBATIM and split into a SELECT
-- (read unchanged) + module-gated writes, so read scope is untouched and only
-- writes gain the 'production' requirement.
DROP POLICY IF EXISTS cutting_sessions_company_scoped ON public.cutting_sessions;

CREATE POLICY cutting_sessions_select ON public.cutting_sessions
  FOR SELECT USING (current_user_is_group_admin() OR (company = ANY (current_user_companies())));

CREATE POLICY cutting_sessions_write_insert ON public.cutting_sessions
  FOR INSERT WITH CHECK (
    current_user_is_group_admin()
    OR (
      company = ANY (current_user_companies())
      AND (auth_user_is_company_admin() OR auth_user_has_module('production'))
    )
  );
CREATE POLICY cutting_sessions_write_update ON public.cutting_sessions
  FOR UPDATE USING (
    current_user_is_group_admin()
    OR (
      company = ANY (current_user_companies())
      AND (auth_user_is_company_admin() OR auth_user_has_module('production'))
    )
  )
  WITH CHECK (
    current_user_is_group_admin()
    OR (
      company = ANY (current_user_companies())
      AND (auth_user_is_company_admin() OR auth_user_has_module('production'))
    )
  );
CREATE POLICY cutting_sessions_write_delete ON public.cutting_sessions
  FOR DELETE USING (
    current_user_is_group_admin()
    OR (
      company = ANY (current_user_companies())
      AND (auth_user_is_company_admin() OR auth_user_has_module('production'))
    )
  );

-- ============================================================================
-- ROLLBACK (revert this migration):
--   * store_items / vendors / purchase_orders / production_pieces: DROP the
--     *_strict_insert/update/delete policies and re-CREATE them with the plain
--     `auth_user_is_super() OR (auth_user_companies() IS NOT NULL AND
--     <company|from_company> = ANY(auth_user_companies()))` form.
--   * cutting_sessions: DROP cutting_sessions_select + the 3 cutting_sessions_write_*
--     policies and re-CREATE the single ALL policy:
--       CREATE POLICY cutting_sessions_company_scoped ON public.cutting_sessions
--         FOR ALL USING (current_user_is_group_admin() OR (company = ANY (current_user_companies())))
--         WITH CHECK (current_user_is_group_admin() OR (company = ANY (current_user_companies())));
-- ============================================================================
