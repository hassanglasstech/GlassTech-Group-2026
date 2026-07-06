/**
 * temperingCommitmentService.ts — Step 2 of the Glassco tempering flow.
 *
 * A NON-GL "Expected Tempering Payment" memo created at dispatch-OUT. Under
 * IAS 37 a purchase commitment is DISCLOSED/tracked, NOT recognized — so this
 * service writes ZERO ledger entries (it has no dependency on FinanceService).
 * Its only purpose is to let finance see upcoming cash needs (cash forecast /
 * inbox). The real GL fires only at Step-3 pay-&-collect, which then calls
 * `settle()` here.
 *
 * Storage: localStorage `gtk_erp_tempering_commitments` via the shared
 * safeParse/safeSave helpers (two-tier convention), deliberately OUTSIDE the
 * finance ledger namespace.
 */
import type { Company, TemperingDispatch } from '@/modules/shared/types';
import { safeParse, safeSave } from '@/modules/shared/services/utils';
import { getVendorRatesByMm, computeTemperingCharges } from '@/modules/procurement/services/glasscoGLHelpers';

const KEY = 'gtk_erp_tempering_commitments';

export type TemperingCommitmentStatus = 'Open' | 'Settled' | 'Cancelled';

export interface TemperingCommitment {
  id: string;                    // TCMT-{dispatchId}
  company: Company;
  dispatchId: string;            // join key to the dispatch + Step-3 settlement
  vendorName: string;            // = dispatch.plantName
  orderNos: string[];            // orders whose pieces are in this dispatch
  pieceCount: number;
  totalSqft: number;
  amount: number;                // Σ (piece sqft × per-mm rate) — same formula as inward AP
  createdDate: string;           // YYYY-MM-DD
  dueDate: string;               // YYYY-MM-DD (~ created + 2 days)
  status: TemperingCommitmentStatus;
  missingRateMm?: string[];      // mm sizes with no vendor rate at estimate time
  settledLedgerRef?: string;     // set by Step-3 when the payment posts
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  // UTC math so the result is timezone-independent (PKT is UTC+5 — local
  // midnight would otherwise roll back a day under toISOString()).
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const TemperingCommitmentService = {
  getAll(): TemperingCommitment[] {
    return safeParse(KEY) as TemperingCommitment[];
  },

  getCommitments(company: Company): TemperingCommitment[] {
    return this.getAll().filter(c => c.company === company);
  },

  getOpen(company: Company): TemperingCommitment[] {
    return this.getCommitments(company).filter(c => c.status === 'Open');
  },

  saveAll(list: TemperingCommitment[]): void {
    safeSave(KEY, list);
  },

  /**
   * Create (or refresh) the commitment for a dispatch-out. Idempotent per
   * dispatch (TCMT-{dispatchId}) so re-dispatching the same trip never
   * duplicates. Writes NO ledger entry.
   */
  createFromDispatch(
    dispatch: TemperingDispatch,
    opts: { dueInDays?: number; today?: string } = {},
  ): TemperingCommitment {
    const today = opts.today || todayIso();
    const dueInDays = opts.dueInDays ?? 2;
    const pieceIds = Array.isArray(dispatch.pieceIds) ? dispatch.pieceIds : [];

    // Snapshot rates win over the vendor's current list — identical to inward.
    const effectiveRates = { ...getVendorRatesByMm(dispatch.plantName), ...(dispatch.ratesByMm ?? {}) };
    const charge = computeTemperingCharges(pieceIds, effectiveRates);

    const id = `TCMT-${dispatch.id}`;
    const commitment: TemperingCommitment = {
      id,
      company: dispatch.company,
      dispatchId: dispatch.id,
      vendorName: dispatch.plantName,
      orderNos: Array.from(new Set(charge.lines.map(l => l.orderId).filter(Boolean))),
      pieceCount: charge.lines.length,
      totalSqft: charge.lines.reduce((s, l) => s + l.sqft, 0),
      amount: charge.total,
      createdDate: today,
      dueDate: addDays(today, dueInDays),
      status: 'Open',
      ...(charge.missingRateMm.length ? { missingRateMm: charge.missingRateMm } : {}),
    };

    // Idempotent upsert by id.
    const list = this.getAll().filter(c => c.id !== id);
    this.saveAll([...list, commitment]);
    return commitment;
  },

  /** Step-3 settlement: mark the commitment paid, linking the payment voucher. */
  settle(dispatchId: string, ledgerRef: string): void {
    const list = this.getAll().map(c =>
      c.dispatchId === dispatchId && c.status === 'Open'
        ? { ...c, status: 'Settled' as const, settledLedgerRef: ledgerRef }
        : c,
    );
    this.saveAll(list);
  },

  /** Cancel a commitment when its dispatch is cancelled/unloaded. */
  cancel(dispatchId: string): void {
    const list = this.getAll().map(c =>
      c.dispatchId === dispatchId && c.status === 'Open'
        ? { ...c, status: 'Cancelled' as const }
        : c,
    );
    this.saveAll(list);
  },
};
