/**
 * invoiceReadiness.ts — POD-gate guardrail for the Dispatch Cockpit invoice
 * action (Phase 2/3).
 *
 * IFRS 15 §38/§106: revenue is recognized when control transfers to the
 * customer (proof-of-delivery). Booking revenue for goods still in transit
 * would overstate revenue and understate a contract liability (deferred
 * revenue). This pure helper encodes the rule the cockpit's Delivered→Invoiced
 * action must obey:
 *
 *   - POD complete → invoice freely.
 *   - No POD but a delivery date IS on file (a delivered trip whose POD record
 *     is missing) → allow ONLY with a supervisor override + reason.
 *   - No POD and no delivery date (goods demonstrably not delivered) → BLOCK.
 *     An override can never book current-period revenue for in-transit goods;
 *     the delivery must be recorded first.
 *
 * No side effects — safe to unit-test and to call from the UI before invoking
 * generateDeliveryInvoice.
 */
export interface InvoiceReadinessInput {
  /** POD completed (gate-out + delivery photo + signature + verified OTP). */
  podCompleted: boolean;
  /** A valid actualDeliveryDate is on file (control-transfer evidence). */
  hasDeliveryDate: boolean;
  /** Supervisor override, if the user chose to force past a missing POD. */
  override?: { reason: string } | null;
}

export interface InvoiceReadiness {
  /** Whether invoicing may proceed. */
  allowed: boolean;
  /** Whether a supervisor override is required to proceed. */
  requiresOverride: boolean;
  /** Human-readable explanation for the toast / confirm dialog. */
  reason: string;
}

export function evaluateInvoiceReadiness(input: InvoiceReadinessInput): InvoiceReadiness {
  if (input.podCompleted) {
    return { allowed: true, requiresOverride: false, reason: 'Delivered with verified POD — safe to invoice.' };
  }

  const hasReason = Boolean(input.override?.reason?.trim());

  // POD missing but delivery IS evidenced by a date on file → backfilling a
  // delivered trip. Permitted with a supervisor override + reason.
  if (input.hasDeliveryDate) {
    return hasReason
      ? {
          allowed: true,
          requiresOverride: true,
          reason: `Invoiced via supervisor override (delivery date on file): ${input.override!.reason.trim()}`,
        }
      : {
          allowed: false,
          requiresOverride: true,
          reason: 'POD missing — supervisor override + reason required (delivery date is on file).',
        };
  }

  // No POD and no delivery date: goods are not delivered. Never book revenue
  // for in-transit goods, even with an override.
  return {
    allowed: false,
    requiresOverride: true,
    reason: 'Not delivered — no POD and no delivery date. Record the delivery first; an override cannot book revenue for in-transit goods.',
  };
}
