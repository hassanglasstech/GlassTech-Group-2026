// ============================================================================
// glass.ts — shared glass-geometry helpers (single source of truth)
//
// Consolidates the 5 identical `sqftOf` copies that had drifted across
// GlasscoPurchaseOrder, GoodsReceiptMIGO/grnHelpers, OpeningBalance helpers,
// WeightMaster, and Requisitions helpers. All five computed the
// same thing; this is the canonical implementation they now reference.
// ============================================================================

/**
 * Sheet size "WxH" (inches, e.g. "84x144") → square feet, 3 dp.
 * Returns 0 for blank/malformed input (null-safe).
 */
export function sqftOf(size: string): number {
  const [w, h] = (size || '').split('x').map(Number);
  return w && h ? Number(((w * h) / 144).toFixed(3)) : 0;
}
