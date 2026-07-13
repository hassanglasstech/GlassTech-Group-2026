-- ============================================================================
-- M2: vendor_quality_defects — plant-damage quality tracking (2026-07-13)
-- Founder applies in the Supabase SQL editor (MCP is read-only).
-- ============================================================================
-- Glass broken/bent/bubbled/scratched/chipped at an outsource plant gets NO
-- refund and NO financial claim — the founder only needs to TRACK which vendor
-- damages what kind of glass, and how often. This table is that pure quality
-- ledger. It deliberately has NO amount / gl_entry_id / claim columns — the
-- absence of any financial column IS the guarantee that this never touches the
-- books. A defect can be logged for a returned piece OR a piece that was
-- site-delivered straight from the plant (search by piece / size — QC report,
-- not a blocking gate).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.vendor_quality_defects (
  id           text PRIMARY KEY,
  company      text NOT NULL,
  piece_id     text,
  dispatch_id  text,
  vendor_name  text,                       -- the plant the piece was sent to
  service_type text,                       -- Tempering / Lamination / Double Glazing
  glass_type   text,
  thickness    text,
  defect_type  text NOT NULL,              -- Breakage / Bend / Bubble / Scratch / Chipping
  qty          integer NOT NULL DEFAULT 1,
  notes        text,
  reported_by  text,
  reported_at  timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vqd_company_vendor ON public.vendor_quality_defects (company, vendor_name);
CREATE INDEX IF NOT EXISTS idx_vqd_piece          ON public.vendor_quality_defects (piece_id);

ALTER TABLE public.vendor_quality_defects ENABLE ROW LEVEL SECURITY;

-- Company-scoped, mirroring the app's RBAC helpers (super bypass + allowed set).
DROP POLICY IF EXISTS vqd_company_all ON public.vendor_quality_defects;
CREATE POLICY vqd_company_all ON public.vendor_quality_defects
  FOR ALL
  USING (auth_user_is_super() OR company = ANY (COALESCE(auth_user_companies(), ARRAY[]::text[])))
  WITH CHECK (auth_user_is_super() OR company = ANY (COALESCE(auth_user_companies(), ARRAY[]::text[])));
