-- ═══════════════════════════════════════════════════════════════════
-- 20260518_gap_fixes_constraints.sql
-- Migration for ARCHITECTURE_GAP_ANALYSIS fixes (2026-05-18).
--
-- Covers:
--   GAP-05  Duplicate NCR vendor claim prevention (partial UNIQUE)
--   GAP-08  Stock reservation infrastructure (reserved_qty release helper)
-- ═══════════════════════════════════════════════════════════════════

-- ── GAP-05: one active claim per NCR event ────────────────────────
-- 'Rejected' claims are excluded so a fresh claim can be raised after a
-- vendor refusal without lifting the constraint. App-layer guard in
-- ncrService.createVendorClaim mirrors this rule for offline writes.
DROP INDEX IF EXISTS ncr_claims_one_active_per_ncr;
CREATE UNIQUE INDEX ncr_claims_one_active_per_ncr
  ON public.ncr_claims (ncr_id)
  WHERE status <> 'Rejected';

COMMENT ON INDEX public.ncr_claims_one_active_per_ncr IS
  'GAP-05: Prevent double GL recovery — only one non-Rejected claim per NCR event.';

-- ── GAP-08: Stock reservation helpers ─────────────────────────────
-- store_items.reserved_qty already exists (migration 015). Add a
-- safety check so reserved_qty never exceeds available stock.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'store_items_reserved_lte_qty'
  ) THEN
    ALTER TABLE public.store_items
      ADD CONSTRAINT store_items_reserved_lte_qty
      CHECK (reserved_qty >= 0 AND reserved_qty <= quantity);
  END IF;
END $$;

-- Atomic reservation RPC — increments reserved_qty if enough free stock
-- exists, returns the new value. Used by gtkJobOrderService.
CREATE OR REPLACE FUNCTION public.reserve_stock(
  p_item_id TEXT,
  p_qty NUMERIC
) RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_reserved NUMERIC;
BEGIN
  UPDATE public.store_items
     SET reserved_qty = reserved_qty + p_qty
   WHERE id = p_item_id
     AND quantity - reserved_qty >= p_qty
  RETURNING reserved_qty INTO v_new_reserved;

  IF v_new_reserved IS NULL THEN
    RAISE EXCEPTION 'InsufficientFreeStock: item % cannot reserve %', p_item_id, p_qty;
  END IF;

  RETURN v_new_reserved;
END $$;

CREATE OR REPLACE FUNCTION public.release_stock(
  p_item_id TEXT,
  p_qty NUMERIC
) RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_reserved NUMERIC;
BEGIN
  UPDATE public.store_items
     SET reserved_qty = GREATEST(0, reserved_qty - p_qty)
   WHERE id = p_item_id
  RETURNING reserved_qty INTO v_new_reserved;

  RETURN COALESCE(v_new_reserved, 0);
END $$;

COMMENT ON FUNCTION public.reserve_stock IS
  'GAP-08: Atomic reservation guard. Throws InsufficientFreeStock if free qty too low.';
COMMENT ON FUNCTION public.release_stock IS
  'GAP-08: Release a previous reservation (Job Order completion/cancellation).';
