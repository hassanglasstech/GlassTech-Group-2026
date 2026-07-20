/**
 * nipponFulfilmentService — Nippon order fulfilment (store issue).
 *
 * Shared by the "Store Issue" tab (sales side) and the dedicated Store Incharge
 * screen so the physical stock-out logic lives in ONE place. Issuing an approved
 * Sales Order:
 *   • reduces on-hand (quantity) and releases the reservation made at approve,
 *   • marks the order Delivered + stamps issuedAt (idempotent — issue once).
 * Inventory VALUE / COGS is relieved separately at invoice/delivery (GL side).
 */

import { AsyncSalesService } from '@/modules/sales/services/asyncSalesService';
import { activeCompany } from '@/modules/shared/utils/activeCompany';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { Logger } from '@/modules/shared/services/logger';
import { useAuthStore } from '@/modules/auth/authStore';
import { isFinanceGLEnabled } from '@/modules/shared/services/featureFlagService';
import { loadTaxSettings } from '@/modules/admin/services/taxSettingsService';
import { generateDeliveryInvoice } from '@/modules/sales/services/deliveryInvoiceService';
import { stockMovesForLine } from '@/modules/nippon/utils/productSets';
import { Quotation, QuotationItem, Company } from '@/modules/shared/types';

/** Resolve the acting user for the audit stamp (works outside React). */
function actor(): string {
  const s = useAuthStore.getState();
  return s.profile?.fullName || s.profile?.email || s.user?.email || 'store';
}

/** An approved order still awaiting physical issue by the store. A partially
 *  issued order has no `issuedAt`, so it correctly stays in this queue. */
export function isPendingIssue(q: Quotation): boolean {
  return q.status === 'Approved' && !(q as { issuedAt?: string }).issuedAt;
}

/** What this line still owes the customer: ordered minus already issued. */
export function remainingQty(item: QuotationItem): number {
  return Math.max(0, (Number(item.qty) || 0) - (Number(item.issuedQty) || 0));
}

/**
 * How much of this line goes out on THIS issue.
 *
 * The picked qty is the whole point of the pick sheet, so it wins — capped at
 * what is still owed, because you cannot hand over more than was ordered no
 * matter what someone typed. A line the picker never touched (`pickedQty`
 * undefined) issues its full remainder: that is the untouched-order path, where
 * the store just hits Issue without walking the sheet.
 */
export function issueQtyFor(item: QuotationItem): number {
  const remaining = remainingQty(item);
  if (item.pickedQty === undefined || item.pickedQty === null) return remaining;
  return Math.min(Math.max(0, Number(item.pickedQty) || 0), remaining);
}

export async function issueNipponOrder(
  orderId: string,
  by?: string,
): Promise<{
  error?: string; orderNo?: string; invoiceId?: string; invoiceError?: string;
  /** Units that went out on THIS issue. */
  issuedQty?: number;
  /** Units the order still owes after this issue — 0 means fully delivered. */
  remainingQty?: number;
  fullyIssued?: boolean;
}> {
  try {
    const stampBy = by || actor();
    const company = activeCompany();
    const all = await AsyncSalesService.getQuotations();
    const order = all.find(q => q.id === orderId && q.company === company);
    if (!order) return { error: 'Order not found.' };
    if (order.status !== 'Approved') return { error: 'Only an approved Sales Order can be issued.' };
    if ((order as { issuedAt?: string }).issuedAt) return { error: 'This order is already issued.' };

    // What actually goes out on this issue — the PICKED qty, capped at what the
    // order still owes. Issuing the ordered qty regardless of the pick is how
    // stock silently walks off the books: 8 counted off the shelf, 10 relieved.
    const lines = (order.items || []).filter(it => !it.isSection);
    const going = lines.map(it => ({ item: it, out: issueQtyFor(it) }));
    const totalOut = going.reduce((s, g) => s + g.out, 0);
    if (totalOut <= 0) {
      return { error: 'Nothing to issue — no quantity is picked and nothing is outstanding.' };
    }

    // Both reads are ASYNC on purpose. The sync variants are localStorage-only,
    // so a store user on a fresh device (the normal case — this screen exists for
    // a phone in the warehouse) got an EMPTY store cache: every move found no row,
    // silently changed nothing, and the order was still stamped Delivered. Goods
    // out, stock untouched.
    const [products, store] = await Promise.all([
      AsyncSalesService.getProducts().then(ps => ps.filter(p => p.company === company)),
      InventoryService.getStoreAsync(),
    ]);
    const updated = [...store];
    // Per line, what physically leaves. Shared resolver with approve (reserve)
    // and void (return) so the three can never disagree — a SET relieves its
    // COMPONENTS, since a set is assembled here and never sat on a shelf.
    const moves = going.flatMap(({ item, out }) => stockMovesForLine(item, products, out));
    let applied = 0;
    moves.forEach(({ refId, need }) => {
      const idx = updated.findIndex(s => s.id === refId);
      if (idx !== -1) {
        applied++;
        updated[idx] = {
          ...updated[idx],
          quantity: (updated[idx].quantity || 0) - need,                    // goods physically leave
          reservedQty: Math.max(0, (updated[idx].reservedQty || 0) - need), // reservation fulfilled
          lastMovementDate: new Date().toISOString(),
        };
      }
    });
    // Approve creates a stock row for every line it reserves, so by the time an
    // order is issuable each move MUST land somewhere. Nothing landing means the
    // stock list failed to load, not that the goods are free — refuse rather than
    // mark an order Delivered having moved nothing.
    if (moves.length > 0 && applied === 0) {
      return { error: 'Stock list did not load — nothing was issued. Check your connection and try again.' };
    }
    InventoryService.saveStore(updated);

    const nowIso = new Date().toISOString();
    // Bank what went out, then ask whether the order is now square.
    const outByLine = new Map(going.map(g => [g.item.id, g.out]));
    const nextItems = (order.items || []).map(it => it.isSection ? it : ({
      ...it,
      issuedQty: (Number(it.issuedQty) || 0) + (outByLine.get(it.id) || 0),
      // The staged pick has left the building — clear it so the next round
      // starts from an honest zero rather than re-issuing the same number.
      pickedQty: undefined,
    }));
    const fullyIssued = nextItems.filter(it => !it.isSection).every(it => remainingQty(it) === 0);

    // A SHORT issue leaves the order open: no issuedAt, so it stays in the store
    // queue for the remainder, and — deliberately — no invoice. Billing waits for
    // full delivery, or the customer is charged for goods still on our shelf.
    const issued = {
      ...(order as Quotation),
      items: nextItems,
      status: (fullyIssued ? 'Delivered' : 'Approved') as Quotation['status'],
      ...(fullyIssued ? { issuedAt: nowIso } : {}),
      issuedBy: stampBy,
      // Back to an untouched pick for the outstanding remainder.
      ...(fullyIssued ? {} : { pickStatus: 'Pending' as const }),
      // Customer-portal "Dispatched" milestone — the moment goods leave the store.
      dispatchedAt: (order as Quotation).dispatchedAt || nowIso,
    } as Quotation;
    const res = await AsyncSalesService.saveQuotations([...all.filter(x => x.id !== orderId), issued]);
    if (res?.error) return { error: res.error };

    Logger.action('SALES', fullyIssued ? 'NIPPON_ORDER_ISSUED' : 'NIPPON_ORDER_PART_ISSUED',
      `${orderId} → ${order.orderNo || '-'} ${fullyIssued ? 'issued/delivered' : `part-issued (${totalOut} of ${totalOut + nextItems.filter(i => !i.isSection).reduce((s, i) => s + remainingQty(i), 0)})`} by ${stampBy}`,
      { referenceId: orderId, extra: { company } });

    // ── EPIC 3: auto-invoice + GL at goods-issue (books mode only) ──────
    // IFRS 15 §31: revenue (and its matched COGS) is recognized when CONTROL
    // transfers to the customer — that moment is the physical goods-issue above,
    // not the earlier quotation/approval. So when Finance-GL is ON we generate
    // the delivery invoice here (AR + Hardware Sales + COGS, one atomic post).
    //
    // When Finance-GL is OFF (single-entry go-live), issuing ONLY moves stock —
    // the Sales Order itself is the sales record and no ledger entry is made.
    // Flipping `finance.gl_enabled` ON later turns this one gate into the whole
    // finance flow, with zero code change. Invoice failure (e.g. credit-limit)
    // is surfaced but does NOT roll back the physical issue — the goods are
    // already out; the invoice can be regenerated from the Billing Hub.
    //
    // A PARTIAL issue does not invoice. Revenue follows control, and control of
    // the short quantity has not transferred — it is still on our shelf. The
    // invoice is raised when the last of the order goes out.
    let invoiceId: string | undefined;
    let invoiceError: string | undefined;
    if (fullyIssued && isFinanceGLEnabled(company)) {
      try {
        const { data: tax } = await loadTaxSettings(company);
        const gstPercent = tax?.enabled ? (tax.gst_rate || 0) : 0;
        const inv = await generateDeliveryInvoice(
          issued,
          company as Company,
          gstPercent,
          (issued as { issuedAt?: string }).issuedAt,
        );
        invoiceId = inv.invoiceId;
        Logger.action('SALES', 'NIPPON_INVOICE_AT_ISSUE',
          `${orderId} → invoice ${invoiceId} (PKR ${inv.grandTotal})`,
          { referenceId: invoiceId, extra: { company } });
      } catch (err) {
        invoiceError = err instanceof Error ? err.message : 'invoice generation failed';
        Logger.error('NipponFulfilment', 'auto-invoice at issue failed (goods already issued)', err);
      }
    }

    const stillOwed = nextItems.filter(i => !i.isSection).reduce((s, i) => s + remainingQty(i), 0);
    return { orderNo: order.orderNo || orderId, invoiceId, invoiceError, issuedQty: totalOut, remainingQty: stillOwed, fullyIssued };
  } catch (err) {
    Logger.error('NipponFulfilment', 'issueNipponOrder failed', err);
    return { error: err instanceof Error ? err.message : 'unknown error' };
  }
}
