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
import { SalesService } from '@/modules/sales/services/salesService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { Logger } from '@/modules/shared/services/logger';
import { useAuthStore } from '@/modules/auth/authStore';
import { isFinanceGLEnabled } from '@/modules/shared/services/featureFlagService';
import { loadTaxSettings } from '@/modules/admin/services/taxSettingsService';
import { generateDeliveryInvoice } from '@/modules/sales/services/deliveryInvoiceService';
import { stockMovesForLine } from '@/modules/nippon/utils/productSets';
import { Quotation, Company } from '@/modules/shared/types';

/** Resolve the acting user for the audit stamp (works outside React). */
function actor(): string {
  const s = useAuthStore.getState();
  return s.profile?.fullName || s.profile?.email || s.user?.email || 'store';
}

/** An approved order still awaiting physical issue by the store. */
export function isPendingIssue(q: Quotation): boolean {
  return q.status === 'Approved' && !(q as { issuedAt?: string }).issuedAt;
}

export async function issueNipponOrder(
  orderId: string,
  by?: string,
): Promise<{ error?: string; orderNo?: string; invoiceId?: string; invoiceError?: string }> {
  try {
    const stampBy = by || actor();
    const company = activeCompany();
    const all = await AsyncSalesService.getQuotations();
    const order = all.find(q => q.id === orderId && q.company === company);
    if (!order) return { error: 'Order not found.' };
    if (order.status !== 'Approved') return { error: 'Only an approved Sales Order can be issued.' };
    if ((order as { issuedAt?: string }).issuedAt) return { error: 'This order is already issued.' };

    const products = SalesService.getProducts().filter(p => p.company === company);
    const store = InventoryService.getStore();
    const updated = [...store];
    // What physically leaves the store, per line. Shared with approve (reserve)
    // and void (return) so the three can never disagree — a SET relieves its
    // COMPONENTS, since a set is assembled here and never sat on a shelf.
    (order.items || []).flatMap(item => stockMovesForLine(item, products)).forEach(({ refId, need }) => {
      const idx = updated.findIndex(s => s.id === refId);
      if (idx !== -1) {
        updated[idx] = {
          ...updated[idx],
          quantity: (updated[idx].quantity || 0) - need,                    // goods physically leave
          reservedQty: Math.max(0, (updated[idx].reservedQty || 0) - need), // reservation fulfilled
          lastMovementDate: new Date().toISOString(),
        };
      }
    });
    InventoryService.saveStore(updated);

    const nowIso = new Date().toISOString();
    const issued = {
      ...(order as Quotation),
      status: 'Delivered' as Quotation['status'],
      issuedAt: nowIso,
      issuedBy: stampBy,
      // Customer-portal "Dispatched" milestone — the moment goods leave the store.
      dispatchedAt: (order as Quotation).dispatchedAt || nowIso,
    } as Quotation;
    const res = await AsyncSalesService.saveQuotations([...all.filter(x => x.id !== orderId), issued]);
    if (res?.error) return { error: res.error };

    Logger.action('SALES', 'NIPPON_ORDER_ISSUED', `${orderId} → ${order.orderNo || '-'} issued/delivered by ${stampBy}`,
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
    let invoiceId: string | undefined;
    let invoiceError: string | undefined;
    if (isFinanceGLEnabled(company)) {
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

    return { orderNo: order.orderNo || orderId, invoiceId, invoiceError };
  } catch (err) {
    Logger.error('NipponFulfilment', 'issueNipponOrder failed', err);
    return { error: err instanceof Error ? err.message : 'unknown error' };
  }
}
