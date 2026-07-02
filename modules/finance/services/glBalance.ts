// ═══════════════════════════════════════════════════════════════════════
//  glBalance.ts — Pure double-entry GL balance assertion (NO dependencies)
// ═══════════════════════════════════════════════════════════════════════
// Extracted from financeService.ts (audit #13) so tests can import the REAL
// assertion instead of re-implementing an inline copy that silently drifts.
// This module has ZERO imports (no supabase/store/toast) — safe to load in
// jsdom/unit tests and anywhere else. financeService re-exports both symbols
// for backward compatibility.

// ── Custom Error: GL Double-Entry Imbalance ────────────────────────────
// Thrown before ANY status flip to 'Posted'. React UI should catch this and
// surface the txId + amounts to the user — never swallow silently.
export class LedgerImbalanceError extends Error {
  constructor(
    public readonly txId:       string,
    public readonly sumDebits:  number,
    public readonly sumCredits: number,
    public readonly delta:      number,
  ) {
    super(
      `GL Imbalance in "${txId}": Σdebit ${sumDebits.toFixed(2)} ≠ Σcredit ${sumCredits.toFixed(2)} (delta ${delta >= 0 ? '+' : ''}${delta.toFixed(2)})`
    );
    this.name = 'LedgerImbalanceError';
    // Maintain proper prototype chain for instanceof across transpile targets
    Object.setPrototypeOf(this, LedgerImbalanceError.prototype);
  }
}

// ── GL Balance Assertion ──────────────────────────────────────────────
// Integer-cent arithmetic eliminates IEEE-754 rounding drift.
// Must be called before EVERY status transition to 'Posted'. Zero-tolerance.
export const assertGLBalance = (
  tx: { id?: string; details?: Array<{ debit?: number; credit?: number }> }
): void => {
  const lines       = tx.details ?? [];
  const centsDebit  = Math.round(lines.reduce((s, d) => s + (d.debit  ?? 0), 0) * 100);
  const centsCredit = Math.round(lines.reduce((s, d) => s + (d.credit ?? 0), 0) * 100);
  if (centsDebit !== centsCredit) {
    throw new LedgerImbalanceError(
      tx.id ?? 'UNKNOWN',
      centsDebit  / 100,
      centsCredit / 100,
      (centsDebit - centsCredit) / 100,
    );
  }
};
