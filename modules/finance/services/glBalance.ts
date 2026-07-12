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

// ── Maker-Checker Error: manual JV posted without approval ─────────────
// A manual Journal Voucher (docType 'JV') may NEVER be written straight to
// 'Posted' without an approvedBy — it must flow draftJV() → approveJV().
// system-auto entries (recurring/depreciation/intercompany) are pre-audited
// and bypass the 4-eyes requirement.
export class MakerCheckerError extends Error {
  constructor(public readonly txId: string) {
    super(
      `MakerChecker: Manual JV "${txId}" cannot be saved as Posted without approval. ` +
      `Use FinanceService.draftJV() to create the Draft entry, ` +
      `then FinanceService.approveJV("${txId}") for an authorized user to post it.`
    );
    this.name = 'MakerCheckerError';
    Object.setPrototypeOf(this, MakerCheckerError.prototype);
  }
}

// ── Maker-Checker Gate ─────────────────────────────────────────────────
// Pure predicate for the 4-eyes rule. Only Posted manual JVs are gated; every
// other docType / status (invoices, receipts, drafts, system-auto) passes.
// Called by saveLedger before any Posted write. Extracted so the exact gate
// condition is unit-tested instead of buried inline in the service.
export const assertMakerCheckerApproval = (
  entry: { id?: string; status?: string; docType?: string; approvedBy?: string; createdBy?: string }
): void => {
  if (
    entry.status === 'Posted' &&
    entry.docType === 'JV' &&
    !entry.approvedBy &&
    entry.createdBy !== 'system-auto'
  ) {
    throw new MakerCheckerError(entry.id ?? 'UNKNOWN');
  }
};
