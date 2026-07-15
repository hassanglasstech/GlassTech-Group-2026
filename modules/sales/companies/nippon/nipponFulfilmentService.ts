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
import { Quotation } from '@/modules/shared/types';

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
): Promise<{ error?: string; orderNo?: string }> {
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
    (order.items || []).forEach(item => {
      if (item.isSection) return;
      const matched = products.find(p =>
        (item.productRef && p.id === item.productRef) ||
        (item.locationCode && (p.id === item.locationCode || p.modelNo === item.locationCode || p.profileCode === item.locationCode)));
      const refId = matched?.id || item.productRef || item.locationCode;
      if (!refId) return;
      const idx = updated.findIndex(s => s.id === refId);
      const need = Number(item.qty) || 0;
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

    const issued = {
      ...(order as Quotation),
      status: 'Delivered' as Quotation['status'],
      issuedAt: new Date().toISOString(),
      issuedBy: stampBy,
    } as Quotation;
    const res = await AsyncSalesService.saveQuotations([...all.filter(x => x.id !== orderId), issued]);
    if (res?.error) return { error: res.error };

    Logger.action('SALES', 'NIPPON_ORDER_ISSUED', `${orderId} → ${order.orderNo || '-'} issued/delivered by ${stampBy}`,
      { referenceId: orderId, extra: { company } });
    return { orderNo: order.orderNo || orderId };
  } catch (err) {
    Logger.error('NipponFulfilment', 'issueNipponOrder failed', err);
    return { error: err instanceof Error ? err.message : 'unknown error' };
  }
}
