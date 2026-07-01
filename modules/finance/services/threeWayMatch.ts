/**
 * threeWayMatch.ts — PO↔invoice amount-match tolerance (audit P2-5).
 *
 * Extracted from ThreeWayMatching.tsx so the 2% tolerance rule is unit-tested
 * and defined ONCE (it was duplicated inline in computeMatch + handleRegisterInvoice).
 * A clean 3-way match requires the vendor invoice to be within `tolerance` of the
 * PO total; otherwise the PO goes On Hold (Mismatch) and no AP GL is posted.
 */
export const MATCH_TOLERANCE = 0.02; // 2% variance allowed

/** Relative variance |invoice − po| / max(po, 1). */
export const matchVariance = (poAmount: number, invoiceAmount: number): number => {
  const po = Number(poAmount) || 0;
  const inv = Number(invoiceAmount) || 0;
  return Math.abs(inv - po) / Math.max(po, 1);
};

/** True when the invoice matches the PO within tolerance (a clean 3-way match). */
export const withinMatchTolerance = (
  poAmount: number,
  invoiceAmount: number,
  tolerance: number = MATCH_TOLERANCE,
): boolean => matchVariance(poAmount, invoiceAmount) <= tolerance;
